import { defineAgent } from '../src/sdk';

/**
 * CONTROL AGENT — no edge by construction. Opens coin-flip trades with a
 * normal ATR stop and target. Its results show what pure luck looks like on
 * the leaderboard: any agent that cannot clearly beat the monkeys (in demo,
 * over many trades) has not shown an edge yet.
 */
export default defineAgent({
  name: 'Random Baseline (monkey)',
  description: 'Control: random long/short entries with a 2 ATR stop and target. Measures how good luck looks.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'NATURALGAS', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { entryChance: 0.05, atrStop: 2, rr: 1, riskPct: 1 },
  variants: {
    'monkey-a': {},
    'monkey-b': {},
    'monkey-c': {},
  },
  warmup: 20,
  onBar(ctx) {
    const { entryChance, atrStop, rr, riskPct } = ctx.params;
    if (ctx.position || ctx.random() > entryChance) return;
    const price = ctx.bar.close;
    const stop = atrStop * ctx.ta.atr(14);
    if (ctx.random() < 0.5) ctx.buy({ stopLoss: price - stop, takeProfit: price + rr * stop, riskPct, reason: 'coin flip: heads' });
    else ctx.sell({ stopLoss: price + stop, takeProfit: price - rr * stop, riskPct, reason: 'coin flip: tails' });
  },
});
