import { defineAgent } from '../src/sdk';

/**
 * Classic trend following: long when the fast EMA crosses above the slow EMA,
 * short on the opposite cross. ATR stop, and the opposite cross flips the position.
 */
export default defineAgent({
  name: 'EMA Cross',
  description: 'Fast/slow EMA crossover with an ATR stop; always in the market after the first signal.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { fast: 20, slow: 50, atrStop: 3, riskPct: 1 },
  variants: {
    '20-50': {},
    '9-21': { fast: 9, slow: 21 },
  },
  warmup: 60,
  onBar(ctx) {
    const { fast, slow, atrStop, riskPct } = ctx.params;
    const fastEma = ctx.ta.series.ema(fast);
    const slowEma = ctx.ta.series.ema(slow);
    const atr = ctx.ta.atr(14);
    const price = ctx.bar.close;

    if (ctx.ta.crossedAbove(fastEma, slowEma)) {
      ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: 'fast EMA crossed above slow' });
    } else if (ctx.ta.crossedBelow(fastEma, slowEma)) {
      ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: 'fast EMA crossed below slow' });
    }
  },
});
