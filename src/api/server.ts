import type { Server, ServerWebSocket } from 'bun';
import type { RunConfig } from '../core/agent/types.ts';
import type { BacktestResult } from '../run/RunManager.ts';
import { RunManager } from '../run/RunManager.ts';
import { RunRepository } from '../data/RunRepository.ts';
import { INSTRUMENTS } from '../data/instruments.ts';

// ============================================
// TYPES
// ============================================

interface WSData {
  runId: string;
}

type RouteHandler = (req: Request, params: Record<string, string>) => Promise<Response>;

// ============================================
// ROUTER
// ============================================

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

function route(method: string, path: string, handler: RouteHandler): Route {
  // Convert "/runs/:id/fills" to regex with named groups
  // Use :param for single segment, *param for greedy (captures slashes)
  const paramNames: string[] = [];
  const regexStr = path
    .replace(/\*(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '(.+)';
    })
    .replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
  return {
    method,
    pattern: new RegExp(`^${regexStr}$`),
    paramNames,
    handler,
  };
}

// ============================================
// SERVER
// ============================================

export function createServer(runManager: RunManager, port: number = 3001): Server {
  // Track WebSocket subscribers per run
  const runSubscribers = new Map<string, Set<ServerWebSocket<WSData>>>();

  // In-flight backtests (for streaming progress)
  const pendingBacktests = new Map<string, Promise<BacktestResult>>();

  // --- Route handlers ---

  const routes: Route[] = [
    // Health
    route('GET', '/health', async () => {
      return json({ status: 'ok', timestamp: Date.now() });
    }),

    // Instruments
    route('GET', '/instruments', async () => {
      return json(INSTRUMENTS);
    }),

    // Blueprints
    route('GET', '/blueprints', async () => {
      const blueprints = await runManager.listBlueprints();
      return json(blueprints);
    }),

    // Agents
    route('GET', '/agents', async () => {
      const agents = await runManager.listAgents();
      return json(agents.map(a => ({
        id: a.id,
        config: a.config,
        path: a.path,
      })));
    }),

    route('GET', '/agents/*id', async (_req, params) => {
      const agent = await runManager.getAgent(params.id!);
      if (!agent) return json({ error: 'Agent not found' }, 404);
      return json({
        id: agent.id,
        config: agent.config,
        path: agent.path,
      });
    }),

    // Runs
    route('POST', '/runs', async (req) => {
      const body = await req.json() as RunConfig;

      // Validate required fields
      if (!body.agentId || !body.capital || !body.mode) {
        return json({ error: 'Missing required fields: agentId, capital, mode' }, 400);
      }

      if (body.mode === 'backtest') {
        if (!body.startDate || !body.endDate) {
          return json({ error: 'Backtest mode requires startDate and endDate' }, 400);
        }

        // Start backtest (async — returns run ID immediately, runs in background)
        try {
          // Validate agent exists before starting
          const agent = await runManager.getAgent(body.agentId);
          if (!agent) return json({ error: `Agent not found: ${body.agentId}` }, 404);

          // Start backtest and track promise
          const promise = runManager.startBacktest(body);

          // We don't have the runId until the promise resolves, but startBacktest
          // creates the DB record first. Return immediately by getting the run from DB.
          // For simplicity, await the result.
          const result = await promise;

          // Broadcast completion to any subscribers
          broadcastToRun(runSubscribers, result.runId, {
            type: 'completed',
            runId: result.runId,
            metrics: result.metrics,
          });

          return json({
            runId: result.runId,
            status: 'completed',
            metrics: result.metrics,
          }, 201);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return json({ error: message }, 400);
        }
      }

      // Paper/live modes — run via Capital.com API
      try {
        const agent = await runManager.getAgent(body.agentId);
        if (!agent) return json({ error: `Agent not found: ${body.agentId}` }, 404);

        const runId = await runManager.startLive(body);
        return json({ runId, status: 'running' }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 400);
      }
    }),

    route('GET', '/runs', async (req) => {
      const url = new URL(req.url);
      const filters = {
        mode: url.searchParams.get('mode') ?? undefined,
        status: url.searchParams.get('status') ?? undefined,
        agentId: url.searchParams.get('agentId') ?? undefined,
      };
      const runs = await runManager.listRuns(filters);
      return json(runs);
    }),

    route('GET', '/runs/:id', async (_req, params) => {
      const run = await runManager.getRun(params.id!);
      if (!run) return json({ error: 'Run not found' }, 404);
      return json(run);
    }),

    route('POST', '/runs/:id/stop', async (_req, params) => {
      await runManager.stopRun(params.id!);
      return json({ status: 'stopped', runId: params.id });
    }),

    // Run results
    route('GET', '/runs/:id/metrics', async (_req, params) => {
      const run = await runManager.getRun(params.id!);
      if (!run) return json({ error: 'Run not found' }, 404);
      if (!run.metrics) return json({ error: 'Run has no metrics yet' }, 404);
      return json(run.metrics);
    }),

    route('GET', '/runs/:id/fills', async (_req, params) => {
      const fills = await RunRepository.getFills(params.id!);
      return json(fills);
    }),

    route('GET', '/runs/:id/equity-curve', async (_req, params) => {
      const curve = await RunRepository.getEquityCurve(params.id!);
      return json(curve);
    }),

    // Leaderboard
    route('GET', '/leaderboard', async (req) => {
      const url = new URL(req.url);
      const sortBy = url.searchParams.get('sortBy') ?? 'totalReturn';
      const leaderboard = await RunRepository.getLeaderboard(sortBy);
      return json(leaderboard);
    }),
  ];

  // --- Request router ---

  function matchRoute(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const r of routes) {
      if (r.method !== method) continue;
      const match = pathname.match(r.pattern);
      if (match) {
        const params: Record<string, string> = {};
        r.paramNames.forEach((name, i) => {
          params[name] = match[i + 1]!;
        });
        return { handler: r.handler, params };
      }
    }
    return null;
  }

  // --- Server ---

  const server = Bun.serve<WSData>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // WebSocket upgrade: /ws/runs/:id
      const wsMatch = pathname.match(/^\/ws\/runs\/([^/]+)$/);
      if (wsMatch && server.upgrade(req, { data: { runId: wsMatch[1]! } })) {
        return; // Upgraded
      }

      // CORS headers for all responses
      const matched = matchRoute(req.method, pathname);
      if (!matched) {
        return json({ error: 'Not found' }, 404);
      }

      try {
        const response = await matched.handler(req, matched.params);
        return response;
      } catch (err) {
        console.error(`Error handling ${req.method} ${pathname}:`, err);
        const message = err instanceof Error ? err.message : 'Internal server error';
        return json({ error: message }, 500);
      }
    },

    websocket: {
      open(ws: ServerWebSocket<WSData>) {
        const { runId } = ws.data;
        if (!runSubscribers.has(runId)) {
          runSubscribers.set(runId, new Set());
        }
        runSubscribers.get(runId)!.add(ws);
        ws.send(JSON.stringify({ type: 'connected', runId }));
      },

      close(ws: ServerWebSocket<WSData>) {
        const { runId } = ws.data;
        const subs = runSubscribers.get(runId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) runSubscribers.delete(runId);
        }
      },

      message(ws: ServerWebSocket<WSData>, message) {
        // Client→server messages not needed yet; could add ping/pong
      },
    },
  });

  return server;
}

// ============================================
// HELPERS
// ============================================

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function broadcastToRun(
  subscribers: Map<string, Set<ServerWebSocket<WSData>>>,
  runId: string,
  message: unknown,
): void {
  const subs = subscribers.get(runId);
  if (!subs) return;

  const payload = JSON.stringify(message);
  for (const ws of subs) {
    ws.send(payload);
  }
}
