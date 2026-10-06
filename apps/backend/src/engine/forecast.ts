/**
 * Forecast helpers shared by the backtest cache (lab) and the live client (arena).
 */
import type { Forecast } from '../sdk/types.ts';
import { QUANTILE_LEVELS } from '../sdk/types.ts';

/** Forecasts are always computed 64 steps ahead (one TimesFM 3 output patch); shorter requests read a prefix. */
export const PRECOMPUTED_HORIZON = 64;

export function makeForecast(horizon: number, mean: number[], quantiles: number[][]): Forecast {
  const median = quantiles[QUANTILE_LEVELS.indexOf(0.5)]!;
  return {
    horizon,
    mean,
    median,
    quantiles,
    quantile(p: number, step: number): number {
      const l = QUANTILE_LEVELS.findIndex(q => Math.abs(q - p) < 1e-9);
      if (l < 0) throw new Error(`quantile level must be one of ${QUANTILE_LEVELS.join(', ')}`);
      return quantiles[l]![step]!;
    },
  };
}
