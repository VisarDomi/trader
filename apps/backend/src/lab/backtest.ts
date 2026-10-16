import { ENGINE_VERSION } from '../engine/version.ts';
/**
 * Backtest CLI (runs on the lab PC).
 *
 *   bun run backtest                    every agent × instrument × leverage (agents/roster.json) not backtested at its current code
 *   bun run backtest rsi                only agent ids starting with "rsi"
 *   bun run backtest --epic US100,GOLD  only these instruments
 *   bun run backtest --force            ignore cached results
 *   bun run backtest --workers 4        worker threads (default 5)
 *   bun run backtest --no-push          do not send results to the arena
 *   bun run backtest --push-only        just (re)send cached results for current code
 *
 * Results land in data/backtests/<window>/ and are pushed to the arena
 * (ARENA_URL, default http://127.0.0.1:4120 through the SSH tunnel).
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadAgents } from '../engine/loader.ts';
import { loadRoster, planRuns, type PlannedRun } from '../engine/roster.ts';
import type { BacktestResult, BacktestWindow } from './backtest-core.ts';
import { STANDARD_WINDOW } from './backtest-core.ts';
import { DATA_DIR } from './candles.ts';
import type { WorkerJob } from './worker.ts';
import { DEFAULT_FORECAST_CONTEXT } from '../engine/market.ts';
import { forecastFile, PRECOMPUTED_HORIZON } from './forecast-cache.ts';
import {recordingSnapshot,TICK_MODE,type ReplayOptions} from './tick-tape.ts';
import {DEFAULT_TICK_SEED,DEFAULT_TICKS_PER_MINUTE} from '../engine/synthetic-ticks.ts';

const DEFAULT_WORKERS = 5;
const RUNS_PER_JOB = 20;
const PUSH_BATCH = 8;
const ARENA_URL = process.env.ARENA_URL ?? 'http://127.0.0.1:4120';

interface Args {
  prefix: string | null;
  epics: string[] | null;
  force: boolean;
  workers: number;
  push: boolean;
  pushOnly: boolean;
  window:BacktestWindow;
  replay:ReplayOptions;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { prefix: null, epics: null, force: false, workers: DEFAULT_WORKERS, push: true, pushOnly: false,window:{...STANDARD_WINDOW},replay:{mode:TICK_MODE.AUTO,seed:DEFAULT_TICK_SEED,ticksPerMinute:DEFAULT_TICKS_PER_MINUTE} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--epic') args.epics = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--force') args.force = true;
    else if (a === '--workers') args.workers = Math.max(1, Number(argv[++i]) || DEFAULT_WORKERS);
    else if (a === '--no-push') args.push = false;
    else if (a === '--push-only') args.pushOnly = true;
    else if (a === '--from') args.window.start=Date.parse(argv[++i]??'');
    else if (a === '--to') args.window.end=Date.parse(argv[++i]??'');
    else if (a === '--ticks') {
      const mode=argv[++i];if(!Object.values(TICK_MODE).includes(mode as never))throw new Error('--ticks must be auto, recorded or synthetic');
      args.replay.mode=mode as ReplayOptions['mode'];
    }
    else if (a === '--tick-seed') args.replay.seed=Number(argv[++i]);
    else if (a === '--ticks-per-minute') args.replay.ticksPerMinute=Number(argv[++i]);
    else if (!a.startsWith('--')) args.prefix = a;
    else throw new Error(`unknown option ${a}`);
  }
  if(!Number.isFinite(args.window.start)||!Number.isFinite(args.window.end)||args.window.end<=args.window.start)throw new Error('invalid --from/--to window (end is exclusive)');
  if(args.window.start%60_000 || args.window.end%60_000)throw new Error('window bounds must be whole UTC minutes');
  if(!Number.isSafeInteger(args.replay.seed)||!Number.isInteger(args.replay.ticksPerMinute)||args.replay.ticksPerMinute!<4||args.replay.ticksPerMinute!>240)throw new Error('tick seed must be an integer; density must be 4..240');
  if(args.window.start!==STANDARD_WINDOW.start || args.window.end!==STANDARD_WINDOW.end || args.replay.mode!==TICK_MODE.AUTO || args.replay.seed!==DEFAULT_TICK_SEED || args.replay.ticksPerMinute!==DEFAULT_TICKS_PER_MINUTE)
    args.window.id=`${new Date(args.window.start).toISOString().slice(0,16).replaceAll(':','')}_${new Date(args.window.end).toISOString().slice(0,16).replaceAll(':','')}__${args.replay.mode}-s${args.replay.seed}-n${args.replay.ticksPerMinute}`;
  return args;
}

export function resultPath(agentId: string, epic: string, leverage: number,windowId=STANDARD_WINDOW.id): string {
  return join(DATA_DIR,'backtests',windowId, `${agentId.replaceAll('/', '__')}__${epic}__x${leverage}.json`);
}

async function readResult(agentId: string, epic: string, leverage: number,windowId=STANDARD_WINDOW.id): Promise<BacktestResult | null> {
  const path = resultPath(agentId, epic, leverage,windowId);
  if (!existsSync(path)) return null;
  return (await Bun.file(path).json()) as BacktestResult;
}

function runJob(job: WorkerJob): Promise<BacktestResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url).href);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; results?: BacktestResult[]; error?: string }>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.results!);
      else reject(new Error(event.data.error));
    };
    worker.onerror = err => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage(job);
  });
}

export async function pushResults(results: BacktestResult[]): Promise<boolean> {
  const token = process.env.ARENA_TOKEN;
  if (!token) {
    console.warn('ARENA_TOKEN not set — skipping push');
    return false;
  }
  for (let i = 0; i < results.length; i += PUSH_BATCH) {
    const batch = results.slice(i, i + PUSH_BATCH);
    try {
      const res = await fetch(`${ARENA_URL}/api/backtests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ results: batch }),
      });
      if (!res.ok) {
        console.warn(`push failed (${res.status}): ${await res.text()}`);
        return false;
      }
    } catch (err) {
      console.warn(`arena unreachable at ${ARENA_URL}: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
  return true;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function printSummary(results: BacktestResult[]): void {
  const rows = [...results].sort((a, b) => b.metrics.sharpe - a.metrics.sharpe);
  console.log('\n agent                                  epic       lev     return   cagr    maxDD  sharpe trades  win   pf     t     µs/bar status');
  for (const r of rows) {
    const m = r.metrics;
    console.log(
      ` ${r.agentId.padEnd(38)} ${r.epic.padEnd(10)} ${`1:${r.leverage}`.padEnd(6)} ${pct(m.totalReturn).padStart(8)} ${pct(m.annualReturn).padStart(7)} ${pct(m.maxDrawdown).padStart(6)} ${m.sharpe.toFixed(2).padStart(6)} ${String(m.trades).padStart(6)} ${pct(m.winRate).padStart(5)} ${m.profitFactor.toFixed(2).padStart(5)} ${m.tStat.toFixed(1).padStart(5)} ${String(r.agentUsPerBar).padStart(6)} ${r.status}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  args.replay.recordings=args.replay.mode===TICK_MODE.SYNTHETIC?[]:await recordingSnapshot(args.window.start,args.window.end);
  const matches=(r:BacktestResult|null,hash:string):r is BacktestResult=> Boolean(r && r.data && r.codeHash===hash && r.engineVersion===ENGINE_VERSION && r.data.mode===args.replay.mode && r.data.seed===args.replay.seed && r.data.ticksPerMinute===args.replay.ticksPerMinute && JSON.stringify(r.data.recordings)===JSON.stringify(args.replay.recordings));
  const { agents, errors } = await loadAgents();
  for (const e of errors) console.error(`✗ ${e.file}: ${e.error}`);

  const selected = agents.filter(a => !args.prefix || a.id.startsWith(args.prefix));
  const pairs: PlannedRun[] = [];
  const missingForecasts = new Set<string>();
  for (const p of planRuns(selected, loadRoster()).runs) {
    const { agent, epic } = p;
    if (args.epics && !args.epics.includes(epic)) continue;
    // Forecast agents wait for their precomputed table; otherwise a result without forecasts would be cached.
    const spec = agent.def.forecast;
    if (spec && !existsSync(forecastFile(epic, agent.def.timeframe, spec.context ?? DEFAULT_FORECAST_CONTEXT, PRECOMPUTED_HORIZON))) {
      missingForecasts.add(`${epic} ${agent.def.timeframe}`);
      continue;
    }
    pairs.push(p);
  }
  if (missingForecasts.size > 0) {
    console.warn(`skipping forecast agents without precomputed forecasts (${[...missingForecasts].join(', ')}); run: bun run forecasts`);
  }
  mkdirSync(join(DATA_DIR,'backtests',args.window.id), { recursive: true });

  if (args.pushOnly) {
    const cached = (await Promise.all(pairs.map(p => readResult(p.agent.id, p.epic, p.leverage,args.window.id))))
      .filter((r, i): r is BacktestResult => matches(r,pairs[i]!.agent.codeHash));
    console.log(`pushing ${cached.length} cached results`);
    const ok = await pushResults(cached);
    console.log(ok ? 'pushed' : 'push incomplete');
    process.exit(ok ? 0 : 1);
  }

  const todo: typeof pairs = [];
  for (const p of pairs) {
    const cached = args.force ? null : await readResult(p.agent.id, p.epic, p.leverage,args.window.id);
    if (!matches(cached,p.agent.codeHash)) todo.push(p);
  }
  console.log(`${selected.length} agents, ${pairs.length} agent×instrument×leverage runs, ${todo.length} to run (window ${args.window.id}; ${args.replay.mode} ticks, seed ${args.replay.seed}, ${args.replay.ticksPerMinute}/synthetic minute)`);
  if (todo.length === 0) process.exit(0);

  const byEpic = new Map<string, WorkerJob['runs']>();
  for (const p of todo) byEpic.set(p.epic, [...(byEpic.get(p.epic) ?? []), { agentId: p.agent.id, leverage: p.leverage }]);
  const jobs: WorkerJob[] = [];
  for (const [epic, runs] of byEpic) {
    for (let i = 0; i < runs.length; i += RUNS_PER_JOB) {
      jobs.push({ epic, runs: runs.slice(i, i + RUNS_PER_JOB), window: args.window,replay:args.replay });
    }
  }

  const all: BacktestResult[] = [];
  let done = 0;
  let failedJobs = 0;
  const started = Date.now();
  const queue = [...jobs];
  const workerLoop = async (): Promise<void> => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const results = await runJob(job);
        for (const r of results) await Bun.write(resultPath(r.agentId, r.epic, r.leverage,r.windowId), JSON.stringify(r));
        all.push(...results);
        done++;
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        console.log(`[${done}/${jobs.length}] ${job.epic}: ${results.length} agents in ${(results[0]?.durationMs ?? 0) / 1000}s (elapsed ${secs}s)`);
        if (args.push) await pushResults(results);
      } catch (err) {
        failedJobs++;
        console.error(`job ${job.epic} [${job.runs.map(r => `${r.agentId}@${r.leverage}`).join(', ')}] failed:`, err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.workers, jobs.length) }, workerLoop));
  printSummary(all);
  process.exit(failedJobs ? 1 : 0);
}

if (import.meta.main) await main();

export function listCachedResults(): string[] {
  const RESULTS_DIR=join(DATA_DIR,'backtests',STANDARD_WINDOW.id);
  return existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR) : [];
}
