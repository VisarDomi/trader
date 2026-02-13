/**
 * Example blueprint: EMA Crossover
 *
 * Single-dimension blueprint — demonstrates the contract with default params.
 * The strategy logic is self-contained (no external factory).
 */
import type {
  Agent,
  AgentBlueprint,
  AgentConfig,
  Candle,
  Context,
  AgentResult,
  Dimension,
  Fill,
} from '../../src/core/agent/types.ts';

interface EmaState {
  fastEma: number;
  slowEma: number;
  prevFastAboveSlow: boolean;
  candleCount: number;
}

const FAST_PERIOD = 10;
const SLOW_PERIOD = 30;
const STOP_LOSS_PCT = 0.01;
const POSITION_SIZE = 0.5;
const WARMUP_CANDLES = 30;

function updateEma(prev: number, price: number, period: number): number {
  if (prev === 0) return price;
  const k = 2 / (period + 1);
  return price * k + prev * (1 - k);
}

function createEmaAgent(): Agent<EmaState> {
  const config: AgentConfig = {
    name: 'EMA Crossover',
    version: '1.0.0',
    instrument: 'US100',
    primaryFeed: '5m',
    maxDrawdown: 0.15,
  };

  function init(): EmaState {
    return { fastEma: 0, slowEma: 0, prevFastAboveSlow: false, candleCount: 0 };
  }

  function onCandle(candle: Candle, ctx: Context, state: EmaState): AgentResult<EmaState> {
    const fastEma = updateEma(state.fastEma, candle.close, FAST_PERIOD);
    const slowEma = updateEma(state.slowEma, candle.close, SLOW_PERIOD);
    const fastAboveSlow = fastEma > slowEma;
    const candleCount = state.candleCount + 1;

    const newState: EmaState = { fastEma, slowEma, prevFastAboveSlow: fastAboveSlow, candleCount };

    if (candleCount < WARMUP_CANDLES) {
      return { order: null, state: newState };
    }

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

    if (!fastAboveSlow && state.prevFastAboveSlow && ctx.position) {
      return { order: { action: 'CLOSE' }, state: newState };
    }

    return { order: null, state: newState };
  }

  function onFill(_fill: Fill, state: EmaState): EmaState {
    return state;
  }

  return { config, init, onCandle, onFill };
}

export default {
  name: 'EMA Crossover',
  version: '1.0.0',
  instrument: 'US100',
  dimensions: [{ id: 'ema-crossover' }],
  createAgent(_dim: Dimension) {
    return createEmaAgent();
  },
} satisfies AgentBlueprint<EmaState>;
