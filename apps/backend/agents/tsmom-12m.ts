import { defineAgent } from '../src/sdk';

/**
 * Time-series momentum, the textbook version (Moskowitz, Ooi & Pedersen 2012;
 * Hurst, Ooi & Pedersen, "A Century of Evidence on Trend-Following", 2017):
 * long when the last 12 months' return is positive, short when negative,
 * sized so each position aims at the same volatility, rebalanced monthly.
 * Across 67 markets since 1880 it earned a Sharpe ratio of about 0.77 after
 * fees, and it held up in most crises. One instrument is a weak bet on its own;
 * the sum of these runs across asset classes is the managed-futures portfolio.
 * Distinct from `tsmom` (5- and 20-day lookbacks on 4-hour bars).
 */
export default defineAgent({
  name: 'Time-Series Momentum (12 months)',
  description: 'Long or short each market by the sign of its 12-month return, sized to 15% annual volatility (up to 3×), rebalanced monthly.',
  author: 'claude',
  instruments: ['US500', 'US100', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1d',
  params: { lookbackDays: 365, volBars: 63, targetVol: 15, maxExposure: 3 },
  init: () => ({ month: -1 }),
  warmup: 2,
  onBar(ctx) {
    const { lookbackDays, volBars, targetVol, maxExposure } = ctx.params;
    const bars = ctx.bars;
    const month = new Date(ctx.time).getUTCMonth();
    if (month === ctx.state.month) return;
    // The close a year ago: the last bar that closed at least lookbackDays before this one.
    const cutoff = ctx.bar.time - lookbackDays * DAY_MS;
    let i = bars.length - 1;
    while (i >= 0 && bars[i]!.time > cutoff) i--;
    if (i < 0 || bars.length <= volBars) return;
    const past = bars[i]!.close;
    const vol = annualVol(bars, volBars);
    if (!Number.isFinite(vol) || vol <= 0) return;

    ctx.state.month = month;
    const ret = ctx.bar.close / past - 1;
    const exposure = Math.min(maxExposure, targetVol / vol);
    const reason = `12-month return ${(100 * ret).toFixed(1)}%, volatility ${vol.toFixed(1)}%: ${exposure.toFixed(2)}× equity`;
    if (ctx.position) ctx.close('monthly rebalance');
    if (ret > 0) ctx.buy({ exposure, reason });
    else if (ret < 0) ctx.sell({ exposure, reason });
  },
});

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;

/** Annualised volatility (%) of the last `n` bar-to-bar log returns, scaled by calendar time. */
function annualVol(bars: readonly { time: number; close: number }[], n: number): number {
  let sumSq = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const r = Math.log(bars[i]!.close / bars[i - 1]!.close);
    sumSq += r * r;
  }
  const span = bars.at(-1)!.time - bars.at(-1 - n)!.time;
  return Math.sqrt((sumSq * YEAR_MS) / span) * 100;
}
