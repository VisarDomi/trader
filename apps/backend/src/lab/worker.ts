/**
 * Backtest worker: runs one (instrument, agent subset) job and posts results back.
 */
import { loadAgents } from '../engine/loader.ts';
import type { BacktestWindow } from './backtest-core.ts';
import { backtestEpic } from './backtest-core.ts';
import { CachedForecastProvider } from './forecast-cache.ts';

declare const self: Worker;

export interface WorkerJob {
  epic: string;
  agentIds: string[];
  window: BacktestWindow;
}

self.onmessage = async (event: MessageEvent<WorkerJob>) => {
  const { epic, agentIds, window } = event.data;
  try {
    const { agents } = await loadAgents();
    const wanted = new Set(agentIds);
    const selected = agents.filter(a => wanted.has(a.id));
    const forecastSpecs = selected.flatMap(a => (a.def.forecast ? [{ tf: a.def.timeframe, spec: a.def.forecast }] : []));
    const forecasts = forecastSpecs.length > 0 ? await CachedForecastProvider.open(epic) : null;
    await forecasts?.preload(forecastSpecs);
    const results = await backtestEpic(epic, selected, window, forecasts);
    self.postMessage({ ok: true, results });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  }
};
