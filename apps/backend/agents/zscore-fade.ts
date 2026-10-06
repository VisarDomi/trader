import { defineAgent } from '../src/sdk';

/**
 * Statistical mean reversion: fade moves more than `entryZ` standard
 * deviations from the rolling mean; exit back at the mean or after a time stop.
 */
export default defineAgent({
  name: 'Z-Score Fade',
  description: 'Fades price when it stretches more than ~2 standard deviations from its rolling mean.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { period: 50, entryZ: 2.2, exitZ: 0, atrStop: 3, maxBars: 48, riskPct: 0.75 },
  warmup: 60,
  onBar(ctx) {
    const { period, entryZ, exitZ, atrStop, maxBars, riskPct } = ctx.params;
    const z = ctx.ta.zscore(period);
    if (Number.isNaN(z)) return;
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(14);
    const pos = ctx.position;

    if (pos) {
      const done = pos.side === 'long' ? z >= exitZ : z <= -exitZ;
      if (done) ctx.close(`z back to ${z.toFixed(2)}`);
      else if (pos.barsHeld >= maxBars) ctx.close('time stop');
      return;
    }
    if (z < -entryZ) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `z ${z.toFixed(2)}` });
    else if (z > entryZ) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `z ${z.toFixed(2)}` });
  },
});
