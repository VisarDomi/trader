import { defineAgent } from '../src/sdk';

/**
 * Trend + forecast agreement: only trade an EMA trend when TimesFM's median
 * over the next `horizon` bars points the same way; exit when either side
 * disagrees.
 */
export default defineAgent({
  name: 'TimesFM Trend Confirm',
  description: 'Takes EMA-trend trades only when the TimesFM forecast agrees; exits on disagreement.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { fast: 20, slow: 50, horizon: 12, minZ: 0.15, atrStop: 2.5, riskPct: 1 },
  forecast: { horizon: 16, context: 512 },
  warmup: 60,
  onBar(ctx) {
    const { fast, slow, horizon, minZ, atrStop, riskPct } = ctx.params;
    const f = ctx.forecast;
    if (!f) return;
    const step = horizon - 1;
    const price = ctx.bar.close;
    const sigma = (f.quantile(0.9, step) - f.quantile(0.1, step)) / 2.56;
    if (!(sigma > 0)) return;
    const z = (f.median[step]! - price) / sigma;
    const trendUp = ctx.ta.ema(fast) > ctx.ta.ema(slow);
    const atr = ctx.ta.atr(14);
    const pos = ctx.position;

    if (pos?.side === 'long' && (!trendUp || z < 0)) ctx.close(`disagreement (z ${z.toFixed(2)})`);
    if (pos?.side === 'short' && (trendUp || z > 0)) ctx.close(`disagreement (z ${z.toFixed(2)})`);
    if (ctx.position) return;
    if (trendUp && z > minZ) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `uptrend, forecast z ${z.toFixed(2)}` });
    else if (!trendUp && z < -minZ) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `downtrend, forecast z ${z.toFixed(2)}` });
  },
});
