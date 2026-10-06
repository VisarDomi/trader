import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * London breakout: the Asian session (00:00-07:00 London) builds a quiet
 * range; trade its first break during the London morning. Stop on the other
 * side of the range (capped at 1.5× range), 1.5R target, flat by 16:00 London.
 */
export default defineAgent({
  name: 'London Breakout',
  description: 'Trades the first break of the Asian-session range during the London morning.',
  author: 'claude',
  instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'GOLD', 'SILVER'],
  timeframe: '15m',
  params: { rangeStartHour: 0, rangeEndHour: 7, lastEntryHour: 11, exitHour: 16, rr: 1.5, riskPct: 1 },
  intradayOnly: true,
  init: () => ({ day: '', high: 0, low: 0, traded: false }),
  warmup: 2,
  onBar(ctx) {
    const { rangeStartHour, rangeEndHour, lastEntryHour, exitHour, rr, riskPct } = ctx.params;
    const s = ctx.state;
    const ldn = localTime(ctx.bar.time, TZ.LONDON);
    if (ldn.date !== s.day) Object.assign(s, { day: ldn.date, high: 0, low: 0, traded: false });
    if (ldn.weekday === 0 || ldn.weekday === 6) return;

    if (ldn.hour >= rangeStartHour && ldn.hour < rangeEndHour) {
      s.high = s.high === 0 ? ctx.bar.high : Math.max(s.high, ctx.bar.high);
      s.low = s.low === 0 ? ctx.bar.low : Math.min(s.low, ctx.bar.low);
      return;
    }
    if (ctx.position && ldn.hour >= exitHour) {
      ctx.close('London afternoon');
      return;
    }
    if (s.traded || ctx.position || s.high === 0 || ldn.hour >= lastEntryHour) return;

    const price = ctx.bar.close;
    const range = s.high - s.low;
    if (price > s.high) {
      const stop = Math.max(s.low, price - 1.5 * range);
      ctx.buy({ stopLoss: stop, takeProfit: price + rr * (price - stop), riskPct, reason: 'broke the Asian high' });
      s.traded = true;
    } else if (price < s.low) {
      const stop = Math.min(s.high, price + 1.5 * range);
      ctx.sell({ stopLoss: stop, takeProfit: price - rr * (stop - price), riskPct, reason: 'broke the Asian low' });
      s.traded = true;
    }
  },
});
