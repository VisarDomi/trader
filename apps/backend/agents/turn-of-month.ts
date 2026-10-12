import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * The turn-of-the-month effect (Ariel 1987; Lakonishok & Smidt 1988; McConnell
 * & Xu 2008): US stocks have earned most of their return from the last trading
 * day of a month to the third trading day of the next, usually put down to
 * month-end cash flows (pay, pension contributions, fund rebalancing). Buy at
 * the 16:00 New York close two weekdays before the month ends, sell at the
 * close of the third trading day of the new month: about five days a month in
 * the market, flat the rest.
 *
 * Runs at 1:1, where the shares pay no overnight fee (the indices still pay,
 * for the nights they are held). Holidays ahead are not known, so the entry
 * counts weekdays; trading days in the new month are counted as they close.
 */
export default defineAgent({
  name: 'Turn of the Month',
  description: 'Holds US indices and the largest Nasdaq shares from two days before the month ends to the third trading day of the next; flat otherwise.',
  author: 'claude',
  instruments: ['US500', 'US100', 'US30', 'NVDA', 'MSFT', 'AAPL', 'AMZN', 'AVGO', 'META', 'GOOGL', 'TSLA'],
  timeframe: '30m',
  leverage: [1],
  params: { exposure: 1, daysAfter: 3 },
  init: () => ({ month: 0, daysIn: 0, entryMonth: 0 }),
  warmup: 2,
  onBar(ctx) {
    const { exposure, daysAfter } = ctx.params;
    const s = ctx.state;
    // ctx.time is the bar close: 16:00 means the 15:30-16:00 bar just closed.
    const ny = localTime(ctx.time, TZ.NEW_YORK);
    if (ny.weekday === 0 || ny.weekday === 6 || ny.minuteOfDay !== 16 * 60) return;

    // A 16:00 close happened today: one more trading day of this month.
    if (ny.month !== s.month) Object.assign(s, { month: ny.month, daysIn: 0 });
    s.daysIn++;

    if (ctx.position) {
      if (ny.month !== s.entryMonth && s.daysIn >= daysAfter) ctx.close(`trading day ${s.daysIn} of the month`);
      return;
    }
    if (weekdaysLeft(ny.year, ny.month, ny.day) === 1) {
      s.entryMonth = ny.month;
      ctx.buy({ exposure, reason: 'two weekdays before the month ends' });
    }
  },
});

/** Weekdays after `day` in the month (month 1-12). */
function weekdaysLeft(year: number, month: number, day: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let n = 0;
  for (let d = day + 1; d <= last; d++) {
    const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) n++;
  }
  return n;
}
