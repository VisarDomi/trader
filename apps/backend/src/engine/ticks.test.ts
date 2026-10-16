import { expect, test } from 'bun:test';
import { defineAgent, type AgentDefinition } from '../sdk/index.ts';
import { EXIT_REASON } from '../sdk/types.ts';
import { TICK_SOURCE, type Tick } from './ticks.ts';
import { MarketEngine } from './market.ts';
import { getInstrument } from './instruments.ts';
import { syntheticTicks } from './synthetic-ticks.ts';
import type { LoadedAgent } from './loader.ts';
import { VirtualVenue, type CapitalMarket } from './venue.ts';
import fixtures from './fixtures/capital-markets.json';
import { MINUTE_MS } from './clock.ts';
const EPIC = 'US500',
  T = Date.UTC(2026, 9, 16, 10);
function agent(def: Partial<AgentDefinition> = {}): LoadedAgent {
  const d = defineAgent({
    name: 'tick-test',
    description: 'tick runtime fixture',
    instruments: [EPIC],
    timeframe: '1m',
    params: {},
    warmup: 0,
    onTick() {},
    ...def,
  });
  return { id: 'tick-test', slug: 'tick-test', variant: null, file: '', def: d, params: {}, codeHash: 'test', source: '' };
}
function quote(offset: number, bid: number, extra: Partial<Tick> = {}): Tick {
  return { time: T + offset, receivedAt: T + offset, bid, ask: bid + 1, source: TICK_SOURCE.RECORDED, ...extra };
}
function setup(a: LoadedAgent) {
  const e = new MarketEngine({ ...getInstrument(EPIC) });
  return { e, r: e.addRun({ runId: 'fixture', agent: a, capital: 10_000, leverage: 20, checkStopsOnCandles: false }) };
}
test('tick-only agent trades before any closed bar, gets current bid/ask and fill callbacks, and target wins when reached first', () => {
  const seen: unknown[] = [],
    fills: unknown[] = [];
  const { e, r } = setup(
    agent({
      onTick(ctx) {
        seen.push({ time: ctx.time, bar: ctx.bar, source: ctx.tick.source, bid: ctx.tick.bid });
        if (ctx.ticks.length === 1) ctx.buy({ size: 1, stopLoss: 95, takeProfit: 108 });
      },
      onFill(ctx, fill) {
        fills.push({ bar: ctx.bar, kind: fill.kind, time: ctx.time });
      },
    }),
  );
  e.processTick(quote(0, 100));
  e.processTick(quote(1000, 109));
  e.processTick(quote(2000, 90));
  expect(r.trades).toHaveLength(1);
  expect(r.trades[0]).toMatchObject({
    entryPrice: 101,
    exitPrice: 109,
    exitReason: EXIT_REASON.TAKE_PROFIT,
    entryTime: T,
    exitTime: T + 1000,
  });
  expect(fills).toEqual([
    { bar: null, kind: 'open', time: T },
    { bar: null, kind: 'close', time: T + 1000 },
  ]);
  expect(seen).toHaveLength(3);
});
test('each repeated delivered quote is a tick; replayed IDs, late source quotes, crossed quotes and future/stale ticks are filtered', () => {
  const { e, r } = setup(
    agent({
      onTick(ctx) {
        ctx.state.n = Number(ctx.state.n ?? 0) + 1;
      },
    }),
  );
  const q = quote(0, 100, { journalId: 'journal', sequence: 1 });
  expect(e.processTick(q)).toBe(true);
  expect(e.processTick(q)).toBe(false);
  expect(e.processTick({ ...q, sequence: 2 })).toBe(true);
  expect(e.processTick(quote(-1, 100))).toBe(false);
  expect(e.processTick(quote(1000, 100, { ask: 99 }))).toBe(false);
  expect(e.processTick(quote(2000, 100, { receivedAt: T }))).toBe(false);
  expect(e.processTick(quote(2000, 100, { receivedAt: T + 40_000 }))).toBe(false);
  expect(r.state.n).toBe(2);
});
test('synthetic paths are deterministic, lazy, bounded by OHLC, hit every extreme and preserve the close without exposing it early', () => {
  const c = { time: T, open: 100, high: 110, low: 90, close: 105, spread: 1, volume: 160 };
  const ticks = [...syntheticTicks(EPIC, c, { seed: 7, precision: 1 })];
  expect(ticks).toEqual([...syntheticTicks(EPIC, c, { seed: 7, precision: 1 })]);
  expect(ticks).not.toEqual([...syntheticTicks(EPIC, c, { seed: 8, precision: 1 })]);
  expect(ticks[0]!.bid).toBe(c.open);
  expect(ticks.at(-1)!.bid).toBe(c.close);
  expect(Math.min(...ticks.map((t) => t.bid))).toBe(c.low);
  expect(Math.max(...ticks.map((t) => t.bid))).toBe(c.high);
  expect(ticks.every((t, i) => t.source === TICK_SOURCE.SYNTHETIC && t.time < T + MINUTE_MS && (!i || t.time > ticks[i - 1]!.time))).toBe(
    true,
  );
  const { e } = setup(
    agent({
      onTick(ctx) {
        expect(ctx.bar).toBeNull();
        expect(ctx.bars).toHaveLength(0);
      },
      onBar(ctx) {
        expect(ctx.bars.at(-1)).toBe(ctx.bar);
        expect(ctx.bar).toEqual(c);
      },
    }),
  );
  for (const q of ticks) e.processTick(q);
  e.processClock(T + MINUTE_MS);
  expect(e.takeCompletedCandles()).toEqual([c]);
});
test('clock closes quiet partial higher-timeframe bars before the next price arrives, with no invented empty minutes', () => {
  const closed: number[] = [];
  const { e } = setup(
    agent({
      timeframe: '5m',
      onTick() {},
      onBar(ctx) {
        closed.push(ctx.bar.time);
        expect(ctx.bars.at(-1)).toBe(ctx.bar);
      },
    }),
  );
  e.processTick(quote(0, 100));
  e.processClock(T + MINUTE_MS);
  e.processClock(T + 5 * MINUTE_MS);
  expect(closed).toEqual([T]);
  e.processClock(T + 20 * MINUTE_MS);
  expect(closed).toEqual([T]);
  e.processTick(quote(20 * MINUTE_MS, 120));
  e.processClock(T + 25 * MINUTE_MS);
  expect(closed).toEqual([T, T + 20 * MINUTE_MS]);
});
test('tick decisions share durable delayed execution: no fill before due time, and exact delivered bid/ask afterward', () => {
  let now = T;
  const instrument = { ...getInstrument(EPIC) },
    venue = new VirtualVenue(instrument);
  venue.update((fixtures.markets as unknown as Record<string, CapitalMarket>)[EPIC]!, now);
  const e = new MarketEngine(instrument),
    a = agent({
      onTick(ctx) {
        if (!ctx.state.ordered) {
          ctx.state.ordered = true;
          ctx.buy({ size: 1 });
        }
      },
    });
  const r = e.addRun({
    runId: 'delayed',
    agent: a,
    capital: 10_000,
    leverage: 20,
    checkStopsOnCandles: false,
    execution: { venue, latencyMs: 500, now: () => now },
  });
  e.processTick(quote(0, 100));
  expect(r.position).toBeNull();
  now += 300;
  e.processTick(quote(300, 101));
  expect(r.position).toBeNull();
  now += 300;
  e.processTick(quote(600, 102));
  expect(r.position?.entryPrice).toBe(103);
  const s = r.snapshot();
  const next = new MarketEngine(instrument);
  const restored = next.addRun({
    runId: 'delayed',
    agent: a,
    capital: 10_000,
    leverage: 20,
    checkStopsOnCandles: false,
    execution: { venue, latencyMs: 500, now: () => now },
  });
  restored.restore(s, [], []);
  next.processTick(quote(600, 102));
  expect(restored.state).toEqual(r.state);
  expect(restored.position?.entryPrice).toBe(103);
});
test('a close deadline without quotes waits for the next executable quote and checks it before later intraminute extremes', () => {
  const { e, r } = setup(
    agent({
      onTick(ctx) {
        if (!ctx.state.ordered) {
          ctx.state.ordered = true;
          ctx.buy({ size: 1, stopLoss: 95, closeAt: T + 1000 });
        }
      },
    }),
  );
  e.processTick(quote(0, 100));
  e.processClock(T + 1000);
  expect(r.position).not.toBeNull();
  e.processTick(quote(5000, 99));
  e.processTick(quote(6000, 90));
  expect(r.trades[0]).toMatchObject({ exitReason: EXIT_REASON.SESSION_END, exitTime: T + 5000, exitPrice: 99 });
});
test('a profitable open position is not counted as a cash-balance drawdown at a minute boundary',()=>{
 const {e,r}=setup(agent({onTick(ctx){if(!ctx.state.entered){ctx.state.entered=true;ctx.buy({size:100});}}}));
 e.processTick(quote(0,100));e.processTick(quote(1000,120));e.processClock(T+MINUTE_MS);
 expect(r.markToMarket()).toBe(11900);expect(r.metrics().maxDrawdown).toBeLessThan(.02);
});
