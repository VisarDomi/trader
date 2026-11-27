/**
 * Arena storage (SQLite via bun:sqlite) — the single source of truth for the
 * leaderboard: agents, backtest results pushed from the lab, live demo runs,
 * broker deals on the demo accounts, and a rolling 1-minute candle store.
 */
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LoadedAgent } from '../engine/loader.ts';
import type { EquityPoint, RunMetrics } from '../engine/metrics.ts';
import type { LogLine, RunSnapshot, RunStatus } from '../engine/run.ts';
import type { Candle } from '../engine/series.ts';
import type { Trade } from '../sdk/types.ts';
import type { BacktestResult } from '../lab/backtest-core.ts';
import { backtestRunId } from '../engine/run-id.ts';
import type { ExecutionCostEvidence } from '@trader/shared/types';

export const RUN_KIND = {
  DEMO: 'demo',
  BACKTEST: 'backtest',
} as const;
export type RunKind = (typeof RUN_KIND)[keyof typeof RUN_KIND];

export const DEAL_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  FAILED: 'failed',
} as const;
export type DealStatus = (typeof DEAL_STATUS)[keyof typeof DEAL_STATUS];

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS decision_frames (
  run_id TEXT NOT NULL, decision_time INTEGER NOT NULL, entry_time INTEGER,
  payload BLOB NOT NULL, PRIMARY KEY(run_id, decision_time)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS decision_frames_by_entry ON decision_frames(run_id,entry_time);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  variant TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT,
  timeframe TEXT NOT NULL,
  instruments TEXT NOT NULL,
  params TEXT NOT NULL,
  uses_forecast INTEGER NOT NULL DEFAULT 0,
  code_hash TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS agent_versions (
  agent_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (agent_id, code_hash)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  epic TEXT NOT NULL,
  window_id TEXT,
  status TEXT NOT NULL,
  capital REAL NOT NULL,
  params TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  equity REAL NOT NULL,
  metrics TEXT,
  snapshot TEXT,
  extra TEXT,
  retired INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_by_kind ON runs (kind, retired);
CREATE INDEX IF NOT EXISTS runs_by_agent ON runs (agent_id, epic);

CREATE TABLE IF NOT EXISTS trades (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  side TEXT NOT NULL,
  size REAL NOT NULL,
  entry_time INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  exit_time INTEGER NOT NULL,
  exit_price REAL NOT NULL,
  pnl REAL NOT NULL,
  funding REAL NOT NULL,
  exit_reason TEXT NOT NULL,
  entry_reason TEXT,
  exit_note TEXT,
  bars_held INTEGER NOT NULL,
  bars_held_partial INTEGER NOT NULL DEFAULT 0,
  execution TEXT,
  PRIMARY KEY (run_id, idx)
);

CREATE TABLE IF NOT EXISTS equity (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  t INTEGER NOT NULL,
  equity REAL NOT NULL,
  PRIMARY KEY (run_id, t)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS logs (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  time INTEGER NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_by_run ON logs (run_id, time);

CREATE TABLE IF NOT EXISTS candles (
  epic TEXT NOT NULL,
  t INTEGER NOT NULL,
  o REAL NOT NULL,
  h REAL NOT NULL,
  l REAL NOT NULL,
  c REAL NOT NULL,
  spread REAL NOT NULL,
  volume REAL NOT NULL,
  PRIMARY KEY (epic, t)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS broker_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT,
  account_id TEXT,
  run_id TEXT NOT NULL,
  epic TEXT NOT NULL,
  side TEXT NOT NULL,
  size REAL NOT NULL,
  paper_size REAL NOT NULL,
  deal_id TEXT,
  status TEXT NOT NULL,
  open_time INTEGER NOT NULL,
  open_price REAL,
  paper_open_price REAL NOT NULL,
  close_time INTEGER,
  close_price REAL,
  paper_close_price REAL,
  pnl REAL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS deals_by_status ON broker_deals (status);
CREATE INDEX IF NOT EXISTS deals_by_run ON broker_deals (run_id);

CREATE TABLE IF NOT EXISTS broker_cashflows (
  account_id TEXT NOT NULL, reference TEXT NOT NULL, deal_id TEXT NOT NULL,
  time INTEGER NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL,
  PRIMARY KEY (account_id, reference, time, type)
);
CREATE INDEX IF NOT EXISTS cashflows_by_deal ON broker_cashflows (account_id, deal_id);
CREATE TABLE IF NOT EXISTS events (
  time INTEGER NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_time ON events (time);
CREATE TABLE IF NOT EXISTS stream_candles (
  epic TEXT NOT NULL,t INTEGER NOT NULL,o REAL NOT NULL,h REAL NOT NULL,l REAL NOT NULL,c REAL NOT NULL,
  spread REAL NOT NULL,volume REAL NOT NULL,PRIMARY KEY(epic,t)
) WITHOUT ROWID;

-- Daily bars from the lab (built from its 1-minute history like any 1d series), older than the
-- arena's own 1-minute history: seeded into 1d series at start so 200-day lookbacks are warm.
CREATE TABLE IF NOT EXISTS daily_bars (
  epic TEXT NOT NULL,
  t INTEGER NOT NULL,
  o REAL NOT NULL,
  h REAL NOT NULL,
  l REAL NOT NULL,
  c REAL NOT NULL,
  spread REAL NOT NULL,
  volume REAL NOT NULL,
  PRIMARY KEY (epic, t)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Published economic series (Treasury bill rates, CPI) for the cash and inflation comparisons (rates.ts).
CREATE TABLE IF NOT EXISTS macro_series (
  series TEXT NOT NULL,
  t INTEGER NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (series, t)
) WITHOUT ROWID;

-- Materialized per-run trade & execution-cost aggregates; avoids full scans over 1M+ trades rows on API reads.
CREATE TABLE IF NOT EXISTS run_costs (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  closed_trades INTEGER NOT NULL DEFAULT 0,
  closed_net_pnl REAL NOT NULL DEFAULT 0,
  closed_funding REAL NOT NULL DEFAULT 0,
  before_funding_pnl REAL NOT NULL DEFAULT 0,
  measured_trades INTEGER NOT NULL DEFAULT 0,
  captured_trades INTEGER NOT NULL DEFAULT 0,
  reconstructed_trades INTEGER NOT NULL DEFAULT 0,
  measured_net_pnl REAL NOT NULL DEFAULT 0,
  measured_funding REAL NOT NULL DEFAULT 0,
  midpoint_pnl REAL NOT NULL DEFAULT 0,
  spread_cost REAL NOT NULL DEFAULT 0,
  adjustment_pnl REAL NOT NULL DEFAULT 0,
  timed_trades INTEGER NOT NULL DEFAULT 0,
  timing_cost REAL NOT NULL DEFAULT 0,
  timed_signal_pnl REAL NOT NULL DEFAULT 0,
  timed_net_pnl REAL NOT NULL DEFAULT 0
) WITHOUT ROWID;
`;

export interface RunRow {
  id: string;
  kind: RunKind;
  agent_id: string;
  code_hash: string;
  epic: string;
  /** Account leverage tier; null for runs from before leverage tiers. */
  leverage: number | null;
  window_id: string | null;
  status: RunStatus;
  capital: number;
  params: string;
  started_at: number;
  updated_at: number;
  ended_at: number | null;
  equity: number;
  metrics: string | null;
  snapshot: string | null;
  extra: string | null;
  retired: number;
}

const RUN_LIST_COLUMNS = `id,kind,agent_id,code_hash,epic,window_id,status,capital,params,started_at,updated_at,ended_at,equity,metrics,NULL snapshot,extra,retired,leverage`;
export interface CostAggregate {
  runId:string;closedTrades:number;closedNetPnl:number;closedFunding:number;beforeFundingPnl:number;
  measuredTrades:number;capturedTrades:number;reconstructedTrades:number;measuredNetPnl:number;measuredFunding:number;midpointPnl:number;spreadCost:number;
  adjustmentPnl:number;timedTrades:number;timingCost:number;timedSignalPnl:number;timedNetPnl:number;
}
export interface CostCandidate {
  run_id:string;idx:number;epic:string;side:Trade['side'];size:number;entry_time:number;exit_time:number;
  entry_price:number;exit_price:number;pnl:number;funding:number;execution:string|null;exit_reason:string|null;
}

export interface AgentRow {
  id: string;
  slug: string;
  variant: string | null;
  name: string;
  description: string;
  author: string | null;
  timeframe: string;
  instruments: string;
  params: string;
  uses_forecast: number;
  code_hash: string;
  first_seen: number;
  updated_at: number;
  active: number;
}

export interface DealRow {
  id: number;
  /** Capital.com demo account name when the deal was opened (display only; names can change). */
  account: string;
  /** Capital.com accountId the deal lives on. */
  account_id: string | null;
  run_id: string;
  epic: string;
  side: string;
  size: number;
  paper_size: number;
  deal_id: string | null;
  status: DealStatus;
  open_time: number;
  open_price: number | null;
  paper_open_price: number;
  close_time: number | null;
  close_price: number | null;
  paper_close_price: number | null;
  pnl: number | null;
  note: string | null;
  decision_time?: number | null;
  sent_time?: number | null;
  confirmed_time?: number | null;
  accepted_time?: number | null;
  virtual_fill_time?: number | null;
  bar_close_time?: number | null;
  close_requested_time?: number | null;
  cash_adjustment?: number | null;
  upl?: number | null;
  reconciled_at?: number | null;
}

const MAX_LOGS_PER_RUN = 300;
const MAX_EVENTS = 5000;
/** Hourly equity is thinned to daily points up to this time (ms). */
const EQUITY_THINNED_KEY = 'equity.thinnedThrough';

export class ArenaDB {
  readonly db: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec(SCHEMA);
    this.migrate();
  }

  private migrate(): void {
    const tradeColumns = this.db.query<{name:string}, []>(`PRAGMA table_info(trades)`).all().map(c => c.name);
    if (!tradeColumns.includes('bars_held_partial')) this.db.exec(`ALTER TABLE trades ADD COLUMN bars_held_partial INTEGER NOT NULL DEFAULT 0`);
    if (!tradeColumns.includes('execution')) this.db.exec(`ALTER TABLE trades ADD COLUMN execution TEXT`);
    const dealColumns = this.db
      .query<{ name: string }, []>(`PRAGMA table_info(broker_deals)`)
      .all()
      .map(c => c.name);
    if (!dealColumns.includes('account')) this.db.exec(`ALTER TABLE broker_deals ADD COLUMN account TEXT`);
    if (!dealColumns.includes('account_id')) this.db.exec(`ALTER TABLE broker_deals ADD COLUMN account_id TEXT`);
    for (const name of [
      'decision_time',
      'sent_time',
      'confirmed_time',
      'close_requested_time',
      'accepted_time',
      'virtual_fill_time',
      'bar_close_time',
    ]) {
      if (!dealColumns.includes(name)) this.db.exec(`ALTER TABLE broker_deals ADD COLUMN ${name} INTEGER`);
    }
    for (const name of ['cash_adjustment', 'upl', 'reconciled_at']) {
      if (!dealColumns.includes(name)) this.db.exec(`ALTER TABLE broker_deals ADD COLUMN ${name} REAL`);
    }
    // Covers exact account/deal attribution and deal-id recovery. Without it the
    // unallocated-cashflow check scans every deal for every cashflow row.
    this.db.exec(`CREATE INDEX IF NOT EXISTS deals_by_identity ON broker_deals(deal_id,account_id)`);
    const runColumns = this.db
      .query<{ name: string }, []>(`PRAGMA table_info(runs)`)
      .all()
      .map(c => c.name);
    if (!runColumns.includes('leverage')) this.db.exec(`ALTER TABLE runs ADD COLUMN leverage INTEGER`);
    // Historical runs, including pre-tier backtests, belong in the graveyard rather than being deleted.
    this.db.exec(`UPDATE runs SET retired = 1 WHERE kind = 'backtest' AND leverage IS NULL`);
    this.preserveRetirementReasons();
    this.backfillRunCosts();
  }

  /** Populate materialized per-run trade/cost aggregates once on existing databases. */
  private backfillRunCosts(): void {
    if (this.getSetting<number>('schema.run_costs.v1', 0) === 1) return;
    const hasTrades = this.db.query<{ n: number }, []>(`SELECT 1 n FROM trades LIMIT 1`).get();
    if (hasTrades) {
      this.tx(() => {
        this.db.exec(`DELETE FROM run_costs`);
        this.db.exec(`
          INSERT INTO run_costs (
            run_id, closed_trades, closed_net_pnl, closed_funding, before_funding_pnl,
            measured_trades, captured_trades, reconstructed_trades, measured_net_pnl, measured_funding,
            midpoint_pnl, spread_cost, adjustment_pnl, timed_trades, timing_cost, timed_signal_pnl, timed_net_pnl
          )
          SELECT t.run_id, COUNT(*), SUM(t.pnl), SUM(t.funding), SUM(t.pnl - t.funding),
            COUNT(t.execution),
            SUM(CASE WHEN json_extract(t.execution,'$.method')='fill-quotes' THEN 1 ELSE 0 END),
            SUM(CASE WHEN json_extract(t.execution,'$.method')='archived-quote-match' THEN 1 ELSE 0 END),
            SUM(CASE WHEN t.execution IS NOT NULL THEN t.pnl ELSE 0 END),
            SUM(CASE WHEN t.execution IS NOT NULL THEN t.funding ELSE 0 END),
            COALESCE(SUM(json_extract(t.execution,'$.midpointPnl')),0),
            COALESCE(SUM(json_extract(t.execution,'$.spreadCost')),0),
            COALESCE(SUM(json_extract(t.execution,'$.adjustmentPnl')),0),
            COUNT(json_extract(t.execution,'$.timingCost')),
            COALESCE(SUM(json_extract(t.execution,'$.timingCost')),0),
            COALESCE(SUM(CASE WHEN json_extract(t.execution,'$.timingCost') IS NOT NULL THEN json_extract(t.execution,'$.midpointPnl')+json_extract(t.execution,'$.timingCost') ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN json_extract(t.execution,'$.timingCost') IS NOT NULL THEN t.pnl ELSE 0 END),0)
          FROM trades t GROUP BY t.run_id
        `);
      });
    }
    this.setSetting('schema.run_costs.v1', 1);
  }

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ------------------------------------------------------------------ agents

  upsertAgent(a: LoadedAgent, now: number): void {
    this.db
      .query(
        `INSERT INTO agents (id, slug, variant, name, description, author, timeframe, instruments, params, uses_forecast, code_hash, first_seen, updated_at, active)
         VALUES ($id, $slug, $variant, $name, $description, $author, $timeframe, $instruments, $params, $usesForecast, $hash, $now, $now, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, description = excluded.description, author = excluded.author,
           timeframe = excluded.timeframe, instruments = excluded.instruments, params = excluded.params,
           uses_forecast = excluded.uses_forecast,
           updated_at = CASE WHEN agents.code_hash != excluded.code_hash THEN excluded.updated_at ELSE agents.updated_at END,
           code_hash = excluded.code_hash, active = 1`,
      )
      .run({
        $id: a.id,
        $slug: a.slug,
        $variant: a.variant,
        $name: a.variant ? `${a.def.name} (${a.variant})` : a.def.name,
        $description: a.def.description,
        $author: a.def.author ?? null,
        $timeframe: a.def.timeframe,
        $instruments: JSON.stringify(a.def.instruments),
        $params: JSON.stringify(a.params),
        $usesForecast: a.def.forecast ? 1 : 0,
        $hash: a.codeHash,
        $now: now,
      });
    this.db
      .query(`INSERT OR IGNORE INTO agent_versions (agent_id, code_hash, source, first_seen) VALUES (?, ?, ?, ?)`)
      .run(a.id, a.codeHash, a.source, now);
  }

  deactivateMissingAgents(presentIds: string[]): void {
    const present = new Set(presentIds);
    for (const row of this.db.query<{ id: string }, []>(`SELECT id FROM agents WHERE active = 1`).all()) {
      if (!present.has(row.id)) this.db.query(`UPDATE agents SET active = 0 WHERE id = ?`).run(row.id);
    }
  }

  agents(): AgentRow[] {
    return this.db.query<AgentRow, []>(`SELECT * FROM agents ORDER BY id`).all();
  }

  agent(id: string): AgentRow | null {
    return this.db.query<AgentRow, [string]>(`SELECT * FROM agents WHERE id = ?`).get(id);
  }

  agentVersions(id: string, includeSource = true): { code_hash: string; source: string; first_seen: number }[] {
    return this.db
      .query<
        { code_hash: string; source: string; first_seen: number },
        [string]
      >(`SELECT code_hash, ${includeSource ? 'source' : "'' AS source"}, first_seen FROM agent_versions WHERE agent_id = ? ORDER BY first_seen DESC`)
      .all(id);
  }

  // ------------------------------------------------------------------ runs

  run(id: string): RunRow | null {
    return this.db.query<RunRow, [string]>(`SELECT * FROM runs WHERE id = ?`).get(id);
  }

  runs(kind: RunKind, includeRetired = false): RunRow[] {
    return this.db
      .query<RunRow, [string, number]>(`SELECT * FROM runs WHERE kind = ? AND (retired = 0 OR ?) ORDER BY id`)
      .all(kind, includeRetired ? 1 : 0);
  }

  /** Read models never need to materialize recovery snapshots. Recovery uses run()/runs(). */
  listRuns(kind: RunKind, includeRetired = false, standardOnly = false): RunRow[] {
    return this.db
      .query<RunRow, [string, number]>(
        `SELECT ${RUN_LIST_COLUMNS} FROM runs WHERE kind=? AND (retired=0 OR ?) ${standardOnly ? "AND instr(id,':delay=')=0" : ''} ORDER BY id`,
      )
      .all(kind, includeRetired ? 1 : 0);
  }

  countShadowRuns(kind: RunKind): number {
    return (
      this.db
        .query<{ n: number }, [string]>(`SELECT COUNT(*) n FROM runs WHERE kind=? AND retired=0 AND instr(id,':delay=')>0`)
        .get(kind)?.n ?? 0
    );
  }

  listRunsForAgent(agentId: string, includeShadows = true): RunRow[] {
    return this.db
      .query<RunRow, [string]>(
        `SELECT ${RUN_LIST_COLUMNS} FROM runs WHERE agent_id=? ${includeShadows ? '' : "AND instr(id,':delay=')=0"} ORDER BY kind,epic,started_at DESC`,
      )
      .all(agentId);
  }

  runsForAgent(agentId: string): RunRow[] {
    return this.db.query<RunRow, [string]>(`SELECT * FROM runs WHERE agent_id = ? ORDER BY kind, epic, started_at DESC`).all(agentId);
  }

  createDemoRun(r: {
    id: string;
    agentId: string;
    codeHash: string;
    epic: string;
    leverage: number;
    capital: number;
    params: Record<string, unknown>;
    now: number;
  }): void {
    this.db
      .query(
        `INSERT INTO runs (id, kind, agent_id, code_hash, epic, leverage, status, capital, params, started_at, updated_at, equity)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`,
      )
      .run(r.id, RUN_KIND.DEMO, r.agentId, r.codeHash, r.epic, r.leverage, r.capital, JSON.stringify(r.params), r.now, r.now, r.capital);
  }

  retireRun(id: string, now: number, status: RunStatus, reason?: string): void {
    this.tx(() => {
      this.db.query(`UPDATE runs SET retired = 1, ended_at = ?, status = ? WHERE id = ?`).run(now, status, id);
      if (reason) {
        const row = this.run(id);
        if (row) this.setRunExtra(id, { ...(row.extra ? JSON.parse(row.extra) : {}), retirement: {at: now, reason} });
      }
    });
  }

  /** Rescue exact historical reasons before their rolling event/log records are pruned. */
  private preserveRetirementReasons(): void {
    const rows = this.db.query<RunRow, []>(`SELECT * FROM runs WHERE retired = 1 AND json_extract(extra, '$.retirement') IS NULL`).all();
    if (!rows.length) return;
    const reasons = new Map<string, string>();
    for (const e of this.db.query<{message:string}, []>(`SELECT message FROM events WHERE message LIKE 'retired %' ORDER BY time`).all()) {
      const match = /^retired (\S+)(?: \(roster\))?: (.+)$/.exec(e.message);
      if (match) reasons.set(match[1]!, match[2]!);
    }
    for (const l of this.db.query<{run_id:string;message:string}, []>(`SELECT run_id, message FROM logs WHERE message LIKE 'retired %' ORDER BY time`).all())
      if (!reasons.has(l.run_id)) reasons.set(l.run_id, l.message);
    this.tx(() => {
      for (const row of rows) {
        const extra = row.extra ? JSON.parse(row.extra) : {};
        const reason = extra.demotionReason ?? reasons.get(row.id);
        if (reason) this.setRunExtra(row.id, {...extra, retirement:{at:row.ended_at ?? row.updated_at,reason}});
      }
    });
  }

  saveRunState(r: { id: string; status: RunStatus; equity: number; snapshot: RunSnapshot; metrics: RunMetrics | null; now: number }): void {
    this.db
      .query(`UPDATE runs SET status = ?, equity = ?, snapshot = ?, metrics = COALESCE(?, metrics), updated_at = ? WHERE id = ?`)
      .run(r.status, r.equity, JSON.stringify(r.snapshot), r.metrics ? JSON.stringify(r.metrics) : null, r.now, r.id);
  }

  setRunExtra(id: string, extra: Record<string, unknown>): void {
    this.db.query(`UPDATE runs SET extra = ? WHERE id = ?`).run(JSON.stringify(extra), id);
  }

  private tradeCostDelta(pnl: number, funding: number, execution: ExecutionCostEvidence | null | undefined, sign = 1) {
    const hasExec = execution != null;
    const mid = execution?.midpointPnl ?? 0;
    const spread = execution?.spreadCost ?? 0;
    const adj = execution?.adjustmentPnl ?? 0;
    const hasTiming = hasExec && execution!.timingCost != null;
    const timing = hasTiming ? execution!.timingCost! : 0;
    return {
      closedTrades: sign,
      closedNetPnl: sign * pnl,
      closedFunding: sign * funding,
      beforeFundingPnl: sign * (pnl - funding),
      measuredTrades: hasExec ? sign : 0,
      capturedTrades: execution?.method === 'fill-quotes' ? sign : 0,
      reconstructedTrades: execution?.method === 'archived-quote-match' ? sign : 0,
      measuredNetPnl: hasExec ? sign * pnl : 0,
      measuredFunding: hasExec ? sign * funding : 0,
      midpointPnl: hasExec ? sign * mid : 0,
      spreadCost: hasExec ? sign * spread : 0,
      adjustmentPnl: hasExec ? sign * adj : 0,
      timedTrades: hasTiming ? sign : 0,
      timingCost: hasTiming ? sign * timing : 0,
      timedSignalPnl: hasTiming ? sign * (mid + timing) : 0,
      timedNetPnl: hasTiming ? sign * pnl : 0,
    };
  }

  private addRunCostDelta(runId: string, d: Omit<CostAggregate, 'runId'>): void {
    this.db
      .query(
        `INSERT INTO run_costs (
           run_id, closed_trades, closed_net_pnl, closed_funding, before_funding_pnl,
           measured_trades, captured_trades, reconstructed_trades, measured_net_pnl, measured_funding,
           midpoint_pnl, spread_cost, adjustment_pnl, timed_trades, timing_cost, timed_signal_pnl, timed_net_pnl
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET
           closed_trades = closed_trades + excluded.closed_trades,
           closed_net_pnl = closed_net_pnl + excluded.closed_net_pnl,
           closed_funding = closed_funding + excluded.closed_funding,
           before_funding_pnl = before_funding_pnl + excluded.before_funding_pnl,
           measured_trades = measured_trades + excluded.measured_trades,
           captured_trades = captured_trades + excluded.captured_trades,
           reconstructed_trades = reconstructed_trades + excluded.reconstructed_trades,
           measured_net_pnl = measured_net_pnl + excluded.measured_net_pnl,
           measured_funding = measured_funding + excluded.measured_funding,
           midpoint_pnl = midpoint_pnl + excluded.midpoint_pnl,
           spread_cost = spread_cost + excluded.spread_cost,
           adjustment_pnl = adjustment_pnl + excluded.adjustment_pnl,
           timed_trades = timed_trades + excluded.timed_trades,
           timing_cost = timing_cost + excluded.timing_cost,
           timed_signal_pnl = timed_signal_pnl + excluded.timed_signal_pnl,
           timed_net_pnl = timed_net_pnl + excluded.timed_net_pnl`,
      )
      .run(
        runId,
        d.closedTrades,
        d.closedNetPnl,
        d.closedFunding,
        d.beforeFundingPnl,
        d.measuredTrades,
        d.capturedTrades,
        d.reconstructedTrades,
        d.measuredNetPnl,
        d.measuredFunding,
        d.midpointPnl,
        d.spreadCost,
        d.adjustmentPnl,
        d.timedTrades,
        d.timingCost,
        d.timedSignalPnl,
        d.timedNetPnl,
      );
  }

  private writeTradeRow(runId: string, idx: number, t: Trade): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO trades (run_id, idx, side, size, entry_time, entry_price, exit_time, exit_price, pnl, funding, exit_reason, entry_reason, exit_note, bars_held, bars_held_partial, execution)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        idx,
        t.side,
        t.size,
        t.entryTime,
        t.entryPrice,
        t.exitTime,
        t.exitPrice,
        t.pnl,
        t.funding,
        t.exitReason,
        t.entryReason ?? null,
        t.exitNote ?? null,
        t.barsHeld,
        t.barsHeldPartial ? 1 : 0,
        t.execution ? JSON.stringify(t.execution) : null,
      );
  }

  appendTrade(runId: string, idx: number, t: Trade): void {
    const prev = this.db
      .query<{ pnl: number; funding: number; execution: string | null }, [string, number]>(
        `SELECT pnl, funding, execution FROM trades WHERE run_id = ? AND idx = ?`,
      )
      .get(runId, idx);
    this.writeTradeRow(runId, idx, t);
    const add = this.tradeCostDelta(t.pnl, t.funding, t.execution, 1);
    if (prev) {
      const sub = this.tradeCostDelta(prev.pnl, prev.funding, prev.execution ? (JSON.parse(prev.execution) as ExecutionCostEvidence) : null, -1);
      this.addRunCostDelta(runId, {
        closedTrades: add.closedTrades + sub.closedTrades,
        closedNetPnl: add.closedNetPnl + sub.closedNetPnl,
        closedFunding: add.closedFunding + sub.closedFunding,
        beforeFundingPnl: add.beforeFundingPnl + sub.beforeFundingPnl,
        measuredTrades: add.measuredTrades + sub.measuredTrades,
        capturedTrades: add.capturedTrades + sub.capturedTrades,
        reconstructedTrades: add.reconstructedTrades + sub.reconstructedTrades,
        measuredNetPnl: add.measuredNetPnl + sub.measuredNetPnl,
        measuredFunding: add.measuredFunding + sub.measuredFunding,
        midpointPnl: add.midpointPnl + sub.midpointPnl,
        spreadCost: add.spreadCost + sub.spreadCost,
        adjustmentPnl: add.adjustmentPnl + sub.adjustmentPnl,
        timedTrades: add.timedTrades + sub.timedTrades,
        timingCost: add.timingCost + sub.timingCost,
        timedSignalPnl: add.timedSignalPnl + sub.timedSignalPnl,
        timedNetPnl: add.timedNetPnl + sub.timedNetPnl,
      });
    } else {
      this.addRunCostDelta(runId, add);
    }
  }

  costTotals(kind: RunKind, includeRetired = false, runId?: string, standardOnly = false): CostAggregate[] {
    return this.db
      .query<CostAggregate, (string | number)[]>(
        `SELECT c.run_id runId, c.closed_trades closedTrades, c.closed_net_pnl closedNetPnl,
           c.closed_funding closedFunding, c.before_funding_pnl beforeFundingPnl,
           c.measured_trades measuredTrades, c.captured_trades capturedTrades,
           c.reconstructed_trades reconstructedTrades, c.measured_net_pnl measuredNetPnl,
           c.measured_funding measuredFunding, c.midpoint_pnl midpointPnl,
           c.spread_cost spreadCost, c.adjustment_pnl adjustmentPnl,
           c.timed_trades timedTrades, c.timing_cost timingCost,
           c.timed_signal_pnl timedSignalPnl, c.timed_net_pnl timedNetPnl
         FROM run_costs c JOIN runs r ON r.id = c.run_id
         WHERE r.kind = ? AND (r.retired = 0 OR ?) ${runId ? 'AND c.run_id = ?' : ''}
           ${standardOnly ? "AND instr(r.id,':delay=')=0" : ''} AND c.closed_trades > 0`,
      )
      .all(kind, includeRetired ? 1 : 0, ...(runId ? [runId] : []));
  }

  costCandidates(from: number, limit: number): CostCandidate[] {
    return this.db.query<CostCandidate, [number, number]>(`SELECT t.*,r.epic FROM trades t JOIN runs r ON r.id=t.run_id
      WHERE r.kind='demo' AND r.retired=0 AND instr(r.id,':delay=')=0 AND t.execution IS NULL AND t.entry_time>=?
      ORDER BY t.exit_time DESC LIMIT ?`).all(from, limit);
  }

  attachExecution(runId: string, idx: number, evidence: ExecutionCostEvidence): boolean {
    const existing = this.db
      .query<{ pnl: number; funding: number }, [string, number]>(
        `SELECT pnl, funding FROM trades WHERE run_id = ? AND idx = ? AND execution IS NULL`,
      )
      .get(runId, idx);
    if (!existing) return false;
    const changed =
      this.db
        .query(`UPDATE trades SET execution=? WHERE run_id=? AND idx=? AND execution IS NULL`)
        .run(JSON.stringify(evidence), runId, idx).changes > 0;
    if (changed) {
      const d = this.tradeCostDelta(existing.pnl, existing.funding, evidence, 1);
      this.addRunCostDelta(runId, {
        ...d,
        closedTrades: 0,
        closedNetPnl: 0,
        closedFunding: 0,
        beforeFundingPnl: 0,
      });
    }
    return changed;
  }

  tradeRow(runId: string, idx: number): CostCandidate | null {
    return this.db.query<CostCandidate,[string,number]>(`SELECT t.*,r.epic FROM trades t JOIN runs r ON r.id=t.run_id WHERE t.run_id=? AND t.idx=?`).get(runId,idx);
  }

  /** Two common completed-hour observations, with exact timestamp joins, not interpolated curves. */
  matchedEquity(runId: string, benchmarkId: string, since: number) {
    const first = this.db.query<{t:number;strategy:number;benchmark:number},[string,string,number]>(`
      SELECT s.t,s.equity strategy,b.equity benchmark FROM equity s JOIN equity b ON b.run_id=? AND b.t=s.t
      WHERE s.run_id=? AND s.t>=? ORDER BY s.t LIMIT 1`).get(benchmarkId,runId,since);
    const last = this.db.query<{t:number;strategy:number;benchmark:number},[string,string]>(`
      SELECT s.t,s.equity strategy,b.equity benchmark FROM equity s JOIN equity b ON b.run_id=? AND b.t=s.t
      WHERE s.run_id=? ORDER BY s.t DESC LIMIT 1`).get(benchmarkId,runId);
    return { first, last };
  }

  /** Closed trades of a run that were entered in [from, before). */
  tradesEntered(runId: string, from: number, before: number): number {
    return this.db.query<{ n: number }, [string, number, number]>(`SELECT COUNT(*) n FROM trades WHERE run_id = ? AND entry_time >= ? AND entry_time < ?`).get(runId, from, before)?.n ?? 0;
  }

  trades(runId: string, limit = 5000): Trade[] {
    return this.db
      .query<Record<string, unknown>, [string, number]>(`SELECT * FROM trades WHERE run_id = ? ORDER BY idx DESC LIMIT ?`)
      .all(runId, limit)
      .reverse()
      .map(rowToTrade);
  }

  viewTrades(runId:string,limit=1000) {
    return this.db.query<Record<string,unknown>,[string,number]>(`SELECT * FROM trades WHERE run_id=? ORDER BY idx DESC LIMIT ?`)
      .all(runId,limit).reverse().map(row=>({...rowToTrade(row),index:Number(row.idx)}));
  }

  saveDecision(runId:string,at:number,payload:string):void {
    if(Buffer.byteLength(payload)>24*1024)throw Error('Decision context exceeds its storage bound');
    this.db.query('INSERT OR IGNORE INTO decision_frames(run_id,decision_time,payload) VALUES (?,?,?)').run(runId,at,Bun.gzipSync(payload,{level:1}));
  }

  linkDecision(runId:string,decisionTime:number,entryTime:number):void {
    this.db.query('UPDATE decision_frames SET entry_time=? WHERE run_id=? AND decision_time=? AND entry_time IS NULL').run(entryTime,runId,decisionTime);
  }

  upsertEquity(runId: string, t: number, equity: number): void {
    this.db.query(`INSERT OR REPLACE INTO equity (run_id, t, equity) VALUES (?, ?, ?)`).run(runId, t, equity);
  }

  equity(runId: string): EquityPoint[] {
    return this.db.query<EquityPoint, [string]>(`SELECT t, equity FROM equity WHERE run_id = ? ORDER BY t`).all(runId);
  }

  /** Equity points in (after, through] in chronological order, for single-scan daily clock walks. */
  equityRange(runId: string, after: number, through: number): EquityPoint[] {
    return this.db
      .query<EquityPoint, [string, number, number]>(`SELECT t, equity FROM equity WHERE run_id = ? AND t > ? AND t <= ? ORDER BY t`)
      .all(runId, after, through);
  }

  appendLog(runId: string, line: LogLine): void {
    this.db.query(`INSERT INTO logs (run_id, time, message) VALUES (?, ?, ?)`).run(runId, line.time, line.message.slice(0, 2000));
  }

  logs(runId: string, limit = 200): LogLine[] {
    return this.db
      .query<LogLine, [string, number]>(`SELECT time, message FROM logs WHERE run_id = ? ORDER BY time DESC LIMIT ?`)
      .all(runId, limit)
      .reverse();
  }

  pruneLogs(): void {
    this.db.exec(`
      DELETE FROM logs WHERE rowid IN (
        SELECT rowid FROM (
          SELECT rowid, ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY time DESC) AS rn FROM logs
        ) WHERE rn > ${MAX_LOGS_PER_RUN}
      )`);
    this.db.exec(`DELETE FROM events WHERE rowid NOT IN (SELECT rowid FROM events ORDER BY time DESC LIMIT ${MAX_EVENTS})`);
  }

  /**
   * Keep hourly equity for 30 days, then one point per day. Each pass thins only the hours that aged past 30 days
   * since the last one, and only in runs alive then, through the (run_id, t) key: the table is the database's
   * largest, and a pass over every run reads its cold pages from disk while the arena's only thread waits.
   */
  thinEquity(now: number): void {
    const cutoff = now - 30 * 86_400_000;
    // Without a mark the pass starts a week back: older hours were thinned by the full pass that preceded the mark.
    const from = this.getSetting<number>(EQUITY_THINNED_KEY, cutoff - 7 * 86_400_000);
    if (cutoff <= from) return;
    this.db
      .query(
        `DELETE FROM equity WHERE t >= ? AND t < ? AND (t % 86400000) != 0
           AND run_id IN (SELECT id FROM runs WHERE kind = 'demo' AND started_at < ? AND (ended_at IS NULL OR ended_at >= ?))`,
      )
      .run(from, cutoff, cutoff, from);
    this.setSetting(EQUITY_THINNED_KEY, cutoff);
  }

  /** Keep the latest backtest at its stable id; archive superseded source/engine versions with their full history. */
  saveBacktest(r: BacktestResult): void {
    const id = backtestRunId(r.windowId, r.agentId, r.epic, r.leverage);
    this.tx(() => {
      const previous = this.run(id);
      const extra = previous?.extra ? JSON.parse(previous.extra) : {};
      if (previous && (previous.code_hash !== r.codeHash || extra.engineVersion !== r.engineVersion)) {
        const archivedId = `${id}:archived:${crypto.randomUUID()}`;
        const reason = previous.code_hash !== r.codeHash ? 'Superseded agent source version' : 'Superseded simulation engine version';
        // Defer constraints until parent and all three child keys have moved together.
        this.db.exec('PRAGMA defer_foreign_keys = ON');
        this.db.query(`UPDATE runs SET id = ?, retired = 1, extra = ? WHERE id = ?`)
          .run(archivedId,JSON.stringify({...extra,retirement:{at:Date.now(),reason}}),id);
        for (const table of ['trades','equity','logs','run_costs']) this.db.query(`UPDATE ${table} SET run_id = ? WHERE run_id = ?`).run(archivedId,id);
      }
      this.db.query(`DELETE FROM runs WHERE id = ?`).run(id);
      this.db
        .query(
          `INSERT INTO runs (id, kind, agent_id, code_hash, epic, leverage, window_id, status, capital, params, started_at, updated_at, ended_at, equity, metrics, extra)
           VALUES (?, 'backtest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          r.agentId,
          r.codeHash,
          r.epic,
          r.leverage,
          r.windowId,
          r.status,
          r.capital,
          JSON.stringify(r.params),
          r.windowStart,
          r.ranAt,
          r.windowEnd,
          r.metrics.finalEquity,
          JSON.stringify(r.metrics),
          JSON.stringify({
            engineVersion: r.engineVersion,
            agentUsPerBar: r.agentUsPerBar,
            bars: r.bars,
            candles: r.candles,
            errors: r.errors,
            durationMs: r.durationMs,
            data:r.data,
            ticks:r.ticks,
            agentUsPerTick:r.agentUsPerTick,
          }),
        );
      if (r.trades.length > 0) {
        const tot: Omit<CostAggregate, 'runId'> = {
          closedTrades: 0, closedNetPnl: 0, closedFunding: 0, beforeFundingPnl: 0,
          measuredTrades: 0, capturedTrades: 0, reconstructedTrades: 0, measuredNetPnl: 0, measuredFunding: 0,
          midpointPnl: 0, spreadCost: 0, adjustmentPnl: 0, timedTrades: 0, timingCost: 0, timedSignalPnl: 0, timedNetPnl: 0,
        };
        r.trades.forEach((t, i) => {
          this.writeTradeRow(id, i, t);
          const d = this.tradeCostDelta(t.pnl, t.funding, t.execution, 1);
          tot.closedTrades += d.closedTrades;
          tot.closedNetPnl += d.closedNetPnl;
          tot.closedFunding += d.closedFunding;
          tot.beforeFundingPnl += d.beforeFundingPnl;
          tot.measuredTrades += d.measuredTrades;
          tot.capturedTrades += d.capturedTrades;
          tot.reconstructedTrades += d.reconstructedTrades;
          tot.measuredNetPnl += d.measuredNetPnl;
          tot.measuredFunding += d.measuredFunding;
          tot.midpointPnl += d.midpointPnl;
          tot.spreadCost += d.spreadCost;
          tot.adjustmentPnl += d.adjustmentPnl;
          tot.timedTrades += d.timedTrades;
          tot.timingCost += d.timingCost;
          tot.timedSignalPnl += d.timedSignalPnl;
          tot.timedNetPnl += d.timedNetPnl;
        });
        this.addRunCostDelta(id, tot);
      }
      for (const p of r.equity) this.upsertEquity(id, p.t, p.equity);
      for (const l of r.logs) this.appendLog(id, l);
    });
  }

  // ------------------------------------------------------------------ candles

  insertCandles(epic: string, candles: Candle[]): void {
    const stmt = this.db.query(`INSERT OR REPLACE INTO candles (epic, t, o, h, l, c, spread, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    this.tx(() => {
      for (const c of candles) stmt.run(epic, c.time, c.open, c.high, c.low, c.close, c.spread, c.volume);
    });
  }

  candlesSince(epic: string, from: number): Candle[] {
    const tickStart=this.getSetting<number>('feed.ticksSince',Number.MAX_SAFE_INTEGER);
    return this.db
      .query<{ t: number; o: number; h: number; l: number; c: number; spread: number; volume: number }, [string, number, number, string, number]>(
        `SELECT t,o,h,l,c,spread,volume FROM candles WHERE epic=? AND t>=? AND t<?
         UNION ALL SELECT t,o,h,l,c,spread,volume FROM stream_candles WHERE epic=? AND t>=? ORDER BY t`,
      )
      .all(epic, from,tickStart,epic,from)
      .map(r => ({ time: r.t, open: r.o, high: r.h, low: r.l, close: r.c, spread: r.spread, volume: r.volume }));
  }

  insertStreamCandles(epic:string,candles:readonly Candle[]):void {
    const insert=this.db.query('INSERT OR REPLACE INTO stream_candles VALUES(?,?,?,?,?,?,?,?)');
    this.tx(()=>{for(const c of candles)insert.run(epic,c.time,c.open,c.high,c.low,c.close,c.spread,c.volume);});
  }

  lastCandleTime(epic: string): number | null {
    const row = this.db.query<{ t: number | null }, [string]>(`SELECT MAX(t) AS t FROM candles WHERE epic = ?`).get(epic);
    return row?.t ?? null;
  }

  insertDailyBars(epic: string, bars: readonly Candle[]): void {
    const stmt = this.db.query(`INSERT OR REPLACE INTO daily_bars (epic, t, o, h, l, c, spread, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    this.tx(() => {
      for (const b of bars) stmt.run(epic, b.time, b.open, b.high, b.low, b.close, b.spread, b.volume);
    });
  }

  dailyBarsBefore(epic: string, before: number): Candle[] {
    return this.db
      .query<{ t: number; o: number; h: number; l: number; c: number; spread: number; volume: number }, [string, number]>(
        `SELECT t, o, h, l, c, spread, volume FROM daily_bars WHERE epic = ? AND t < ? ORDER BY t`,
      )
      .all(epic, before)
      .map(r => ({ time: r.t, open: r.o, high: r.h, low: r.l, close: r.c, spread: r.spread, volume: r.volume }));
  }

  /**
   * Both tables are keyed (epic, t): a bare `t < ?` scans every row, so each instrument (found by a skip-scan of
   * the key) gets its own range delete that reads only the rows it removes.
   */
  pruneCandles(before: number): void {
    for (const table of ['candles', 'stream_candles']) {
      const epics = this.db
        .query<{ epic: string }, []>(
          `WITH RECURSIVE e(epic) AS (SELECT MIN(epic) FROM ${table} UNION ALL SELECT (SELECT MIN(epic) FROM ${table} WHERE epic > e.epic) FROM e WHERE e.epic IS NOT NULL)
           SELECT epic FROM e WHERE epic IS NOT NULL`,
        )
        .all();
      const remove = this.db.query(`DELETE FROM ${table} WHERE epic = ? AND t < ?`);
      for (const { epic } of epics) remove.run(epic, before);
    }
  }

  // ------------------------------------------------------------------ broker

  insertDeal(d: Omit<DealRow, 'id'>): number {
    const res = this.db
      .query(
        `INSERT INTO broker_deals (account, account_id, run_id, epic, side, size, paper_size, deal_id, status, open_time, open_price, paper_open_price, close_time, close_price, paper_close_price, pnl, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.account,
        d.account_id,
        d.run_id,
        d.epic,
        d.side,
        d.size,
        d.paper_size,
        d.deal_id,
        d.status,
        d.open_time,
        d.open_price,
        d.paper_open_price,
        d.close_time,
        d.close_price,
        d.paper_close_price,
        d.pnl,
        d.note,
      );
    return Number(res.lastInsertRowid);
  }

  /** Deals recorded before account ids were stored: fill the id in from the account's current name. */
  fillDealAccountIds(idByName: ReadonlyMap<string, string>): void {
    const q = this.db.query(`UPDATE broker_deals SET account_id = ? WHERE account_id IS NULL AND account = ? AND status = 'open'`);
    for (const [name, id] of idByName) q.run(id, name);
  }

  dealByDealId(dealId: string): DealRow | null {
    return this.db.query<DealRow, [string]>(`SELECT * FROM broker_deals WHERE deal_id = ? ORDER BY id DESC LIMIT 1`).get(dealId) ?? null;
  }

  updateDeal(id: number, fields: Partial<Omit<DealRow, 'id'>>): void {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const sets = keys.map(k => `${k} = $${k}`).join(', ');
    const params: Record<string, string | number | null> = { $id: id };
    for (const k of keys) params[`$${k}`] = (fields as Record<string, string | number | null>)[k] ?? null;
    this.db.query(`UPDATE broker_deals SET ${sets} WHERE id = $id`).run(params);
  }

  openDeals(): DealRow[] {
    return this.db.query<DealRow, []>(`SELECT * FROM broker_deals WHERE status = 'open' ORDER BY id`).all();
  }

  deals(limit = 500): DealRow[] {
    return this.db.query<DealRow, [number]>(`SELECT * FROM broker_deals ORDER BY id DESC LIMIT ?`).all(limit);
  }

  dealsForRun(runId: string): DealRow[] {
    return this.db.query<DealRow, [string]>(`SELECT * FROM broker_deals WHERE run_id = ? ORDER BY id`).all(runId);
  }

  recordCashflows(
    accountId: string,
    transactions: {
      reference: string;
      dealId?: string;
      dateUtc: string;
      transactionType: string;
      size: string;
      currency: string;
      status: string;
    }[],
  ): number {
    let matched = 0;
    this.tx(() => {
      for (const t of transactions) {
        if (t.currency !== 'USD' || t.status !== 'PROCESSED') continue;
        const deal = t.dealId ? this.dealByDealId(t.dealId) : null;
        const amount = Number(t.size);
        const time = Date.parse(t.dateUtc + (/Z$/.test(t.dateUtc) ? '' : 'Z'));
        if (!Number.isFinite(amount) || !Number.isFinite(time)) continue;
        this.db
          .query(`INSERT OR REPLACE INTO broker_cashflows (account_id, reference, deal_id, time, type, amount) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(accountId, t.reference, t.dealId ?? '', time, t.transactionType, amount);
        if (!deal || deal.account_id !== accountId) continue;
        matched++;
        const sums = this.db
          .query<{ gross: number | null; adjustments: number }, [string, string]>(
            `SELECT
          SUM(CASE WHEN type = 'TRADE' THEN amount END) AS gross,
          SUM(CASE WHEN type != 'TRADE' THEN amount ELSE 0 END) AS adjustments
          FROM broker_cashflows WHERE account_id = ? AND deal_id = ?`,
          )
          .get(accountId, deal.deal_id!)!;
        this.updateDeal(deal.id, { ...(sums.gross === null ? {} : { pnl: sums.gross }), cash_adjustment: sums.adjustments });
      }
    });
    return matched;
  }

  cashflowSummary() {
    return {
      totals: this.db
        .query<{ type: string; n: number; amount: number }, []>(
          `SELECT type, COUNT(*) n, ROUND(SUM(amount), 2) amount FROM broker_cashflows
        WHERE type NOT IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'RESERVE', 'UNRESERVE') GROUP BY type`,
        )
        .all(),
      unallocated: this.db
        .query<{ type: string; n: number; amount: number }, []>(
          `SELECT c.type, COUNT(*) n, ROUND(SUM(c.amount), 2) amount FROM broker_cashflows c
        WHERE c.type NOT IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'RESERVE', 'UNRESERVE') AND NOT EXISTS
        (SELECT 1 FROM broker_deals d WHERE d.deal_id = c.deal_id AND d.account_id = c.account_id) GROUP BY c.type`,
        )
        .all(),
    };
  }

  // ------------------------------------------------------------------ events & settings

  event(level: string, source: string, message: string): void {
    this.db
      .query(`INSERT INTO events (time, level, source, message) VALUES (?, ?, ?, ?)`)
      .run(Date.now(), level, source, message.slice(0, 2000));
  }

  events(limit = 200): { time: number; level: string; source: string; message: string }[] {
    return this.db
      .query<{ time: number; level: string; source: string; message: string }, [number]>(`SELECT * FROM events ORDER BY time DESC LIMIT ?`)
      .all(limit);
  }

  getSetting<T>(key: string, fallback: T): T {
    const row = this.db.query<{ value: string }, [string]>(`SELECT value FROM kv WHERE key = ?`).get(key);
    return row ? (JSON.parse(row.value) as T) : fallback;
  }

  setSetting(key: string, value: unknown): void {
    this.db.query(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`).run(key, JSON.stringify(value));
  }

  deleteSetting(key: string): void {
    this.db.query(`DELETE FROM kv WHERE key = ?`).run(key);
  }

  /** The run's stored equity at `t`: its latest observation at or before it. */
  equityAt(runId: string, t: number): number | null {
    return this.db.query<{ equity: number }, [string, number]>(`SELECT equity FROM equity WHERE run_id=? AND t<=? ORDER BY t DESC LIMIT 1`).get(runId, t)?.equity ?? null;
  }
  /** The run's latest stored equity observation. */
  lastEquity(runId: string): { t: number; equity: number } | null {
    return this.db.query<{ t: number; equity: number }, [string]>(`SELECT t,equity FROM equity WHERE run_id=? ORDER BY t DESC LIMIT 1`).get(runId) ?? null;
  }

  /**
   * The instrument's price at `t`: the close of the last minute candle finished by then (within four days), else the
   * close of the last daily bar finished by then (within a week), else the open of the first daily bar of that day or
   * after (a window that starts on a holiday). Null when the stored history does not reach.
   */
  priceAt(epic: string, t: number): { t: number; price: number } | null {
    const minute = this.db.query<{ t: number; c: number }, [string, number]>(`SELECT t,c FROM candles WHERE epic=? AND t<=? ORDER BY t DESC LIMIT 1`).get(epic, t - 60_000);
    if (minute && t - minute.t <= 4 * 86_400_000 && minute.c > 0) return { t: minute.t + 60_000, price: minute.c };
    const day = this.db.query<{ t: number; c: number }, [string, number]>(`SELECT t,c FROM daily_bars WHERE epic=? AND t<=? ORDER BY t DESC LIMIT 1`).get(epic, t - 86_400_000);
    if (day && t - day.t <= 8 * 86_400_000 && day.c > 0) return { t: day.t + 86_400_000, price: day.c };
    const next = this.db.query<{ t: number; o: number }, [string, number]>(`SELECT t,o FROM daily_bars WHERE epic=? AND t>=? ORDER BY t LIMIT 1`).get(epic, Math.floor(t / 86_400_000) * 86_400_000);
    if (next && next.t - t <= 7 * 86_400_000 && next.o > 0) return { t: next.t, price: next.o };
    return null;
  }

  /** Stored metrics not yet measured above T-bills, after `afterId` (batched re-scoring). */
  metricsWithoutRiskFree(afterId: string, limit: number): { id: string; metrics: string }[] {
    return this.db.query<{ id: string; metrics: string }, [string, number]>(
      `SELECT id,metrics FROM runs WHERE id>? AND metrics IS NOT NULL AND json_extract(metrics,'$.riskFree') IS NULL ORDER BY id LIMIT ?`).all(afterId, limit);
  }

  updateMetrics(runId: string, metrics: RunMetrics): void {
    this.db.query(`UPDATE runs SET metrics=? WHERE id=?`).run(JSON.stringify(metrics), runId);
  }

  macroSeries(series: string): { t: number; value: number }[] {
    return this.db.query<{ t: number; value: number }, [string]>(`SELECT t,value FROM macro_series WHERE series=? ORDER BY t`).all(series);
  }

  /** Adds or revises observations; published history is never deleted. */
  saveMacroSeries(series: string, points: readonly { t: number; value: number }[]): void {
    const put = this.db.query(`INSERT OR REPLACE INTO macro_series (series,t,value) VALUES (?,?,?)`);
    this.db.transaction(() => { for (const p of points) put.run(series, p.t, p.value); })();
  }
}

function rowToTrade(r: Record<string, unknown>): Trade {
  return {
    side: r.side as Trade['side'],
    size: r.size as number,
    entryTime: r.entry_time as number,
    entryPrice: r.entry_price as number,
    exitTime: r.exit_time as number,
    exitPrice: r.exit_price as number,
    pnl: r.pnl as number,
    funding: r.funding as number,
    exitReason: r.exit_reason as Trade['exitReason'],
    entryReason: (r.entry_reason as string | null) ?? undefined,
    exitNote: (r.exit_note as string | null) ?? undefined,
    barsHeld: r.bars_held as number,
    ...(r.bars_held_partial ? {barsHeldPartial:true} : {}),
    ...(r.execution ? {execution:JSON.parse(r.execution as string)} : {}),
  };
}
