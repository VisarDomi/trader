import { test, expect, describe, beforeEach } from 'bun:test';
import { SimulatedExecution } from './SimulatedExecution.ts';
import type { InstrumentInfo, Position } from '../agent/types.ts';
import type { Trigger } from '../position/PositionMonitor.ts';

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

function buyPos(overrides: Partial<Position> = {}): Position {
  return {
    direction: 'BUY',
    size: 1,
    entryPrice: 18501.8, // bought at ask
    entryTime: 1000,
    unrealizedPnL: 0,
    stopLoss: 18400,
    takeProfit: 18600,
    ...overrides,
  };
}

function sellPos(overrides: Partial<Position> = {}): Position {
  return {
    direction: 'SELL',
    size: 1,
    entryPrice: 18500, // sold at bid
    entryTime: 1000,
    unrealizedPnL: 0,
    stopLoss: 18600,
    takeProfit: 18400,
    ...overrides,
  };
}

describe('SimulatedExecution', () => {
  describe('no slippage', () => {
    let engine: SimulatedExecution;

    beforeEach(() => {
      engine = new SimulatedExecution(US100, { type: 'none' });
    });

    // ========== OPEN ==========

    describe('executeOpen', () => {
      test('BUY fills at ask (reference + spread)', async () => {
        const fill = await engine.executeOpen('BUY', 1, 18500, 1000);

        expect(fill.action).toBe('OPENED');
        expect(fill.reason).toBe('ORDER');
        expect(fill.side).toBe('BUY');
        expect(fill.size).toBe(1);
        expect(fill.price).toBe(18501.8); // 18500 + 1.8
        expect(fill.timestamp).toBe(1000);
        expect(fill.pnl).toBeUndefined();
      });

      test('SELL fills at bid (reference)', async () => {
        const fill = await engine.executeOpen('SELL', 2, 18500, 1000);

        expect(fill.side).toBe('SELL');
        expect(fill.size).toBe(2);
        expect(fill.price).toBe(18500);
      });

      test('price is rounded to instrument precision', async () => {
        // reference 18500.55, spread 1.8 → 18502.35 → rounded to 18502.4 (1 decimal)
        const fill = await engine.executeOpen('BUY', 1, 18500.55, 1000);
        expect(fill.price).toBe(18502.4);
      });
    });

    // ========== CLOSE ==========

    describe('executeClose', () => {
      test('BUY position closes by selling at bid (reference)', async () => {
        const fill = await engine.executeClose(buyPos({ entryPrice: 18501.8 }), 18600, 2000);

        expect(fill.action).toBe('CLOSED');
        expect(fill.reason).toBe('ORDER');
        expect(fill.side).toBe('SELL'); // opposite of BUY
        expect(fill.price).toBe(18600); // exit at bid
        expect(fill.timestamp).toBe(2000);
      });

      test('BUY close calculates positive pnl', async () => {
        // Entry: 18501.8 (ask), exit: 18600 (bid)
        // pnl = (18600 - 18501.8) * 1 * 1 = 98.2
        const fill = await engine.executeClose(buyPos({ entryPrice: 18501.8, size: 1 }), 18600, 2000);
        expect(fill.pnl).toBeCloseTo(98.2);
      });

      test('BUY close calculates negative pnl', async () => {
        // Entry: 18501.8, exit: 18400
        // pnl = (18400 - 18501.8) * 1 * 1 = -101.8
        const fill = await engine.executeClose(buyPos({ entryPrice: 18501.8, size: 1 }), 18400, 2000);
        expect(fill.pnl).toBeCloseTo(-101.8);
      });

      test('SELL position closes by buying at ask (reference + spread)', async () => {
        const fill = await engine.executeClose(sellPos({ entryPrice: 18500 }), 18400, 2000);

        expect(fill.side).toBe('BUY'); // opposite of SELL
        expect(fill.price).toBe(18401.8); // 18400 + 1.8 spread
      });

      test('SELL close calculates positive pnl', async () => {
        // Entry: 18500 (bid), exit: 18401.8 (ask)
        // pnl = (18500 - 18401.8) * 1 * 1 = 98.2
        const fill = await engine.executeClose(sellPos({ entryPrice: 18500, size: 1 }), 18400, 2000);
        expect(fill.pnl).toBeCloseTo(98.2);
      });

      test('SELL close calculates negative pnl', async () => {
        // Entry: 18500, exit: 18601.8
        // pnl = (18500 - 18601.8) * 1 * 1 = -101.8
        const fill = await engine.executeClose(sellPos({ entryPrice: 18500, size: 1 }), 18600, 2000);
        expect(fill.pnl).toBeCloseTo(-101.8);
      });

      test('pnl scales with size and lotSize', async () => {
        const instrument = { ...US100, lotSize: 10 };
        const eng = new SimulatedExecution(instrument, { type: 'none' });

        // Entry 18501.8, exit 18600, size 2, lotSize 10
        // pnl = (18600 - 18501.8) * 2 * 10 = 1964
        const fill = await eng.executeClose(buyPos({ entryPrice: 18501.8, size: 2 }), 18600, 2000);
        expect(fill.pnl).toBeCloseTo(1964);
      });
    });

    // ========== TRIGGERS ==========

    describe('executeTrigger', () => {
      test('STOP_LOSS on BUY: fills at trigger price (no slippage)', async () => {
        const trigger: Trigger = { reason: 'STOP_LOSS', price: 18400 };
        const fill = await engine.executeTrigger(trigger, buyPos({ entryPrice: 18501.8 }), 2000);

        expect(fill.action).toBe('CLOSED');
        expect(fill.reason).toBe('STOP_LOSS');
        expect(fill.side).toBe('SELL');
        expect(fill.price).toBe(18400);
        // pnl = (18400 - 18501.8) * 1 * 1 = -101.8
        expect(fill.pnl).toBeCloseTo(-101.8);
      });

      test('STOP_LOSS on SELL: fills at trigger price', async () => {
        const trigger: Trigger = { reason: 'STOP_LOSS', price: 18600 };
        const fill = await engine.executeTrigger(trigger, sellPos({ entryPrice: 18500 }), 2000);

        expect(fill.reason).toBe('STOP_LOSS');
        expect(fill.side).toBe('BUY');
        expect(fill.price).toBe(18600);
        // pnl = (18500 - 18600) * 1 * 1 = -100
        expect(fill.pnl).toBe(-100);
      });

      test('TAKE_PROFIT on BUY: fills at exactly TP level', async () => {
        const trigger: Trigger = { reason: 'TAKE_PROFIT', price: 18600 };
        const fill = await engine.executeTrigger(trigger, buyPos({ entryPrice: 18501.8 }), 2000);

        expect(fill.reason).toBe('TAKE_PROFIT');
        expect(fill.price).toBe(18600);
        // pnl = (18600 - 18501.8) * 1 * 1 = 98.2
        expect(fill.pnl).toBeCloseTo(98.2);
      });

      test('TAKE_PROFIT on SELL: fills at exactly TP level', async () => {
        const trigger: Trigger = { reason: 'TAKE_PROFIT', price: 18400 };
        const fill = await engine.executeTrigger(trigger, sellPos({ entryPrice: 18500 }), 2000);

        expect(fill.reason).toBe('TAKE_PROFIT');
        expect(fill.price).toBe(18400);
        // pnl = (18500 - 18400) * 1 * 1 = 100
        expect(fill.pnl).toBe(100);
      });

      test('LIQUIDATION fills at trigger price', async () => {
        const trigger: Trigger = { reason: 'LIQUIDATION', price: 17500 };
        const fill = await engine.executeTrigger(trigger, buyPos({ entryPrice: 18501.8 }), 2000);

        expect(fill.reason).toBe('LIQUIDATION');
        expect(fill.price).toBe(17500);
        // pnl = (17500 - 18501.8) * 1 * 1 = -1001.8
        expect(fill.pnl).toBeCloseTo(-1001.8);
      });

      test('MARKET_CLOSE fills at trigger price', async () => {
        const trigger: Trigger = { reason: 'MARKET_CLOSE', price: 18550 };
        const fill = await engine.executeTrigger(trigger, buyPos({ entryPrice: 18501.8 }), 2000);

        expect(fill.reason).toBe('MARKET_CLOSE');
        expect(fill.price).toBe(18550);
      });
    });
  });

  // ========== SLIPPAGE ==========

  describe('fixed slippage', () => {
    let engine: SimulatedExecution;

    beforeEach(() => {
      engine = new SimulatedExecution(US100, { type: 'fixed', amount: 0.5 });
    });

    test('BUY open: slippage adds to price', async () => {
      const fill = await engine.executeOpen('BUY', 1, 18500, 1000);
      // 18500 + 1.8 spread + 0.5 slippage = 18502.3
      expect(fill.price).toBe(18502.3);
    });

    test('SELL open: slippage subtracts from price', async () => {
      const fill = await engine.executeOpen('SELL', 1, 18500, 1000);
      // 18500 - 0.5 = 18499.5
      expect(fill.price).toBe(18499.5);
    });

    test('BUY close (sell): slippage subtracts', async () => {
      const fill = await engine.executeClose(buyPos(), 18600, 2000);
      // 18600 - 0.5 = 18599.5
      expect(fill.price).toBe(18599.5);
    });

    test('SELL close (buy back): slippage adds', async () => {
      const fill = await engine.executeClose(sellPos(), 18400, 2000);
      // 18400 + 1.8 spread + 0.5 slippage = 18402.3
      expect(fill.price).toBe(18402.3);
    });

    test('STOP_LOSS on BUY: slips down (adverse)', async () => {
      const trigger: Trigger = { reason: 'STOP_LOSS', price: 18400 };
      const fill = await engine.executeTrigger(trigger, buyPos(), 2000);
      // 18400 - 0.5 = 18399.5
      expect(fill.price).toBe(18399.5);
    });

    test('STOP_LOSS on SELL: slips up (adverse)', async () => {
      const trigger: Trigger = { reason: 'STOP_LOSS', price: 18600 };
      const fill = await engine.executeTrigger(trigger, sellPos(), 2000);
      // 18600 + 0.5 = 18600.5
      expect(fill.price).toBe(18600.5);
    });

    test('TAKE_PROFIT: no slippage (limit order)', async () => {
      const trigger: Trigger = { reason: 'TAKE_PROFIT', price: 18600 };
      const fill = await engine.executeTrigger(trigger, buyPos(), 2000);
      // Exactly at TP level
      expect(fill.price).toBe(18600);
    });
  });

  describe('random slippage', () => {
    test('slippage is bounded by maxAmount', async () => {
      const engine = new SimulatedExecution(US100, { type: 'random', maxAmount: 2.0 });

      // Run many times and verify price is always within range
      const prices: number[] = [];
      for (let i = 0; i < 100; i++) {
        const fill = await engine.executeOpen('BUY', 1, 18500, 1000);
        prices.push(fill.price);
      }

      const baseAsk = 18500 + 1.8; // 18501.8
      for (const price of prices) {
        expect(price).toBeGreaterThanOrEqual(Math.round(baseAsk * 10) / 10);
        expect(price).toBeLessThanOrEqual(Math.round((baseAsk + 2.0) * 10) / 10);
      }
    });

    test('produces varying prices', async () => {
      const engine = new SimulatedExecution(US100, { type: 'random', maxAmount: 2.0 });

      const prices = new Set<number>();
      for (let i = 0; i < 50; i++) {
        const fill = await engine.executeOpen('BUY', 1, 18500, 1000);
        prices.add(fill.price);
      }

      // With 50 random fills, we should see more than 1 unique price
      expect(prices.size).toBeGreaterThan(1);
    });
  });

  // ========== EDGE CASES ==========

  describe('edge cases', () => {
    test('different lotSize affects pnl', async () => {
      const instrument = { ...US100, lotSize: 10 };
      const engine = new SimulatedExecution(instrument, { type: 'none' });

      const fill = await engine.executeClose(
        buyPos({ entryPrice: 18501.8, size: 1 }),
        18600,
        2000,
      );
      // pnl = (18600 - 18501.8) * 1 * 10 = 982
      expect(fill.pnl).toBeCloseTo(982);
    });

    test('different pricePrecision rounds correctly', async () => {
      const instrument = { ...US100, pricePrecision: 2 };
      const engine = new SimulatedExecution(instrument, { type: 'fixed', amount: 0.33 });

      const fill = await engine.executeOpen('BUY', 1, 18500, 1000);
      // 18500 + 1.8 + 0.33 = 18502.13 → rounded to 2 decimals = 18502.13
      expect(fill.price).toBe(18502.13);
    });

    test('zero-precision rounds to whole numbers', async () => {
      const instrument = { ...US100, pricePrecision: 0 };
      const engine = new SimulatedExecution(instrument, { type: 'none' });

      const fill = await engine.executeOpen('BUY', 1, 18500, 1000);
      // 18500 + 1.8 = 18501.8 → rounded to 0 decimals = 18502
      expect(fill.price).toBe(18502);
    });
  });
});
