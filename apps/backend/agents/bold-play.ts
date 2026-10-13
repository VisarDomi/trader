import { defineAgent } from '../src/sdk';

/**
 * CONTROL AGENT — bold play at 1:200 (Dubins & Savage, "How to Gamble If You
 * Must", 1965). If the goal is to double the account before losing it, and each
 * bet is at best fair, the best strategy is the fewest, largest bets: stake
 * everything you can, but never more than the goal needs. Each run is one
 * sample of the question behind the 1:200 account: does it double before it is
 * ruined? A fair game reaches $20,000 before $0 about half the time; the spread
 * makes it less. Bets are ±0.25% price moves (take-profit and stop), direction
 * by the sign of the 20-day return, flat before each daily break (no funding
 * at 180× exposure). Once the goal is reached the run stops betting.
 */
export default defineAgent({
  name: 'Bold Play (1:200)',
  description: 'Control: bets as much as 1:200 allows (or just enough to reach $20,000) on ±0.25% moves until the account doubles or is ruined.',
  author: 'claude',
  instruments: ['US500', 'US100', 'GOLD', 'EURUSD'],
  timeframe: '1h',
  leverage: [200],
  params: { goal: 20_000, ruin: 100, movePct: 0.25, maxExposure: 180, lookbackBars: 480 },
  init: () => ({ done: false }),
  intradayOnly: true,
  warmup: 481,
  onBar(ctx) {
    const { goal, ruin, movePct, maxExposure, lookbackBars } = ctx.params;
    if (ctx.position || ctx.state.done) return;
    const equity = ctx.equity;
    if (equity >= goal || equity < ruin) {
      ctx.state.done = true;
      ctx.log(equity >= goal ? `goal reached: $${equity.toFixed(0)}` : `ruined: $${equity.toFixed(0)} left`);
      return;
    }
    const move = movePct / 100;
    // Stake what the goal needs, or everything the margin allows.
    const stake = Math.min(goal - equity, maxExposure * move * equity);
    const exposure = stake / (move * equity);
    const roc = ctx.ta.roc(lookbackBars);
    if (Number.isNaN(roc)) return;
    const price = ctx.bar.close;
    const reason = `stake $${stake.toFixed(0)} of $${equity.toFixed(0)} at ${exposure.toFixed(0)}× equity`;
    if (roc >= 0) ctx.buy({ exposure, stopLoss: price * (1 - move), takeProfit: price * (1 + move), reason });
    else ctx.sell({ exposure, stopLoss: price * (1 + move), takeProfit: price * (1 - move), reason });
  },
});
