import { test, expect, describe, beforeEach } from 'bun:test';
import { CandleBuilder } from './CandleBuilder.ts';
import type { Candle } from '../agent/types.ts';

// Helper: create a minute candle at a given time
// timestamp is minutes since epoch 0 for readability
function minute(minuteOffset: number, ohlc?: Partial<Candle>): Candle {
  return {
    open: ohlc?.open ?? 100,
    high: ohlc?.high ?? 105,
    low: ohlc?.low ?? 95,
    close: ohlc?.close ?? 102,
    timestamp: minuteOffset * 60_000,
    timeframe: '1m' as const,
  };
}

describe('CandleBuilder', () => {
  describe('1m passthrough', () => {
    test('returns every candle immediately', () => {
      const builder = new CandleBuilder('1m');

      const result1 = builder.addMinuteCandle(minute(0));
      const result2 = builder.addMinuteCandle(minute(1));

      expect(result1).not.toBeNull();
      expect(result1!.timeframe).toBe('1m');
      expect(result2).not.toBeNull();
    });
  });

  describe('5m aggregation', () => {
    let builder: CandleBuilder;

    beforeEach(() => {
      builder = new CandleBuilder('5m');
    });

    test('accumulates 5 minutes before emitting', () => {
      // Minutes 0-4 belong to bucket 0
      expect(builder.addMinuteCandle(minute(0))).toBeNull();
      expect(builder.addMinuteCandle(minute(1))).toBeNull();
      expect(builder.addMinuteCandle(minute(2))).toBeNull();
      expect(builder.addMinuteCandle(minute(3))).toBeNull();

      // Minute 5 starts a new bucket → emits bucket 0
      const completed = builder.addMinuteCandle(minute(5));
      expect(completed).not.toBeNull();
      expect(completed!.timeframe).toBe('5m');
      expect(completed!.timestamp).toBe(0);
    });

    test('OHLC aggregation is correct', () => {
      builder.addMinuteCandle(minute(0, { open: 100, high: 110, low: 90, close: 105 }));
      builder.addMinuteCandle(minute(1, { open: 105, high: 115, low: 95, close: 108 }));
      builder.addMinuteCandle(minute(2, { open: 108, high: 120, low: 88, close: 100 }));
      builder.addMinuteCandle(minute(3, { open: 100, high: 112, low: 92, close: 110 }));
      builder.addMinuteCandle(minute(4, { open: 110, high: 118, low: 96, close: 115 }));

      // Trigger emission with next bucket
      const completed = builder.addMinuteCandle(minute(5));

      expect(completed!.open).toBe(100);   // first minute's open
      expect(completed!.high).toBe(120);   // max high (minute 2)
      expect(completed!.low).toBe(88);     // min low (minute 2)
      expect(completed!.close).toBe(115);  // last minute's close
    });

    test('handles partial bucket with flush', () => {
      builder.addMinuteCandle(minute(0, { open: 100, high: 110, low: 90, close: 105 }));
      builder.addMinuteCandle(minute(1, { open: 105, high: 108, low: 95, close: 102 }));

      const partial = builder.flush();
      expect(partial).not.toBeNull();
      expect(partial!.open).toBe(100);
      expect(partial!.high).toBe(110);
      expect(partial!.low).toBe(90);
      expect(partial!.close).toBe(102);
    });

    test('flush returns null when empty', () => {
      expect(builder.flush()).toBeNull();
    });

    test('peek returns current partial without consuming', () => {
      builder.addMinuteCandle(minute(0, { open: 100, high: 110, low: 90, close: 105 }));

      const peeked = builder.peek();
      expect(peeked).not.toBeNull();
      expect(peeked!.open).toBe(100);

      // Still accumulating — adding more should merge
      builder.addMinuteCandle(minute(1, { open: 105, high: 120, low: 88, close: 115 }));
      const peeked2 = builder.peek();
      expect(peeked2!.high).toBe(120);
      expect(peeked2!.low).toBe(88);
    });

    test('peek returns null when empty', () => {
      expect(builder.peek()).toBeNull();
    });
  });

  describe('15m aggregation', () => {
    test('groups 15 minutes correctly', () => {
      const builder = new CandleBuilder('15m');

      // Feed minutes 0-14 (bucket 0)
      for (let i = 0; i < 15; i++) {
        const result = builder.addMinuteCandle(minute(i));
        expect(result).toBeNull();
      }

      // Minute 15 starts new bucket
      const completed = builder.addMinuteCandle(minute(15));
      expect(completed).not.toBeNull();
      expect(completed!.timeframe).toBe('15m');
      expect(completed!.timestamp).toBe(0);
    });
  });

  describe('1h aggregation', () => {
    test('groups 60 minutes correctly', () => {
      const builder = new CandleBuilder('1h');

      for (let i = 0; i < 60; i++) {
        expect(builder.addMinuteCandle(minute(i))).toBeNull();
      }

      const completed = builder.addMinuteCandle(minute(60));
      expect(completed).not.toBeNull();
      expect(completed!.timeframe).toBe('1h');
    });
  });

  describe('gaps in data', () => {
    test('emits previous bucket when gap crosses boundary', () => {
      const builder = new CandleBuilder('5m');

      // Minutes 0-2, then gap to minute 10 (different bucket)
      builder.addMinuteCandle(minute(0, { open: 100, high: 110, low: 90, close: 105 }));
      builder.addMinuteCandle(minute(1, { open: 105, high: 108, low: 95, close: 102 }));
      builder.addMinuteCandle(minute(2, { open: 102, high: 106, low: 94, close: 98 }));

      // Jump to minute 10 — bucket 0 should emit (partial, only 3 of 5 minutes)
      const completed = builder.addMinuteCandle(minute(10));
      expect(completed).not.toBeNull();
      expect(completed!.open).toBe(100);
      expect(completed!.close).toBe(98);
      expect(completed!.timestamp).toBe(0);
    });

    test('gap within same bucket keeps accumulating', () => {
      const builder = new CandleBuilder('5m');

      builder.addMinuteCandle(minute(0, { open: 100, high: 110, low: 90, close: 105 }));
      // Skip minutes 1-2, jump to minute 3 (still bucket 0)
      const result = builder.addMinuteCandle(minute(3, { open: 108, high: 115, low: 92, close: 112 }));

      expect(result).toBeNull(); // still in same bucket
      const peeked = builder.peek();
      expect(peeked!.open).toBe(100);    // first minute's open
      expect(peeked!.high).toBe(115);    // max across both
      expect(peeked!.low).toBe(90);      // min across both
      expect(peeked!.close).toBe(112);   // latest close
    });
  });

  describe('reset', () => {
    test('clears accumulated state', () => {
      const builder = new CandleBuilder('5m');

      builder.addMinuteCandle(minute(0));
      builder.addMinuteCandle(minute(1));
      builder.reset();

      expect(builder.peek()).toBeNull();
      expect(builder.flush()).toBeNull();
    });

    test('fresh accumulation after reset', () => {
      const builder = new CandleBuilder('5m');

      builder.addMinuteCandle(minute(0, { open: 100, high: 110, low: 90, close: 105 }));
      builder.reset();

      builder.addMinuteCandle(minute(5, { open: 200, high: 210, low: 190, close: 205 }));
      const peeked = builder.peek();
      expect(peeked!.open).toBe(200); // fresh, not merged with pre-reset
    });
  });

  describe('multiple emissions', () => {
    test('emits candle for each completed bucket', () => {
      const builder = new CandleBuilder('5m');
      const completed: Candle[] = [];

      // Feed 15 minutes (3 buckets of 5) + 1 to trigger third emission
      for (let i = 0; i <= 15; i++) {
        const result = builder.addMinuteCandle(
          minute(i, { open: 100 + i, high: 110 + i, low: 90 + i, close: 102 + i })
        );
        if (result) completed.push(result);
      }

      expect(completed.length).toBe(3);

      // Bucket 0: minutes 0-4
      expect(completed[0]!.open).toBe(100);
      expect(completed[0]!.close).toBe(106);
      expect(completed[0]!.timestamp).toBe(0);

      // Bucket 1: minutes 5-9
      expect(completed[1]!.open).toBe(105);
      expect(completed[1]!.close).toBe(111);
      expect(completed[1]!.timestamp).toBe(300_000);

      // Bucket 2: minutes 10-14
      expect(completed[2]!.open).toBe(110);
      expect(completed[2]!.close).toBe(116);
      expect(completed[2]!.timestamp).toBe(600_000);
    });
  });

  describe('real-world timestamps', () => {
    test('aligns to 5m boundaries with real timestamps', () => {
      const builder = new CandleBuilder('5m');

      // 2024-01-15 09:30:00 UTC in ms
      const base = new Date('2024-01-15T09:30:00Z').getTime();

      const m0: Candle = { open: 18500, high: 18520, low: 18490, close: 18510, timestamp: base, timeframe: '1m' };
      const m1: Candle = { open: 18510, high: 18530, low: 18500, close: 18525, timestamp: base + 60_000, timeframe: '1m' };
      const m2: Candle = { open: 18525, high: 18540, low: 18510, close: 18535, timestamp: base + 120_000, timeframe: '1m' };
      const m3: Candle = { open: 18535, high: 18545, low: 18520, close: 18530, timestamp: base + 180_000, timeframe: '1m' };
      const m4: Candle = { open: 18530, high: 18550, low: 18515, close: 18545, timestamp: base + 240_000, timeframe: '1m' };
      const m5: Candle = { open: 18545, high: 18560, low: 18540, close: 18555, timestamp: base + 300_000, timeframe: '1m' };

      expect(builder.addMinuteCandle(m0)).toBeNull();
      expect(builder.addMinuteCandle(m1)).toBeNull();
      expect(builder.addMinuteCandle(m2)).toBeNull();
      expect(builder.addMinuteCandle(m3)).toBeNull();
      expect(builder.addMinuteCandle(m4)).toBeNull();

      const completed = builder.addMinuteCandle(m5);
      expect(completed).not.toBeNull();
      expect(completed!.open).toBe(18500);
      expect(completed!.high).toBe(18550);
      expect(completed!.low).toBe(18490);
      expect(completed!.close).toBe(18545);
    });
  });
});
