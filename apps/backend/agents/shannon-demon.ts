import { defineAgent } from '../src/sdk';

/**
 * Shannon's demon (Claude Shannon's 1960s lectures, via Poundstone's "Fortune's
 * Formula" and Luenberger): keep half the account in a volatile asset and half
 * in cash, and rebalance back to half whenever the mix drifts. Selling after
 * rises and buying after falls harvests volatility: over a 50/50 hold it adds
 * about w(1−w)σ²/2 = σ²/8 a year, a few percent for Bitcoin and the most
 * volatile shares. It trails buy-and-hold in strong trends. On the 1:1 account
 * neither crypto nor shares pay an overnight fee, so the only cost is the spread
 * on each rebalance (close and reopen).
 */
export default defineAgent({
  name: "Shannon's Demon",
  description: 'Holds 50% of equity in a volatile asset and 50% cash at 1:1; rebalances to 50% when the mix leaves 45-55%.',
  author: 'claude',
  instruments: ['BTCUSD', 'ETHUSD', 'TSLA', 'NVDA'],
  timeframe: '1d',
  leverage: [1],
  params: { target: 0.5, band: 0.05 },
  warmup: 2,
  onBar(ctx) {
    const { target, band } = ctx.params;
    const reason = `back to ${(100 * target).toFixed(0)}% of equity`;
    if (!ctx.position) {
      ctx.buy({ exposure: target, reason });
      return;
    }
    const weight = (ctx.position.size * ctx.bar.close) / ctx.equity;
    if (Math.abs(weight - target) <= band) return;
    ctx.close(`${(100 * weight).toFixed(1)}% of equity`);
    ctx.buy({ exposure: target, reason });
  },
});
