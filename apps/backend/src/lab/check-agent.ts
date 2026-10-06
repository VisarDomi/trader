/**
 * Quick sanity check for an agent file (seconds, not minutes).
 *
 *   bun run check-agent agents/my-agent.ts            last 120 days on each variant's first instrument
 *   bun run check-agent agents/my-agent.ts --all      every instrument
 *   bun run check-agent agents/my-agent.ts --days 365
 *
 * Checks: it loads, it trades, it does not throw, orders are not rejected,
 * it is fast, and two runs give identical results (no hidden randomness).
 */
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadAgents } from '../engine/loader.ts';
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

  let problems = 0;
  for (const agent of mine) {
    const epics = all ? [...agent.def.instruments] : [agent.def.instruments[0]!];
    for (const epic of epics) {
      let forecasts: CachedForecastProvider | null = null;
      if (agent.def.forecast) {
        const ctx = agent.def.forecast.context ?? DEFAULT_FORECAST_CONTEXT;
        if (!existsSync(forecastFile(epic, agent.def.timeframe, ctx, PRECOMPUTED_HORIZON))) {
          console.log(`  ! ${agent.id} ${epic}: no precomputed forecasts (ctx.forecast will be null). Run: bun run forecasts --epic ${epic}`);
        }
        forecasts = await CachedForecastProvider.open(epic);
        await forecasts.preload([{ tf: agent.def.timeframe, spec: agent.def.forecast }]);
      }
      const [a] = await backtestEpic(epic, [agent], window, forecasts);
      const [b] = await backtestEpic(epic, [agent], window, forecasts);
      problems += report(a!, b!, days);
    }
  }
  console.log(problems === 0 ? '\n✓ all checks passed' : `\n${problems} problem(s) found`);
  process.exit(problems === 0 ? 0 : 1);
}

function report(r: BacktestResult, again: BacktestResult, days: number): number {
  const m = r.metrics;
  let problems = 0;
  const head = `${r.agentId} on ${r.epic}`;
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
  const same = JSON.stringify(r.trades) === JSON.stringify(again.trades);
  if (!same) issue('two identical runs produced different trades (use ctx.random(), never Math.random() or Date.now())');
  return problems;
}

await main();
