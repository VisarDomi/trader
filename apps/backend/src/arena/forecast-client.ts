/**
 * Live TimesFM forecasts for the arena.
 *
 * The model runs on the lab PC's GPU (apps/forecaster); the arena reaches it
 * through the SSH tunnel at FORECASTER_URL. Before agents see a closed bar,
 * the arena calls prepare() for every forecast that bar needs, then get()
 * serves them synchronously. If the PC is unreachable agents get null.
 */
import type { ForecastProvider } from '../engine/market.ts';
import { DEFAULT_FORECAST_CONTEXT } from '../engine/market.ts';
import type { BarSeries } from '../engine/series.ts';
import { makeForecast, PRECOMPUTED_HORIZON } from '../lab/forecast-cache.ts';
import type { Bar, Forecast, ForecastSpec } from '../sdk/types.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CACHED = 2000;

export interface ForecastResponse {
  mean: number[][];
  /** [series][level][step] */
  quantiles: number[][][];
  model: string;
}

/** Ask the forecaster for `horizon` steps after each context. */
export async function requestForecasts(baseUrl: string, contexts: number[][], horizon: number, timeoutMs = REQUEST_TIMEOUT_MS): Promise<ForecastResponse> {
  const res = await fetch(`${baseUrl}/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ horizon, series: contexts }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`forecaster ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as ForecastResponse;
}

export class LiveForecastProvider implements ForecastProvider {
  private readonly cache = new Map<string, Forecast>();
  lastError: string | null = null;
  lastSuccessAt = 0;
  requests = 0;
  failures = 0;

  constructor(private readonly baseUrl: string) {}

  /** Fetch forecasts for these (series, context) pairs at the given bar. */
  async prepare(items: { series: BarSeries; spec: ForecastSpec; bar: Bar }[]): Promise<void> {
    const wanted = new Map<string, { series: BarSeries; context: number; bar: Bar }>();
    for (const { series, spec, bar } of items) {
      const context = spec.context ?? DEFAULT_FORECAST_CONTEXT;
      const key = cacheKey(series, context, bar);
      if (!this.cache.has(key)) wanted.set(key, { series, context, bar });
    }
    if (wanted.size === 0) return;
    const entries = [...wanted.entries()];
    const contexts = entries.map(([, w]) => w.series.bars.slice(-w.context).map(b => b.close));
    this.requests++;
    try {
      const res = await requestForecasts(this.baseUrl, contexts, PRECOMPUTED_HORIZON);
      entries.forEach(([key], i) => this.cache.set(key, makeForecast(PRECOMPUTED_HORIZON, res.mean[i]!, res.quantiles[i]!)));
      this.lastSuccessAt = Date.now();
      this.lastError = null;
    } catch (err) {
      this.failures++;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    while (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
  }

  get(series: BarSeries, spec: ForecastSpec, bar: Bar): Forecast | null {
    const f = this.cache.get(cacheKey(series, spec.context ?? DEFAULT_FORECAST_CONTEXT, bar));
    if (!f) return null;
    if (spec.horizon === f.horizon) return f;
    return makeForecast(
      spec.horizon,
      f.mean.slice(0, spec.horizon),
      f.quantiles.map(q => q.slice(0, spec.horizon)),
    );
  }
}

function cacheKey(series: BarSeries, context: number, bar: Bar): string {
  return `${series.key}:${context}:${bar.time}`;
}
