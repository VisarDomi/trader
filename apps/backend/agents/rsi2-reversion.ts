import { defineAgent } from '../src/sdk';

/**
 * Connors-style RSI(2): buy extreme short-term oversold readings while the
 * long-term trend is up (and the mirror for shorts). Exit on the bounce.
 */
export default defineAgent({
  name: 'RSI(2) Reversion',
  description: 'Buys RSI(2) extremes in the direction of the 200-bar trend and exits on the snap-back.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { low: 10, high: 90, trend: 200, exitMa: 5, atrStop: 3, maxBars: 24, shorts: true, riskPct: 1 },
  variants: {
    'both': {},
    'long-only': { shorts: false },
  },
  warmup: 210,
  onBar(ctx) {
    const { low, high, trend, exitMa, atrStop, maxBars, shorts, riskPct } = ctx.params;
    const rsi = ctx.ta.rsi(2);
    const price = ctx.bar.close;
    const sma = ctx.ta.sma(trend);
    const exit = ctx.ta.sma(exitMa);
    const atr = ctx.ta.atr(14);
    const pos = ctx.position;

    if (pos) {
      if (pos.side === 'long' && (price > exit || rsi > 70)) ctx.close('bounced');
      else if (pos.side === 'short' && (price < exit || rsi < 30)) ctx.close('faded');
      else if (pos.barsHeld >= maxBars) ctx.close('time stop');
      return;
    }
    if (price > sma && rsi < low) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `rsi2 ${rsi.toFixed(1)}` });
    else if (shorts && price < sma && rsi > high) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `rsi2 ${rsi.toFixed(1)}` });
  },
});
