import { ENGINE_VERSION } from '../engine/version.ts';
/**
 * Backtest one instrument for many agent × leverage runs in a single pass over its candles.
 */
import { getInstrument } from '../engine/instruments.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { ForecastProvider } from '../engine/market.ts';
import { backtestRunId, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';
import { MarketEngine } from '../engine/market.ts';
import type { EquityPoint, RunMetrics } from '../engine/metrics.ts';
import type { LogLine, RunStatus } from '../engine/run.ts';
import type { Trade } from '../sdk/types.ts';
import { tickMinutes, recordingSnapshot, replayData, TICK_MODE, type ReplayOptions, type ReplayData } from './tick-tape.ts';
import { DEFAULT_EXECUTION_MS, VirtualVenue, VirtualGateway, type CapitalMarket } from '../engine/venue.ts';
import marketSnapshot from '../engine/fixtures/capital-markets.json';
import { MINUTE_MS } from '../engine/clock.ts';

export interface BacktestWindow {
  id: string;
  start: number;
  end: number;
}

/**
 * Shared comparison window for the stored Capital minute dataset. US500 begins
 * 2024-01-01; 2026-10-15 API probes found no earlier minute data, although older
 * hourly/daily quotes exist. This is a data-resolution limit, not the index's age.
 */
export const STANDARD_WINDOW: BacktestWindow = {
  id: PRIMARY_BACKTEST_WINDOW_ID,
  start: Date.UTC(2024, 0, 1),
  end: Date.UTC(2026, 9, 1),
};

export const BACKTEST_CAPITAL = 10_000;
const MAX_STORED_TRADES = 20_000;
const MAX_STORED_LOGS = 100;

export interface BacktestResult {
  agentId: string;
  engineVersion?: string;
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
  data?: ReplayData;
  ticks?: number;
  agentUsPerTick?: number;
}

export async function backtestEpic(
  epic: string,
  specs: { agent: LoadedAgent; leverage: number }[],
  window: BacktestWindow,
  forecasts: ForecastProvider | null = null,
  options: ReplayOptions = {},
): Promise<BacktestResult[]> {
  const started = Date.now();
  const instrument = {...getInstrument(epic)};
  let clock=window.start;
  const venue=new VirtualVenue(instrument);
  const rules=(marketSnapshot.markets as unknown as Record<string,CapitalMarket>)[epic];
  if(!rules)throw new Error(`missing Capital rules snapshot for ${epic}`);
  const market={...rules,snapshot:{...rules.snapshot,marketStatus:'TRADEABLE'}};
  venue.update(market,clock);
  const engine = new MarketEngine(instrument, forecasts);
  const runs = specs.map(({ agent, leverage }) =>
    engine.addRun({
      runId: backtestRunId(window.id, agent.id, epic, leverage),
      agent,
      leverage,
      capital: BACKTEST_CAPITAL,
      checkStopsOnCandles: false,
      execution:{venue,latencyMs:DEFAULT_EXECUTION_MS,gateway:new VirtualGateway(),now:()=>clock},
    }),
  );

  const data=replayData(options);
  data.recordings=options.recordings??(options.mode===TICK_MODE.SYNTHETIC?[]:await recordingSnapshot(window.start,window.end));
  let n=0;
  for await(const minute of tickMinutes(epic,window.start,window.end,options,data)) {
    clock=minute.time;venue.updatedAt=clock;
    engine.processClock(clock);
    for(const tick of minute.ticks){clock=tick.receivedAt;engine.processTick(tick);}
    clock=minute.time+MINUTE_MS;
    engine.processClock(clock);
    engine.takeCompletedCandles();
    n++;
  }
  data.rejectedTicks=engine.rejectedTicks;
  const endTime=n>0?clock:window.end;
  for (const run of runs) run.finish(endTime);

  const durationMs = Date.now() - started;
  return runs.map((run, i) => {
    const { agent, leverage } = specs[i]!;
    return {
      agentId: agent.id,
      engineVersion: ENGINE_VERSION,
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
      data,
      ticks:data.recordedTicks+data.syntheticTicks,
      agentUsPerTick:run.ticksSeen>0?Math.round(run.agentTickMs*1000/run.ticksSeen):0,
    };
  });
}
