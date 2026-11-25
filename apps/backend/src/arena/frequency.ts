/**
 * How often a record's result happened in its own backtest (EVIDENCE.md "How often the backtest did this").
 *
 * The backtest of the same agent version, instrument and leverage is cut into every period as long as the record
 * has lived, one per stored day a period can start on, and the periods that did at least as well (and at most as
 * well) as the record are counted. It reads only the backtest's stored daily equity: no sampling, no random numbers.
 * Periods overlap, so neighbours share most of their days; `independent` says how many fit end to end.
 */
import type { BacktestFrequency, BacktestPeriods } from '@trader/shared/types';

const DAY = 86_400_000;
/** Fewer periods than this, or fewer than four end to end, say too little to count. */
export const MIN_PERIODS = 30;
export const MIN_INDEPENDENT = 4;
/** Equal within rounding of stored equity counts on both sides. */
const TIE = 1e-9;

/** A backtest's daily equity, ascending by time. */
export interface Curve { t: Float64Array; equity: Float64Array }

export function curveOf(points: readonly { t: number; equity: number }[]): Curve {
  return { t: Float64Array.from(points, p => p.t), equity: Float64Array.from(points, p => p.equity) };
}

/** A record's age in whole days, at least one: the daily curve cannot tell shorter periods apart. */
export const periodDays = (from: number, through: number): number => Math.max(1, Math.round((through - from) / DAY));

/** Calls `each(end, return)` for every period of `days` that starts on a stored day with money left and ends inside the curve. */
function eachPeriod(curve: Curve, days: number, each: (end: number, ret: number) => void): void {
  const { t, equity } = curve, n = t.length, last = n ? t[n - 1]! : 0;
  for (let i = 0, j = 0; i < n; i++) {
    const end = t[i]! + days * DAY;
    if (end > last) break;
    if (!(equity[i]! > 0)) continue;
    // The equity at the end of the period is the latest stored day at or before it (weekends store nothing).
    while (j + 1 < n && t[j + 1]! <= end) j++;
    each(end, equity[j]! / equity[i]! - 1);
  }
}

/** Counts the backtest's periods of `days` against `observed`; undefined when the backtest holds too few. */
export function countPeriods(curve: Curve, days: number, observed: number):
  Pick<BacktestFrequency, 'days' | 'observed' | 'periods' | 'independent' | 'atLeast' | 'atMost' | 'best' | 'worst'> | undefined {
  const n = curve.t.length;
  if (n < 2 || !(days >= 1) || !Number.isFinite(observed)) return undefined;
  const independent = Math.floor((curve.t[n - 1]! - curve.t[0]!) / (days * DAY));
  if (independent < MIN_INDEPENDENT) return undefined;
  let periods = 0, atLeast = 0, atMost = 0, best = -Infinity, worst = Infinity;
  eachPeriod(curve, days, (_end, ret) => {
    periods++;
    if (ret >= observed - TIE) atLeast++;
    if (ret <= observed + TIE) atMost++;
    if (ret > best) best = ret;
    if (ret < worst) worst = ret;
  });
  // One-day periods do not overlap, and weekends store no day to start one on.
  return periods < MIN_PERIODS ? undefined : { days, observed, periods, independent: Math.min(independent, periods), atLeast, atMost, best, worst };
}

/** Every period's return by its end date, for the run screen's chart, with the median period. */
export function listPeriods(runId: string, curve: Curve, days: number): BacktestPeriods {
  const points: { t: number; ret: number }[] = [];
  eachPeriod(curve, days, (t, ret) => points.push({ t, ret }));
  const sorted = points.map(p => p.ret).sort((a, b) => a - b), mid = sorted.length >> 1;
  return { runId, days, from: curve.t[0] ?? 0, through: curve.t.at(-1) ?? 0, points,
    median: !sorted.length ? null : sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2 };
}

/**
 * The chance of at least `won` wins in `trades` trades that each win with probability `rate`, independently: the
 * binomial upper tail. It counts wins only, not their size.
 */
export function winChance(won: number, trades: number, rate: number): number {
  if (won <= 0) return 1;
  if (won > trades || !(rate > 0)) return 0;
  if (rate >= 1) return 1;
  const p = Math.log(rate), q = Math.log(1 - rate);
  // log C(trades, k), built up term by term so thousands of trades neither overflow nor underflow.
  let choose = 0, tail = 0;
  for (let k = 0; k <= trades; k++) {
    if (k >= won) tail += Math.exp(choose + k * p + (trades - k) * q);
    choose += Math.log(trades - k) - Math.log(k + 1);
  }
  return Math.min(1, tail);
}
