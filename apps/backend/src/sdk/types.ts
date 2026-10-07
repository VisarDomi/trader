/**
 * Public agent SDK types. This file is the whole contract between an agent
 * and the platform — see agents/GUIDE.md for the walkthrough.
 */

export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

/** A closed price bar. Prices are bid-side; buying costs bid + spread. */
export interface Bar {
  /** Bar open time, ms since epoch (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Capital.com tick volume (number of price updates), not traded volume. */
  volume: number;
  /** ask - bid at the bar close. */
  spread: number;
}

export type Side = 'long' | 'short';

export interface Position {
  side: Side;
  /** Units of the instrument (e.g. 0.5 = half a US100 contract). Always positive. */
  size: number;
  entryPrice: number;
  entryTime: number;
  /** Primary-timeframe bars since entry (0 on the bar the order was placed). */
  barsHeld: number;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Trailing distance in price units, if a trailing stop is active. */
  trailingStop: number | null;
  /** P&L in USD if closed at the current bid/ask. */
  unrealizedPnl: number;
}

export interface OrderOptions {
  /** Exact units to trade. When omitted the platform sizes the order (see riskPct / exposure). */
  size?: number;
  /**
   * Percent of equity lost if the stop is hit (1 = 1%). Requires stopLoss or trailingStop.
   * Default 1 when a stop is given.
   */
  riskPct?: number;
  /** Notional exposure as a multiple of equity (1 = 100%). Takes precedence over marginPct and riskPct. Default 1 when no stop is given. */
  exposure?: number;
  /**
   * Percent of equity put up as margin: notional = marginPct/100 × equity × ctx.leverage.
   * The way to use leverage on purpose: marginPct 10 is 0.1× equity at 1:1 and 20× at 1:200.
   * Takes precedence over riskPct.
   */
  marginPct?: number;
  /** Absolute stop-loss price. */
  stopLoss?: number;
  /** Absolute take-profit price. */
  takeProfit?: number;
  /** Trailing stop distance in price units; the stop follows price by this distance. */
  trailingStop?: number;
  /** Free-text reason, shown in the trade log. */
  reason?: string;
}

export interface StopUpdate {
  stopLoss?: number | null;
  takeProfit?: number | null;
  trailingStop?: number | null;
}

export const EXIT_REASON = {
  SIGNAL: 'signal',
  REVERSE: 'reverse',
  STOP_LOSS: 'stop_loss',
  TAKE_PROFIT: 'take_profit',
  TRAILING_STOP: 'trailing_stop',
  SESSION_END: 'session_end',
  MARGIN_CALL: 'margin_call',
  END_OF_DATA: 'end_of_data',
  AGENT_ERROR: 'agent_error',
  STOPPED: 'stopped',
} as const;
export type ExitReason = (typeof EXIT_REASON)[keyof typeof EXIT_REASON];

/** A completed round trip. */
export interface Trade {
  side: Side;
  size: number;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  /** Net P&L in USD, including overnight funding. */
  pnl: number;
  /** Overnight funding paid (negative) or received (positive), USD. */
  funding: number;
  exitReason: ExitReason;
  entryReason?: string;
  exitNote?: string;
  barsHeld: number;
}

export interface Fill {
  kind: 'open' | 'close';
  side: Side;
  size: number;
  price: number;
  time: number;
  /** Present on 'close' fills. */
  trade?: Trade;
}

/** TimesFM forecast request declared in the agent definition. */
export interface ForecastSpec {
  /** Bars ahead to forecast (1..64). */
  horizon: number;
  /** Bars of history fed to the model (32..2048). Default 512. */
  context?: number;
}

export const QUANTILE_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** Forecast of future closes on the agent's primary timeframe. */
export interface Forecast {
  horizon: number;
  /** Point forecast per step ahead: mean[0] = next bar's close, mean[horizon-1] = last. */
  mean: number[];
  /** Median forecast per step (= quantile(0.5)). */
  median: number[];
  /** quantiles[q][step] for q in QUANTILE_LEVELS order (0.1 ... 0.9). */
  quantiles: number[][];
  /** Convenience: the price at quantile level p (0.1..0.9) for a step (0-based). */
  quantile(p: number, step: number): number;
}

export interface InstrumentInfo {
  epic: string;
  name: string;
  assetClass: string;
  pricePrecision: number;
  minSize: number;
  sizeStep: number;
  maxSize: number;
  marginFactor: number;
  typicalSpread: number;
}

export interface Indicators {
  /** Latest-value indicators. Each returns NaN until it has enough bars. */
  sma(period: number, source?: Source): number;
  ema(period: number, source?: Source): number;
  wma(period: number, source?: Source): number;
  hma(period: number, source?: Source): number;
  rsi(period?: number, source?: Source): number;
  atr(period?: number): number;
  stdev(period: number, source?: Source): number;
  zscore(period: number, source?: Source): number;
  highest(period: number, source?: Source): number;
  lowest(period: number, source?: Source): number;
  roc(period: number, source?: Source): number;
  macd(fast?: number, slow?: number, signal?: number): { macd: number; signal: number; hist: number };
  bollinger(period?: number, mult?: number): { upper: number; middle: number; lower: number; width: number };
  keltner(period?: number, mult?: number): { upper: number; middle: number; lower: number };
  donchian(period: number): { upper: number; lower: number; middle: number };
  adx(period?: number): { adx: number; plusDI: number; minusDI: number };
  stoch(kPeriod?: number, dPeriod?: number): { k: number; d: number };
  cci(period?: number): number;
  willr(period?: number): number;
  supertrend(period?: number, mult?: number): { value: number; direction: 1 | -1 };
  linregSlope(period: number, source?: Source): number;
  /** Full aligned history (series[i] belongs to bars[i]); use .at(-1), .at(-2) for latest/previous. */
  series: SeriesIndicators;
  /** True if a crossed above b on the latest bar (a[-2] <= b[-2] and a[-1] > b[-1]). */
  crossedAbove(a: readonly number[], b: readonly number[] | number): boolean;
  /** True if a crossed below b on the latest bar. */
  crossedBelow(a: readonly number[], b: readonly number[] | number): boolean;
}

export interface SeriesIndicators {
  sma(period: number, source?: Source): readonly number[];
  ema(period: number, source?: Source): readonly number[];
  wma(period: number, source?: Source): readonly number[];
  hma(period: number, source?: Source): readonly number[];
  rsi(period?: number, source?: Source): readonly number[];
  atr(period?: number): readonly number[];
  stdev(period: number, source?: Source): readonly number[];
  zscore(period: number, source?: Source): readonly number[];
  highest(period: number, source?: Source): readonly number[];
  lowest(period: number, source?: Source): readonly number[];
  roc(period: number, source?: Source): readonly number[];
  macd(fast?: number, slow?: number, signal?: number): { macd: readonly number[]; signal: readonly number[]; hist: readonly number[] };
  bollinger(period?: number, mult?: number): { upper: readonly number[]; middle: readonly number[]; lower: readonly number[]; width: readonly number[] };
  keltner(period?: number, mult?: number): { upper: readonly number[]; middle: readonly number[]; lower: readonly number[] };
  donchian(period: number): { upper: readonly number[]; lower: readonly number[]; middle: readonly number[] };
  adx(period?: number): { adx: readonly number[]; plusDI: readonly number[]; minusDI: readonly number[] };
  stoch(kPeriod?: number, dPeriod?: number): { k: readonly number[]; d: readonly number[] };
  cci(period?: number): readonly number[];
  willr(period?: number): readonly number[];
  supertrend(period?: number, mult?: number): { value: readonly number[]; direction: readonly number[] };
  linregSlope(period: number, source?: Source): readonly number[];
  /** Raw price series. */
  close(): readonly number[];
  open(): readonly number[];
  high(): readonly number[];
  low(): readonly number[];
}

/** Which bar field an indicator reads. hl2 = (high+low)/2, hlc3 = (high+low+close)/3. */
export type Source = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';

/** A view on another timeframe of the same instrument. */
export interface TimeframeView {
  bars: readonly Bar[];
  ta: Indicators;
}

export interface AgentContext<P = Record<string, unknown>, S = Record<string, unknown>> {
  /** Instrument code, e.g. "US100". */
  readonly epic: string;
  readonly instrument: InstrumentInfo;
  /**
   * Leverage of this run's account on this instrument (1 = unleveraged; crypto and shares at most 20).
   * Positions are capped at about 0.9 × equity × leverage. See `leverage` in the definition.
   */
  readonly leverage: number;
  readonly timeframe: Timeframe;
  /** This agent's parameters (defaults merged with the variant). */
  readonly params: P;
  /** Your own memory. Mutate freely; must stay JSON-serializable. */
  state: S;
  /** The bar that just closed. Same as bars[bars.length - 1]. */
  readonly bar: Bar;
  /** All closed bars so far, oldest first. Read-only. */
  readonly bars: readonly Bar[];
  /** Current time (ms) = close time of `bar`. */
  readonly time: number;
  /** True while the platform is feeding history before trading starts; orders are ignored. */
  readonly isWarmup: boolean;
  readonly position: Position | null;
  /** Balance + unrealized P&L, USD. */
  readonly equity: number;
  /** Realized cash, USD. */
  readonly balance: number;
  /** Indicators on the primary timeframe. */
  readonly ta: Indicators;
  /** Bars and indicators on another timeframe; it must be listed in `extraTimeframes`. */
  tf(timeframe: Timeframe): TimeframeView;
  /** TimesFM forecast for this bar, if the agent declared `forecast`. Null when unavailable. */
  readonly forecast: Forecast | null;
  /** Go long (closes a short first). Ignored if already long. */
  buy(options?: OrderOptions): void;
  /** Go short (closes a long first). Ignored if already short. */
  sell(options?: OrderOptions): void;
  /** Close the open position, if any. */
  close(reason?: string): void;
  /** Move stops on the open position. Pass null to remove one. */
  setStops(update: StopUpdate): void;
  /** Debug log line (kept in the run's log). */
  log(...args: unknown[]): void;
  /** Deterministic random number in [0, 1) — use instead of Math.random(). */
  random(): number;
}

export interface AgentDefinition<P extends Record<string, unknown> = Record<string, unknown>, S = Record<string, unknown>> {
  /** Display name. */
  name: string;
  /** One or two sentences: what edge does this agent try to capture? */
  description: string;
  author?: string;
  /** Instruments to run on (each becomes its own leaderboard entry). */
  instruments: readonly string[];
  /** Primary timeframe — onBar runs once per closed bar of this size. */
  timeframe: Timeframe;
  /** Other timeframes you want via ctx.tf(...). */
  extraTimeframes?: readonly Timeframe[];
  /** Default parameters. */
  params: P;
  /** Named parameter sets. Each variant becomes its own agent: "<file>/<variant>". */
  variants?: Record<string, Partial<P>>;
  /** Bars of history before orders are allowed. Default 100. */
  warmup?: number;
  /**
   * Account leverages to run at, each its own run and leaderboard row (1, 2, 3, 5, 10, 20, 50, 100, 200).
   * Omit it unless the idea depends on leverage: agents/roster.json then decides (see LIFECYCLE.md).
   */
  leverage?: readonly number[];
  /** Force-close any position before the daily session break. Default false. */
  intradayOnly?: boolean;
  /** Ask the platform for a TimesFM forecast every bar (ctx.forecast). */
  forecast?: ForecastSpec;
  /** Initial value of ctx.state. Default {}. */
  init?(params: P): S;
  /** Called once per closed primary-timeframe bar. */
  onBar(ctx: AgentContext<P, S>): void;
  /** Called after every fill (open or close). */
  onFill?(ctx: AgentContext<P, S>, fill: Fill): void;
}
