/**
 * Shared logic for trend-follower variants.
 * Each variant just calls createAgent() with different params.
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
}

interface Params {
  name: string;
  timeframe: Timeframe;
  trendPct: number;
  /** Margin-return target for take profit. Default +100% of margin. */
  tpReturn?: number;
}

// Agent specifies margin-return targets — framework computes exact prices after fill.
const SL_RETURN = -0.50;  // -50% of margin
const DEFAULT_TP_RETURN = 1.00;   // +100% of margin

export function createAgent(params: Params): Agent<TrendState> {
  const config: AgentConfig = {
    name: params.name,
    version: '1.0.0',
    instrument: 'US100',
    primaryFeed: params.timeframe,
    maxDrawdown: 0.50,
  };

  function init(): TrendState {
    return { swingHigh: 0, swingLow: Infinity, ready: false };
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
        state: { swingHigh: price, swingLow: price, ready: true },
      };
    }

    const swingHigh = Math.max(state.swingHigh, price);
    const swingLow = Math.min(state.swingLow, price);

    if (ctx.position) {
      return { order: null, state: { swingHigh, swingLow, ready: true } };
    }

    const upMove = (price - swingLow) / swingLow;
    const downMove = (swingHigh - price) / swingHigh;

    if (upMove >= params.trendPct && downMove < params.trendPct) {
      const { leverage, minSize, maxSize, sizeIncrement } = ctx.instrument;

      let size = (ctx.account.available * leverage) / price;
      size = Math.min(size, maxSize);
      size = Math.max(size, minSize);
      size = Math.floor(size / sizeIncrement) * sizeIncrement;

      return {
        order: {
          action: 'OPEN',
          side: 'BUY',
          size,
          stopLossReturn: SL_RETURN,
          takeProfitReturn: params.tpReturn ?? DEFAULT_TP_RETURN,
        },
        state: { swingHigh: price, swingLow: price, ready: true },
      };
    }

    if (downMove >= params.trendPct && upMove < params.trendPct) {
      const { leverage, minSize, maxSize, sizeIncrement } = ctx.instrument;

      let size = (ctx.account.available * leverage) / price;
      size = Math.min(size, maxSize);
      size = Math.max(size, minSize);
      size = Math.floor(size / sizeIncrement) * sizeIncrement;

      return {
        order: {
          action: 'OPEN',
          side: 'SELL',
          size,
          stopLossReturn: SL_RETURN,
          takeProfitReturn: params.tpReturn ?? DEFAULT_TP_RETURN,
        },
        state: { swingHigh: price, swingLow: price, ready: true },
      };
    }

    return { order: null, state: { swingHigh, swingLow, ready: true } };
  }

  function onFill(fill: Fill, state: TrendState): TrendState {
    if (fill.action === 'CLOSED') {
      return { swingHigh: fill.price, swingLow: fill.price, ready: true };
    }
    return state;
  }

  return { config, init, onCandle, onFill };
}
