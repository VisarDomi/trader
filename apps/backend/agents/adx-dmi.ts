import { defineAgent } from '../src/sdk';

/**
 * Directional Movement: trade +DI/-DI crossovers only when ADX says a trend is
 * present; exit on the opposite crossover or when the trend fades.
 */
export default defineAgent({
  name: 'ADX DMI Trend',
  description: '+DI/-DI crossovers confirmed by ADX above a threshold; exits when ADX fades.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { period: 14, adxMin: 25, adxExit: 18, atrStop: 2.5, riskPct: 1 },
  warmup: 60,
  onBar(ctx) {
    const { period, adxMin, adxExit, atrStop, riskPct } = ctx.params;
    const d = ctx.ta.series.adx(period);
    const adx = d.adx.at(-1)!;
    const bull = ctx.ta.crossedAbove(d.plusDI, d.minusDI);
    const bear = ctx.ta.crossedBelow(d.plusDI, d.minusDI);
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(14);
    const pos = ctx.position;

    if (pos && (adx < adxExit || (pos.side === 'long' && bear) || (pos.side === 'short' && bull))) {
      ctx.close(`adx ${adx.toFixed(1)}`);
    }
    if (ctx.position || !(adx > adxMin)) return;
    if (bull) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `+DI cross, adx ${adx.toFixed(1)}` });
    else if (bear) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `-DI cross, adx ${adx.toFixed(1)}` });
  },
});
