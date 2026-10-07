import type { LeaderboardRow, RunMetrics } from '@trader/shared';
import { CONTROL_SLUGS, isControlSlug } from '@trader/shared';

export function pct(x: number | null | undefined, digits = 1): string {
	if (x === null || x === undefined || !Number.isFinite(x)) return '—';
	const v = x * 100;
	return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function pctPlain(x: number | null | undefined, digits = 1): string {
	if (x === null || x === undefined || !Number.isFinite(x)) return '—';
	return `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | null | undefined, digits = 2): string {
	if (x === null || x === undefined || !Number.isFinite(x)) return '—';
	return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function usd(x: number | null | undefined, digits = 2): string {
	if (x === null || x === undefined || !Number.isFinite(x)) return '—';
	const sign = x < 0 ? '-' : '';
	return `${sign}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function price(x: number | null | undefined): string {
	if (x === null || x === undefined || !Number.isFinite(x)) return '—';
	return x.toLocaleString('en-US', { maximumFractionDigits: 5 });
}

/** UTC timestamp, unambiguous everywhere. */
export function utc(ms: number | null | undefined): string {
	if (!ms) return '—';
	return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export function day(ms: number | null | undefined): string {
	if (!ms) return '—';
	return new Date(ms).toISOString().slice(0, 10);
}

export function ago(ms: number | null | undefined, now = Date.now()): string {
	if (!ms) return 'never';
	const s = Math.round((now - ms) / 1000);
	if (s < 0) return 'just now';
	if (s < 90) return `${s}s ago`;
	if (s < 5400) return `${Math.round(s / 60)}m ago`;
	if (s < 172800) return `${Math.round(s / 3600)}h ago`;
	return `${Math.round(s / 86400)}d ago`;
}

export function duration(ms: number): string {
	const h = ms / 3_600_000;
	if (h < 48) return `${h.toFixed(1)}h`;
	return `${(h / 24).toFixed(1)}d`;
}

/** Class for a signed value: up/down/none. */
export function sign(x: number | null | undefined): string {
	if (x === null || x === undefined || !Number.isFinite(x) || x === 0) return '';
	return x > 0 ? 'up' : 'down';
}

export { CONTROL_SLUGS };

/** "1:200"; "1:200*" when the instrument trades at less (crypto and shares stop at 1:20). */
export function lev(r: Pick<LeaderboardRow, 'leverage' | 'effectiveLeverage'>): string {
	if (r.leverage === null) return '—';
	return r.effectiveLeverage !== null && r.effectiveLeverage < r.leverage ? `1:${r.leverage}*` : `1:${r.leverage}`;
}

export function levTitle(r: Pick<LeaderboardRow, 'leverage' | 'effectiveLeverage'>): string {
	if (r.leverage === null) return 'from before leverage tiers';
	if (r.effectiveLeverage !== null && r.effectiveLeverage < r.leverage) return `1:${r.leverage} account; crypto and shares trade at most 1:${r.effectiveLeverage}`;
	return r.leverage === 1 ? '1:1 account: no leverage (no overnight fee on crypto and shares)' : `1:${r.leverage} account`;
}

/** Control agents (no edge by construction) are shown as reference rows. */
export function isControl(row: Pick<LeaderboardRow, 'slug'>): boolean {
	return isControlSlug(row.slug);
}

export type MetricKey = keyof Pick<
	RunMetrics,
	'totalReturn' | 'annualReturn' | 'maxDrawdown' | 'sharpe' | 'trades' | 'winRate' | 'profitFactor' | 'tStat' | 'days' | 'exposure'
>;

export function median(xs: number[]): number {
	if (xs.length === 0) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
