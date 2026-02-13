/**
 * MACD + EMA trend filter agent.
 *
 * Strategy:
 *   - EMA(N) determines trend direction (price above = UP, below = DOWN)
 *   - MACD crossover triggers entry, only in direction of EMA trend
 *   - UP trend + bullish MACD cross → BUY
 *   - DOWN trend + bearish MACD cross → SELL
 *   - SL configurable (max -50% = platform constraint)
 *   - TP configurable
 *   - Reopens same direction after forced day-end close
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
import { EMA, MACD } from '../../src/core/indicators.ts';

interface MacdEmaState {
  ema: EMA;
  macd: MACD;
  reopenDirection: 'BUY' | 'SELL' | null;
}

export interface MacdEmaParams {
  name: string;
  timeframe: Timeframe;
  emaPeriod: number;
  tpReturn: number;
  slReturn?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
}

function computeSize(ctx: Context, price: number): number | null {
  const { leverage, minSize, maxSize, sizeIncrement } = ctx.instrument;
  let size = (ctx.account.available * leverage) / price;
  size = Math.min(size, maxSize);
  size = Math.floor(size / sizeIncrement) * sizeIncrement;
  return size >= minSize ? size : null;
}

export function createMacdEmaAgent(params: MacdEmaParams): Agent<MacdEmaState> {
  const config: AgentConfig = {
    name: params.name,
    version: '1.0.0',
    instrument: 'US100',
    primaryFeed: params.timeframe,
  };

  function init(): MacdEmaState {
    return {
      ema: new EMA(params.emaPeriod),
      macd: new MACD(params.macdFast ?? 12, params.macdSlow ?? 26, params.macdSignal ?? 9),
      reopenDirection: null,
    };
  }

  function onCandle(
    candle: Candle,
    ctx: Context,
    state: MacdEmaState,
  ): AgentResult<MacdEmaState> {
    const price = candle.close;

    // Update indicators
    state.ema.update(price);
    state.macd.update(price);

    // Reopen after day-end close
    if (state.reopenDirection && !ctx.position) {
      const size = computeSize(ctx, price);
      if (size === null) {
        state.reopenDirection = null;
        return { order: null, state };
      }
      const dir = state.reopenDirection;
      state.reopenDirection = null;
      return {
        order: { action: 'OPEN', side: dir, size, stopLossReturn: params.slReturn ?? -0.50, takeProfitReturn: params.tpReturn },
        state,
      };
    }

    // Need both indicators ready and no open position
    if (!state.ema.ready || !state.macd.ready || ctx.position) {
      return { order: null, state };
    }

    const trend = price > state.ema.value ? 'UP' : 'DOWN';

    // Enter on MACD crossover in direction of EMA trend
    if (trend === 'UP' && state.macd.bullishCross) {
      const size = computeSize(ctx, price);
      if (size !== null) {
        return {
          order: { action: 'OPEN', side: 'BUY', size, stopLossReturn: params.slReturn ?? -0.50, takeProfitReturn: params.tpReturn },
          state,
        };
      }
    }

    if (trend === 'DOWN' && state.macd.bearishCross) {
      const size = computeSize(ctx, price);
      if (size !== null) {
        return {
          order: { action: 'OPEN', side: 'SELL', size, stopLossReturn: params.slReturn ?? -0.50, takeProfitReturn: params.tpReturn },
          state,
        };
      }
    }

    return { order: null, state };
  }

  function onFill(fill: Fill, state: MacdEmaState): MacdEmaState {
    if (fill.action === 'CLOSED') {
      if (fill.reason === 'MARKET_CLOSE') {
        state.reopenDirection = fill.side === 'SELL' ? 'BUY' : 'SELL';
      } else {
        state.reopenDirection = null;
      }
    }
    return state;
  }

  return { config, init, onCandle, onFill };
}
