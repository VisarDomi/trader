/**
 * The daily clock every forward record is judged on (EVIDENCE.md "The daily clock").
 *
 * A record's evidence is its return on each weekday since it started, flat days included as zero, so a strategy
 * that trades ten times a day and one that trades twice a month are measured in the same unit. Weekend changes
 * belong to Monday's observation. From those returns come:
 *
 * - `judgedT`: mean / volatility × √days, with the volatility never below the same-code backtest's. A short
 *   forward record of small steady wins has not yet shown its losses; the long backtest has.
 * - `eValue`: evidence against "no edge" that stays valid however often it is looked at (a one-sided normal
 *   mixture of likelihood ratios). At 1/α it is the always-valid bar for one record on its own.
 * - `confirmedSet`: the records whose e-values clear the bar for everything tried (e-BH, Wang and Ramdas 2022):
 *   among them the expected share of lucky ones stays under the chosen rate whatever their dependence.
 * - `pool`: a family judged as one record. Each weekday it is worth the average of its members' returns, each
 *   divided by that member's volatility so that a 1:200 member does not drown a 1:20 one. Members that run on the
 *   same days move together and add little; members on other markets or other days add real evidence.
 */
import type { ArenaDB, RunRow } from './db.ts';
import { DAY_MS, HOUR_MS } from '../engine/clock.ts';
import { LIFECYCLE } from '../engine/policy.ts';
import { backtestRunId, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';
import { curveOf, type Curve } from './frequency.ts';

/** Count, mean and standard deviation of a record's weekday returns. */
export interface DailyStats { n: number; mean: number; sd: number }
export const NO_DAYS: DailyStats = { n: 0, mean: 0, sd: 0 };

/** The live curve's midnight point is written within the first minutes of the day; until then the day is not closed. */
const SETTLE_MS = HOUR_MS;
const SUNDAY = 0, MONDAY = 1;
const weekday = (t: number) => (Math.floor(t / DAY_MS) + 4) % 7;   // 1970-01-01 was a Thursday

/** UTC midnights in (after, through] that close a weekday: the starts of Tuesday … Saturday. */
export function weekdayCloses(after: number, through: number): number[] {
  const out: number[] = [];
  for (let t = (Math.floor(after / DAY_MS) + 1) * DAY_MS; t <= through; t += DAY_MS) {
    const day = weekday(t);
    if (day !== SUNDAY && day !== MONDAY) out.push(t);
  }
  return out;
}

class Tally {
  n = 0; private sum = 0; private squares = 0;
  add(r: number): void { this.n++; this.sum += r; this.squares += r * r; }
  stats(): DailyStats {
    if (this.n < 2) return { n: this.n, mean: this.n ? this.sum : 0, sd: 0 };
    const mean = this.sum / this.n;
    return { n: this.n, mean, sd: Math.sqrt(Math.max(0, (this.squares - this.n * mean * mean) / (this.n - 1))) };
  }
}
export function statsOf(returns: ArrayLike<number>): DailyStats {
  const tally = new Tally();
  for (let i = 0; i < returns.length; i++) tally.add(returns[i]!);
  return tally.stats();
}

/**
 * Weekday returns of an equity curve from `since` (worth `start` then) through `through`. `closesDay`: each point is
 * dated by the day it closes (backtests); otherwise by the moment it was taken (live curves).
 */
export function dailyReturns(points: readonly { t: number; equity: number }[], since: number, through: number, start: number, closesDay: boolean): number[] {
  const out: number[] = [];
  let i = 0, held = start;
  const before = (close: number) => { while (i < points.length && (closesDay ? points[i]!.t < close : points[i]!.t <= close)) held = points[i++]!.equity; return held; };
  let previous = closesDay ? start : before(since);
  for (const close of weekdayCloses(since, through)) {
    const equity = before(close);
    out.push(previous > 0 ? equity / previous - 1 : 0);
    previous = equity;
  }
  return out;
}
export function dailyStats(points: readonly { t: number; equity: number }[], since: number, through: number, start: number, closesDay: boolean): DailyStats {
  return statsOf(dailyReturns(points, since, through, start, closesDay));
}

/** One member of a family: its weekday returns by close, and what each is multiplied by (1 / its volatility). */
export interface Member { closes: ArrayLike<number>; returns: ArrayLike<number>; scale: number }
/**
 * A family as one record: on each weekday close, the average of its members' scaled returns over the members that
 * have that day. A member counts while it runs; one retired later still counts on the days it ran.
 */
export function pool(members: readonly Member[]): { closes: number[]; values: number[] } {
  const days = new Map<number, { sum: number; count: number }>();
  for (const m of members) {
    for (let i = 0; i < m.closes.length; i++) {
      const day = days.get(m.closes[i]!);
      if (day) { day.sum += m.returns[i]! * m.scale; day.count++; } else days.set(m.closes[i]!, { sum: m.returns[i]! * m.scale, count: 1 });
    }
  }
  const closes = [...days.keys()].sort((a, b) => a - b);
  return { closes, values: closes.map(c => days.get(c)!.sum / days.get(c)!.count) };
}

/** Realized cash per weekday from closed deals, for Capital demo: a close on a weekend counts on Monday. */
export function cashStats(deals: readonly { close_time: number | null; pnl: number }[], from: number, now: number): DailyStats {
  const closes = weekdayCloses(from, now), tally = new Tally();
  const sorted = deals.filter(d => d.close_time !== null).sort((a, b) => a.close_time! - b.close_time!);
  let i = 0;
  for (const close of closes) {
    let cash = 0;
    while (i < sorted.length && sorted[i]!.close_time! <= close) cash += sorted[i++]!.pnl;
    tally.add(cash);
  }
  return tally.stats();
}

/** mean / volatility × √days, the volatility never below the backtest's. Zero until two days are in. */
export function judgedT(own: DailyStats, backtest?: DailyStats | null): number {
  const sd = Math.max(own.sd, backtest && backtest.n >= 2 ? backtest.sd : 0);
  return own.n >= 2 && sd > 0 ? (own.mean / sd) * Math.sqrt(own.n) : 0;
}

/** The forward mean daily return against the backtest's, in standard errors of their difference. */
export function agreementZ(own: DailyStats, backtest: DailyStats | null | undefined): number | null {
  if (!backtest || own.n < 2 || backtest.n < 2) return null;
  const se = Math.sqrt(own.sd ** 2 / own.n + backtest.sd ** 2 / backtest.n);
  return se > 0 ? (own.mean - backtest.mean) / se : null;
}

/** Standard normal distribution function (Abramowitz and Stegun 26.2.17, error below 1e-7). */
export function normalCdf(x: number): number {
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * k * (0.31938153 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

/**
 * Evidence against "no edge" after `n` days at statistic `t`: the likelihood of the record under positive edges
 * (weighted half-normally, widest near a year of days) over its likelihood under none. Under no edge it exceeds
 * 1/α at any time, ever, with probability at most α, so it may be looked at every day.
 */
export function eValue(t: number, n: number): number {
  if (n < 2) return 1;
  const m = LIFECYCLE.EVALUE_PRIOR_DAYS, s = t * Math.sqrt(n);
  return 2 * Math.sqrt(m / (n + m)) * Math.exp(Math.min(700, (s * s) / (2 * (n + m)))) * normalCdf(s / Math.sqrt(n + m));
}

/** The t a record of `n` days needs for its e-value to reach `e`. */
export function tAt(e: number, n: number): number {
  let low = 0, high = 60;
  for (let i = 0; i < 60; i++) { const mid = (low + high) / 2; if (eValue(mid, n) >= e) high = mid; else low = mid; }
  return high;
}

/**
 * e-BH over `trials` hypotheses: the largest group of the offered records whose every e-value is at least
 * trials / (rate × its size). Offering only some of the trials keeps the guarantee: any group chosen this way has
 * an expected share of false members of at most `rate`.
 */
export function confirmedSet(offered: readonly { id: string; e: number }[], trials: number, rate: number): { ids: Set<string>; needs: number } {
  const sorted = [...offered].sort((a, b) => b.e - a.e);
  let size = 0;
  for (let k = sorted.length; k >= 1; k--) if (sorted[k - 1]!.e >= trials / (rate * k)) { size = k; break; }
  return { ids: new Set(sorted.slice(0, size).map(x => x.id)), needs: trials / (rate * (size + 1)) };
}

/** What a same-code backtest contributes: its daily curve (frequency.ts), its weekday returns and its win rate. */
export interface BacktestHistory { at: number; curve: Curve; daily: DailyStats; closes: number[]; returns: number[]; winRate: number; trades: number }

/** A live record's weekday returns so far, with the closes they belong to. */
export interface ForwardSeries { closes: number[]; returns: number[]; stats: DailyStats }
interface Window extends ForwardSeries { equity: number; through: number; due: number }
const BACKTEST_RECHECK_MS = 10 * 60_000;

/** Cached daily clocks, read from stored equity: one closed weekday at a time for live records, once per backtest. */
export class Judging {
  private windows = new Map<string, Window>();
  private histories = new Map<string, BacktestHistory>();
  private currents = new Map<string, { checked: number; history: BacktestHistory | null }>();
  constructor(private readonly db: ArenaDB) {}

  /** The record's weekday returns from `since` (its start, or a later moment such as its demotion) to the last closed weekday. */
  forward(run: Pick<RunRow, 'id' | 'capital' | 'started_at'>, since: number, now: number): DailyStats {
    return this.forwardSeries(run, since, now).stats;
  }
  /** The same returns one by one, for pooling a family. */
  forwardSeries(run: Pick<RunRow, 'id' | 'capital' | 'started_at'>, since: number, now: number): ForwardSeries {
    const key = `${run.id}|${since}`;
    let w = this.windows.get(key);
    if (!w) {
      if (this.windows.size > 50_000) this.windows.clear();
      const equity = since <= run.started_at ? run.capital : this.db.equityAt(run.id, since) ?? run.capital;
      w = { equity, through: since, closes: [], returns: [], stats: NO_DAYS, due: 0 };
      this.windows.set(key, w);
    }
    if (now < w.due) return w;
    const before = w.closes.length;
    for (const close of weekdayCloses(w.through, now - SETTLE_MS)) {
      const equity = this.db.equityAt(run.id, close) ?? w.equity;
      w.closes.push(close); w.returns.push(w.equity > 0 ? equity / w.equity - 1 : 0);
      w.equity = equity; w.through = close;
    }
    if (w.closes.length !== before) w.stats = statsOf(w.returns);
    w.due = (Math.floor((now - SETTLE_MS) / DAY_MS) + 1) * DAY_MS + SETTLE_MS;
    return w;
  }

  /** A backtest's history, read once and again only after it is re-run. */
  backtest(row: RunRow): BacktestHistory {
    const kept = this.histories.get(row.id);
    if (kept && kept.at === row.updated_at) return kept;
    const points = this.db.equity(row.id), m = row.metrics ? JSON.parse(row.metrics) : null;
    const end = Math.max(row.ended_at ?? 0, (points.at(-1)?.t ?? row.started_at) + DAY_MS);
    const returns = dailyReturns(points, row.started_at, end, row.capital, true);
    const read = { at: row.updated_at, curve: curveOf(points), daily: statsOf(returns), closes: weekdayCloses(row.started_at, end), returns,
      winRate: Number(m?.winRate) || 0, trades: Number(m?.trades) || 0 };
    this.histories.set(row.id, read);
    return read;
  }

  /** The current backtest of the same agent version, instrument and leverage, if there is one. Rechecked every ten minutes. */
  backtestFor(run: Pick<RunRow, 'agent_id' | 'epic' | 'leverage' | 'code_hash'>, now: number): BacktestHistory | null {
    const id = backtestRunId(PRIMARY_BACKTEST_WINDOW_ID, run.agent_id, run.epic, run.leverage ?? 0), key = `${id}|${run.code_hash}`;
    const kept = this.currents.get(key);
    if (kept && now - kept.checked < BACKTEST_RECHECK_MS) return kept.history;
    const row = this.db.run(id);
    const history = row && !row.retired && row.code_hash === run.code_hash ? this.backtest(row) : null;
    this.currents.set(key, { checked: now, history });
    return history;
  }

  /** Drops histories of backtests that are no longer current. */
  keepBacktests(ids: ReadonlySet<string>): void {
    for (const id of this.histories.keys()) if (!ids.has(id)) this.histories.delete(id);
  }
}
