/**
 * The 1:1 hold every record is compared with: the instrument bought outright with the same money, never sold, and
 * no CFD fees (EVIDENCE.md "Common-date controls"). An index can be owned through its shares (or a tracker), a share
 * and a coin directly, a metal as metal, and a currency as a deposit, so none of them pays overnight funding; the
 * Buy & Hold control agent, a CFD at 0.9× exposure, does and stays a control, not the benchmark.
 *
 * Return = (1 + price change) × (1 + what owning it paid) − 1:
 * - indices: the tracker's dividends (US500 SPY, US100 QQQ, US30 DIA); shares: their own dividends;
 * - currencies: the foreign deposit rate (EURUSD €STR, GBPUSD SONIA, AUDUSD 3-month);
 * - gold, silver, crypto: price only;
 * - oil and natural gas: price only, though nobody owns barrels or gas outright; it is an upper bound for a real
 *   holder, who pays storage or futures roll.
 * Prices are the arena's own (minute candles, else the lab's daily bars), so a backtest and its hold share a source.
 */
import type { HoldBreakdown } from '@trader/shared/types';
import type { ArenaDB } from './db.ts';
import { DEPOSITS, DIVIDENDS, type Rates } from './rates.ts';

const PRICE_ONLY_UPPER_BOUND = new Set(['OIL_CRUDE', 'NATURALGAS']);

export interface Hold extends HoldBreakdown { ret: number }

/** The outright hold from `from` to `through`, or why it is not available yet. */
export function outrightHold(db: ArenaDB, rates: Pick<Rates, 'deposit' | 'dividendsOver'> | undefined, epic: string, from: number, through: number): Hold | string {
  const start = db.priceAt(epic, from), end = db.priceAt(epic, through);
  if (!start || !end) return 'No stored prices for these dates.';
  if (end.t <= start.t) return 'Waiting for a price after the start.';
  const price = end.price / start.price - 1;
  let income = 0, kind: HoldBreakdown['kind'] = 'none', source: string | undefined;
  if (DIVIDENDS[epic]) {
    const d = rates?.dividendsOver(epic, from, through);
    if (!d) return 'Waiting for the dividend history.';
    income = d.income; kind = 'dividends'; source = `${DIVIDENDS[epic]} dividends ×${d.count}`;
  } else if (DEPOSITS[epic]) {
    const interest = rates?.deposit(epic, from, through);
    if (interest == null) return 'Waiting for the deposit rate.';
    income = interest; kind = 'interest'; source = `${DEPOSITS[epic]!.name} on ${DEPOSITS[epic]!.currency}`;
  }
  return { ret: (1 + price) * (1 + income) - 1, price, income, kind, ...(source ? { source } : {}),
    ...(PRICE_ONLY_UPPER_BOUND.has(epic) ? { priceOnly: true } : {}) };
}
