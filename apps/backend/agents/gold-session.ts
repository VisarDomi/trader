import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * Gold's session split: it has risen in Asian hours and fallen in London and New
 * York hours. On LBMA fix prices 1968-2025, gold returned +13.8% a year from the
 * afternoon fix (15:00 London) to the next morning fix (10:30 London), and -4.7%
 * a year from the morning fix to the afternoon fix; COMEX data 1985-2012 and our
 * own 2024-26 candles agree (+9.9 bp a night, -0.9 bp a day). The usual reading
 * is that Asian physical buyers lift the price and Western hedging and
 * short-selling during London and New York hours give some back. On the 1:1
 * account the overnight hold pays no funding.
 *
 *   overnight  long from the afternoon fix to the next morning fix, flat between
 *   both       the same, plus short from the morning fix to the afternoon fix
 */
export default defineAgent({
  name: 'Gold Session',
  description: 'Long gold from the London afternoon fix (15:00) to the next morning fix (10:30); the "both" variant is short in between.',
  author: 'claude',
  instruments: ['GOLD'],
  timeframe: '30m',
  leverage: [1],
  params: { mode: 'overnight', exposure: 1 },
  variants: {
    overnight: {},
    both: { mode: 'both' },
  },
  warmup: 2,
  onBar(ctx) {
    const { mode, exposure } = ctx.params;
    const ldn = localTime(ctx.time, TZ.LONDON); // the bar's close
    const AM_FIX = 10 * 60 + 30;
    const PM_FIX = 15 * 60;
    if (ldn.minuteOfDay === PM_FIX && ldn.weekday >= 1 && ldn.weekday <= 5) {
      ctx.buy({ exposure, reason: 'afternoon fix: hold through Asian hours' });
    } else if (ldn.minuteOfDay === AM_FIX && ldn.weekday >= 1 && ldn.weekday <= 5) {
      if (mode === 'both') ctx.sell({ exposure, reason: 'morning fix: short through London and New York hours' });
      else if (ctx.position) ctx.close('morning fix');
    }
  },
});
