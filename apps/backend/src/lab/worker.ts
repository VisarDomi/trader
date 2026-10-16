/**
 * Backtest worker: runs one (instrument, agent × leverage subset) job and posts results back.
 */
import { loadAgents } from '../engine/loader.ts';
import type { BacktestWindow } from './backtest-core.ts';
import { backtestEpic } from './backtest-core.ts';
import { CachedForecastProvider } from './forecast-cache.ts';
import type {ReplayOptions} from './tick-tape.ts';

declare const self: Worker;

export interface WorkerJob {
  epic: string;
  runs: { agentId: string; leverage: number }[];
  window: BacktestWindow;
  replay?:ReplayOptions;
}

self.onmessage = async (event: MessageEvent<WorkerJob>) => {
  const { epic, runs, window, replay } = event.data;
  try {
    const { agents } = await loadAgents();
    const byId = new Map(agents.map(a => [a.id, a]));
    const specs = runs.flatMap(r => {
      const agent = byId.get(r.agentId);
      return agent ? [{ agent, leverage: r.leverage }] : [];
    });
    const forecastSpecs = specs.flatMap(({ agent: a }) => (a.def.forecast ? [{ tf: a.def.timeframe, spec: a.def.forecast }] : []));
    const forecasts = forecastSpecs.length > 0 ? await CachedForecastProvider.open(epic) : null;
    await forecasts?.preload(forecastSpecs);
    const results = await backtestEpic(epic, specs, window, forecasts,replay);
    self.postMessage({ ok: true, results });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  }
};
