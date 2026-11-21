import { defineAgent } from '../src/sdk';

/**
 * Constant proportion portfolio insurance (Black & Jones, "Simplifying Portfolio Insurance", Journal of Portfolio
 * Management 1987; Black & Perold, "Theory of Constant Proportion Portfolio Insurance", Journal of Economic Dynamics
 * and Control 1992): hold the market long with an exposure of m × the cushion, the equity above a protected floor.
 * Gains widen the cushion and so the position; losses shrink it towards cash before the floor is reached. Leverage
 * comes only out of profits: the anti-martingale with a floor. The payoff is convex, not an edge: it buys trend
 * participation with whipsaw costs, and a fall of more than 1/m between two rebalances (20% in a day) breaks the floor.
 *
 * Parameters as planned in research/topics/leverage.md (#5, before any backtest): floor 80% of the starting equity,
 * m = 5, at most 4× equity, rebalanced at the daily close when actual ÷ target leaves [0.8, 1.2], flat once the
 * cushion is under 2% (exposure 1× at $10k, 1.7× at $12k, 2.3× at $15k, 0.56× at $9k). Once flat the run stays in
 * cash: that lock-in is part of what CPPI is and what this run measures.
 *
 * `tipp` (Estep & Kritzman, "TIPP: Insurance without Complexity", JPM 1988) ratchets the floor to 80% of the highest
 * equity instead, locking in gains at the price of de-levering sooner.
 */
export default defineAgent({
  name: 'CPPI',
  description: 'Long at 5× the equity above a protected floor (80% of the start, or of the peak for TIPP), up to 4× equity.',
  author: 'claude',
  instruments: ['US500', 'US100', 'GOLD'],
  timeframe: '1d',
  params: { multiplier: 5, floorShare: 0.8, maxExposure: 4, band: 0.2, minCushion: 0.02, ratchet: 0 },
  variants: {
    cppi: { ratchet: 0 },
    tipp: { ratchet: 1 },
  },
  init: () => ({ floor: 0 }),
  warmup: 2,
  onBar(ctx) {
    const { multiplier, floorShare, maxExposure, band, minCushion, ratchet } = ctx.params;
    const equity = ctx.equity;
    if (ctx.state.floor === 0 || (ratchet && floorShare * equity > ctx.state.floor)) ctx.state.floor = floorShare * equity;
    const cushion = (equity - ctx.state.floor) / equity;
    const target = Math.min(maxExposure, multiplier * cushion);
    const reason = `cushion ${(cushion * 100).toFixed(1)}% of equity above the floor: ${target.toFixed(2)}× equity`;
    if (cushion < minCushion) {
      if (ctx.position) ctx.close(reason);
      return;
    }
    if (!ctx.position) {
      ctx.buy({ exposure: target, reason });
      return;
    }
    const actual = (ctx.position.size * ctx.bar.close) / equity;
    if (Math.abs(actual / target - 1) <= band) return;
    ctx.close(`${actual.toFixed(2)}× equity, target ${target.toFixed(2)}×`);
    ctx.buy({ exposure: target, reason });
  },
});
