import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * Buy US index dips in an uptrend, judged by where the cash session closed in
 * its range: IBS = (close − low) ÷ (high − low) of the 09:30-16:00 New York
 * session. A close near the low (IBS < 0.2) above the 200-day average has been
 * followed by above-average next-day returns for decades (Pagonidis 2013, "The
 * IBS effect"), usually put down to end-of-day liquidity demand that reverses
 * overnight. One of the few retail ideas that survived a 2026 test of 100+
 * strategies against random entries. Our 2024-26 candles agree in sign.
 *
 *   pagonidis  IBS < 0.2 above the 200-day average; sell at the next 16:00 close
 *   composite  the survivor rule: IBS < 0.2, RSI(2) < 10 or three lower closes, above
 *              the 200-day average; sell at a close above the 5-session average or
 *              after 10 sessions; 8% stop
 */
export default defineAgent({
  name: 'IBS Dip',
  description: 'Buys US indices when the cash session closes near its low (IBS < 0.2) above the 200-day average; out on the next strong close.',
  author: 'claude',
  instruments: ['US500', 'US100', 'US30'],
  timeframe: '30m',
  extraTimeframes: ['1d'],
  params: { rule: 'pagonidis', ibsMax: 0.2, rsiMax: 10, trendDays: 200, exitAvg: 5, maxSessions: 10, stopPct: 8, exposure: 1 },
  variants: {
    pagonidis: {},
    composite: { rule: 'composite' },
  },
  init: () => ({ day: '', high: 0, low: 0, closes: [] as number[], held: 0 }),
  warmup: 2,
  onBar(ctx) {
    const { rule, ibsMax, rsiMax, trendDays, exitAvg, maxSessions, stopPct, exposure } = ctx.params;
    const s = ctx.state;
    const bar = ctx.bar;
    const start = localTime(bar.time, TZ.NEW_YORK);
    const ny = localTime(ctx.time, TZ.NEW_YORK);
    if (ny.weekday === 0 || ny.weekday === 6) return;
    const OPEN = 9 * 60 + 30;
    const CLOSE = 16 * 60;

    if (start.minuteOfDay === OPEN) Object.assign(s, { day: ny.date, high: bar.high, low: bar.low });
    if (s.day !== ny.date || start.minuteOfDay < OPEN || ny.minuteOfDay > CLOSE) return;
    s.high = Math.max(s.high, bar.high);
    s.low = Math.min(s.low, bar.low);
    if (ny.minuteOfDay !== CLOSE) return;

    // The 16:00 close: one more session.
    const price = bar.close;
    s.closes = [...s.closes, price].slice(-(exitAvg + 3));
    const ibs = s.high > s.low ? (price - s.low) / (s.high - s.low) : 0.5;
    const trend = ctx.tf('1d').ta.sma(trendDays);

    if (ctx.position) {
      s.held++;
      const avg = mean(s.closes.slice(-exitAvg));
      if (rule === 'pagonidis') ctx.close(`next close (IBS ${ibs.toFixed(2)})`);
      else if (price > avg) ctx.close(`close above the ${exitAvg}-session average`);
      else if (s.held >= maxSessions) ctx.close(`${maxSessions} sessions`);
      return;
    }
    if (!(price > trend)) return;
    const c = s.closes;
    const threeDown = c.length >= 4 && c.at(-1)! < c.at(-2)! && c.at(-2)! < c.at(-3)! && c.at(-3)! < c.at(-4)!;
    const rsi = rsi2(c);
    const dip = rule === 'pagonidis' ? ibs < ibsMax : ibs < ibsMax || rsi < rsiMax || threeDown;
    if (!dip) return;
    s.held = 0;
    const stopLoss = rule === 'composite' ? price * (1 - stopPct / 100) : undefined;
    ctx.buy({ exposure, stopLoss, reason: `IBS ${ibs.toFixed(2)}, RSI(2) ${rsi.toFixed(0)}${threeDown ? ', three lower closes' : ''}, above the ${trendDays}-day average` });
  },
});

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** RSI(2) of session closes (Wilder smoothing over the closes kept, seeded by the first two changes). */
function rsi2(closes: readonly number[]): number {
  if (closes.length < 3) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    if (i <= 2) {
      gain += g / 2;
      loss += l / 2;
    } else {
      gain = (gain + g) / 2;
      loss = (loss + l) / 2;
    }
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
