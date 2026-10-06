import { defineAgent } from '../src/sdk';

/**
 * Range fade: in a non-trending market (low ADX), sell closes above the upper
 * Bollinger band and buy closes below the lower band, targeting the middle.
 */
export default defineAgent({
  name: 'Bollinger Fade',
  description: 'Fades Bollinger band extremes back to the mean while ADX says the market is ranging.',
  author: 'claude',
  instruments: ['US100', 'US500', 'GOLD', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '15m',
  params: { period: 20, mult: 2, adxMax: 22, atrStop: 2, riskPct: 0.75 },
  intradayOnly: true,
  warmup: 60,
  onBar(ctx) {
    const { period, mult, adxMax, atrStop, riskPct } = ctx.params;
    const bb = ctx.ta.bollinger(period, mult);
    const adx = ctx.ta.adx(14).adx;
    const rsi = ctx.ta.rsi(14);
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(14);
    const pos = ctx.position;

    if (pos?.side === 'long' && price >= bb.middle) ctx.close('reached the middle band');
    if (pos?.side === 'short' && price <= bb.middle) ctx.close('reached the middle band');
    if (ctx.position || !(adx < adxMax)) return;

    if (price < bb.lower && rsi < 30) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: 'below lower band in a range' });
    else if (price > bb.upper && rsi > 70) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: 'above upper band in a range' });
  },
});
