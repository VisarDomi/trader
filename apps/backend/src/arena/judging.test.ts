import { expect, test } from 'bun:test';
import { ArenaDB, RUN_KIND } from './db.ts';
import { AgentEvidenceService } from './evidence.ts';
import { Judging, agreementZ, cashStats, confirmedSet, dailyStats, eValue, judgedT, normalCdf, pool, statsOf, tAt, weekdayCloses } from './judging.ts';
import { LIFECYCLE } from '../engine/policy.ts';
import { backtestRunId, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';
import { defineAgent } from '../sdk/index.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { Arena } from './arena.ts';

const DAY = 86_400_000, HOUR = 3_600_000;
/** Monday 2026-10-05 00:00 UTC. */
const MON = Date.UTC(2026, 9, 5);
const day = (n: number) => MON + n * DAY;

test('one observation per weekday: weekend changes belong to Monday', () => {
  // From Monday noon through the second Friday: closes at the starts of Tue…Sat, twice.
  const closes = weekdayCloses(MON + 12 * HOUR, day(12));
  expect(closes.map(t => (t - MON) / DAY)).toEqual([1, 2, 3, 4, 5, 8, 9, 10, 11, 12]);
  expect(weekdayCloses(day(5), day(7))).toEqual([]);                       // Saturday and Sunday close nothing
  expect(weekdayCloses(day(1), day(1))).toEqual([]);                       // strictly after
  // A live curve: flat, then +10% on Saturday. It shows in Monday's observation (closing Tuesday 00:00).
  const live = [{ t: day(1), equity: 100 }, { t: day(5), equity: 100 }, { t: day(6), equity: 110 }, { t: day(8), equity: 110 }];
  const s = dailyStats(live, MON, day(8), 100, false);
  expect(s.n).toBe(6);
  expect(s.mean).toBeCloseTo(0.1 / 6, 12);
  // A missing midnight carries the last equity forward: nothing is invented.
  expect(dailyStats([{ t: day(1) - HOUR, equity: 105 }], MON, day(3), 100, false)).toMatchObject({ n: 3 });
  expect(dailyStats([{ t: day(1) - HOUR, equity: 105 }], MON, day(3), 100, false).mean).toBeCloseTo(0.05 / 3, 12);
  // A window that starts later (after a demotion) starts from the equity held then, not from the starting capital.
  expect(dailyStats(live, day(6) + HOUR, day(9), 100, false)).toEqual({ n: 2, mean: 0, sd: 0 });
});
test('a backtest curve is dated by the day each point closes', () => {
  // Monday closes at 102, Tuesday at 102, Wednesday at 96.9: the same three returns a live curve would give.
  const curve = [{ t: day(0), equity: 102 }, { t: day(1), equity: 102 }, { t: day(2), equity: 96.9 }];
  const s = dailyStats(curve, MON, day(3), 100, true);
  expect(s.n).toBe(3);
  expect(s.mean).toBeCloseTo((0.02 + 0 - 0.05) / 3, 12);
  expect(s.sd).toBeCloseTo(Math.sqrt(((0.02 + 0.01) ** 2 + 0.01 ** 2 + (-0.05 + 0.01) ** 2) / 2), 12);
});
test('the t-statistic takes its volatility from the backtest when the forward record has shown less', () => {
  // Thirty days of +0.5% without a loss: on its own volatility the t is enormous.
  const steady = { n: 30, mean: 0.005, sd: 0.001 };
  expect(judgedT(steady)).toBeCloseTo(0.005 / 0.001 * Math.sqrt(30), 9);
  // Its backtest lost 30% on some days: daily volatility 5%. The same record is unremarkable.
  expect(judgedT(steady, { n: 700, mean: -0.001, sd: 0.05 })).toBeCloseTo(0.005 / 0.05 * Math.sqrt(30), 9);
  // A calmer backtest never lowers the forward record's own volatility.
  expect(judgedT(steady, { n: 700, mean: 0, sd: 0.0001 })).toBe(judgedT(steady));
  expect(judgedT({ n: 1, mean: 0.1, sd: 0 })).toBe(0);
  expect(judgedT({ n: 30, mean: 0.01, sd: 0 })).toBe(0);
  // Forward mean against the backtest's, in standard errors of the difference.
  expect(agreementZ({ n: 100, mean: 0.003, sd: 0.01 }, { n: 400, mean: 0.001, sd: 0.01 })).toBeCloseTo(0.002 / Math.sqrt(0.0001 / 100 + 0.0001 / 400), 9);
  expect(agreementZ(steady, null)).toBeNull();
  expect(agreementZ({ n: 1, mean: 0, sd: 0 }, { n: 400, mean: 0, sd: 0.01 })).toBeNull();
});
test('the e-value sets a bar that may be looked at every day: about 3.7 after a month, 3.0 after a year', () => {
  expect(normalCdf(0)).toBeCloseTo(0.5, 7);
  expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
  expect(eValue(0, 250)).toBeLessThan(1);                                  // no evidence either way
  expect(eValue(-3, 250)).toBeLessThan(eValue(0, 250));                    // losing is never evidence of an edge
  expect(eValue(5, 1)).toBe(1);
  const alone = 1 / LIFECYCLE.ALONE_ALPHA;
  expect(tAt(alone, 30)).toBeCloseTo(3.68, 2);
  expect(tAt(alone, 126)).toBeCloseTo(3.08, 2);
  expect(tAt(alone, 252)).toBeCloseTo(3.04, 2);
  expect(tAt(alone, 1260)).toBeCloseTo(3.16, 2);
  // The first of 844 records at a 10% false discovery rate needs far more.
  expect(tAt(844 / LIFECYCLE.CONFIRM_FDR, 252)).toBeCloseTo(4.61, 2);
  expect(eValue(tAt(8440, 504), 504)).toBeCloseTo(8440, -1);
});
test('confirmed records clear the bar for everything tried, and confirm each other', () => {
  // 1,000 trials at 10%: one record alone needs e ≥ 10,000; two need 5,000 each; three 3,333 each.
  expect(confirmedSet([{ id: 'a', e: 9_999 }], 1000, 0.1)).toEqual({ ids: new Set(), needs: 10_000 });
  expect([...confirmedSet([{ id: 'a', e: 10_000 }, { id: 'b', e: 4_000 }], 1000, 0.1).ids]).toEqual(['a']);
  const three = confirmedSet([{ id: 'a', e: 6_000 }, { id: 'b', e: 3_400 }, { id: 'c', e: 5_000 }, { id: 'd', e: 40 }], 1000, 0.1);
  expect([...three.ids].sort()).toEqual(['a', 'b', 'c']);                  // none would pass alone
  expect(three.needs).toBe(2_500);
  expect(confirmedSet([], 1000, 0.1).ids.size).toBe(0);
});
test('Capital cash is counted on the weekday each deal closed', () => {
  const deals = [{ close_time: day(0) + 5 * HOUR, pnl: 50 }, { close_time: day(2) + HOUR, pnl: -20 }, { close_time: day(5) + HOUR, pnl: 30 }, { close_time: null, pnl: 999 }];
  // Mon +50, Tue 0, Wed −20, Thu 0, Fri 0, then Monday holds Saturday's close.
  const s = cashStats(deals, MON, day(8));
  expect(s.n).toBe(6);
  expect(s.mean).toBeCloseTo(60 / 6, 12);
  expect(cashStats(deals, MON, day(8) - 1).n).toBe(5);                     // Monday is not closed yet
  expect(judgedT(cashStats([{ close_time: day(0) + HOUR, pnl: -10 }, { close_time: day(1) + HOUR, pnl: -12 }, { close_time: day(2) + HOUR, pnl: -8 }], MON, day(3)))).toBeLessThan(-5);
});

test('a family is the average of its members at equal risk, over the members running each day', () => {
  // A calm member (±1%) and a wild one (±10%) on opposite days, each scaled by 1 / its volatility: both count alike.
  const calm = { closes: [day(1), day(2), day(3), day(4)], returns: [0.01, -0.01, 0.01, -0.01], scale: 1 / 0.01 };
  const wild = { closes: [day(1), day(2), day(3), day(4)], returns: [-0.1, 0.1, -0.1, 0.1], scale: 1 / 0.1 };
  expect(pool([calm, wild]).values).toEqual([0, 0, 0, 0]);
  // Two members with the same days and the same sign add nothing a single one does not say: the t does not grow.
  const twin = pool([calm, { ...calm }]);
  expect(twin.values).toEqual([1, -1, 1, -1]);
  // A member that joined later, and one retired earlier, count on the days they ran.
  const late = { closes: [day(3), day(4)], returns: [0.03, 0.03], scale: 1 / 0.01 }, gone = { closes: [day(1)], returns: [0.05], scale: 1 / 0.01 };
  const p = pool([calm, late, gone]);
  expect(p.closes).toEqual([day(1), day(2), day(3), day(4)]);
  expect(p.values).toEqual([(1 + 5) / 2, -1, (1 + 3) / 2, (-1 + 3) / 2]);
  expect(pool([]).values).toEqual([]);
  // Members on different days add evidence: ten members each winning on its own day beat any one of them.
  const one = (d: number) => ({ closes: Array.from({ length: 10 }, (_, i) => day(i + 1)).filter(t => weekdayCloses(MON, day(12)).includes(t)), returns: [] as number[], scale: 1 });
  const members = Array.from({ length: 8 }, (_, k) => { const m = one(k); m.returns = m.closes.map((_, i) => (i === k ? 0.02 : -0.001)); return m; });
  const alone = judgedT(statsOf(members[0]!.returns)), together = judgedT(statsOf(pool(members).values));
  expect(together).toBeGreaterThan(alone * 2);
});

const EPIC = 'US500';
function agent(id: string, slug = id, variant: string | null = null): LoadedAgent {
  return { id, slug, variant, file: '', source: '', codeHash: 'hash', params: {}, def: defineAgent({ name: slug, description: id, instruments: [EPIC], timeframe: '1h', params: {}, onBar() {} }) };
}
/** A forward record with one stored equity point per midnight, growing by `daily` each weekday. */
function record(db: ArenaDB, name: string, days: number, daily: (weekdayIndex: number) => number, trades = 20) {
  const id = `demo:${name}:${EPIC}:x20:hash`;
  db.upsertAgent(agent(name), MON);
  db.createDemoRun({ id, agentId: name, codeHash: 'hash', epic: EPIC, leverage: 20, capital: 10_000, params: {}, now: MON });
  let equity = 10_000, w = 0;
  for (const close of weekdayCloses(MON, day(days))) db.upsertEquity(id, close, (equity *= 1 + daily(w++)));
  db.db.run('UPDATE runs SET metrics=? WHERE id=?', [JSON.stringify({ trades, winRate: 0.5 }), id]);
  return id;
}
/** The same-code backtest of a record: 500 weekdays alternating ±`swing` around `drift`. */
function backtest(db: ArenaDB, name: string, drift: number, swing: number) {
  const id = backtestRunId(PRIMARY_BACKTEST_WINDOW_ID, name, EPIC, 20), start = Date.UTC(2024, 0, 1);
  db.createDemoRun({ id, agentId: name, codeHash: 'hash', epic: EPIC, leverage: 20, capital: 10_000, params: {}, now: start });
  db.db.run('UPDATE runs SET kind=?,window_id=?,started_at=?,metrics=? WHERE id=?', [RUN_KIND.BACKTEST, PRIMARY_BACKTEST_WINDOW_ID, start, JSON.stringify({ trades: 300, winRate: 0.5 }), id]);
  let equity = 10_000, w = 0;
  for (const close of weekdayCloses(start, start + 700 * DAY)) db.upsertEquity(id, close - DAY, (equity *= 1 + drift + (w++ % 2 ? swing : -swing)));
}

test('a live record is read one closed weekday at a time, an hour after its midnight', () => {
  const db = new ArenaDB(':memory:'), id = record(db, 'steady', 4, i => (i % 2 ? 0.02 : -0.01)), judging = new Judging(db), run = db.run(id)!;
  let reads = 0;
  const equityAt = db.equityAt.bind(db);
  db.equityAt = (runId, t) => { reads++; return equityAt(runId, t); };
  // Friday 00:30: Thursday's midnight point may not be written yet; three days are closed.
  expect(judging.forward(run, run.started_at, day(4) + HOUR / 2).n).toBe(3);
  expect(reads).toBe(3);
  judging.forward(run, run.started_at, day(4) + HOUR - 1);
  expect(reads).toBe(3);                                                   // nothing new: no reads
  const s = judging.forward(run, run.started_at, day(4) + HOUR);
  expect(s.n).toBe(4);
  expect(reads).toBe(4);                                                   // only the new day
  expect(s.mean).toBeCloseTo((-0.01 + 0.02 - 0.01 + 0.02) / 4, 12);
  // A window from a demotion on Wednesday noon starts from the equity held then.
  const since = day(2) + 12 * HOUR;
  expect(judging.forward(run, since, day(4) + HOUR)).toMatchObject({ n: 2 });
  expect(judging.forward(run, since, day(4) + HOUR).mean).toBeCloseTo((-0.01 + 0.02) / 2, 12);
  db.db.close();
});

test('the arena measures every live record, the instrument\'s luckiest monkey, and confirms only what clears every bar', () => {
  const db = new ArenaDB(':memory:'), now = day(70) + 2 * HOUR;
  // Fifty weekdays. `strong`: +1% a day with a ±0.5% wobble (t ≈ 14). `lucky`: the same record, but its backtest loses.
  // `calm`: steady +0.5% with no loss yet, while its backtest swings 6% a day. `flat`: nothing. `few`: strong, 3 trades.
  const wobble = (i: number) => 0.01 + (i % 2 ? 0.005 : -0.005);
  const ids = { strong: record(db, 'strong', 70, wobble), lucky: record(db, 'lucky', 70, wobble), calm: record(db, 'calm', 70, () => 0.005),
    flat: record(db, 'flat', 70, i => (i % 2 ? 0.004 : -0.004)), few: record(db, 'few', 70, wobble, 3), monkey: record(db, 'random-baseline', 70, i => 0.001 + (i % 2 ? 0.01 : -0.01)) };
  backtest(db, 'strong', 0.009, 0.006); backtest(db, 'lucky', -0.002, 0.006); backtest(db, 'calm', 0, 0.06); backtest(db, 'flat', 0, 0.004); backtest(db, 'few', 0.009, 0.006);
  // 300 retired records count as trials: 305 strategy records were ever started.
  for (let i = 0; i < 300; i++) db.createDemoRun({ id: `demo:old${i}:${EPIC}:x20:hash`, agentId: `old${i}`, codeHash: 'hash', epic: EPIC, leverage: 20, capital: 10_000, params: {}, now: MON });
  db.db.run("UPDATE runs SET retired=1 WHERE id LIKE 'demo:old%'");
  const service = new AgentEvidenceService({ db, tracked: new Map() } as unknown as Arena);
  const clock = (id: string) => service.forRun(db.run(id)!, now).clock!;
  const strong = clock(ids.strong);
  expect(strong).toMatchObject({ since: MON, trades: 20, observations: 50, trials: 305, confirmed: true });
  expect(strong.days).toBeCloseTo(70 + 2 / 24, 9);
  expect(strong.t).toBeGreaterThan(10);
  expect(strong.life).toMatchObject({ observations: 50, t: strong.t });
  expect(strong.monkey).toBeCloseTo(clock(ids.monkey).t, 12);
  expect(strong.monkey!).toBeLessThan(1.5);
  expect(strong.backtestZ!).toBeLessThan(LIFECYCLE.AGREE_Z);
  // Alone it would need about 3.4; with 305 tried and nothing else confirmed, more.
  expect(strong.aloneAt!).toBeCloseTo(tAt(40, 50), 9);
  expect(strong.confirmAt!).toBeCloseTo(tAt(305 / 0.1, 50), 9);
  expect(strong.confirmAt!).toBeGreaterThan(strong.aloneAt! + 1);
  // The same forward record against a losing backtest does not agree with it: never confirmed, whatever its t.
  expect(clock(ids.lucky)).toMatchObject({ confirmed: false });
  expect(clock(ids.lucky).t).toBeCloseTo(strong.t, 9);
  expect(clock(ids.lucky).backtestZ!).toBeGreaterThan(LIFECYCLE.AGREE_Z);
  // Steady small wins with nothing lost yet: the backtest's volatility is used, and the t is ordinary.
  expect(clock(ids.calm).t).toBeCloseTo(0.005 / 0.06 * Math.sqrt(50), 1);
  expect(clock(ids.calm).confirmed).toBe(false);
  expect(clock(ids.flat).confirmed).toBe(false);
  // Under the floor of ten trades nothing is confirmed, and a second record would need half as much.
  expect(clock(ids.few)).toMatchObject({ confirmed: false, trades: 3 });
  expect(clock(ids.few).confirmAt!).toBeCloseTo(tAt(305 / (0.1 * 2), 50), 9);
  // Controls are measured but never offered; Capital rows carry the virtual record's clock.
  expect(clock(ids.monkey)).toMatchObject({ confirmed: false, trials: 305 });
  expect(service.forCapital({ runId: ids.strong, epic: EPIC, metrics: null } as any, 0, false)!.clock).toMatchObject({ confirmed: true, observations: 50 });
  db.db.close();
});

test('families are judged as one record: files joined by the roster, retired runs on the days they ran, confirmed among families', () => {
  const db = new ArenaDB(':memory:'), now = day(70) + 2 * HOUR;
  // Five slow night variants, each with 2 or 3 trades: none can be judged alone. Three belong to one file, two to others.
  const win = (k: number) => (i: number) => (i % 5 === k ? 0.03 : -0.0005);
  const add = (id: string, slug: string, variant: string | null, daily: (i: number) => number, trades: number, epic = EPIC) => {
    const run = `demo:${id}:${epic}:x20:hash`;
    db.upsertAgent({ ...agent(id, slug, variant), def: defineAgent({ name: slug, description: id, instruments: [epic], timeframe: '1h', params: {}, onBar() {} }) }, MON);
    db.createDemoRun({ id: run, agentId: id, codeHash: 'hash', epic, leverage: 20, capital: 10_000, params: {}, now: MON });
    let equity = 10_000, w = 0;
    for (const close of weekdayCloses(MON, day(70))) db.upsertEquity(run, close, (equity *= 1 + daily(w++)));
    db.db.run('UPDATE runs SET metrics=? WHERE id=?', [JSON.stringify({ trades, winRate: 0.5 }), run]);
    const bt = backtestRunId(PRIMARY_BACKTEST_WINDOW_ID, id, epic, 20), start = Date.UTC(2024, 0, 1);
    db.createDemoRun({ id: bt, agentId: id, codeHash: 'hash', epic, leverage: 20, capital: 10_000, params: {}, now: start });
    db.db.run('UPDATE runs SET kind=?,window_id=?,started_at=?,metrics=? WHERE id=?', [RUN_KIND.BACKTEST, PRIMARY_BACKTEST_WINDOW_ID, start, JSON.stringify({ trades: 300, winRate: 0.5 }), bt]);
    let e = 10_000; w = 0;
    for (const close of weekdayCloses(start, start + 700 * DAY)) db.upsertEquity(bt, close - DAY, (e *= 1 + daily(w++)));
    return run;
  };
  const ids = [add('night/a', 'night', 'a', win(0), 3), add('night/b', 'night', 'b', win(1), 2), add('night/c', 'night', 'c', win(2), 2, 'US100'), add('night-old', 'night-old', null, win(3), 2), add('night-v2', 'night-v2', null, win(4), 3)];
  const other = add('trend', 'trend', null, i => (i % 2 ? 0.004 : -0.004), 40), monkey = add('random-baseline/m', 'random-baseline', 'm', i => (i % 2 ? 0.01 : -0.0101), 60);
  // One member was retired after its second week; it still counts on those days.
  db.db.run('UPDATE runs SET retired=1,ended_at=? WHERE id=?', [day(14), ids[4]!]);
  const roster = { families: { night: { name: 'Night', slugs: ['night', 'night-old', 'night-v2'] } } };
  const service = new AgentEvidenceService({ db, tracked: new Map(), roster } as unknown as Arena);
  const clock = (id: string) => service.forRun(db.run(id)!, now).clock!, view = (id: string) => service.forRun(db.run(id)!, now).family;
  const alone = clock(ids[0]!), family = view(ids[0]!)!;
  // The family sits beside the record's clock, not in it: the record's own numbers are what they were.
  expect(alone).not.toHaveProperty('family');
  // Alone: three trades, early for years. Together: 12 trades on two markets, each member winning on its own days.
  expect(alone.trades).toBe(3);
  expect(family).toMatchObject({ id: 'night', name: 'Night', records: 4, everRecords: 5, markets: 2, trades: 12, since: MON, observations: 50, trials: 2 });
  expect(family.t).toBeGreaterThan(alone.t * 1.8);
  expect(view(ids[3]!)).toMatchObject({ id: 'night', t: family.t, e: family.e, records: 4 });
  // The monkeys judged as one family are the yardstick; the other file is its own family, named without its variant.
  expect(family.monkey).toBeCloseTo(clock(monkey).life.t, 6);
  expect(view(monkey)).toBeUndefined();
  expect(view(other)).toMatchObject({ id: 'trend', name: 'trend', records: 1, everRecords: 1, trials: 2 });
  expect(view(other)!.member).toBeUndefined();                              // nothing to stand among
  // Where a record stands: the four running members have almost the same t, so the family reads each at their average.
  const standing = family.member!;
  expect(standing).toMatchObject({ of: 4, kept: 0 });
  expect(standing.t).toBeCloseTo(alone.life.t, 12);
  expect(standing.spread).toBeLessThan(1);
  expect(standing.estimate).toBeCloseTo(standing.average, 12);
  expect([0, 1, 2, 3].map(i => view(ids[i]!)!.member!.rank).sort()).toEqual([1, 2, 3, 4]);
  expect(service.familyOf({ agent_id: 'night/a' })).toEqual({ id: 'night', name: 'Night' });
  // Confirmed among families: two tried, so the first needs e ≥ 20.
  expect(family.confirmAt!).toBeCloseTo(tAt(2 / LIFECYCLE.CONFIRM_FDR, 50), 9);
  expect(family.confirmed).toBe(family.e >= 20 && family.backtestZ! <= LIFECYCLE.AGREE_Z);
  expect(family.confirmed).toBe(true);
  // Without the roster each file stands alone: the three-variant file is a family of three, the others of one.
  const plain = new AgentEvidenceService({ db, tracked: new Map() } as unknown as Arena);
  expect(plain.forRun(db.run(ids[0]!)!, now).family).toMatchObject({ id: 'night', name: 'night', records: 3, everRecords: 3, trials: 4 });
  expect(plain.forRun(db.run(ids[3]!)!, now).family).toMatchObject({ id: 'night-old', records: 1 });
  // A family whose members really differ: a strong winner, a flat one and a loser spread far more than chance (1),
  // so most of the winner's lead over the average is kept; it is still read below its own t.
  const mixed = [add('mix/up', 'mix', 'up', i => 0.01 + (i % 2 ? 0.004 : -0.004), 30), add('mix/flat', 'mix', 'flat', i => (i % 2 ? 0.004 : -0.004), 30), add('mix/down', 'mix', 'down', i => -0.01 + (i % 2 ? 0.004 : -0.004), 30)];
  const fresh = new AgentEvidenceService({ db, tracked: new Map(), roster } as unknown as Arena);
  const [up, flat, down] = mixed.map(id => fresh.forRun(db.run(id)!, now).family!.member!);
  expect([up!.rank, flat!.rank, down!.rank]).toEqual([1, 2, 3]);
  expect(up!.spread).toBeGreaterThan(5);
  expect(up!.kept).toBeCloseTo(1 - 1 / up!.spread ** 2, 12);
  expect(up!.estimate).toBeLessThan(up!.t);
  expect(up!.estimate).toBeGreaterThan(up!.average + 0.9 * (up!.t - up!.average));
  expect(down!.estimate).toBeGreaterThan(down!.t);                          // pulled toward the average from below too
  db.db.close();
});
