import { expect, test } from 'bun:test';
import { ArenaDB } from './db.ts';
import { RUN_STATUS } from '../engine/run.ts';

const HOUR = 3_600_000, DAY = 24 * HOUR;
const candle = (time: number) => ({ time, open: 1, high: 1, low: 1, close: 1, spread: 0.1, volume: 1 });

test('candle pruning removes old rows of every instrument in both tables and keeps the rest', () => {
  const db = new ArenaDB(':memory:');
  for (const epic of ['AAPL', 'GOLD', 'US100']) {
    db.insertCandles(epic, [candle(1 * DAY), candle(5 * DAY), candle(9 * DAY)]);
    db.insertStreamCandles(epic, [candle(2 * DAY), candle(8 * DAY)]);
  }
  db.pruneCandles(6 * DAY);
  for (const epic of ['AAPL', 'GOLD', 'US100']) expect(db.candlesSince(epic, 0).map(c => c.time / DAY)).toEqual([8, 9]);
});

test('equity thinning keeps daily points older than 30 days, and each pass thins only the hours that aged since the last', () => {
  const db = new ArenaDB(':memory:');
  const run = (id: string) => db.createDemoRun({ id, agentId: 'a', codeHash: 'h', epic: 'GOLD', leverage: 1, capital: 100, params: {}, now: 0 });
  run('live');
  run('gone');
  for (let t = 0; t <= 40 * DAY; t += 6 * HOUR) db.upsertEquity('live', t, 100);
  for (let t = 0; t <= 9 * DAY; t += 6 * HOUR) db.upsertEquity('gone', t, 100);
  db.retireRun('gone', 9 * DAY, RUN_STATUS.STOPPED, 'test');
  const hours = (id: string, from: number, to: number) => db.equity(id).filter(p => p.t >= from && p.t < to).map(p => p.t / HOUR);

  db.setSetting('equity.thinnedThrough', 0);
  db.thinEquity(40 * DAY);
  expect(hours('live', 0, 10 * DAY).every(h => h % 24 === 0)).toBe(true);
  expect(hours('live', 10 * DAY, 11 * DAY)).toEqual([240, 246, 252, 258]);
  expect(hours('gone', 0, 10 * DAY).every(h => h % 24 === 0)).toBe(true);

  // A later pass reaches only the hours that aged past 30 days since the last one.
  db.thinEquity(42 * DAY);
  expect(hours('live', 10 * DAY, 13 * DAY)).toEqual([240, 264, 288, 294, 300, 306]);
  expect(hours('gone', 0, 10 * DAY)).toEqual([0, 24, 48, 72, 96, 120, 144, 168, 192, 216]);
  db.thinEquity(42 * DAY);
  expect(hours('live', 12 * DAY, 13 * DAY)).toEqual([288, 294, 300, 306]);
});

test('a database without the mark is thinned from a week back', () => {
  const db = new ArenaDB(':memory:');
  db.createDemoRun({ id: 'r', agentId: 'a', codeHash: 'h', epic: 'GOLD', leverage: 1, capital: 100, params: {}, now: 0 });
  for (let t = 0; t <= 40 * DAY; t += 6 * HOUR) db.upsertEquity('r', t, 100);
  db.thinEquity(40 * DAY);
  const hourly = db.equity('r').filter(p => p.t < 10 * DAY && p.t % DAY !== 0).map(p => p.t / DAY);
  expect(Math.min(...hourly)).toBe(0.25);
  expect(Math.max(...hourly)).toBeLessThan(3);
});

test('thinning waits a day between passes', () => {
  const db = new ArenaDB(':memory:');
  db.createDemoRun({ id: 'r', agentId: 'a', codeHash: 'h', epic: 'GOLD', leverage: 1, capital: 100, params: {}, now: 0 });
  for (let t = 0; t <= 40 * DAY; t += 6 * HOUR) db.upsertEquity('r', t, 100);
  db.setSetting('equity.thinnedThrough', 5 * DAY);
  db.thinEquity(35 * DAY + 23 * HOUR);
  expect(db.equity('r').filter(p => p.t >= 5 * DAY && p.t < 6 * DAY)).toHaveLength(4);
  db.thinEquity(36 * DAY);
  expect(db.equity('r').filter(p => p.t >= 5 * DAY && p.t < 6 * DAY)).toHaveLength(1);
});
