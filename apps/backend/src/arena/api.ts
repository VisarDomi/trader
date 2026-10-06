/**
 * Arena HTTP API (127.0.0.1 only; the dashboard calls it server-side, the lab
 * pushes backtests through the SSH tunnel). Mutating endpoints need the
 * ARENA_TOKEN bearer token.
 */
import type { RunMetrics } from '../engine/metrics.ts';
import { ALL_EPICS } from '../engine/instruments.ts';
import type { BacktestResult } from '../lab/backtest-core.ts';
import type { Arena } from './arena.ts';
import type { AgentRow, RunRow } from './db.ts';
import { RUN_KIND } from './db.ts';

type Handler = (req: Request, params: Record<string, string>, url: URL) => Response | Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  auth: boolean;
}

const METHOD_GET = 'GET';
const METHOD_POST = 'POST';

export interface LeaderboardRow {
  runId: string;
  agentId: string;
  name: string;
  slug: string;
  timeframe: string;
  epic: string;
  status: string;
  codeHash: string;
  startedAt: number;
  updatedAt: number;
  equity: number;
  metrics: RunMetrics | null;
  usesForecast: boolean;
  /** For demo rows: the backtest of the same agent/epic (null if none). */
  backtest: { runId: string; metrics: RunMetrics | null; codeHash: string; sameCode: boolean } | null;
  /** For demo rows: whether this run is mirrored onto the broker account. */
  mirrored: boolean;
}

export function startApi(arena: Arena, port: number, token: string): ReturnType<typeof Bun.serve> {
  const routes: Route[] = [];
  const add = (method: string, path: string, handler: Handler, auth = false): void => {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/\*(\w+)/g, (_, k: string) => (keys.push(k), '(.+)')).replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)')) +
        '$',
    );
    routes.push({ method, pattern, keys, handler, auth });
  };
  const db = arena.db;

  add(METHOD_GET, '/api/health', () => json({ ok: true, time: Date.now() }));

  add(METHOD_GET, '/api/status', () => {
    const quotes = Object.fromEntries(
      ALL_EPICS.map(epic => {
        const q = arena.stream?.lastQuote.get(epic);
        return [epic, { bid: q?.bid ?? null, ask: q?.ask ?? null, quoteTime: q?.time ?? null, lastCandle: arena.lastCandle.get(epic) ?? null }];
      }),
    );
    return json({
      startedAt: arena.startedAt,
      now: Date.now(),
      agents: arena.agents.length,
      demoRuns: arena.tracked.size,
      loadErrors: arena.loadErrors,
      stream: { connected: arena.stream?.connected ?? false, connectedSince: arena.stream?.connectedSince ?? 0, reconnects: arena.stream?.reconnects ?? 0 },
      quotes,
      forecaster: {
        lastSuccessAt: arena.forecasts.lastSuccessAt,
        lastError: arena.forecasts.lastError,
        requests: arena.forecasts.requests,
        failures: arena.forecasts.failures,
      },
      broker: arena.broker?.status() ?? null,
      memoryMb: Math.round(process.memoryUsage().rss / 1e6),
    });
  });

  add(METHOD_GET, '/api/events', (_req, _p, url) => json(db.events(Number(url.searchParams.get('limit') ?? 200))));

  add(METHOD_GET, '/api/leaderboard', (_req, _p, url) => {
    const kind = url.searchParams.get('kind') === RUN_KIND.BACKTEST ? RUN_KIND.BACKTEST : RUN_KIND.DEMO;
    return json(leaderboard(arena, kind, url.searchParams.get('retired') === '1'));
  });

  add(METHOD_GET, '/api/agents', () => {
    const demo = db.runs(RUN_KIND.DEMO);
    const bt = db.runs(RUN_KIND.BACKTEST);
    return json(
      db.agents().map(a => ({
        ...agentJson(a),
        demo: demo.filter(r => r.agent_id === a.id).map(runSummary),
        backtest: bt.filter(r => r.agent_id === a.id).map(runSummary),
      })),
    );
  });

  add(METHOD_GET, '/api/agents/*id', (_req, { id }) => {
    const a = db.agent(id!);
    if (!a) return json({ error: 'agent not found' }, 404);
    return json({
      ...agentJson(a),
      versions: db.agentVersions(a.id),
      runs: db.runsForAgent(a.id).map(runSummary),
    });
  });

  add(METHOD_GET, '/api/runs/:id', (_req, { id }, url) => {
    const runId = decodeURIComponent(id!);
    const r = db.run(runId);
    if (!r) return json({ error: 'run not found' }, 404);
    const tracked = arena.tracked.get(runId);
    return json({
      ...runSummary(r),
      params: JSON.parse(r.params),
      extra: r.extra ? JSON.parse(r.extra) : null,
      position: tracked?.run.position ?? (r.snapshot ? (JSON.parse(r.snapshot) as { position: unknown }).position : null),
      state: tracked?.run.state ?? null,
      trades: db.trades(runId, Number(url.searchParams.get('trades') ?? 1000)),
      equity: db.equity(runId),
      logs: db.logs(runId, 200),
      deals: db.dealsForRun(runId),
    });
  });

  add(METHOD_GET, '/api/broker', () => json({ status: arena.broker?.status() ?? null, deals: db.deals(300) }));

  add(
    METHOD_POST,
    '/api/broker/mirror',
    async req => {
      if (!arena.broker) return json({ error: 'broker disabled' }, 400);
      const body = (await req.json()) as { runIds?: string[]; enabled?: boolean };
      if (Array.isArray(body.runIds)) {
        arena.broker.setMirroredRuns(body.runIds, id => arena.tracked.get(id)?.epic ?? null);
      }
      if (typeof body.enabled === 'boolean') arena.broker.setEnabled(body.enabled);
      return json(arena.broker.status());
    },
    true,
  );

  add(
    METHOD_POST,
    '/api/backtests',
    async req => {
      const body = (await req.json()) as { results?: BacktestResult[] };
      const results = body.results ?? [];
      for (const r of results) db.saveBacktest(r);
      return json({ stored: results.length });
    },
    true,
  );

  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      const url = new URL(req.url);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.pattern);
        if (!m) continue;
        if (r.auth && req.headers.get('authorization') !== `Bearer ${token}`) return json({ error: 'unauthorized' }, 401);
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
        try {
          return await r.handler(req, params, url);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
      }
      return json({ error: 'not found' }, 404);
    },
  });
}

function leaderboard(arena: Arena, kind: typeof RUN_KIND.DEMO | typeof RUN_KIND.BACKTEST, includeRetired: boolean): LeaderboardRow[] {
  const db = arena.db;
  const agents = new Map(db.agents().map(a => [a.id, a]));
  const backtests = new Map(db.runs(RUN_KIND.BACKTEST).map(r => [`${r.agent_id}:${r.epic}`, r]));
  const mirrored = new Set(arena.broker?.mirroredRuns ?? []);
  return db.runs(kind, includeRetired).map(r => {
    const a = agents.get(r.agent_id);
    const bt = kind === RUN_KIND.DEMO ? backtests.get(`${r.agent_id}:${r.epic}`) : undefined;
    return {
      runId: r.id,
      agentId: r.agent_id,
      name: a?.name ?? r.agent_id,
      slug: a?.slug ?? r.agent_id,
      timeframe: a?.timeframe ?? '',
      epic: r.epic,
      status: r.retired ? 'retired' : r.status,
      codeHash: r.code_hash,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
      equity: r.equity,
      metrics: r.metrics ? (JSON.parse(r.metrics) as RunMetrics) : null,
      usesForecast: Boolean(a?.uses_forecast),
      backtest: bt
        ? { runId: bt.id, metrics: bt.metrics ? (JSON.parse(bt.metrics) as RunMetrics) : null, codeHash: bt.code_hash, sameCode: bt.code_hash === r.code_hash }
        : null,
      mirrored: mirrored.has(r.id),
    };
  });
}

function agentJson(a: AgentRow) {
  return {
    id: a.id,
    slug: a.slug,
    variant: a.variant,
    name: a.name,
    description: a.description,
    author: a.author,
    timeframe: a.timeframe,
    instruments: JSON.parse(a.instruments) as string[],
    params: JSON.parse(a.params) as Record<string, unknown>,
    usesForecast: Boolean(a.uses_forecast),
    codeHash: a.code_hash,
    firstSeen: a.first_seen,
    updatedAt: a.updated_at,
    active: Boolean(a.active),
  };
}

function runSummary(r: RunRow) {
  return {
    id: r.id,
    kind: r.kind,
    agentId: r.agent_id,
    epic: r.epic,
    codeHash: r.code_hash,
    windowId: r.window_id,
    status: r.retired ? 'retired' : r.status,
    capital: r.capital,
    equity: r.equity,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
    endedAt: r.ended_at,
    metrics: r.metrics ? (JSON.parse(r.metrics) as RunMetrics) : null,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
