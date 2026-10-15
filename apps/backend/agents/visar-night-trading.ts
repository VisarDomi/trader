import { defineAgent, localTime, TZ, POLICY_EVENT, policyCalendarCovers, policyEventsOn } from '../src/sdk';

// Calibrated to 25–50 entries/year using 2024 counts only; later years validate frequency, not profit.
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CASH_OPEN = 9 * 60 + 30;
const CASH_CLOSE = 16 * 60;
const CHECKPOINT_MINUTES = 15;
const SESSION_MINUTES = CASH_CLOSE - CASH_OPEN;
const REFERENCE = 22 * 60;
const ENTRY = 3 * 60 + 27;
const EXIT = 8 * 60 + 27;
const LONG = 'long';
const SHORT = 'short';

function emptySession() {
  return {
    date: '', localDate: '', open: 0, high: 0, low: 0, maxDrawdown: 0, maxRebound: 0,
    minutes: 0, points: [] as number[], direction: 0,
  };
}

export interface NightSessionFilter {
  trendPct: number;
  minEfficiency: number;
  minDirectionalShare: number;
  maxRetraceShare: number;
  maxRangePct: number;
  minBodyShare: number;
  minCoverage: number;
}

export function nightSessionFeatures(day: ReturnType<typeof emptySession>) {
  const change = (day.points.at(-1) ?? day.open) - day.open;
  const direction = Math.sign(change);
  let distance = 0;
  let agreeing = 0;
  for (let i = 1; i < day.points.length; i++) {
    const step = day.points[i]! - day.points[i - 1]!;
    distance += Math.abs(step);
    if (step * direction > 0) agreeing++;
  }
  const range = day.high - day.low;
  return {
    direction, movePct: day.open > 0 ? Math.abs(change) / day.open * 100 : 0,
    efficiency: distance > 0 ? Math.abs(change) / distance : 0,
    directionalShare: agreeing / (SESSION_MINUTES / CHECKPOINT_MINUTES),
    retraceShare: range > 0 ? (direction > 0 ? day.maxDrawdown : day.maxRebound) / range : 1,
    rangePct: day.open > 0 ? range / day.open * 100 : 0,
    bodyShare: range > 0 ? Math.abs(change) / range : 0,
    minutes: day.minutes, checkpoints: day.points.length,
  };
}

export function classifyNightSession(f: ReturnType<typeof nightSessionFeatures>, p: NightSessionFilter): number {
  return f.minutes >= Math.ceil(SESSION_MINUTES * p.minCoverage) && f.checkpoints === SESSION_MINUTES / CHECKPOINT_MINUTES + 1 &&
    f.movePct >= p.trendPct && f.efficiency >= p.minEfficiency && f.directionalShare >= p.minDirectionalShare &&
    f.retraceShare <= p.maxRetraceShare && f.rangePct > 0 && f.rangePct <= p.maxRangePct &&
    f.bodyShare >= p.minBodyShare ? f.direction : 0;
}

/** Skip the decision day's US session, plus a BOJ decision that can land during the night holding window. */
export function nightCalendarAllows(sessionDate: string, entryDate: string): boolean {
  return policyCalendarCovers(sessionDate) && policyCalendarCovers(entryDate) &&
    policyEventsOn(sessionDate).length === 0 && !policyEventsOn(entryDate).includes(POLICY_EVENT.BOJ);
}

export default defineAgent({
  name: 'visar-night-trading',
  description: 'US500: follow a directional NY session after a 03:27 pullback from the 22:00 reference. Skip neutral, volatile and FOMC/BOJ decision days; target 25–50 entries/year. Exit 08:27 or at a 50% capital-loss stop. Albania time, 1:200.',
  author: 'Visar',
  instruments: ['US500'],
  timeframe: '1m',
  leverage: [200],
  warmup: 0,
  intradayOnly: false,
  params: {
    timeZone: TZ.TIRANA, trendPct: 0.25, minEfficiency: 0.15, minDirectionalShare: 0.5,
    maxRetraceShare: 0.75, maxRangePct: 2, minBodyShare: 0.6, minCoverage: 0.9, marginPct: 90, lossPct: 50,
  },
  init: () => ({ session: emptySession(), referenceDate: '', reference: 0, direction: 0, attemptedDate: '', entryCapital: 0 }),
  onBar(ctx) {
    const s = ctx.state;
    const local = localTime(ctx.time, ctx.params.timeZone);
    const ny = localTime(ctx.bar.time, TZ.NEW_YORK);
    if (ny.minuteOfDay === CASH_OPEN && ny.weekday >= 1 && ny.weekday <= 5) {
      s.session = {
        ...emptySession(), date: ny.date, localDate: local.date, open: ctx.bar.open,
        high: ctx.bar.open, low: ctx.bar.open, points: [ctx.bar.open],
      };
    }
    const day = s.session;
    if (ny.date === day.date && ny.minuteOfDay >= CASH_OPEN && ny.minuteOfDay < CASH_CLOSE) {
      day.minutes++;
      day.high = Math.max(day.high, ctx.bar.high);
      day.low = Math.min(day.low, ctx.bar.low);
      // OHLC does not reveal intra-minute ordering: use the conservative high/low excursion.
      day.maxDrawdown = Math.max(day.maxDrawdown, day.high - ctx.bar.low);
      day.maxRebound = Math.max(day.maxRebound, ctx.bar.high - day.low);
      const minuteClose = ny.minuteOfDay + 1;
      if ((minuteClose - CASH_OPEN) % CHECKPOINT_MINUTES === 0) day.points.push(ctx.bar.close);
      if (minuteClose === CASH_CLOSE) {
        day.direction = classifyNightSession(nightSessionFeatures(day), ctx.params);
      }
    }
    if (local.minuteOfDay === REFERENCE) {
      s.referenceDate = local.date;
      s.reference = ctx.bar.close;
      s.direction = day.localDate === local.date ? day.direction : 0;
    }
    if (ctx.isWarmup || ctx.position || local.weekday === 0 || local.weekday === 6 || local.minuteOfDay !== ENTRY) return;
    if (s.attemptedDate === local.date) return;
    s.attemptedDate = local.date;
    const yesterday = new Date(Date.UTC(local.year, local.month - 1, local.day) - DAY_MS).toISOString().slice(0, 10);
    // Missing opening/reference candles and weekend gaps cannot reuse an old reference.
    if (s.referenceDate !== yesterday || s.direction === 0 || !nightCalendarAllows(yesterday, local.date)) return;
    const side = s.direction > 0 && ctx.bar.close < s.reference ? LONG : s.direction < 0 && ctx.bar.close > s.reference ? SHORT : null;
    if (!side) return;
    s.entryCapital = ctx.balance;
    const entry = ctx.bar.close + (side === LONG ? ctx.bar.spread || ctx.instrument.typicalSpread : 0);
    const distance = entry * ctx.params.lossPct / (ctx.params.marginPct * ctx.leverage);
    const tick = 10 ** -ctx.instrument.pricePrecision;
    const stopLoss = side === LONG ? Math.ceil((entry - distance) / tick) * tick : Math.floor((entry + distance) / tick) * tick;
    const options = {
      marginPct: ctx.params.marginPct,
      stopLoss,
      validUntil: ctx.time + MINUTE_MS,
      closeAt: ctx.time + (EXIT - ENTRY) * MINUTE_MS,
      reason: `${s.direction > 0 ? 'bullish day, overnight dip' : 'bearish day, overnight bounce'}; 03:27 ${ctx.params.timeZone}`,
    };
    if (side === LONG) ctx.buy(options);
    else ctx.sell(options);
  },
  onFill(ctx, fill) {
    if (fill.kind !== 'open' || !ctx.position) return;
    // Rebase the protective price to the actual virtual fill and rounded size.
    const distance = ctx.state.entryCapital * ctx.params.lossPct / 100 / fill.size;
    const tick = 10 ** -ctx.instrument.pricePrecision;
    const stopLoss = fill.side === LONG ? Math.ceil((fill.price - distance) / tick) * tick : Math.floor((fill.price + distance) / tick) * tick;
    if (Math.abs(stopLoss - (ctx.position.stopLoss ?? 0)) >= tick / 2) ctx.setStops({ stopLoss });
  },
});
