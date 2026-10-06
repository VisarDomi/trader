import { defineAgent } from '../src/sdk';

/**
 * SuperTrend follower: always aligned with the SuperTrend direction and uses
 * the SuperTrend line itself as a trailing stop.
 */
export default defineAgent({
  name: 'SuperTrend',
  description: 'Rides SuperTrend flips and trails the stop on the SuperTrend line.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  params: { period: 10, mult: 3, riskPct: 1 },
  variants: {
    '10x3': {},
    '20x5': { period: 20, mult: 5 },
  },
  warmup: 40,
  onBar(ctx) {
    const { period, mult, riskPct } = ctx.params;
    const st = ctx.ta.series.supertrend(period, mult);
    const dir = st.direction.at(-1)!;
    const prevDir = st.direction.at(-2)!;
    const line = st.value.at(-1)!;
    const pos = ctx.position;

    if (pos) {
      const wrongSide = (pos.side === 'long' && dir < 0) || (pos.side === 'short' && dir > 0);
      if (wrongSide) ctx.close('supertrend flipped');
      else if (pos.side === 'long' && line > (pos.stopLoss ?? 0)) ctx.setStops({ stopLoss: line });
      else if (pos.side === 'short' && line < (pos.stopLoss ?? Infinity)) ctx.setStops({ stopLoss: line });
    }
    if (ctx.position || Number.isNaN(prevDir) || dir === prevDir) return;

    if (dir > 0) ctx.buy({ stopLoss: line, riskPct, reason: 'supertrend turned up' });
    else ctx.sell({ stopLoss: line, riskPct, reason: 'supertrend turned down' });
  },
});
