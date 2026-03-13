import { test, expect, describe, beforeEach } from 'bun:test';
import { PositionMonitor } from './PositionMonitor.ts';
import type { Position } from '../agent/types.ts';

function buyPosition(overrides: Partial<Position> = {}): Position {
  return {
    direction: 'BUY',
    size: 1,
    entryPrice: 18500,
    entryTime: 1000,
    unrealizedPnL: 0,
    ...overrides,
  };
}

function sellPosition(overrides: Partial<Position> = {}): Position {
  return {
    direction: 'SELL',
    size: 1,
    entryPrice: 18500,
    entryTime: 1000,
    unrealizedPnL: 0,
    ...overrides,
  };
}

describe('PositionMonitor', () => {
  let monitor: PositionMonitor;

  beforeEach(() => {
    monitor = new PositionMonitor();
  });

  describe('no position', () => {
    test('check returns null', () => {
      expect(monitor.check(18500, 18501.8, 10000)).toBeNull();
    });

    test('checkCandle returns null', () => {
      expect(monitor.checkCandle(18400, 18600, 1.8, 10000)).toBeNull();
    });
  });

  // ============================================
  // TICK-LEVEL CHECKS (live mode)
  // ============================================

  describe('check (tick-level)', () => {
    describe('BUY position', () => {
      test('stop loss triggers when bid <= stopLoss', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));

        // Bid at stop level exactly
        const trigger = monitor.check(18400, 18401.8, 10000);
        expect(trigger).not.toBeNull();
        expect(trigger!.reason).toBe('STOP_LOSS');
        expect(trigger!.price).toBe(18400);
      });

      test('stop loss triggers when bid below stopLoss', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));

        const trigger = monitor.check(18390, 18391.8, 10000);
        expect(trigger).not.toBeNull();
        expect(trigger!.reason).toBe('STOP_LOSS');
        expect(trigger!.price).toBe(18400); // trigger at stop level
      });

      test('stop loss does not trigger above level', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));
        expect(monitor.check(18401, 18402.8, 10000)).toBeNull();
      });

      test('take profit triggers when bid >= takeProfit', () => {
        monitor.setPosition(buyPosition({ takeProfit: 18600 }));

        const trigger = monitor.check(18600, 18601.8, 10000);
        expect(trigger).not.toBeNull();
        expect(trigger!.reason).toBe('TAKE_PROFIT');
        expect(trigger!.price).toBe(18600);
      });

      test('take profit triggers when bid above takeProfit', () => {
        monitor.setPosition(buyPosition({ takeProfit: 18600 }));

        const trigger = monitor.check(18620, 18621.8, 10000);
        expect(trigger!.reason).toBe('TAKE_PROFIT');
        expect(trigger!.price).toBe(18600);
      });

      test('take profit does not trigger below level', () => {
        monitor.setPosition(buyPosition({ takeProfit: 18600 }));
        expect(monitor.check(18599, 18600.8, 10000)).toBeNull();
      });

      test('no stops set — always returns null', () => {
        monitor.setPosition(buyPosition());
        expect(monitor.check(18000, 18001.8, 10000)).toBeNull();
        expect(monitor.check(19000, 19001.8, 10000)).toBeNull();
      });
    });

    describe('SELL position', () => {
      test('stop loss triggers when ask >= stopLoss', () => {
        monitor.setPosition(sellPosition({ stopLoss: 18600 }));

        const trigger = monitor.check(18598.2, 18600, 10000);
        expect(trigger).not.toBeNull();
        expect(trigger!.reason).toBe('STOP_LOSS');
        expect(trigger!.price).toBe(18600);
      });

      test('stop loss triggers when ask above stopLoss', () => {
        monitor.setPosition(sellPosition({ stopLoss: 18600 }));

        const trigger = monitor.check(18608.2, 18610, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
      });

      test('stop loss does not trigger below level', () => {
        monitor.setPosition(sellPosition({ stopLoss: 18600 }));
        expect(monitor.check(18597.2, 18599, 10000)).toBeNull();
      });

      test('take profit triggers when ask <= takeProfit', () => {
        monitor.setPosition(sellPosition({ takeProfit: 18400 }));

        const trigger = monitor.check(18398.2, 18400, 10000);
        expect(trigger).not.toBeNull();
        expect(trigger!.reason).toBe('TAKE_PROFIT');
        expect(trigger!.price).toBe(18400);
      });

      test('take profit triggers when ask below takeProfit', () => {
        monitor.setPosition(sellPosition({ takeProfit: 18400 }));

        const trigger = monitor.check(18388.2, 18390, 10000);
        expect(trigger!.reason).toBe('TAKE_PROFIT');
      });

      test('take profit does not trigger above level', () => {
        monitor.setPosition(sellPosition({ takeProfit: 18400 }));
        expect(monitor.check(18399.2, 18401, 10000)).toBeNull();
      });
    });

    describe('pessimistic execution', () => {
      test('BUY: stop wins when both stop and TP trigger', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400, takeProfit: 18600 }));

        // Bid at 18400 (hits stop) and also >= 18600 is impossible in a tick,
        // but in a candle scenario we test with checkCandle.
        // For tick: bid exactly at stop
        const trigger = monitor.check(18400, 18401.8, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
      });

      test('SELL: stop wins when both stop and TP trigger', () => {
        monitor.setPosition(sellPosition({ stopLoss: 18600, takeProfit: 18400 }));

        // Ask at 18600 (hits stop)
        const trigger = monitor.check(18598.2, 18600, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
      });
    });

    describe('account-level liquidation', () => {
      test('triggers when equity <= 0 (BUY)', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));

        const trigger = monitor.check(18000, 18001.8, 0);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(18000); // exit at bid
      });

      test('triggers when equity negative (SELL)', () => {
        monitor.setPosition(sellPosition({ stopLoss: 18600 }));

        const trigger = monitor.check(19000, 19001.8, -500);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(19001.8); // exit at ask
      });

      test('liquidation takes priority over stop loss', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));

        // Bid hits stop AND equity is zero
        const trigger = monitor.check(18400, 18401.8, 0);
        expect(trigger!.reason).toBe('LIQUIDATION');
      });

      test('does not trigger with positive equity', () => {
        monitor.setPosition(buyPosition());
        expect(monitor.check(18000, 18001.8, 1)).toBeNull();
      });
    });

    describe('margin liquidation', () => {
      // BUY at 18500, 200× leverage → liquidation at 18500 × (1 - 0.5/200) = 18453.75
      const ENTRY = 18500;
      const LIQ_BUY_200 = ENTRY * (1 - 0.5 / 200); // 18453.75
      // BUY at 18500, 20× leverage → liquidation at 18500 × (1 - 0.5/20) = 18037.50
      const LIQ_BUY_20 = ENTRY * (1 - 0.5 / 20);   // 18037.50
      // SELL at 18500, 200× leverage → liquidation at 18500 × (1 + 0.5/200) = 18546.25
      const LIQ_SELL_200 = ENTRY * (1 + 0.5 / 200);

      test('BUY 200× triggers on small adverse move', () => {
        monitor.setPosition(buyPosition(), LIQ_BUY_200);

        // Bid below liquidation price
        const trigger = monitor.check(18450, 18451.8, 10000);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(LIQ_BUY_200);
      });

      test('BUY 20× does NOT trigger on same small move', () => {
        monitor.setPosition(buyPosition(), LIQ_BUY_20);

        // Same bid=18450, but 20× liquidation is at 18037.50, not hit
        expect(monitor.check(18450, 18451.8, 10000)).toBeNull();
      });

      test('SELL 200× triggers on small adverse move', () => {
        monitor.setPosition(sellPosition(), LIQ_SELL_200);

        // Ask above liquidation price
        const trigger = monitor.check(18548, 18550, 10000);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(LIQ_SELL_200);
      });

      test('margin liquidation takes priority over SL', () => {
        // SL at 18400, but margin liquidation at 18453.75 (200×) triggers first
        monitor.setPosition(buyPosition({ stopLoss: 18400 }), LIQ_BUY_200);

        const trigger = monitor.check(18440, 18441.8, 10000);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(LIQ_BUY_200);
      });

      test('SL triggers before margin liquidation at low leverage', () => {
        // SL at 18400, margin liquidation at 18037.50 (20×) → SL triggers first
        monitor.setPosition(buyPosition({ stopLoss: 18400 }), LIQ_BUY_20);

        const trigger = monitor.check(18390, 18391.8, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
        expect(trigger!.price).toBe(18400);
      });

      test('no liquidation price set — falls through to SL/TP', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));

        const trigger = monitor.check(18390, 18391.8, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
      });
    });
  });

  // ============================================
  // CANDLE-LEVEL CHECKS (backtest mode)
  // ============================================

  describe('checkCandle (backtest)', () => {
    const SPREAD = 1.8;

    describe('BUY position', () => {
      test('stop triggers when candle low <= stopLoss', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));

        const trigger = monitor.checkCandle(18395, 18550, SPREAD, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
        expect(trigger!.price).toBe(18400);
      });

      test('stop does not trigger when candle low above stopLoss', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }));

        expect(monitor.checkCandle(18401, 18550, SPREAD, 10000)).toBeNull();
      });

      test('TP triggers when candle high >= takeProfit', () => {
        monitor.setPosition(buyPosition({ takeProfit: 18600 }));

        const trigger = monitor.checkCandle(18450, 18610, SPREAD, 10000);
        expect(trigger!.reason).toBe('TAKE_PROFIT');
        expect(trigger!.price).toBe(18600);
      });

      test('TP does not trigger when candle high below takeProfit', () => {
        monitor.setPosition(buyPosition({ takeProfit: 18600 }));
        expect(monitor.checkCandle(18450, 18599, SPREAD, 10000)).toBeNull();
      });

      test('pessimistic: stop wins when candle spans both levels', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400, takeProfit: 18600 }));

        // Wide candle: low hits stop AND high hits TP
        const trigger = monitor.checkCandle(18390, 18610, SPREAD, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
      });
    });

    describe('SELL position (ask-side via spread)', () => {
      test('stop triggers when candle high + spread >= stopLoss', () => {
        // SELL stop at 18600. Candle high is 18599, ask high = 18599 + 1.8 = 18600.8
        monitor.setPosition(sellPosition({ stopLoss: 18600 }));

        const trigger = monitor.checkCandle(18450, 18599, SPREAD, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
      });

      test('stop does not trigger when ask high below stopLoss', () => {
        monitor.setPosition(sellPosition({ stopLoss: 18600 }));

        // Candle high 18597, ask high = 18597 + 1.8 = 18598.8 < 18600
        expect(monitor.checkCandle(18450, 18597, SPREAD, 10000)).toBeNull();
      });

      test('TP triggers when candle low + spread <= takeProfit', () => {
        // SELL TP at 18400. Candle low is 18397, ask low = 18397 + 1.8 = 18398.8
        monitor.setPosition(sellPosition({ takeProfit: 18400 }));

        const trigger = monitor.checkCandle(18397, 18550, SPREAD, 10000);
        expect(trigger!.reason).toBe('TAKE_PROFIT');
      });

      test('TP does not trigger when ask low above takeProfit', () => {
        monitor.setPosition(sellPosition({ takeProfit: 18400 }));

        // Candle low 18399, ask low = 18399 + 1.8 = 18400.8 > 18400
        expect(monitor.checkCandle(18399, 18550, SPREAD, 10000)).toBeNull();
      });

      test('pessimistic: stop wins when candle spans both levels', () => {
        monitor.setPosition(sellPosition({ stopLoss: 18600, takeProfit: 18400 }));

        // Wide candle covers both: ask high hits stop, ask low hits TP
        const trigger = monitor.checkCandle(18350, 18650, SPREAD, 10000);
        expect(trigger!.reason).toBe('STOP_LOSS');
      });
    });

    describe('account-level liquidation in candle', () => {
      test('triggers before checking stops', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400, takeProfit: 18600 }));

        const trigger = monitor.checkCandle(18390, 18610, SPREAD, 0);
        expect(trigger!.reason).toBe('LIQUIDATION');
      });

      test('BUY liquidation price is candle low', () => {
        monitor.setPosition(buyPosition());

        const trigger = monitor.checkCandle(18200, 18550, SPREAD, -100);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(18200);
      });

      test('SELL liquidation price is candle high + spread', () => {
        monitor.setPosition(sellPosition());

        const trigger = monitor.checkCandle(18200, 18550, SPREAD, -100);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(18550 + SPREAD);
      });
    });

    describe('margin liquidation in candle', () => {
      const ENTRY = 18500;
      const LIQ_BUY_200 = ENTRY * (1 - 0.5 / 200); // 18453.75

      test('BUY triggers when candle low breaches liquidation price', () => {
        monitor.setPosition(buyPosition(), LIQ_BUY_200);

        const trigger = monitor.checkCandle(18440, 18520, SPREAD, 10000);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(LIQ_BUY_200);
      });

      test('BUY does not trigger when candle low stays above liquidation price', () => {
        monitor.setPosition(buyPosition(), LIQ_BUY_200);

        // Candle low at 18460, above 18453.75
        expect(monitor.checkCandle(18460, 18520, SPREAD, 10000)).toBeNull();
      });

      test('SELL triggers when candle high + spread breaches liquidation price', () => {
        const LIQ_SELL_200 = ENTRY * (1 + 0.5 / 200); // 18546.25
        monitor.setPosition(sellPosition(), LIQ_SELL_200);

        // candleHigh + spread = 18545 + 1.8 = 18546.8 >= 18546.25
        const trigger = monitor.checkCandle(18480, 18545, SPREAD, 10000);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(LIQ_SELL_200);
      });

      test('margin liquidation beats SL in candle', () => {
        monitor.setPosition(buyPosition({ stopLoss: 18400 }), LIQ_BUY_200);

        // Candle spans both: low hits margin liq (18453.75) AND SL (18400)
        const trigger = monitor.checkCandle(18390, 18520, SPREAD, 10000);
        expect(trigger!.reason).toBe('LIQUIDATION');
        expect(trigger!.price).toBe(LIQ_BUY_200);
      });
    });
  });

  // ============================================
  // POSITION LIFECYCLE
  // ============================================

  describe('position lifecycle', () => {
    test('setPosition to null clears monitoring', () => {
      monitor.setPosition(buyPosition({ stopLoss: 18400 }));
      monitor.setPosition(null);

      expect(monitor.check(18300, 18301.8, 10000)).toBeNull();
    });

    test('setPosition updates to new position', () => {
      monitor.setPosition(buyPosition({ stopLoss: 18400 }));
      monitor.setPosition(buyPosition({ stopLoss: 18300 }));

      // Old stop (18400) should NOT trigger
      expect(monitor.check(18400, 18401.8, 10000)).toBeNull();

      // New stop (18300) should trigger
      expect(monitor.check(18300, 18301.8, 10000)!.reason).toBe('STOP_LOSS');
    });

    test('getPosition returns current state', () => {
      expect(monitor.getPosition()).toBeNull();

      const pos = buyPosition();
      monitor.setPosition(pos);
      expect(monitor.getPosition()).toBe(pos);
    });
  });
});
