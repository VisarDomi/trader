import type { LiveExecution } from './venue.ts';
import { QUOTE_MAX_AGE_MS } from './venue.ts';
import { TICK_SOURCE, type Tick } from './ticks.ts';
/**
 * AgentRun — one agent trading one instrument with its own virtual account.
 *
 * Backtests and the live arena both drive runs through the same three calls:
 *   onCandle(c)  every 1-minute candle (stops, funding, equity)
 *   onTick(q)    every live quote (live only; stops at tick precision)
 *   onBar(bar)   every closed primary-timeframe bar (calls the agent)
 *
 * Fills are simulated at the current quote: BUY at ask, SELL at bid. Stops are
 * pessimistic in backtests (gap -> fill at the open; stop beats take-profit
 * inside one candle). Margin and funding follow the run's account leverage.
 */
import type { DefinedAgent } from '../sdk/index.ts';
import type {
  AgentContext,
  Bar,
  ExitReason,
  Fill,
  Forecast,
  InstrumentInfo,
  OrderOptions,
  Position,
  Side,
  StopUpdate,
  Timeframe,
  TimeframeView,
  Trade,
} from '../sdk/types.ts';
import { EXIT_REASON } from '../sdk/types.ts';
import { fundingDay, isSessionBlackout, isSessionEnd, utcDay, DAY_MS, SCHEDULED_EXIT_NOTE } from './clock.ts';
import type { Instrument } from './instruments.ts';
import { effectiveLeverage, isFundingFree } from './leverage.ts';
import type { EquityPoint, RunMetrics } from './metrics.ts';
import { computeMetrics } from './metrics.ts';
import type { BarSeries, Candle } from './series.ts';

export const RUN_STATUS = {
  RUNNING: 'running',
  ERROR: 'error',
  BUSTED: 'busted',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

const SIDE_LONG: Side = 'long';
const SIDE_SHORT: Side = 'short';
const NATIVE_EXIT_REASON = [EXIT_REASON.STOP_LOSS, EXIT_REASON.TRAILING_STOP, EXIT_REASON.TAKE_PROFIT, EXIT_REASON.MARGIN_CALL] as const;

/** Fraction of equity that may be locked as margin when sizing an order. */
const MAX_MARGIN_USE = 0.9;
/** Capital.com closes positions when equity falls below 50% of used margin. */
const MARGIN_CLOSE_OUT = 0.5;
const MAX_RISK_PCT = 10;
const DEFAULT_RISK_PCT = 1;
const DEFAULT_EXPOSURE = 1;
const DEFAULT_WARMUP = 100;
const MAX_AGENT_ERRORS = 5;
const MAX_LOG_LINES = 300;
const SIZE_EPSILON = 1e-9;

export interface Quote {
  bid: number;
  ask: number;
  time: number;
  receivedAt?: number;
  source?: Tick['source'];
  sequence?: number;
  journalId?: string;
}

export type RunEvent =
  | {
      type: 'open';
      barCloseTime?: number;
      decisionTime?: number;
      trailingStop?: number | null;
      runId: string;
      side: Side;
      size: number;
      price: number;
      time: number;
      stopLoss: number | null;
      takeProfit: number | null;
    }
  | { type: 'close'; runId: string; trade: Trade }
  | {
      type: 'stops';
      trailingStop?: number | null;
      runId: string;
      stopLoss: number | null;
      takeProfit: number | null;
    }
  | { type: 'log'; runId: string; time: number; message: string }
  | { type: 'error'; runId: string; time: number; message: string };

export interface RunOptions {
  runId: string;
  agentId: string;
  agent: DefinedAgent;
  params: Record<string, unknown>;
  instrument: Instrument;
  /** Leverage of the account the run trades on (1 = unleveraged); see leverage.ts. */
  leverage: number;
  capital: number;
  primary: BarSeries;
  extra: ReadonlyMap<Timeframe, BarSeries>;
  /** Backtests check stops against candle highs/lows; live runs check every tick instead. */
  checkStopsOnCandles: boolean;
  execution?: LiveExecution;
  onEvent?: (event: RunEvent) => void;
  tickHistory?: readonly Tick[];
}

interface OpenPosition {
  closeAt?: number;
  validUntil?: number;
  side: Side;
  size: number;
  entryPrice: number;
  entryTime: number;
  entryBarCount: number;
  /** Observed holding bars and the last closed-bar timestamp counted, independent of a process's warm-up origin. */
  heldBars?: number;
  heldThrough?: number;
  /** Current-process cursor only; discarded when restoring. */
  heldCount?: number;
  barsHeldPartial?: boolean;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStop: number | null;
  /** Best price since entry (highest bid for longs, lowest ask for shorts). */
  trailAnchor: number;
  funding: number;
  lastFundingDay: number;
  entryReason?: string;
}

export interface LogLine {
  time: number;
  message: string;
}

/** Serializable run state for the arena to persist and resume. */
type PendingCommand = { due: number; at: number; barCloseTime?: number } & (
  | { kind: 'open'; side: Side; opts: OrderOptions }
  | { kind: 'close'; reason?: string; exitReason?: ExitReason }
  | { kind: 'stops'; update: StopUpdate }
);
export interface ExecutionStats {
  submitted: number;
  filled: number;
  rejected: number;
  totalDelayMs: number;
  maxDelayMs: number;
}

export interface RunSnapshot {
  balance: number;
  position: OpenPosition | null;
  state: unknown;
  peakEquity: number;
  maxDrawdown: number;
  minutesTotal: number;
  minutesInPosition: number;
  startTime: number;
  lastTime: number;
  errors: number;
  status: RunStatus;
  rngState: number;
  pending?: PendingCommand[];
  executionStats?: ExecutionStats;
  openAttempts?: number[];
  lastTick?: Tick;
}

export class AgentRun {
  readonly runId: string;
  readonly agentId: string;
  readonly agent: DefinedAgent;
  readonly params: Record<string, unknown>;
  readonly instrument: Instrument;
  /** Account leverage tier. */
  readonly leverage: number;
  /** Leverage on this instrument (the tier, capped per asset class). */
  readonly effectiveLeverage: number;
  private readonly marginFactor: number;
  private readonly fundingFree: boolean;
  private readonly instrumentInfo: InstrumentInfo;
  readonly capital: number;
  readonly primary: BarSeries;
  readonly extra: ReadonlyMap<Timeframe, BarSeries>;
  readonly warmup: number;
  private readonly checkStopsOnCandles: boolean;
  private readonly onEvent?: (event: RunEvent) => void;

  balance: number;
  position: OpenPosition | null = null;
  readonly trades: Trade[] = [];
  readonly equity: EquityPoint[] = [];
  readonly logs: LogLine[] = [];
  state: Record<string, unknown>;
  status: RunStatus = RUN_STATUS.RUNNING;
  errors = 0;
  /** False while the arena replays history to warm an agent up. */
  allowOrders = true;
  /** Set by the engine before onBar when the agent declared `forecast`. */
  forecast: Forecast | null = null;

  private quote: Quote | null = null;
  private tick: Tick | null = null;
  private readonly tickHistory: readonly Tick[];
  private readonly execution?: LiveExecution;
  private replayTime:number|null=null;
  private pending: PendingCommand[] = [];
  private openAttempts: number[] = [];
  private executing = false;
  private decisionTime: number | undefined;
  private barCloseTime: number | undefined;
  executionStats: ExecutionStats = {
    submitted: 0,
    filled: 0,
    rejected: 0,
    totalDelayMs: 0,
    maxDelayMs: 0,
  };
  get pendingOrders(): number {
    return this.pending.length;
  }
  private now(): number {
    return this.replayTime ?? this.execution?.now?.() ?? Date.now();
  }
  private peakEquity: number;
  private maxDrawdown = 0;
  private minutesTotal = 0;
  private minutesInPosition = 0;
  private startTime = 0;
  private lastTime = 0;
  private rngState: number;
  private currentBar: Bar | null = null;
  private inFill = false;
  private riskChanged?: () => void;
  bindRisk(changed: () => void): void { this.riskChanged = changed; }
  /** Total agent time in onBar, for the performance check. */
  agentMs = 0;
  barsSeen = 0;
  agentTickMs = 0;
  ticksSeen = 0;

  constructor(opts: RunOptions) {
    this.execution = opts.execution;
    this.tickHistory = opts.tickHistory ?? [];
    this.runId = opts.runId;
    this.agentId = opts.agentId;
    this.agent = opts.agent;
    this.params = opts.params;
    this.instrument = opts.instrument;
    this.leverage = opts.leverage;
    this.effectiveLeverage = effectiveLeverage(opts.instrument, opts.leverage);
    this.marginFactor = 1 / this.effectiveLeverage;
    this.fundingFree = isFundingFree(opts.instrument, opts.leverage);
    const i = opts.instrument;
    this.instrumentInfo = {
      epic: i.epic,
      name: i.name,
      assetClass: i.assetClass,
      pricePrecision: i.pricePrecision,
      minSize: i.minSize,
      sizeStep: i.sizeStep,
      maxSize: i.maxSize,
      marginFactor: this.marginFactor,
      typicalSpread: i.typicalSpread,
    };
    this.capital = opts.capital;
    this.primary = opts.primary;
    this.extra = opts.extra;
    this.checkStopsOnCandles = opts.checkStopsOnCandles;
    this.onEvent = opts.onEvent;
    this.balance = opts.capital;
    this.peakEquity = opts.capital;
    this.warmup = opts.agent.warmup ?? DEFAULT_WARMUP;
    this.rngState = hashString(opts.runId);
    this.state = (opts.agent.init ? opts.agent.init(opts.params as never) : {}) as Record<string, unknown>;
  }

  // ------------------------------------------------------------------ driving

  /** One 1-minute candle of this instrument (before it is pushed into the series). */
  onCandle(c: Candle, fromTicks = false): void {
    if(fromTicks && c.time+60_000<=this.lastTime)return;
    this.riskChanged?.();
    if (this.startTime === 0) this.startTime = c.time;
    this.lastTime = c.time + 60_000;
    const precision = this.instrument.pricePrecision;
    const spread = roundTo(c.spread > 0 ? c.spread : this.instrument.typicalSpread, precision);
    // Live runs may already hold a newer tick quote; never move the quote backwards.
    if (!fromTicks && !this.execution && (!this.quote || this.quote.time <= c.time + 60_000)) {
      this.quote = {
        bid: c.close,
        ask: roundTo(c.close + spread, precision),
        time: c.time + 60_000,
      };
    }

    // A missing historical deadline minute must not expose the trade to the next candle's range.
    if (!fromTicks && !this.execution && this.position?.closeAt !== undefined && c.time >= this.position.closeAt) {
      this.accrueFunding(c.time, c.open);
      const price = c.open + (this.position.side === SIDE_SHORT ? spread : 0);
      this.closePosition(EXIT_REASON.SESSION_END, price, c.time, `${SCHEDULED_EXIT_NOTE}: first quote after data gap`);
    }
    if (this.position && !fromTicks) {
      this.accrueFunding(c.time, c.close);
      // Only minutes that started after the entry can hit its stops.
      if (this.checkStopsOnCandles && c.time >= this.position.entryTime) this.checkStopsOnCandle(c, spread);
      if (this.position && this.agent.intradayOnly && isSessionEnd(c.time)) {
        if (this.execution) this.closeByAgent(undefined, EXIT_REASON.SESSION_END);
        else this.closePosition(EXIT_REASON.SESSION_END, this.exitPrice(this.position.side), c.time + 60_000);
      }
      if (this.position?.closeAt !== undefined && c.time + 60_000 >= this.position.closeAt) {
        if (this.execution) this.closeByAgent(SCHEDULED_EXIT_NOTE, EXIT_REASON.SESSION_END);
        else this.closePosition(EXIT_REASON.SESSION_END, this.exitPrice(this.position.side), c.time + 60_000, SCHEDULED_EXIT_NOTE);
      }
    }

    // Equity, drawdown (at the candle's adverse extreme), exposure.
    const pos = this.position;
    let adverse = this.balance;
    if (pos && c.time >= pos.entryTime) {
      if (!fromTicks) adverse =
        pos.side === SIDE_LONG
          ? this.balance + (c.low - pos.entryPrice) * pos.size
          : this.balance + (pos.entryPrice - (c.high + spread)) * pos.size;
      this.minutesInPosition++;
    }
    this.minutesTotal++;
    const eq = this.markToMarket();
    if(fromTicks)adverse=eq; // The observed tick path already recorded intraminute drawdown.
    if (eq > this.peakEquity) this.peakEquity = eq;
    if (this.peakEquity > 0) {
      const dd = (this.peakEquity - Math.min(eq, adverse)) / this.peakEquity;
      if (dd > this.maxDrawdown) this.maxDrawdown = Math.min(dd, 1);
    }
    this.recordEquity(c.time, eq);
  }

  /**
   * After a restart: price the position from the latest stored candle until live data arrives, so the
   * equity saved at start is not just the cash balance.
   */
  primeQuote(c: Candle): void {
    if (this.quote) return;
    const spread = roundTo(c.spread > 0 ? c.spread : this.instrument.typicalSpread, this.instrument.pricePrecision);
    this.quote = {
      bid: c.close,
      ask: roundTo(c.close + spread, this.instrument.pricePrecision),
      time: c.time + 60_000,
    };
  }

  /** Live quote (arena only): stops and margin at tick precision. */
  onTick(q: Quote, dispatchAgent = true, risk?: Float64Array, riskOffset = 0): void {
    // lastTime tracks candles only (it is the resume point after a restart).
    if (this.execution && (q.time > this.now() + 1000 || this.now() - q.time > QUOTE_MAX_AGE_MS)) { this.riskChanged?.(); return; }
    if (!Number.isFinite(q.bid) || !Number.isFinite(q.ask) || q.bid <= 0 || q.ask < q.bid || (this.quote && q.time < this.quote.time))
      { this.riskChanged?.(); return; }
    if(q.journalId!==undefined && q.journalId===this.tick?.journalId && q.sequence!==undefined && this.tick?.sequence!==undefined && q.sequence<=this.tick.sequence){ this.riskChanged?.(); return; }
    this.quote = q;
    this.tick = q.source !== undefined && q.receivedAt !== undefined ? q as Tick : {...q,receivedAt:q.receivedAt??q.time,source:q.source??TICK_SOURCE.SYNTHETIC};
    if (this.startTime === 0) this.startTime = this.tick.receivedAt;
    this.flushPending();
    this.checkTickProtections(this.tick, risk, riskOffset);
    if (dispatchAgent) this.dispatchTick();
  }

  /** Recover the unpersisted journal tail with an historical clock. Broker events are suppressed by the arena until ready. */
  catchUpTick(q:Tick):void {
    this.replayTime=q.receivedAt;
    try{this.onTick(q);}finally{this.replayTime=null;}
  }

  /** Exceptional paths retain the reference implementation and its exact event ordering. */
  writeRisk(out: Float64Array, offset: number, q: Tick, day: number): boolean {
    const p = this.position;
    if (!p || this.status !== RUN_STATUS.RUNNING || this.pending.length ||
      p.closeAt !== undefined || this.agent.intradayOnly || day > p.lastFundingDay) return false;
    out[offset] = p.side === SIDE_LONG ? 1 : -1;
    out[offset + 1] = p.size;
    out[offset + 2] = p.entryPrice;
    out[offset + 3] = this.balance;
    out[offset + 4] = this.peakEquity;
    out[offset + 5] = this.maxDrawdown;
    out[offset + 6] = p.stopLoss ?? NaN;
    out[offset + 7] = p.trailingStop ?? NaN;
    out[offset + 8] = p.takeProfit ?? NaN;
    out[offset + 9] = p.trailAnchor;
    out[offset + 10] = this.marginFactor;
    return true;
  }

  private checkTickProtections(q: Tick, risk?: Float64Array, offset = 0): void {
    const pos = this.position;
    if (!pos || this.status !== RUN_STATUS.RUNNING) return;
    if (risk && risk[offset]! >= 0) {
      this.peakEquity = risk[offset + 1]!;
      this.maxDrawdown = risk[offset + 2]!;
      const reason = NATIVE_EXIT_REASON[risk[offset]! - 1];
      if (reason) return this.closePosition(reason, this.exitPrice(pos.side), q.receivedAt);
      pos.trailAnchor = risk[offset + 3]!;
      return;
    }
    this.riskChanged?.();
    this.accrueFunding(q.receivedAt, q.bid);
    const tickEquity = this.markToMarket();
    this.peakEquity = Math.max(this.peakEquity, tickEquity);
    if (this.peakEquity > 0) this.maxDrawdown = Math.min(1, Math.max(this.maxDrawdown, (this.peakEquity - tickEquity) / this.peakEquity));
    const exitPx = this.exitPrice(pos.side);
    if (pos.closeAt !== undefined && q.receivedAt >= pos.closeAt) {
      if(this.execution) this.closeByAgent(SCHEDULED_EXIT_NOTE,EXIT_REASON.SESSION_END);
      else return this.closePosition(EXIT_REASON.SESSION_END,exitPx,q.receivedAt,SCHEDULED_EXIT_NOTE);
      if (!this.position) return;
    }
    // The common no-hit path must not allocate an object for every open position/tick.
    const trail = pos.trailingStop === null ? null
      : pos.side === SIDE_LONG ? pos.trailAnchor - pos.trailingStop : pos.trailAnchor + pos.trailingStop;
    const useTrail = trail !== null && (pos.stopLoss === null || (pos.side === SIDE_LONG ? trail > pos.stopLoss : trail < pos.stopLoss));
    const stopPrice = useTrail ? trail : pos.stopLoss;
    if (stopPrice !== null) {
      const hit = pos.side === SIDE_LONG ? exitPx <= stopPrice : exitPx >= stopPrice;
      if (hit) return this.closePosition(useTrail ? EXIT_REASON.TRAILING_STOP : EXIT_REASON.STOP_LOSS, exitPx, q.receivedAt);
    }
    if (pos.takeProfit !== null) {
      const hit = pos.side === SIDE_LONG ? exitPx >= pos.takeProfit : exitPx <= pos.takeProfit;
      if (hit) return this.closePosition(EXIT_REASON.TAKE_PROFIT, exitPx, q.receivedAt);
    }
    if (this.marginBreached(exitPx)) return this.closePosition(EXIT_REASON.MARGIN_CALL, exitPx, q.receivedAt);
    this.updateTrailAnchor(pos, exitPx);
    if (this.agent.intradayOnly && isSessionEnd(q.time)) this.closeByAgent(undefined, EXIT_REASON.SESSION_END);
  }

  /** Separate from account checks so bar callbacks and tick callbacks see one consistent market event. */
  dispatchTick(expected?: Tick): void {
    if (!this.tick || (expected && this.tick!==expected) || !this.agent.onTick || this.status !== RUN_STATUS.RUNNING) return;
    const started=performance.now();
    try {this.agent.onTick(this.makeContext(this.currentBar??this.primary.last??null,this.tick.receivedAt) as never);}
    catch(e){this.handleAgentError(e,this.tick.receivedAt);}
    this.agentTickMs+=performance.now()-started;
    this.ticksSeen++;
  }

  onClock(time: number): void {
    if (!this.position || !this.quote || this.status !== RUN_STATUS.RUNNING) return;
    if (!this.execution && time > (this.quote.receivedAt??this.quote.time)) return;
    this.accrueFunding(time, this.quote.bid);
    if (this.position.closeAt !== undefined && time >= this.position.closeAt)
      this.closeByAgent(SCHEDULED_EXIT_NOTE, EXIT_REASON.SESSION_END);
    if (this.agent.intradayOnly && isSessionEnd(time)) this.closeByAgent(undefined, EXIT_REASON.SESSION_END);
  }

  /** A primary-timeframe bar closed: let the agent decide. */
  onBar(bar: Bar): void {
    if (this.status !== RUN_STATUS.RUNNING) return;
    this.currentBar = bar;
    this.barsSeen++;
    const ctx = this.makeContext(bar);
    const started = performance.now();
    try {
      this.agent.onBar?.(ctx as never);
    } catch (err) {
      this.handleAgentError(err, bar.time+this.primary.tfMs);
    }
    this.agentMs += performance.now() - started;
  }

  /** Close everything at the end of a backtest. */
  finish(time: number): void {
    if (this.position && this.quote) {
      this.closePosition(EXIT_REASON.END_OF_DATA, this.exitPrice(this.position.side), time);
    }
    if (this.status === RUN_STATUS.RUNNING) this.status = RUN_STATUS.COMPLETED;
  }

  /** Stop a live run, closing its position at the current quote. */
  stop(reason: ExitReason = EXIT_REASON.STOPPED): void {
    if (this.position && this.quote) this.closePosition(reason, this.exitPrice(this.position.side), this.quote.time);
    this.pending = [];
    this.status = RUN_STATUS.STOPPED;
  }

  metrics(): RunMetrics {
    return computeMetrics({
      trades: this.trades,
      equity: this.equity,
      initialCapital: this.capital,
      finalEquity: this.markToMarket(),
      startTime: this.startTime,
      endTime: Math.max(this.lastTime,this.tick?.receivedAt??0),
      maxDrawdown: this.maxDrawdown,
      exposure: this.minutesTotal > 0 ? this.minutesInPosition / this.minutesTotal : 0,
    });
  }

  /** Mark history up to `time` as seen (arena warm-up), so a restart resumes after it. */
  markSynced(time: number): void {
    if (time > this.lastTime) this.lastTime = time;
    // A brand-new run's track record starts when warm-up ends.
    if (this.startTime === 0) this.startTime = time;
  }

  markToMarket(): number {
    const pos = this.position;
    if (!pos || !this.quote) return this.balance;
    return this.balance + this.unrealized(pos);
  }

  get lastQuote(): Quote | null {
    return this.quote;
  }

  snapshot(): RunSnapshot {
    if (this.position) this.holdingBars(this.position);
    return {
      balance: this.balance,
      position: this.position ? { ...this.position } : null,
      state: this.state,
      peakEquity: this.peakEquity,
      maxDrawdown: this.maxDrawdown,
      minutesTotal: this.minutesTotal,
      minutesInPosition: this.minutesInPosition,
      startTime: this.startTime,
      lastTime: this.lastTime,
      errors: this.errors,
      status: this.status,
      rngState: this.rngState,
      pending: this.pending.map(p => structuredClone(p)),
      executionStats: { ...this.executionStats },
      openAttempts: [...this.openAttempts],
      lastTick: this.tick ? {...this.tick} : undefined,
    };
  }

  restore(s: RunSnapshot, trades: Trade[], equity: EquityPoint[]): void {
    this.riskChanged?.();
    this.balance = s.balance;
    this.position = s.position ? { ...s.position } : null;
    if (this.position) this.position.heldCount = undefined;
    this.state = (s.state ?? {}) as Record<string, unknown>;
    this.peakEquity = s.peakEquity;
    this.maxDrawdown = s.maxDrawdown;
    this.minutesTotal = s.minutesTotal;
    this.minutesInPosition = s.minutesInPosition;
    this.startTime = s.startTime;
    this.lastTime = s.lastTime;
    this.errors = s.errors;
    this.status = s.status;
    this.tick = s.lastTick ?? null;
    if(this.tick)this.quote=this.tick;
    this.rngState = s.rngState;
    this.pending = structuredClone(s.pending ?? []);
    if (this.execution?.gateway)
      for (const p of this.pending) this.execution.gateway.nextSlot = Math.max(this.execution.gateway.nextSlot, p.due);
    this.executionStats = { ...(s.executionStats ?? this.executionStats) };
    this.openAttempts = (s.openAttempts ?? [...trades.map(t => t.entryTime), ...(s.position ? [s.position.entryTime] : []), ...(s.pending ?? []).filter(p => p.kind === 'open').map(p => p.at)]).filter(t => this.now() - t < 3_600_000);
    if (this.execution?.gateway) for (const time of this.openAttempts) this.execution.gateway.observeOpen(this.runId, time, this.now());
    this.trades.push(...trades);
    this.equity.push(...equity);
  }

  private reject(reason: string): void {
    this.executionStats.rejected++;
    this.log(this.execution ? this.now() : (this.quote?.time ?? 0), `order rejected: ${reason}`);
  }

  private enqueueCommand(command: PendingCommand): void {
    this.riskChanged?.();
    if (this.pending.length >= 8) return this.reject('too many pending commands');
    const slot = this.execution?.gateway?.reserve(this.runId, this.leverage, command.kind, command.at);
    if (typeof slot === 'string') return this.reject(slot);
    if (command.kind === 'open') this.openAttempts = [...this.openAttempts.filter(t => command.at - t < 3_600_000), command.at];
    if (slot !== undefined) command.due = Math.max(command.due, slot + this.execution!.latencyMs);
    if (command.kind === 'open' && this.currentBar) command.barCloseTime = this.currentBar.time + this.primary.tfMs;
    this.executionStats.submitted++;
    this.pending.push(command);
  }

  private flushPending(): void {
    if (!this.pending.length || !this.execution || !this.quote || this.execution.venue.problem(this.now(), this.quote.time)) return;
    this.riskChanged?.();
    while (this.pending[0] && this.pending[0].due <= this.now()) {
      const command = this.pending.shift()!;
      if (command.kind === 'open' && this.now() - command.at > Math.max(120_000, this.execution.latencyMs + QUOTE_MAX_AGE_MS)) {
        this.reject('open expired before a fresh executable quote');
        continue;
      }
      this.executing = true;
      this.decisionTime = command.at;
      this.barCloseTime = command.barCloseTime;
      try {
        const before = this.position;
        const rejected = this.executionStats.rejected;
        if (command.kind === 'open') this.open(command.side, command.opts);
        else if (command.kind === 'close') this.closeByAgent(command.reason, command.exitReason);
        else this.setStops(command.update);
        const changed =
          command.kind === 'stops' ? this.executionStats.rejected === rejected && this.position !== null : before !== this.position;
        if (!changed) continue;
        this.executionStats.filled++;
        const delay = this.now() - command.at;
        this.executionStats.totalDelayMs += delay;
        this.executionStats.maxDelayMs = Math.max(this.executionStats.maxDelayMs, delay);
      } finally {
        this.executing = false;
        this.decisionTime = undefined;
        this.barCloseTime = undefined;
      }
    }
  }

  // ------------------------------------------------------------------ orders

  private open(side: Side, opts: OrderOptions = {}): void {
    if (!this.canTrade('open')) return;
    if(this.execution?.entryAllowed && !this.execution.entryAllowed())return this.reject('tick recording unavailable; new entries paused');
    const time = this.execution ? this.now() : (this.quote!.receivedAt??this.quote!.time);
    if (opts.validUntil !== undefined && (!Number.isFinite(opts.validUntil) || time >= opts.validUntil))
      return this.reject('entry validity deadline expired or invalid');
    if (opts.closeAt !== undefined && (!Number.isFinite(opts.closeAt) || time >= opts.closeAt))
      return this.reject('scheduled exit deadline expired or invalid');
    if (this.execution && !this.executing) {
      if (this.position?.side === side) return;
      if (this.pending.some(p => p.kind === 'open')) return;
      const entry = side === SIDE_LONG ? this.quote!.ask : this.quote!.bid;
      const size = this.sizeOrder(side, entry, opts);
      if (typeof size === 'string') return this.reject(size);
      const problem = this.execution.venue.stopsProblem(side, this.quote!.bid, this.quote!.ask, opts);
      if (problem) return this.reject(problem);
      this.enqueueCommand({
        kind: 'open',
        side,
        opts: { ...opts, size },
        at: time,
        due: time + this.execution.latencyMs,
      });
      return;
    }
    if (this.agent.intradayOnly && isSessionBlackout(time)) {
      this.log(time, `order ignored: ${side} during the daily session break window`);
      return;
    }
    if (this.position) {
      if (this.position.side === side) return;
      this.closePosition(EXIT_REASON.REVERSE, this.exitPrice(this.position.side), time, opts.reason);
      if (this.status !== RUN_STATUS.RUNNING) return;
    }
    const entry = side === SIDE_LONG ? this.quote!.ask : this.quote!.bid;
    const problem = validateStops(side, entry, opts) ?? this.execution?.venue.stopsProblem(side, this.quote!.bid, this.quote!.ask, opts);
    if (problem) {
      this.reject(problem);
      return;
    }
    const size = this.execution && this.executing && opts.size !== undefined ? opts.size : this.sizeOrder(side, entry, opts);
    if (typeof size === 'string') {
      this.reject(size);
      return;
    }
    if (
      this.execution &&
      (size * entry * this.marginFactor > this.balance - (this.quote!.ask - this.quote!.bid) * size ||
        size < this.instrument.minSize ||
        size > this.instrument.maxSize)
    ) {
      this.reject('insufficient margin or changed size limits at execution');
      return;
    }
    this.position = {
      closeAt: opts.closeAt,
      validUntil: opts.validUntil,
      side,
      size,
      entryPrice: entry,
      entryTime: time,
      entryBarCount: this.primary.closedCount,
      heldBars: 0,
      heldThrough: time,
      heldCount: this.primary.closedCount,
      stopLoss: opts.stopLoss ?? null,
      takeProfit: opts.takeProfit ?? null,
      trailingStop: opts.trailingStop ?? null,
      trailAnchor: side === SIDE_LONG ? this.quote!.bid : this.quote!.ask,
      funding: 0,
      lastFundingDay: fundingDay(time),
      entryReason: opts.reason,
    };
    this.riskChanged?.();
    this.emit({
      type: 'open',
      decisionTime: this.decisionTime,
      barCloseTime: this.barCloseTime,
      runId: this.runId,
      side,
      size,
      price: entry,
      time,
      stopLoss: this.position.stopLoss,
      takeProfit: this.position.takeProfit,
      trailingStop: this.position.trailingStop,
    });
    this.notifyFill({ kind: 'open', side, size, price: entry, time });
  }

  private closeByAgent(reason?: string, exitReason: ExitReason = EXIT_REASON.SIGNAL): void {
    if (this.execution && !this.executing && this.allowOrders) {
      this.pending = this.pending.filter(p => p.kind !== 'open');
      if (this.position && !this.pending.some(p => p.kind === 'close'))
        this.enqueueCommand({
          kind: 'close',
          reason,
          exitReason,
          at: this.now(),
          due: this.now() + this.execution.latencyMs,
        });
      return;
    }
    if (!this.position || !this.canTrade('close')) return;
    this.closePosition(exitReason, this.exitPrice(this.position.side), this.quote!.receivedAt??this.quote!.time, reason);
  }

  private setStops(update: StopUpdate): void {
    this.riskChanged?.();
    const pos = this.position;
    if (!pos || !this.canTrade('setStops')) return;
    if (this.execution && !this.executing) {
      this.enqueueCommand({
        kind: 'stops',
        update: { ...update },
        at: this.now(),
        due: this.now() + this.execution.latencyMs,
      });
      return;
    }
    const next = {
      stopLoss: update.stopLoss === undefined ? pos.stopLoss : update.stopLoss,
      takeProfit: update.takeProfit === undefined ? pos.takeProfit : update.takeProfit,
      trailingStop: update.trailingStop === undefined ? pos.trailingStop : update.trailingStop,
    };
    const ref = this.exitPrice(pos.side);
    const stopOpts = {
      stopLoss: next.stopLoss ?? undefined,
      takeProfit: next.takeProfit ?? undefined,
      trailingStop: next.trailingStop ?? undefined,
    };
    const problem =
      validateStops(pos.side, ref, stopOpts) ?? this.execution?.venue.stopsProblem(pos.side, this.quote!.bid, this.quote!.ask, stopOpts);
    if (problem) {
      this.reject(`setStops: ${problem}`);
      return;
    }
    pos.stopLoss = next.stopLoss;
    pos.takeProfit = next.takeProfit;
    if (next.trailingStop !== pos.trailingStop) pos.trailAnchor = ref;
    pos.trailingStop = next.trailingStop;
    this.emit({
      type: 'stops',
      runId: this.runId,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      trailingStop: pos.trailingStop,
    });
  }

  private canTrade(action: string): boolean {
    if (this.status !== RUN_STATUS.RUNNING || !this.quote) return false;
    if (!this.allowOrders || this.primary.closedCount < this.warmup) return false;
    if (this.execution && this.execution.venue.problem(this.now(), this.quote.time)) {
      if (action === 'open') this.reject(this.execution.venue.problem(this.now(), this.quote.time)!);
      return false;
    }
    if (this.balance <= 0 && action === 'open') {
      this.log(this.quote.time, `${action} ignored: account is empty`);
      return false;
    }
    return true;
  }

  private sizeOrder(side: Side, entry: number, opts: OrderOptions): number | string {
    const inst = this.instrument;
    for (const [key, value] of Object.entries(opts))
      if (typeof value === 'number' && !Number.isFinite(value)) return `${key} must be finite`;
    const equity = this.markToMarket();
    let stopDistance: number | null = null;
    if (opts.stopLoss !== undefined) stopDistance = Math.abs(entry - opts.stopLoss);
    else if (opts.trailingStop !== undefined) stopDistance = opts.trailingStop;

    // Precedence: explicit size, exposure, margin share, risk-to-stop, then 1x exposure.
    let size: number;
    if (opts.size !== undefined) {
      if (!(opts.size > 0)) return `size must be positive, got ${opts.size}`;
      size = opts.size;
    } else if (opts.exposure === undefined && opts.marginPct !== undefined) {
      if (!(opts.marginPct > 0)) return `marginPct must be positive, got ${opts.marginPct}`;
      size = (equity * (opts.marginPct / 100) * this.effectiveLeverage) / entry;
    } else if (opts.exposure === undefined && stopDistance !== null && stopDistance > 0) {
      const risk = clamp(opts.riskPct ?? DEFAULT_RISK_PCT, 0, MAX_RISK_PCT);
      size = (equity * risk) / 100 / stopDistance;
    } else {
      const exposure = opts.exposure ?? DEFAULT_EXPOSURE;
      if (!(exposure > 0)) return `exposure must be positive, got ${exposure}`;
      size = (equity * exposure) / entry;
    }
    const maxByMargin = (equity * MAX_MARGIN_USE) / (entry * this.marginFactor);
    size = Math.min(size, maxByMargin, inst.maxSize);
    size = Math.floor(size / inst.sizeStep + SIZE_EPSILON) * inst.sizeStep;
    size = roundTo(size, decimalsOf(inst.sizeStep));
    if (!Number.isFinite(size)) return `size must be finite`;
    if (size < inst.minSize) {
      return `size ${size} below the ${inst.epic} minimum of ${inst.minSize} (equity ${equity.toFixed(2)}, side ${side})`;
    }
    return size;
  }

  private closePosition(reason: ExitReason, price: number, time: number, note?: string): void {
    this.riskChanged?.();
    const pos = this.position;
    if (!pos) return;
    const px = roundTo(price, this.instrument.pricePrecision);
    const rawGross = pos.side === SIDE_LONG ? (px - pos.entryPrice) * pos.size : (pos.entryPrice - px) * pos.size;
    const gross = Math.max(rawGross, -this.balance);
    const trade: Trade = {
      side: pos.side,
      size: pos.size,
      entryTime: pos.entryTime,
      entryPrice: pos.entryPrice,
      exitTime: time,
      exitPrice: px,
      pnl: roundTo(gross + pos.funding, 4),
      funding: roundTo(pos.funding, 4),
      exitReason: reason,
      entryReason: pos.entryReason,
      exitNote: note,
      barsHeld: this.holdingBars(pos),
      ...(pos.barsHeldPartial ? {barsHeldPartial:true} : {}),
    };
    // Funding was already debited from the balance as it accrued.
    this.balance += gross;
    this.position = null;
    this.pending = this.pending.filter(p => p.kind === 'open');
    if (this.balance <= 0) {
      // Capital.com negative-balance protection: the account floors at zero.
      this.balance = 0;
      this.status = RUN_STATUS.BUSTED;
    }
    this.trades.push(trade);
    this.emit({ type: 'close', runId: this.runId, trade });
    this.notifyFill({
      kind: 'close',
      side: pos.side,
      size: pos.size,
      price: px,
      time,
      trade,
    });
  }

  // ------------------------------------------------------------------ risk checks

  private checkStopsOnCandle(c: Candle, spread: number): void {
    const pos = this.position!;
    const time = c.time + 60_000;
    // Exit-side prices: longs exit at bid, shorts buy back at ask.
    const precision = this.instrument.pricePrecision;
    const o = pos.side === SIDE_LONG ? c.open : roundTo(c.open + spread, precision);
    const h = pos.side === SIDE_LONG ? c.high : roundTo(c.high + spread, precision);
    const l = pos.side === SIDE_LONG ? c.low : roundTo(c.low + spread, precision);
    const adverse = pos.side === SIDE_LONG ? l : h;
    const favorable = pos.side === SIDE_LONG ? h : l;

    const stop = this.effectiveStop(pos);
    if (stop) {
      const gapped = pos.side === SIDE_LONG ? o <= stop.price : o >= stop.price;
      const touched = pos.side === SIDE_LONG ? l <= stop.price : h >= stop.price;
      if (gapped) return this.closePosition(stop.reason, o, time);
      if (touched) return this.closePosition(stop.reason, stop.price, time);
    }
    if (pos.takeProfit !== null) {
      const gapped = pos.side === SIDE_LONG ? o >= pos.takeProfit : o <= pos.takeProfit;
      const touched = pos.side === SIDE_LONG ? h >= pos.takeProfit : l <= pos.takeProfit;
      if (gapped) return this.closePosition(EXIT_REASON.TAKE_PROFIT, o, time);
      if (touched) return this.closePosition(EXIT_REASON.TAKE_PROFIT, pos.takeProfit, time);
    }
    if (this.marginBreached(adverse)) return this.closePosition(EXIT_REASON.MARGIN_CALL, adverse, time);
    this.updateTrailAnchor(pos, favorable);
  }

  private effectiveStop(pos: OpenPosition): { price: number; reason: ExitReason } | null {
    const trail =
      pos.trailingStop !== null ? (pos.side === SIDE_LONG ? pos.trailAnchor - pos.trailingStop : pos.trailAnchor + pos.trailingStop) : null;
    if (pos.stopLoss === null && trail === null) return null;
    if (trail === null) return { price: pos.stopLoss!, reason: EXIT_REASON.STOP_LOSS };
    if (pos.stopLoss === null) return { price: trail, reason: EXIT_REASON.TRAILING_STOP };
    const trailTighter = pos.side === SIDE_LONG ? trail > pos.stopLoss : trail < pos.stopLoss;
    return trailTighter ? { price: trail, reason: EXIT_REASON.TRAILING_STOP } : { price: pos.stopLoss, reason: EXIT_REASON.STOP_LOSS };
  }

  private updateTrailAnchor(pos: OpenPosition, price: number): void {
    if (pos.side === SIDE_LONG ? price > pos.trailAnchor : price < pos.trailAnchor) pos.trailAnchor = price;
  }

  private marginBreached(exitPrice: number): boolean {
    const pos = this.position!;
    const margin = pos.size * exitPrice * this.marginFactor;
    const pnl = pos.side === SIDE_LONG ? (exitPrice - pos.entryPrice) * pos.size : (pos.entryPrice - exitPrice) * pos.size;
    return this.balance + pnl < MARGIN_CLOSE_OUT * margin;
  }

  private accrueFunding(time: number, price: number): void {
    const pos = this.position!;
    const day = fundingDay(time);
    if (day <= pos.lastFundingDay) return;
    let nights = 0;
    for (let d = pos.lastFundingDay + 1; d <= day; d++) {
      const weekday = new Date(d * DAY_MS).getUTCDay();
      nights += this.instrument.weekendTripleSwap ? (weekday === 5 ? 3 : weekday === 6 || weekday === 0 ? 0 : 1) : 1;
    }
    pos.lastFundingDay = day;
    this.riskChanged?.();
    if (this.fundingFree) return;
    const ratePct = pos.side === SIDE_LONG ? this.instrument.overnightLongPct : this.instrument.overnightShortPct;
    const amount = pos.size * price * (ratePct / 100) * nights;
    pos.funding += amount;
    this.balance += amount;
  }

  // ------------------------------------------------------------------ helpers

  private exitPrice(side: Side): number {
    return side === SIDE_LONG ? this.quote!.bid : this.quote!.ask;
  }

  private unrealized(pos: OpenPosition): number {
    const px = this.exitPrice(pos.side);
    return pos.side === SIDE_LONG ? (px - pos.entryPrice) * pos.size : (pos.entryPrice - px) * pos.size;
  }

  private recordEquity(time: number, equity: number): void {
    const day = utcDay(time) * DAY_MS;
    const last = this.equity[this.equity.length - 1];
    if (last && last.t === day) last.equity = roundTo(equity, 2);
    else this.equity.push({ t: day, equity: roundTo(equity, 2) });
  }

  private handleAgentError(err: unknown, time: number): void {
    this.errors++;
    const message = err instanceof Error ? `${err.message}\n${(err.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(err);
    this.emit({ type: 'error', runId: this.runId, time, message });
    this.pushLog(time, `ERROR: ${message}`);
    if (this.errors >= MAX_AGENT_ERRORS) {
      if (this.position && this.quote) this.closePosition(EXIT_REASON.AGENT_ERROR, this.exitPrice(this.position.side), time);
      this.status = RUN_STATUS.ERROR;
    }
  }

  private notifyFill(fill: Fill): void {
    if (!this.agent.onFill || this.inFill) return;
    this.inFill = true;
    try {
      this.agent.onFill(this.makeContext(this.currentBar??this.primary.last??null,fill.time) as never, fill);
    } catch (err) {
      this.handleAgentError(err, fill.time);
    } finally {
      this.inFill = false;
    }
  }

  private log(time: number, message: string): void {
    this.pushLog(time, message);
    this.emit({ type: 'log', runId: this.runId, time, message });
  }

  private pushLog(time: number, message: string): void {
    this.logs.push({ time, message });
    if (this.logs.length > MAX_LOG_LINES) this.logs.splice(0, this.logs.length - MAX_LOG_LINES);
  }

  private emit(event: RunEvent): void {
    this.onEvent?.(event);
  }

  private random(): number {
    // mulberry32
    let t = (this.rngState = (this.rngState + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private publicPosition(): Position | null {
    const pos = this.position;
    if (!pos) return null;
    return {
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      entryTime: pos.entryTime,
      barsHeld: this.holdingBars(pos),
      ...(pos.barsHeldPartial ? {barsHeldPartial:true} : {}),
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      trailingStop: pos.trailingStop,
      unrealizedPnl: this.quote ? roundTo(this.unrealized(pos), 4) : 0,
      closeAt: pos.closeAt,
      validUntil: pos.validUntil,
    };
  }

  private holdingBars(pos: OpenPosition): number {
    if (pos.heldCount !== undefined) {
      pos.heldBars = (pos.heldBars ?? 0) + Math.max(0, this.primary.closedCount - pos.heldCount);
    } else {
      // Restored runs wait while shared series warm up. Rebase only once history reaches the saved cursor.
      const bars = this.primary.bars;
      const through = pos.heldThrough ?? pos.entryTime;
      const last = bars.at(-1);
      if (!last || this.primary.closeTime(last) < through) return pos.heldBars ?? 0;
      let low = 0, high = bars.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (this.primary.closeTime(bars[mid]!) <= through) low = mid + 1;
        else high = mid;
      }
      if (bars[0]!.time > through && !pos.barsHeldPartial) {
        pos.barsHeldPartial = true;
        this.log(this.lastTime, 'holding-bar recovery is a lower bound: earlier bars are outside retained history');
      }
      pos.heldBars = (pos.heldBars ?? 0) + bars.length - low;
    }
    pos.heldCount = this.primary.closedCount;
    pos.heldThrough = Math.max(pos.heldThrough ?? pos.entryTime, this.primary.last ? this.primary.closeTime(this.primary.last) : pos.entryTime);
    return pos.heldBars ?? 0;
  }

  private makeContext(bar: Bar | null, eventTime?: number): AgentContext {
    const run = this;
    const time = eventTime ?? (bar ? bar.time + this.primary.tfMs : this.tick?.receivedAt??0);
    const isWarmup = !this.allowOrders || this.primary.closedCount < this.warmup;
    return {
      epic: this.instrument.epic,
      instrument: this.instrumentInfo,
      leverage: this.effectiveLeverage,
      timeframe: this.primary.timeframe,
      params: this.params,
      get state() {
        return run.state;
      },
      set state(value) {
        run.state = value;
      },
      bar:bar!,
      bars: this.primary.bars,
      time,
      tick:this.tick,
      ticks:this.tickHistory,
      isWarmup,
      get position() {
        return run.publicPosition();
      },
      get equity() {
        return run.markToMarket();
      },
      get balance() {
        return run.balance;
      },
      ta: this.primary.ta,
      tf(timeframe: Timeframe): TimeframeView {
        if (timeframe === run.primary.timeframe) return { bars: run.primary.bars, ta: run.primary.ta };
        const s = run.extra.get(timeframe);
        if (!s) throw new Error(`ctx.tf('${timeframe}') needs '${timeframe}' in extraTimeframes`);
        return { bars: s.bars, ta: s.ta };
      },
      forecast: this.forecast,
      buy: (o?: OrderOptions) => run.open(SIDE_LONG, o),
      sell: (o?: OrderOptions) => run.open(SIDE_SHORT, o),
      close: (reason?: string) => run.closeByAgent(reason),
      setStops: (u: StopUpdate) => run.setStops(u),
      log: (...args: unknown[]) => run.log(time, args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
      random: () => run.random(),
    };
  }
}

// ------------------------------------------------------------------ module helpers

function validateStops(side: Side, ref: number, o: OrderOptions): string | null {
  for (const [name, v] of [
    ['stopLoss', o.stopLoss],
    ['takeProfit', o.takeProfit],
    ['trailingStop', o.trailingStop],
  ] as const) {
    if (v !== undefined && !Number.isFinite(v)) return `${name} must be a finite number, got ${v}`;
  }
  if (o.stopLoss !== undefined && (side === SIDE_LONG ? o.stopLoss >= ref : o.stopLoss <= ref)) {
    return `${side} stopLoss ${o.stopLoss} must be ${side === SIDE_LONG ? 'below' : 'above'} the price ${ref}`;
  }
  if (o.takeProfit !== undefined && (side === SIDE_LONG ? o.takeProfit <= ref : o.takeProfit >= ref)) {
    return `${side} takeProfit ${o.takeProfit} must be ${side === SIDE_LONG ? 'above' : 'below'} the price ${ref}`;
  }
  if (o.trailingStop !== undefined && !(o.trailingStop > 0)) return `trailingStop must be a positive distance, got ${o.trailingStop}`;
  return null;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
