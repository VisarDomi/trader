import { expect, test } from 'bun:test';
import { packTicks, unpackTicks } from './tick-codec.ts';
import type { RecordedTick } from '../engine/ticks.ts';
const T = Date.UTC(2026, 9, 16);
test('compact blocks losslessly preserve repeats, sequence gaps, backwards broker timestamps and exact decimal/float prices', () => {
  const ticks: RecordedTick[] = Array.from({ length: 2000 }, (_, i) => ({
    id: i + 1 + (i > 1000 ? 2 : 0),
    session: i > 1500 ? 2 : 1,
    epic: i % 2 ? 'US500' : 'EURUSD',
    time: T + Math.floor(i / 2) * 100 + (i === 123 ? -500 : 0),
    receivedAt: T + i * 100,
    bid: i % 2 ? 6200.1 + (i % 10) / 10 : Math.round((1.1 + (i % 10) / 10000) * 100000) / 100000,
    ask: i % 2 ? 6201.1 + (i % 10) / 10 : Math.round((1.1001 + (i % 10) / 10000) * 100000) / 100000,
    timestampFallback: i === 10 ? 1 : 0,
  }));
  ticks.push({ ...ticks[0]!, id: 3000, bid: 0.30000000000000004, ask: 0.4000000000000001 });
  const p = packTicks(ticks);
  expect(unpackTicks(p.payload, p.sha256)).toEqual(ticks);
  expect(p.bytes).toBeLessThan(ticks.length * 15);
  const corrupted = new Uint8Array(p.payload);
  corrupted[0] = 0;
  expect(() => unpackTicks(corrupted, p.sha256)).toThrow('checksum');
});
