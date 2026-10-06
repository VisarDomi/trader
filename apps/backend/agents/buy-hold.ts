import { defineAgent } from '../src/sdk';

/**
 * BENCHMARK AGENT — buys once at 1× exposure and holds forever, paying
 * overnight funding like any CFD position. Active agents should beat this on
 * risk-adjusted return to be worth running.
 */
export default defineAgent({
  name: 'Buy & Hold',
  description: 'Benchmark: long at 1× equity from the first bar, never sells (pays CFD funding).',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'NATURALGAS', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1d',
  params: {},
  warmup: 1,
  onBar(ctx) {
    if (!ctx.position) ctx.buy({ exposure: 1, reason: 'buy and hold' });
  },
});
