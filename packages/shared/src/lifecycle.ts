// Lifecycle policy: when a demo run has shown enough to be judged, and what the verdict is.
// Used by the dashboard (verdict column) and by `bun run review` (the babysitter's input), so both agree.
// The full policy, including what the babysitter does with each verdict: apps/backend/agents/LIFECYCLE.md.

import type { LeaderboardRow } from './types.ts';

/** Agents with no edge by construction; they are never judged or retired. */
export const CONTROL_SLUGS: ReadonlySet<string> = new Set(['random-baseline', 'buy-hold']);
/** Random-entry agents whose results show what luck looks like. */
export const RANDOM_BASELINE_SLUG = 'random-baseline';

export const LIFECYCLE = {
	/** A run is judged after this many closed trades and days live... */
	MIN_TRADES: 30,
	MIN_DAYS: 28,
	/** ...or, for slow agents, after this many days with at least SLOW_MIN_TRADES trades. */
	SLOW_MIN_DAYS: 90,
	SLOW_MIN_TRADES: 10,
	/** A run that has not traded at all for this long is retired. */
	SILENT_DAYS: 60,
	/** Judged runs with a trade t-statistic at or below this are retired: with no edge the spread drags t below zero. */
	RETIRE_TSTAT: -1,
	/** Judged runs at or above this, and above every random monkey on the same instrument, lead. */
	LEADER_TSTAT: 2,
	/** An agent is retired as a whole when at least this share of its judged runs (and at least 3) are retired. */
	AGENT_RETIRE_SHARE: 2 / 3,
	AGENT_RETIRE_MIN_JUDGED: 3,
	/** Live demo runs the arena should hold at most (memory on the shared server); new agents wait above it. */
	PAPER_RUN_SOFT_CAP: 600,
	/** Days between new-agent additions. */
	ADD_AGENTS_EVERY_DAYS: 7,
} as const;

export const VERDICT = {
	CONTROL: 'control',
	EARLY: 'early',
	KEEP: 'keep',
	LEADER: 'leader',
	RETIRE: 'retire',
	RETIRED: 'retired',
} as const;
export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];

export interface Assessment {
	verdict: Verdict;
	reason: string;
}

/** Range of random-monkey returns per instrument. */
export type LuckBands = Map<string, { min: number; max: number; n: number }>;

const DAY_MS = 86_400_000;
const STATUS_RETIRED = 'retired';
const STATUS_BUSTED = 'busted';
const STATUS_ERROR = 'error';

export function isControlSlug(slug: string): boolean {
	return CONTROL_SLUGS.has(slug);
}

export function luckBands(rows: readonly LeaderboardRow[]): LuckBands {
	const bands: LuckBands = new Map();
	for (const r of rows) {
		if (r.slug !== RANDOM_BASELINE_SLUG || !r.metrics || r.status === STATUS_RETIRED) continue;
		const ret = r.metrics.totalReturn;
		const b = bands.get(r.epic);
		if (!b) bands.set(r.epic, { min: ret, max: ret, n: 1 });
		else bands.set(r.epic, { min: Math.min(b.min, ret), max: Math.max(b.max, ret), n: b.n + 1 });
	}
	return bands;
}

/** Verdict for one demo run. */
export function assess(row: LeaderboardRow, bands: LuckBands, now = Date.now()): Assessment {
	if (row.status === STATUS_RETIRED) return { verdict: VERDICT.RETIRED, reason: 'retired' };
	if (isControlSlug(row.slug)) return { verdict: VERDICT.CONTROL, reason: 'control agent' };
	if (row.status === STATUS_BUSTED) return { verdict: VERDICT.RETIRE, reason: 'account busted' };
	if (row.status === STATUS_ERROR) return { verdict: VERDICT.RETIRE, reason: 'agent stopped on errors (fix the bug or retire)' };

	const days = (now - row.startedAt) / DAY_MS;
	const trades = row.metrics?.trades ?? 0;
	const t = row.metrics?.tStat ?? 0;
	const ret = row.metrics?.totalReturn ?? 0;
	if (trades === 0 && days >= LIFECYCLE.SILENT_DAYS) return { verdict: VERDICT.RETIRE, reason: `no trades in ${Math.floor(days)} days` };

	const judged =
		(trades >= LIFECYCLE.MIN_TRADES && days >= LIFECYCLE.MIN_DAYS) || (days >= LIFECYCLE.SLOW_MIN_DAYS && trades >= LIFECYCLE.SLOW_MIN_TRADES);
	if (!judged) {
		return {
			verdict: VERDICT.EARLY,
			reason: `${trades} trades in ${Math.floor(days)} days (judged at ${LIFECYCLE.MIN_TRADES} trades and ${LIFECYCLE.MIN_DAYS} days)`,
		};
	}
	if (t <= LIFECYCLE.RETIRE_TSTAT) return { verdict: VERDICT.RETIRE, reason: `losing: t = ${t.toFixed(2)} over ${trades} trades` };
	const band = bands.get(row.epic);
	if (t >= LIFECYCLE.LEADER_TSTAT && (!band || ret > band.max)) {
		return { verdict: VERDICT.LEADER, reason: `t = ${t.toFixed(2)} over ${trades} trades${band ? ', above every monkey' : ''}` };
	}
	return { verdict: VERDICT.KEEP, reason: `t = ${t.toFixed(2)} over ${trades} trades` };
}
