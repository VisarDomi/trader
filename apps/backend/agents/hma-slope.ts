import { defineAgent } from '../src/sdk';

/**
 * Hull moving average turning points: the HMA reacts fast with little lag, so
 * a change in its slope is used as the trend signal.
 */
export default defineAgent({
  name: 'Hull MA Slope',
  description: 'Goes with the slope of a Hull moving average; reverses when the slope turns.',
  author: 'claude',
  instruments: ['US100', 'US500', 'GOLD', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { period: 55, atrStop: 2.5, riskPct: 1 },
  warmup: 80,
  onBar(ctx) {
    const { period, atrStop, riskPct } = ctx.params;
    const hma = ctx.ta.series.hma(period);
    const [a, b, c] = [hma.at(-3)!, hma.at(-2)!, hma.at(-1)!];
    if ([a, b, c].some(Number.isNaN)) return;
    const turnedUp = b <= a && c > b;
    const turnedDown = b >= a && c < b;
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(14);

    if (turnedUp) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: 'HMA turned up' });
    else if (turnedDown) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: 'HMA turned down' });
  },
});
