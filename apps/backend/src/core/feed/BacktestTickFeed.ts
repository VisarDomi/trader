import type { Candle } from '../agent/types.ts';
import type { MinuteCandleHandler, PriceFeed } from './types.ts';

export type TickHandler = (bid: number, ask: number, timestamp: number) => void | Promise<void>;

export interface Tick {
  timestamp: number;
  bid: number;
  ask: number;
}

/**
 * Backtest tick feed — replays real stored tick data.
 *
 * Each tick is passed to onTick for stop/TP checking via the same
 * PositionMonitor.check(bid, ask) path used in live mode. Whichever
 * level the price hits first naturally wins — no pessimistic guessing.
 *
 * Ticks are also accumulated into minute candles and emitted to the
 * standard handler so the agent's onCandle still gets called.
 */
export class BacktestTickFeed implements PriceFeed {
  private readonly ticks: Tick[];
  private readonly onTick: TickHandler;
  private stopped: boolean = false;
  private processedCount: number = 0;

  // Minute candle accumulation (same logic as CapitalLiveFeed)
  private currentBucket: number = 0;
  private currentCandle: { open: number; high: number; low: number; close: number } | null = null;

  constructor(ticks: Tick[], onTick: TickHandler) {
    this.ticks = ticks;
    this.onTick = onTick;
  }

  async start(handler: MinuteCandleHandler): Promise<void> {
    for (const tick of this.ticks) {
      if (this.stopped) break;
      this.processedCount++;

      // 1. Call tick handler for stop/TP checking (same as live processTick)
      await this.onTick(tick.bid, tick.ask, tick.timestamp);

      // 2. Accumulate into minute candles
      const mid = (tick.bid + tick.ask) / 2;
      const bucket = Math.floor(tick.timestamp / 60_000) * 60_000;

      if (this.currentCandle === null) {
        this.currentBucket = bucket;
        this.currentCandle = { open: mid, high: mid, low: mid, close: mid };
        continue;
      }

      if (bucket !== this.currentBucket) {
        // Emit completed minute candle
        const candle = this.buildCandle(this.currentBucket);
        await handler(candle);

        // Start new accumulation
        this.currentBucket = bucket;
        this.currentCandle = { open: mid, high: mid, low: mid, close: mid };
        continue;
      }

      // Same minute — update OHLC
      this.currentCandle.high = Math.max(this.currentCandle.high, mid);
      this.currentCandle.low = Math.min(this.currentCandle.low, mid);
      this.currentCandle.close = mid;
    }

    // Flush final partial candle
    if (this.currentCandle && !this.stopped) {
      const candle = this.buildCandle(this.currentBucket);
      await handler(candle);
    }
  }

  stop(): void {
    this.stopped = true;
  }

  get length(): number {
    return this.ticks.length;
  }

  get processed(): number {
    return this.processedCount;
  }

  private buildCandle(bucket: number): Candle {
    const c = this.currentCandle!;
    return {
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      timestamp: bucket,
      timeframe: '1m',
    };
  }
}
