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
 * inside one candle).
 */
import type { DefinedAgent } from '../sdk/index.ts';
import type {
  AgentContext,
  Bar,
  ExitReason,
  Fill,
  Forecast,
  OrderOptions,
  Position,
  Side,
  StopUpdate,
  Timeframe,
  TimeframeView,
  Trade,
} from '../sdk/types.ts';
import { EXIT_REASON } from '../sdk/types.ts';
import { fundingDay, isSessionBlackout, isSessionEnd, utcDay, DAY_MS } from './clock.ts';
import type { Instrument } from './instruments.ts';
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
}

export type RunEvent =
  | { type: 'open'; runId: string; side: Side; size: number; price: number; time: number; stopLoss: number | null; takeProfit: number | null }
  | { type: 'close'; runId: string; trade: Trade }
  | { type: 'stops'; runId: string; stopLoss: number | null; takeProfit: number | null }
  | { type: 'log'; runId: string; time: number; message: string }
  | { type: 'error'; runId: string; time: number; message: string };

export interface RunOptions {
  runId: string;
  agentId: string;
  agent: DefinedAgent;
  params: Record<string, unknown>;
  instrument: Instrument;
  capital: number;
  primary: BarSeries;
  extra: ReadonlyMap<Timeframe, BarSeries>;
  /** Backtests check stops against candle highs/lows; live runs check every tick instead. */
  checkStopsOnCandles: boolean;
  onEvent?: (event: RunEvent) => void;
}

interface OpenPosition {
  side: Side;
  size: number;
  entryPrice: number;
  entryTime: number;
  entryBarCount: number;
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
}

export class AgentRun {
  readonly runId: string;
  readonly agentId: string;
  readonly agent: DefinedAgent;
  readonly params: Record<string, unknown>;
  readonly instrument: Instrument;
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
  private peakEquity: number;
  private maxDrawdown = 0;
  private minutesTotal = 0;
  private minutesInPosition = 0;
  private startTime = 0;
  private lastTime = 0;
  private rngState: number;
  private currentBar: Bar | null = null;
  private inFill = false;
  /** Total agent time in onBar, for the performance check. */
  agentMs = 0;
  barsSeen = 0;

  constructor(opts: RunOptions) {
    this.runId = opts.runId;
    this.agentId = opts.agentId;
    this.agent = opts.agent;
    this.params = opts.params;
    this.instrument = opts.instrument;
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
  onCandle(c: Candle): void {
    if (this.startTime === 0) this.startTime = c.time;
    this.lastTime = c.time + 60_000;
    const precision = this.instrument.pricePrecision;
    const spread = roundTo(c.spread > 0 ? c.spread : this.instrument.typicalSpread, precision);
    // Live runs may already hold a newer tick quote; never move the quote backwards.
    if (!this.quote || this.quote.time <= c.time + 60_000) {
      this.quote = { bid: c.close, ask: roundTo(c.close + spread, precision), time: c.time + 60_000 };
    }

    if (this.position) {
      this.accrueFunding(c.time, c.close);
      // Only minutes that started after the entry can hit its stops.
      if (this.checkStopsOnCandles && c.time >= this.position.entryTime) this.checkStopsOnCandle(c, spread);
      if (this.position && this.agent.intradayOnly && isSessionEnd(c.time)) {
        this.closePosition(EXIT_REASON.SESSION_END, this.exitPrice(this.position.side), c.time + 60_000);
      }
    }

    // Equity, drawdown (at the candle's adverse extreme), exposure.
    const pos = this.position;
    let adverse = this.balance;
    if (pos) {
      adverse = pos.side === SIDE_LONG
        ? this.balance + (c.low - pos.entryPrice) * pos.size
        : this.balance + (pos.entryPrice - (c.high + spread)) * pos.size;
      this.minutesInPosition++;
    }
    this.minutesTotal++;
    const eq = this.markToMarket();
    if (eq > this.peakEquity) this.peakEquity = eq;
    if (this.peakEquity > 0) {
      const dd = (this.peakEquity - Math.min(eq, adverse)) / this.peakEquity;
      if (dd > this.maxDrawdown) this.maxDrawdown = Math.min(dd, 1);
    }
    this.recordEquity(c.time, eq);
  }

  /** Live quote (arena only): stops and margin at tick precision. */
  onTick(q: Quote): void {
    // lastTime tracks candles only (it is the resume point after a restart).
    this.quote = q;
    const pos = this.position;
    if (!pos || this.status !== RUN_STATUS.RUNNING) return;
    this.accrueFunding(q.time, q.bid);
    const exitPx = this.exitPrice(pos.side);
    const stop = this.effectiveStop(pos);
    if (stop) {
      const hit = pos.side === SIDE_LONG ? exitPx <= stop.price : exitPx >= stop.price;
      if (hit) return this.closePosition(stop.reason, exitPx, q.time);
    }
    if (pos.takeProfit !== null) {
      const hit = pos.side === SIDE_LONG ? exitPx >= pos.takeProfit : exitPx <= pos.takeProfit;
      if (hit) return this.closePosition(EXIT_REASON.TAKE_PROFIT, exitPx, q.time);
    }
    if (this.marginBreached(exitPx)) return this.closePosition(EXIT_REASON.MARGIN_CALL, exitPx, q.time);
    this.updateTrailAnchor(pos, exitPx);
    if (this.agent.intradayOnly && isSessionEnd(q.time)) this.closePosition(EXIT_REASON.SESSION_END, exitPx, q.time);
  }

  /** A primary-timeframe bar closed: let the agent decide. */
  onBar(bar: Bar): void {
    if (this.status !== RUN_STATUS.RUNNING) return;
    this.currentBar = bar;
    this.barsSeen++;
    const ctx = this.makeContext(bar);
    const started = performance.now();
    try {
      this.agent.onBar(ctx as never);
    } catch (err) {
      this.handleAgentError(err, bar);
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
    this.status = RUN_STATUS.STOPPED;
  }

  metrics(): RunMetrics {
    return computeMetrics({
      trades: this.trades,
      equity: this.equity,
      initialCapital: this.capital,
      finalEquity: this.markToMarket(),
      startTime: this.startTime,
      endTime: this.lastTime,
      maxDrawdown: this.maxDrawdown,
      exposure: this.minutesTotal > 0 ? this.minutesInPosition / this.minutesTotal : 0,
    });
  }

  /** Mark history up to `time` as seen (arena warm-up), so a restart resumes after it. */
  markSynced(time: number): void {
    if (time > this.lastTime) this.lastTime = time;
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
    };
  }

  restore(s: RunSnapshot, trades: Trade[], equity: EquityPoint[]): void {
    this.balance = s.balance;
    this.position = s.position ? { ...s.position } : null;
    this.state = (s.state ?? {}) as Record<string, unknown>;
    this.peakEquity = s.peakEquity;
    this.maxDrawdown = s.maxDrawdown;
    this.minutesTotal = s.minutesTotal;
    this.minutesInPosition = s.minutesInPosition;
    this.startTime = s.startTime;
    this.lastTime = s.lastTime;
    this.errors = s.errors;
    this.status = s.status;
    this.rngState = s.rngState;
    this.trades.push(...trades);
    this.equity.push(...equity);
  }

  // ------------------------------------------------------------------ orders

  private open(side: Side, opts: OrderOptions = {}): void {
    if (!this.canTrade('open')) return;
    const time = this.quote!.time;
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
    const problem = validateStops(side, entry, opts);
    if (problem) {
      this.log(time, `order rejected: ${problem}`);
      return;
    }
    const size = this.sizeOrder(side, entry, opts);
    if (typeof size === 'string') {
      this.log(time, `order rejected: ${size}`);
      return;
    }
    this.position = {
      side,
      size,
      entryPrice: entry,
      entryTime: time,
      entryBarCount: this.primary.closedCount,
      stopLoss: opts.stopLoss ?? null,
      takeProfit: opts.takeProfit ?? null,
      trailingStop: opts.trailingStop ?? null,
      trailAnchor: side === SIDE_LONG ? this.quote!.bid : this.quote!.ask,
      funding: 0,
      lastFundingDay: fundingDay(time),
      entryReason: opts.reason,
    };
    this.emit({ type: 'open', runId: this.runId, side, size, price: entry, time, stopLoss: this.position.stopLoss, takeProfit: this.position.takeProfit });
    this.notifyFill({ kind: 'open', side, size, price: entry, time });
  }

  private closeByAgent(reason?: string): void {
    if (!this.position || !this.canTrade('close')) return;
    this.closePosition(EXIT_REASON.SIGNAL, this.exitPrice(this.position.side), this.quote!.time, reason);
  }

  private setStops(update: StopUpdate): void {
    const pos = this.position;
    if (!pos || !this.canTrade('setStops')) return;
    const next = {
      stopLoss: update.stopLoss === undefined ? pos.stopLoss : update.stopLoss,
      takeProfit: update.takeProfit === undefined ? pos.takeProfit : update.takeProfit,
      trailingStop: update.trailingStop === undefined ? pos.trailingStop : update.trailingStop,
    };
    const ref = this.exitPrice(pos.side);
    const problem = validateStops(pos.side, ref, {
      stopLoss: next.stopLoss ?? undefined,
      takeProfit: next.takeProfit ?? undefined,
      trailingStop: next.trailingStop ?? undefined,
    });
    if (problem) {
      this.log(this.quote!.time, `setStops rejected: ${problem}`);
      return;
    }
    pos.stopLoss = next.stopLoss;
    pos.takeProfit = next.takeProfit;
    pos.trailingStop = next.trailingStop;
    this.emit({ type: 'stops', runId: this.runId, stopLoss: pos.stopLoss, takeProfit: pos.takeProfit });
  }

  private canTrade(action: string): boolean {
    if (this.status !== RUN_STATUS.RUNNING || !this.quote) return false;
    if (!this.allowOrders || this.primary.closedCount < this.warmup) return false;
    if (this.balance <= 0) {
      this.log(this.quote.time, `${action} ignored: account is empty`);
      return false;
    }
    return true;
  }

  private sizeOrder(side: Side, entry: number, opts: OrderOptions): number | string {
    const inst = this.instrument;
    const equity = this.markToMarket();
    let stopDistance: number | null = null;
    if (opts.stopLoss !== undefined) stopDistance = Math.abs(entry - opts.stopLoss);
    else if (opts.trailingStop !== undefined) stopDistance = opts.trailingStop;

    // Precedence: explicit size, then explicit exposure, then risk-to-stop, then 1x exposure.
    let size: number;
    if (opts.size !== undefined) {
      if (!(opts.size > 0)) return `size must be positive, got ${opts.size}`;
      size = opts.size;
    } else if (opts.exposure === undefined && stopDistance !== null && stopDistance > 0) {
      const risk = clamp(opts.riskPct ?? DEFAULT_RISK_PCT, 0, MAX_RISK_PCT);
      size = (equity * risk) / 100 / stopDistance;
    } else {
      const exposure = opts.exposure ?? DEFAULT_EXPOSURE;
      if (!(exposure > 0)) return `exposure must be positive, got ${exposure}`;
      size = (equity * exposure) / entry;
    }
    const maxByMargin = (equity * MAX_MARGIN_USE) / (entry * inst.marginFactor);
    size = Math.min(size, maxByMargin, inst.maxSize);
    size = Math.floor(size / inst.sizeStep + SIZE_EPSILON) * inst.sizeStep;
    size = roundTo(size, decimalsOf(inst.sizeStep));
    if (size < inst.minSize) {
      return `size ${size} below the ${inst.epic} minimum of ${inst.minSize} (equity ${equity.toFixed(2)}, side ${side})`;
    }
    return size;
  }

  private closePosition(reason: ExitReason, price: number, time: number, note?: string): void {
    const pos = this.position;
    if (!pos) return;
    const px = roundTo(price, this.instrument.pricePrecision);
    const gross = pos.side === SIDE_LONG ? (px - pos.entryPrice) * pos.size : (pos.entryPrice - px) * pos.size;
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
      barsHeld: this.primary.closedCount - pos.entryBarCount,
    };
    // Funding was already debited from the balance as it accrued.
    this.balance += gross;
    this.position = null;
    if (this.balance <= 0) {
      // Capital.com negative-balance protection: the account floors at zero.
      this.balance = 0;
      this.status = RUN_STATUS.BUSTED;
    }
    this.trades.push(trade);
    this.emit({ type: 'close', runId: this.runId, trade });
    this.notifyFill({ kind: 'close', side: pos.side, size: pos.size, price: px, time, trade });
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
    const trail = pos.trailingStop !== null
      ? (pos.side === SIDE_LONG ? pos.trailAnchor - pos.trailingStop : pos.trailAnchor + pos.trailingStop)
      : null;
    if (pos.stopLoss === null && trail === null) return null;
    if (trail === null) return { price: pos.stopLoss!, reason: EXIT_REASON.STOP_LOSS };
    if (pos.stopLoss === null) return { price: trail, reason: EXIT_REASON.TRAILING_STOP };
    const trailTighter = pos.side === SIDE_LONG ? trail > pos.stopLoss : trail < pos.stopLoss;
    return trailTighter
      ? { price: trail, reason: EXIT_REASON.TRAILING_STOP }
      : { price: pos.stopLoss, reason: EXIT_REASON.STOP_LOSS };
  }

  private updateTrailAnchor(pos: OpenPosition, price: number): void {
    if (pos.side === SIDE_LONG ? price > pos.trailAnchor : price < pos.trailAnchor) pos.trailAnchor = price;
  }

  private marginBreached(exitPrice: number): boolean {
    const pos = this.position!;
    const margin = pos.size * exitPrice * this.instrument.marginFactor;
    const pnl = pos.side === SIDE_LONG ? (exitPrice - pos.entryPrice) * pos.size : (pos.entryPrice - exitPrice) * pos.size;
    return this.balance + pnl < MARGIN_CLOSE_OUT * margin;
  }

  private accrueFunding(time: number, price: number): void {
    const pos = this.position!;
    const day = fundingDay(time);
    if (day <= pos.lastFundingDay) return;
    const nights = day - pos.lastFundingDay;
    pos.lastFundingDay = day;
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

  private handleAgentError(err: unknown, bar: Bar): void {
    this.errors++;
    const message = err instanceof Error ? `${err.message}\n${(err.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(err);
    const time = bar.time + this.primary.tfMs;
    this.emit({ type: 'error', runId: this.runId, time, message });
    this.pushLog(time, `ERROR: ${message}`);
    if (this.errors >= MAX_AGENT_ERRORS) {
      if (this.position && this.quote) this.closePosition(EXIT_REASON.AGENT_ERROR, this.exitPrice(this.position.side), time);
      this.status = RUN_STATUS.ERROR;
    }
  }

  private notifyFill(fill: Fill): void {
    if (!this.agent.onFill || this.inFill || !this.currentBar) return;
    this.inFill = true;
    try {
      this.agent.onFill(this.makeContext(this.currentBar) as never, fill);
    } catch (err) {
      this.handleAgentError(err, this.currentBar);
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
      barsHeld: this.primary.closedCount - pos.entryBarCount,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      trailingStop: pos.trailingStop,
      unrealizedPnl: this.quote ? roundTo(this.unrealized(pos), 4) : 0,
    };
  }

  private makeContext(bar: Bar): AgentContext {
    const run = this;
    const time = bar.time + this.primary.tfMs;
    const isWarmup = !this.allowOrders || this.primary.closedCount < this.warmup;
    return {
      epic: this.instrument.epic,
      instrument: this.instrument,
      timeframe: this.primary.timeframe,
      params: this.params,
      get state() {
        return run.state;
      },
      set state(value) {
        run.state = value;
      },
      bar,
      bars: this.primary.bars,
      time,
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
  for (const [name, v] of [['stopLoss', o.stopLoss], ['takeProfit', o.takeProfit], ['trailingStop', o.trailingStop]] as const) {
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
