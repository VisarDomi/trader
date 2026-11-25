import { defineAgent, localTime, TZ, POLICY_EVENT, policyCalendarCovers, policyEventsOn } from '../../src/sdk';

// Unified Visar Night rule: classify the New York cash session (full 09:30–16:00 or midday 10:30–15:30),
// take the 16:00 NY close as reference, enter at 21:27 NY (Mon–Thu) and exit at 02:27 NY or a 50% capital stop.
// With defaults (`direction: 'rule'`, `pullback: 1`), enters on an overnight counter-move against the day's direction;
// `pullback: 0` enters in the day's direction regardless of overnight move; `direction: 'long' | 'random'` drives controls.
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CASH_OPEN = 9 * 60 + 30;
const CASH_CLOSE = 16 * 60;
const CHECKPOINT_MINUTES = 15;
const SESSION_MINUTES = CASH_CLOSE - CASH_OPEN;
const REFERENCE = 16 * 60;
const ENTRY = 21 * 60 + 27;
const HOLD_MINUTES = 5 * 60;
const LONG = 'long';
const SHORT = 'short';

function emptySession() {
  return {
    date: '', open: 0, high: 0, low: 0, maxDrawdown: 0, maxRebound: 0,
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

export function nightSessionFeatures(day: ReturnType<typeof emptySession>, sessionMinutes = SESSION_MINUTES) {
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
    directionalShare: agreeing / (sessionMinutes / CHECKPOINT_MINUTES),
    retraceShare: range > 0 ? (direction > 0 ? day.maxDrawdown : day.maxRebound) / range : 1,
    rangePct: day.open > 0 ? range / day.open * 100 : 0,
    bodyShare: range > 0 ? Math.abs(change) / range : 0,
    minutes: day.minutes, checkpoints: day.points.length,
  };
}

export function classifyNightSession(f: ReturnType<typeof nightSessionFeatures>, p: NightSessionFilter, sessionMinutes = SESSION_MINUTES): number {
  return f.minutes >= Math.ceil(sessionMinutes * p.minCoverage) && f.checkpoints === sessionMinutes / CHECKPOINT_MINUTES + 1 &&
    f.movePct >= p.trendPct && f.efficiency >= p.minEfficiency && f.directionalShare >= p.minDirectionalShare &&
    f.retraceShare <= p.maxRetraceShare && f.rangePct > 0 && f.rangePct <= p.maxRangePct &&
    f.bodyShare >= p.minBodyShare ? f.direction : 0;
}

/** Skip the decision day's US session, plus a BOJ decision that can land during the night holding window. */
export function nightCalendarAllows(sessionDate: string, entryDate: string): boolean {
  return policyCalendarCovers(sessionDate) && policyCalendarCovers(entryDate) &&
    policyEventsOn(sessionDate).length === 0 && !policyEventsOn(entryDate).includes(POLICY_EVENT.BOJ);
}

/** Target return on entry capital, using the executable fill and actual rounded size. */
export function capitalProfitLevel(side: 'long' | 'short', price: number, size: number, capital: number, profitPct: number, precision: number): number | undefined {
  if (profitPct === 0) return undefined;
  if (![price, size, capital, profitPct].every(Number.isFinite) || price <= 0 || size <= 0 || capital <= 0 || profitPct < 0) {
    throw Error('Invalid capital-profit target');
  }
  const tick = 10 ** -precision, distance = capital * profitPct / 100 / size;
  const level = side === LONG ? Math.ceil((price + distance) / tick) * tick : Math.floor((price - distance) / tick) * tick;
  return level > 0 ? level : undefined;
}

export default defineAgent({
  name: 'Visar Night',
  description: 'Follow a directional New York session overnight on US500 and US100 (16:00 NY ref, 21:27 NY entry, 02:27 NY exit, 50% capital stop, FOMC/BOJ calendar guard).',
  author: 'Visar',
  instruments: ['US500', 'US100'],
  timeframe: '1m',
  leverage: [20],
  warmup: 0,
  intradayOnly: false,
  params: {
    direction: 'rule', pullback: 1, sessionStart: CASH_OPEN, sessionEnd: CASH_CLOSE, minPullbackBp: 0, profitPct: 0,
    timeZone: TZ.NEW_YORK, trendPct: 0.25, minEfficiency: 0.15, minDirectionalShare: 0.5,
    maxRetraceShare: 0.75, maxRangePct: 2, minBodyShare: 0.6, minCoverage: 0.9, marginPct: 90, lossPct: 50,
  },
  init: () => ({ session: emptySession(), referenceDate: '', reference: 0, direction: 0, attemptedDate: '', entryCapital: 0 }),
  onBar(ctx) {
    const s = ctx.state;
    const cashOpen = ctx.params.sessionStart, cashClose = ctx.params.sessionEnd;
    const sessionMinutes = cashClose - cashOpen;
    const clock = localTime(ctx.time, ctx.params.timeZone);
    const ny = localTime(ctx.bar.time, TZ.NEW_YORK);
    if (ny.minuteOfDay === cashOpen && ny.weekday >= 1 && ny.weekday <= 5) {
      s.session = {
        ...emptySession(), date: ny.date, open: ctx.bar.open,
        high: ctx.bar.open, low: ctx.bar.open, points: [ctx.bar.open],
      };
    }
    const day = s.session;
    if (ny.date === day.date && ny.minuteOfDay >= cashOpen && ny.minuteOfDay < cashClose) {
      day.minutes++;
      day.high = Math.max(day.high, ctx.bar.high);
      day.low = Math.min(day.low, ctx.bar.low);
      day.maxDrawdown = Math.max(day.maxDrawdown, day.high - ctx.bar.low);
      day.maxRebound = Math.max(day.maxRebound, ctx.bar.high - day.low);
      const minuteClose = ny.minuteOfDay + 1;
      if ((minuteClose - cashOpen) % CHECKPOINT_MINUTES === 0) day.points.push(ctx.bar.close);
      if (minuteClose === cashClose) {
        day.direction = classifyNightSession(nightSessionFeatures(day, sessionMinutes), ctx.params, sessionMinutes);
      }
    }
    if (clock.minuteOfDay === REFERENCE) {
      s.referenceDate = clock.date;
      s.reference = ctx.bar.close;
      s.direction = day.date === clock.date ? day.direction : 0;
    }
    if (ctx.isWarmup || ctx.position || clock.weekday < 1 || clock.weekday > 4 || clock.minuteOfDay !== ENTRY) return;
    if (s.attemptedDate === clock.date) return;
    s.attemptedDate = clock.date;
    const morning = new Date(Date.UTC(clock.year, clock.month - 1, clock.day) + DAY_MS).toISOString().slice(0, 10);
    if (s.referenceDate !== clock.date || s.direction === 0 || !nightCalendarAllows(clock.date, morning)) return;
    const ruleSide = s.direction > 0 ? LONG : SHORT;
    const counterMoveBp = (ruleSide === LONG ? s.reference - ctx.bar.close : ctx.bar.close - s.reference) / s.reference * 10000;
    if (!Number.isFinite(counterMoveBp)) return;
    if (ctx.params.pullback && (counterMoveBp <= 0 || counterMoveBp < ctx.params.minPullbackBp)) return;
    const side = ctx.params.direction === 'long' ? LONG : ctx.params.direction === 'random' ? (ctx.random() < 0.5 ? LONG : SHORT) : ruleSide;
    s.entryCapital = ctx.balance;
    const entry = ctx.bar.close + (side === LONG ? ctx.bar.spread || ctx.instrument.typicalSpread : 0);
    const distance = entry * ctx.params.lossPct / (ctx.params.marginPct * ctx.leverage);
    const tick = 10 ** -ctx.instrument.pricePrecision;
    const stopLoss = side === LONG ? Math.ceil((entry - distance) / tick) * tick : Math.floor((entry + distance) / tick) * tick;
    const takeProfit = capitalProfitLevel(side, entry, ctx.balance * ctx.params.marginPct / 100 * ctx.leverage / entry, ctx.balance, ctx.params.profitPct, ctx.instrument.pricePrecision);
    const nativeTakeProfit = takeProfit !== undefined && Math.abs(takeProfit - entry) < entry * .99 ? takeProfit : undefined;
    const options = {
      marginPct: ctx.params.marginPct,
      stopLoss,
      ...(nativeTakeProfit === undefined ? {} : { takeProfit: nativeTakeProfit }),
      validUntil: ctx.time + MINUTE_MS,
      closeAt: ctx.time + HOLD_MINUTES * MINUTE_MS,
      reason: `${ctx.params.direction === 'rule' ? '' : `control ${ctx.params.direction === 'long' ? 'always long' : `coin flip ${side}`}; rule would ${ruleSide === LONG ? 'buy' : 'sell'} (`}${s.direction > 0 ? 'bullish day' : 'bearish day'}, ${counterMoveBp > 0 ? `overnight ${s.direction > 0 ? 'dip' : 'bounce'} ${counterMoveBp.toFixed(2)}bp` : `no overnight ${s.direction > 0 ? 'dip' : 'bounce'} (${counterMoveBp.toFixed(2)}bp)`}${ctx.params.pullback ? ` >= ${ctx.params.minPullbackBp}bp` : ', pullback not required'}${ctx.params.direction === 'rule' ? '' : ')'}; NY ${cashOpen === 630 ? '10:30–15:30' : '09:30–16:00'}; exit ${ctx.params.profitPct ? `+${ctx.params.profitPct}% or ` : ''}02:27; 21:27 ${ctx.params.timeZone}`,
    };
    if (side === LONG) ctx.buy(options);
    else ctx.sell(options);
  },
  onTick(ctx) {
    const p = ctx.position;
    if (ctx.params.profitPct > 0 && p && p.takeProfit === null && p.unrealizedPnl >= ctx.state.entryCapital * ctx.params.profitPct / 100)
      ctx.close(`capital take profit +${ctx.params.profitPct}%`);
  },
  onFill(ctx, fill) {
    if (fill.kind !== 'open' || !ctx.position) return;
    const distance = ctx.state.entryCapital * ctx.params.lossPct / 100 / fill.size;
    const tick = 10 ** -ctx.instrument.pricePrecision;
    const stopLoss = fill.side === LONG ? Math.ceil((fill.price - distance) / tick) * tick : Math.floor((fill.price + distance) / tick) * tick;
    const takeProfit = capitalProfitLevel(fill.side, fill.price, fill.size, ctx.state.entryCapital, ctx.params.profitPct, ctx.instrument.pricePrecision);
    const nativeTakeProfit = takeProfit !== undefined && Math.abs(takeProfit - fill.price) < fill.price * .99 ? takeProfit : undefined;
    if (Math.abs(stopLoss - (ctx.position.stopLoss ?? 0)) >= tick / 2 || (ctx.params.profitPct > 0 && nativeTakeProfit !== ctx.position.takeProfit))
      ctx.setStops({ stopLoss, ...(ctx.params.profitPct > 0 ? { takeProfit: nativeTakeProfit ?? null } : {}) });
  },
});
