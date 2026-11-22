import { expect, test } from 'bun:test';
import { computeMetrics, riskAdjusted } from './metrics.ts';

const DAY = 86_400_000;
// 60 daily returns alternating +0.30% and −0.10%: mean +0.10% a day.
const equity = [{ t: 0, equity: 10_000 }];
for (let i = 1; i <= 60; i++) equity.push({ t: i * DAY, equity: equity.at(-1)!.equity * (i % 2 ? 1.003 : 0.999) });
const years = 60 / 365.25;

test('Sharpe and Sortino measure each period\'s return above what T-bills paid over it', () => {
  const free = riskAdjusted(equity, years, null);
  expect(free.riskFree).toBeUndefined();
  // T-bills paying 0.05% a day halve the mean daily return, so they halve Sharpe (the spread is unchanged).
  const above = riskAdjusted(equity, years, (a, b) => 0.0005 * (b - a) / DAY);
  expect(above.riskFree).toBe('tbills');
  expect(above.cashFreeSharpe).toBe(free.sharpe);
  expect(above.sharpe).toBeCloseTo(free.sharpe / 2, 2);
  expect(above.sortino).toBeLessThan(free.sortino);
  // One period the rates do not cover: the whole curve stays cash-free, never half and half.
  expect(riskAdjusted(equity, years, (a, b) => (a < 10 * DAY ? null : 0.0005 * (b - a) / DAY))).toEqual(free);
});

test('metrics take the rates given, else the arena\'s', () => {
  const input = { trades: [], equity, initialCapital: 10_000, finalEquity: equity.at(-1)!.equity, startTime: 0, endTime: 60 * DAY, maxDrawdown: 0.001, exposure: 1 };
  expect(computeMetrics(input).riskFree).toBeUndefined();
  const m = computeMetrics({ ...input, riskFree: (a, b) => 0.0005 * (b - a) / DAY });
  expect(m).toMatchObject({ riskFree: 'tbills', cashFreeSharpe: computeMetrics(input).sharpe });
});
