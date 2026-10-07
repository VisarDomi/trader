/**
 * Backtest one instrument for many agent × leverage runs in a single pass over its candles.
 */
import { getInstrument } from '../engine/instruments.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { ForecastProvider } from '../engine/market.ts';
import { backtestRunId } from '../engine/run-id.ts';
import { MarketEngine } from '../engine/market.ts';
import type { EquityPoint, RunMetrics } from '../engine/metrics.ts';
import type { LogLine, RunStatus } from '../engine/run.ts';
import type { Trade } from '../sdk/types.ts';
import { candleAt, candleCount, loadCandleArray } from './candles.ts';

export interface BacktestWindow {
  id: string;
  start: number;
  end: number;
}

/**
 * The standard window every agent is scored on. Capital.com keeps minute
 * history from 2024-01-01, so this is the longest window all 12 instruments share.
 */
export const STANDARD_WINDOW: BacktestWindow = {
  id: '2024-01_2026-09',
  start: Date.UTC(2024, 0, 1),
  end: Date.UTC(2026, 9, 1),
};

export const BACKTEST_CAPITAL = 10_000;
const MAX_STORED_TRADES = 20_000;
const MAX_STORED_LOGS = 100;

export interface BacktestResult {
  agentId: string;
  codeHash: string;
  epic: string;
  /** Account leverage tier. */
  leverage: number;
  windowId: string;
  windowStart: number;
  windowEnd: number;
  params: Record<string, unknown>;
  capital: number;
  status: RunStatus;
  errors: number;
  metrics: RunMetrics;
  trades: Trade[];
  equity: EquityPoint[];
  logs: LogLine[];
  /** Average agent time per onBar call, microseconds. */
  agentUsPerBar: number;
  bars: number;
  candles: number;
  ranAt: number;
  durationMs: number;
}

export async function backtestEpic(
  epic: string,
  specs: { agent: LoadedAgent; leverage: number }[],
  window: BacktestWindow,
  forecasts: ForecastProvider | null = null,
): Promise<BacktestResult[]> {
  const started = Date.now();
  const instrument = getInstrument(epic);
  const engine = new MarketEngine(instrument, forecasts);
  const runs = specs.map(({ agent, leverage }) =>
    engine.addRun({
      runId: backtestRunId(window.id, agent.id, epic, leverage),
      agent,
      leverage,
      capital: BACKTEST_CAPITAL,
      checkStopsOnCandles: true,
    }),
  );

  const data = await loadCandleArray(epic, window.start, window.end, window.end > Date.now());
  const n = candleCount(data);
  for (let i = 0; i < n; i++) engine.processCandle(candleAt(data, i));
  const endTime = n > 0 ? candleAt(data, n - 1).time + 60_000 : window.end;
  for (const run of runs) run.finish(endTime);

  const durationMs = Date.now() - started;
  return runs.map((run, i) => {
    const { agent, leverage } = specs[i]!;
    return {
      agentId: agent.id,
      codeHash: agent.codeHash,
      epic,
      leverage,
      windowId: window.id,
      windowStart: window.start,
      windowEnd: window.end,
      params: agent.params,
      capital: BACKTEST_CAPITAL,
      status: run.status,
      errors: run.errors,
      metrics: run.metrics(),
      trades: run.trades.slice(-MAX_STORED_TRADES),
      equity: run.equity,
      logs: run.logs.slice(-MAX_STORED_LOGS),
      agentUsPerBar: run.barsSeen > 0 ? Math.round((run.agentMs * 1000) / run.barsSeen) : 0,
      bars: run.barsSeen,
      candles: n,
      ranAt: Date.now(),
      durationMs,
    };
  });
}
