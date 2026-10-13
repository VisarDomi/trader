import { defineAgent } from '../src/sdk';

/**
 * Leverage for the Long Run (Gayed & Bilello 2016): hold the index with
 * leverage while it closes above its 200-day average, and cash while below.
 * Volatility is lower and trends persist above the average, so that is where
 * leverage pays; below it, leveraged losses compound. 1928-2015: Sharpe 0.51
 * against 0.30 for buy-and-hold, with a 1% borrowing cost. The authors' 2026
 * revision with realistic borrowing finds about the same Sharpe as the index:
 * timed leverage buys more growth for a similar drawdown. Here the borrowing
 * cost is the CFD funding (about 8% a year of the extra notional), except at
 * 1:1, which pays none.
 *
 *   x1  1× (the filter alone, on the fee-free 1:1 account)
 *   x2  2× (the r/LETFs favourite)
 *   x3  3× (the paper's UPRO-style case)
 */
export default defineAgent({
  name: 'Leverage Rotation (200-day)',
  description: 'Long the index at 1×, 2× or 3× equity while it closes above its 200-day average, in cash below.',
  author: 'claude',
  instruments: ['US500', 'US100'],
  timeframe: '1d',
  params: { exposure: 1, trendDays: 200 },
  variants: {
    x1: {},
    x2: { exposure: 2 },
    x3: { exposure: 3 },
  },
  warmup: 201,
  onBar(ctx) {
    const { exposure, trendDays } = ctx.params;
    const avg = ctx.ta.sma(trendDays);
    if (Number.isNaN(avg)) return;
    const price = ctx.bar.close;
    if (price > avg && !ctx.position) ctx.buy({ exposure, reason: `close above the ${trendDays}-day average: ${exposure}× equity` });
    else if (price < avg && ctx.position) ctx.close(`close below the ${trendDays}-day average`);
  },
});
