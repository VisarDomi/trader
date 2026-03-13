/**
 * Trend-follower v2 — reopens after forced day-end close.
 *
 * Behavior:
 *   - Opens when price moves trendPct% in one direction from swing point.
 *   - SL at -50% margin, TP configurable.
 *   - If force-closed at day end (MARKET_CLOSE), reopens same direction on next candle.
 *   - Only SL or TP resolves the trade idea — day close is just an interruption.
 */
import type {
  Agent,
  AgentConfig,
  Candle,
  Context,
  AgentResult,
  Fill,
  Timeframe,
} from '../../src/core/agent/types.ts';

interface TrendState {
  swingHigh: number;
  swingLow: number;
  ready: boolean;
  /** If set, reopen in this direction on next candle (after day-end close). */
  reopenDirection: 'BUY' | 'SELL' | null;
}

export interface V2Params {
  name: string;
  timeframe: Timeframe;
  trendPct: number;
  tpReturn: number;
}

const SL_RETURN = -0.50;

/** Compute all-in size, returns null if can't afford minSize. */
function computeSize(ctx: Context, price: number): number | null {
  const { leverage, minSize, maxSize, sizeIncrement } = ctx.instrument;
  let size = (ctx.account.available * leverage) / price;
  size = Math.min(size, maxSize);
  size = Math.floor(size / sizeIncrement) * sizeIncrement;
  return size >= minSize ? size : null;
}

export function createAgentV2(params: V2Params): Agent<TrendState> {
  const config: AgentConfig = {
    name: params.name,
    version: '2.0.0',
    instrument: 'US100',
    primaryFeed: params.timeframe,
    maxDrawdown: undefined,
  };

  function init(): TrendState {
    return { swingHigh: 0, swingLow: Infinity, ready: false, reopenDirection: null };
  }

  function onCandle(
    candle: Candle,
    ctx: Context,
    state: TrendState,
  ): AgentResult<TrendState> {
    const price = candle.close;

    if (!state.ready) {
      return {
        order: null,
        state: { swingHigh: price, swingLow: price, ready: true, reopenDirection: null },
      };
    }

    // Reopen after day-end close
    if (state.reopenDirection && !ctx.position) {
      const size = computeSize(ctx, price);
      if (size === null) {
        // Can't afford minimum position — abandon trade idea
        return { order: null, state: { swingHigh: price, swingLow: price, ready: true, reopenDirection: null } };
      }

      return {
        order: {
          action: 'OPEN',
          side: state.reopenDirection,
          size,
          stopLossReturn: SL_RETURN,
          takeProfitReturn: params.tpReturn,
        },
        state: { swingHigh: price, swingLow: price, ready: true, reopenDirection: null },
      };
    }

    const swingHigh = Math.max(state.swingHigh, price);
    const swingLow = Math.min(state.swingLow, price);

    if (ctx.position) {
      return { order: null, state: { ...state, swingHigh, swingLow } };
    }

    const upMove = (price - swingLow) / swingLow;
    const downMove = (swingHigh - price) / swingHigh;

    if (upMove >= params.trendPct && downMove < params.trendPct) {
      const size = computeSize(ctx, price);
      if (size !== null) {
        return {
          order: {
            action: 'OPEN',
            side: 'BUY',
            size,
            stopLossReturn: SL_RETURN,
            takeProfitReturn: params.tpReturn,
          },
          state: { swingHigh: price, swingLow: price, ready: true, reopenDirection: null },
        };
      }
    }

    if (downMove >= params.trendPct && upMove < params.trendPct) {
      const size = computeSize(ctx, price);
      if (size !== null) {
        return {
          order: {
            action: 'OPEN',
            side: 'SELL',
            size,
            stopLossReturn: SL_RETURN,
            takeProfitReturn: params.tpReturn,
          },
          state: { swingHigh: price, swingLow: price, ready: true, reopenDirection: null },
        };
      }
    }

    return { order: null, state: { ...state, swingHigh, swingLow } };
  }

  function onFill(fill: Fill, state: TrendState): TrendState {
    if (fill.action === 'CLOSED') {
      if (fill.reason === 'MARKET_CLOSE') {
        // Day-end close — reopen same direction on next candle.
        // fill.side is the CLOSING side, so original direction is the opposite.
        const originalDir = fill.side === 'SELL' ? 'BUY' : 'SELL';
        return { swingHigh: fill.price, swingLow: fill.price, ready: true, reopenDirection: originalDir };
      }
      // SL or TP — trade idea resolved, start fresh.
      return { swingHigh: fill.price, swingLow: fill.price, ready: true, reopenDirection: null };
    }
    return state;
  }

  return { config, init, onCandle, onFill };
}
