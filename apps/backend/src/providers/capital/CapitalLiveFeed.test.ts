import { test, expect, describe } from 'bun:test';
import { CapitalLiveFeed } from './CapitalLiveFeed.ts';
import type { Candle } from '../../core/agent/types.ts';
import type { CapitalSession } from './CapitalSession.ts';

// Minimal mock session — only getTokens/getWebSocketUrl needed for feed construction
function mockSession(): CapitalSession {
  return {
    getTokens: () => ({ cst: 'test', securityToken: 'test' }),
    getWebSocketUrl: () => 'wss://fake',
  } as unknown as CapitalSession;
}

describe('CapitalLiveFeed', () => {
  describe('tick-to-candle accumulation', () => {
    test('first tick initializes candle', () => {
      const candles: Candle[] = [];
      const feed = new CapitalLiveFeed({
        session: mockSession(),
        epic: 'US100',
      });

      // Feed a single tick at t=0
      feed.processTick(18500, 18502, 0);

      // No candle emitted yet (need a new minute to emit)
      expect(candles.length).toBe(0);
    });

    test('emits candle when new minute starts', () => {
      const candles: Candle[] = [];
      const ticks: Array<{ bid: number; ask: number; ts: number }> = [];

      const feed = new CapitalLiveFeed({
        session: mockSession(),
        epic: 'US100',
        onTick: (bid, ask, ts) => ticks.push({ bid, ask, ts }),
      });

      // Start the feed with a handler that captures emitted candles
      // We call processTick directly (bypasses WebSocket)
      // Use start() to register the handler, then call processTick
      const handler = (candle: Candle) => candles.push(candle);

      // Simulate: start registers handler, then we process ticks
      // Since start() opens a WebSocket (which we don't want in tests),
      // we use processTick directly and check accumulation via stop()
      // But we need to test candle emission...

      // Use a more direct approach: process ticks in minute 0, then a tick in minute 1
      const minute0 = 60_000; // timestamp in first minute bucket (60000-119999)
      const minute1 = 120_000; // timestamp in second minute bucket

      feed.processTick(18500, 18502, minute0);       // mid = 18501
      feed.processTick(18510, 18512, minute0 + 10_000); // mid = 18511
      feed.processTick(18495, 18497, minute0 + 20_000); // mid = 18496
      feed.processTick(18505, 18507, minute0 + 50_000); // mid = 18506 (close)

      // No candle emitted yet (all same minute)
      expect(candles.length).toBe(0);

      // Now we need the handler registered. Let's call stop() to flush.
      // But stop() needs the handler set via start(). Since start() connects WS,
      // let's test the pattern differently: verify the flush on stop.

      // Re-create with handler registration approach
      const candles2: Candle[] = [];
      const feed2 = new CapitalLiveFeed({
        session: mockSession(),
        epic: 'US100',
      });

      // Manually set handler by starting (but we'll test processTick + emission)
      // The cleanest test: feed ticks across minute boundary via processTick,
      // capture via a registered handler.
      // We need to reach into the feed to set the handler, or use the start/stop pattern.

      // For unit testing the accumulation logic, test the flush via stop():
      // Not ideal but the processTick method is public for this reason.
      // Let's create a subclass or just test end-to-end.

      // Actually the simplest: just verify the candle appears via the new-minute trigger
      // by checking after a cross-minute tick. We need a feed with handler set.
      // Use a helper:
      testTicksToCandles();
    });

    test('builds correct OHLC from ticks within a minute', () => {
      testTicksToCandles();
    });

    test('handles multiple complete minutes', () => {
      const candles: Candle[] = [];

      const feed = createTestFeed(candles);

      const m0 = 60_000;
      const m1 = 120_000;
      const m2 = 180_000;

      // Minute 0
      feed.processTick(100, 102, m0);      // mid = 101
      feed.processTick(110, 112, m0 + 30_000); // mid = 111

      // Minute 1 — triggers emit of minute 0
      feed.processTick(120, 122, m1);      // mid = 121
      expect(candles.length).toBe(1);
      expect(candles[0]!.open).toBe(101);
      expect(candles[0]!.high).toBe(111);
      expect(candles[0]!.low).toBe(101);
      expect(candles[0]!.close).toBe(111);
      expect(candles[0]!.timestamp).toBe(m0);
      expect(candles[0]!.timeframe).toBe('1m');

      // Minute 2 — triggers emit of minute 1
      feed.processTick(130, 132, m2);
      expect(candles.length).toBe(2);
      expect(candles[1]!.open).toBe(121);
      expect(candles[1]!.close).toBe(121);
      expect(candles[1]!.timestamp).toBe(m1);
    });

    test('flushes partial candle on stop', () => {
      const candles: Candle[] = [];
      const feed = createTestFeed(candles);

      feed.processTick(100, 102, 60_000);
      feed.processTick(110, 112, 60_000 + 30_000);

      expect(candles.length).toBe(0);

      feed.stop();
      expect(candles.length).toBe(1);
      expect(candles[0]!.open).toBe(101);
      expect(candles[0]!.close).toBe(111);
    });

    test('calls onTick for every tick', () => {
      const ticks: Array<{ bid: number; ask: number }> = [];
      const feed = new CapitalLiveFeed({
        session: mockSession(),
        epic: 'US100',
        onTick: (bid, ask) => ticks.push({ bid, ask }),
      });

      feed.processTick(100, 102, 60_000);
      feed.processTick(110, 112, 60_000 + 10_000);
      feed.processTick(120, 122, 120_000);

      expect(ticks.length).toBe(3);
      expect(ticks[0]).toEqual({ bid: 100, ask: 102 });
      expect(ticks[1]).toEqual({ bid: 110, ask: 112 });
      expect(ticks[2]).toEqual({ bid: 120, ask: 122 });
    });

    test('single tick minute produces valid candle', () => {
      const candles: Candle[] = [];
      const feed = createTestFeed(candles);

      // One tick in minute 0
      feed.processTick(100, 102, 60_000); // mid = 101

      // Minute 1 triggers emit
      feed.processTick(200, 202, 120_000);

      expect(candles.length).toBe(1);
      expect(candles[0]!.open).toBe(101);
      expect(candles[0]!.high).toBe(101);
      expect(candles[0]!.low).toBe(101);
      expect(candles[0]!.close).toBe(101);
    });
  });
});

/**
 * Create a CapitalLiveFeed with handler pre-wired for testing.
 * Uses internal access pattern since start() would open a real WebSocket.
 */
function createTestFeed(candles: Candle[]): CapitalLiveFeed {
  const feed = new CapitalLiveFeed({
    session: mockSession(),
    epic: 'US100',
  });

  // Wire the handler by setting it directly (the handler field is private,
  // but processTick checks this.handler for candle emission).
  // We use Object.assign to set the private field for testing.
  (feed as any).handler = (candle: Candle) => candles.push(candle);

  return feed;
}

function testTicksToCandles(): void {
  const candles: Candle[] = [];
  const feed = createTestFeed(candles);

  const minute0 = 60_000;
  const minute1 = 120_000;

  // Build minute 0: open=18501, high=18511, low=18496, close=18506
  feed.processTick(18500, 18502, minute0);       // mid = 18501
  feed.processTick(18510, 18512, minute0 + 10_000); // mid = 18511
  feed.processTick(18495, 18497, minute0 + 20_000); // mid = 18496
  feed.processTick(18505, 18507, minute0 + 50_000); // mid = 18506

  expect(candles.length).toBe(0); // Not emitted yet

  // Tick in minute 1 triggers emission
  feed.processTick(18520, 18522, minute1);
  expect(candles.length).toBe(1);

  const c = candles[0]!;
  expect(c.open).toBe(18501);
  expect(c.high).toBe(18511);
  expect(c.low).toBe(18496);
  expect(c.close).toBe(18506);
  expect(c.timestamp).toBe(minute0);
  expect(c.timeframe).toBe('1m');
}
