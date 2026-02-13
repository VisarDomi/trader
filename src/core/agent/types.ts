// ============================================
// AGENT CONTRACT
// ============================================

export interface Agent<S> {
  config: AgentConfig;
  init(): S;
  onCandle(candle: Candle, ctx: Context, state: S): AgentResult<S>;
  onFill(fill: Fill, state: S): S;
}

// ============================================
// AGENT BLUEPRINT
// ============================================

/**
 * A blueprint defines a strategy algorithm + its tunable dimensions.
 * The framework generates one Agent per dimension entry.
 *
 * Agent IDs are formed as: <directory>/<dimension.id>
 * e.g. "trend-follower/1m-050"
 */
export interface AgentBlueprint<S> {
  name: string;
  version: string;
  instrument: string;
  dimensions: Dimension[];
  createAgent(dim: Dimension): Agent<S>;
}

export interface Dimension {
  /** Unique ID within this blueprint — becomes part of the agent ID. */
  id: string;
  [key: string]: unknown;
}

// ============================================
// AGENT CONFIG
// ============================================

export interface AgentConfig {
  name: string;
  version: string;
  instrument: string;
  primaryFeed: Timeframe;
  secondaryFeeds?: Timeframe[];
  maxDrawdown?: number;
  maxPositionSize?: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// ============================================
// MARKET DATA
// ============================================

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
  timeframe: Timeframe;
}

// ============================================
// CONTEXT (provided by framework each call)
// ============================================

export interface Context {
  account: AccountSnapshot;
  position: Position | null;
  instrument: InstrumentInfo;
  timestamp: number;
  history: Candle[];
  secondaryHistory: Record<Timeframe, Candle[]>;
}

export interface AccountSnapshot {
  equity: number;
  balance: number;
  available: number;
  margin: number;
}

export interface Position {
  direction: 'BUY' | 'SELL';
  size: number;
  entryPrice: number;
  entryTime: number;
  unrealizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface InstrumentInfo {
  epic: string;
  leveraged: boolean;
  leverage: number;
  spread: number;
  lotSize: number;
  minSize: number;
  maxSize: number;
  sizeIncrement: number;
  pricePrecision: number;
  tradingHours: TradingHours;
  /** Capital.com category for leverage preferences (e.g. 'INDICES'). */
  category?: string;
}

export interface TradingHours {
  timezone: string;
  /**
   * Gap schedule — sorted by 'from' date ascending.
   * Each entry defines the daily maintenance/settlement gap.
   * Framework picks the latest entry whose 'from' <= candle date.
   * Trading is allowed outside the gap; positions force-closed 1min before gapStart.
   */
  gaps: TradingGap[];
}

export interface TradingGap {
  /** ISO date — this gap schedule applies from this date onward. */
  from: string;
  /** HH:MM — when the gap begins (in the configured timezone). */
  gapStart: string;
  /** HH:MM — when trading resumes. Can be next day (e.g., '18:00' after '17:00'). */
  gapEnd: string;
}

// ============================================
// AGENT RETURN TYPES
// ============================================

export interface AgentResult<S> {
  order: Order | null;
  state: S;
}

export type Order = OpenOrder | CloseOrder | ModifyOrder;

export interface OpenOrder {
  action: 'OPEN';
  side: 'BUY' | 'SELL';
  size: number;
  /** Absolute price levels (agent-computed). */
  stopLoss?: number;
  takeProfit?: number;
  /** Margin-return targets (framework-computed after fill).
   *  e.g. stopLossReturn: -0.5 = -50% of margin, takeProfitReturn: 1.0 = +100%.
   *  These take precedence over absolute stopLoss/takeProfit. */
  stopLossReturn?: number;
  takeProfitReturn?: number;
}

export interface CloseOrder {
  action: 'CLOSE';
}

export interface ModifyOrder {
  action: 'MODIFY';
  stopLoss?: number;
  takeProfit?: number;
}

// ============================================
// FILL (framework → agent callback)
// ============================================

export interface Fill {
  action: 'OPENED' | 'CLOSED';
  reason: FillReason;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  timestamp: number;
  pnl?: number;
}

export type FillReason =
  | 'ORDER'
  | 'STOP_LOSS'
  | 'TAKE_PROFIT'
  | 'MARKET_CLOSE'
  | 'LIQUIDATION';

// ============================================
// RUN CONFIG (framework-provided, not agent)
// ============================================

export interface RunConfig {
  agentId: string;
  capital: number;
  mode: 'backtest' | 'paper' | 'live';
  startDate?: string;
  endDate?: string;
  maxDrawdown?: number;
  maxPositionSize?: number;
  /** Use tick-level backtesting — replays stored ticks for accurate SL/TP resolution. */
  tickMode?: boolean;
  /** Override instrument leverage for this run. Framework-owned — agents don't need to know. */
  leverage?: number;
}
