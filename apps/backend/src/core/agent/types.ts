// Re-export shared types (single source of truth in @trader/shared)
export type {
  AgentConfig,
  Timeframe,
  Fill,
  FillReason,
  InstrumentInfo,
  TradingHours,
  TradingGap,
  RunConfig,
} from '@trader/shared';

import type { AgentConfig, Timeframe, Fill, InstrumentInfo } from '@trader/shared';

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
