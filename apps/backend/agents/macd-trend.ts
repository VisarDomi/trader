import { defineAgent } from '../src/sdk';

/**
 * MACD crossover filtered by a long EMA trend (port of the v1 macd-ema agent).
 * Long on a bullish MACD cross above the trend EMA, short on a bearish cross
 * below it; 2 ATR stop, 2R target, exit early on the opposite cross.
 */
export default defineAgent({
  name: 'MACD Trend',
  description: 'MACD signal-line crossovers taken only in the direction of a long EMA trend.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { trend: 200, atrStop: 2, rr: 2, riskPct: 1 },
  variants: {
    'ema200': {},
    'ema50': { trend: 50 },
  },
  warmup: 220,
  onBar(ctx) {
    const { trend, atrStop, rr, riskPct } = ctx.params;
    const price = ctx.bar.close;
    const m = ctx.ta.series.macd(12, 26, 9);
    const bullCross = ctx.ta.crossedAbove(m.macd, m.signal);
    const bearCross = ctx.ta.crossedBelow(m.macd, m.signal);
    const trendEma = ctx.ta.ema(trend);
    const atr = ctx.ta.atr(14);
    const pos = ctx.position;

    if (pos?.side === 'long' && bearCross) ctx.close('bearish MACD cross');
    if (pos?.side === 'short' && bullCross) ctx.close('bullish MACD cross');
    if (ctx.position) return;

    const stop = atrStop * atr;
    if (bullCross && price > trendEma) {
      ctx.buy({ stopLoss: price - stop, takeProfit: price + rr * stop, riskPct, reason: 'bull cross in uptrend' });
    } else if (bearCross && price < trendEma) {
      ctx.sell({ stopLoss: price + stop, takeProfit: price - rr * stop, riskPct, reason: 'bear cross in downtrend' });
    }
  },
});
