import { defineAgent } from '../src/sdk';

/**
 * CONTROL AGENT — constant leverage, the way leveraged ETFs work: hold a fixed
 * multiple of equity and rebalance back to it every day (here when the actual
 * multiple drifts more than 10% from the target). Next to the leverage ladder,
 * which holds a fixed position, it shows volatility drag live: daily
 * rebalancing sells after falls and buys after rises, which costs about
 * L(L−1)σ²/2 a year. The target is half the account leverage: 1× at 1:2, 2.5× at
 * 1:5, 10× at 1:20. Where realized growth peaks across the rungs is Ole Peters'
 * "optimal leverage", about 1 for stock indices over a century.
 */
export default defineAgent({
  name: 'Constant Leverage',
  description: 'Control: holds half the account leverage as a constant multiple of equity (1×, 2.5×, 10×), rebalanced like a leveraged ETF.',
  author: 'claude',
  instruments: ['US500', 'GOLD', 'EURUSD', 'BTCUSD'],
  timeframe: '1d',
  leverage: [2, 5, 20],
  params: { leverageShare: 0.5, band: 0.1 },
  warmup: 2,
  onBar(ctx) {
    const { leverageShare, band } = ctx.params;
    const target = leverageShare * ctx.leverage;
    const reason = `${target}× equity at 1:${ctx.leverage}`;
    if (!ctx.position) {
      ctx.buy({ exposure: target, reason });
      return;
    }
    const actual = (ctx.position.size * ctx.bar.close) / ctx.equity;
    if (Math.abs(actual / target - 1) <= band) return;
    ctx.close(`${actual.toFixed(2)}× equity`);
    ctx.buy({ exposure: target, reason });
  },
});
