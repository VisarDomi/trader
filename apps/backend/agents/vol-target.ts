import { defineAgent } from '../src/sdk';

/**
 * Volatility targeting (Moreira & Muir, "Volatility-Managed Portfolios",
 * Journal of Finance 2017; Harvey et al. 2018): hold the index long with an
 * exposure inversely proportional to its realized volatility over the last
 * month, aiming at a steady 15% a year: up to 2× equity in calm markets, well
 * under 1× in turbulent ones. Equity volatility clusters but returns do not
 * rise with it, which has historically made the calm-market leverage pay.
 * Rebalanced on the first daily bar of each month (close and reopen).
 */
export default defineAgent({
  name: 'Volatility Target',
  description: 'Long US indices sized to a 15% annual volatility from the last month of returns (0-2× equity), rebalanced monthly.',
  author: 'claude',
  instruments: ['US500', 'US100', 'US30'],
  timeframe: '1d',
  params: { targetVol: 15, lookback: 21, maxExposure: 2 },
  init: () => ({ month: -1 }),
  warmup: 25,
  onBar(ctx) {
    const { targetVol, lookback, maxExposure } = ctx.params;
    const bars = ctx.bars;
    if (bars.length <= lookback) return;
    // Realized variance of daily log returns, scaled to a year by calendar time (weekend bars do not distort it).
    let sumSq = 0;
    for (let i = bars.length - lookback; i < bars.length; i++) {
      const r = Math.log(bars[i]!.close / bars[i - 1]!.close);
      sumSq += r * r;
    }
    const span = bars.at(-1)!.time - bars.at(-1 - lookback)!.time;
    const vol = Math.sqrt((sumSq * YEAR_MS) / span) * 100;
    if (!Number.isFinite(vol) || vol <= 0) return;
    const exposure = Math.min(maxExposure, targetVol / vol);
    const month = new Date(ctx.time).getUTCMonth();
    if (ctx.position && month === ctx.state.month) return;

    ctx.state.month = month;
    if (ctx.position) ctx.close('monthly rebalance');
    ctx.buy({ exposure, reason: `realized volatility ${vol.toFixed(1)}%: ${exposure.toFixed(2)}× equity` });
  },
});

const YEAR_MS = 365.25 * 86_400_000;
