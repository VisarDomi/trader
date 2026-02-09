import type { Fill } from '../agent/types.ts';
import type { EquityPoint } from '../agent/AgentRunner.ts';

export interface Metrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  averageHoldTime: number;
  longestWinStreak: number;
  longestLoseStreak: number;
}

interface RoundTrip {
  openFill: Fill;
  closeFill: Fill;
  pnl: number;
  holdTime: number;
}

export class MetricsEngine {
  /**
   * Calculate performance metrics from fills and equity curve.
   *
   * Fills are paired into round-trip trades (OPENED → CLOSED).
   * Equity curve is used for drawdown and Sharpe calculation.
   */
  static calculate(fills: Fill[], equityCurve: EquityPoint[], initialCapital: number): Metrics {
    const roundTrips = this.buildRoundTrips(fills);

    const wins = roundTrips.filter(rt => rt.pnl > 0);
    const losses = roundTrips.filter(rt => rt.pnl <= 0);
    const totalTrades = roundTrips.length;

    const totalPnL = roundTrips.reduce((sum, rt) => sum + rt.pnl, 0);
    const grossProfit = wins.reduce((sum, rt) => sum + rt.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, rt) => sum + rt.pnl, 0));

    return {
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      winRate: totalTrades > 0 ? wins.length / totalTrades : 0,
      totalPnL,
      totalReturn: initialCapital > 0 ? totalPnL / initialCapital : 0,
      maxDrawdown: this.calcMaxDrawdown(equityCurve),
      sharpe: this.calcSharpe(equityCurve),
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      averageWin: wins.length > 0 ? grossProfit / wins.length : 0,
      averageLoss: losses.length > 0 ? -(grossLoss / losses.length) : 0,
      averageHoldTime: totalTrades > 0
        ? roundTrips.reduce((sum, rt) => sum + rt.holdTime, 0) / totalTrades
        : 0,
      longestWinStreak: this.longestStreak(roundTrips, true),
      longestLoseStreak: this.longestStreak(roundTrips, false),
    };
  }

  private static buildRoundTrips(fills: Fill[]): RoundTrip[] {
    const trips: RoundTrip[] = [];
    let pendingOpen: Fill | null = null;

    for (const fill of fills) {
      if (fill.action === 'OPENED') {
        pendingOpen = fill;
      } else if (fill.action === 'CLOSED' && pendingOpen) {
        trips.push({
          openFill: pendingOpen,
          closeFill: fill,
          pnl: fill.pnl ?? 0,
          holdTime: fill.timestamp - pendingOpen.timestamp,
        });
        pendingOpen = null;
      }
    }

    return trips;
  }

  /**
   * Max drawdown: largest peak-to-trough decline in equity, as a fraction.
   */
  private static calcMaxDrawdown(curve: EquityPoint[]): number {
    if (curve.length < 2) return 0;

    let peak = curve[0]!.equity;
    let maxDd = 0;

    for (const point of curve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const dd = (peak - point.equity) / peak;
      if (dd > maxDd) {
        maxDd = dd;
      }
    }

    return maxDd;
  }

  /**
   * Annualized Sharpe ratio from equity curve returns.
   *
   * Uses per-period returns (each equity point is one period).
   * Annualization assumes ~252 trading days * ~78 five-minute candles = ~19,656 periods/year
   * for 5m candles. We use the actual number of periods and assume 252*390 minute periods/year.
   */
  private static calcSharpe(curve: EquityPoint[]): number {
    if (curve.length < 3) return 0;

    const returns: number[] = [];
    for (let i = 1; i < curve.length; i++) {
      const prev = curve[i - 1]!.equity;
      if (prev === 0) continue;
      returns.push((curve[i]!.equity - prev) / prev);
    }

    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return mean > 0 ? Infinity : mean < 0 ? -Infinity : 0;

    // Annualize: assume each return period ≈ 1 minute of trading
    // ~98,280 trading minutes per year (252 days * 390 min)
    const periodsPerYear = 252 * 390;
    const annualizedReturn = mean * periodsPerYear;
    const annualizedStdDev = stdDev * Math.sqrt(periodsPerYear);

    return annualizedReturn / annualizedStdDev;
  }

  private static longestStreak(trips: RoundTrip[], winning: boolean): number {
    let max = 0;
    let current = 0;

    for (const trip of trips) {
      const isWin = trip.pnl > 0;
      if (isWin === winning) {
        current++;
        if (current > max) max = current;
      } else {
        current = 0;
      }
    }

    return max;
  }
}
