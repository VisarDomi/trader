import type { LiveExecution } from './venue.ts';
/**
 * MarketEngine — everything trading one instrument: its bar series (one per
 * timeframe in use) and every AgentRun on it.
 *
 * Per 1-minute candle:
 *   1. every run checks stops / funding / equity against the candle
 *   2. the candle is pushed into every series; some bars close
 *   3. runs whose primary timeframe closed a bar get onBar()
 *
 * Backtests call processCandle(); the live arena calls stepCandle() and
 * dispatchBar() separately so it can fetch forecasts in between.
 */
import type { Bar, Forecast, ForecastSpec, Timeframe } from '../sdk/types.ts';
import type { Instrument } from './instruments.ts';
import type { RunEvent, RunOptions } from './run.ts';
import { AgentRun } from './run.ts';
import type { LoadedAgent } from './loader.ts';
import { BarSeries, type Candle } from './series.ts';
import type { Tick } from './ticks.ts';
import { MINUTE_MS } from './clock.ts';
import { QUOTE_MAX_AGE_MS } from './venue.ts';
import { RiskBatch, RISK_OUTPUT_WIDTH } from './risk-native.ts';

export const TICK_HISTORY_LIMIT = 512;
/**
 * Capital's demo stream delivers each quote seconds after its own timestamp (2026-11-09: 6–13 s; REST
 * shows the same price 5–7 s earlier). Bars are built by quote time, so the clock closes a quiet minute
 * only after this many times the observed delay: quotes still in flight belong to the minute they were
 * stamped in. Replays of quotes without a delay (generated ticks) keep a zero grace.
 */
export const FEED_GRACE_FACTOR = 1.5;
const FEED_DELAY_ALPHA = 0.05;

/** The engine's quote acceptance rule: sane prices, neither stale nor from the future, in order after the previous accepted quote. */
export function acceptsTick(q: Tick, previous: Tick | null): boolean {
  return (
    Number.isFinite(q.time) && Number.isFinite(q.receivedAt) && Number.isFinite(q.bid) && Number.isFinite(q.ask) &&
    q.bid > 0 &&
    q.ask >= q.bid &&
    q.time <= q.receivedAt + 1000 &&
    q.receivedAt - q.time <= QUOTE_MAX_AGE_MS &&
    !(
      previous &&
      (q.time < previous.time ||
        q.receivedAt < previous.receivedAt ||
        (q.journalId === previous.journalId &&
          q.sequence !== undefined &&
          previous.sequence !== undefined &&
          q.sequence <= previous.sequence))
    )
  );
}

export interface ClosedBar {
  series: BarSeries;
  bar: Bar;
}

/** Supplies TimesFM forecasts. Backtests read a precomputed cache; the arena calls the GPU service. */
export interface ForecastProvider {
  get(series: BarSeries, spec: ForecastSpec, bar: Bar): Forecast | null;
}

export const DEFAULT_FORECAST_CONTEXT = 512;

export class MarketEngine {
  readonly series = new Map<Timeframe, BarSeries>();
  readonly runs: AgentRun[] = [];
  private readonly runsByPrimary = new Map<Timeframe, AgentRun[]>();
  private readonly tickRuns: AgentRun[] = [];
  readonly ticks: Tick[] = [];
  private tickMinute: Candle | null = null;
  private completedThrough = 0;
  private lastTick: Tick | null = null;
  private completedCandles: Candle[] = [];
  private feedDelay: number | null = null;
  rejectedTicks = 0;
  /** Accepted quotes, and quote deliveries to runs (the per-quote work: runs a quote could change). */
  acceptedTicks = 0;
  deliveredRunTicks = 0;
  /** Smoothed delay between a quote's timestamp and its arrival. */
  get feedDelayMs(): number {
    return this.feedDelay ?? 0;
  }
  /** How long after a minute ends (by the receive clock) the clock may close it. */
  get clockGraceMs(): number {
    return Math.min(QUOTE_MAX_AGE_MS, Math.ceil(this.feedDelayMs * FEED_GRACE_FACTOR));
  }
  private observeDelay(q: Tick): void {
    const d = Math.max(0, q.receivedAt - q.time);
    this.feedDelay = this.feedDelay === null ? d : this.feedDelay + FEED_DELAY_ALPHA * (d - this.feedDelay);
  }
  /** The last quote the engine accepted (replay tools apply the same rule ahead of delivery). */
  get lastAcceptedTick(): Tick | null {
    return this.lastTick;
  }
  private readonly risk: RiskBatch;

  constructor(
    readonly instrument: Instrument,
    private readonly forecasts: ForecastProvider | null = null,
    useNativeRisk = true,
    /** Deliver a quote only to runs it can change (see AgentRun.quoteMatters); false delivers every quote to every run. */
    readonly skipIdleQuotes = true,
  ) { this.risk = new RiskBatch(useNativeRisk); }

  getSeries(tf: Timeframe): BarSeries {
    let s = this.series.get(tf);
    if (!s) {
      s = new BarSeries(this.instrument.epic, tf);
      this.series.set(tf, s);
    }
    return s;
  }

  addRun(opts: {
    runId: string;
    agent: LoadedAgent;
    /** Account leverage tier (see leverage.ts). */
    leverage: number;
    capital: number;
    checkStopsOnCandles: boolean;
    execution?: LiveExecution;
    onEvent?: (e: RunEvent) => void;
    onEntryDecision?: RunOptions['onEntryDecision'];
    beforeEntryContext?:RunOptions['beforeEntryContext'];
  }): AgentRun {
    const def = opts.agent.def;
    const primary = this.getSeries(def.timeframe);
    const extra = new Map<Timeframe, BarSeries>();
    for (const tf of def.extraTimeframes ?? []) extra.set(tf, this.getSeries(tf));
    const run = new AgentRun({
      runId: opts.runId,
      agentId: opts.agent.id,
      agent: def,
      params: opts.agent.params,
      instrument: this.instrument,
      leverage: opts.leverage,
      capital: opts.capital,
      primary,
      extra,
      checkStopsOnCandles: opts.checkStopsOnCandles,
      execution: opts.execution,
      onEvent: opts.onEvent,
      onEntryDecision: opts.onEntryDecision,
      beforeEntryContext: opts.beforeEntryContext,
      tickHistory: this.ticks,
    });
    this.runs.push(run);
    if (run.agent.onTick) this.tickRuns.push(run);
    this.risk.invalidate();
    const list = this.runsByPrimary.get(def.timeframe) ?? [];
    list.push(run);
    this.runsByPrimary.set(def.timeframe, list);
    return run;
  }

  removeRun(run: AgentRun): void {
    this.risk.invalidate();
    const i = this.runs.indexOf(run);
    if (i >= 0) this.runs.splice(i, 1);
    const tickIndex = this.tickRuns.indexOf(run);
    if (tickIndex >= 0) this.tickRuns.splice(tickIndex, 1);
    const list = this.runsByPrimary.get(run.primary.timeframe);
    const j = list?.indexOf(run) ?? -1;
    if (list && j >= 0) list.splice(j, 1);
  }

  runsOn(tf: Timeframe): readonly AgentRun[] {
    return this.runsByPrimary.get(tf) ?? [];
  }

  /** Older history has no recorded spread; use the instrument's typical spread so agents and fills agree. */
  private normalize(c: Candle): Candle {
    return c.spread > 0 ? c : { ...c, spread: this.instrument.typicalSpread };
  }

  /** Steps 1-2: account updates, then bar building. Returns bars that closed. */
  stepCandle(raw: Candle): ClosedBar[] {
    const c = this.normalize(raw);
    for (const run of this.runs) run.onCandle(c);
    const closed: ClosedBar[] = [];
    for (const s of this.series.values()) {
      for (const bar of s.push(c)) closed.push({ series: s, bar });
    }
    return closed;
  }

  /** Step 3: call agents whose primary series closed this bar. */
  dispatchBar({ series, bar }: ClosedBar, filter: (run: AgentRun) => boolean = () => true): void {
    for (const run of this.runsOn(series.timeframe)) {
      if (!filter(run)) continue;
      run.adoptQuote(this.lastTick);
      const spec = run.agent.forecast;
      run.forecast = spec && this.forecasts ? this.forecasts.get(series, spec, bar) : null;
      run.onBar(bar);
    }
  }

  processCandle(c: Candle): void {
    const closed = this.stepCandle(c);
    for (const cb of closed) this.dispatchBar(cb);
  }

  /** Tick path for live and backtest. No future OHLC is visible to a callback. */
  stepTick(q: Tick): ClosedBar[] | null {
    if (!acceptsTick(q, this.lastTick)) {
      this.rejectedTicks++;
      return null;
    }
    const bucket = Math.floor(q.time / MINUTE_MS) * MINUTE_MS;
    const closed = this.tickMinute && bucket > this.tickMinute.time ? this.closeTickMinute() : [];
    if (closed.length)
      for (const series of this.series.values()) {
        const bar = series.flushThrough(bucket);
        if (bar) closed.push({ series, bar });
      }
    this.lastTick = q;
    this.observeDelay(q);
    this.ticks.push(q);
    if (this.ticks.length > 2 * TICK_HISTORY_LIMIT) this.ticks.splice(0, this.ticks.length - TICK_HISTORY_LIMIT);
    if (bucket >= this.completedThrough) {
      const c = this.tickMinute;
      if (!c)
        this.tickMinute = {
          time: bucket,
          open: q.bid,
          high: q.bid,
          low: q.bid,
          close: q.bid,
          spread: q.ask - q.bid,
          volume: q.volume ?? 1,
        };
      else {
        c.high = Math.max(c.high, q.bid);
        c.low = Math.min(c.low, q.bid);
        c.close = q.bid;
        c.spread = q.ask - q.bid;
        c.volume += q.volume ?? 1;
      }
    }
    const risk = this.risk.evaluate(this.runs, q);
    const runs = this.runs, skip = this.skipIdleQuotes;
    this.acceptedTicks++;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]!;
      // The native risk batch updates positions itself; with it only flat idle runs are skipped.
      if (skip && (risk === undefined ? !run.quoteMatters(q) : run.quoteIdle)) continue;
      this.deliveredRunTicks++;
      run.onTick(q, false, risk, i * RISK_OUTPUT_WIDTH);
    }
    return closed;
  }

  /** Hand every idle run the latest quote before it is observed from outside (metrics, snapshots, the end of a replay). */
  adoptLatestQuote(): void {
    for (const r of this.runs) r.adoptQuote(this.lastTick);
  }

  dispatchTick(q: Tick): void {
    for (const r of this.tickRuns) r.dispatchTick(q);
  }

  processTick(q: Tick): boolean {
    const closed = this.stepTick(q);
    if (closed === null) return false;
    for (const cb of closed) this.dispatchBar(cb);
    this.dispatchTick(q);
    return true;
  }

  /**
   * Clock closes observed bars only; it never invents an executable quote. A minute closes on the first
   * quote stamped in a later minute, or by the clock once the feed grace has passed without one.
   */
  stepClock(time: number): ClosedBar[] {
    const through = time - this.clockGraceMs;
    const closed = this.tickMinute && this.tickMinute.time + MINUTE_MS <= through ? this.closeTickMinute() : [];
    for (const series of this.series.values()) {
      const bar = series.flushThrough(through);
      if (bar) closed.push({ series, bar });
    }
    // Only open positions act on the clock (funding, scheduled and session-end exits), on the quote they would hold.
    for (const r of this.runs) {
      if (r.position === null) continue;
      r.adoptQuote(this.lastTick);
      r.onClock(time);
    }
    return closed;
  }
  processClock(time: number): void {
    for (const cb of this.stepClock(time)) this.dispatchBar(cb);
  }
  private closeTickMinute(): ClosedBar[] {
    const c = this.tickMinute!;
    this.tickMinute = null;
    this.completedThrough = c.time + MINUTE_MS;
    this.completedCandles.push(c);
    for (const r of this.runs) {
      r.adoptQuote(this.lastTick);
      r.onCandle(c, true);
    }
    const closed: ClosedBar[] = [];
    for (const series of this.series.values()) for (const bar of series.push(c)) closed.push({ series, bar });
    return closed;
  }
  /** Caller persists completed stream bars; backtests drain this rather than retain a second history. */
  takeCompletedCandles(): Candle[] {
    const rows = this.completedCandles;
    this.completedCandles = [];
    return rows;
  }
  seedTickHistory(ticks: readonly Tick[], completedThrough: number): void {
    this.completedThrough = completedThrough;
    let previous: Tick | null = null;
    const valid = ticks.filter((q) => {
      if (!acceptsTick(q, previous)) return false;
      previous = q;
      return true;
    });
    this.ticks.push(...valid.slice(-TICK_HISTORY_LIMIT));
    this.lastTick = this.ticks.at(-1) ?? null;
    for (const q of valid.slice(-TICK_HISTORY_LIMIT)) this.observeDelay(q);
    for (const q of valid) {
      if (q.time < completedThrough) continue;
      const bucket = Math.floor(q.time / MINUTE_MS) * MINUTE_MS;
      if (!this.tickMinute || bucket !== this.tickMinute.time)
        this.tickMinute = {
          time: bucket,
          open: q.bid,
          high: q.bid,
          low: q.bid,
          close: q.bid,
          spread: q.ask - q.bid,
          volume: q.volume ?? 1,
        };
      else {
        const c = this.tickMinute;
        c.high = Math.max(c.high, q.bid);
        c.low = Math.min(c.low, q.bid);
        c.close = q.bid;
        c.spread = q.ask - q.bid;
        c.volume += q.volume ?? 1;
      }
    }
  }

  /** Feed history into the series only (no runs) — used by the arena to warm up. */
  pushHistory(raw: Candle): ClosedBar[] {
    const c = this.normalize(raw);
    const closed: ClosedBar[] = [];
    for (const s of this.series.values()) {
      for (const bar of s.push(c)) closed.push({ series: s, bar });
    }
    return closed;
  }
}
