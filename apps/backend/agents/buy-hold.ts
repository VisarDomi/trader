import { defineAgent } from '../src/sdk';

/**
 * BENCHMARK AGENT — buys once and holds forever on a 1:1 account (0.9× equity,
 * the most 1:1 margin allows). Indices, commodities and FX pay overnight
 * funding like any CFD; crypto and shares pay none at 1:1. The eight shares are
 * the largest Nasdaq-100 companies: held together they are a fee-free stand-in
 * for US100, whose 1:1 position still pays funding. Active agents should beat
 * this on risk-adjusted return to be worth running.
 */
export default defineAgent({
  name: 'Buy & Hold',
  description: 'Benchmark: long from the first bar at 1:1 and never sells; crypto and shares hold fee-free, the rest pay CFD funding.',
  author: 'claude',
  instruments: [
    'US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'NATURALGAS', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD',
    'NVDA', 'MSFT', 'AAPL', 'AMZN', 'AVGO', 'META', 'GOOGL', 'TSLA',
  ],
  timeframe: '1d',
  leverage: [1],
  params: {},
  warmup: 1,
  onBar(ctx) {
    if (!ctx.position) ctx.buy({ exposure: 1, reason: 'buy and hold' });
  },
});
