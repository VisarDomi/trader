import { defineAgent } from '../src/sdk';

/**
 * Trades the direction TimesFM 3 expects over the next few bars, but only when
 * the expected move is large compared with the model's own uncertainty
 * (the 10%-90% quantile band). Exits when the forecast flips or the horizon passes.
 */
export default defineAgent({
  name: 'TimesFM Drift',
  description: 'Follows the TimesFM 3 median forecast when its expected move is large relative to the forecast band.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { horizon: 8, entryZ: 0.35, exitZ: 0, atrStop: 2.5, riskPct: 1 },
  variants: {
    'h8': {},
    'h4': { horizon: 4, entryZ: 0.3 },
    'h16': { horizon: 16, entryZ: 0.4 },
  },
  forecast: { horizon: 16, context: 512 },
  warmup: 50,
  onBar(ctx) {
    const f = ctx.forecast;
    if (!f) return; // forecaster unreachable: do nothing new
    const { horizon, entryZ, exitZ, atrStop, riskPct } = ctx.params;
    const step = horizon - 1;
    const price = ctx.bar.close;
    const median = f.median[step]!;
    // Treat the 10-90 band as ±1.28 sigma of a normal distribution.
    const sigma = (f.quantile(0.9, step) - f.quantile(0.1, step)) / 2.56;
    if (!(sigma > 0)) return;
    const z = (median - price) / sigma;
    const atr = ctx.ta.atr(14);
    const pos = ctx.position;

    if (pos) {
      const against = pos.side === 'long' ? z < exitZ : z > -exitZ;
      if (against || pos.barsHeld >= horizon) ctx.close(`z=${z.toFixed(2)} held=${pos.barsHeld}`);
      return;
    }
    if (z > entryZ) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `forecast z=${z.toFixed(2)}` });
    else if (z < -entryZ) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `forecast z=${z.toFixed(2)}` });
  },
});
