/**
 * Loads 1-minute candles for backtests.
 *
 * PostgreSQL is the master store; each (instrument, window) is exported once
 * to a compact binary file under data/candles/ so parallel backtest workers
 * can load it quickly. Layout: Float64Array of rows × [time, o, h, l, c, spread, volume].
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sql } from '../data/db.ts';
import { DAY_MS } from '../engine/clock.ts';
import type { Candle } from '../engine/series.ts';

export const DATA_DIR = resolve(import.meta.dir, '..', '..', 'data');
const CANDLE_DIR = join(DATA_DIR, 'candles');
const FIELDS = 7;
const CHUNK_MS = 30 * DAY_MS;

function cachePath(epic: string, start: number, end: number): string {
  return join(CANDLE_DIR, `${epic}_${start}_${end}.f64`);
}

/** Fetch from PostgreSQL in monthly chunks and pack into a Float64Array. */
async function fromDatabase(epic: string, start: number, end: number): Promise<Float64Array> {
  const chunks: number[][] = [];
  let total = 0;
  for (let from = start; from < end; from += CHUNK_MS) {
    const to = Math.min(from + CHUNK_MS, end);
    const rows = (await sql`
      SELECT timestamp, open, high, low, close, spread, volume
      FROM candles
      WHERE instrument = ${epic} AND timestamp >= ${from} AND timestamp < ${to}
      ORDER BY timestamp ASC
    `.values()) as unknown[][];
    const flat = new Array<number>(rows.length * FIELDS);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      for (let f = 0; f < FIELDS; f++) {
        const v = r[f];
        flat[i * FIELDS + f] = v === null || v === undefined ? 0 : Number(v);
      }
    }
    chunks.push(flat);
    total += rows.length;
  }
  const out = new Float64Array(total * FIELDS);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Candles for [start, end). Uses the binary cache when present; pass
 * refresh=true for windows that end in the future (the cache would be partial).
 */
export async function loadCandleArray(epic: string, start: number, end: number, refresh = false): Promise<Float64Array> {
  const path = cachePath(epic, start, end);
  if (!refresh && existsSync(path)) {
    return new Float64Array(await Bun.file(path).arrayBuffer());
  }
  const data = await fromDatabase(epic, start, end);
  mkdirSync(CANDLE_DIR, { recursive: true });
  await Bun.write(path, data.buffer as ArrayBuffer);
  return data;
}

export function candleCount(data: Float64Array): number {
  return data.length / FIELDS;
}

/** Read candle i into a fresh object. */
export function candleAt(data: Float64Array, i: number): Candle {
  const o = i * FIELDS;
  return {
    time: data[o]!,
    open: data[o + 1]!,
    high: data[o + 2]!,
    low: data[o + 3]!,
    close: data[o + 4]!,
    spread: data[o + 5]!,
    volume: data[o + 6]!,
  };
}

export async function availableRange(epic: string): Promise<{ start: number; end: number; rows: number } | null> {
  const [row] = await sql`SELECT MIN(timestamp) AS s, MAX(timestamp) AS e, COUNT(*)::int AS n FROM candles WHERE instrument = ${epic}`;
  if (!row || row.s === null) return null;
  return { start: Number(row.s), end: Number(row.e), rows: Number(row.n) };
}
