/**
 * Words for a record's verdict on the daily clock (apps/backend/EVIDENCE.md "The daily clock"; the verdict itself
 * comes from the shared policy). Shared by the website and the native screens.
 */
import type { FamilyClock, LeaderboardRow, RecordClock } from '@trader/shared';
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
/**
 * The record's family judged as one record: "Family Visar night (16 records): Keep · daily t 1.27 over 43 days".
 * Empty for a family that never had a second record: it says what the record says.
 */
export function familyLine(c: RecordClock | undefined): string {
	const f = c?.family;
	if (!f || f.everRecords < 2) return '';
	const { verdict } = assessFamily(f), days = Math.floor(f.days), t = `daily t ${minus(f.t)}`;
	return `Family ${f.name} (${f.records} ${f.records === 1 ? 'record' : 'records'}): ${verdictWord(verdict)} · ${verdict === VERDICT.EARLY ? `${f.trades} ${f.trades === 1 ? 'trade' : 'trades'} in ${days} days · ${t}` : `${t} over ${days} days`}`;
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
