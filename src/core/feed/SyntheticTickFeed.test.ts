import { test, expect, describe } from 'bun:test';
import { SyntheticTickFeed } from './SyntheticTickFeed.ts';
import type { Candle, InstrumentInfo } from '../agent/types.ts';

const US100: InstrumentInfo = {
  epic: 'US100',
  leveraged: true,
  leverage: 20,
  spread: 1.8,
  lotSize: 1,
  minSize: 0.5,
  maxSize: 50,
  sizeIncrement: 0.5,
  pricePrecision: 1,
  tradingHours: { timezone: 'America/New_York', gaps: [] },
};

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    open: 21000,
    high: 21010,
    low: 20990,
    close: 21005,
    timestamp: 60_000,
    timeframe: '1m',
    ...overrides,
  };
}

describe('SyntheticTickFeed', () => {
  describe('generateCandleTicks', () => {
    test('generates the correct number of ticks', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
        ticksPerMinute: 600,
      });

      const ticks = feed.generateCandleTicks(makeCandle());
      expect(ticks).toHaveLength(600);
    });

    test('first tick mid equals candle open', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const candle = makeCandle({ open: 21000 });
      const ticks = feed.generateCandleTicks(candle);
      const firstMid = (ticks[0].bid + ticks[0].ask) / 2;
      expect(firstMid).toBeCloseTo(21000, 0);
    });

    test('last tick mid equals candle close', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const candle = makeCandle({ close: 21005 });
      const ticks = feed.generateCandleTicks(candle);
      const lastMid = (ticks[ticks.length - 1].bid + ticks[ticks.length - 1].ask) / 2;
      expect(lastMid).toBeCloseTo(21005, 0);
    });

    test('ticks touch candle high', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const candle = makeCandle({ high: 21010, low: 20990 });
      const ticks = feed.generateCandleTicks(candle);
      const maxMid = Math.max(...ticks.map(t => (t.bid + t.ask) / 2));

      // Should reach within 1 point of high (clamping ensures it touches)
      expect(maxMid).toBeGreaterThanOrEqual(candle.high - 1);
    });

    test('ticks touch candle low', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const candle = makeCandle({ high: 21010, low: 20990 });
      const ticks = feed.generateCandleTicks(candle);
      const minMid = Math.min(...ticks.map(t => (t.bid + t.ask) / 2));

      // Should reach within 1 point of low
      expect(minMid).toBeLessThanOrEqual(candle.low + 1);
    });

    test('all tick mids stay within [low, high]', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      // Run multiple candles to test robustness
      for (let i = 0; i < 20; i++) {
        const candle = makeCandle({
          open: 21000 + i,
          high: 21015 + i,
          low: 20985 + i,
          close: 21005 + i,
        });
        const ticks = feed.generateCandleTicks(candle);

        for (const tick of ticks) {
          const mid = (tick.bid + tick.ask) / 2;
          expect(mid).toBeGreaterThanOrEqual(candle.low - 0.1);
          expect(mid).toBeLessThanOrEqual(candle.high + 0.1);
        }
      }
    });

    test('timestamps are evenly spaced within the minute', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
        ticksPerMinute: 600,
      });

      const candle = makeCandle({ timestamp: 120_000 });
      const ticks = feed.generateCandleTicks(candle);

      expect(ticks[0].timestamp).toBe(120_000);
      // Last tick should be near end of the minute
      expect(ticks[599].timestamp).toBe(120_000 + Math.round(599 * 100));

      // Check spacing
      const dtMs = 100; // 60000 / 600
      for (let i = 0; i < ticks.length; i++) {
        expect(ticks[i].timestamp).toBe(120_000 + Math.round(i * dtMs));
      }
    });

    test('spread is maintained on all ticks', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const ticks = feed.generateCandleTicks(makeCandle());
      for (const tick of ticks) {
        const spread = tick.ask - tick.bid;
        // Spread should be ~1.8, allow rounding tolerance
        expect(Math.abs(spread - 1.8)).toBeLessThan(0.15);
      }
    });

    test('prices are rounded to pricePrecision', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const ticks = feed.generateCandleTicks(makeCandle());
      for (const tick of ticks) {
        expect(Math.round(tick.bid * 10)).toBe(tick.bid * 10);
        expect(Math.round(tick.ask * 10)).toBe(tick.ask * 10);
      }
    });

    test('flat candle (high == low) produces constant-price ticks', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const candle = makeCandle({ open: 21000, high: 21000, low: 21000, close: 21000 });
      const ticks = feed.generateCandleTicks(candle);

      const expectedBid = Math.round((21000 - 0.9) * 10) / 10;
      const expectedAsk = Math.round((21000 + 0.9) * 10) / 10;
      for (const tick of ticks) {
        expect(tick.bid).toBe(expectedBid);
        expect(tick.ask).toBe(expectedAsk);
      }
    });

    test('ask is always greater than bid', () => {
      const feed = new SyntheticTickFeed({
        candles: [],
        instrument: US100,
        onTick: () => {},
      });

      const ticks = feed.generateCandleTicks(makeCandle());
      for (const tick of ticks) {
        expect(tick.ask).toBeGreaterThan(tick.bid);
      }
    });
  });

  describe('start()', () => {
    test('calls onTick for every generated tick', async () => {
      let tickCount = 0;
      const feed = new SyntheticTickFeed({
        candles: [makeCandle()],
        instrument: US100,
        onTick: () => { tickCount++; },
        ticksPerMinute: 600,
      });

      const candles: Candle[] = [];
      await feed.start((c) => { candles.push(c); });

      expect(tickCount).toBe(600);
      expect(candles).toHaveLength(1);
    });

    test('emits original candles to handler', async () => {
      const source = [
        makeCandle({ timestamp: 60_000, close: 21005 }),
        makeCandle({ timestamp: 120_000, close: 21010 }),
      ];

      const feed = new SyntheticTickFeed({
        candles: source,
        instrument: US100,
        onTick: () => {},
      });

      const received: Candle[] = [];
      await feed.start((c) => { received.push(c); });

      expect(received).toHaveLength(2);
      // Candles should be the originals, not tick-derived
      expect(received[0].close).toBe(21005);
      expect(received[1].close).toBe(21010);
    });

    test('ticks arrive before their candle', async () => {
      const events: string[] = [];

      const feed = new SyntheticTickFeed({
        candles: [makeCandle()],
        instrument: US100,
        onTick: () => { events.push('tick'); },
        ticksPerMinute: 10, // small number for easy testing
      });

      await feed.start(() => { events.push('candle'); });

      // All ticks should come before the candle
      const candleIdx = events.indexOf('candle');
      expect(candleIdx).toBe(events.length - 1);
      expect(events.slice(0, candleIdx).every(e => e === 'tick')).toBe(true);
    });

    test('stop() halts tick and candle emission', async () => {
      let tickCount = 0;
      const feed = new SyntheticTickFeed({
        candles: [makeCandle(), makeCandle({ timestamp: 120_000 })],
        instrument: US100,
        onTick: () => {
          tickCount++;
          if (tickCount === 5) feed.stop();
        },
        ticksPerMinute: 600,
      });

      const candles: Candle[] = [];
      await feed.start((c) => { candles.push(c); });

      // Should have stopped early
      expect(tickCount).toBe(5);
      expect(candles).toHaveLength(0); // stopped before first candle emitted
    });

    test('multiple candles process sequentially', async () => {
      const source = Array.from({ length: 5 }, (_, i) => makeCandle({
        timestamp: (i + 1) * 60_000,
        open: 21000 + i * 5,
        high: 21010 + i * 5,
        low: 20990 + i * 5,
        close: 21005 + i * 5,
      }));

      let totalTicks = 0;
      const feed = new SyntheticTickFeed({
        candles: source,
        instrument: US100,
        onTick: () => { totalTicks++; },
        ticksPerMinute: 100,
      });

      const received: Candle[] = [];
      await feed.start((c) => { received.push(c); });

      expect(totalTicks).toBe(500); // 5 candles * 100 ticks
      expect(received).toHaveLength(5);
    });

    test('tick timestamps are within the candle\'s minute', async () => {
      const timestamps: number[] = [];
      const candle = makeCandle({ timestamp: 120_000 });

      const feed = new SyntheticTickFeed({
        candles: [candle],
        instrument: US100,
        onTick: (_b, _a, ts) => { timestamps.push(ts); },
        ticksPerMinute: 100,
      });

      await feed.start(() => {});

      // All tick timestamps should be within [candle.timestamp, candle.timestamp + 60_000)
      for (const ts of timestamps) {
        expect(ts).toBeGreaterThanOrEqual(candle.timestamp);
        expect(ts).toBeLessThan(candle.timestamp + 60_000);
      }
    });
  });
});
