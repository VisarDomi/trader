/**
 * Quick sanity check for an agent file (seconds, not minutes).
 *
 *   bun run check-agent agents/my-agent.ts            last 120 days on each variant's first instrument and leverage
 *   bun run check-agent agents/my-agent.ts --all      every instrument and leverage
 *   bun run check-agent agents/my-agent.ts --days 365
 *
 * Checks: it loads, it trades, it does not throw, orders are not rejected,
 * it is fast, and two runs give identical results (no hidden randomness).
 * Also reports how much leverage it uses, for choosing its tier (agents/LIFECYCLE.md).
 */
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadAgents } from '../engine/loader.ts';
import { LEVERAGE_TIERS } from '../engine/leverage.ts';
import { loadRoster, planRuns, rosterProblems } from '../engine/roster.ts';
import { DEFAULT_FORECAST_CONTEXT } from '../engine/market.ts';
import { DAY_MS } from '../engine/clock.ts';
import type { BacktestResult, BacktestWindow } from './backtest-core.ts';
import { backtestEpic, STANDARD_WINDOW } from './backtest-core.ts';
import { CachedForecastProvider, forecastFile, PRECOMPUTED_HORIZON } from './forecast-cache.ts';

const SLOW_US_PER_BAR = 500;
const OVERTRADING_PER_DAY = 20;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fileArg = argv.find(a => !a.startsWith('--'));
  if (!fileArg) fail('usage: bun run check-agent agents/<file>.ts [--all] [--days N]');
  const file = resolve(fileArg);
  if (!existsSync(file)) fail(`${file} does not exist`);
  const all = argv.includes('--all');
  const daysIdx = argv.indexOf('--days');
  const days = daysIdx >= 0 ? Number(argv[daysIdx + 1]) : 120;

  const { agents, errors } = await loadAgents();
  const loadError = errors.find(e => resolve(e.file) === file);
  if (loadError) fail(`does not load: ${loadError.error}`);
  const mine = agents.filter(a => resolve(a.file) === file);
  if (mine.length === 0) fail(`no agent found in ${file} (is the default export defineAgent({...})? does the name start with "_"?)`);

  const window: BacktestWindow = { id: `check-${days}d`, start: STANDARD_WINDOW.end - days * DAY_MS, end: STANDARD_WINDOW.end };
  console.log(`✓ loads: ${mine.map(a => `${a.id}@${a.codeHash}`).join(', ')}`);
  console.log(`  window: last ${days} days of the standard backtest window\n`);

  const roster = loadRoster();
  let problems = 0;
  for (const p of rosterProblems(roster, agents)) {
    problems++;
    console.log(`  ✗ agents/roster.json: ${p}`);
  }
  const planned = planRuns(mine, roster).runs;
  const checked = all ? planned : mine.flatMap(a => planned.find(p => p.agent === a) ?? []);
  if (checked.length === 0) console.log('  ! every run of this agent is retired in agents/roster.json');
  for (const { agent, epic, leverage } of checked) {
    let forecasts: CachedForecastProvider | null = null;
    if (agent.def.forecast) {
      const ctx = agent.def.forecast.context ?? DEFAULT_FORECAST_CONTEXT;
      if (!existsSync(forecastFile(epic, agent.def.timeframe, ctx, PRECOMPUTED_HORIZON))) {
        console.log(`  ! ${agent.id} ${epic}: no precomputed forecasts (ctx.forecast will be null). Run: bun run forecasts --epic ${epic}`);
      }
      forecasts = await CachedForecastProvider.open(epic);
      await forecasts.preload([{ tf: agent.def.timeframe, spec: agent.def.forecast }]);
    }
    const [a] = await backtestEpic(epic, [{ agent, leverage }], window, forecasts);
    const [b] = await backtestEpic(epic, [{ agent, leverage }], window, forecasts);
    problems += report(a!, b!, days);
  }
  console.log(problems === 0 ? '\n✓ all checks passed' : `\n${problems} problem(s) found`);
  process.exit(problems === 0 ? 0 : 1);
}

function report(r: BacktestResult, again: BacktestResult, days: number): number {
  const m = r.metrics;
  let problems = 0;
  const head = `${r.agentId} on ${r.epic} at 1:${r.leverage}`;
  console.log(
    `  ${head}: ${m.trades} trades, return ${(m.totalReturn * 100).toFixed(1)}%, maxDD ${(m.maxDrawdown * 100).toFixed(1)}%, ` +
      `sharpe ${m.sharpe.toFixed(2)}, ${r.agentUsPerBar} µs/bar, status ${r.status}`,
  );
  const issue = (msg: string): void => {
    problems++;
    console.log(`    ✗ ${msg}`);
  };
  const warn = (msg: string): void => console.log(`    ! ${msg}`);
  if (r.errors > 0) issue(`onBar threw ${r.errors} time(s): ${r.logs.find(l => l.message.startsWith('ERROR'))?.message.split('\n')[0]}`);
  if (m.trades === 0) warn('no trades in this window — check the entry conditions');
  if (m.trades / days > OVERTRADING_PER_DAY) warn(`${(m.trades / days).toFixed(1)} trades/day — spread costs will dominate`);
  if (r.agentUsPerBar > SLOW_US_PER_BAR) issue(`slow: ${r.agentUsPerBar} µs per bar (keep it under ${SLOW_US_PER_BAR})`);
  const rejected = r.logs.filter(l => l.message.includes('rejected'));
  if (rejected.length > 0) warn(`${rejected.length} rejected order(s), e.g. "${rejected[0]!.message}"`);
  const used = leverageUsed(r);
  if (used.length > 0) {
    const p90 = quantile(used, 0.9);
    const tier = LEVERAGE_TIERS.find(l => 0.9 * l >= p90) ?? LEVERAGE_TIERS.at(-1)!;
    console.log(
      `    leverage used: median ${quantile(used, 0.5).toFixed(1)}×, 90th percentile ${p90.toFixed(1)}× equity` +
        ` (measured at 1:${r.leverage}; lowest tier that rarely caps it: 1:${tier})`,
    );
  }
  const same = JSON.stringify(r.trades) === JSON.stringify(again.trades);
  if (!same) issue('two identical runs produced different trades (use ctx.random(), never Math.random() or Date.now())');
  return problems;
}

/** Position notional ÷ equity at each entry (equity from the closed trades before it). */
function leverageUsed(r: BacktestResult): number[] {
  let equity = r.capital;
  const out: number[] = [];
  for (const t of r.trades) {
    if (equity > 0) out.push((t.size * t.entryPrice) / equity);
    equity += t.pnl;
  }
  return out;
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

await main();
