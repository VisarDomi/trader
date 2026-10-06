import { defineAgent } from '../src/sdk';

/**
 * Stochastic reversals in quiet markets: %K crossing %D in the oversold zone
 * (long) or overbought zone (short), only while ADX is low.
 */
export default defineAgent({
  name: 'Stochastic Range',
  description: 'Stochastic %K/%D crosses at the extremes, taken only in low-ADX (ranging) conditions.',
  author: 'claude',
  instruments: ['US100', 'US500', 'GOLD', 'SILVER', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD'],
  timeframe: '30m',
  params: { k: 14, d: 3, low: 20, high: 80, adxMax: 20, atrStop: 2, rr: 1.5, riskPct: 0.75 },
  warmup: 60,
  onBar(ctx) {
    const { k, d, low, high, adxMax, atrStop, rr, riskPct } = ctx.params;
    if (ctx.position) return;
    if (!(ctx.ta.adx(14).adx < adxMax)) return;
    const st = ctx.ta.series.stoch(k, d);
    const kNow = st.k.at(-1)!;
    const price = ctx.bar.close;
    const stop = atrStop * ctx.ta.atr(14);

    if (ctx.ta.crossedAbove(st.k, st.d) && kNow < low) {
      ctx.buy({ stopLoss: price - stop, takeProfit: price + rr * stop, riskPct, reason: `stoch ${kNow.toFixed(0)} turned up` });
    } else if (ctx.ta.crossedBelow(st.k, st.d) && kNow > high) {
      ctx.sell({ stopLoss: price + stop, takeProfit: price - rr * stop, riskPct, reason: `stoch ${kNow.toFixed(0)} turned down` });
    }
  },
});
