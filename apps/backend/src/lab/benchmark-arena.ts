/**
 * Capacity benchmark on the arena's live path: real agents, recorded quotes, orders on.
 *
 *   bun run benchmark-arena [--runs 5000] [--day YYYY-MM-DD] [--hours 24] [--warm-days 30] [--lead-days 0]
 *                           [--epics US500,US100] [--every-quote]
 *
 * --lead-days replays that many recorded days with orders on before the measured window, so the measured
 * day starts with realistic open positions. --every-quote delivers every quote to every run (no skipping),
 * for comparison.
 *
 * Every run is a distinct copy of a planned agent × instrument × leverage (the plan is cycled). Runs warm
 * up on 1-minute candles with orders off, as the arena does for new runs. Then they replay one day of
 * recorded quotes through the same MarketEngine, VirtualVenue and execution delay as the arena: each
 * quote, the one-second clock, bar dispatch and the per-minute state save into a scratch database.
 * The report gives CPU time per phase and the share of one core needed to keep up with real time.
 */
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArenaDB } from '../arena/db.ts';
import { DEFAULT_EXECUTION_MS, VirtualVenue, type CapitalMarket } from '../engine/venue.ts';
import { loadAgents, type LoadedAgent } from '../engine/loader.ts';
import { loadRoster, planRuns } from '../engine/roster.ts';
import { MarketEngine, type ClosedBar } from '../engine/market.ts';
import { getInstrument } from '../engine/instruments.ts';
import type { AgentRun } from '../engine/run.ts';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../engine/clock.ts';
import { candleAt, candleCount, loadCandleArray } from './candles.ts';
import { recordingSnapshot, replayData, tickMinutes, TICK_MODE } from './tick-tape.ts';
import marketSnapshot from '../engine/fixtures/capital-markets.json';

const args = Bun.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const count = Number(value('--runs') ?? 5000);
const day = Date.parse((value('--day') ?? '2026-11-05') + 'T00:00:00Z');
const hours = Number(value('--hours') ?? 24);
const warmDays = Number(value('--warm-days') ?? 30);
const onlyEpics = value('--epics')?.split(',');
const leadDays = Number(value('--lead-days') ?? 0);
const everyQuote = args.includes('--every-quote');
const start = day,
  end = day + hours * HOUR_MS,
  replayFrom = start - leadDays * DAY_MS;

const { agents } = await loadAgents();
const plan = planRuns(agents, loadRoster()).runs.filter(p => !onlyEpics || onlyEpics.includes(p.epic));
if (!plan.length) throw Error('no planned runs for these instruments');

const phase = { warmup: 0, ticks: 0, bars: 0, tickAgents: 0, clock: 0, persist: 0 };
let clock = start;
const engines = new Map<string, MarketEngine>();
const venues = new Map<string, VirtualVenue>();
const dirty = new Set<AgentRun>();
const dirtyEpics = new Set<string>();
let opens = 0;
const setupStarted = performance.now();
for (let i = 0; i < count; i++) {
  const p = plan[i % plan.length]!,
    copy = Math.floor(i / plan.length);
  let engine = engines.get(p.epic);
  if (!engine) {
    const instrument = { ...getInstrument(p.epic) };
    engine = new MarketEngine(instrument, null, true, !everyQuote);
    engines.set(p.epic, engine);
  }
  const venue = venueFor(p.epic);
  const agent: LoadedAgent = copy ? { ...p.agent, id: `${p.agent.id}#${copy}` } : p.agent;
  const run = engine.addRun({
    runId: `benchmark/${agent.id}/${p.epic}/x${p.leverage}`,
    agent,
    leverage: p.leverage,
    capital: 10_000,
    checkStopsOnCandles: false,
    execution: { venue, latencyMs: DEFAULT_EXECUTION_MS, now: () => clock },
    onEvent: e => {
      if (e.type === 'open') opens++;
      const r = runById.get(e.runId);
      if (r) dirty.add(r);
    },
  });
  run.allowOrders = false;
}
const runById = new Map([...engines.values()].flatMap(e => e.runs.map(r => [r.runId, r] as const)));

function venueFor(epic: string): VirtualVenue {
  let venue = venues.get(epic);
  if (!venue) {
    venue = new VirtualVenue({ ...getInstrument(epic) });
    const rules = (marketSnapshot.markets as unknown as Record<string, CapitalMarket>)[epic];
    if (!rules) throw Error(`missing Capital rules snapshot for ${epic}`);
    venue.update({ ...rules, snapshot: { ...rules.snapshot, marketStatus: 'TRADEABLE' } }, replayFrom);
    venues.set(epic, venue);
  }
  return venue;
}

// Warm-up as for brand-new arena runs: one representative per agent × leverage sees every closed bar.
const warmStarted = performance.now();
for (const [epic, engine] of engines) {
  const candles = await loadCandleArray(epic, replayFrom - warmDays * DAY_MS, replayFrom);
  const representative = new Map<string, AgentRun>(),
    cloneOf = new Map<AgentRun, AgentRun>();
  for (const r of engine.runs) {
    const key = `${r.agentId.split('#')[0]}:${r.leverage}`,
      source = representative.get(key);
    if (source) cloneOf.set(r, source);
    else representative.set(key, r);
  }
  let last = null;
  for (let i = 0; i < candleCount(candles); i++) {
    const c = (last = candleAt(candles, i));
    for (const cb of engine.pushHistory(c)) for (const r of engine.runsOn(cb.series.timeframe)) if (!cloneOf.has(r)) r.onBar(cb.bar);
  }
  for (const r of engine.runs) {
    const source = cloneOf.get(r);
    if (source) {
      const snapshot = r.snapshot(),
        warm = source.snapshot();
      snapshot.state = structuredClone(warm.state);
      r.restore(snapshot, [], []);
    }
    if (last) r.primeQuote(last);
    r.markSynced(replayFrom);
    r.allowOrders = true;
  }
}
phase.warmup = performance.now() - warmStarted;

const dbPath = join(tmpdir(), `trader-benchmark-${process.pid}.db`);
const db = new ArenaDB(dbPath);
db.tx(() => {
  for (const r of runById.values())
    db.createDemoRun({ id: r.runId, agentId: r.agentId, codeHash: 'benchmark', epic: r.instrument.epic, leverage: r.leverage, capital: 10_000, params: r.params, now: start });
});
const persisted = new Map<AgentRun, number>();
let savedStates = 0,
  lastHour = 0;
function persistAll(now: number): void {
  const t = performance.now();
  const hour = Math.floor(now / HOUR_MS) * HOUR_MS,
    writeHour = hour !== lastHour,
    tenMinutes = now % (10 * MINUTE_MS) === 0;
  for (const engine of engines.values()) engine.adoptLatestQuote();
  db.tx(() => {
    for (const r of runById.values()) {
      const moving = !r.quoteIdle;
      if (!dirty.has(r) && !(moving && dirtyEpics.has(r.instrument.epic)) && !writeHour && !tenMinutes) continue;
      const done = persisted.get(r) ?? 0;
      for (let i = done; i < r.trades.length; i++) db.appendTrade(r.runId, i, r.trades[i]!);
      persisted.set(r, r.trades.length);
      const equity = r.markToMarket();
      db.saveRunState({ id: r.runId, status: r.status, equity, snapshot: r.snapshot(), metrics: null, now });
      if (writeHour) db.upsertEquity(r.runId, hour, Math.round(equity * 100) / 100);
      savedStates++;
    }
  });
  dirty.clear();
  dirtyEpics.clear();
  lastHour = hour;
  phase.persist += performance.now() - t;
}

function dispatchClosed(engine: MarketEngine, closed: ClosedBar[]): void {
  const t = performance.now();
  for (const cb of closed) {
    for (const r of engine.runsOn(cb.series.timeframe)) dirty.add(r);
    engine.dispatchBar(cb);
  }
  phase.bars += performance.now() - t;
}

const recordings = await recordingSnapshot(replayFrom, end);
const streams = [...engines].map(([epic, engine]) => ({
  epic,
  engine,
  minutes: tickMinutes(epic, replayFrom, end, { mode: TICK_MODE.RECORDED, recordings }, replayData({ mode: TICK_MODE.RECORDED, recordings }))[Symbol.asyncIterator](),
  next: null as null | IteratorResult<{ time: number; ticks: import('../engine/ticks.ts').Tick[] }>,
}));
for (const s of streams) s.next = await s.minutes.next();

let ticks = 0,
  cpuBefore = process.cpuUsage(),
  replayStarted = performance.now(),
  openAtStart = 0,
  tradesAtStart = 0;
for (let minute = replayFrom; minute < end; minute += MINUTE_MS) {
  if (minute === start && leadDays > 0) {
    // The lead-in is over: measure from here, with the positions it left open.
    for (const k of Object.keys(phase) as (keyof typeof phase)[]) if (k !== 'warmup') phase[k] = 0;
    ticks = 0; opens = 0; savedStates = 0;
    openAtStart = [...runById.values()].filter(r => r.position).length;
    tradesAtStart = [...runById.values()].reduce((n, r) => n + r.trades.length, 0);
    cpuBefore = process.cpuUsage(); replayStarted = performance.now();
  }
  // The arena refreshes market rules every minute; stale rules would refuse every order.
  for (const v of venues.values()) v.updatedAt = minute;
  for (const s of streams) {
    const due = s.next && !s.next.done && s.next.value.time === minute ? s.next.value.ticks : [];
    let second = minute + 1000;
    for (const q of due) {
      while (second <= q.receivedAt) {
        clock = second;
        const t = performance.now();
        const closed = s.engine.stepClock(second);
        phase.clock += performance.now() - t;
        dispatchClosed(s.engine, closed);
        second += 1000;
      }
      clock = q.receivedAt;
      let t = performance.now();
      const closed = s.engine.stepTick(q);
      phase.ticks += performance.now() - t;
      ticks++;
      if (closed === null) continue;
      dispatchClosed(s.engine, closed);
      t = performance.now();
      s.engine.dispatchTick(q);
      phase.tickAgents += performance.now() - t;
      s.engine.takeCompletedCandles();
      dirtyEpics.add(s.epic);
    }
    for (; second <= minute + MINUTE_MS; second += 1000) {
      clock = second;
      const t = performance.now();
      const closed = s.engine.stepClock(second);
      phase.clock += performance.now() - t;
      dispatchClosed(s.engine, closed);
    }
    if (due.length) s.next = await s.minutes.next();
  }
  persistAll(minute + MINUTE_MS);
}
const replayMs = performance.now() - replayStarted;
const cpu = process.cpuUsage(cpuBefore);
const simulatedMs = end - start;
const trades = [...runById.values()].reduce((n, r) => n + r.trades.length, 0) - tradesAtStart;
const open = [...runById.values()].filter(r => r.position).length;
const cpuMs = (cpu.user + cpu.system) / 1000;
const round = (x: number) => Math.round(x);
const report = {
  at: new Date().toISOString(),
  runs: count,
  instruments: engines.size,
  window: { start: new Date(start).toISOString(), hours },
  leadDays,
  deliveredTo: everyQuote ? 'every run' : 'runs a quote can change',
  ticks,
  openAtStart,
  opens,
  trades,
  openAtEnd: open,
  setupMs: round(warmStarted - setupStarted),
  warmupMs: round(phase.warmup),
  replayWallMs: round(replayMs),
  replayCpuMs: round(cpuMs),
  phasesMs: { ticks: round(phase.ticks), bars: round(phase.bars), tickAgents: round(phase.tickAgents), clock: round(phase.clock), persist: round(phase.persist) },
  savedStates,
  /** Share of one core needed to keep up with live markets (replay CPU / simulated time, minus tape loading is not separated). */
  coreShareLive: Number((cpuMs / simulatedMs).toFixed(4)),
  rssMb: round(process.memoryUsage().rss / 1e6),
  scope: 'real agents and recorded quotes, orders on, no broker, no forecasts (forecast agents see none); tape loading from PostgreSQL is included in replay CPU',
};
db.db.close();
for (const suffix of ['', '-shm', '-wal']) rmSync(dbPath + suffix, { force: true });
console.log(JSON.stringify(report, null, 2));
process.exit(0);
