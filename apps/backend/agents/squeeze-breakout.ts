import { defineAgent } from '../src/sdk';

/**
 * Volatility squeeze: when the Bollinger bands contract inside the Keltner
 * channel for a while, volatility tends to expand. Trade the direction of the
 * release and trail a 2 ATR stop.
 */
export default defineAgent({
  name: 'Volatility Squeeze',
  description: 'Waits for Bollinger bands to squeeze inside Keltner, then trades the breakout with a trailing stop.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { period: 20, minSqueezeBars: 6, trail: 2, riskPct: 1 },
  warmup: 40,
  onBar(ctx) {
    const { period, minSqueezeBars, trail, riskPct } = ctx.params;
    const bb = ctx.ta.series.bollinger(period, 2);
    const kc = ctx.ta.series.keltner(period, 1.5);
    // Count consecutive squeezed bars before this one.
    let squeezed = 0;
    for (let i = 2; i <= minSqueezeBars + 1; i++) {
      if (bb.upper.at(-i)! < kc.upper.at(-i)! && bb.lower.at(-i)! > kc.lower.at(-i)!) squeezed++;
      else break;
    }
    if (ctx.position || squeezed < minSqueezeBars) return;
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(14);
    if (price > bb.upper.at(-1)!) ctx.buy({ trailingStop: trail * atr, riskPct, reason: `squeeze release up after ${squeezed} bars` });
    else if (price < bb.lower.at(-1)!) ctx.sell({ trailingStop: trail * atr, riskPct, reason: `squeeze release down after ${squeezed} bars` });
  },
});
