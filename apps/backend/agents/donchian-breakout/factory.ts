/**
 * Donchian Channel Breakout agent factory.
 *
 * BUY when price breaks above the N-period high.
 * SELL (short) when price breaks below the N-period low.
 * Stop-loss at K × ATR from entry. Take-profit at R × stop distance.
 * One position at a time.
 *
 * Position sizing: risks a fixed % of equity per trade, computed from
 * the ATR-based stop distance. This makes size adaptive to volatility
 * and account equity.
 */
import type {
  Agent,
  AgentConfig,
  AgentResult,
  Candle,
  Context,
  Fill,
  Timeframe,
} from '../../src/core/agent/types.ts';

export interface DonchianParams {
  name: string;
  timeframe: Timeframe;
  channelLength: number;  // N — lookback for Donchian channel
  atrMultiple: number;    // K — SL = K × ATR
  rewardRatio: number;    // R — TP = R × SL distance
  leverage: number;
  riskPct?: number;       // fraction of equity to risk per trade (default 0.02)
}

interface DonchianState {
  candleCount: number;
}

const ATR_PERIOD = 14;

export function createDonchian(params: DonchianParams): Agent<DonchianState> {
  const { timeframe, channelLength, atrMultiple, rewardRatio } = params;
  const riskPct = params.riskPct ?? 0.02;

  // Warmup: need channelLength candles for the channel + ATR_PERIOD for ATR
  const warmupCandles = Math.max(channelLength, ATR_PERIOD) + 1;

  const config: AgentConfig = {
    name: params.name,
    version: '1.0.0',
    instrument: 'US100',
    primaryFeed: timeframe,
    leverage: params.leverage,
  };

  function init(): DonchianState {
    return { candleCount: 0 };
  }

  function computeATR(history: Candle[]): number {
    // Wilder's ATR from the last ATR_PERIOD+1 candles in history
    const start = Math.max(0, history.length - ATR_PERIOD - 1);
    const slice = history.slice(start);

    let atr = 0;
    let count = 0;
    let prevClose = slice[0]?.close ?? 0;

    for (let i = 1; i < slice.length; i++) {
      const c = slice[i];
      const tr = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose),
      );
      prevClose = c.close;

      count++;
      if (count <= ATR_PERIOD) {
        atr += tr;
        if (count === ATR_PERIOD) atr /= ATR_PERIOD;
      } else {
        atr = (atr * (ATR_PERIOD - 1) + tr) / ATR_PERIOD;
      }
    }

    return atr;
  }

  function onCandle(
    candle: Candle,
    ctx: Context,
    state: DonchianState,
  ): AgentResult<DonchianState> {
    const newState: DonchianState = { candleCount: state.candleCount + 1 };

    if (newState.candleCount < warmupCandles) {
      return { order: null, state: newState };
    }

    // Already in a position — let SL/TP handle the exit
    if (ctx.position) {
      return { order: null, state: newState };
    }

    const history = ctx.history;

    // Donchian channel: highest high and lowest low of the previous N candles
    // (excluding the current candle which is the last element in history)
    const lookbackStart = Math.max(0, history.length - channelLength - 1);
    const lookbackEnd = history.length - 1;
    let channelHigh = -Infinity;
    let channelLow = Infinity;
    for (let i = lookbackStart; i < lookbackEnd; i++) {
      const c = history[i];
      if (c.high > channelHigh) channelHigh = c.high;
      if (c.low < channelLow) channelLow = c.low;
    }

    // ATR for stop sizing
    const atr = computeATR(history);
    if (atr <= 0) return { order: null, state: newState };

    const slDistance = atrMultiple * atr;
    const tpDistance = rewardRatio * slDistance;

    // Position size: risk riskPct of available equity
    const equity = ctx.account.equity;
    const riskAmount = equity * riskPct;
    const lotSize = ctx.instrument.lotSize;
    let size = riskAmount / (slDistance * lotSize);

    // Clamp to instrument limits
    size = Math.max(ctx.instrument.minSize, size);
    size = Math.min(ctx.instrument.maxSize, size);

    // Breakout above channel → BUY
    if (candle.high > channelHigh) {
      return {
        order: {
          action: 'OPEN',
          side: 'BUY',
          size,
          stopLoss: candle.close - slDistance,
          takeProfit: candle.close + tpDistance,
        },
        state: newState,
      };
    }

    // Breakout below channel → SELL
    if (candle.low < channelLow) {
      return {
        order: {
          action: 'OPEN',
          side: 'SELL',
          size,
          stopLoss: candle.close + slDistance,
          takeProfit: candle.close - tpDistance,
        },
        state: newState,
      };
    }

    return { order: null, state: newState };
  }

  function onFill(_fill: Fill, state: DonchianState): DonchianState {
    return state;
  }

  return { config, init, onCandle, onFill };
}
