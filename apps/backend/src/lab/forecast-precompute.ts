/**
 * Precompute TimesFM forecasts for backtests (runs on the lab PC, needs the
 * forecaster service on the GPU).
 *
 *   bun run forecasts             every (instrument, timeframe, context) an agent declares
 *   bun run forecasts --force     recompute existing tables
 *   bun run forecasts --epic GOLD only this instrument
 *
 * Bars are built with the same BarSeries the backtester uses, and each bar's
 * context is the last N closes including that bar — exactly what the live
 * arena sends — so backtest and demo see the same forecasts.
 */
import { existsSync } from 'node:fs';
import { loadAgents } from '../engine/loader.ts';
import { DEFAULT_FORECAST_CONTEXT } from '../engine/market.ts';
import { BarSeries } from '../engine/series.ts';
import { requestForecasts } from '../arena/forecast-client.ts';
import type { Timeframe } from '../sdk/types.ts';
import { STANDARD_WINDOW } from './backtest-core.ts';
import { candleAt, candleCount, loadCandleArray } from './candles.ts';
import type { ForecastRecord } from './forecast-cache.ts';
import { ForecastTable, forecastFile, PRECOMPUTED_HORIZON } from './forecast-cache.ts';

const FORECASTER_URL = process.env.FORECASTER_URL ?? 'http://127.0.0.1:4130';
const BATCH = 256;
/** TimesFM needs at least one input patch. */
const MIN_CONTEXT_BARS = 32;
const BATCH_TIMEOUT_MS = 120_000;

interface Table {
  epic: string;
  tf: Timeframe;
  context: number;
}

async function precompute(t: Table): Promise<void> {
  const path = forecastFile(t.epic, t.tf, t.context, PRECOMPUTED_HORIZON);
  const data = await loadCandleArray(t.epic, STANDARD_WINDOW.start, STANDARD_WINDOW.end);
  const series = new BarSeries(t.epic, t.tf);
  const jobs: { time: number; context: number[] }[] = [];
  for (let i = 0; i < candleCount(data); i++) {
    for (const bar of series.push(candleAt(data, i))) {
      if (series.bars.length < MIN_CONTEXT_BARS) continue;
      jobs.push({ time: bar.time, context: series.bars.slice(-t.context).map(b => b.close) });
    }
  }
  console.log(`[${t.epic} ${t.tf} c${t.context}] ${jobs.length} forecasts to compute`);
  const records: ForecastRecord[] = [];
  const started = Date.now();
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const res = await requestForecasts(FORECASTER_URL, batch.map(j => j.context), PRECOMPUTED_HORIZON, BATCH_TIMEOUT_MS);
    batch.forEach((j, k) => records.push({ time: j.time, mean: res.mean[k]!, quantiles: res.quantiles[k]! }));
    if ((i / BATCH) % 20 === 0) {
      const rate = records.length / ((Date.now() - started) / 1000);
      const eta = (jobs.length - records.length) / Math.max(rate, 1);
      console.log(`  ${records.length}/${jobs.length} (${rate.toFixed(0)}/s, ~${Math.round(eta / 60)} min left)`);
    }
  }
  await ForecastTable.write(path, records, PRECOMPUTED_HORIZON);
  console.log(`[${t.epic} ${t.tf} c${t.context}] wrote ${records.length} forecasts in ${Math.round((Date.now() - started) / 1000)}s -> ${path}`);
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const epicArg = process.argv.indexOf('--epic');
  const onlyEpic = epicArg >= 0 ? process.argv[epicArg + 1] : null;
  const { agents } = await loadAgents();
  const tables = new Map<string, Table>();
  for (const a of agents) {
    if (!a.def.forecast) continue;
    const context = a.def.forecast.context ?? DEFAULT_FORECAST_CONTEXT;
    for (const epic of a.def.instruments) tables.set(`${epic}:${a.def.timeframe}:${context}`, { epic, tf: a.def.timeframe, context });
  }
  const todo = [...tables.values()]
    .filter(t => !onlyEpic || t.epic === onlyEpic)
    .filter(t => force || !existsSync(forecastFile(t.epic, t.tf, t.context, PRECOMPUTED_HORIZON)));
  console.log(`${tables.size} forecast tables needed, ${todo.length} to compute`);
  for (const t of todo) {
    try {
      await precompute(t);
    } catch (err) {
      console.error(`[${t.epic} ${t.tf} c${t.context}] failed:`, err instanceof Error ? err.message : err);
    }
  }
  process.exit(0);
}

await main();
