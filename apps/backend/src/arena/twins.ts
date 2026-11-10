/**
 * Paper–demo twins (user request 2026-11-09).
 *
 * Every run mirrored to a Capital.com demo account is a pair: the paper run in our engine and its demo
 * deals. Both come from the same decision; the demo deal is SCALE × the paper size. A pair agrees when
 * the demo deal returned what the paper trade returned per unit of notional, within one typical spread.
 * Pairs that keep agreeing are the evidence that paper results stand for demo results, so the engine can
 * carry agents that never get a demo slot.
 *
 * Demo close prices come from the realized P&L Capital books per deal (TRADE cash flows): most demo closes
 * are broker-side stops, or closes whose confirmation Capital answers with another deal's. Broker
 * adjustments (swap, corporate actions) are compared with paper funding separately.
 */
import { getInstrument } from '../engine/instruments.ts';
import { parseDemoRunId } from '../engine/run-id.ts';
import { DAY_MS } from '../engine/clock.ts';
import type { ArenaDB } from './db.ts';

export const TWIN_DEFAULT_DAYS = 14;
export const TWIN_MAX_DAYS = 90;
/** A run needs this many paired trades in the window before it gets a verdict. */
export const TWIN_MIN_TRADES = 5;
/** Converged: at least this share of paired trades agree and the mean gap is within half a spread. */
export const TWIN_CONVERGED_SHARE = 0.9;
/** Diverged: fewer than this share agree, or the mean gap exceeds one spread. */
export const TWIN_DIVERGED_SHARE = 0.75;
export const TWIN_VERDICT = { CONVERGED: 'converged', WATCH: 'watch', DIVERGED: 'diverged', TOO_FEW: 'too few' } as const;
export type TwinVerdict = (typeof TWIN_VERDICT)[keyof typeof TWIN_VERDICT];
export const CLOSED_BY = { BROKER: 'broker', ARENA: 'arena' } as const;
export type ClosedBy = (typeof CLOSED_BY)[keyof typeof CLOSED_BY];

/** One closed demo deal with its paper trade (paper fields are null when no paper trade matches). */
export interface TwinRow {
  runId: string;
  epic: string;
  side: string;
  size: number;
  paperSize: number;
  openPrice: number | null;
  brokerPnl: number | null;
  brokerAdjust: number;
  brokerCloseTime: number | null;
  closeTime: number | null;
  note: string | null;
  paperFillTime: number | null;
  decisionTime: number | null;
  sentTime: number | null;
  paperEntry: number | null;
  paperExit: number | null;
  paperExitTime: number | null;
  paperPnl: number | null;
  paperFunding: number | null;
  exitReason: string | null;
}

export interface TwinTrade {
  runId: string;
  epic: string;
  side: string;
  entryTime: number;
  exitTime: number;
  exitReason: string;
  /**
   * broker: Capital booked the close before the paper exit (its own stop or limit fired first);
   * arena: the demo deal closed on the arena's request after the paper exit.
   */
  closedBy: ClosedBy;
  /** Positive: the demo fill was better for the trader than the paper fill. */
  entryBps: number;
  exitBps: number;
  /** Demo return minus paper return, per unit of notional, before funding. */
  gapBps: number;
  toleranceBps: number;
  agrees: boolean;
  /** Paper gross P&L, and the demo result scaled to the paper trade's notional. */
  paperUsd: number;
  demoUsd: number;
  gapUsd: number;
  /**
   * Linked broker adjustments minus paper funding. Capital books overnight swaps without a deal id, so they are
   * not linked: until they are matched to positions this is paper funding with the sign flipped.
   */
  fundingGapUsd: number;
  paperFundingUsd: number;
  /** Decision → demo order accepted by Capital (the paper twin assumes DEFAULT_EXECUTION_MS). */
  entryLagMs: number | null;
  /** Paper exit → demo P&L booked (negative: the demo deal closed first). */
  exitLagMs: number | null;
}

export interface TwinStats {
  pairs: number;
  agree: number;
  agreeShare: number | null;
  meanGapBps: number | null;
  medianAbsGapBps: number | null;
  p95AbsGapBps: number | null;
  paperUsd: number;
  demoUsd: number;
  gapUsd: number;
  fundingGapUsd: number;
  paperFundingUsd: number;
  entryLagP50Ms: number | null;
  entryLagP95Ms: number | null;
  exitLagP50Ms: number | null;
  exitLagP5Ms: number | null;
  exitLagP95Ms: number | null;
}

export interface TwinRun extends TwinStats {
  runId: string;
  agentId: string;
  epic: string;
  leverage: number;
  toleranceBps: number;
  verdict: TwinVerdict;
}

export interface TwinReport {
  generatedAt: number;
  window: { from: number; to: number; days: number };
  rules: { tolerance: string; minTrades: number; convergedShare: number; divergedShare: number };
  overall: TwinStats;
  verdicts: Record<TwinVerdict, number>;
  byEpic: (TwinStats & { epic: string })[];
  byExit: (TwinStats & { closedBy: ClosedBy; exitReason: string })[];
  days: (TwinStats & { day: number })[];
  runs: TwinRun[];
  worst: TwinTrade[];
  unpaired: { closedDeals: number; withoutPaperTrade: number; withoutBrokerPnl: number };
  /** Only trades decided from this time on (0: all). */
  since?: number;
}

const round = (x: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
}

export function closedByBroker(note: string | null): boolean {
  return /closed at broker|closed by the broker/i.test(note ?? '');
}

/** Pair one closed deal with its paper trade; null when either side lacks the numbers to compare. */
export function twinTrade(r: TwinRow): TwinTrade | null {
  if (
    r.openPrice === null || r.brokerPnl === null || r.paperEntry === null || r.paperExit === null ||
    r.paperExitTime === null || r.paperPnl === null || r.paperFillTime === null || !(r.size > 0) || !(r.paperSize > 0)
  )
    return null;
  const dir = r.side === 'long' ? 1 : -1;
  const funding = r.paperFunding ?? 0;
  const paperGross = r.paperPnl - funding;
  const brokerClose = r.openPrice + r.brokerPnl / (r.size * dir);
  const paperNotional = r.paperSize * r.paperEntry;
  const paperRet = paperGross / paperNotional;
  const demoRet = r.brokerPnl / (r.size * r.openPrice);
  const gapBps = (demoRet - paperRet) * 1e4;
  const toleranceBps = Math.max(0.5, (getInstrument(r.epic).typicalSpread / r.paperEntry) * 1e4);
  const demoUsd = demoRet * paperNotional;
  const brokerExitAt = r.brokerCloseTime ?? r.closeTime;
  return {
    runId: r.runId,
    epic: r.epic,
    side: r.side,
    entryTime: r.paperFillTime,
    exitTime: r.paperExitTime,
    exitReason: r.exitReason ?? 'unknown',
    // Timing decides: notes can say "already closed at broker" after the arena's own close went through
    // with a mismatched confirmation.
    closedBy: (brokerExitAt === null ? closedByBroker(r.note) : brokerExitAt < r.paperExitTime) ? CLOSED_BY.BROKER : CLOSED_BY.ARENA,
    entryBps: round((dir * (r.paperEntry - r.openPrice)) / r.paperEntry * 1e4),
    exitBps: round((dir * (brokerClose - r.paperExit)) / r.paperExit * 1e4),
    gapBps: round(gapBps),
    toleranceBps: round(toleranceBps),
    agrees: Math.abs(gapBps) <= toleranceBps,
    paperUsd: round(paperGross),
    demoUsd: round(demoUsd),
    gapUsd: round(demoUsd - paperGross),
    fundingGapUsd: round(r.brokerAdjust * (r.paperSize / r.size) - funding),
    paperFundingUsd: round(funding),
    entryLagMs: r.sentTime === null ? null : r.sentTime - (r.decisionTime ?? r.paperFillTime),
    exitLagMs: brokerExitAt === null ? null : brokerExitAt - r.paperExitTime,
  };
}

export function twinStats(trades: readonly TwinTrade[]): TwinStats {
  const gaps = trades.map(t => t.gapBps),
    abs = gaps.map(Math.abs);
  const entryLags = trades.flatMap(t => (t.entryLagMs === null ? [] : [t.entryLagMs]));
  // Exit timing is only comparable when the broker closed the deal on its own (stops, limits).
  const exitLags = trades.flatMap(t => (t.closedBy === CLOSED_BY.BROKER && t.exitLagMs !== null ? [t.exitLagMs] : []));
  const sum = (f: (t: TwinTrade) => number) => round(trades.reduce((n, t) => n + f(t), 0));
  const agree = trades.filter(t => t.agrees).length;
  const q = (v: number[], p: number) => {
    const x = quantile(v, p);
    return x === null ? null : round(x);
  };
  return {
    pairs: trades.length,
    agree,
    agreeShare: trades.length ? round(agree / trades.length, 4) : null,
    meanGapBps: trades.length ? round(gaps.reduce((a, b) => a + b, 0) / trades.length) : null,
    medianAbsGapBps: q(abs, 0.5),
    p95AbsGapBps: q(abs, 0.95),
    paperUsd: sum(t => t.paperUsd),
    demoUsd: sum(t => t.demoUsd),
    gapUsd: sum(t => t.gapUsd),
    fundingGapUsd: sum(t => t.fundingGapUsd),
    paperFundingUsd: sum(t => t.paperFundingUsd),
    entryLagP50Ms: q(entryLags, 0.5),
    entryLagP95Ms: q(entryLags, 0.95),
    exitLagP50Ms: q(exitLags, 0.5),
    exitLagP5Ms: q(exitLags, 0.05),
    exitLagP95Ms: q(exitLags, 0.95),
  };
}

export function twinVerdict(stats: TwinStats, toleranceBps: number): TwinVerdict {
  if (stats.pairs < TWIN_MIN_TRADES || stats.agreeShare === null || stats.meanGapBps === null) return TWIN_VERDICT.TOO_FEW;
  const drift = Math.abs(stats.meanGapBps);
  if (stats.agreeShare < TWIN_DIVERGED_SHARE || drift > toleranceBps) return TWIN_VERDICT.DIVERGED;
  if (stats.agreeShare >= TWIN_CONVERGED_SHARE && drift <= toleranceBps / 2) return TWIN_VERDICT.CONVERGED;
  return TWIN_VERDICT.WATCH;
}

const VERDICT_ORDER: TwinVerdict[] = [TWIN_VERDICT.DIVERGED, TWIN_VERDICT.WATCH, TWIN_VERDICT.CONVERGED, TWIN_VERDICT.TOO_FEW];

export function buildTwinReport(rows: readonly TwinRow[], from: number, to: number, now = Date.now()): TwinReport {
  const trades = rows.flatMap(r => twinTrade(r) ?? []);
  const group = <K>(key: (t: TwinTrade) => K) => {
    const out = new Map<K, TwinTrade[]>();
    for (const t of trades) {
      const k = key(t);
      const list = out.get(k);
      if (list) list.push(t);
      else out.set(k, [t]);
    }
    return out;
  };
  const runs = [...group(t => t.runId)].map(([runId, list]): TwinRun => {
    const parsed = parseDemoRunId(runId);
    const stats = twinStats(list);
    const toleranceBps = round(quantile(list.map(t => t.toleranceBps), 0.5)!);
    return {
      runId,
      agentId: parsed?.agentId ?? runId,
      epic: list[0]!.epic,
      leverage: parsed?.leverage ?? 0,
      toleranceBps,
      ...stats,
      verdict: twinVerdict(stats, toleranceBps),
    };
  });
  runs.sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) || Math.abs(b.gapUsd) - Math.abs(a.gapUsd));
  const verdicts = Object.fromEntries(Object.values(TWIN_VERDICT).map(v => [v, runs.filter(r => r.verdict === v).length])) as Record<TwinVerdict, number>;
  return {
    generatedAt: now,
    window: { from, to, days: round((to - from) / DAY_MS, 1) },
    rules: {
      tolerance: 'a pair agrees when demo and paper returns differ by at most one typical spread (at least 0.5 bp)',
      minTrades: TWIN_MIN_TRADES,
      convergedShare: TWIN_CONVERGED_SHARE,
      divergedShare: TWIN_DIVERGED_SHARE,
    },
    overall: twinStats(trades),
    verdicts,
    byEpic: [...group(t => t.epic)].map(([epic, list]) => ({ epic, ...twinStats(list) })).sort((a, b) => b.pairs - a.pairs),
    byExit: [...group(t => `${t.closedBy}\u0000${t.exitReason}`)]
      .map(([key, list]) => {
        const [closedBy, exitReason] = key.split('\u0000') as [ClosedBy, string];
        return { closedBy, exitReason, ...twinStats(list) };
      })
      .sort((a, b) => b.pairs - a.pairs),
    days: [...group(t => Math.floor(t.exitTime / DAY_MS) * DAY_MS)].map(([day, list]) => ({ day, ...twinStats(list) })).sort((a, b) => a.day - b.day),
    runs,
    worst: [...trades].sort((a, b) => Math.abs(b.gapUsd) - Math.abs(a.gapUsd)).slice(0, 25),
    unpaired: {
      closedDeals: rows.length,
      withoutPaperTrade: rows.filter(r => r.paperEntry === null).length,
      withoutBrokerPnl: rows.filter(r => r.paperEntry !== null && (r.brokerPnl === null || r.openPrice === null)).length,
    },
  };
}

/** Closed demo deals whose paper exit falls in [from, to), with their paper trades and booked P&L. */
export function twinRows(db: ArenaDB, from: number, to: number): TwinRow[] {
  return db.db
    .query<TwinRow, [number, number]>(
      `SELECT d.run_id runId, d.epic, d.side, d.size, d.paper_size paperSize, d.open_price openPrice, d.pnl brokerPnl,
        COALESCE(d.cash_adjustment, 0) brokerAdjust, d.close_time closeTime, d.note,
        d.virtual_fill_time paperFillTime, d.decision_time decisionTime, COALESCE(d.accepted_time, d.sent_time) sentTime,
        (SELECT MAX(c.time) FROM broker_cashflows c WHERE c.account_id = d.account_id AND c.deal_id = d.deal_id AND c.type = 'TRADE') brokerCloseTime,
        t.entry_price paperEntry, t.exit_price paperExit, t.exit_time paperExitTime, t.pnl paperPnl, t.funding paperFunding, t.exit_reason exitReason
       FROM broker_deals d
       LEFT JOIN trades t ON t.run_id = d.run_id AND t.entry_time = d.virtual_fill_time
       WHERE d.status = 'closed' AND d.deal_id IS NOT NULL AND COALESCE(t.exit_time, d.close_time) >= ? AND COALESCE(t.exit_time, d.close_time) < ?`,
    )
    .all(from, to);
}

/**
 * Pairs whose paper exit falls in the last `days`. With `since`, only trades decided (or, before decision-time
 * orders, filled) from then on: the arena records when the current engine version started (ENGINE_SINCE_KEY),
 * so the daily check judges the engine and mirror that run now, not the ones they replaced.
 */
export function twinReport(db: ArenaDB, days: number, now = Date.now(), since = 0): TwinReport {
  const to = now,
    from = now - days * DAY_MS;
  const rows = twinRows(db, from, to).filter(r => since === 0 || (r.decisionTime ?? r.paperFillTime ?? 0) >= since);
  return { ...buildTwinReport(rows, from, to, now), since };
}

/** kv keys: the engine version the arena runs and when it first ran it. */
export const ENGINE_VERSION_KEY = 'engine.version';
export const ENGINE_SINCE_KEY = 'engine.since';
