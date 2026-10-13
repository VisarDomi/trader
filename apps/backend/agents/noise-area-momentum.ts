import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * Intraday momentum done the Concretum way (Zarattini, Aziz & Barbon, "Beat the
 * Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY)", 2024).
 * Each half hour from 10:00 to 15:30 New York, the index's move since the 09:30
 * open is compared with its usual size at that time of day (the "noise area":
 * the average absolute move at that time over the last 14 sessions). Outside the
 * band, demand or supply is unusual, and dealers' and leveraged ETFs' hedging
 * tends to push the same way into the close. Long above the upper band, short
 * below the lower one; the stop trails at the band or the session VWAP,
 * whichever is tighter; flat by 16:00. Reported: about 4 bp per trade on SPY,
 * 2007-2024, Sharpe 1.33 after costs, and still positive after publication.
 * Unlike the rejected intraday-momentum rule, it trades only unusual days and
 * holds for hours.
 *
 *   base       1× equity
 *   voltarget  aims at 2% daily volatility from the last 14 daily returns, up to 4×
 */
export default defineAgent({
  name: 'Noise-Area Momentum',
  description: 'Rides US index moves that leave their usual intraday range (14-day noise band by time of day); VWAP/band trailing stop, flat by 16:00 New York.',
  author: 'claude',
  instruments: ['US500', 'US100', 'US30'],
  timeframe: '30m',
  params: { lookbackDays: 14, sizing: 'fixed', exposure: 1, targetDailyVol: 0.02, maxExposure: 4, crashStopPct: 2 },
  variants: {
    base: {},
    voltarget: { sizing: 'voltarget' },
  },
  intradayOnly: true,
  init: () => ({
    day: '',
    open: 0,
    prevClose: 0,
    lastClose: 0,
    pv: 0,
    vol: 0,
    /** Absolute move since the open at each half-hour mark, last `lookbackDays` sessions. */
    noise: {} as Record<string, number[]>,
    today: {} as Record<string, number>,
    dailyCloses: [] as number[],
  }),
  // 14 sessions of noise history accumulate in state; the first trades follow.
  warmup: 2,
  onBar(ctx) {
    const { lookbackDays, sizing, exposure, targetDailyVol, maxExposure, crashStopPct } = ctx.params;
    const s = ctx.state;
    const bar = ctx.bar;
    const start = localTime(bar.time, TZ.NEW_YORK);
    const ny = localTime(ctx.time, TZ.NEW_YORK); // the bar's close
    if (ny.weekday === 0 || ny.weekday === 6) return;
    const OPEN = 9 * 60 + 30;
    const CLOSE = 16 * 60;

    // The 09:30-10:00 bar opens the session.
    if (start.minuteOfDay === OPEN) Object.assign(s, { day: ny.date, open: bar.open, prevClose: s.lastClose, pv: 0, vol: 0, today: {} });
    if (s.day !== ny.date || ny.minuteOfDay <= OPEN || ny.minuteOfDay > CLOSE) return;

    // Session VWAP from 30-minute bars (typical price × tick volume).
    const typical = (bar.high + bar.low + bar.close) / 3;
    s.pv += typical * bar.volume;
    s.vol += bar.volume;
    const vwap = s.vol > 0 ? s.pv / s.vol : bar.close;
    const price = bar.close;
    const key = String(ny.minuteOfDay);
    s.today[key] = Math.abs(price / s.open - 1);

    if (ny.minuteOfDay === CLOSE) {
      if (ctx.position) ctx.close('16:00 close');
      for (const [k, move] of Object.entries(s.today)) s.noise[k] = [...(s.noise[k] ?? []), move].slice(-lookbackDays);
      s.dailyCloses = [...s.dailyCloses, price].slice(-(lookbackDays + 1));
      s.lastClose = price;
      return;
    }

    const history = s.noise[key] ?? [];
    if (history.length < lookbackDays || s.prevClose <= 0) return;
    const sigma = history.reduce((a, b) => a + b, 0) / history.length;
    const upper = Math.max(s.open, s.prevClose) * (1 + sigma);
    const lower = Math.min(s.open, s.prevClose) * (1 - sigma);

    // Trailing stop at half-hour marks: the band or VWAP, whichever is tighter.
    if (ctx.position?.side === 'long' && price < Math.max(upper, vwap)) ctx.close('back below the band or VWAP');
    if (ctx.position?.side === 'short' && price > Math.min(lower, vwap)) ctx.close('back above the band or VWAP');
    if (ctx.position) return;

    const size = sizing === 'voltarget' ? Math.min(maxExposure, targetDailyVol / dailyVol(s.dailyCloses)) : exposure;
    if (!Number.isFinite(size) || size <= 0) return;
    const reason = `move ${(100 * (price / s.open - 1)).toFixed(2)}% vs noise ${(100 * sigma).toFixed(2)}%, ${size.toFixed(2)}× equity`;
    if (price > Math.max(upper, vwap)) ctx.buy({ exposure: size, stopLoss: price * (1 - crashStopPct / 100), reason });
    else if (price < Math.min(lower, vwap)) ctx.sell({ exposure: size, stopLoss: price * (1 + crashStopPct / 100), reason });
  },
});

/** Standard deviation of daily close-to-close returns. */
function dailyVol(closes: readonly number[]): number {
  if (closes.length < 3) return NaN;
  const r = closes.slice(1).map((c, i) => c / closes[i]! - 1);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
}
