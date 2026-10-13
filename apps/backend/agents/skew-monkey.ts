import { defineAgent } from '../src/sdk';

/**
 * CONTROL AGENT — the negative-skew monkey. Coin-flip entries like
 * random-baseline, but the target is half an ATR away and the stop three ATRs:
 * about 85% of trades win, and the few losses are large. It has no edge, yet a
 * 30-trade sample often looks excellent. It calibrates the leader bar for
 * agents with tight targets and wide stops: how often does a no-edge,
 * negatively skewed run reach t ≥ 2?
 */
export default defineAgent({
  name: 'Skew Monkey',
  description: 'Control: random entries with a 0.5 ATR target and a 3 ATR stop (wins ~85% of trades, no edge), to show what negative skew looks like.',
  author: 'claude',
  instruments: ['EURUSD', 'US500', 'GOLD'],
  timeframe: '1h',
  params: { entryChance: 0.05, targetAtr: 0.5, stopAtr: 3, riskPct: 1 },
  warmup: 20,
  onBar(ctx) {
    const { entryChance, targetAtr, stopAtr, riskPct } = ctx.params;
    if (ctx.position || ctx.random() > entryChance) return;
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(14);
    if (!(atr > 0)) return;
    if (ctx.random() < 0.5) ctx.buy({ stopLoss: price - stopAtr * atr, takeProfit: price + targetAtr * atr, riskPct, reason: 'coin flip: heads' });
    else ctx.sell({ stopLoss: price + stopAtr * atr, takeProfit: price - targetAtr * atr, riskPct, reason: 'coin flip: tails' });
  },
});
