import { defineAgent } from '../src/sdk';

/**
 * Inside-bar breakout: after a bar that sits entirely inside the previous
 * (mother) bar, trade a close beyond the mother bar's range. Stop at the other
 * side of the mother bar, target 2R.
 */
export default defineAgent({
  name: 'Inside Bar Breakout',
  description: 'Trades the breakout of a mother bar after an inside-bar consolidation.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
  timeframe: '4h',
  params: { rr: 2, riskPct: 1, maxAgeBars: 3 },
  init: () => ({ motherHigh: 0, motherLow: 0, age: 0 }),
  warmup: 10,
  onBar(ctx) {
    const { rr, riskPct, maxAgeBars } = ctx.params;
    const s = ctx.state;
    const [mother, inside] = [ctx.bars.at(-3), ctx.bars.at(-2)];
    const price = ctx.bar.close;

    // A new inside-bar setup completed on the previous bar.
    if (mother && inside && inside.high < mother.high && inside.low > mother.low) {
      s.motherHigh = mother.high;
      s.motherLow = mother.low;
      s.age = 0;
    }
    if (s.motherHigh === 0 || ctx.position) return;
    s.age++;
    if (s.age > maxAgeBars) {
      s.motherHigh = s.motherLow = 0;
      return;
    }
    const range = s.motherHigh - s.motherLow;
    if (price > s.motherHigh) {
      ctx.buy({ stopLoss: s.motherLow, takeProfit: price + rr * (price - s.motherLow), riskPct, reason: 'broke mother-bar high' });
      s.motherHigh = s.motherLow = 0;
    } else if (price < s.motherLow && range > 0) {
      ctx.sell({ stopLoss: s.motherHigh, takeProfit: price - rr * (s.motherHigh - price), riskPct, reason: 'broke mother-bar low' });
      s.motherHigh = s.motherLow = 0;
    }
  },
});
