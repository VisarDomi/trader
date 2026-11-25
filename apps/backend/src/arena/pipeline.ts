import { ENGINE_VERSION } from '../engine/version.ts';
/** Stage policy; virtual records remain intact when a Capital slot is lost. */
import { CONTROL_SLUGS, LIFECYCLE } from '../engine/policy.ts';
export { floorMet, loserMature, isCandidate } from '../engine/policy.ts';
const isControlSlug = (slug: string) => CONTROL_SLUGS.has(slug);
import type { RunRow } from './db.ts';
import type { RunMetrics } from '../engine/metrics.ts';
import type { RosterEntry } from '../engine/roster.ts';
import { RUN_STATUS } from '../engine/run.ts';
import {PRIMARY_BACKTEST_WINDOW_ID} from '../engine/run-id.ts';

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
  if(row.window_id!==PRIMARY_BACKTEST_WINDOW_ID)return {passed:false,reason:'waiting for the shared comparison-window backtest'};
  if (!row.extra || JSON.parse(row.extra).engineVersion !== ENGINE_VERSION) return { passed: false, reason: 'waiting for current-engine backtest' };
  const m = JSON.parse(row.metrics) as RunMetrics;
  if (row.status === 'busted' || row.status === 'error' || m.finalEquity <= 0)
    return { passed: false, reason: 'backtest busted or errored' };
  // The gate filters strategies that lose on their own, so it checks the Sharpe of the returns themselves. The Sharpe
  // shown everywhere is above T-bills; on it −0.5 would also reject 127 of 637 backtests (2026-11-22), mostly
  // low-leverage variants rarely in the market, whose idle cash earns nothing in a CFD account.
  const edge = m.cashFreeSharpe ?? m.sharpe;
  if (edge < -0.5)
    return {
      passed: false,
      reason: `backtest Sharpe before T-bills ${edge.toFixed(2)} below -0.5`,
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
  if (!row || row.window_id!==PRIMARY_BACKTEST_WINDOW_ID || row.code_hash !== hash || !row.metrics || !row.extra || JSON.parse(row.extra).engineVersion !== ENGINE_VERSION)
    return { passed: false, reason: 'demo experiment waiting for current-code/current-engine backtest' };
  if (row.status === RUN_STATUS.ERROR || (JSON.parse(row.extra).errors ?? 0) > 0)
    return { passed: false, reason: 'demo experiment backtest errored' };
  return { passed: true, reason: `user-requested demo experiment (${exception.date}): ${exception.reason}; backtest: ${gate.reason}` };
}
/** Frozen latency experiments. These are correlated execution comparisons, not independent strategy discoveries. */
export const EXECUTION_SCENARIOS = [170, 300, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000, 120_000] as const;
export const VIRTUAL_COMPARISON_TARGET = 4600;
export const VIRTUAL_RUN_CAP = LIFECYCLE.PAPER_RUN_SOFT_CAP;
export const SHADOW_MARKER = ':delay=';
export function isShadow(id: string): boolean {
  return id.includes(SHADOW_MARKER);
}
