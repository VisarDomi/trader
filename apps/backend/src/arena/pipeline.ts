import { ENGINE_VERSION } from '../engine/version.ts';
/** Stage policy; virtual records remain intact when a Capital slot is lost. */
import { CONTROL_SLUGS, LIFECYCLE } from '../engine/policy.ts';
const isControlSlug = (slug: string) => CONTROL_SLUGS.has(slug);
import type { RunRow } from './db.ts';
import type { Trade } from '../sdk/types.ts';
import type { RunMetrics } from '../engine/metrics.ts';
import type { RosterEntry } from '../engine/roster.ts';
import { RUN_STATUS } from '../engine/run.ts';

export const STAGE = {
  BACKTEST: 'backtest',
  VIRTUAL: 'virtual',
  DEMO: 'demo',
} as const;
export type Stage = (typeof STAGE)[keyof typeof STAGE];
export interface Gate {
  passed: boolean;
  reason: string;
}
export function backtestGate(row: RunRow | undefined, hash: string, slug: string): Gate {
  if (isControlSlug(slug)) return { passed: true, reason: 'control: exempt from performance gate' };
  if (!row || row.code_hash !== hash || !row.metrics) return { passed: false, reason: 'waiting for current-code backtest' };
  if (!row.extra || JSON.parse(row.extra).engineVersion !== ENGINE_VERSION) return { passed: false, reason: 'waiting for current-engine backtest' };
  const m = JSON.parse(row.metrics) as RunMetrics;
  if (row.status === 'busted' || row.status === 'error' || m.finalEquity <= 0)
    return { passed: false, reason: 'backtest busted or errored' };
  if (m.sharpe < -0.5)
    return {
      passed: false,
      reason: `backtest Sharpe ${m.sharpe.toFixed(2)} below -0.5`,
    };
  // Explicitly slow families retain the documented five-trade gate.
  const slow = new Set(['lrs-sma200', 'vol-managed-hold', 'turn-of-month', 'tsmom-12m', 'donchian-ensemble', 'cppi']);
  if (m.trades < (slow.has(slug) ? 5 : 20)) return { passed: false, reason: 'backtest too few trades' };
  return { passed: true, reason: 'current-code backtest passed' };
}

/** User experiments may bypass performance thresholds, after a current, error-free backtest. */
export function admissionGate(row: RunRow | undefined, hash: string, slug: string, exception: RosterEntry | null): Gate {
  const gate = backtestGate(row, hash, slug);
  if (!exception) return gate;
  if (!row || row.code_hash !== hash || !row.metrics || !row.extra || JSON.parse(row.extra).engineVersion !== ENGINE_VERSION)
    return { passed: false, reason: 'demo experiment waiting for current-code/current-engine backtest' };
  if (row.status === RUN_STATUS.ERROR || (JSON.parse(row.extra).errors ?? 0) > 0)
    return { passed: false, reason: 'demo experiment backtest errored' };
  return { passed: true, reason: `user-requested demo experiment (${exception.date}): ${exception.reason}; backtest: ${gate.reason}` };
}
export function tradeT(trades: readonly { pnl: number }[]): number {
  if (trades.length < 2) return 0;
  const mean = trades.reduce((n, t) => n + t.pnl, 0) / trades.length;
  const variance = trades.reduce((n, t) => n + (t.pnl - mean) ** 2, 0) / (trades.length - 1);
  return variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(trades.length) : 0;
}
export function judged(trades: readonly unknown[], since: number, now: number): boolean {
  const days = (now - since) / 86_400_000;
  return (
    (trades.length >= LIFECYCLE.MIN_TRADES && days >= LIFECYCLE.MIN_DAYS) ||
    (trades.length >= LIFECYCLE.SLOW_MIN_TRADES && days >= LIFECYCLE.SLOW_MIN_DAYS)
  );
}
export function virtualEligible(trades: readonly Trade[], since: number, now: number, monkeyT: number): boolean {
  return judged(trades, since, now) && tradeT(trades) >= LIFECYCLE.LEADER_TSTAT && tradeT(trades) > monkeyT;
}

/** Frozen latency experiments. These are correlated execution comparisons, not independent strategy discoveries. */
export const EXECUTION_SCENARIOS = [170, 300, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000, 120_000] as const;
export const VIRTUAL_COMPARISON_TARGET = 4600;
export const VIRTUAL_RUN_CAP = LIFECYCLE.PAPER_RUN_SOFT_CAP;
export const SHADOW_MARKER = ':delay=';
export function isShadow(id: string): boolean {
  return id.includes(SHADOW_MARKER);
}
