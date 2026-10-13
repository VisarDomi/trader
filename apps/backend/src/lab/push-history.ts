/**
 * Push daily bars to the arena, built from the lab's 1-minute history the way
 * any 1d series builds them. At its next start the arena seeds its 1d series
 * with the bars older than its own 1-minute history (arena.ts seedDaily), so
 * agents with 200-day lookbacks trade from day one. Runs nightly.
 *
 *   bun run push-history
 */
import { DAY_MS } from '../engine/clock.ts';
import { ALL_EPICS, getInstrument } from '../engine/instruments.ts';
import type { Candle } from '../engine/series.ts';
import { BarSeries } from '../engine/series.ts';
import { STANDARD_WINDOW } from './backtest-core.ts';
import { candleAt, candleCount, fromDatabase } from './candles.ts';

const ARENA_URL = process.env.ARENA_URL ?? 'http://127.0.0.1:4120';
const token = process.env.ARENA_TOKEN;
if (!token) throw new Error('ARENA_TOKEN not set');

// Completed UTC days only.
const end = Math.floor(Date.now() / DAY_MS) * DAY_MS;
for (const epic of ALL_EPICS) {
  const inst = getInstrument(epic);
  const data = await fromDatabase(epic, STANDARD_WINDOW.start, end);
  const series = new BarSeries(epic, '1d');
  const bars: Candle[] = [];
  for (let i = 0; i < candleCount(data); i++) {
    const c = candleAt(data, i);
    // Same as MarketEngine.normalize: old history has no recorded spread.
    bars.push(...series.push(c.spread > 0 ? c : { ...c, spread: inst.typicalSpread }));
  }
  const last = series.flush();
  if (last) bars.push(last);
  const res = await fetch(`${ARENA_URL}/api/history/daily`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ epic, bars }),
  });
  if (!res.ok) throw new Error(`${epic}: push failed (${res.status}): ${await res.text()}`);
  console.log(`${epic}: ${bars.length} daily bars`);
}
process.exit(0);
