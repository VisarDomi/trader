/**
 * Example agent: EMA Crossover
 *
 * Buys when fast EMA crosses above slow EMA.
 * Sells when fast EMA crosses below slow EMA.
 * Uses a fixed stop loss of 1% below entry.
 *
 * This is a reference implementation showing the agent contract in action.
 */
import type {
  Agent,
  AgentConfig,
  Candle,
  Context,
  AgentResult,
  Fill,
} from '../../src/core/agent/types.ts';

// --- State: must be plain JSON-serializable ---

interface EmaState {
  fastEma: number;
  slowEma: number;
  prevFastAboveSlow: boolean;
  candleCount: number;
}

// --- Config ---

const FAST_PERIOD = 10;
const SLOW_PERIOD = 30;
const STOP_LOSS_PCT = 0.01;
const POSITION_SIZE = 0.5;
const WARMUP_CANDLES = 30;

const config: AgentConfig = {
  name: 'EMA Crossover',
  version: '1.0.0',
  instrument: 'US100',
  primaryFeed: '5m',
  maxDrawdown: 0.15,
};

// --- Helpers ---

function updateEma(prev: number, price: number, period: number): number {
  if (prev === 0) return price;
  const k = 2 / (period + 1);
  return price * k + prev * (1 - k);
}

// --- Agent implementation ---

function init(): EmaState {
  return {
    fastEma: 0,
    slowEma: 0,
    prevFastAboveSlow: false,
    candleCount: 0,
  };
}

function onCandle(
  candle: Candle,
  ctx: Context,
  state: EmaState
): AgentResult<EmaState> {
  const fastEma = updateEma(state.fastEma, candle.close, FAST_PERIOD);
  const slowEma = updateEma(state.slowEma, candle.close, SLOW_PERIOD);
  const fastAboveSlow = fastEma > slowEma;
  const candleCount = state.candleCount + 1;

  const newState: EmaState = {
    fastEma,
    slowEma,
    prevFastAboveSlow: fastAboveSlow,
    candleCount,
  };

  // Wait for warmup
  if (candleCount < WARMUP_CANDLES) {
    return { order: null, state: newState };
  }

  // Crossover: fast crosses above slow → buy
  if (fastAboveSlow && !state.prevFastAboveSlow && !ctx.position) {
    return {
      order: {
        action: 'OPEN',
        side: 'BUY',
        size: POSITION_SIZE,
        stopLoss: candle.close * (1 - STOP_LOSS_PCT),
      },
      state: newState,
    };
  }

  // Crossunder: fast crosses below slow → close
  if (!fastAboveSlow && state.prevFastAboveSlow && ctx.position) {
    return {
      order: { action: 'CLOSE' },
      state: newState,
    };
  }

  return { order: null, state: newState };
}

function onFill(fill: Fill, state: EmaState): EmaState {
  // No state changes needed on fill for this strategy
  return state;
}

export default { config, init, onCandle, onFill } satisfies Agent<EmaState>;
