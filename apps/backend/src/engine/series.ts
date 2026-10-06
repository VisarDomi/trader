/**
 * BarSeries — aggregates 1-minute candles into one timeframe for one instrument
 * and owns the indicator cache every agent on that series shares.
 *
 * The same class drives backtests and the live arena, so bars are built
 * identically in both.
 */
import { IndicatorCache, makeIndicators } from '../sdk/ta.ts';
import type { Bar, Indicators, Timeframe } from '../sdk/types.ts';
import { TIMEFRAME_MS } from '../sdk/types.ts';
import { MINUTE_MS } from './clock.ts';

/** A stored 1-minute candle (bid-side OHLC). */
export type Candle = Bar;

/** Keep at most this many bars; older ones are dropped in one batch when the series doubles. */
export const MAX_BARS = 5000;

export class BarSeries {
  readonly bars: Bar[] = [];
  readonly ta: Indicators;
  readonly tfMs: number;
  private readonly cache: IndicatorCache;
  private current: Bar | null = null;
  private currentBucket = -1;
  /** Total bars ever closed (does not shrink on compaction). */
  closedCount = 0;

  constructor(readonly epic: string, readonly timeframe: Timeframe) {
    this.tfMs = TIMEFRAME_MS[timeframe];
    this.cache = new IndicatorCache(this.bars);
    this.ta = makeIndicators(this.cache);
  }

  get key(): string {
    return seriesKey(this.epic, this.timeframe);
  }

  get last(): Bar | undefined {
    return this.bars[this.bars.length - 1];
  }

  /** Close time of the latest closed bar. */
  closeTime(bar: Bar): number {
    return bar.time + this.tfMs;
  }

  /**
   * Feed one 1-minute candle (in time order). Returns bars that closed because
   * of it: usually none or one; two when a gap skipped a bucket's last minute.
   */
  push(candle: Candle): Bar[] {
    const closed: Bar[] = [];
    const bucket = Math.floor(candle.time / this.tfMs) * this.tfMs;
    if (this.current && bucket !== this.currentBucket) {
      closed.push(this.emit());
    }
    if (!this.current) {
      this.currentBucket = bucket;
      this.current = { ...candle, time: bucket };
    } else {
      const c = this.current;
      if (candle.high > c.high) c.high = candle.high;
      if (candle.low < c.low) c.low = candle.low;
      c.close = candle.close;
      c.spread = candle.spread;
      c.volume += candle.volume;
    }
    // The minute that ends exactly on the bucket boundary completes the bar.
    if ((candle.time + MINUTE_MS) % this.tfMs === 0) {
      closed.push(this.emit());
    }
    return closed;
  }

  /** Close the partial bar (end of data). */
  flush(): Bar | null {
    return this.current ? this.emit() : null;
  }

  /** The bar being built right now (not closed). */
  partial(): Bar | null {
    return this.current;
  }

  private emit(): Bar {
    const bar = this.current!;
    this.current = null;
    this.currentBucket = -1;
    this.bars.push(bar);
    this.closedCount++;
    if (this.bars.length > 2 * MAX_BARS) this.compact();
    return bar;
  }

  /**
   * Drop old bars to bound memory. Indicators are recomputed lazily from the
   * remaining window; recursive ones (EMA, RSI, ATR) converge within a few
   * periods, so with periods far below MAX_BARS the values are unchanged.
   */
  private compact(): void {
    this.bars.splice(0, this.bars.length - MAX_BARS);
    this.cache.reset();
  }
}

export function seriesKey(epic: string, timeframe: Timeframe): string {
  return `${epic}:${timeframe}`;
}
