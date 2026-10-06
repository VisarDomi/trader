/**
 * Precomputed TimesFM forecasts for backtests.
 *
 * One file per (instrument, timeframe, context, horizon):
 *   data/forecasts/<EPIC>_<tf>_c<context>_h<horizon>.bin
 * Layout: [u32 count][u32 horizon][u32 levels] then
 *   Float64Array(count) bar open times (ascending), then
 *   Float32Array(count * (1 + levels) * horizon): per bar, mean[horizon] then
 *   each quantile level's [horizon].
 *
 * Written by `bun run forecasts` (src/lab/forecast-precompute.ts).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ForecastProvider } from '../engine/market.ts';
import { DEFAULT_FORECAST_CONTEXT } from '../engine/market.ts';
import type { BarSeries } from '../engine/series.ts';
import type { Bar, Forecast, ForecastSpec, Timeframe } from '../sdk/types.ts';
import { QUANTILE_LEVELS } from '../sdk/types.ts';
import { DATA_DIR } from './candles.ts';
import { makeForecast, PRECOMPUTED_HORIZON } from '../engine/forecast.ts';

export { makeForecast, PRECOMPUTED_HORIZON };

export const FORECAST_DIR = join(DATA_DIR, 'forecasts');
const HEADER_BYTES = 12;
const LEVELS = QUANTILE_LEVELS.length;

export function forecastFile(epic: string, tf: Timeframe, context: number, horizon: number): string {
  return join(FORECAST_DIR, `${epic}_${tf}_c${context}_h${horizon}.bin`);
}

export interface ForecastRecord {
  time: number;
  mean: Float32Array | number[];
  quantiles: (Float32Array | number[])[];
}

export class ForecastTable {
  private readonly index = new Map<number, number>();

  constructor(readonly times: Float64Array, readonly values: Float32Array, readonly horizon: number) {
    for (let i = 0; i < times.length; i++) this.index.set(times[i]!, i);
  }

  static async read(path: string): Promise<ForecastTable> {
    const buf = await Bun.file(path).arrayBuffer();
    const header = new Uint32Array(buf, 0, 3);
    const [count, horizon, levels] = [header[0]!, header[1]!, header[2]!];
    if (levels !== LEVELS) throw new Error(`${path}: expected ${LEVELS} quantile levels, found ${levels}`);
    const times = new Float64Array(buf, HEADER_BYTES + 4, count); // +4 pads to 8-byte alignment
    const values = new Float32Array(buf, HEADER_BYTES + 4 + count * 8, count * (1 + levels) * horizon);
    return new ForecastTable(times, values, horizon);
  }

  static async write(path: string, records: ForecastRecord[], horizon: number): Promise<void> {
    records.sort((a, b) => a.time - b.time);
    const count = records.length;
    const stride = (1 + LEVELS) * horizon;
    const buf = new ArrayBuffer(HEADER_BYTES + 4 + count * 8 + count * stride * 4);
    new Uint32Array(buf, 0, 3).set([count, horizon, LEVELS]);
    const times = new Float64Array(buf, HEADER_BYTES + 4, count);
    const values = new Float32Array(buf, HEADER_BYTES + 4 + count * 8, count * stride);
    records.forEach((r, i) => {
      times[i] = r.time;
      values.set(r.mean, i * stride);
      r.quantiles.forEach((q, l) => values.set(q, i * stride + (1 + l) * horizon));
    });
    mkdirSync(FORECAST_DIR, { recursive: true });
    await Bun.write(path, buf);
  }

  has(time: number): boolean {
    return this.index.has(time);
  }

  get(time: number, horizon: number): Forecast | null {
    const i = this.index.get(time);
    if (i === undefined || horizon > this.horizon) return null;
    const stride = (1 + LEVELS) * this.horizon;
    const base = i * stride;
    const mean = Array.from(this.values.subarray(base, base + horizon));
    const quantiles = QUANTILE_LEVELS.map((_, l) =>
      Array.from(this.values.subarray(base + (1 + l) * this.horizon, base + (1 + l) * this.horizon + horizon)),
    );
    return makeForecast(horizon, mean, quantiles);
  }
}

/** Backtest provider: serves forecasts from the precomputed files for one instrument. */
export class CachedForecastProvider implements ForecastProvider {
  private readonly tables = new Map<string, ForecastTable | null>();
  private readonly pending = new Map<string, Promise<void>>();

  private constructor(readonly epic: string) {}

  static async open(epic: string): Promise<CachedForecastProvider> {
    return new CachedForecastProvider(epic);
  }

  /** Load every table for this epic up front (get() must be synchronous). */
  async preload(specs: { tf: Timeframe; spec: ForecastSpec }[]): Promise<void> {
    for (const { tf, spec } of specs) {
      const context = spec.context ?? DEFAULT_FORECAST_CONTEXT;
      const key = `${tf}:${context}`;
      if (this.tables.has(key) || this.pending.has(key)) continue;
      const path = findTable(this.epic, tf, context, spec.horizon);
      const p = (path ? ForecastTable.read(path) : Promise.resolve(null)).then(t => void this.tables.set(key, t));
      this.pending.set(key, p);
    }
    await Promise.all(this.pending.values());
  }

  get(series: BarSeries, spec: ForecastSpec, bar: Bar): Forecast | null {
    const table = this.tables.get(`${series.timeframe}:${spec.context ?? DEFAULT_FORECAST_CONTEXT}`);
    return table ? table.get(bar.time, spec.horizon) : null;
  }
}

function findTable(epic: string, tf: Timeframe, context: number, horizon: number): string | null {
  for (const h of [PRECOMPUTED_HORIZON, horizon]) {
    const path = forecastFile(epic, tf, context, h);
    if (existsSync(path) && h >= horizon) return path;
  }
  return null;
}
