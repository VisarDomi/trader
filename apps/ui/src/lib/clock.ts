/**
 * Words for a record's verdict on the daily clock (apps/backend/EVIDENCE.md "The daily clock"; the verdict itself
 * comes from the shared policy). Shared by the website and the native screens.
 */
import type { FamilyClock, FamilyView, LeaderboardRow, RecordClock } from '@trader/shared';
import { assess, assessFamily, LIFECYCLE, VERDICT, type Verdict } from '@trader/shared';

const minus = (n: number, digits = 2) => n.toFixed(digits).replace(/^-/, '−');
export const verdictWord = (v: Verdict) => v[0]!.toUpperCase() + v.slice(1);
const SHOWN: ReadonlySet<Verdict> = new Set([VERDICT.EARLY, VERDICT.KEEP, VERDICT.CANDIDATE, VERDICT.CONFIRMED, VERDICT.RETIRE]);

/**
 * "Early · 3 trades in 40 days · daily t 1.63", "Candidate · daily t 2.05 over 49 days · may still be luck".
 * Empty for controls, retired records and records without a clock. `named`: the caller already shows the verdict.
 */
export function clockLine(row: LeaderboardRow, now = Date.now(), named = false): string {
	const c = row.evidence?.clock;
	if (!c) return '';
	const { verdict } = assess(row, now);
	if (!SHOWN.has(verdict)) return '';
	const days = Math.floor(c.days), t = `daily t ${minus(c.t)}`;
	const facts = verdict === VERDICT.EARLY ? `${c.trades} ${c.trades === 1 ? 'trade' : 'trades'} in ${days} days · ${t}`
		: `${t} over ${days} days${verdict === VERDICT.CANDIDATE ? ' · may still be luck' : ''}`;
	return named ? facts[0]!.toUpperCase() + facts.slice(1) : `${verdictWord(verdict)} · ${facts}`;
}
/** What the record needs: "confirmed at t 5.99 with 844 records tried (3.71 alone)". */
export function barsLine(c: RecordClock): string {
	if (c.confirmAt == null || c.aloneAt == null) return '';
	return `Confirmed at t ${minus(c.confirmAt)} with ${c.trials.toLocaleString('en-US')} records tried (${minus(c.aloneAt)} alone) · candidate at ${minus(LIFECYCLE.CANDIDATE_TSTAT)}${c.monkey != null ? `, above the luckiest monkey's ${minus(c.monkey)}` : ''}`;
}
/** "Agrees with its backtest (1.9 standard errors above)"; a record more than two above does not. */
export function agreementLine(c: RecordClock): string {
	if (c.backtestZ == null) return 'No backtest of this code: it cannot be confirmed';
	const side = `${minus(Math.abs(c.backtestZ), 1)} standard errors ${c.backtestZ >= 0 ? 'above' : 'below'}`;
	return c.backtestZ > LIFECYCLE.AGREE_Z ? `Better than its backtest allows (${side}; agrees up to ${LIFECYCLE.AGREE_Z})` : `Agrees with its backtest (${side})`;
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Where the record stands among its family's judged members: "1st of 16 in Visar night". */
export function standingTitle(f: FamilyView): string {
	return f.member ? `${ordinal(f.member.rank)} of ${f.member.of} in ${f.name}` : `In ${f.name}`;
}
/** What the spread between the members supports: nothing while it is no wider than chance, else a share of each lead. */
export function standingLine(f: FamilyView): string {
	const m = f.member;
	if (!m) return '';
	const spread = `Members' t-statistics differ by ${minus(m.spread)}; chance alone gives 1.00`;
	return m.kept > 0 ? `${spread}. ${(m.kept * 100).toFixed(0)}% of this record's lead over the average member is kept`
		: `${spread}. The members cannot be told apart yet, so each is read at their average`;
}
/** What the family needs: "confirmed at t 4.62 with 39 families tried (3.57 alone)". */
export function familyBarsLine(f: FamilyClock): string {
	if (f.confirmAt == null || f.aloneAt == null) return '';
	return `Confirmed at t ${minus(f.confirmAt)} with ${f.trials} families tried (${minus(f.aloneAt)} alone) · candidate at ${minus(LIFECYCLE.CANDIDATE_TSTAT)}${f.monkey != null ? `, above the monkeys' family t ${minus(f.monkey)}` : ''}`;
}
/** "Agrees with its backtests (1.3 standard errors above)" for the family's pooled backtests. */
export function familyAgreementLine(f: FamilyClock): string {
	if (f.backtestZ == null) return 'No backtest of its running code: it cannot be confirmed';
	const side = `${minus(Math.abs(f.backtestZ), 1)} standard errors ${f.backtestZ >= 0 ? 'above' : 'below'}`;
	return f.backtestZ > LIFECYCLE.AGREE_Z ? `Better than its backtests allow (${side}; agrees up to ${LIFECYCLE.AGREE_Z})` : `Agrees with its backtests (${side})`;
}
