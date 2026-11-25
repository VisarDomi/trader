// Lifecycle policy: when a forward record has shown enough to be judged, and what the verdict is.
// Used by the dashboard (verdict column), the native screens and `bun run review` (the babysitter's input), so all agree.
// The full policy, including what the babysitter does with each verdict: apps/backend/agents/LIFECYCLE.md.

import type { FamilyClock, LeaderboardRow } from './types.ts';

/**
 * Agents that are yardsticks, not strategies; they are never judged or retired: random entries,
 * buy and hold, and the leverage ladder (one signal at every leverage, to show what leverage does).
 */
export { CONTROL_SLUGS, RANDOM_BASELINE_SLUG, LIFECYCLE, floorMet, loserMature, isCandidate } from '../../../apps/backend/src/engine/policy.ts';
import { CONTROL_SLUGS, LIFECYCLE, floorMet, loserMature, isCandidate, silentDaysFor } from '../../../apps/backend/src/engine/policy.ts';

export const VERDICT = {
	CONTROL: 'control',
	EARLY: 'early',
	KEEP: 'keep',
	CANDIDATE: 'candidate',
	CONFIRMED: 'confirmed',
	RETIRE: 'retire',
	RETIRED: 'retired',
} as const;
export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];

export interface Assessment {
	verdict: Verdict;
	reason: string;
}

const DAY_MS = 86_400_000;
const STATUS_RETIRED = 'retired';
const STATUS_BUSTED = 'busted';
const STATUS_ERROR = 'error';

export function isControlSlug(slug: string): boolean {
	return CONTROL_SLUGS.has(slug);
}

/**
 * Verdict for one forward record, from its daily clock (`evidence.clock`, built by the arena: EVIDENCE.md "The daily
 * clock"). A candidate may compete for Capital demo slots and may still be luck; confirmed is the claim of an edge.
 */
export function assess(row: LeaderboardRow, now = Date.now()): Assessment {
	if (row.status === STATUS_RETIRED) return { verdict: VERDICT.RETIRED, reason: 'retired' };
	if (isControlSlug(row.slug)) return { verdict: VERDICT.CONTROL, reason: 'control agent' };
	if (row.status === STATUS_BUSTED) return { verdict: VERDICT.RETIRE, reason: 'account busted' };
	if (row.status === STATUS_ERROR) return { verdict: VERDICT.RETIRE, reason: 'agent stopped on errors (fix the bug or retire)' };

	const c = row.evidence?.clock;
	const days = c?.days ?? Math.max(0, now - row.startedAt) / DAY_MS;
	const trades = c?.trades ?? row.metrics?.trades ?? 0;
	const t = c?.t ?? 0;
	if (trades === 0 && !row.evidence?.openPosition && days >= silentDaysFor(row.agentId)) return { verdict: VERDICT.RETIRE, reason: `no trades in ${Math.floor(days)} days` };

	const over = `daily t = ${t.toFixed(2)} over ${Math.floor(days)} days and ${trades} trades`;
	if (loserMature(trades, days) && t <= LIFECYCLE.RETIRE_TSTAT) return { verdict: VERDICT.RETIRE, reason: `losing: ${over}` };
	if (!floorMet(trades, days)) {
		return {
			verdict: VERDICT.EARLY,
			reason: `${trades} trades in ${Math.floor(days)} days (judged from ${LIFECYCLE.MIN_TRADES} trades and ${LIFECYCLE.MIN_DAYS} days)`,
		};
	}
	if (c?.confirmed) {
		return { verdict: VERDICT.CONFIRMED, reason: `${over}; clears the bar for all ${c.trials} records tried and agrees with its backtest` };
	}
	if (isCandidate(trades, days, t, c?.monkey ?? null)) {
		return { verdict: VERDICT.CANDIDATE, reason: `${over}${c?.monkey != null ? ', above every monkey' : ''}; may still be luck` };
	}
	return { verdict: VERDICT.KEEP, reason: over };
}

/**
 * Verdict for a family judged as one record (`evidence.clock.family`): early, keep, candidate or confirmed. A family
 * answers sooner than its slow members because markets and days that do not move together add evidence. It is not
 * retired and holds no Capital slot; its runs are judged for those on their own.
 */
export function assessFamily(f: FamilyClock): Assessment {
	const days = Math.floor(f.days);
	if (!floorMet(f.trades, f.days)) {
		return { verdict: VERDICT.EARLY, reason: `${f.trades} trades in ${days} days (judged from ${LIFECYCLE.MIN_TRADES} trades and ${LIFECYCLE.MIN_DAYS} days)` };
	}
	const over = `family t = ${f.t.toFixed(2)} over ${days} days and ${f.trades} trades of ${f.everRecords} records`;
	if (f.confirmed) return { verdict: VERDICT.CONFIRMED, reason: `${over}; clears the bar for all ${f.trials} families tried and agrees with its backtests` };
	if (isCandidate(f.trades, f.days, f.t, f.monkey)) return { verdict: VERDICT.CANDIDATE, reason: `${over}${f.monkey != null ? ', above the monkeys judged as a family' : ''}; may still be luck` };
	return { verdict: VERDICT.KEEP, reason: over };
}
