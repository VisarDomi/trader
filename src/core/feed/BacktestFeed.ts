import type { Candle } from '../agent/types.ts';
import type { MinuteCandleHandler, PriceFeed } from './types.ts';

/**
 * Backtest price feed.
 *
 * Takes pre-loaded minute candles (sorted chronologically) and delivers
 * them to the handler one by one. Resolves when all candles are consumed
 * or stop() is called.
 *
 * Candles are expected to be loaded from the database before constructing
 * this feed. The feed itself has no database dependency.
 */
export class BacktestFeed implements PriceFeed {
  private readonly candles: Candle[];
  private stopped: boolean = false;

  constructor(minuteCandles: Candle[]) {
    this.candles = minuteCandles;
  }

  async start(handler: MinuteCandleHandler): Promise<void> {
    for (const candle of this.candles) {
      if (this.stopped) break;
      await handler(candle);
    }
  }

  stop(): void {
    this.stopped = true;
  }

  get length(): number {
    return this.candles.length;
  }
}
