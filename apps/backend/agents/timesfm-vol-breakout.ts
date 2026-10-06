import { defineAgent } from '../src/sdk';

/**
 * Uses TimesFM for volatility, not direction. The width of the forecast's
 * 10%-90% band (relative to price) is the model's expected volatility. A
 * channel breakout is only taken when that expected volatility is high
 * compared with its own recent history — i.e. the model expects the move to
 * keep expanding. Trailing ATR stop.
 */
export default defineAgent({
  name: 'TimesFM Volatility Breakout',
  description: 'Channel breakouts taken only when TimesFM forecasts unusually wide price ranges (expected volatility expansion).',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { channel: 20, step: 7, history: 120, expansion: 1.25, trail: 2.5, riskPct: 1 },
  forecast: { horizon: 8, context: 512 },
  init: () => ({ widths: [] as number[] }),
  warmup: 30,
  onBar(ctx) {
    const { channel, step, history, expansion, trail, riskPct } = ctx.params;
    const f = ctx.forecast;
    if (!f) return;
    const price = ctx.bar.close;
    const width = (f.quantile(0.9, step) - f.quantile(0.1, step)) / price;
    const widths = ctx.state.widths;
    const typical = widths.length >= 20 ? [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)]! : NaN;
    widths.push(width);
    if (widths.length > history) widths.shift();
    if (ctx.position || !(width > expansion * typical)) return;

    const high = ctx.ta.series.highest(channel).at(-2)!;
    const low = ctx.ta.series.lowest(channel).at(-2)!;
    const atr = ctx.ta.atr(14);
    const why = `band ${(width * 100).toFixed(2)}% vs typical ${(typical * 100).toFixed(2)}%`;
    if (price > high) ctx.buy({ trailingStop: trail * atr, riskPct, reason: `breakout up, ${why}` });
    else if (price < low) ctx.sell({ trailingStop: trail * atr, riskPct, reason: `breakout down, ${why}` });
  },
});
