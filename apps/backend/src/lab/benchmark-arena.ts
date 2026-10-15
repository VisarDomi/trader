/** Capacity benchmark using the actual agent code and cached candle tape, with no broker traffic. */
import { loadAgents } from '../engine/loader.ts';
import { planRuns, loadRoster } from '../engine/roster.ts';
import { MarketEngine } from '../engine/market.ts';
import { getInstrument } from '../engine/instruments.ts';
import { candleAt, candleCount, loadCandleArray } from './candles.ts';
import { ArenaDB } from '../arena/db.ts';
import { percentile } from '../capital/telemetry.ts';
import { rmSync } from 'node:fs';
const count = Number(process.argv[2] ?? 5000);
const { agents } = await loadAgents();
const plan = planRuns(agents, loadRoster()).runs;
const engines = new Map<string, MarketEngine>();
const started = performance.now();
const cpu = process.cpuUsage();
for (let i = 0; i < count; i++) {
  const p = plan[i % plan.length]!;
  let engine = engines.get(p.epic);
  if (!engine) {
    engine = new MarketEngine({ ...getInstrument(p.epic) });
    engines.set(p.epic, engine);
  }
  const run = engine.addRun({
    runId: `benchmark-${i}`,
    agent: p.agent,
    leverage: p.leverage,
    capital: 10_000,
    checkStopsOnCandles: false,
  });
  run.allowOrders = false;
}
const timings: number[] = [];
for (const [epic, engine] of engines) {
  const end = Date.UTC(2026, 9, 14);
  const tape = await loadCandleArray(epic, end - 2 * 86_400_000, end, false);
  const n = candleCount(tape);
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    engine.processCandle(candleAt(tape, i));
    timings.push(performance.now() - t);
  }
}
const path = `data/benchmark-${process.pid}.db`;
const db = new ArenaDB(path);
const beforePersist = performance.now();
db.tx(() => {
  for (const engine of engines.values())
    for (const run of engine.runs) {
      db.createDemoRun({
        id: run.runId,
        agentId: run.agentId,
        codeHash: 'benchmark',
        epic: run.instrument.epic,
        leverage: run.leverage,
        capital: run.capital,
        params: run.params,
        now: Date.now(),
      });
      db.saveRunState({
        id: run.runId,
        status: run.status,
        equity: run.markToMarket(),
        snapshot: run.snapshot(),
        metrics: run.metrics(),
        now: Date.now(),
      });
    }
});
const persistMs = performance.now() - beforePersist;
const used = process.cpuUsage(cpu);
const report = {
  at: new Date().toISOString(),
  runs: count,
  instruments: engines.size,
  elapsedMs: Math.round(performance.now() - started),
  cpuMs: Math.round((used.user + used.system) / 1000),
  rssMb: Math.round(process.memoryUsage().rss / 1e6),
  instrumentMinuteP50Ms: percentile(timings, 0.5),
  instrumentMinuteP95Ms: percentile(timings, 0.95),
  instrumentMinuteMaxMs: Math.round(Math.max(...timings)),
  persistAllMs: Math.round(persistMs),
  scope: 'real agents, 2 days cached bars, orders disabled; does not measure live network or open-position processing',
};
await Bun.write('data/capacity-benchmark.json', JSON.stringify(report, null, 2));
db.db.close();
for (const suffix of ['', '-shm', '-wal']) rmSync(path + suffix, { force: true });
console.log(JSON.stringify(report, null, 2));
