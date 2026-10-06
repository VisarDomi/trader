import { defineAgent } from '../src/sdk';

/**
 * Slower TimesFM use: on 4h bars, take the direction of the median forecast
 * one day ahead (6 bars) only when the whole 30%-70% band sits on one side of
 * the current price, i.e. the model is confident about the sign. Hold until
 * the band straddles the price again or the horizon passes.
 */
export default defineAgent({
  name: 'TimesFM Swing (4h)',
  description: 'Trades a day-ahead TimesFM forecast on 4h bars only when its inner (30-70%) band is entirely above or below the price.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '4h',
  params: { step: 5, atrStop: 2, maxBars: 6, riskPct: 1 },
  forecast: { horizon: 6, context: 512 },
  warmup: 30,
  onBar(ctx) {
    const { step, atrStop, maxBars, riskPct } = ctx.params;
    const f = ctx.forecast;
    if (!f) return;
    const price = ctx.bar.close;
    const lo = f.quantile(0.3, step);
    const hi = f.quantile(0.7, step);
    const bullish = lo > price;
    const bearish = hi < price;
    const pos = ctx.position;

    if (pos) {
      const lostConviction = pos.side === 'long' ? !bullish : !bearish;
      if (lostConviction || pos.barsHeld >= maxBars) ctx.close(lostConviction ? 'band straddles price' : 'horizon passed');
      return;
    }
    const atr = ctx.ta.atr(14);
    if (bullish) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `30% quantile ${lo.toFixed(2)} above price` });
    else if (bearish) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `70% quantile ${hi.toFixed(2)} below price` });
  },
});
