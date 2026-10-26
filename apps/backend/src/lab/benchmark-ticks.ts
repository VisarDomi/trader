/** Offline production-state replay. No broker/Capital/model requests, and no raw tick files. */
import { constants, copyFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Arena } from '../arena/arena.ts';
import { ArenaDB } from '../arena/db.ts';
import { startApi } from '../arena/api.ts';
import type { CapitalClient } from '../capital/client.ts';
import fixtures from '../engine/fixtures/capital-markets.json';
import { TICK_SOURCE, type Tick } from '../engine/ticks.ts';
import { riskBackend } from '../engine/risk-native.ts';
import { MINUTE_MS } from '../engine/clock.ts';
import { unpackTicks } from '../data/tick-codec.ts';
import { sql } from '../data/db.ts';
import { DATA_DIR } from './candles.ts';

const SNAPSHOT = '--snapshot', FROM = '--from', END = '--end';
const PACE = '--pace-ms', LIMIT = '--limit', DASHBOARD = '--dashboard-every';
const argument = (key: string) => { const at = process.argv.indexOf(key); return at < 0 ? undefined : process.argv[at + 1]; };
const source = argument(SNAPSHOT);
if (!source) throw new Error('Usage: bun run benchmark-ticks --snapshot <offline arena.db> --from <epoch-ms> --end <epoch-ms>');
const from = Number(argument(FROM)), end = Number(argument(END));
const paceMs = Number(argument(PACE) ?? 0), limit = Number(argument(LIMIT) ?? 100_000), dashboardEvery = Number(argument(DASHBOARD) ?? 0);
if (!Number.isSafeInteger(from) || !Number.isSafeInteger(end) || end <= from || end - from > 5 * MINUTE_MS)
  throw new Error('Choose a recorded replay window of at most five minutes');
if (!Number.isSafeInteger(paceMs) || paceMs < 0 || paceMs > 1000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100_000 ||
  !Number.isSafeInteger(dashboardEvery) || dashboardEvery < 0)
  throw new Error('Invalid replay pacing/limit/dashboard interval');
const directory = mkdtempSync(join(DATA_DIR, 'tick-benchmark-'));
const wallClock = Date.now;
let arena: Arena | undefined, db: ArenaDB | undefined;
let api: ReturnType<typeof startApi> | undefined;
try {
  const snapshotPath = resolve(source);
  const now = Math.ceil(statSync(snapshotPath).mtimeMs / MINUTE_MS) * MINUTE_MS;
  const working = join(directory, 'arena.db');
  copyFileSync(snapshotPath, working, constants.COPYFILE_FICLONE);
  Date.now = () => now;
  db = new ArenaDB(working);
  const client = {
    get: async (path: string) => fixtures.markets[path.split('/').at(-1)! as keyof typeof fixtures.markets],
    prices: async () => [],
  } as unknown as CapitalClient;
  arena = new Arena({ db, dataClient: client, forecasterUrl: '', broker: null, live: false });
  const started = performance.now();
  await arena.start();
  const startupMs = performance.now() - started;
  const blocks = await sql`SELECT payload,sha256 FROM tick_chunks WHERE end_at>=${from} AND start_at<${end}` as {payload:Uint8Array;sha256:string}[];
  const tape = blocks.flatMap(c => unpackTicks(c.payload, c.sha256)).filter(q => q.receivedAt >= from && q.receivedAt < end).sort((a,b) => a.id-b.id);
  if (!tape.length || tape.length > 100_000) throw new Error('Replay requires 1..100000 archived quotes');
  // Identical tape/offset for every backend. Preserves inter-quote and source/arrival timing;
  // does not claim to reproduce the original account state at the tape's historical dates.
  const selected = tape.slice(0, limit);
  const offset = now + MINUTE_MS - selected[0]!.receivedAt;
  const replay = arena as unknown as { replayClock: number | null; onQuote(epic: string, q: Tick): void };
  arena.forecasts.prepare = async () => {};
  if (dashboardEvery) api = startApi(arena, 0, 'benchmark-only');
  const timings: number[] = [], cpu = process.cpuUsage();
  let count = 0;
  for (const q of selected) {
    if (paceMs) await Bun.sleep(paceMs);
    if (api && ++count % dashboardEvery === 0) {
      arena.persistAll(false);
      for (const path of ['/api/agents', '/api/leaderboard?kind=demo']) {
        const response = await fetch(`http://127.0.0.1:${api.port}${path}`);
        if (!response.ok) throw new Error(`benchmark dashboard read failed: ${response.status}`);
        await response.json();
      }
    }
    const receivedAt = q.receivedAt + offset;
    replay.replayClock = receivedAt;
    for (const venue of arena.venues.values()) venue.updatedAt = receivedAt;
    const begin = performance.now();
    replay.onQuote(q.epic, { time: q.time + offset, receivedAt, bid: q.bid, ask: q.ask, source: TICK_SOURCE.RECORDED, sequence: q.id, journalId: 'benchmark-ticks' });
    timings.push(performance.now() - begin);
  }
  const used = process.cpuUsage(cpu), persistStarted = performance.now();
  arena.persistAll(true);
  const persistMs = performance.now() - persistStarted;
  const digest = new Bun.CryptoHasher('sha256');
  let positions = 0, trades = 0;
  for (const [id, {run}] of arena.tracked) {
    digest.update(JSON.stringify([id, run.snapshot(), run.trades, run.equity, run.logs]));
    if (run.position) positions++;
    trades += run.trades.length;
  }
  timings.sort((a,b) => a-b);
  console.log(JSON.stringify({ riskBackend, runs: arena.tracked.size, positions, trades, from, end, quotes: selected.length, startupMs, paceMs, dashboardEvery,
    cpuMs: (used.user + used.system) / 1000, p50Ms: timings[Math.floor(timings.length * .5)], p95Ms: timings[Math.floor(timings.length * .95)],
    maxMs: timings.at(-1), persistMs, rssMb: process.memoryUsage().rss / 1e6, digest: digest.digest('hex') }, null, 2));
} finally {
  try { await api?.stop(true); arena?.stop(); db?.db.close(); } finally {
    Date.now = wallClock;
    await sql.close();
    rmSync(directory, {recursive:true, force:true});
  }
}
