import { defineAgent } from '../src/sdk';

/**
 * Time-series momentum: hold the direction of the past N-bar return, as in the
 * managed-futures literature. Re-evaluated every 4h bar; wide ATR stop.
 */
export default defineAgent({
  name: 'Time-Series Momentum',
  description: 'Holds long when the trailing return is positive and short when negative (trend premium).',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'NATURALGAS', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '4h',
  params: { lookback: 30, atrStop: 4, riskPct: 1, deadband: 0.5 },
  variants: {
    '5d': {},
    '20d': { lookback: 120 },
  },
  warmup: 130,
  onBar(ctx) {
    const { lookback, atrStop, riskPct, deadband } = ctx.params;
    const roc = ctx.ta.roc(lookback);
    if (Number.isNaN(roc)) return;
    const price = ctx.bar.close;
    const atr = ctx.ta.atr(20);
    // Ignore tiny moves: require |return| above deadband × (ATR as % of price).
    const threshold = deadband * (atr / price) * 100;
    const pos = ctx.position;

    if (roc > threshold && pos?.side !== 'long') {
      ctx.buy({ stopLoss: price - atrStop * atr, riskPct, reason: `${lookback}-bar return ${roc.toFixed(2)}%` });
    } else if (roc < -threshold && pos?.side !== 'short') {
      ctx.sell({ stopLoss: price + atrStop * atr, riskPct, reason: `${lookback}-bar return ${roc.toFixed(2)}%` });
    }
  },
});
