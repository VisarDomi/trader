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
}

export interface TradingHours {
  timezone: string;
  open: string;
  close: string;
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
  stopLoss?: number;
  takeProfit?: number;
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
}
