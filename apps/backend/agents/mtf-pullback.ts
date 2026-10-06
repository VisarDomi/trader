import { defineAgent } from '../src/sdk';

/**
 * Multi-timeframe pullback: the 4h EMA stack sets the trend, the 1h RSI finds a
 * pullback, and the entry fires when RSI turns back in the trend's direction.
 */
export default defineAgent({
  name: 'MTF Pullback',
  description: 'Buys 1h pullbacks inside a 4h uptrend (and sells rallies in a 4h downtrend).',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  extraTimeframes: ['4h'],
  params: { fast: 50, slow: 200, rsiLevel: 40, swing: 10, rr: 2, riskPct: 1 },
  warmup: 60,
  onBar(ctx) {
    const { fast, slow, rsiLevel, swing, rr, riskPct } = ctx.params;
    const h4 = ctx.tf('4h');
    if (h4.bars.length < slow) return;
    const up = h4.ta.ema(fast) > h4.ta.ema(slow);
    const down = h4.ta.ema(fast) < h4.ta.ema(slow);
    const rsi = ctx.ta.series.rsi(14);
    const price = ctx.bar.close;
    if (ctx.position) return;

    if (up && ctx.ta.crossedAbove(rsi, rsiLevel)) {
      const stop = ctx.ta.lowest(swing);
      if (stop < price) ctx.buy({ stopLoss: stop, takeProfit: price + rr * (price - stop), riskPct, reason: '4h uptrend, 1h RSI turned up' });
    } else if (down && ctx.ta.crossedBelow(rsi, 100 - rsiLevel)) {
      const stop = ctx.ta.highest(swing);
      if (stop > price) ctx.sell({ stopLoss: stop, takeProfit: price - rr * (stop - price), riskPct, reason: '4h downtrend, 1h RSI turned down' });
    }
  },
});
