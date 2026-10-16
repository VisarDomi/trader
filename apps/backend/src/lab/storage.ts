/** Whole-project storage accounting, two-year growth estimates and an explicit 100 GB budget. */
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tickStoreStats } from './tick-store.ts';
import { DATA_DIR } from './candles.ts';
import { sql } from '../data/db.ts';
import { TICK_API } from '../engine/ticks.ts';
export const PROJECT_STORAGE_BUDGET_BYTES = 100_000_000_000;
const TWO_YEARS_SECONDS = 2 * 365.25 * 86400,
  NON_TICK_GROWTH_RESERVE = 10_000_000_000;
const CACHE = join(DATA_DIR, 'tick-storage-filesystem.json');
async function output(args: string[]): Promise<string> {
  const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [code, out, error] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if (code !== 0) throw new Error(`storage measurement failed: ${error.slice(0, 200)}`);
  return out;
}
async function files(force: boolean) {
  if (!force && existsSync(CACHE)) {
    const old = await Bun.file(CACHE).json();
    if (Date.now() - old.at < 3600_000) return old;
  }
  const repo = resolve(DATA_DIR, '../../..');
  const repositoryBytes = Number((await output(['du', '-sb', repo])).split(/\s/)[0]);
  const hub = join(process.env.HOME ?? '/home/visar', '.cache/huggingface/hub');
  let modelBytes = 0;
  if (existsSync(hub))
    for (const name of readdirSync(hub).filter((n) => n.toLowerCase().includes('timesfm')))
      modelBytes += Number((await output(['du', '-sbL', join(hub, name)])).split(/\s/)[0]);
  const remote = await output([
    'ssh',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    'erdal@157.90.28.14',
    'du -sb /home/erdal/trader-arena /home/erdal/trader-ui',
  ]);
  const serverBytes = remote
    .trim()
    .split('\n')
    .reduce((n, line) => n + Number(line.split(/\s/)[0]), 0);
  const value = { at: Date.now(), repositoryBytes, modelBytes, serverBytes };
  await Bun.write(CACHE, JSON.stringify(value));
  return value;
}
export async function storageReport(force = false) {
  const [f, s] = await Promise.all([files(force), tickStoreStats()]);
  const totalBytes = f.repositoryBytes + f.modelBytes + f.serverBytes + s.databaseBytes;
  const baseline = Math.max(0, totalBytes - s.diskBytes) + NON_TICK_GROWTH_RESERVE;
  const secondsLeft = Math.max(0, TWO_YEARS_SECONDS - ((s.last ?? 0) - (s.first ?? 0)) / 1000);
  const diskBytesPerTick = s.rows ? s.diskBytes / s.rows : 0;
  const assumedBytesPerTick = Math.max(8, s.bytesPerTick * 1.4, diskBytesPerTick);
  const pointTwoYearBytes = baseline + s.diskBytes + secondsLeft * s.ticksPerSecond * Math.max(s.bytesPerTick, diskBytesPerTick);
  const stressTicksPerSecond = s.ticksPerSecond * 4;
  const stressTwoYearBytes = baseline + s.diskBytes + secondsLeft * stressTicksPerSecond * assumedBytesPerTick;
  const report = {
    at: Date.now(),
    budgetBytes: PROJECT_STORAGE_BUDGET_BYTES,
    totalBytes,
    repositoryBytes: f.repositoryBytes,
    modelBytes: f.modelBytes,
    serverBytes: f.serverBytes,
    databaseBytes: s.databaseBytes,
    tickBytes: s.diskBytes,
    ticks: s.rows,
    bytesPerTick: s.bytesPerTick,
    ticksPerSecond: s.ticksPerSecond,
    capturedSeconds: ((s.last ?? 0) - (s.first ?? 0)) / 1000,
    pointTwoYearBytes,
    stressTwoYearBytes,
    stressTicksPerSecond,
    stressBytesPerTick: assumedBytesPerTick,
    nonTickGrowthReserveBytes: NON_TICK_GROWTH_RESERVE,
    tickBudgetBytes: s.budgetBytes,
    warning: totalBytes > 90_000_000_000 || stressTwoYearBytes > PROJECT_STORAGE_BUDGET_BYTES,
    notes:
      'One canonical compressed PostgreSQL tick store. Includes lab repository/dependencies/caches, TimesFM model cache, trader server folders and the lab database. Forecast is a measurement-based estimate, not a future-rate guarantee; stress assumes 4x observed quote rate and at least 8 bytes/tick. 10 GB reserved for non-tick growth.',
  };
  await Bun.write(join(DATA_DIR, 'tick-storage.json'), JSON.stringify(report, null, 2));
  const token = process.env.ARENA_TOKEN;
  if (token) {
    try {
      await fetch((process.env.ARENA_URL ?? 'http://127.0.0.1:4120') + TICK_API.STORAGE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      /* The report remains on disk while the server/tunnel is unavailable. */
    }
  }
  return report;
}
if (import.meta.main) {
  try {
    console.log(JSON.stringify(await storageReport(process.argv.includes('--refresh')), null, 2));
  } finally {
    await sql.close();
  }
}
