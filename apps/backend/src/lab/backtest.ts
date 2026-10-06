/**
 * Backtest CLI (runs on the lab PC).
 *
 *   bun run backtest                    every agent × instrument whose code changed since its last backtest
 *   bun run backtest rsi                only agent ids starting with "rsi"
 *   bun run backtest --epic US100       only this instrument
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
import { loadAgents, type LoadedAgent } from '../engine/loader.ts';
import type { BacktestResult } from './backtest-core.ts';
import { STANDARD_WINDOW } from './backtest-core.ts';
import { DATA_DIR } from './candles.ts';
import type { WorkerJob } from './worker.ts';

const RESULTS_DIR = join(DATA_DIR, 'backtests', STANDARD_WINDOW.id);
const DEFAULT_WORKERS = 5;
const AGENTS_PER_JOB = 20;
const PUSH_BATCH = 8;
const ARENA_URL = process.env.ARENA_URL ?? 'http://127.0.0.1:4120';

interface Args {
  prefix: string | null;
  epic: string | null;
  force: boolean;
  workers: number;
  push: boolean;
  pushOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { prefix: null, epic: null, force: false, workers: DEFAULT_WORKERS, push: true, pushOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--epic') args.epic = argv[++i] ?? null;
    else if (a === '--force') args.force = true;
    else if (a === '--workers') args.workers = Math.max(1, Number(argv[++i]) || DEFAULT_WORKERS);
    else if (a === '--no-push') args.push = false;
    else if (a === '--push-only') args.pushOnly = true;
    else if (!a.startsWith('--')) args.prefix = a;
  }
  return args;
}

export function resultPath(agentId: string, epic: string): string {
  return join(RESULTS_DIR, `${agentId.replaceAll('/', '__')}__${epic}.json`);
}

async function readResult(agentId: string, epic: string): Promise<BacktestResult | null> {
  const path = resultPath(agentId, epic);
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
  console.log('\n agent                                  epic        return   cagr    maxDD  sharpe trades  win   pf     t     µs/bar status');
  for (const r of rows) {
    const m = r.metrics;
    console.log(
      ` ${r.agentId.padEnd(38)} ${r.epic.padEnd(10)} ${pct(m.totalReturn).padStart(8)} ${pct(m.annualReturn).padStart(7)} ${pct(m.maxDrawdown).padStart(6)} ${m.sharpe.toFixed(2).padStart(6)} ${String(m.trades).padStart(6)} ${pct(m.winRate).padStart(5)} ${m.profitFactor.toFixed(2).padStart(5)} ${m.tStat.toFixed(1).padStart(5)} ${String(r.agentUsPerBar).padStart(6)} ${r.status}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { agents, errors } = await loadAgents();
  for (const e of errors) console.error(`✗ ${e.file}: ${e.error}`);

  const selected = agents.filter(a => !args.prefix || a.id.startsWith(args.prefix));
  const pairs: { agent: LoadedAgent; epic: string }[] = [];
  for (const agent of selected) {
    for (const epic of agent.def.instruments) {
      if (!args.epic || args.epic === epic) pairs.push({ agent, epic });
    }
  }
  mkdirSync(RESULTS_DIR, { recursive: true });

  if (args.pushOnly) {
    const cached = (await Promise.all(pairs.map(p => readResult(p.agent.id, p.epic))))
      .filter((r, i): r is BacktestResult => r !== null && r.codeHash === pairs[i]!.agent.codeHash);
    console.log(`pushing ${cached.length} cached results`);
    const ok = await pushResults(cached);
    console.log(ok ? 'pushed' : 'push incomplete');
    process.exit(ok ? 0 : 1);
  }

  const todo: typeof pairs = [];
  for (const p of pairs) {
    const cached = args.force ? null : await readResult(p.agent.id, p.epic);
    if (!cached || cached.codeHash !== p.agent.codeHash) todo.push(p);
  }
  console.log(`${selected.length} agents, ${pairs.length} agent×instrument pairs, ${todo.length} to run (window ${STANDARD_WINDOW.id})`);
  if (todo.length === 0) process.exit(0);

  const byEpic = new Map<string, string[]>();
  for (const p of todo) byEpic.set(p.epic, [...(byEpic.get(p.epic) ?? []), p.agent.id]);
  const jobs: WorkerJob[] = [];
  for (const [epic, ids] of byEpic) {
    for (let i = 0; i < ids.length; i += AGENTS_PER_JOB) {
      jobs.push({ epic, agentIds: ids.slice(i, i + AGENTS_PER_JOB), window: STANDARD_WINDOW });
    }
  }

  const all: BacktestResult[] = [];
  let done = 0;
  const started = Date.now();
  const queue = [...jobs];
  const workerLoop = async (): Promise<void> => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const results = await runJob(job);
        for (const r of results) await Bun.write(resultPath(r.agentId, r.epic), JSON.stringify(r));
        all.push(...results);
        done++;
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        console.log(`[${done}/${jobs.length}] ${job.epic}: ${results.length} agents in ${(results[0]?.durationMs ?? 0) / 1000}s (elapsed ${secs}s)`);
        if (args.push) await pushResults(results);
      } catch (err) {
        console.error(`job ${job.epic} [${job.agentIds.join(', ')}] failed:`, err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.workers, jobs.length) }, workerLoop));
  printSummary(all);
  process.exit(0);
}

if (import.meta.main) await main();

export function listCachedResults(): string[] {
  return existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR) : [];
}
