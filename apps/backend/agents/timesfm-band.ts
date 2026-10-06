import { defineAgent } from '../src/sdk';

/**
 * Forecast-surprise reversion: remember the 10%-90% band TimesFM predicted for
 * this bar one bar ago. If the close lands outside that band (a surprise) and
 * the fresh forecast expects the move to retrace, fade it.
 */
export default defineAgent({
  name: 'TimesFM Surprise Fade',
  description: 'Fades closes that land outside the previous bar\'s TimesFM 10-90% band when the new forecast expects a retrace.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { lookahead: 4, maxBars: 6, atrStop: 2, riskPct: 0.75 },
  forecast: { horizon: 8, context: 512 },
  init: () => ({ q10: 0, q90: 0, median: 0 }),
  warmup: 50,
  onBar(ctx) {
    const { lookahead, maxBars, atrStop, riskPct } = ctx.params;
    const s = ctx.state;
    const f = ctx.forecast;
    const price = ctx.bar.close;
    const expectedBand = { q10: s.q10, q90: s.q90 };
    // Remember this bar's forecast for the next bar.
    if (f) Object.assign(s, { q10: f.quantile(0.1, 0), q90: f.quantile(0.9, 0), median: f.median[0]! });
    else Object.assign(s, { q10: 0, q90: 0, median: 0 });

    const pos = ctx.position;
    if (pos) {
      if (pos.barsHeld >= maxBars) ctx.close('time stop');
      return;
    }
    if (!f || expectedBand.q10 === 0) return;
    const target = f.median[lookahead - 1]!;
    const atr = ctx.ta.atr(14);
    // The target must clear the spread, or the trade cannot make money.
    const minMove = 2 * ctx.bar.spread;
    if (price < expectedBand.q10 && target > price + minMove) {
      ctx.buy({ stopLoss: price - atrStop * atr, takeProfit: target, riskPct, reason: 'closed below the forecast band' });
    } else if (price > expectedBand.q90 && target < price - minMove) {
      ctx.sell({ stopLoss: price + atrStop * atr, takeProfit: target, riskPct, reason: 'closed above the forecast band' });
    }
  },
});
