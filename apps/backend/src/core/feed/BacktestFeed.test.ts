import { test, expect, describe } from 'bun:test';
import { BacktestFeed } from './BacktestFeed.ts';
import type { Candle } from '../agent/types.ts';

function makeCandles(count: number, startMinute: number = 0): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    open: 18500 + i,
    high: 18510 + i,
    low: 18490 + i,
    close: 18505 + i,
    timestamp: (startMinute + i) * 60_000,
    timeframe: '1m' as const,
  }));
}

describe('BacktestFeed', () => {
  test('delivers all candles in order', async () => {
    const source = makeCandles(10);
    const feed = new BacktestFeed(source);
    const received: Candle[] = [];

    await feed.start((candle) => received.push(candle));

    expect(received.length).toBe(10);
    expect(received[0]!.timestamp).toBe(0);
    expect(received[9]!.timestamp).toBe(9 * 60_000);
  });

  test('preserves OHLC data', async () => {
    const source = makeCandles(3);
    const feed = new BacktestFeed(source);
    const received: Candle[] = [];

    await feed.start((candle) => received.push(candle));

    expect(received[0]!.open).toBe(18500);
    expect(received[0]!.high).toBe(18510);
    expect(received[0]!.low).toBe(18490);
    expect(received[0]!.close).toBe(18505);
    expect(received[0]!.timeframe).toBe('1m');
  });

  test('resolves when all candles consumed', async () => {
    const feed = new BacktestFeed(makeCandles(5));
    let count = 0;

    await feed.start(() => { count++; });

    expect(count).toBe(5);
  });

  test('handles empty candle list', async () => {
    const feed = new BacktestFeed([]);
    let count = 0;

    await feed.start(() => { count++; });

    expect(count).toBe(0);
  });

  test('stop() halts mid-feed', async () => {
    const feed = new BacktestFeed(makeCandles(100));
    const received: Candle[] = [];

    await feed.start((candle) => {
      received.push(candle);
      if (received.length === 10) {
        feed.stop();
      }
    });

    // Stopped after 10, but the 10th candle's handler called stop(),
    // so the loop breaks BEFORE processing the 11th
    expect(received.length).toBe(10);
  });

  test('stop() before start results in no candles', async () => {
    const feed = new BacktestFeed(makeCandles(10));
    feed.stop();

    let count = 0;
    await feed.start(() => { count++; });

    expect(count).toBe(0);
  });

  test('length reports total candle count', () => {
    const feed = new BacktestFeed(makeCandles(42));
    expect(feed.length).toBe(42);
  });

  test('handles large dataset', async () => {
    // ~1 year of trading: 252 days * 390 minutes
    const yearOfData = makeCandles(252 * 390);
    const feed = new BacktestFeed(yearOfData);
    let count = 0;

    await feed.start(() => { count++; });

    expect(count).toBe(252 * 390);
  });

  test('handler receives distinct candle objects', async () => {
    const feed = new BacktestFeed(makeCandles(3));
    const received: Candle[] = [];

    await feed.start((candle) => received.push(candle));

    // Each candle should have a unique timestamp
    const timestamps = received.map(c => c.timestamp);
    expect(new Set(timestamps).size).toBe(3);
  });
});
