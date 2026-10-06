import { defineAgent } from '../src/sdk';

/**
 * Keltner channel trend entry: a close outside the channel (EMA ± k·ATR)
 * starts a trend trade; exit when price returns to the middle line.
 */
export default defineAgent({
  name: 'Keltner Trend',
  description: 'Enters on closes outside the Keltner channel and exits back at the middle line.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '4h',
  params: { period: 20, mult: 2, atrStop: 2, riskPct: 1 },
  warmup: 40,
  onBar(ctx) {
    const { period, mult, atrStop, riskPct } = ctx.params;
    const k = ctx.ta.keltner(period, mult);
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(period);
    const pos = ctx.position;

    if (pos?.side === 'long' && price < k.middle) ctx.close('back below the middle');
    if (pos?.side === 'short' && price > k.middle) ctx.close('back above the middle');
    if (ctx.position) return;

    if (price > k.upper) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: 'close above Keltner' });
    else if (price < k.lower) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: 'close below Keltner' });
  },
});
