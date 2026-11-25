import { expect, test } from 'bun:test';
import { ArenaDB, RUN_KIND } from './db.ts';
import { AgentEvidenceService } from './evidence.ts';
import { Judging, judgedT, statsOf, tAt, weekdayCloses } from './judging.ts';
import { Portfolios, daysToBar, weigh } from './portfolio.ts';
import { LIFECYCLE } from '../engine/policy.ts';
import { RUN_STATUS } from '../engine/run.ts';
import { backtestRunId, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';
import { loadAgents } from '../engine/loader.ts';
import { loadRoster, rosterProblems, type PortfolioRule } from '../engine/roster.ts';
import { defineAgent } from '../sdk/index.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { Arena } from './arena.ts';
import { assessPortfolio, VERDICT } from '@trader/shared';

const DAY = 86_400_000, HOUR = 3_600_000, EPIC = 'US500';
/** Monday 2026-10-05 00:00 UTC; November starts on day 27, December on day 57. */
const MON = Date.UTC(2026, 9, 5);
const day = (n: number) => MON + n * DAY;
const RULE: PortfolioRule = { name: 'Arena portfolio', declared: '2026-10-15', minBacktestSharpe: 0.5 };

function agent(id: string): LoadedAgent {
  return { id, slug: id, variant: null, file: '', source: '', codeHash: 'hash', params: {}, def: defineAgent({ name: id, description: id, instruments: [EPIC], timeframe: '1h', params: {}, onBar() {} }) };
}
const demoId = (name: string) => `demo:${name}:${EPIC}:x20:hash`;
/** A forward record from Monday with one equity point per midnight, growing by `daily` each weekday. */
function record(db: ArenaDB, name: string, days: number, daily: (weekdayIndex: number) => number) {
  const id = demoId(name);
  db.upsertAgent(agent(name), MON);
  db.createDemoRun({ id, agentId: name, codeHash: 'hash', epic: EPIC, leverage: 20, capital: 10_000, params: {}, now: MON });
  let equity = 10_000, w = 0;
  for (const close of weekdayCloses(MON, day(days))) db.upsertEquity(id, close, (equity *= 1 + daily(w++)));
  return id;
}
/** The record's same-code backtest: 500 weekdays alternating ±`swing`, with the given Sharpe ratio before T-bills (lower above them). */
function backtest(db: ArenaDB, name: string, sharpe: number, swing: number) {
  const id = backtestRunId(PRIMARY_BACKTEST_WINDOW_ID, name, EPIC, 20), start = Date.UTC(2024, 0, 1);
  db.createDemoRun({ id, agentId: name, codeHash: 'hash', epic: EPIC, leverage: 20, capital: 10_000, params: {}, now: start });
  db.db.run('UPDATE runs SET kind=?,window_id=?,started_at=?,metrics=? WHERE id=?', [RUN_KIND.BACKTEST, PRIMARY_BACKTEST_WINDOW_ID, start, JSON.stringify({ trades: 300, winRate: 0.5, sharpe: sharpe - 0.4, cashFreeSharpe: sharpe }), id]);
  let equity = 10_000, w = 0;
  for (const close of weekdayCloses(start, start + 700 * DAY)) db.upsertEquity(id, close - DAY, (equity *= 1 + 0.0005 + (w++ % 2 ? swing : -swing)));
}
const trade = (db: ArenaDB, id: string, idx: number, at: number) =>
  db.db.run(`INSERT INTO trades (run_id, idx, side, size, entry_time, entry_price, exit_time, exit_price, pnl, funding, exit_reason, bars_held) VALUES (?,?,'long',1,?,100,?,101,1,0,'exit',1)`, [id, idx, at, at + HOUR]);

test('capital is split in proportion to each member\'s scale, over the members that have the day', () => {
  const calm = { closes: [day(1), day(2), day(3)], returns: [0.01, 0.02, -0.01], scale: 3 }, wild = { closes: [day(2), day(3), day(4)], returns: [0.1, -0.1, 0.2], scale: 1 };
  const all = weigh([calm, wild]);
  expect(all.closes).toEqual([day(1), day(2), day(3), day(4)]);
  // Day 1 has only the calm member; day 4 only the wild one; in between three quarters of the capital is in the calm one.
  expect(all.returns[0]).toBeCloseTo(0.01, 12);
  expect(all.returns[1]).toBeCloseTo((3 * 0.02 + 0.1) / 4, 12);
  expect(all.returns[2]).toBeCloseTo((3 * -0.01 - 0.1) / 4, 12);
  expect(all.returns[3]).toBeCloseTo(0.2, 12);
  // A pick holds from the first close after it through the next pick.
  expect(weigh([calm, wild], day(1), day(3)).closes).toEqual([day(2), day(3)]);
  expect(weigh([]).returns).toEqual([]);
});

test('time to the bar: about a year at a Sharpe of 3, four times as long at half of it, never before the floor', () => {
  const bar = 1 / LIFECYCLE.ALONE_ALPHA;
  expect(daysToBar(3, bar)! / 30.4).toBeGreaterThan(11);
  expect(daysToBar(3, bar)! / 30.4).toBeLessThan(13);
  expect(daysToBar(1.5, bar)! / daysToBar(3, bar)!).toBeGreaterThan(3.5);
  expect(daysToBar(1.5, bar)! / daysToBar(3, bar)!).toBeLessThan(4.5);
  expect(daysToBar(5.4, bar)! / 30.4).toBeCloseTo(4, 0);                    // what four months would take
  expect(daysToBar(60, bar)).toBe(LIFECYCLE.MIN_DAYS);
  expect(daysToBar(0.2, bar)).toBeNull();                                  // more than fifty years
  expect(daysToBar(0, bar)).toBeNull();
  expect(daysToBar(null, bar)).toBeNull();
  expect(daysToBar(3, 2 * bar)!).toBeGreaterThan(daysToBar(3, bar)!);
});

test('members are picked from backtests alone, stored, picked again each month, and the record starts at the first pick', () => {
  const db = new ArenaDB(':memory:'), judging = new Judging(db);
  const wobble = (i: number) => 0.004 + (i % 2 ? 0.002 : -0.002), wide = (i: number) => 0.004 + (i % 2 ? 0.02 : -0.02);
  // `good` and `wild` clear the rule; `weak` does not; `bare` has no backtest; the monkey is a control; `late` gets
  // its backtest in November; `gone` is retired on day 20.
  for (const name of ['good', 'weak', 'bare', 'late', 'gone', 'random-baseline']) record(db, name, 80, wobble);
  record(db, 'wild', 80, wide);
  backtest(db, 'good', 1.2, 0.002); backtest(db, 'wild', 0.6, 0.02); backtest(db, 'weak', 0.3, 0.002); backtest(db, 'gone', 0.9, 0.002); backtest(db, 'random-baseline', 2, 0.002);
  const rules: Record<string, PortfolioRule> = { half: RULE }, portfolios = new Portfolios(db, judging, () => rules);
  expect(portfolios.views(day(10), null)[0]).toMatchObject({ id: 'half', since: null, records: 0, observations: 0, confirmed: false, trials: 1 });
  expect(assessPortfolio(portfolios.views(day(10), null)[0]!).verdict).toBe(VERDICT.EARLY);

  const first = day(10) + 2 * HOUR;
  portfolios.repick(first);
  const picked = portfolios.state('half')!;
  expect(picked.since).toBe(first);
  expect(picked.picks.map(p => p.members.map(m => m.id))).toEqual([[demoId('gone'), demoId('good'), demoId('wild')]]);
  // Equal risk: each member at 1 / its backtest's daily volatility, so the wild one holds a tenth of a calm one's capital.
  const [gone, good, wild] = picked.picks[0]!.members;
  expect(good!.scale / wild!.scale).toBeCloseTo(10, 1);
  expect(gone!.scale).toBeCloseTo(good!.scale, 9);
  portfolios.repick(day(20));                                              // the same month: nothing new
  expect(portfolios.state('half')!.picks).toHaveLength(1);

  // The record holds no day from before its first pick, although its members had ten days by then.
  db.retireRun(demoId('gone'), day(20) + 12 * HOUR, RUN_STATUS.STOPPED, 'test');
  const early = portfolios.series('half', day(26) + 2 * HOUR);
  expect(early.closes).toEqual(weekdayCloses(first, day(26)));
  expect(early.closes[0]).toBe(day(11));
  // Thursday's close (day 11) is the 9th weekday: every member is up that day; three members share by scale.
  const total = gone!.scale + good!.scale + wild!.scale;
  expect(early.returns[0]).toBeCloseTo((gone!.scale * wobble(8) + good!.scale * wobble(8) + wild!.scale * wide(8)) / total, 9);
  // After its retirement the gone member counts on no further day; the two left share the capital.
  const after = early.closes.indexOf(day(22)), w = weekdayCloses(MON, day(22)).length - 1;
  expect(early.returns[after]).toBeCloseTo((good!.scale * wobble(w) + wild!.scale * wide(w)) / (good!.scale + wild!.scale), 9);

  // November: `late` now has a backtest that clears the rule; the retired member is not picked again.
  backtest(db, 'late', 0.7, 0.002);
  const second = day(27) + HOUR + 11 * 60_000;                             // past the ten minutes a missing backtest is remembered
  portfolios.repick(second);
  expect(portfolios.state('half')!.picks.map(p => p.members.map(m => m.id))[1]).toEqual([demoId('good'), demoId('late'), demoId('wild')]);
  expect(portfolios.state('half')!.since).toBe(first);

  // A restart reads the same picks and the same record back.
  const now = day(70) + 2 * HOUR, again = new Portfolios(db, new Judging(db), () => rules);
  const series = again.series('half', now);
  expect(series.closes).toEqual(weekdayCloses(first, day(70)));
  expect(series).toEqual(portfolios.series('half', now));
  // The first pick's weights hold until the second pick (Sunday 1 November); `late` counts from Monday's close on.
  const before = series.closes.indexOf(day(26)), from = series.closes.indexOf(day(29)), k = weekdayCloses(MON, day(29)).length - 1;
  expect(from).toBe(before + 1);
  expect(series.returns[before]).toBeCloseTo((good!.scale * wobble(k - 1) + wild!.scale * wide(k - 1)) / (good!.scale + wild!.scale), 9);
  const late = again.state('half')!.picks[1]!.members.find(m => m.id === demoId('late'))!;
  expect(series.returns[from]).toBeCloseTo((good!.scale * wobble(k) + late.scale * wobble(k) + wild!.scale * wide(k)) / (good!.scale + late.scale + wild!.scale), 9);

  // Trades count while the portfolio holds the record: not before its pick, not a record it does not hold.
  trade(db, demoId('good'), 0, day(5)); trade(db, demoId('good'), 1, day(12)); trade(db, demoId('late'), 0, day(12)); trade(db, demoId('late'), 1, day(30)); trade(db, demoId('weak'), 0, day(30));
  const view = again.views(now, 1.1)[0]!;
  expect(view).toMatchObject({ id: 'half', name: 'Arena portfolio', minBacktestSharpe: 0.5, since: first, pickedAt: second, records: 3, agents: 3, markets: 1, picks: 2, trades: 2, trials: 1, monkey: 1.1 });
  expect(view.observations).toBe(series.closes.length);
  expect(view.days).toBeCloseTo(60, 9);
  expect(view.t).toBeCloseTo(judgedT(series.stats, again.backtest('half', now)), 12);
  expect(view.t).toBeGreaterThan(5);
  expect(view.confirmAt!).toBeCloseTo(tAt(1 / LIFECYCLE.ALONE_ALPHA, view.observations), 9);
  expect(view.confirmed).toBe(true);
  expect(assessPortfolio(view).verdict).toBe(VERDICT.CONFIRMED);
  expect(view.curve).toHaveLength(series.closes.length);
  expect(view.curve.at(-1)!.value).toBeCloseTo(series.returns.reduce((v, r) => v * (1 + r), 1) - 1, 12);
  expect(view.ret).toBe(view.curve.at(-1)!.value);
  expect(view.members.map(m => m.name).sort()).toEqual(['good', 'late', 'wild']);
  expect(view.members.reduce((n, m) => n + m.share, 0)).toBeCloseTo(1, 12);
  expect(view.members.find(m => m.name === 'wild')).toMatchObject({ backtestSharpe: 0.6, epic: EPIC, leverage: 20 });
  expect(view.members.find(m => m.name === 'wild')!.share).toBeLessThan(0.06);
  expect(view.backtestSharpe!).toBeGreaterThan(0);
  expect(view.confirmDays).toEqual({ backtest: daysToBar(view.backtestSharpe, 40), half: daysToBar(view.backtestSharpe! / 2, 40) });

  // Before the day floor nothing is confirmed, whatever the t; a second declared portfolio doubles the bar.
  const young = again.views(day(40), null)[0]!;
  expect(young.t).toBeGreaterThan(young.confirmAt!);
  expect(young).toMatchObject({ confirmed: false });
  expect(assessPortfolio(young).verdict).toBe(VERDICT.EARLY);
  rules.other = { ...RULE, name: 'Stricter', minBacktestSharpe: 1 };
  const two = again.views(now, null);
  expect(two.map(v => v.trials)).toEqual([2, 2]);
  expect(two[0]!.confirmAt!).toBeCloseTo(tAt(2 / LIFECYCLE.ALONE_ALPHA, view.observations), 9);
  expect(two[1]).toMatchObject({ since: null, records: 0 });
  db.db.close();
});

test('a portfolio between the floor and the bar is kept or a candidate above the monkeys; the evidence service serves it', () => {
  const db = new ArenaDB(':memory:');
  // Two records that mostly cancel: a small edge against a 1% daily swing.
  record(db, 'up', 80, i => 0.0012 + (i % 2 ? 0.01 : -0.01)); record(db, 'down', 80, i => 0.0012 + (i % 3 ? -0.004 : 0.008));
  backtest(db, 'up', 0.8, 0.01); backtest(db, 'down', 0.8, 0.01);
  const arena = { db, tracked: new Map(), judging: new Judging(db), roster: { portfolios: { half: RULE } } } as unknown as Arena;
  (arena as { portfolios: Portfolios }).portfolios = new Portfolios(db, arena.judging, () => arena.roster!.portfolios!);
  arena.portfolios.repick(day(1));
  const service = new AgentEvidenceService(arena), now = day(78) + 2 * HOUR, view = service.portfolios(now)[0]!;
  expect(view.observations).toBe(weekdayCloses(day(1), day(78)).length);
  expect(view.confirmed).toBe(false);
  expect(view.t).toBeCloseTo(judgedT(statsOf(view.curve.map((p, i, a) => (1 + p.value) / (1 + (a[i - 1]?.value ?? 0)) - 1)), arena.portfolios.backtest('half', now)), 9);
  const verdict = (t: number, monkey: number | null) => assessPortfolio({ ...view, t, monkey }).verdict;
  expect(verdict(1.9, null)).toBe(VERDICT.KEEP);
  expect(verdict(2.4, null)).toBe(VERDICT.CANDIDATE);
  expect(verdict(2.4, 2.5)).toBe(VERDICT.KEEP);                            // the monkeys judged as a family did better
  expect(verdict(2.4, 1)).toBe(VERDICT.CANDIDATE);
  expect(assessPortfolio({ ...view, confirmed: true }).reason).toContain('one claim made in advance');
  db.db.close();
});

test('the deployed roster declares the arena portfolio; a malformed rule is a roster problem', async () => {
  const { agents } = await loadAgents(), roster = loadRoster();
  expect(roster.portfolios).toEqual({ 'backtest-half': { name: 'Arena portfolio', declared: '2026-11-25', minBacktestSharpe: 0.5 } });
  expect(rosterProblems(roster, agents)).toEqual([]);
  const bad = rosterProblems({ ...roster, portfolios: { 'Bad Id': { name: '', declared: 'today', minBacktestSharpe: NaN } } }, agents);
  expect(bad).toHaveLength(3);
});
