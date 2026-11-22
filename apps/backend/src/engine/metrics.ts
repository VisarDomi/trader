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
  /** Annualized mean / stdev of period returns above 3-month T-bills ('tbills'); cash-free when absent. */
  sharpe: number;
  sortino: number;
  /** 'tbills' when Sharpe and Sortino measure returns above Treasury bills (EVIDENCE.md "Cash and inflation"). */
  riskFree?: 'tbills';
  /** With riskFree: the Sharpe of the returns themselves, which the backtest admission gate checks (pipeline.ts). */
  cashFreeSharpe?: number;
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
  avgBarsHeld: number | null;
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
  /** Overrides the arena's T-bill rates (null: cash-free). */
  riskFree?: RiskFree | null;
}

const DAYS_PER_YEAR = 365.25;

/** Cash return over [from, to] (rolled 3-month T-bills, arena/rates.ts), or null when the rates do not cover it. */
export type RiskFree = (from: number, to: number) => number | null;
let defaultRiskFree: RiskFree | null = null;
/** The arena sets this once its rates load; every metric computed afterwards measures Sharpe above T-bills. */
export function useRiskFree(riskFree: RiskFree | null): void {
  defaultRiskFree = riskFree;
}

/**
 * Sharpe and Sortino of an equity curve: annualized mean / stdev of each period's return above what T-bills paid
 * over that period. A curve the rates do not fully cover keeps the cash-free ratios (no `riskFree` flag).
 */
export function riskAdjusted(equity: readonly EquityPoint[], years: number, riskFree: RiskFree | null = defaultRiskFree):
  { sharpe: number; sortino: number; riskFree?: 'tbills'; cashFreeSharpe?: number } {
  const raw: number[] = [], excess: number[] = [];
  let covered = riskFree !== null;
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]!.equity;
    if (!(prev > 0)) continue;
    const r = equity[i]!.equity / prev - 1;
    raw.push(r);
    if (covered) {
      // A period with no time in it earns nothing (Capital's cash curve dates exits by day, so its first exit can
      // sit at or before the first deal's open).
      const from = equity[i - 1]!.t, to = equity[i]!.t, cash = to > from ? riskFree!(from, to) : 0;
      if (cash === null) covered = false;
      else excess.push(r - cash);
    }
  }
  const annualize = Math.sqrt(Math.max(years > 0 ? raw.length / years : 0, 1));
  const sharpe = (xs: number[]) => { const sd = stdev(xs); return round(sd > 0 ? (mean(xs) / sd) * annualize : 0, 4); };
  const sortino = (xs: number[]) => { const down = Math.sqrt(mean(xs.map(r => (r < 0 ? r * r : 0)))); return round(down > 0 ? (mean(xs) / down) * annualize : 0, 4); };
  if (!covered || !excess.length) return { sharpe: sharpe(raw), sortino: sortino(raw) };
  return { sharpe: sharpe(excess), sortino: sortino(excess), riskFree: 'tbills', cashFreeSharpe: sharpe(raw) };
}

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

  const risk = riskAdjusted(equity, years, input.riskFree === undefined ? defaultRiskFree : input.riskFree);

  const monthly = monthlyReturns(equity, initialCapital);
  const maxDrawdown = input.maxDrawdown;
  const knownHoldingBars = trades.filter(t => t.barsHeld >= 0 && !t.barsHeldPartial).map(t => t.barsHeld);

  return {
    startTime,
    endTime,
    days: round(days, 2),
    initialCapital,
    finalEquity: round(finalEquity, 2),
    totalReturn: round(totalReturn, 6),
    annualReturn: round(annualReturn, 6),
    maxDrawdown: round(maxDrawdown, 6),
    ...risk,
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
    avgBarsHeld: knownHoldingBars.length ? round(mean(knownHoldingBars), 2) : trades.length ? null : 0,
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
