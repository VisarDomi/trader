/** Frequency-only calibration: select on 2024 entry counts, then report later years without retuning. */
import def, { classifyNightSession, nightCalendarAllows, nightSessionFeatures, type NightSessionFilter } from '../../agents/visar-night-trading.ts';
import { localTime, TZ } from '../sdk/index.ts';
import { loadAgents } from '../engine/loader.ts';
import { getInstrument } from '../engine/instruments.ts';
import { MarketEngine } from '../engine/market.ts';
import { DAY_MS, MINUTE_MS } from '../engine/clock.ts';
import { candleAt, candleCount, loadCandleArray } from './candles.ts';
import { STANDARD_WINDOW } from './backtest-core.ts';

const AGENT_ID = 'visar-night-trading';
const EPIC = 'US500';
const TRAIN_END = '2025-01-01';
const TARGET = { min: 25, max: 50 };
const ANCHOR = { minEfficiency: 0.25, minDirectionalShare: 0.55, maxRetraceShare: 0.65 };
type Features = ReturnType<typeof nightSessionFeatures>;
interface Opportunity { date: string; features: Features; calendar: boolean }

const loaded = (await loadAgents()).agents.find(a => a.id === AGENT_ID)!;
const engine = new MarketEngine(getInstrument(EPIC));
const run = engine.addRun({ runId: 'night-frequency-audit', agent: loaded, leverage: 200, capital: 10_000, checkStopsOnCandles: true });
run.allowOrders = false; // Extract observable signals independently of account balance or trade outcomes.
const data = await loadCandleArray(EPIC, STANDARD_WINDOW.start, STANDARD_WINDOW.end);
const opportunities: Opportunity[] = [];
const counts = { sessions: 0, complete: 0, entryObservations: 0, priorReference: 0, overnightPullbacks: 0, calendarAllowed: 0 };
for (let i = 0; i < candleCount(data); i++) {
  const bar = candleAt(data, i);
  engine.processCandle(bar);
  const state = run.state as unknown as ReturnType<NonNullable<typeof def.init>>;
  const now = bar.time + MINUTE_MS;
  const ny = localTime(now, TZ.NEW_YORK);
  if (ny.minuteOfDay === 16 * 60 && state.session.date === ny.date) {
    counts.sessions++;
    const f = nightSessionFeatures(state.session);
    if (f.minutes >= 351 && f.checkpoints === 27) counts.complete++;
  }
  const local = localTime(now, TZ.TIRANA);
  if (local.minuteOfDay !== 3 * 60 + 27 || local.weekday === 0 || local.weekday === 6) continue;
  counts.entryObservations++;
  const yesterday = new Date(Date.UTC(local.year, local.month - 1, local.day) - DAY_MS).toISOString().slice(0, 10);
  if (state.referenceDate !== yesterday || state.session.localDate !== yesterday) continue;
  counts.priorReference++;
  const features = nightSessionFeatures(state.session);
  if (!(features.direction > 0 ? bar.close < state.reference : features.direction < 0 && bar.close > state.reference)) continue;
  counts.overnightPullbacks++;
  const calendar = nightCalendarAllows(yesterday, local.date);
  if (calendar) counts.calendarAllowed++;
  opportunities.push({ date: local.date, features, calendar });
}

const training = opportunities.filter(o => o.date < TRAIN_END && o.calendar);
const candidates: { filter: NightSessionFilter; trainingEntries: number; distance: number }[] = [];
for (const minEfficiency of [0.15, 0.2, 0.25, 0.3, 0.35])
  for (const minDirectionalShare of [0.5, 0.52, 0.55, 0.58, 0.6])
    for (const maxRetraceShare of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75]) {
      const filter: NightSessionFilter = { trendPct: 0.25, minEfficiency, minDirectionalShare, maxRetraceShare, maxRangePct: 2, minBodyShare: 0.6, minCoverage: 0.9 };
      const trainingEntries = training.filter(o => classifyNightSession(o.features, filter) !== 0).length;
      const distance = Math.abs(minEfficiency - ANCHOR.minEfficiency) + Math.abs(minDirectionalShare - ANCHOR.minDirectionalShare) + Math.abs(maxRetraceShare - ANCHOR.maxRetraceShare);
      candidates.push({ filter, trainingEntries, distance });
    }
const inBand = candidates.filter(c => c.trainingEntries >= TARGET.min && c.trainingEntries <= TARGET.max);
inBand.sort((a, b) => a.distance - b.distance || Math.abs(a.trainingEntries - 37.5) - Math.abs(b.trainingEntries - 37.5));
const selected = inBand[0];
if (!selected) throw new Error(`No candidate meets the frequency band: ${Math.min(...candidates.map(c=>c.trainingEntries))}..${Math.max(...candidates.map(c=>c.trainingEntries))} entries`);
const accepted = opportunities.filter(o => o.calendar && classifyNightSession(o.features, selected.filter) !== 0);
const byYear = [2024, 2025, 2026].map(year => {
  const start = Math.max(STANDARD_WINDOW.start, Date.UTC(year, 0, 1));
  const end = Math.min(STANDARD_WINDOW.end, Date.UTC(year + 1, 0, 1));
  const entries = accepted.filter(o => o.date.startsWith(String(year))).length;
  return { year, role: year === 2024 ? 'frequency calibration' : 'later-period validation', entries, annualizedEntries: +(entries / ((end - start) / DAY_MS / 365.25)).toFixed(1) };
});
const report = {
  generatedAt: new Date().toISOString(), window: STANDARD_WINDOW, selectionUses: '2024 entry counts only; no returns, wins, losses, Sharpe or later-period counts',
  target: TARGET, anchor: ANCHOR, gridSize: candidates.length, candidatesInBand: inBand.length,
  observations: counts, selected, byYear,
  trainingAlternatives: inBand.slice(0, 12).map(({filter, trainingEntries})=>({filter, trainingEntries})),
  entryDates: accepted.map(o=>o.date),
};
await Bun.write('data/night-frequency-calibration.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, entryDates: undefined }, null, 2));
