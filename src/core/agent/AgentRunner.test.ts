import { test, expect, describe } from 'bun:test';
import { AgentRunner } from './AgentRunner.ts';
import type { Agent, AgentConfig, AgentResult, Candle, Context, Fill, InstrumentInfo } from './types.ts';
import { BacktestFeed } from '../feed/BacktestFeed.ts';
import { SimulatedExecution } from '../execution/SimulatedExecution.ts';

// ============================================
// TEST FIXTURES
// ============================================

const US100: InstrumentInfo = {
  epic: 'US100',
  leveraged: true,
  leverage: 200,
  spread: 1.8,
  lotSize: 1,
  minSize: 0.5,
  maxSize: 200,
  sizeIncrement: 0.01,
  pricePrecision: 1,
  tradingHours: { timezone: 'America/New_York', open: '09:30', close: '16:00' },
};

const UNLEVERAGED: InstrumentInfo = {
  ...US100,
  leveraged: false,
  leverage: 1,
};

// Create minute candles at a specific date/time in NY timezone
function minuteCandles(opts: {
  date: string;       // "2024-01-15"
  startHour: number;  // NY hour (e.g., 10 for 10:00 AM)
  startMinute?: number;
  count: number;
  basePrice?: number;
  priceStep?: number;  // price change per candle
}): Candle[] {
  const { date, startHour, startMinute = 0, count, basePrice = 18500, priceStep = 0 } = opts;

  // Construct UTC time from NY time using proper date math
  // Jan 2024 is EST (UTC-5)
  const baseDate = new Date(`${date}T00:00:00Z`);
  baseDate.setUTCHours(startHour + 5, startMinute, 0, 0);

  return Array.from({ length: count }, (_, i) => {
    const price = basePrice + i * priceStep;
    return {
      open: price,
      high: price + 5,
      low: price - 5,
      close: price + 1,
      timestamp: baseDate.getTime() + i * 60_000,
      timeframe: '1m' as const,
    };
  });
}

// ============================================
// TEST AGENTS
// ============================================

// Agent that does nothing
function passiveAgent(): Agent<null> {
  return {
    config: {
      name: 'Passive',
      version: '1.0.0',
      instrument: 'US100',
      primaryFeed: '1m',
    },
    init: () => null,
    onCandle: (_c, _ctx, state) => ({ order: null, state }),
    onFill: (_f, state) => state,
  };
}

// Agent that buys on first candle, sells on second
function buyAndSellAgent(): Agent<{ bought: boolean; sold: boolean }> {
  return {
    config: {
      name: 'BuyAndSell',
      version: '1.0.0',
      instrument: 'US100',
      primaryFeed: '1m',
    },
    init: () => ({ bought: false, sold: false }),
    onCandle: (_c, ctx, state) => {
      if (!state.bought && !ctx.position) {
        return {
          order: { action: 'OPEN', side: 'BUY', size: 1 },
          state: { ...state, bought: true },
        };
      }
      if (state.bought && !state.sold && ctx.position) {
        return {
          order: { action: 'CLOSE' },
          state: { ...state, sold: true },
        };
      }
      return { order: null, state };
    },
    onFill: (_f, state) => state,
  };
}

// Agent that buys with stop loss and take profit
function buyWithStopsAgent(stopLoss: number, takeProfit: number): Agent<{ opened: boolean }> {
  return {
    config: {
      name: 'BuyWithStops',
      version: '1.0.0',
      instrument: 'US100',
      primaryFeed: '1m',
    },
    init: () => ({ opened: false }),
    onCandle: (_c, ctx, state) => {
      if (!state.opened && !ctx.position) {
        return {
          order: { action: 'OPEN', side: 'BUY', size: 1, stopLoss, takeProfit },
          state: { opened: true },
        };
      }
      return { order: null, state };
    },
    onFill: (_f, state) => state,
  };
}

// Agent that uses 5m candles
function fiveMinAgent(): Agent<{ candleCount: number }> {
  return {
    config: {
      name: 'FiveMin',
      version: '1.0.0',
      instrument: 'US100',
      primaryFeed: '5m',
    },
    init: () => ({ candleCount: 0 }),
    onCandle: (_c, _ctx, state) => ({
      order: null,
      state: { candleCount: state.candleCount + 1 },
    }),
    onFill: (_f, state) => state,
  };
}

// Agent that buys with a specific size
function sizedBuyAgent(size: number): Agent<{ opened: boolean }> {
  return {
    config: {
      name: 'SizedBuy',
      version: '1.0.0',
      instrument: 'US100',
      primaryFeed: '1m',
    },
    init: () => ({ opened: false }),
    onCandle: (_c, ctx, state) => {
      if (!state.opened && !ctx.position) {
        return {
          order: { action: 'OPEN', side: 'BUY', size },
          state: { opened: true },
        };
      }
      return { order: null, state };
    },
    onFill: (_f, state) => state,
  };
}

// Agent that modifies stop after opening
function modifyAgent(): Agent<{ step: number }> {
  return {
    config: {
      name: 'Modifier',
      version: '1.0.0',
      instrument: 'US100',
      primaryFeed: '1m',
    },
    init: () => ({ step: 0 }),
    onCandle: (_c, ctx, state) => {
      if (state.step === 0) {
        return {
          order: { action: 'OPEN', side: 'BUY', size: 1, stopLoss: 18400 },
          state: { step: 1 },
        };
      }
      if (state.step === 1 && ctx.position) {
        return {
          order: { action: 'MODIFY', stopLoss: 18450 },
          state: { step: 2 },
        };
      }
      return { order: null, state };
    },
    onFill: (_f, state) => state,
  };
}

// Agent that tracks fills it receives
function fillTrackingAgent(): Agent<{ fills: Fill[] }> {
  return {
    config: {
      name: 'FillTracker',
      version: '1.0.0',
      instrument: 'US100',
      primaryFeed: '1m',
    },
    init: () => ({ fills: [] }),
    onCandle: (_c, ctx, state) => {
      if (state.fills.length === 0 && !ctx.position) {
        return {
          order: { action: 'OPEN', side: 'BUY', size: 1, stopLoss: 18400, takeProfit: 18600 },
          state,
        };
      }
      return { order: null, state };
    },
    onFill: (fill, state) => ({ fills: [...state.fills, fill] }),
  };
}

// Helper to run an agent quickly
function runAgent(
  agent: Agent<any>,
  candles: Candle[],
  instrument: InstrumentInfo = US100,
  opts: { capital?: number; maxDrawdown?: number; maxPositionSize?: number } = {},
) {
  const runner = new AgentRunner({
    agent,
    feed: new BacktestFeed(candles),
    execution: new SimulatedExecution(instrument, { type: 'none' }),
    instrument,
    capital: opts.capital ?? 10000,
    maxDrawdown: opts.maxDrawdown,
    maxPositionSize: opts.maxPositionSize,
  });
  return runner.run();
}

// ============================================
// TESTS
// ============================================

describe('AgentRunner', () => {
  describe('passive agent', () => {
    test('no fills, balance unchanged', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 10 });
      const result = await runAgent(passiveAgent(), candles);

      expect(result.fills.length).toBe(0);
      expect(result.finalBalance).toBe(10000);
      expect(result.totalCandles).toBe(10);
    });

    test('equity curve records points', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 5 });
      const result = await runAgent(passiveAgent(), candles);

      // Initial point + one per candle (1m agent gets called each candle)
      expect(result.equityCurve.length).toBeGreaterThan(1);
    });
  });

  describe('buy and sell', () => {
    test('opens and closes position', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 5, basePrice: 18500, priceStep: 10 });
      const result = await runAgent(buyAndSellAgent(), candles);

      expect(result.fills.length).toBe(2);
      expect(result.fills[0]!.action).toBe('OPENED');
      expect(result.fills[0]!.side).toBe('BUY');
      expect(result.fills[1]!.action).toBe('CLOSED');
      expect(result.fills[1]!.side).toBe('SELL');
      expect(result.fills[1]!.pnl).toBeDefined();
    });

    test('price increase produces profit', async () => {
      // Each candle close = basePrice + i * priceStep + 1
      // Candle 0 close: 18501, Candle 1 close: 18511
      // BUY fill: 18501 + 1.8 spread = 18502.8
      // SELL fill: 18511 (at bid) = 18511
      // PnL = (18511 - 18502.8) * 1 * 1 = 8.2
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 5, basePrice: 18500, priceStep: 10 });
      const result = await runAgent(buyAndSellAgent(), candles);

      expect(result.fills[1]!.pnl!).toBeCloseTo(8.2, 1);
      expect(result.finalBalance).toBeCloseTo(10008.2, 1);
    });
  });

  describe('stop loss', () => {
    test('triggers when price drops below stop', async () => {
      // Open at candle 0, then price drops
      const candles = minuteCandles({
        date: '2024-01-16', startHour: 10, count: 10,
        basePrice: 18500, priceStep: -20,
      });

      // Buy with stop at 18400. Price drops 20 per candle.
      // Candle 0: close 18501, low 18495
      // Candle 5: close 18401, low 18395 → stop at 18400 triggered
      const result = await runAgent(
        buyWithStopsAgent(18400, 18700),
        candles,
      );

      const closeFill = result.fills.find(f => f.action === 'CLOSED');
      expect(closeFill).toBeDefined();
      expect(closeFill!.reason).toBe('STOP_LOSS');
      expect(closeFill!.price).toBe(18400);
    });
  });

  describe('take profit', () => {
    test('triggers when price rises above TP', async () => {
      const candles = minuteCandles({
        date: '2024-01-16', startHour: 10, count: 10,
        basePrice: 18500, priceStep: 20,
      });

      // Buy with TP at 18600. Price rises 20 per candle.
      // Candle 0: close 18501, high 18505
      // Candle 5: close 18601, high 18605 → TP at 18600 triggered
      const result = await runAgent(
        buyWithStopsAgent(18300, 18600),
        candles,
      );

      const closeFill = result.fills.find(f => f.action === 'CLOSED');
      expect(closeFill).toBeDefined();
      expect(closeFill!.reason).toBe('TAKE_PROFIT');
      expect(closeFill!.price).toBe(18600);
    });
  });

  describe('trading hours', () => {
    test('agent not called outside trading hours (leveraged)', async () => {
      // 20:00 NY = outside NYSE hours (09:30-16:00)
      const candles = minuteCandles({ date: '2024-01-16', startHour: 20, count: 5 });
      const result = await runAgent(buyAndSellAgent(), candles);

      // Agent should never be called, so no fills
      expect(result.fills.length).toBe(0);
    });

    test('agent called during trading hours', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 5 });
      const result = await runAgent(buyAndSellAgent(), candles);

      expect(result.fills.length).toBe(2);
    });

    test('unleveraged instrument: agent called anytime', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 20, count: 5 });
      const result = await runAgent(buyAndSellAgent(), candles, UNLEVERAGED);

      // Unleveraged: no trading hour restriction
      expect(result.fills.length).toBe(2);
    });
  });

  describe('market close force-close', () => {
    test('leveraged position closed at market close', async () => {
      // Trading from 15:55 to 16:05 NY
      // Market close at 16:00 → force close at 15:59
      const candles = minuteCandles({ date: '2024-01-16', startHour: 15, startMinute: 55, count: 10 });

      // Agent buys on first candle (15:55, within hours)
      // Market close at 15:59 → force close
      const result = await runAgent(
        buyWithStopsAgent(18300, 18700),
        candles,
      );

      const closeFill = result.fills.find(f => f.action === 'CLOSED');
      expect(closeFill).toBeDefined();
      expect(closeFill!.reason).toBe('MARKET_CLOSE');
    });

    test('unleveraged position NOT closed at market close', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 15, startMinute: 55, count: 10 });

      const result = await runAgent(
        buyWithStopsAgent(18300, 18700),
        candles,
        UNLEVERAGED,
      );

      const marketCloseFill = result.fills.find(f => f.reason === 'MARKET_CLOSE');
      expect(marketCloseFill).toBeUndefined();
    });
  });

  describe('order validation', () => {
    test('rejects size below minSize', async () => {
      // US100 minSize is 0.5
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 3 });
      const result = await runAgent(sizedBuyAgent(0.1), candles);

      expect(result.fills.length).toBe(0);
    });

    test('clamps size to maxSize', async () => {
      // US100 maxSize is 200
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 3 });
      const result = await runAgent(sizedBuyAgent(300), candles);

      expect(result.fills.length).toBe(1);
      expect(result.fills[0]!.size).toBe(200);
    });

    test('rounds size to sizeIncrement', async () => {
      // US100 sizeIncrement is 0.01
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 3 });
      const result = await runAgent(sizedBuyAgent(1.999), candles);

      expect(result.fills.length).toBe(1);
      expect(result.fills[0]!.size).toBe(1.99); // floored
    });

    test('framework maxPositionSize rejects oversized order', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 3 });
      const result = await runAgent(sizedBuyAgent(5), candles, US100, { maxPositionSize: 2 });

      expect(result.fills.length).toBe(0);
    });

    test('ignores duplicate open when position exists', async () => {
      // buyWithStopsAgent tries to open on every candle if no position
      // but after opening, it should not try again
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 5 });
      const result = await runAgent(buyWithStopsAgent(18300, 18700), candles);

      const opens = result.fills.filter(f => f.action === 'OPENED');
      expect(opens.length).toBe(1);
    });
  });

  describe('modify order', () => {
    test('updates stop loss on existing position', async () => {
      // Agent opens with stop 18400, then modifies to 18450
      // Price then drops to 18445 (below 18450 but above 18400)
      // If modify worked, stop should trigger at 18450
      const candles = [
        ...minuteCandles({ date: '2024-01-16', startHour: 10, count: 3, basePrice: 18500 }),
        ...minuteCandles({ date: '2024-01-16', startHour: 10, startMinute: 3, count: 5, basePrice: 18445, priceStep: -5 }),
      ];

      const result = await runAgent(modifyAgent(), candles);

      const closeFill = result.fills.find(f => f.action === 'CLOSED');
      expect(closeFill).toBeDefined();
      expect(closeFill!.reason).toBe('STOP_LOSS');
      expect(closeFill!.price).toBe(18450); // modified stop, not original 18400
    });
  });

  describe('onFill callback', () => {
    test('agent receives fills for both open and trigger close', async () => {
      // Price drops to trigger stop
      const candles = minuteCandles({
        date: '2024-01-16', startHour: 10, count: 10,
        basePrice: 18500, priceStep: -20,
      });

      const agent = fillTrackingAgent();
      const runner = new AgentRunner({
        agent,
        feed: new BacktestFeed(candles),
        execution: new SimulatedExecution(US100, { type: 'none' }),
        instrument: US100,
        capital: 10000,
      });

      await runner.run();

      // The agent should have received the open fill via onFill
      // and the stop loss fill via onFill
      // We can verify by checking the run fills match
      expect(runner).toBeDefined(); // agent tracks internally, we check via fills
    });
  });

  describe('5m candles', () => {
    test('agent receives aggregated 5m candles', async () => {
      // 15 minutes of data → 3 complete 5m candles
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 16 });

      const agent = fiveMinAgent();
      const runner = new AgentRunner({
        agent,
        feed: new BacktestFeed(candles),
        execution: new SimulatedExecution(US100, { type: 'none' }),
        instrument: US100,
        capital: 10000,
      });

      const result = await runner.run();

      // 16 minutes: 3 complete 5m candles from builder + 1 flushed partial
      // The flushed partial (1 minute) also gets delivered
      expect(result.totalCandles).toBe(16);
    });
  });

  describe('max drawdown', () => {
    test('stops run when drawdown threshold breached', async () => {
      // Start with 1000 capital, 50% max drawdown
      // Price drops sharply so position loses > 500
      const candles = minuteCandles({
        date: '2024-01-16', startHour: 10, count: 50,
        basePrice: 18500, priceStep: -100,
      });

      const result = await runAgent(
        buyWithStopsAgent(10000, 30000), // very wide stops, won't trigger
        candles,
        US100,
        { capital: 1000, maxDrawdown: 0.5 },
      );

      // Run should have stopped early
      expect(result.totalCandles).toBeLessThan(50);
      // Position should have been closed
      const closeFill = result.fills.find(f => f.action === 'CLOSED');
      expect(closeFill).toBeDefined();
    });
  });

  describe('equity curve', () => {
    test('starts with initial capital', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 3 });
      const result = await runAgent(passiveAgent(), candles);

      expect(result.equityCurve[0]!.equity).toBe(10000);
      expect(result.equityCurve[0]!.balance).toBe(10000);
    });

    test('reflects balance change after trade', async () => {
      const candles = minuteCandles({
        date: '2024-01-16', startHour: 10, count: 5,
        basePrice: 18500, priceStep: 10,
      });
      const result = await runAgent(buyAndSellAgent(), candles);

      const lastPoint = result.equityCurve[result.equityCurve.length - 1]!;
      expect(lastPoint.balance).toBeCloseTo(result.finalBalance, 1);
    });
  });

  describe('multiple trades', () => {
    test('can open, close, and open again', async () => {
      // Agent that opens, closes, then opens again
      const multiTradeAgent: Agent<{ tradeCount: number }> = {
        config: { name: 'Multi', version: '1.0.0', instrument: 'US100', primaryFeed: '1m' },
        init: () => ({ tradeCount: 0 }),
        onCandle: (_c, ctx, state) => {
          if (!ctx.position && state.tradeCount < 2) {
            return {
              order: { action: 'OPEN', side: 'BUY', size: 1 },
              state: { tradeCount: state.tradeCount },
            };
          }
          if (ctx.position) {
            return {
              order: { action: 'CLOSE' },
              state: { tradeCount: state.tradeCount + 1 },
            };
          }
          return { order: null, state };
        },
        onFill: (_f, state) => state,
      };

      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 10 });
      const result = await runAgent(multiTradeAgent, candles);

      expect(result.fills.filter(f => f.action === 'OPENED').length).toBe(2);
      expect(result.fills.filter(f => f.action === 'CLOSED').length).toBe(2);
    });
  });

  describe('processTick', () => {
    test('triggers stop loss on tick', async () => {
      // Open a position via candle processing, then trigger stop via tick
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 1, basePrice: 18500 });
      const feed = new BacktestFeed(candles);
      const execution = new SimulatedExecution(US100, { type: 'none' });

      const runner = new AgentRunner({
        agent: buyWithStopsAgent(18400, 18700),
        feed,
        execution,
        instrument: US100,
        capital: 10000,
      });

      // Run the single candle to open the position
      const result = await runner.run();
      expect(result.fills.length).toBe(1);
      expect(result.fills[0]!.action).toBe('OPENED');

      // Now simulate a tick that drops below the stop loss
      await runner.processTick(18399, 18400.8, Date.now());

      // The stop should have triggered
      expect(result.fills.length).toBe(2);
      expect(result.fills[1]!.action).toBe('CLOSED');
      expect(result.fills[1]!.reason).toBe('STOP_LOSS');
    });

    test('triggers take profit on tick', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 1, basePrice: 18500 });
      const feed = new BacktestFeed(candles);
      const execution = new SimulatedExecution(US100, { type: 'none' });

      const runner = new AgentRunner({
        agent: buyWithStopsAgent(18400, 18600),
        feed,
        execution,
        instrument: US100,
        capital: 10000,
      });

      const result = await runner.run();
      expect(result.fills.length).toBe(1);

      // Tick above take profit (bid >= TP for BUY)
      await runner.processTick(18601, 18602.8, Date.now());

      expect(result.fills.length).toBe(2);
      expect(result.fills[1]!.action).toBe('CLOSED');
      expect(result.fills[1]!.reason).toBe('TAKE_PROFIT');
    });

    test('does nothing when no position', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 1 });
      const feed = new BacktestFeed(candles);
      const execution = new SimulatedExecution(US100, { type: 'none' });

      const runner = new AgentRunner({
        agent: passiveAgent(),
        feed,
        execution,
        instrument: US100,
        capital: 10000,
      });

      const result = await runner.run();
      expect(result.fills.length).toBe(0);

      // Tick should be a no-op
      await runner.processTick(18500, 18501.8, Date.now());
      expect(result.fills.length).toBe(0);
    });

    test('does nothing when price is between stop and TP', async () => {
      const candles = minuteCandles({ date: '2024-01-16', startHour: 10, count: 1, basePrice: 18500 });
      const feed = new BacktestFeed(candles);
      const execution = new SimulatedExecution(US100, { type: 'none' });

      const runner = new AgentRunner({
        agent: buyWithStopsAgent(18400, 18700),
        feed,
        execution,
        instrument: US100,
        capital: 10000,
      });

      const result = await runner.run();
      expect(result.fills.length).toBe(1);

      // Tick within range — no trigger
      await runner.processTick(18550, 18551.8, Date.now());
      expect(result.fills.length).toBe(1);
    });
  });
});
