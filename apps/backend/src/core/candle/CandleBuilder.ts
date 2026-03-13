import type { Candle, Timeframe } from '../agent/types.ts';

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '1h':  3_600_000,
  '4h':  14_400_000,
  '1d':  86_400_000,
};

export class CandleBuilder {
  private readonly timeframe: Timeframe;
  private readonly intervalMs: number;
  private currentBucket: number | null = null;
  private open: number = 0;
  private high: number = 0;
  private low: number = 0;
  private close: number = 0;
  private count: number = 0;

  constructor(timeframe: Timeframe) {
    this.timeframe = timeframe;
    this.intervalMs = TIMEFRAME_MS[timeframe];
  }

  /**
   * Feed a minute candle. Returns a completed higher-timeframe candle
   * if the new minute belongs to a different time bucket, or null
   * if the current bucket is still accumulating.
   *
   * For '1m' timeframe, every candle passes through immediately.
   */
  addMinuteCandle(minute: Candle): Candle | null {
    if (this.timeframe === '1m') {
      return { ...minute, timeframe: '1m' };
    }

    const bucket = this.getBucket(minute.timestamp);
    let completed: Candle | null = null;

    if (this.currentBucket !== null && bucket !== this.currentBucket) {
      completed = this.emit();
    }

    if (this.currentBucket === null || bucket !== this.currentBucket) {
      this.currentBucket = bucket;
      this.open = minute.open;
      this.high = minute.high;
      this.low = minute.low;
      this.close = minute.close;
      this.count = 1;
    } else {
      this.high = Math.max(this.high, minute.high);
      this.low = Math.min(this.low, minute.low);
      this.close = minute.close;
      this.count++;
    }

    return completed;
  }

  /**
   * Flush the current partial candle (e.g., at end of session or data).
   * Returns the partial candle or null if nothing is accumulated.
   */
  flush(): Candle | null {
    if (this.currentBucket === null) return null;
    return this.emit();
  }

  /**
   * Get the current partial candle without flushing.
   * Useful for providing real-time data before candle closes.
   */
  peek(): Candle | null {
    if (this.currentBucket === null) return null;
    return {
      open: this.open,
      high: this.high,
      low: this.low,
      close: this.close,
      timestamp: this.currentBucket,
      timeframe: this.timeframe,
    };
  }

  reset(): void {
    this.currentBucket = null;
    this.count = 0;
  }

  private getBucket(timestamp: number): number {
    return Math.floor(timestamp / this.intervalMs) * this.intervalMs;
  }

  private emit(): Candle {
    const candle: Candle = {
      open: this.open,
      high: this.high,
      low: this.low,
      close: this.close,
      timestamp: this.currentBucket!,
      timeframe: this.timeframe,
    };
    this.currentBucket = null;
    this.count = 0;
    return candle;
  }
}
