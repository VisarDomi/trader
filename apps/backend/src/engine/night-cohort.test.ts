import { test, expect } from 'bun:test';
import { loadAgents } from './loader';
import { loadRoster, planRuns, rosterProblems } from './roster';
import { explain, supportedVersions, atLocal } from '../strategy/evidence';
import { reconstructedState } from '../strategy/history';
import { IndicatorCache, makeIndicators } from '../sdk/ta';
import type { Bar } from '../sdk/types';

test('unified Visar Night family: 8 symmetric variants + 2 controls across US500 and US100, all admitted', async () => {
  const { agents, errors } = await loadAgents();
  expect(errors).toHaveLength(0);
  const cohort = agents.filter(a => a.slug === 'visar-night' || a.slug === 'visar-night-control');
  expect(cohort).toHaveLength(10);
  const controls = cohort.filter(a => a.slug === 'visar-night-control');
  expect(controls).toHaveLength(2);

  const roster = loadRoster();
  expect(rosterProblems(roster, agents)).toEqual([]);
  const runs = planRuns(cohort, roster).runs;
  expect(runs).toHaveLength(20);
  for (const r of runs) {
    expect(roster.demoAdmissions?.[`${r.agent.id}:${r.epic}@${r.leverage}`]?.codeHash).toBe(r.agent.codeHash);
  }

  const by = new Map(runs.map(r => [`${r.agent.id}:${r.epic}`, r]));
  const diff = (a: any, b: any) => {
    const x = { ...a.agent.params, tier: a.leverage };
    const y = { ...b.agent.params, tier: b.leverage };
    return Object.keys({ ...x, ...y }).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k])).sort();
  };
  const anyDay = ['maxRangePct', 'maxRetraceShare', 'minBodyShare', 'minDirectionalShare', 'minEfficiency', 'trendPct'];

  for (const epic of ['US500', 'US100'] as const) {
    const base = by.get(`visar-night/midday-20:${epic}`)!;
    expect(base.leverage).toBe(20);
    expect(base.agent.params.lossPct).toBe(50);
    expect(base.agent.params.profitPct).toBe(0);
    expect(diff(by.get(`visar-night/midday-200:${epic}`)!, base)).toEqual(['tier']);
    expect(diff(by.get(`visar-night/full-day-20:${epic}`)!, base)).toEqual(['sessionEnd', 'sessionStart']);
    expect(diff(by.get(`visar-night/full-day-200:${epic}`)!, by.get(`visar-night/midday-200:${epic}`)!)).toEqual(['sessionEnd', 'sessionStart']);
    expect(diff(by.get(`visar-night/loose-body-20:${epic}`)!, base)).toEqual(['minBodyShare']);
    expect(diff(by.get(`visar-night/no-pullback-20:${epic}`)!, base)).toEqual(['pullback']);
    expect(diff(by.get(`visar-night/any-day-20:${epic}`)!, base)).toEqual(anyDay);
    expect(diff(by.get(`visar-night/every-night-20:${epic}`)!, base)).toEqual([...anyDay, 'pullback'].sort());
    for (const v of ['always-long', 'random-direction']) {
      expect(diff(by.get(`visar-night-control/${v}:${epic}`)!, base)).toEqual(['direction']);
    }
  }
});

test('entry callbacks enforce symmetric exact gap boundaries, NY clocks, pullback switch, and one attempt', async () => {
  const { agents } = await loadAgents();
  const base = agents.find(a => a.id === 'visar-night/midday-20')!;
  const gapParams = { ...base.params, minPullbackBp: 15 };
  for (const [direction, bid, expected] of [
    [1, 9985, 'long'], [1, 9986, null], [-1, 10015, 'short'], [-1, 10014, null],
    [1, 10000, null], [1, 10015, null], [-1, 9985, null],
  ] as const) {
    const time = Date.UTC(2024, 0, 9, 2, 27), orders: any[] = [];
    const ctx: any = {
      state: { ...base.def.init!(gapParams), referenceDate: '2024-01-08', reference: 10000, direction },
      params: gapParams, time,
      bar: { time: time - 60000, open: bid, high: bid, low: bid, close: bid, spread: 1, volume: 1 },
      isWarmup: false, position: null, balance: 10000, leverage: 50,
      instrument: { typicalSpread: 1, pricePrecision: 1 },
      buy: (o: any) => orders.push({ side: 'long', ...o }),
      sell: (o: any) => orders.push({ side: 'short', ...o }),
    };
    base.def.onBar!(ctx);
    base.def.onBar!(ctx);
    expect(orders).toHaveLength(expected ? 1 : 0);
    if (expected) {
      expect(orders[0].side).toBe(expected);
      expect(orders[0].validUntil).toBe(time + 60000);
      expect(orders[0].closeAt).toBe(time + 300 * 60000);
      expect(orders[0].reason).toContain('15bp');
    }
  }

  // No-pullback trades continuation nights as well as pullbacks, but still skips neutral days.
  const free = agents.find(a => a.id === 'visar-night/no-pullback-20')!;
  const runNight = (direction: number, bid: number) => {
    const time = Date.UTC(2024, 0, 9, 2, 27), orders: any[] = [];
    const ctx: any = {
      state: { ...free.def.init!(free.params), referenceDate: '2024-01-08', reference: 10000, direction },
      params: free.params, time, random: () => 0.25,
      bar: { time: time - 60000, open: bid, high: bid, low: bid, close: bid, spread: 1, volume: 1 },
      isWarmup: false, position: null, balance: 10000, leverage: 20,
      instrument: { typicalSpread: 1, pricePrecision: 1 },
      buy: (o: any) => orders.push({ side: 'long', ...o }),
      sell: (o: any) => orders.push({ side: 'short', ...o }),
    };
    free.def.onBar!(ctx);
    return orders.map(o => o.side);
  };
  expect(runNight(1, 10050)).toEqual(['long']);
  expect(runNight(1, 9950)).toEqual(['long']);
  expect(runNight(-1, 9950)).toEqual(['short']);
  expect(runNight(-1, 10000)).toEqual(['short']);
  expect(runNight(0, 10050)).toEqual([]);
});

test('strategy evidence uses the midday window and variant-specific gap headroom on unified visar-night', async () => {
  const { agents } = await loadAgents();
  const a = agents.find(x => x.id === 'visar-night/midday-20')!;
  const p = { ...(a.params as any), minPullbackBp: 15 };
  const start = atLocal('2026-11-02', 'America/New_York', 570), bars: Bar[] = [];
  for (let i = 0; i < 390; i++) {
    const open = 100 + i * 0.002, close = open + 0.002;
    bars.push({ time: start + i * 60000, open, high: i < 60 || i >= 360 ? 150 : close + 0.0001, low: i < 60 || i >= 360 ? 50 : open - 0.0001, close, volume: 1, spread: 0.01 });
  }
  const time = atLocal('2026-11-02', p.timeZone, 1287);
  expect(p.timeZone).toBe('America/New_York');
  bars.push({ time: time - 60000, open: 100.6, high: 100.6, low: 100.5, close: 100.5, volume: 1, spread: 0.01 });
  const state = reconstructedState(a.slug, bars, time, p), ta = makeIndicators(new IndicatorCache(bars));
  const x = explain(a.id, supportedVersions[a.slug]!.hash, { bars, bar: bars.at(-1)!, ta, tf: () => ({ bars, ta }), params: p, state, time, timeframe: '1m', leverage: 20, equity: 10000, position: null, forecast: null, tick: null }, 'long', {}, 'reconstructed');
  expect(x.panels[0]!.series[0]!.points).toHaveLength(21);
  expect(x.panels[0]!.from).toBe(start + 60 * 60000);
  expect(x.panels[0]!.through).toBe(start + 360 * 60000);
  expect(x.gates.find(g => g.label === 'Observed minutes')?.value).toBe(300);
  expect(x.gates.find(g => g.label === 'Minimum opposite-side bid gap')).toMatchObject({ limit: 15, op: '>=', state: 'pass' });
  expect(x.panels[1]!.guides.some(g => g.label === '15bp entry boundary')).toBe(true);
});
