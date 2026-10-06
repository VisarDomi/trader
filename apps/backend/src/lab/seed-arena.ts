/**
 * Build a fresh arena database pre-filled with recent 1-minute candles from
 * the lab's PostgreSQL, so the arena's first start does not have to download
 * months of history from Capital.com.
 *
 *   bun run src/lab/seed-arena.ts /tmp/arena-seed.db
 */
import { existsSync } from 'node:fs';
import { ArenaDB } from '../arena/db.ts';
import { HISTORY_DAYS } from '../arena/arena.ts';
import { DAY_MS } from '../engine/clock.ts';
import { ALL_EPICS } from '../engine/instruments.ts';
import { candleAt, candleCount, loadCandleArray } from './candles.ts';

const path = process.argv[2];
if (!path) throw new Error('usage: bun run src/lab/seed-arena.ts <output.db>');
if (existsSync(path)) throw new Error(`${path} already exists`);

const db = new ArenaDB(path);
const end = Date.now();
const start = end - HISTORY_DAYS * DAY_MS;
for (const epic of ALL_EPICS) {
  const data = await loadCandleArray(epic, start, end, true);
  const n = candleCount(data);
  const candles = Array.from({ length: n }, (_, i) => candleAt(data, i));
  db.insertCandles(epic, candles);
  console.log(`${epic}: ${n} candles`);
}
db.db.exec('VACUUM');
console.log(`seeded ${path}`);
process.exit(0);
