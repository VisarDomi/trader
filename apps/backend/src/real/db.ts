import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RealDealSummary } from '@trader/shared/types';
import type { RunSnapshot } from '../engine/run.ts';

export interface RealAssignment {
  runId: string;
  agentId: string;
  epic: string;
  leverage: number;
  codeHash: string;
  assignedAt: number;
}

export interface RealDealRow extends RealDealSummary {
  account_id: string;
  account_name: string;
  paper_size: number;
  paper_open_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  close_at: number | null;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS real_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
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
  pnl REAL,
  note TEXT,
  stop_loss REAL,
  take_profit REAL,
  close_at INTEGER
);
CREATE INDEX IF NOT EXISTS real_deals_status ON real_deals (status);
CREATE INDEX IF NOT EXISTS real_deals_run ON real_deals (run_id);

CREATE TABLE IF NOT EXISTS events (
  time INTEGER NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS real_events_time ON events (time);
`;

export class RealDB {
  readonly sqlite: Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new Database(path, { create: true });
    this.sqlite.exec(SCHEMA);
  }

  close(): void {
    this.sqlite.close();
  }

  getSetting<T>(key: string, fallback: T): T {
    const row = this.sqlite.query<{ value: string }, [string]>('SELECT value FROM kv WHERE key = ?').get(key);
    return row ? (JSON.parse(row.value) as T) : fallback;
  }

  setSetting(key: string, value: unknown): void {
    this.sqlite.query('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
  }

  deleteSetting(key: string): void {
    this.sqlite.query('DELETE FROM kv WHERE key = ?').run(key);
  }

  getAssignment(): RealAssignment | null {
    return this.getSetting<RealAssignment | null>('real.assignment', null);
  }

  setAssignment(a: RealAssignment | null): void {
    if (a === null) this.deleteSetting('real.assignment');
    else this.setSetting('real.assignment', a);
  }

  getSnapshot(runId: string): RunSnapshot | null {
    const saved = this.getSetting<{ runId: string; snapshot: RunSnapshot } | null>('real.snapshot', null);
    return saved?.runId === runId ? saved.snapshot : null;
  }

  setSnapshot(runId: string, snapshot: RunSnapshot | null): void {
    if (snapshot === null) this.deleteSetting('real.snapshot');
    else this.setSetting('real.snapshot', { runId, snapshot });
  }

  insertDeal(d: Omit<RealDealRow, 'id'>): number {
    const res = this.sqlite
      .query(
        `INSERT INTO real_deals
          (account_id, account_name, run_id, epic, side, size, paper_size, deal_id, status,
           open_time, open_price, paper_open_price, close_time, close_price, pnl, note, stop_loss, take_profit, close_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.account_id,
        d.account_name,
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
        d.pnl,
        d.note,
        d.stop_loss,
        d.take_profit,
        d.close_at,
      );
    return Number(res.lastInsertRowid);
  }

  updateDeal(id: number, patch: Partial<Omit<RealDealRow, 'id'>>): void {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([k]) => `${k} = ?`).join(', ');
    this.sqlite.query(`UPDATE real_deals SET ${sets} WHERE id = ?`).run(...entries.map(([, v]) => v as never), id);
  }

  openDeals(): RealDealRow[] {
    return this.sqlite.query<RealDealRow, []>("SELECT * FROM real_deals WHERE status = 'open' ORDER BY id ASC").all();
  }

  deals(limit = 50): RealDealRow[] {
    return this.sqlite.query<RealDealRow, [number]>('SELECT * FROM real_deals ORDER BY id DESC LIMIT ?').all(limit);
  }

  dealByDealId(dealId: string): RealDealRow | null {
    return this.sqlite.query<RealDealRow, [string]>('SELECT * FROM real_deals WHERE deal_id = ? ORDER BY id DESC LIMIT 1').get(dealId);
  }

  event(level: 'info' | 'warn' | 'error', source: string, message: string): void {
    this.sqlite.query('INSERT INTO events (time, level, source, message) VALUES (?, ?, ?, ?)').run(Date.now(), level, source, message);
    // Keep the event log bounded on Hetzner.
    this.sqlite.query('DELETE FROM events WHERE rowid NOT IN (SELECT rowid FROM events ORDER BY rowid DESC LIMIT 2000)').run();
  }

  events(limit = 100): { time: number; level: string; source: string; message: string }[] {
    return this.sqlite.query<{ time: number; level: string; source: string; message: string }, [number]>(
      'SELECT time, level, source, message FROM events ORDER BY time DESC LIMIT ?',
    ).all(limit);
  }
}
