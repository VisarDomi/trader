import { defineAgent } from '../src/sdk';

/**
 * Template — copy to agents/<your-agent>.ts and edit. See agents/GUIDE.md.
 * (Files starting with "_" are ignored by the platform.)
 */
export default defineAgent({
  name: 'My Agent',
  description: 'One or two sentences: which market behaviour does this try to exploit?',
  author: 'me',
  instruments: ['US100'],
  timeframe: '1h',
  params: { fast: 20, slow: 50, atrStop: 2, riskPct: 1 },
  // variants: { fast: { fast: 10, slow: 30 } },
  // extraTimeframes: ['4h'],
  // forecast: { horizon: 8, context: 512 },
  // intradayOnly: true,
  warmup: 60,

  onBar(ctx) {
    const { fast, slow, atrStop, riskPct } = ctx.params;
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(14);
    const trendUp = ctx.ta.ema(fast) > ctx.ta.ema(slow);

    if (!ctx.position) {
      if (trendUp) ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: 'trend up' });
      else ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: 'trend down' });
      return;
    }

    // Exit when the trend flips against the position.
    if (ctx.position.side === 'long' && !trendUp) ctx.close('trend flipped down');
    if (ctx.position.side === 'short' && trendUp) ctx.close('trend flipped up');
  },
});
