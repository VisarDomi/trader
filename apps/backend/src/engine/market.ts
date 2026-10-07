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
import type { RunEvent } from './run.ts';
import { AgentRun } from './run.ts';
import type { LoadedAgent } from './loader.ts';
import { BarSeries, type Candle } from './series.ts';

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

  constructor(
    readonly instrument: Instrument,
    private readonly forecasts: ForecastProvider | null = null,
  ) {}

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
    onEvent?: (e: RunEvent) => void;
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
      onEvent: opts.onEvent,
    });
    this.runs.push(run);
    const list = this.runsByPrimary.get(def.timeframe) ?? [];
    list.push(run);
    this.runsByPrimary.set(def.timeframe, list);
    return run;
  }

  removeRun(run: AgentRun): void {
    const i = this.runs.indexOf(run);
    if (i >= 0) this.runs.splice(i, 1);
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
  dispatchBar({ series, bar }: ClosedBar): void {
    for (const run of this.runsOn(series.timeframe)) {
      const spec = run.agent.forecast;
      run.forecast = spec && this.forecasts ? this.forecasts.get(series, spec, bar) : null;
      run.onBar(bar);
    }
  }

  processCandle(c: Candle): void {
    const closed = this.stepCandle(c);
    for (const cb of closed) this.dispatchBar(cb);
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
