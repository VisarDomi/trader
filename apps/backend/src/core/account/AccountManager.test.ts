import { test, expect, describe, beforeEach } from 'bun:test';
import { AccountManager } from './AccountManager.ts';
import type { Fill, InstrumentInfo } from '../agent/types.ts';

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

function openFill(overrides: Partial<Fill> = {}): Fill {
  return {
    action: 'OPENED',
    reason: 'ORDER',
    side: 'BUY',
    size: 1,
    price: 18500,
    timestamp: 1000,
    ...overrides,
  };
}

function closeFill(overrides: Partial<Fill> = {}): Fill {
  return {
    action: 'CLOSED',
    reason: 'ORDER',
    side: 'SELL',
    size: 1,
    price: 18600,
    timestamp: 2000,
    pnl: 100,
    ...overrides,
  };
}

describe('AccountManager', () => {
  let account: AccountManager;

  beforeEach(() => {
    account = new AccountManager(10000, US100);
  });

  describe('initial state', () => {
    test('starts with correct capital', () => {
      const snap = account.getSnapshot();
      expect(snap.balance).toBe(10000);
      expect(snap.equity).toBe(10000);
      expect(snap.available).toBe(10000);
      expect(snap.margin).toBe(0);
    });

    test('has no position', () => {
      expect(account.hasPosition()).toBe(false);
    });
  });

  describe('onOpen', () => {
    test('locks margin on BUY', () => {
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));

      const snap = account.getSnapshot();
      // margin = (1 * 18500 * 1) / 200 = 92.5
      expect(snap.margin).toBe(92.5);
      expect(snap.balance).toBe(10000);
      expect(snap.equity).toBe(10000);
      expect(snap.available).toBe(10000 - 92.5);
    });

    test('locks margin on SELL', () => {
      account.onOpen(openFill({ side: 'SELL', size: 2, price: 18500 }));

      const snap = account.getSnapshot();
      // margin = (2 * 18500 * 1) / 200 = 185
      expect(snap.margin).toBe(185);
      expect(account.hasPosition()).toBe(true);
    });

    test('throws if position already open', () => {
      account.onOpen(openFill());
      expect(() => account.onOpen(openFill())).toThrow('already have an open position');
    });

    test('throws on wrong fill action', () => {
      expect(() => account.onOpen(closeFill() as Fill)).toThrow('Expected OPENED fill');
    });
  });

  describe('onClose', () => {
    test('realizes profit', () => {
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      account.onClose(closeFill({ pnl: 100 }));

      const snap = account.getSnapshot();
      expect(snap.balance).toBe(10100);
      expect(snap.margin).toBe(0);
      expect(snap.equity).toBe(10100);
      expect(snap.available).toBe(10100);
      expect(account.hasPosition()).toBe(false);
    });

    test('realizes loss', () => {
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      account.onClose(closeFill({ pnl: -200 }));

      const snap = account.getSnapshot();
      expect(snap.balance).toBe(9800);
      expect(snap.equity).toBe(9800);
    });

    test('throws if no position', () => {
      expect(() => account.onClose(closeFill())).toThrow('no open position');
    });

    test('throws if pnl missing', () => {
      account.onOpen(openFill());
      const fill = closeFill();
      delete (fill as Record<string, unknown>).pnl;
      expect(() => account.onClose(fill)).toThrow('must include pnl');
    });
  });

  describe('updatePrice', () => {
    test('calculates unrealized P&L for BUY (profit)', () => {
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      // Price went up, bid is 18600
      account.updatePrice(18600, 18601.8);

      const snap = account.getSnapshot();
      // pnl = (18600 - 18500) * 1 * 1 = 100
      expect(snap.equity).toBe(10100);
      expect(snap.balance).toBe(10000); // balance unchanged until close
    });

    test('calculates unrealized P&L for BUY (loss)', () => {
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      // Price dropped, bid is 18400
      account.updatePrice(18400, 18401.8);

      const snap = account.getSnapshot();
      // pnl = (18400 - 18500) * 1 * 1 = -100
      expect(snap.equity).toBe(9900);
    });

    test('calculates unrealized P&L for SELL (profit)', () => {
      account.onOpen(openFill({ side: 'SELL', size: 1, price: 18500 }));
      // Price dropped, ask is 18401.8
      account.updatePrice(18400, 18401.8);

      const snap = account.getSnapshot();
      // pnl = (18500 - 18401.8) * 1 * 1 = 98.2
      expect(snap.equity).toBeCloseTo(10098.2);
    });

    test('calculates unrealized P&L for SELL (loss)', () => {
      account.onOpen(openFill({ side: 'SELL', size: 1, price: 18500 }));
      // Price went up, ask is 18601.8
      account.updatePrice(18600, 18601.8);

      const snap = account.getSnapshot();
      // pnl = (18500 - 18601.8) * 1 * 1 = -101.8
      expect(snap.equity).toBeCloseTo(9898.2);
    });

    test('respects lotSize', () => {
      const instrument = { ...US100, lotSize: 10 };
      const acc = new AccountManager(10000, instrument);
      acc.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      acc.updatePrice(18600, 18601.8);

      // pnl = (18600 - 18500) * 1 * 10 = 1000
      expect(acc.getSnapshot().equity).toBe(11000);
    });

    test('no-op when no position', () => {
      account.updatePrice(18600, 18601.8);
      expect(account.getSnapshot().equity).toBe(10000);
    });

    test('affects available', () => {
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      account.updatePrice(18600, 18601.8);

      const snap = account.getSnapshot();
      // available = balance - margin + unrealizedPnL = 10000 - 92.5 + 100 = 10007.5
      expect(snap.available).toBe(10007.5);
    });

    test('available floors at 0', () => {
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      // Massive loss: bid drops to 8000
      account.updatePrice(8000, 8001.8);

      const snap = account.getSnapshot();
      // unrealizedPnL = (8000 - 18500) * 1 * 1 = -10500
      // available = 10000 - 92.5 + (-10500) = -592.5 → floored to 0
      expect(snap.available).toBe(0);
    });
  });

  describe('calculatePnL', () => {
    test('calculates BUY pnl at exit price', () => {
      account.onOpen(openFill({ side: 'BUY', size: 2, price: 18500 }));
      expect(account.calculatePnL(18600)).toBe(200);
      expect(account.calculatePnL(18400)).toBe(-200);
    });

    test('calculates SELL pnl at exit price', () => {
      account.onOpen(openFill({ side: 'SELL', size: 2, price: 18500 }));
      expect(account.calculatePnL(18400)).toBe(200);
      expect(account.calculatePnL(18600)).toBe(-200);
    });

    test('throws if no position', () => {
      expect(() => account.calculatePnL(18500)).toThrow('no open position');
    });
  });

  describe('full lifecycle', () => {
    test('open → price updates → close → correct final balance', () => {
      // Open BUY at 18500
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      expect(account.getSnapshot().margin).toBe(92.5);

      // Price moves around
      account.updatePrice(18550, 18551.8);
      expect(account.getSnapshot().equity).toBe(10050);

      account.updatePrice(18400, 18401.8);
      expect(account.getSnapshot().equity).toBe(9900);

      // Close at 18600 with pnl = 100
      account.onClose(closeFill({ pnl: 100 }));

      const snap = account.getSnapshot();
      expect(snap.balance).toBe(10100);
      expect(snap.margin).toBe(0);
      expect(snap.equity).toBe(10100);
      expect(snap.available).toBe(10100);
    });

    test('multiple trades accumulate', () => {
      // Trade 1: +100
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      account.onClose(closeFill({ pnl: 100 }));

      // Trade 2: -50
      account.onOpen(openFill({ side: 'SELL', size: 1, price: 18500 }));
      account.onClose(closeFill({ side: 'BUY', pnl: -50 }));

      // Trade 3: +200
      account.onOpen(openFill({ side: 'BUY', size: 1, price: 18500 }));
      account.onClose(closeFill({ pnl: 200 }));

      expect(account.getSnapshot().balance).toBe(10250);
    });
  });
});
