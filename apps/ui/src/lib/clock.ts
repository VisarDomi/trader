/**
 * Words for a record's verdict on the daily clock (apps/backend/EVIDENCE.md "The daily clock"; the verdict itself
 * comes from the shared policy). Shared by the website and the native screens.
 */
import type { FamilyClock, FamilyView, LeaderboardRow, PortfolioClock, RecordClock } from '@trader/shared';
import { assess, assessFamily, assessPortfolio, LIFECYCLE, VERDICT, type Verdict } from '@trader/shared';

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
/** "about 12 months", "about 4.1 years", "42 days". */
export function spanText(days: number): string {
	if (days < 60) return `${Math.round(days)} days`;
	const months = days / 30.44;
	return months < 23.5 ? `about ${Math.round(months)} months` : `about ${(days / 365.25).toFixed(1)} years`;
}
/** "Early · 12 of 42 days · t 1.09", "Candidate · t 2.31 over 96 days · may still be luck". */
export function portfolioLine(p: PortfolioClock): string {
	if (p.since === null) return 'No records picked yet';
	const { verdict } = assessPortfolio(p), days = Math.floor(p.days), t = `t ${minus(p.t)}`;
	return verdict === VERDICT.EARLY ? `Early · ${days} of ${LIFECYCLE.MIN_DAYS} days · ${t}`
		: `${verdictWord(verdict)} · ${t} over ${days} days${verdict === VERDICT.CANDIDATE ? ' · may still be luck' : ''}`;
}
/** What the portfolio needs: "Confirmed at t 3.84 from 42 days, as one claim made in advance · candidate at 2.00". */
export function portfolioBarsLine(p: PortfolioClock): string {
	if (p.confirmAt == null) return '';
	return `Confirmed at t ${minus(p.confirmAt)} from ${LIFECYCLE.MIN_DAYS} days, as ${p.trials === 1 ? 'one claim made in advance' : `one of ${p.trials} portfolios declared in advance`} · candidate at ${minus(LIFECYCLE.CANDIDATE_TSTAT)}${p.monkey != null ? `, above the monkeys' family t ${minus(p.monkey)}` : ''}`;
}
/** When to expect the answer: "Holding its backtests' Sharpe of 3.01 it is confirmed about 12 months after its first pick; at half of it, about 4.1 years". */
export function portfolioPaceLine(p: PortfolioClock): string {
	if (p.backtestSharpe == null || p.confirmed) return '';
	const { backtest, half } = p.confirmDays;
	if (backtest == null) return `Its backtests' Sharpe of ${minus(p.backtestSharpe)} would not confirm it in fifty years`;
	return `Holding its backtests' Sharpe of ${minus(p.backtestSharpe)} it is confirmed ${spanText(backtest)} after its first pick; at half of it, ${half == null ? 'not in fifty years' : spanText(half)}`;
}
/** The forward pace so far against the backtests the records were picked on. */
export function portfolioBacktestLine(p: PortfolioClock): string {
	if (p.backtestSharpe == null) return '';
	return `${p.sharpe != null && p.observations >= 10 ? `Running at a Sharpe of ${minus(p.sharpe)} a year over ${p.observations} weekdays. ` : ''}Its backtests give ${minus(p.backtestSharpe)}, which flatters it: the records were picked on them`;
}
/** The rule in words. */
export function portfolioRuleLine(p: PortfolioClock): string {
	return `Every running strategy record whose backtest Sharpe before T-bills is ${p.minBacktestSharpe} or more, at equal risk, picked again from backtests alone each month`;
}
