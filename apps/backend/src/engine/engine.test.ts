import { describe, expect, test } from 'bun:test';
import { defineAgent } from '../sdk/index.ts';
import type { AgentContext, Bar, OrderOptions } from '../sdk/types.ts';
import { EXIT_REASON } from '../sdk/types.ts';
import { IndicatorCache } from '../sdk/ta.ts';
import { INSTRUMENTS } from './instruments.ts';
import type { LoadedAgent } from './loader.ts';
import { MarketEngine } from './market.ts';
import { BarSeries, type Candle } from './series.ts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 6, 14, 0); // Tuesday 09:00 New York (winter)
const US100 = INSTRUMENTS.US100!;
const EPIC = 'US100';

function candle(i: number, o: number, h: number, l: number, c: number, spread = 2): Candle {
  return { time: T0 + i * MIN, open: o, high: h, low: l, close: c, spread, volume: 1 };
}

function flat(i: number, price: number): Candle {
  return candle(i, price, price, price, price);
}

type Action = { at: number; do: (ctx: AgentContext) => void };

/** An agent that runs scripted actions on given bar counts (1-based). */
function scripted(actions: Action[], opts: { warmup?: number; timeframe?: '1m' | '5m'; intradayOnly?: boolean } = {}): LoadedAgent {
  const def = defineAgent({
    name: 'scripted',
    description: 'test agent',
    instruments: [EPIC],
    timeframe: opts.timeframe ?? '1m',
    params: {},
    warmup: opts.warmup ?? 0,
    intradayOnly: opts.intradayOnly,
    init: () => ({ n: 0 }),
    onBar(ctx) {
      const s = ctx.state as { n: number };
      s.n++;
      for (const a of actions) if (a.at === s.n) a.do(ctx as AgentContext);
    },
  });
  return { id: 'scripted', slug: 'scripted', variant: null, file: 'x', def, params: {}, codeHash: 'h', source: '' };
}

function setup(agent: LoadedAgent, capital = 10_000) {
  const engine = new MarketEngine(US100);
  const run = engine.addRun({ runId: 'r1', agent, capital, checkStopsOnCandles: true });
  return { engine, run };
}

const buy = (o: OrderOptions = {}) => (ctx: AgentContext) => ctx.buy(o);
const sell = (o: OrderOptions = {}) => (ctx: AgentContext) => ctx.sell(o);

describe('BarSeries', () => {
  test('aggregates 1m candles into 5m bars that close on the last minute', () => {
    const s = new BarSeries(EPIC, '5m');
    const closed: Bar[] = [];
    // T0 is 14:00 UTC, a 5-minute boundary.
    for (let i = 0; i < 10; i++) closed.push(...s.push(candle(i, 100 + i, 101 + i, 99 + i, 100.5 + i)));
    expect(closed.length).toBe(2);
    expect(closed[0]).toMatchObject({ time: T0, open: 100, high: 105, low: 99, close: 104.5, volume: 5 });
    expect(closed[1]!.time).toBe(T0 + 5 * MIN);
  });

  test('closes a bucket early when a gap skips its last minute', () => {
    const s = new BarSeries(EPIC, '5m');
    expect(s.push(flat(0, 100))).toHaveLength(0);
    expect(s.push(flat(1, 101))).toHaveLength(0);
    // minutes 2..4 missing; minute 6 belongs to the next bucket
    const closed = s.push(flat(6, 103));
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ time: T0, close: 101 });
  });
});

describe('indicators', () => {
  const bars: Bar[] = [];
  let x = 100;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    const o = x;
    x = x * (1 + (rnd() - 0.5) * 0.02);
    bars.push({ time: i * MIN, open: o, high: Math.max(o, x) * 1.002, low: Math.min(o, x) * 0.998, close: x, volume: 1, spread: 0.1 });
  }
  const cache = new IndicatorCache(bars);
  const closes = bars.map(b => b.close);

  test('SMA matches the naive average', () => {
    const sma = cache.sma(20);
    expect(sma[18]).toBeNaN();
    const naive = closes.slice(280, 300).reduce((a, b) => a + b, 0) / 20;
    expect(sma[299]).toBeCloseTo(naive, 8);
  });

  test('EMA is seeded with the SMA and follows the recursion', () => {
    const ema = cache.ema(10);
    const seedVal = closes.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    expect(ema[9]).toBeCloseTo(seedVal, 10);
    const alpha = 2 / 11;
    expect(ema[10]).toBeCloseTo(alpha * closes[10]! + (1 - alpha) * seedVal, 10);
  });

  test('RSI stays in [0, 100] and ATR is positive', () => {
    const rsi = cache.rsi(14).slice(14);
    expect(rsi.every(v => v >= 0 && v <= 100)).toBe(true);
    expect(cache.atr(14).slice(13).every(v => v > 0)).toBe(true);
  });

  test('donchian includes the current bar; highest/lowest agree with a scan', () => {
    const d = cache.donchian(20);
    const hi = Math.max(...bars.slice(280).map(b => b.high));
    const lo = Math.min(...bars.slice(280).map(b => b.low));
    expect(d.upper[299]).toBe(hi);
    expect(d.lower[299]).toBe(lo);
  });

  test('values are computed lazily and stay aligned as bars are appended', () => {
    const growing: Bar[] = bars.slice(0, 50);
    const c = new IndicatorCache(growing);
    const before = c.sma(10).length;
    growing.push(...bars.slice(50, 60));
    expect(before).toBe(50);
    expect(c.sma(10).length).toBe(60);
    expect(c.sma(10)[59]).toBeCloseTo(cache.sma(10)[59]!, 10);
  });
});

describe('AgentRun fills and sizing', () => {
  test('buy fills at the ask (bid + spread); closing a long sells at the bid', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1 }) }, { at: 3, do: ctx => ctx.close() }]));
    engine.processCandle(flat(0, 100)); // bar 1 -> buy at 102
    engine.processCandle(flat(1, 110));
    engine.processCandle(flat(2, 120)); // bar 3 -> sell at 120
    expect(run.trades).toHaveLength(1);
    expect(run.trades[0]).toMatchObject({ side: 'long', entryPrice: 102, exitPrice: 120, pnl: 18, exitReason: EXIT_REASON.SIGNAL });
    expect(run.balance).toBe(10_018);
  });

  test('riskPct sizes the position so the stop loses that share of equity', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ stopLoss: 92, riskPct: 1 }) }]));
    engine.processCandle(flat(0, 100)); // ask 102, stop distance 10 -> $100 risk -> size 10
    expect(run.position?.size).toBe(10);
  });

  test('explicit exposure wins over the stop for sizing', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ exposure: 1, stopLoss: 50 }) }]));
    engine.processCandle(flat(0, 9998)); // ask 10000 -> 1x equity = 1 unit
    expect(run.position?.size).toBe(1);
  });

  test('size is capped by margin', () => {
    // 5% margin, 90% of equity usable -> max notional 180,000 at ask 102 -> 1764.705 units, capped by maxSize 1250
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1_000_000 }) }]));
    engine.processCandle(flat(0, 100));
    expect(run.position?.size).toBe(US100.maxSize);
  });

  test('orders below the minimum size are rejected and logged', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 0.0001 }) }]));
    engine.processCandle(flat(0, 100));
    expect(run.position).toBeNull();
    expect(run.logs.some(l => l.message.includes('rejected'))).toBe(true);
  });

  test('a stop on the wrong side is rejected', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ stopLoss: 105 }) }]));
    engine.processCandle(flat(0, 100));
    expect(run.position).toBeNull();
  });

  test('sell while long reverses the position', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1 }) }, { at: 2, do: sell({ size: 2 }) }]));
    engine.processCandle(flat(0, 100));
    engine.processCandle(flat(1, 110));
    expect(run.trades[0]).toMatchObject({ exitReason: EXIT_REASON.REVERSE, exitPrice: 110 });
    expect(run.position).toMatchObject({ side: 'short', size: 2, entryPrice: 110 });
  });

  test('orders during warmup are ignored', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1 }) }, { at: 3, do: buy({ size: 1 }) }], { warmup: 3 }));
    engine.processCandle(flat(0, 100));
    expect(run.position).toBeNull();
    engine.processCandle(flat(1, 100));
    engine.processCandle(flat(2, 100));
    expect(run.position).not.toBeNull();
  });
});

describe('AgentRun stops', () => {
  test('a stop touched inside a candle fills at the stop', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1, stopLoss: 95 }) }]));
    engine.processCandle(flat(0, 100));
    engine.processCandle(candle(1, 99, 100, 94, 96));
    expect(run.trades[0]).toMatchObject({ exitReason: EXIT_REASON.STOP_LOSS, exitPrice: 95 });
  });

  test('a gap through the stop fills at the open (worse)', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1, stopLoss: 95 }) }]));
    engine.processCandle(flat(0, 100));
    engine.processCandle(candle(1, 90, 91, 89, 90));
    expect(run.trades[0]).toMatchObject({ exitReason: EXIT_REASON.STOP_LOSS, exitPrice: 90 });
  });

  test('stop beats take-profit when both are touched in one candle', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1, stopLoss: 95, takeProfit: 110 }) }]));
    engine.processCandle(flat(0, 100));
    engine.processCandle(candle(1, 100, 111, 94, 100));
    expect(run.trades[0]!.exitReason).toBe(EXIT_REASON.STOP_LOSS);
  });

  test('short stops are checked against the ask', () => {
    // short at bid 100, stop 104; candle high bid 102.5 + spread 2 = ask 104.5 -> stopped
    const { engine, run } = setup(scripted([{ at: 1, do: sell({ size: 1, stopLoss: 104 }) }]));
    engine.processCandle(flat(0, 100));
    engine.processCandle(candle(1, 100, 102.5, 99, 100));
    expect(run.trades[0]).toMatchObject({ exitReason: EXIT_REASON.STOP_LOSS, exitPrice: 104 });
  });

  test('trailing stop follows the best price', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1, trailingStop: 5 }) }]));
    engine.processCandle(flat(0, 100));
    engine.processCandle(candle(1, 100, 120, 100, 119)); // anchor -> 120, trail level 115
    engine.processCandle(candle(2, 119, 119, 114, 115));
    expect(run.trades[0]).toMatchObject({ exitReason: EXIT_REASON.TRAILING_STOP, exitPrice: 115 });
  });

  test('candles that started before the entry cannot trigger its stops (live timing)', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1, stopLoss: 95 }) }]));
    engine.processCandle(flat(0, 100));
    const entry = run.position!.entryTime;
    // A candle stamped before the entry (as when REST candles arrive after a live fill).
    run.onCandle({ ...candle(0, 100, 100, 90, 100), time: entry - MIN });
    expect(run.position).not.toBeNull();
  });
});

describe('AgentRun funding and sessions', () => {
  test('overnight funding is charged once per 17:00 New York rollover, three times over a weekend', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1 }) }]));
    const price = 10_000;
    engine.processCandle(flat(0, price)); // Tue 09:00 NY
    // Next day 09:00 NY: one rollover crossed
    engine.processCandle({ ...flat(1, price), time: T0 + 24 * 60 * MIN });
    const oneNight = price * (US100.overnightLongPct / 100);
    expect(run.balance).toBeCloseTo(10_000 + oneNight, 6);
    // Friday 09:00 -> Monday 09:00 crosses Fri, Sat, Sun rollovers
    engine.processCandle({ ...flat(2, price), time: T0 + 3 * 24 * 60 * MIN }); // Fri
    engine.processCandle({ ...flat(3, price), time: T0 + 6 * 24 * 60 * MIN }); // Mon
    expect(run.balance).toBeCloseTo(10_000 + 6 * oneNight, 6);
  });

  test('intradayOnly closes before the daily break', () => {
    const { engine, run } = setup(scripted([{ at: 1, do: buy({ size: 1 }) }], { intradayOnly: true }));
    engine.processCandle(flat(0, 100)); // 09:00 NY
    // 16:56 NY = 7h56m later
    engine.processCandle({ ...flat(1, 100), time: T0 + (7 * 60 + 56) * MIN });
    expect(run.trades[0]?.exitReason).toBe(EXIT_REASON.SESSION_END);
  });
});

describe('determinism', () => {
  test('ctx.random is reproducible per run id', () => {
    const draws: number[][] = [[], []];
    for (const k of [0, 1]) {
      const def = defineAgent({
        name: 'rng', description: 'rng', instruments: [EPIC], timeframe: '1m', params: {}, warmup: 0,
        onBar(ctx) {
          draws[k]!.push(ctx.random());
        },
      });
      const engine = new MarketEngine(US100);
      engine.addRun({ runId: 'same-id', agent: { id: 'rng', slug: 'rng', variant: null, file: 'x', def, params: {}, codeHash: 'h', source: '' }, capital: 1, checkStopsOnCandles: true });
      for (let i = 0; i < 5; i++) engine.processCandle(flat(i, 100));
    }
    expect(draws[0]).toEqual(draws[1]!);
  });
});
