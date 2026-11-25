import { expect, test } from 'bun:test';
import { ArenaDB, RUN_KIND } from './db.ts';
import { AgentEvidenceService } from './evidence.ts';
import { countPeriods, curveOf, listPeriods, periodDays, winChance, MIN_PERIODS } from './frequency.ts';
import { backtestRunId, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';
import { defineAgent } from '../sdk/index.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { Arena } from './arena.ts';
import type { LeaderboardRow } from '@trader/shared';

const DAY = 86_400_000, START = Date.UTC(2024, 0, 1);
/** 101 daily points: +1% a day for 50 days, then flat. */
const rising = curveOf(Array.from({ length: 101 }, (_, i) => ({ t: START + i * DAY, equity: 10_000 * 1.01 ** Math.min(i, 50) })));

test('every period that fits is counted against the record, on both sides', () => {
  // 10-day periods start on days 0…90: 41 lie wholly in the rise (+10.46%), 9 straddle its end, 41 are flat.
  const f = countPeriods(rising, 10, 0.05)!;
  expect(f).toMatchObject({ days: 10, observed: 0.05, periods: 91, independent: 10 });
  expect(f.best).toBeCloseTo(1.01 ** 10 - 1, 12);
  expect(f.worst).toBe(0);
  // Starts 0…45 return at least +5% (1.01^5 = +5.1%); the rest return less.
  expect(f.atLeast).toBe(46);
  expect(f.atMost).toBe(45);
  // A result the backtest never reached, and one it never fell to.
  expect(countPeriods(rising, 10, 0.5)).toMatchObject({ atLeast: 0, atMost: 91 });
  expect(countPeriods(rising, 10, -0.01)).toMatchObject({ atLeast: 91, atMost: 0 });
  // A return equal to a period's counts on both sides.
  expect(countPeriods(rising, 10, 0)).toMatchObject({ atLeast: 91, atMost: 41 });
});
test('too little history says nothing: under four periods end to end, or under the minimum count', () => {
  expect(countPeriods(rising, 26, 0)).toBeUndefined();            // 100 days hold three 26-day periods
  expect(countPeriods(rising, 25, 0)).toMatchObject({ periods: 76, independent: 4 });
  const short = curveOf(Array.from({ length: MIN_PERIODS }, (_, i) => ({ t: START + i * DAY, equity: 100 + i })));
  expect(countPeriods(short, 1, 0)).toBeUndefined();              // 29 one-day periods
  expect(countPeriods(rising, 1, 0)).toMatchObject({ periods: 100, independent: 100 });   // one-day periods do not overlap
  expect(countPeriods(curveOf([]), 1, 0)).toBeUndefined();
  expect(countPeriods(rising, 10, NaN)).toBeUndefined();
});
test('a period ends at the latest stored day, skips days with nothing left, and a record lives at least one day', () => {
  // Weekdays only: a 3-day period from Friday ends on Monday; one from Thursday ends on Sunday, at Friday's equity.
  const week = curveOf([0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((d, i) => ({ t: START + d * DAY, equity: 100 + i })));
  const p = listPeriods('bt', week, 3).points;
  expect(p.map(x => (x.t - START) / DAY)).toEqual([3, 4, 5, 6, 7, 10, 11]);
  expect(p[3]!.ret).toBeCloseTo(104 / 103 - 1, 12);               // Thursday (103) → Sunday, still Friday's 104
  expect(p[4]!.ret).toBeCloseTo(105 / 104 - 1, 12);               // Friday (104) → Monday (105)
  const bust = curveOf([100, 50, 0, 0, 0].map((equity, i) => ({ t: START + i * DAY, equity })));
  expect(listPeriods('bt', bust, 1).points.map(x => x.ret)).toEqual([-0.5, -1]);
  expect(listPeriods('bt', rising, 10)).toMatchObject({ runId: 'bt', days: 10, from: START, through: START + 100 * DAY, median: listPeriods('bt', rising, 10).points[45]!.ret });
  expect(periodDays(START, START + 0.3 * DAY)).toBe(1);
  expect(periodDays(START, START + 40.3 * DAY)).toBe(40);
});
test('the chance of at least that many wins is the binomial tail, also for thousands of trades', () => {
  expect(winChance(3, 3, 0.4366)).toBeCloseTo(0.4366 ** 3, 12);    // three wins of three: 8.3%
  expect(winChance(2, 3, 0.5)).toBeCloseTo(0.5, 12);
  expect(winChance(0, 5, 0.3)).toBe(1);
  expect(winChance(1, 5, 0)).toBe(0);
  expect(winChance(5, 5, 1)).toBe(1);
  expect(winChance(6, 5, 0.9)).toBe(0);
  expect(winChance(2500, 5000, 0.5)).toBeCloseTo(0.5056, 3);       // half or more of 5,000 fair trades
  expect(winChance(2600, 5000, 0.5)).toBeLessThan(0.01);
});

const EPIC = 'US500', RUN = 'demo:fixture:US500:x20:hash', T = Date.UTC(2026, 9, 1);
function agent(codeHash = 'hash'): LoadedAgent {
  return { id: 'fixture', slug: 'fixture', variant: null, file: '', source: '', codeHash, params: {}, def: defineAgent({ name: 'fixture', description: 'fixture', instruments: [EPIC], timeframe: '1h', params: {}, onBar() {} }) };
}
/** A live run with one hourly equity point after `days`, and a backtest of the rising curve under `backtestHash`. */
function fixture(days: number, equity: number, metrics: object | null, backtestHash = 'hash') {
  const db = new ArenaDB(':memory:');
  db.upsertAgent(agent(), T);
  db.createDemoRun({ id: RUN, agentId: 'fixture', codeHash: 'hash', epic: EPIC, leverage: 20, capital: 10_000, params: {}, now: T });
  db.upsertEquity(RUN, T + days * DAY, equity);
  if (metrics) db.db.run('UPDATE runs SET metrics=? WHERE id=?', [JSON.stringify(metrics), RUN]);
  const id = backtestRunId(PRIMARY_BACKTEST_WINDOW_ID, 'fixture', EPIC, 20);
  db.createDemoRun({ id, agentId: 'fixture', codeHash: backtestHash, epic: EPIC, leverage: 20, capital: 10_000, params: {}, now: T });
  db.db.run('UPDATE runs SET kind=?,window_id=?,metrics=? WHERE id=?', [RUN_KIND.BACKTEST, PRIMARY_BACKTEST_WINDOW_ID, JSON.stringify({ trades: 71, winRate: 0.4366 }), id]);
  for (let i = 0; i < rising.t.length; i++) db.upsertEquity(id, rising.t[i]!, rising.equity[i]!);
  return { db, id, service: new AgentEvidenceService({ db, tracked: new Map() } as unknown as Arena) };
}
test('a virtual run is counted over its own days against the backtest of the same code, with its wins', () => {
  const { db, id, service } = fixture(10, 10_500, { trades: 3, winRate: 1 });
  const f = service.forRun(db.run(RUN)!, T + 11 * DAY).frequency!;
  expect(f).toMatchObject({ runId: id, days: 10, periods: 91, independent: 10, atLeast: 46, atMost: 45 });
  expect(f.observed).toBeCloseTo(0.05, 12);
  expect(f.wins).toMatchObject({ won: 3, trades: 3, rate: 0.4366, backtestTrades: 71 });
  expect(f.wins!.chance).toBeCloseTo(0.4366 ** 3, 12);
  // The chart's periods come from the same stored curve.
  expect(service.periods(db.run(id)!, 10, T + 11 * DAY).points).toHaveLength(91);
  db.db.close();
});
test('no frequency before a closed trade, for another code version, or while the record outlives the backtest', () => {
  for (const [days, metrics, hash] of [[10, { trades: 0, winRate: 0 }, 'hash'], [10, null, 'hash'], [10, { trades: 3, winRate: 1 }, 'older'], [30, { trades: 3, winRate: 1 }, 'hash']] as const) {
    const { db, service } = fixture(days, 10_500, metrics, hash);
    expect(service.forRun(db.run(RUN)!, T + 40 * DAY).frequency).toBeUndefined();
    db.db.close();
  }
});
test('Capital cash is counted since the first deal, not over the virtual run\'s life, and a re-run backtest is read again', () => {
  const { db, id, service } = fixture(10, 10_500, { trades: 3, winRate: 1 });
  const now = T + 11 * DAY;
  service.forRun(db.run(RUN)!, now);
  const row = { runId: RUN, epic: EPIC, metrics: { startTime: T + 5 * DAY, endTime: T + 10 * DAY, totalReturn: 0.5, trades: 2, winRate: 0.5 } } as LeaderboardRow;
  const real = Date.now;
  Date.now = () => now;
  try {
    const f = service.forCapital(row, 0, false)!.frequency!;
    expect(f).toMatchObject({ days: 5, observed: 0.5, periods: 96, atLeast: 0, atMost: 96 });   // +50% in 5 days: never
    expect(f.wins).toMatchObject({ won: 1, trades: 2 });
    expect(f.wins!.chance).toBeCloseTo(1 - (1 - 0.4366) ** 2, 12);
    // Without priced deals there is nothing to count, and the virtual run's own numbers are not borrowed.
    expect(service.forCapital({ ...row, metrics: null }, 0, false)!.frequency).toBeUndefined();
    // The backtest is re-run: its curve doubles every day, so +50% in five days is now the least it ever did.
    db.db.run('DELETE FROM equity WHERE run_id=?', [id]);
    for (let i = 0; i < 60; i++) db.upsertEquity(id, START + i * DAY, 10_000 * 2 ** i);
    db.db.run('UPDATE runs SET updated_at=updated_at+1 WHERE id=?', [id]);
    service.invalidate();
    expect(service.forCapital(row, 0, false)!.frequency).toMatchObject({ periods: 55, atLeast: 55, atMost: 0 });
  } finally { Date.now = real; db.db.close(); }
});
