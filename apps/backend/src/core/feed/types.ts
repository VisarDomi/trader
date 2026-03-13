import type { Candle } from '../agent/types.ts';

export type MinuteCandleHandler = (candle: Candle) => void | Promise<void>;

/**
 * Common interface for all price feeds.
 *
 * BacktestFeed: iterates through stored candles, resolves when data is exhausted.
 * LiveFeed (future): connects to WebSocket, runs until stop() is called.
 */
export interface PriceFeed {
  start(handler: MinuteCandleHandler): Promise<void>;
  stop(): void;
}
