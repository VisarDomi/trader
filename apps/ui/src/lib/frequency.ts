/**
 * Words for a record's frequency: how often its own backtest returned what the record did over as many days
 * (apps/backend/EVIDENCE.md "How often the backtest did this"). Shared by the website and the native screens.
 */
import type { BacktestFrequency } from '@trader/shared';

/** The side of its backtest the record sits on, and the periods at least that far out. */
export function frequencySide(f: BacktestFrequency): { well: boolean; count: number } {
	const well = f.atLeast <= f.atMost;
	return { well, count: well ? f.atLeast : f.atMost };
}
/** A share as "1.3%", "16%" or "<0.1%". */
export function percentText(share: number): string {
	const p = share * 100;
	return p < 0.1 ? '<0.1%' : `${p.toFixed(p < 10 ? 1 : 0)}%`;
}
/** A count of periods as their share; "never" for none. */
export const shareText = (count: number, of: number): string => (count <= 0 || !(of > 0) ? 'never' : percentText(count / of));
export const daysText = (days: number) => (days === 1 ? '1 day' : `${days} days`);
/** "Backtest did this well in 1.3% of 48-day periods"; "Backtest never did this well in 40 days (825 periods)". */
export function frequencyLine(f: BacktestFrequency | undefined): string {
	if (!f) return '';
	const { well, count } = frequencySide(f), how = well ? 'well' : 'badly';
	return count === 0 ? `Backtest never did this ${how} in ${daysText(f.days)} (${f.periods} periods)` : `Backtest did this ${how} in ${shareText(count, f.periods)} of ${f.days}-day periods`;
}
/** "3 of 3 trades won; that many or more happen 8.3% of the time at the backtest's 43.7% win rate (71 trades)". */
export function winsLine(f: BacktestFrequency | undefined): string {
	const w = f?.wins;
	if (!w) return '';
	return `${w.won} of ${w.trades} ${w.trades === 1 ? 'trade' : 'trades'} won; that many or more happen ${percentText(w.chance)} of the time at the backtest's ${(w.rate * 100).toFixed(1)}% win rate (${w.backtestTrades} trades)`;
}
