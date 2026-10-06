import { defineAgent } from '../src/sdk';

/**
 * Turtle-style channel breakout (port of the v1 Donchian blueprint).
 * Enter when the close breaks the previous N-bar high/low; exit on the
 * opposite M-bar channel; 2 ATR initial stop.
 */
export default defineAgent({
  name: 'Donchian Breakout',
  description: 'Turtle-style breakout of the previous N-bar high/low, exit on the shorter opposite channel.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '4h',
  params: { entry: 20, exit: 10, atrStop: 2, riskPct: 1 },
  variants: {
    'turtle-20': {},
    'turtle-55': { entry: 55, exit: 20 },
  },
  warmup: 60,
  onBar(ctx) {
    const { entry, exit, atrStop, riskPct } = ctx.params;
    const price = ctx.bar.close;
    // Channels of the *previous* bars (exclude the bar that just closed).
    const entryHigh = ctx.ta.series.highest(entry).at(-2)!;
    const entryLow = ctx.ta.series.lowest(entry).at(-2)!;
    const exitHigh = ctx.ta.series.highest(exit).at(-2)!;
    const exitLow = ctx.ta.series.lowest(exit).at(-2)!;
    const atr = ctx.ta.atr(20);
    const pos = ctx.position;

    if (pos?.side === 'long' && price < exitLow) ctx.close(`below ${exit}-bar low`);
    if (pos?.side === 'short' && price > exitHigh) ctx.close(`above ${exit}-bar high`);
    if (ctx.position) return;

    if (price > entryHigh) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `${entry}-bar high breakout` });
    else if (price < entryLow) ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `${entry}-bar low breakout` });
  },
});
