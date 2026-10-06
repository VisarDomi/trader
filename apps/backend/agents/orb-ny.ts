import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * Opening-range breakout on US index CFDs: record the high/low of the first
 * minutes after the 09:30 New York cash open, then trade the first breakout of
 * that range until noon. Stop at the far side of the range, 2R target, flat by
 * the end of the day. One trade per day.
 */
export default defineAgent({
  name: 'NY Opening Range Breakout',
  description: 'Trades the first breakout of the New York opening range on US indices; one trade a day, flat by the close.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30'],
  timeframe: '5m',
  params: { rangeMinutes: 30, lastEntryHour: 12, exitMinuteOfDay: 15 * 60 + 55, rr: 2, riskPct: 1 },
  variants: {
    '30min': {},
    '15min': { rangeMinutes: 15 },
  },
  intradayOnly: true,
  init: () => ({ day: '', high: 0, low: 0, traded: false }),
  warmup: 2,
  onBar(ctx) {
    const { rangeMinutes, lastEntryHour, exitMinuteOfDay, rr, riskPct } = ctx.params;
    const s = ctx.state;
    const ny = localTime(ctx.bar.time, TZ.NEW_YORK); // bar open time in New York
    const open = 9 * 60 + 30;
    if (ny.date !== s.day) Object.assign(s, { day: ny.date, high: 0, low: 0, traded: false });
    if (ny.weekday === 0 || ny.weekday === 6) return;

    // Build the opening range from bars that start inside it.
    if (ny.minuteOfDay >= open && ny.minuteOfDay < open + rangeMinutes) {
      s.high = s.high === 0 ? ctx.bar.high : Math.max(s.high, ctx.bar.high);
      s.low = s.low === 0 ? ctx.bar.low : Math.min(s.low, ctx.bar.low);
      return;
    }
    if (ctx.position && ny.minuteOfDay >= exitMinuteOfDay) {
      ctx.close('end of the US session');
      return;
    }
    if (s.traded || ctx.position || s.high === 0 || ny.minuteOfDay < open + rangeMinutes || ny.hour >= lastEntryHour) return;

    const price = ctx.bar.close;
    if (price > s.high) {
      ctx.buy({ stopLoss: s.low, takeProfit: price + rr * (price - s.low), riskPct, reason: 'broke the opening-range high' });
      s.traded = true;
    } else if (price < s.low) {
      ctx.sell({ stopLoss: s.high, takeProfit: price - rr * (s.high - price), riskPct, reason: 'broke the opening-range low' });
      s.traded = true;
    }
  },
});
