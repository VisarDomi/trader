import { describe, expect, test } from 'bun:test';
import def from '../../agents/visar-night-trading.ts';
import { EXIT_REASON, localTime, TZ } from '../sdk/index.ts';
import { getInstrument } from './instruments.ts';
import type { LoadedAgent } from './loader.ts';
import { MarketEngine } from './market.ts';

const MINUTE = 60_000;
const LONG = 'long';
const SHORT = 'short';
const EPIC = 'US500';
const CAPITAL = 10_000;
const agent: LoadedAgent = { id: def.name, slug: def.name, variant: null, file: '', def, params: def.params, codeHash: 'test', source: '' };

function setup() {
  const engine = new MarketEngine({ ...getInstrument(EPIC) });
  const run = engine.addRun({ runId: def.name, agent, leverage: 200, capital: CAPITAL, checkStopsOnCandles: true });
  const bar = (closeAt: string, price: number, low = price, high = price, open = price) => engine.processCandle({
    time: Date.parse(closeAt) - MINUTE, open, high, low, close: price, spread: 0.6, volume: 1,
  });
  const session = (opts: { endPrice?: number; openAt?: number; points?: number[]; missing?: Set<number>; spike?: boolean } = {}) => {
    const start = opts.openAt ?? Date.parse('2026-01-06T15:30:00+01:00');
    const points = [5000, ...(opts.points ?? Array.from({ length: 26 }, (_, i) => 5000 + ((opts.endPrice ?? 5020) - 5000) * (i + 1) / 26))];
    for (let i = 0; i < 390; i++) {
      if (opts.missing?.has(i)) continue;
      const step = Math.floor(i / 15);
      const from = points[step]!;
      const delta = points[step + 1]! - from;
      const open = from + delta * (i % 15) / 15;
      const close = from + delta * (i % 15 + 1) / 15;
      const spike = opts.spike && i === 195;
      bar(new Date(start + (i + 1) * MINUTE).toISOString(), close,
        spike ? 4950 : Math.min(open, close), spike ? 5050 : Math.max(open, close), open);
    }
    return start + 390 * MINUTE;
  };
  const day = (close = 5020, open = true) => {
    session({ endPrice: close, missing: open ? undefined : new Set([0]) });
  };
  return { run, bar, day, session };
}

describe('visar-night-trading', () => {
  test('buys only at 03:27 after a bullish day and overnight dip, then exits at 08:27', () => {
    const { run, bar, day } = setup();
    day();
    bar('2026-01-07T03:26:00+01:00', 5010);
    expect(run.position).toBeNull();
    bar('2026-01-07T03:27:00+01:00', 5010);
    expect(run.position?.side).toBe(LONG);
    expect(run.position?.entryTime).toBe(Date.parse('2026-01-07T03:27:00+01:00'));
    expect(run.position!.size * run.position!.entryPrice / CAPITAL).toBeGreaterThan(179);
    bar('2026-01-07T08:26:00+01:00', 5011);
    expect(run.position).not.toBeNull();
    bar('2026-01-07T08:27:00+01:00', 5012);
    expect(run.position).toBeNull();
    expect(run.trades[0]?.exitReason).toBe(EXIT_REASON.SESSION_END);
    expect(localTime(run.trades[0]!.exitTime, TZ.TIRANA).minuteOfDay).toBe(8 * 60 + 27);
  });

  test('mirrors the rule for a bearish day and overnight bounce', () => {
    const { run, bar, day } = setup();
    day(4980);
    bar('2026-01-07T03:27:00+01:00', 4990);
    expect(run.position?.side).toBe(SHORT);
    const stop = run.position!.stopLoss!;
    bar('2026-01-07T03:28:00+01:00', 4990, 4990, stop + 1);
    expect(run.trades[0]?.exitReason).toBe(EXIT_REASON.STOP_LOSS);
    expect(run.trades[0]!.pnl).toBeGreaterThanOrEqual(-CAPITAL / 2);
    expect(run.trades[0]!.pnl).toBeLessThan(-CAPITAL * 0.49);
  });

  test('a missing exit minute uses the next available open, before that later candle can hit the stop', () => {
    const { run, bar, day } = setup();
    day();
    bar('2026-01-07T03:27:00+01:00', 5010);
    bar('2026-01-07T08:30:00+01:00', 5010, 4900);
    expect(run.trades[0]?.exitReason).toBe(EXIT_REASON.SESSION_END);
    expect(run.trades[0]?.exitPrice).toBe(5010);
    expect(run.trades[0]?.exitTime).toBe(Date.parse('2026-01-07T08:29:00+01:00'));
  });

  test('the long stop targets 50% of entry capital and cannot re-enter the same night', () => {
    const { run, bar, day } = setup();
    day();
    bar('2026-01-07T03:27:00+01:00', 5010);
    const stop = run.position!.stopLoss!;
    bar('2026-01-07T03:28:00+01:00', 5010, stop - 1);
    expect(run.trades[0]?.exitReason).toBe(EXIT_REASON.STOP_LOSS);
    expect(run.trades[0]!.pnl).toBeGreaterThanOrEqual(-CAPITAL / 2);
    expect(run.trades[0]!.pnl).toBeLessThan(-CAPITAL * 0.49);
    bar('2026-01-07T03:29:00+01:00', 5010);
    expect(run.position).toBeNull();
    expect(run.trades).toHaveLength(1);
  });

  test('the ±0.25% day boundary is inclusive in both directions', () => {
    for (const [reference, entry, side] of [[5012.5, 5010, LONG], [4987.5, 4990, SHORT]] as const) {
      const { run, bar, day } = setup();
      day(reference);
      bar('2026-01-07T03:27:00+01:00', entry);
      expect(run.position?.side).toBe(side);
    }
  });

  for (const [label, points, spike] of [
    ['positive but repeatedly whipsawing', Array.from({ length: 26 }, (_, i) => 5000 + 20 * (i + 1) / 26 + (i === 25 ? 0 : i % 2 ? -12 : 12)), false],
    ['negative but repeatedly whipsawing', Array.from({ length: 26 }, (_, i) => 5000 - 20 * (i + 1) / 26 + (i === 25 ? 0 : i % 2 ? -12 : 12)), false],
    ['flat until one late upward spike', [...Array(25).fill(5000), 5020], false],
    ['flat until one late downward spike', [...Array(25).fill(5000), 4980], false],
    ['a large morning reversal', [...Array.from({ length: 13 }, (_, i) => 5000 - 20 * (i + 1) / 13), ...Array.from({ length: 13 }, (_, i) => 4980 + 40 * (i + 1) / 13)], false],
    ['smooth checkpoints hiding a large intra-minute swing', undefined, true],
  ] as const) test(`treats ${label} as neutral despite a large net move`, () => {
    const { run, bar, session } = setup();
    session({ points: points ? [...points] : undefined, spike });
    bar('2026-01-07T03:27:00+01:00', points?.at(-1) === 4980 ? 4990 : 5010);
    expect(run.position).toBeNull();
  });

  test('an incomplete NY session cannot be called consistently trending', () => {
    const { run, bar, session } = setup();
    session({ missing: new Set(Array.from({ length: 60 }, (_, i) => 100 + i)) });
    bar('2026-01-07T03:27:00+01:00', 5010);
    expect(run.position).toBeNull();
  });

  test('NY-session direction is separate from the 22:00 reference during the DST mismatch', () => {
    const { run, bar, session } = setup();
    session({ openAt: Date.parse('2026-03-10T14:30:00+01:00') });
    bar('2026-03-10T22:00:00+01:00', 4970);
    bar('2026-03-11T03:27:00+01:00', 4960);
    expect(run.position?.side).toBe(LONG);
  });

  test('a missing NY closing observation stays neutral even with a later 22:00 reference', () => {
    const { run, bar, session } = setup();
    session({ openAt: Date.parse('2026-03-10T14:30:00+01:00'), missing: new Set([389]) });
    bar('2026-03-10T22:00:00+01:00', 5020);
    bar('2026-03-11T03:27:00+01:00', 5010);
    expect(run.position).toBeNull();
  });

  test('a small data gap between checkpoints does not erase a well-observed steady session', () => {
    const { run, bar, session } = setup();
    session({ missing: new Set([100]) });
    bar('2026-01-07T03:27:00+01:00', 5010);
    expect(run.position?.side).toBe(LONG);
  });

  for (const [label, reference, entry] of [
    ['neutral day', 5005, 5000], ['bullish with no dip', 5020, 5021],
    ['bearish with no bounce', 4980, 4979], ['unchanged overnight', 5020, 5020],
  ] as const) test(`skips ${label}`, () => {
    const { run, bar, day } = setup();
    day(reference);
    bar('2026-01-07T03:27:00+01:00', entry);
    expect(run.position).toBeNull();
  });

  test('missing opening/reference/entry minutes and weekend-old references cannot produce a trade', () => {
    for (const missing of ['open', 'reference', 'entry', 'old'] as const) {
      const { run, bar, day } = setup();
      if (missing !== 'reference') day(5020, missing !== 'open');
      bar(missing === 'old' ? '2026-01-09T03:27:00+01:00' : missing === 'entry' ? '2026-01-07T03:28:00+01:00' : '2026-01-07T03:27:00+01:00', 5010);
      expect(run.position).toBeNull();
    }
  });

  for (const [open, reference, entry, exit] of [
    ['2026-07-07T15:31:00+02:00', '2026-07-07T22:00:00+02:00', '2026-07-08T03:27:00+02:00', '2026-07-08T08:27:00+02:00'],
    ['2026-03-10T14:31:00+01:00', '2026-03-10T22:00:00+01:00', '2026-03-11T03:27:00+01:00', '2026-03-11T08:27:00+01:00'],
    ['2026-10-27T14:31:00+01:00', '2026-10-27T22:00:00+01:00', '2026-10-28T03:27:00+01:00', '2026-10-28T08:27:00+01:00'],
  ]) test(`uses local time across summer and US/EU DST mismatches: ${entry}`, () => {
    const { run, bar, session } = setup();
    const sessionEnd = session({ openAt: Date.parse(open!) - MINUTE });
    if (sessionEnd !== Date.parse(reference!)) bar(reference!, 5020);
    bar(entry!, 5010);
    expect(run.position?.side).toBe(LONG);
    expect(run.position?.closeAt).toBe(Date.parse(exit!));
  });
});
