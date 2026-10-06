import { defineAgent } from '../src/sdk';

/**
 * Port of the v1 trend-follower: tracks the swing high/low since the last
 * signal and enters when price has moved `trendPct` off the swing extreme.
 * Stop at `trendPct` against the entry, target at `tpMult` × trendPct.
 */
export default defineAgent({
  name: 'Swing Reversal',
  description: 'Enters after price moves a fixed percentage off its recent swing low/high (v1 trend-follower).',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '15m',
  params: { trendPct: 0.5, tpMult: 2, riskPct: 1 },
  variants: {
    'p05': {},
    'p10': { trendPct: 1.0 },
  },
  init: () => ({ swingHigh: 0, swingLow: 0 }),
  warmup: 5,
  onBar(ctx) {
    const { trendPct, tpMult, riskPct } = ctx.params;
    const s = ctx.state as { swingHigh: number; swingLow: number };
    const price = ctx.bar.close;
    if (s.swingHigh === 0) {
      s.swingHigh = price;
      s.swingLow = price;
      return;
    }
    s.swingHigh = Math.max(s.swingHigh, price);
    s.swingLow = Math.min(s.swingLow, price);
    if (ctx.position) return;

    const pct = trendPct / 100;
    const upMove = (price - s.swingLow) / s.swingLow;
    const downMove = (s.swingHigh - price) / s.swingHigh;
    if (upMove >= pct && downMove < pct) {
      ctx.buy({ stopLoss: price * (1 - pct), takeProfit: price * (1 + tpMult * pct), riskPct, reason: `+${(upMove * 100).toFixed(2)}% off swing low` });
      s.swingHigh = s.swingLow = price;
    } else if (downMove >= pct && upMove < pct) {
      ctx.sell({ stopLoss: price * (1 + pct), takeProfit: price * (1 - tpMult * pct), riskPct, reason: `-${(downMove * 100).toFixed(2)}% off swing high` });
      s.swingHigh = s.swingLow = price;
    }
  },
});
