/**
 * Performance metrics for one run (agent × instrument), shared by backtest
 * and demo so the two leaderboards are directly comparable.
 */
import type { Trade } from '../sdk/types.ts';
import { DAY_MS } from './clock.ts';

export interface EquityPoint {
  /** Start of the UTC day (or hour, for live curves), ms. */
  t: number;
  equity: number;
}

export interface MonthlyReturn {
  month: string;
  ret: number;
}

export interface RunMetrics {
  startTime: number;
  endTime: number;
  days: number;
  initialCapital: number;
  finalEquity: number;
  /** Fractions: 0.12 = +12%. */
  totalReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  trades: number;
  longTrades: number;
  shortTrades: number;
  winRate: number;
  profitFactor: number;
  avgTradePnl: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  /** mean / stdev * sqrt(n) of trade P&L — above ~2 the edge is unlikely to be luck. */
  tStat: number;
  avgBarsHeld: number;
  /** Fraction of time with an open position. */
  exposure: number;
  funding: number;
  profitableMonths: number;
  totalMonths: number;
  monthly: MonthlyReturn[];
}

export interface MetricsInput {
  trades: readonly Trade[];
  equity: readonly EquityPoint[];
  initialCapital: number;
  finalEquity: number;
  startTime: number;
  endTime: number;
  maxDrawdown: number;
  exposure: number;
}

const DAYS_PER_YEAR = 365.25;

export function computeMetrics(input: MetricsInput): RunMetrics {
  const { trades, equity, initialCapital, finalEquity, startTime, endTime } = input;
  const days = Math.max(0, (endTime - startTime) / DAY_MS);
  const years = days / DAYS_PER_YEAR;
  const totalReturn = initialCapital > 0 ? finalEquity / initialCapital - 1 : 0;
  const annualReturn = years > 0.05 && finalEquity > 0 ? Math.pow(finalEquity / initialCapital, 1 / years) - 1 : totalReturn;

  const pnls = trades.map(t => t.pnl);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const grossWin = sum(wins);
  const grossLoss = -sum(losses);

  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]!.equity;
    if (prev > 0) dailyReturns.push(equity[i]!.equity / prev - 1);
  }
  const periodsPerYear = years > 0 ? dailyReturns.length / years : 0;
  const meanR = mean(dailyReturns);
  const sdR = stdev(dailyReturns);
  const downside = Math.sqrt(mean(dailyReturns.map(r => (r < 0 ? r * r : 0))));
  const annualize = Math.sqrt(Math.max(periodsPerYear, 1));

  const monthly = monthlyReturns(equity, initialCapital);
  const maxDrawdown = input.maxDrawdown;

  return {
    startTime,
    endTime,
    days: round(days, 2),
    initialCapital,
    finalEquity: round(finalEquity, 2),
    totalReturn: round(totalReturn, 6),
    annualReturn: round(annualReturn, 6),
    maxDrawdown: round(maxDrawdown, 6),
    sharpe: round(sdR > 0 ? (meanR / sdR) * annualize : 0, 4),
    sortino: round(downside > 0 ? (meanR / downside) * annualize : 0, 4),
    calmar: round(maxDrawdown > 0 ? annualReturn / maxDrawdown : 0, 4),
    trades: trades.length,
    longTrades: trades.filter(t => t.side === 'long').length,
    shortTrades: trades.filter(t => t.side === 'short').length,
    winRate: round(trades.length > 0 ? wins.length / trades.length : 0, 4),
    profitFactor: round(grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0, 4),
    avgTradePnl: round(trades.length > 0 ? sum(pnls) / trades.length : 0, 4),
    avgWin: round(wins.length > 0 ? grossWin / wins.length : 0, 4),
    avgLoss: round(losses.length > 0 ? -grossLoss / losses.length : 0, 4),
    bestTrade: round(pnls.length > 0 ? Math.max(...pnls) : 0, 4),
    worstTrade: round(pnls.length > 0 ? Math.min(...pnls) : 0, 4),
    tStat: round(pnls.length > 1 && stdev(pnls) > 0 ? (mean(pnls) / stdev(pnls)) * Math.sqrt(pnls.length) : 0, 4),
    avgBarsHeld: round(trades.length > 0 ? mean(trades.map(t => t.barsHeld)) : 0, 2),
    exposure: round(input.exposure, 4),
    funding: round(sum(trades.map(t => t.funding)), 4),
    profitableMonths: monthly.filter(m => m.ret > 0).length,
    totalMonths: monthly.length,
    monthly,
  };
}

function monthlyReturns(equity: readonly EquityPoint[], initialCapital: number): MonthlyReturn[] {
  const out: MonthlyReturn[] = [];
  let prevEnd = initialCapital;
  let month = '';
  let lastEquity = initialCapital;
  for (const p of equity) {
    const m = new Date(p.t).toISOString().slice(0, 7);
    if (month && m !== month) {
      out.push({ month, ret: round(prevEnd > 0 ? lastEquity / prevEnd - 1 : 0, 6) });
      prevEnd = lastEquity;
    }
    month = m;
    lastEquity = p.equity;
  }
  if (month) out.push({ month, ret: round(prevEnd > 0 ? lastEquity / prevEnd - 1 : 0, 6) });
  return out;
}

function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

function mean(xs: readonly number[]): number {
  return xs.length > 0 ? sum(xs) / xs.length : 0;
}

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return Math.sqrt(v / (xs.length - 1));
}

function round(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}
