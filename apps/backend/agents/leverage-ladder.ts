import { defineAgent } from '../src/sdk';

/**
 * CONTROL AGENT — the leverage ladder. One signal runs on every leverage tier,
 * sized with marginPct: each position puts up 10% of equity as margin, so its
 * notional is 0.1× equity at 1:1, 1× at 1:10 and 20× at 1:200 (crypto stops at
 * 1:20). Side by side, the rungs show what leverage alone does to returns,
 * drawdowns and the risk of ruin. Never judged or retired: a rung that is
 * margin-called to nothing is the result.
 *
 *   hold   stay long; after a margin call, buy again with what is left
 *   trend  long while the 20-day return is positive, short while negative; no stop
 */
export default defineAgent({
  name: 'Leverage Ladder',
  description: 'Control: one signal on every leverage tier with 10% of equity as margin, to show what leverage does on its own.',
  author: 'claude',
  instruments: ['US100', 'GOLD', 'EURUSD', 'BTCUSD'],
  timeframe: '4h',
  leverage: [1, 2, 3, 5, 10, 20, 50, 100, 200],
  params: { mode: 'hold', marginPct: 10, lookback: 120 },
  variants: {
    hold: {},
    trend: { mode: 'trend' },
  },
  warmup: 130,
  onBar(ctx) {
    const { mode, marginPct, lookback } = ctx.params;
    if (mode === 'hold') {
      if (!ctx.position) ctx.buy({ marginPct, reason: `hold at 1:${ctx.leverage}` });
      return;
    }
    const roc = ctx.ta.roc(lookback);
    if (Number.isNaN(roc)) return;
    const reason = `20-day return ${roc.toFixed(2)}% at 1:${ctx.leverage}`;
    if (roc > 0 && ctx.position?.side !== 'long') ctx.buy({ marginPct, reason });
    else if (roc < 0 && ctx.position?.side !== 'short') ctx.sell({ marginPct, reason });
  },
});
