import { networkStats, percentile } from '../capital/telemetry.ts';
import { computeMetrics } from '../engine/metrics.ts';
import { isShadow, backtestGate, STAGE, tradeT } from './pipeline.ts';
/**
 * Arena HTTP API (127.0.0.1 only; the dashboard calls it server-side, the lab
 * pushes backtests through the SSH tunnel). Mutating endpoints need the
 * ARENA_TOKEN bearer token.
 */
import type { RunMetrics } from '../engine/metrics.ts';
import { ALL_EPICS } from '../engine/instruments.ts';
import type { BacktestResult } from '../lab/backtest-core.ts';
import type { ArenaStatus, LeaderboardRow } from '@trader/shared';
import { getInstrument } from '../engine/instruments.ts';
import { effectiveLeverage } from '../engine/leverage.ts';
import { runKey } from '../engine/run-id.ts';
import type { Candle } from '../engine/series.ts';
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

  add(METHOD_GET, '/api/health', () => json({ ok: true, ready: arena.ready, time: Date.now() }));

  add(METHOD_GET, '/api/status', () => {
    const quotes = Object.fromEntries(
      ALL_EPICS.map(epic => {
        const q = arena.stream?.lastQuote.get(epic);
        return [
          epic,
          {
            bid: q?.bid ?? null,
            ask: q?.ask ?? null,
            quoteTime: q?.time ?? null,
            lastCandle: arena.lastCandle.get(epic) ?? null,
          },
        ];
      }),
    );
    const status: ArenaStatus = {
      startedAt: arena.startedAt,
      now: Date.now(),
      agents: arena.agents.length,
      demoRuns: arena.tracked.size,
      loadErrors: arena.loadErrors,
      stream: {
        connected: arena.stream?.connected ?? false,
        connectedSince: arena.stream?.connectedSince ?? 0,
        reconnects: arena.stream?.reconnects ?? 0,
      },
      quotes,
      forecaster: {
        reachable: arena.forecasts.reachable,
        lastProbeAt: arena.forecasts.lastProbeAt,
        lastSuccessAt: arena.forecasts.lastSuccessAt,
        lastError: arena.forecasts.lastError,
        requests: arena.forecasts.requests,
        failures: arena.forecasts.failures,
      },
      broker: arena.broker?.status() ?? null,
      execution: arena.executionStatus(),
      network: networkStats(),
      memoryMb: Math.round(process.memoryUsage().rss / 1e6),
    };
    return json(status);
  });

  add(METHOD_GET, '/api/events', (_req, _p, url) => json(db.events(Number(url.searchParams.get('limit') ?? 200))));

  add(METHOD_GET, '/api/leaderboard', (_req, _p, url) => {
    const kind = url.searchParams.get('kind') === RUN_KIND.BACKTEST ? RUN_KIND.BACKTEST : RUN_KIND.DEMO;
    const rows = leaderboard(arena, kind, url.searchParams.get('retired') === '1').filter(
      r =>
        !url.searchParams.has('scenario') || url.searchParams.get('scenario') === 'all' || r.scenario === url.searchParams.get('scenario'),
    );
    return json(url.searchParams.get('stage') === STAGE.DEMO ? demoLeaderboard(arena, rows) : rows);
  });

  add(METHOD_GET, '/api/scenarios', () =>
    json(
      [...Map.groupBy(db.runs(RUN_KIND.DEMO), r => (r.extra ? (JSON.parse(r.extra).scenario ?? 'standard') : 'standard'))].map(
        ([name, rs]) => ({ name, count: rs.length }),
      ),
    ),
  );

  add(METHOD_GET, '/api/execution', () =>
    json({
      virtual: arena.executionStatus(),
      network: networkStats(),
      parity: executionParity(arena),
    }),
  );

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
      equityCurve: db.equity(runId),
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
      const body = (await req.json()) as { enabled?: boolean };
      if (typeof body.enabled === 'boolean') arena.broker.setEnabled(body.enabled);
      return json(arena.broker.status());
    },
    true,
  );

  add(
    METHOD_POST,
    '/api/broker/exclude',
    async req => {
      if (!arena.broker) return json({ error: 'broker disabled' }, 400);
      const body = (await req.json()) as { runId?: string; excluded?: boolean };
      if (typeof body.runId !== 'string' || typeof body.excluded !== 'boolean')
        return json({ error: 'runId and excluded are required' }, 400);
      arena.broker.setExcluded(body.runId, body.excluded);
      return json(arena.broker.status());
    },
    true,
  );

  add(
    METHOD_POST,
    '/api/history/daily',
    async req => {
      // Daily bars from the lab's 1-minute history, used at the next start to warm 1d series (arena.ts seedDaily).
      const body = (await req.json()) as { epic?: string; bars?: Candle[] };
      if (typeof body.epic !== 'string' || !ALL_EPICS.includes(body.epic) || !Array.isArray(body.bars))
        return json({ error: 'a known epic and bars are required' }, 400);
      db.insertDailyBars(body.epic, body.bars);
      return json({ stored: body.bars.length });
    },
    true,
  );

  add(
    METHOD_POST,
    '/api/backtests',
    async req => {
      const body = (await req.json()) as { results?: BacktestResult[] };
      // Results from a lab without leverage tiers cannot be matched to a demo run.
      const results = (body.results ?? []).filter(r => typeof r.leverage === 'number');
      for (const r of results) db.saveBacktest(r);
      arena.scheduleAdmissions();
      return json({
        stored: results.length,
        ignored: (body.results?.length ?? 0) - results.length,
      });
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

function compactMetrics(raw: string): RunMetrics {
  const metrics = JSON.parse(raw) as RunMetrics;
  return { ...metrics, monthly: [] };
}

function leaderboard(arena: Arena, kind: typeof RUN_KIND.DEMO | typeof RUN_KIND.BACKTEST, includeRetired: boolean): LeaderboardRow[] {
  const db = arena.db;
  const agents = new Map(db.agents().map(a => [a.id, a]));
  const backtests = new Map(db.runs(RUN_KIND.BACKTEST).map(r => [runKey(r.agent_id, r.epic, r.leverage ?? 0), r]));
  const demotions = db.getSetting<Record<string, { at: number }>>('broker.demotions', {});
  const mirrored = new Set(arena.broker?.mirroredRuns ?? []);
  const forward = new Map(
    db
      .runs(RUN_KIND.DEMO)
      .filter(r => !isShadow(r.id))
      .map(r => [runKey(r.agent_id, r.epic, r.leverage ?? 0), r]),
  );
  return db.runs(kind, includeRetired).map(r => {
    const activeForward = forward.get(runKey(r.agent_id, r.epic, r.leverage ?? 0));
    const extra = r.extra ? JSON.parse(r.extra) : {};
    const a = agents.get(r.agent_id);
    const bt = kind === RUN_KIND.DEMO ? backtests.get(runKey(r.agent_id, r.epic, r.leverage ?? 0)) : undefined;
    return {
      runId: r.id,
      agentId: r.agent_id,
      name: a?.name ?? r.agent_id,
      slug: a?.slug ?? r.agent_id,
      timeframe: a?.timeframe ?? '',
      epic: r.epic,
      leverage: r.leverage,
      effectiveLeverage: r.leverage === null ? null : effectiveLeverage(getInstrument(r.epic), r.leverage),
      status: r.retired ? 'retired' : r.status,
      codeHash: r.code_hash,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
      equity: r.equity,
      metrics: r.metrics ? compactMetrics(r.metrics) : null,
      usesForecast: Boolean(a?.uses_forecast),
      backtest: bt
        ? {
            runId: bt.id,
            metrics: bt.metrics ? compactMetrics(bt.metrics) : null,
            codeHash: bt.code_hash,
            sameCode: bt.code_hash === r.code_hash,
          }
        : null,
      mirrored: mirrored.has(r.id),
      stage:
        kind === RUN_KIND.BACKTEST
          ? activeForward?.code_hash === r.code_hash
            ? mirrored.has(activeForward.id)
              ? STAGE.DEMO
              : STAGE.VIRTUAL
            : STAGE.BACKTEST
          : extra.demotedTo === STAGE.BACKTEST ? STAGE.BACKTEST : mirrored.has(r.id)
            ? STAGE.DEMO
            : STAGE.VIRTUAL,
      scenario: extra.scenario ?? 'standard',
      comparisonOnly: isShadow(r.id),
      ...(demotions[r.id] ? { observation: { since: demotions[r.id]!.at,
        trades: (arena.tracked.get(r.id)?.run.trades ?? []).filter(t => t.entryTime >= demotions[r.id]!.at).length,
        tStat: tradeT((arena.tracked.get(r.id)?.run.trades ?? []).filter(t => t.entryTime >= demotions[r.id]!.at)) } } : {}),
      stageReason:
        kind === RUN_KIND.BACKTEST
          ? backtestGate(r, a?.code_hash ?? r.code_hash, a?.slug ?? r.agent_id).reason
          : r.extra
            ? (JSON.parse(r.extra).demotionReason ?? JSON.parse(r.extra).gate ?? '')
            : '',
    };
  });
}

function demoLeaderboard(arena: Arena, rows: LeaderboardRow[]): LeaderboardRow[] {
  const deals = arena.db.deals(100_000);
  const grouped = Map.groupBy(deals, d => d.run_id);
  const scale = arena.broker?.status().scale ?? 0.2;
  return rows
    .filter(r => grouped.has(r.runId))
    .map(r => {
      const mine = (grouped.get(r.runId) ?? []).sort((a, b) => a.open_time - b.open_time);
      const closed = mine.filter(d => d.status === 'closed');
      const priced = closed.filter(d => d.pnl !== null);
      const capital = 10_000 * scale;
      const trades = priced.map(d => ({
        side: d.side as 'long' | 'short',
        size: d.size,
        entryTime: d.open_time,
        entryPrice: d.open_price ?? 0,
        exitTime: d.close_time!,
        exitPrice: d.close_price ?? 0,
        pnl: d.pnl! + (d.cash_adjustment ?? 0),
        funding: d.cash_adjustment ?? 0,
        exitReason: 'signal' as const,
        barsHeld: 0,
      }));
      const adjustmentsOnOpen = mine.filter(d => d.status === 'open').reduce((n, d) => n + (d.cash_adjustment ?? 0), 0);
      const equity = capital + trades.reduce((n, t) => n + t.pnl, 0) + adjustmentsOnOpen;
      const since = mine[0]?.open_time ?? Date.now();
      // Gross broker results must never be replaced by virtual metrics. Missing closes are explicit.
      let cash = capital,
        peak = capital,
        drawdown = 0;
      const curve = [{ t: since, equity: capital }];
      for (const t of [...trades].sort((a, b) => a.exitTime - b.exitTime)) {
        cash += t.pnl;
        peak = Math.max(peak, cash);
        drawdown = Math.max(drawdown, (peak - cash) / peak);
        const day = Math.floor(t.exitTime / 86_400_000) * 86_400_000;
        if (curve.at(-1)!.t === day) curve.at(-1)!.equity = cash;
        else curve.push({ t: day, equity: cash });
      }
      const metrics =
        closed.length === priced.length && mine.length > 0
          ? computeMetrics({
              trades,
              equity: curve,
              initialCapital: capital,
              finalEquity: equity,
              startTime: since,
              endTime: Date.now(),
              maxDrawdown: drawdown,
              exposure: 0,
            })
          : null;
      return {
        ...r,
        startedAt: since,
        equity,
        metrics,
        brokerEvidence: {
          closed: closed.length,
          priced: priced.length,
          failed: mine.filter(d => d.status === 'failed').length,
          open: mine.filter(d => d.status === 'open').length,
          basis: 'realized net cashflows; open P&L excluded',
        },
      };
    });
}

function executionParity(arena: Arena) {
  const deals = arena.db.deals(10_000);
  const opens = deals.filter(d => d.open_price !== null);
  const slippage = opens.map(d => (((d.side === 'long' ? 1 : -1) * (d.open_price! - d.paper_open_price)) / d.paper_open_price) * 10_000);
  const timed = opens.filter(d => d.confirmed_time && d.decision_time);
  return {
    deals: deals.length,
    openFills: opens.length,
    failed: deals.filter(d => d.status === 'failed').length,
    unpricedCloses: deals.filter(d => d.status === 'closed' && d.pnl === null).length,
    adverseOpenSlippageBpsP50: percentile(slippage, 0.5),
    adverseOpenSlippageBpsP95: percentile(slippage, 0.95),
    timedDeals: timed.length,
    barToDecisionP95Ms: percentile(
      timed.filter(d => d.bar_close_time).map(d => d.decision_time! - d.bar_close_time!),
      0.95,
    ),
    virtualQueueP95Ms: percentile(
      timed.filter(d => d.virtual_fill_time).map(d => d.virtual_fill_time! - d.decision_time!),
      0.95,
    ),
    brokerQueueP95Ms: percentile(
      timed.filter(d => d.virtual_fill_time).map(d => d.sent_time! - d.virtual_fill_time!),
      0.95,
    ),
    postResponseP95Ms: percentile(
      timed.filter(d => d.accepted_time).map(d => d.accepted_time! - d.sent_time!),
      0.95,
    ),
    decisionToConfirmP95Ms: percentile(
      timed.map(d => d.confirmed_time! - d.decision_time!),
      0.95,
    ),
    queueToSendP95Ms: percentile(
      timed.map(d => d.sent_time! - d.decision_time!),
      0.95,
    ),
    sendToConfirmP95Ms: percentile(
      timed.map(d => d.confirmed_time! - d.sent_time!),
      0.95,
    ),
    limitations: [
      'shared-account cross-margin differs from independent virtual accounts',
      'dividends and corporate actions not simulated',
      'historical funding rates unavailable',
      'payload bytes exclude TLS and protocol overhead',
      'stress runs are correlated execution scenarios, not independent strategies',
    ],
  };
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
    leverage: r.leverage,
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
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
