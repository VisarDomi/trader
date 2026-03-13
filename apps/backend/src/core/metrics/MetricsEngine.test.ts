import { test, expect, describe } from 'bun:test';
import { MetricsEngine } from './MetricsEngine.ts';
import type { Fill } from '../agent/types.ts';
import type { EquityPoint } from '../agent/AgentRunner.ts';

function openFill(timestamp: number, price: number = 18500): Fill {
  return { action: 'OPENED', reason: 'ORDER', side: 'BUY', size: 1, price, timestamp };
}

function closeFill(timestamp: number, pnl: number, reason: Fill['reason'] = 'ORDER'): Fill {
  return { action: 'CLOSED', reason, side: 'SELL', size: 1, price: 18500, timestamp, pnl };
}

function curve(points: [number, number][]): EquityPoint[] {
  return points.map(([timestamp, equity]) => ({ timestamp, equity, balance: equity }));
}

describe('MetricsEngine', () => {
  describe('no trades', () => {
    test('returns zeroes', () => {
      const m = MetricsEngine.calculate([], curve([[0, 10000]]), 10000);

      expect(m.totalTrades).toBe(0);
      expect(m.wins).toBe(0);
      expect(m.losses).toBe(0);
      expect(m.winRate).toBe(0);
      expect(m.totalPnL).toBe(0);
      expect(m.totalReturn).toBe(0);
      expect(m.maxDrawdown).toBe(0);
      expect(m.profitFactor).toBe(0);
      expect(m.averageWin).toBe(0);
      expect(m.averageLoss).toBe(0);
      expect(m.averageHoldTime).toBe(0);
      expect(m.longestWinStreak).toBe(0);
      expect(m.longestLoseStreak).toBe(0);
    });
  });

  describe('basic metrics', () => {
    const fills: Fill[] = [
      openFill(1000), closeFill(2000, 100),   // win +100
      openFill(3000), closeFill(4000, -50),    // loss -50
      openFill(5000), closeFill(6000, 200),    // win +200
      openFill(7000), closeFill(8000, -30),    // loss -30
      openFill(9000), closeFill(10000, 80),    // win +80
    ];
    const ec = curve([[0, 10000], [2000, 10100], [4000, 10050], [6000, 10250], [8000, 10220], [10000, 10300]]);

    test('totalTrades', () => {
      expect(MetricsEngine.calculate(fills, ec, 10000).totalTrades).toBe(5);
    });

    test('wins and losses', () => {
      const m = MetricsEngine.calculate(fills, ec, 10000);
      expect(m.wins).toBe(3);
      expect(m.losses).toBe(2);
    });

    test('winRate', () => {
      expect(MetricsEngine.calculate(fills, ec, 10000).winRate).toBeCloseTo(0.6);
    });

    test('totalPnL', () => {
      // 100 - 50 + 200 - 30 + 80 = 300
      expect(MetricsEngine.calculate(fills, ec, 10000).totalPnL).toBe(300);
    });

    test('totalReturn', () => {
      // 300 / 10000 = 0.03
      expect(MetricsEngine.calculate(fills, ec, 10000).totalReturn).toBeCloseTo(0.03);
    });

    test('profitFactor', () => {
      // gross profit = 100 + 200 + 80 = 380
      // gross loss = 50 + 30 = 80
      // factor = 380 / 80 = 4.75
      expect(MetricsEngine.calculate(fills, ec, 10000).profitFactor).toBeCloseTo(4.75);
    });

    test('averageWin', () => {
      // (100 + 200 + 80) / 3 = 126.67
      expect(MetricsEngine.calculate(fills, ec, 10000).averageWin).toBeCloseTo(126.67, 1);
    });

    test('averageLoss', () => {
      // -(50 + 30) / 2 = -40
      expect(MetricsEngine.calculate(fills, ec, 10000).averageLoss).toBeCloseTo(-40);
    });

    test('averageHoldTime', () => {
      // Each trade held for 1000ms, 5 trades → average 1000
      expect(MetricsEngine.calculate(fills, ec, 10000).averageHoldTime).toBe(1000);
    });
  });

  describe('streaks', () => {
    test('win streak', () => {
      const fills: Fill[] = [
        openFill(1000), closeFill(2000, 100),   // W
        openFill(3000), closeFill(4000, 50),    // W
        openFill(5000), closeFill(6000, 80),    // W
        openFill(7000), closeFill(8000, -30),   // L
        openFill(9000), closeFill(10000, 60),   // W
      ];
      const ec = curve([[0, 10000]]);
      const m = MetricsEngine.calculate(fills, ec, 10000);
      expect(m.longestWinStreak).toBe(3);
    });

    test('lose streak', () => {
      const fills: Fill[] = [
        openFill(1000), closeFill(2000, 100),    // W
        openFill(3000), closeFill(4000, -50),   // L
        openFill(5000), closeFill(6000, -80),   // L
        openFill(7000), closeFill(8000, -30),   // L
        openFill(9000), closeFill(10000, -10),  // L
        openFill(11000), closeFill(12000, 60),  // W
      ];
      const ec = curve([[0, 10000]]);
      const m = MetricsEngine.calculate(fills, ec, 10000);
      expect(m.longestLoseStreak).toBe(4);
    });
  });

  describe('max drawdown', () => {
    test('simple drawdown', () => {
      // Peak at 10500, trough at 10200
      // DD = (10500 - 10200) / 10500 = 0.02857
      const ec = curve([
        [0, 10000], [1, 10500], [2, 10200], [3, 10400],
      ]);
      const m = MetricsEngine.calculate([], ec, 10000);
      expect(m.maxDrawdown).toBeCloseTo(300 / 10500, 4);
    });

    test('no drawdown on steady increase', () => {
      const ec = curve([[0, 10000], [1, 10100], [2, 10200], [3, 10300]]);
      expect(MetricsEngine.calculate([], ec, 10000).maxDrawdown).toBe(0);
    });

    test('deepest drawdown wins', () => {
      // First dip: 10500 → 10300 (200, 1.9%)
      // Second dip: 10800 → 10200 (600, 5.6%)
      const ec = curve([
        [0, 10000], [1, 10500], [2, 10300], [3, 10800], [4, 10200], [5, 10900],
      ]);
      const m = MetricsEngine.calculate([], ec, 10000);
      expect(m.maxDrawdown).toBeCloseTo(600 / 10800, 4);
    });

    test('total wipeout', () => {
      const ec = curve([[0, 10000], [1, 5000], [2, 0]]);
      expect(MetricsEngine.calculate([], ec, 10000).maxDrawdown).toBe(1);
    });
  });

  describe('profit factor edge cases', () => {
    test('all wins → Infinity', () => {
      const fills: Fill[] = [
        openFill(1000), closeFill(2000, 100),
        openFill(3000), closeFill(4000, 50),
      ];
      const m = MetricsEngine.calculate(fills, curve([[0, 10000]]), 10000);
      expect(m.profitFactor).toBe(Infinity);
    });

    test('all losses → 0', () => {
      const fills: Fill[] = [
        openFill(1000), closeFill(2000, -100),
        openFill(3000), closeFill(4000, -50),
      ];
      const m = MetricsEngine.calculate(fills, curve([[0, 10000]]), 10000);
      expect(m.profitFactor).toBe(0);
    });

    test('breakeven loss counts as loss', () => {
      const fills: Fill[] = [
        openFill(1000), closeFill(2000, 0), // pnl=0 is a loss (not > 0)
      ];
      const m = MetricsEngine.calculate(fills, curve([[0, 10000]]), 10000);
      expect(m.wins).toBe(0);
      expect(m.losses).toBe(1);
    });
  });

  describe('sharpe ratio', () => {
    test('positive for upward equity', () => {
      // Steadily increasing equity
      const ec = curve(Array.from({ length: 100 }, (_, i) => [i, 10000 + i * 10] as [number, number]));
      const m = MetricsEngine.calculate([], ec, 10000);
      expect(m.sharpe).toBeGreaterThan(0);
    });

    test('negative for downward equity', () => {
      const ec = curve(Array.from({ length: 100 }, (_, i) => [i, 10000 - i * 10] as [number, number]));
      const m = MetricsEngine.calculate([], ec, 10000);
      expect(m.sharpe).toBeLessThan(0);
    });

    test('zero for flat equity', () => {
      const ec = curve(Array.from({ length: 100 }, (_, i) => [i, 10000] as [number, number]));
      const m = MetricsEngine.calculate([], ec, 10000);
      // Flat returns, zero stddev → 0 (or could be Infinity, but mean is also 0)
      expect(m.sharpe).toBe(0);
    });

    test('insufficient data returns 0', () => {
      const ec = curve([[0, 10000], [1, 10100]]);
      expect(MetricsEngine.calculate([], ec, 10000).sharpe).toBe(0);
    });
  });

  describe('hold time', () => {
    test('varying hold times averaged', () => {
      const fills: Fill[] = [
        openFill(1000), closeFill(2000, 50),     // 1000ms
        openFill(3000), closeFill(6000, -20),    // 3000ms
        openFill(7000), closeFill(17000, 100),   // 10000ms
      ];
      const m = MetricsEngine.calculate(fills, curve([[0, 10000]]), 10000);
      // (1000 + 3000 + 10000) / 3 = 4666.67
      expect(m.averageHoldTime).toBeCloseTo(4666.67, 0);
    });
  });

  describe('unpaired fills', () => {
    test('open without close is ignored', () => {
      const fills: Fill[] = [
        openFill(1000), closeFill(2000, 100),
        openFill(3000), // no close — still in position
      ];
      const m = MetricsEngine.calculate(fills, curve([[0, 10000]]), 10000);
      expect(m.totalTrades).toBe(1); // only the completed round trip
    });
  });
});
