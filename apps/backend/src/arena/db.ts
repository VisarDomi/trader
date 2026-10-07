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

CREATE TABLE IF NOT EXISTS events (
  time INTEGER NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_time ON events (time);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export interface RunRow {
  id: string;
  kind: RunKind;
  agent_id: string;
  code_hash: string;
  epic: string;
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
  /** Capital.com demo account name the deal lives on. */
  account: string;
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
}

const MAX_LOGS_PER_RUN = 300;
const MAX_EVENTS = 5000;

export class ArenaDB {
  readonly db: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec(SCHEMA);
    this.migrate();
  }

  private migrate(): void {
    const dealColumns = this.db.query<{ name: string }, []>(`PRAGMA table_info(broker_deals)`).all().map(c => c.name);
    if (!dealColumns.includes('account')) this.db.exec(`ALTER TABLE broker_deals ADD COLUMN account TEXT`);
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

  agentVersions(id: string): { code_hash: string; source: string; first_seen: number }[] {
    return this.db
      .query<{ code_hash: string; source: string; first_seen: number }, [string]>(
        `SELECT code_hash, source, first_seen FROM agent_versions WHERE agent_id = ? ORDER BY first_seen DESC`,
      )
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

  runsForAgent(agentId: string): RunRow[] {
    return this.db.query<RunRow, [string]>(`SELECT * FROM runs WHERE agent_id = ? ORDER BY kind, epic, started_at DESC`).all(agentId);
  }

  createDemoRun(r: { id: string; agentId: string; codeHash: string; epic: string; capital: number; params: Record<string, unknown>; now: number }): void {
    this.db
      .query(
        `INSERT INTO runs (id, kind, agent_id, code_hash, epic, status, capital, params, started_at, updated_at, equity)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`,
      )
      .run(r.id, RUN_KIND.DEMO, r.agentId, r.codeHash, r.epic, r.capital, JSON.stringify(r.params), r.now, r.now, r.capital);
  }

  retireRun(id: string, now: number, status: RunStatus): void {
    this.db.query(`UPDATE runs SET retired = 1, ended_at = ?, status = ? WHERE id = ?`).run(now, status, id);
  }

  saveRunState(r: { id: string; status: RunStatus; equity: number; snapshot: RunSnapshot; metrics: RunMetrics | null; now: number }): void {
    this.db
      .query(
        `UPDATE runs SET status = ?, equity = ?, snapshot = ?, metrics = COALESCE(?, metrics), updated_at = ? WHERE id = ?`,
      )
      .run(r.status, r.equity, JSON.stringify(r.snapshot), r.metrics ? JSON.stringify(r.metrics) : null, r.now, r.id);
  }

  setRunExtra(id: string, extra: Record<string, unknown>): void {
    this.db.query(`UPDATE runs SET extra = ? WHERE id = ?`).run(JSON.stringify(extra), id);
  }

  appendTrade(runId: string, idx: number, t: Trade): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO trades (run_id, idx, side, size, entry_time, entry_price, exit_time, exit_price, pnl, funding, exit_reason, entry_reason, exit_note, bars_held)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, idx, t.side, t.size, t.entryTime, t.entryPrice, t.exitTime, t.exitPrice, t.pnl, t.funding, t.exitReason, t.entryReason ?? null, t.exitNote ?? null, t.barsHeld);
  }

  trades(runId: string, limit = 5000): Trade[] {
    return this.db
      .query<Record<string, unknown>, [string, number]>(`SELECT * FROM trades WHERE run_id = ? ORDER BY idx DESC LIMIT ?`)
      .all(runId, limit)
      .reverse()
      .map(rowToTrade);
  }

  upsertEquity(runId: string, t: number, equity: number): void {
    this.db.query(`INSERT OR REPLACE INTO equity (run_id, t, equity) VALUES (?, ?, ?)`).run(runId, t, equity);
  }

  equity(runId: string): EquityPoint[] {
    return this.db.query<EquityPoint, [string]>(`SELECT t, equity FROM equity WHERE run_id = ? ORDER BY t`).all(runId);
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

  /** Keep hourly equity for 30 days, then one point per day. */
  thinEquity(now: number): void {
    const cutoff = now - 30 * 86_400_000;
    this.db
      .query(
        `DELETE FROM equity WHERE t < ? AND (t % 86400000) != 0
           AND run_id IN (SELECT id FROM runs WHERE kind = 'demo')`,
      )
      .run(cutoff);
  }

  /** Store a backtest result pushed from the lab (replaces the previous one for the same agent/epic/window). */
  saveBacktest(r: BacktestResult): void {
    const id = `bt:${r.windowId}:${r.agentId}:${r.epic}`;
    this.tx(() => {
      this.db.query(`DELETE FROM runs WHERE id = ?`).run(id);
      this.db
        .query(
          `INSERT INTO runs (id, kind, agent_id, code_hash, epic, window_id, status, capital, params, started_at, updated_at, ended_at, equity, metrics, extra)
           VALUES (?, 'backtest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id, r.agentId, r.codeHash, r.epic, r.windowId, r.status, r.capital, JSON.stringify(r.params),
          r.windowStart, r.ranAt, r.windowEnd, r.metrics.finalEquity, JSON.stringify(r.metrics),
          JSON.stringify({ agentUsPerBar: r.agentUsPerBar, bars: r.bars, candles: r.candles, errors: r.errors, durationMs: r.durationMs }),
        );
      r.trades.forEach((t, i) => this.appendTrade(id, i, t));
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
    return this.db
      .query<{ t: number; o: number; h: number; l: number; c: number; spread: number; volume: number }, [string, number]>(
        `SELECT t, o, h, l, c, spread, volume FROM candles WHERE epic = ? AND t >= ? ORDER BY t`,
      )
      .all(epic, from)
      .map(r => ({ time: r.t, open: r.o, high: r.h, low: r.l, close: r.c, spread: r.spread, volume: r.volume }));
  }

  lastCandleTime(epic: string): number | null {
    const row = this.db.query<{ t: number | null }, [string]>(`SELECT MAX(t) AS t FROM candles WHERE epic = ?`).get(epic);
    return row?.t ?? null;
  }

  pruneCandles(before: number): void {
    this.db.query(`DELETE FROM candles WHERE t < ?`).run(before);
  }

  // ------------------------------------------------------------------ broker

  insertDeal(d: Omit<DealRow, 'id'>): number {
    const res = this.db
      .query(
        `INSERT INTO broker_deals (account, run_id, epic, side, size, paper_size, deal_id, status, open_time, open_price, paper_open_price, close_time, close_price, paper_close_price, pnl, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.account, d.run_id, d.epic, d.side, d.size, d.paper_size, d.deal_id, d.status, d.open_time, d.open_price, d.paper_open_price, d.close_time, d.close_price, d.paper_close_price, d.pnl, d.note);
    return Number(res.lastInsertRowid);
  }

  /** Deals recorded before accounts were tracked per deal all lived on `account`. */
  claimUnownedDeals(account: string): void {
    this.db.query(`UPDATE broker_deals SET account = ? WHERE account IS NULL`).run(account);
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

  // ------------------------------------------------------------------ events & settings

  event(level: string, source: string, message: string): void {
    this.db.query(`INSERT INTO events (time, level, source, message) VALUES (?, ?, ?, ?)`).run(Date.now(), level, source, message.slice(0, 2000));
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
  };
}
