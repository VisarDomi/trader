import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * Larry Williams-style volatility breakout: go with a move of k × yesterday's
 * range away from today's open. Stop at today's open, flat by the daily break.
 */
export default defineAgent({
  name: 'Volatility Breakout',
  description: "Enters when price moves k × yesterday's range away from today's open; flat by the daily close.",
  author: 'claude',
  instruments: ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'BTCUSD', 'ETHUSD'],
  timeframe: '15m',
  params: { k: 0.5, riskPct: 1 },
  variants: {
    'k05': {},
    'k08': { k: 0.8 },
  },
  intradayOnly: true,
  // The trading day rolls at 18:00 New York (Capital.com session start).
  init: () => ({ day: '', open: 0, high: 0, low: 0, prevRange: 0, traded: false }),
  warmup: 2,
  onBar(ctx) {
    const { k, riskPct } = ctx.params;
    const s = ctx.state;
    const ny = localTime(ctx.bar.time + 6 * 3_600_000, TZ.NEW_YORK); // shift so the day starts at 18:00 NY
    if (ny.date !== s.day) {
      if (s.day !== '') s.prevRange = s.high - s.low;
      Object.assign(s, { day: ny.date, open: ctx.bar.open, high: ctx.bar.high, low: ctx.bar.low, traded: false });
    } else {
      s.high = Math.max(s.high, ctx.bar.high);
      s.low = Math.min(s.low, ctx.bar.low);
    }
    if (s.traded || ctx.position || s.prevRange <= 0) return;

    const price = ctx.bar.close;
    const band = k * s.prevRange;
    if (price > s.open + band) {
      ctx.buy({ stopLoss: s.open, riskPct, reason: `+${k}× range from the open` });
      s.traded = true;
    } else if (price < s.open - band) {
      ctx.sell({ stopLoss: s.open, riskPct, reason: `-${k}× range from the open` });
      s.traded = true;
    }
  },
});
