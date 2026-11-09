import { ENGINE_VERSION } from '../engine/version.ts';
/**
 * Backtest one instrument for many agent × leverage runs in a single pass over its candles.
 */
import { getInstrument } from '../engine/instruments.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { ForecastProvider } from '../engine/market.ts';
import { backtestRunId, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';
import { acceptsTick, MarketEngine } from '../engine/market.ts';
import type { Tick } from '../engine/ticks.ts';
import type { EquityPoint, RunMetrics } from '../engine/metrics.ts';
import type { LogLine, RunStatus } from '../engine/run.ts';
import type { Trade } from '../sdk/types.ts';
import { tickMinutes, recordingSnapshot, replayData, TICK_MODE, type ReplayOptions, type ReplayData } from './tick-tape.ts';
import { DEFAULT_EXECUTION_MS, VirtualVenue, type CapitalMarket } from '../engine/venue.ts';
import marketSnapshot from '../engine/fixtures/capital-markets.json';
import { MINUTE_MS } from '../engine/clock.ts';
import { replayWindow } from './replay-coverage.ts';

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

export interface ReplayThinning {
  /**
   * While no run holds a position or a pending order, deliver only the quotes that set each minute's
   * open, high, low and close (see idleMinuteTicks). Candles, last quotes and clocks are unchanged, so agents
   * that decide on closed bars trade identically (verify against a full replay when adopting it). Bar
   * volume, the quote count, is not preserved.
   */
  idleOhlcOnly?: boolean;
  /** Deliver every quote to every run, idle or not (the engine skips idle runs by default); for equivalence checks. */
  everyRunEveryQuote?: boolean;
}

/**
 * The quotes of an idle replay minute that rebuild the engine's identical candle and state: quotes the engine
 * would reject are dropped (and counted), quotes stamped outside this minute pass through, and of this
 * minute's own quotes the first, highest-bid, lowest-bid and last remain. A minute that mixes recorder
 * journals is delivered whole, because sequence order is only checked between neighbours of one journal.
 */
export function idleMinuteTicks(ticks: readonly Tick[], minute: number, previous: Tick | null): { ticks: readonly Tick[]; rejected: number } {
  const accepted: Tick[] = [];
  for (const q of ticks) if (acceptsTick(q, previous)) { accepted.push(q); previous = q; }
  if (accepted.length <= 4 || new Set(accepted.map((q) => q.journalId)).size > 1) return { ticks, rejected: 0 };
  const keep = new Set<number>([accepted.length - 1]);
  let first = -1, high = -1, low = -1, last = -1;
  for (let i = 0; i < accepted.length; i++) {
    const q = accepted[i]!;
    if (q.time < minute || q.time >= minute + MINUTE_MS) { keep.add(i); continue; }
    if (first < 0) first = i;
    last = i;
    if (high < 0 || q.bid > accepted[high]!.bid) high = i;
    if (low < 0 || q.bid < accepted[low]!.bid) low = i;
  }
  for (const i of [first, high, low, last]) if (i >= 0) keep.add(i);
  return { ticks: [...keep].sort((a, b) => a - b).map((i) => accepted[i]!), rejected: ticks.length - accepted.length };
}

export async function backtestEpic(
  epic: string,
  specs: { agent: LoadedAgent; leverage: number }[],
  window: BacktestWindow,
  forecasts: ForecastProvider | null = null,
  options: ReplayOptions = {},
  thinning: ReplayThinning = {},
): Promise<BacktestResult[]> {
  const started = Date.now();
  const instrument = {...getInstrument(epic)};
  let clock=window.start;
  const venue=new VirtualVenue(instrument);
  const rules=(marketSnapshot.markets as unknown as Record<string,CapitalMarket>)[epic];
  if(!rules)throw new Error(`missing Capital rules snapshot for ${epic}`);
  const market={...rules,snapshot:{...rules.snapshot,marketStatus:'TRADEABLE'}};
  venue.update(market,clock);
  const engine = new MarketEngine(instrument, forecasts, true, !thinning.everyRunEveryQuote);
  const runs = specs.map(({ agent, leverage }) =>
    engine.addRun({
      runId: backtestRunId(window.id, agent.id, epic, leverage),
      agent,
      leverage,
      capital: BACKTEST_CAPITAL,
      checkStopsOnCandles: false,
      execution:{venue,latencyMs:DEFAULT_EXECUTION_MS,now:()=>clock},
    }),
  );

  const data=replayData(options);
  data.recordings=options.recordings??(options.mode===TICK_MODE.SYNTHETIC?[]:await recordingSnapshot(window.start,window.end));
  let n=0,skippedRejected=0;
  for await(const minute of tickMinutes(epic,window.start,window.end,options,data)) {
    clock=minute.time;venue.updatedAt=clock;
    engine.processClock(clock);
    const busy=()=>runs.some(r=>r.position!==null||r.pendingOrders>0);
    let idle=thinning.idleOhlcOnly&&!busy();
    if(!idle){for(const tick of minute.ticks){clock=tick.receivedAt;engine.processTick(tick);}}
    else {
      // With a delayed feed the previous bar closes on this minute's first quote, so a decision can come
      // inside a thinned minute: from then on every quote is delivered. The acceptance chain follows the
      // full stream throughout, so delivered quotes and rejection counts match a full replay exactly.
      const kept=new Set(idleMinuteTicks(minute.ticks,minute.time,engine.lastAcceptedTick).ticks);
      let chain=engine.lastAcceptedTick;
      for(const tick of minute.ticks){
        if(!acceptsTick(tick,chain)){skippedRejected++;continue;}
        chain=tick;
        if(idle&&!kept.has(tick))continue;
        clock=tick.receivedAt;engine.processTick(tick);
        if(idle&&busy())idle=false;
      }
    }
    clock=minute.time+MINUTE_MS;
    engine.processClock(clock);
    engine.takeCompletedCandles();
    n++;
  }
  data.rejectedTicks=engine.rejectedTicks+skippedRejected;
  data.window=replayWindow(window.start,window.end,data.firstTickAt,data.lastTickAt);
  const endTime=n>0?clock:window.end;
  engine.adoptLatestQuote();
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
