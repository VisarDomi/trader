import { ENGINE_VERSION } from '../engine/version.ts';
import { describe, expect, test } from 'bun:test';
import { admissionGate, backtestGate, virtualEligible, tradeT } from './pipeline.ts';
import type { RunRow } from './db.ts';
import type { Trade } from '../sdk/types.ts';
import { confirmsDeal, scaledSize } from './broker.ts';
import { getInstrument } from '../engine/instruments.ts';
import { RUN_STATUS } from '../engine/run.ts';
const EPIC = 'EURUSD';
const BUY = 'BUY';
const ACCEPTED = 'ACCEPTED';
const HASH = 'code';
const SLUG = 'ema-cross';
const NOW = Date.now();
const DAY = 86_400_000;
const row = {
  code_hash: HASH,
  extra: JSON.stringify({ engineVersion: ENGINE_VERSION }),
  status: 'completed',
  metrics: JSON.stringify({ sharpe: 0.4, trades: 50, finalEquity: 11000 }),
} as RunRow;
describe('stage gates', () => {
  test('a requested demo experiment bypasses performance gates but requires the tested code and engine', () => {
    const exception = { date: '2026-10-15', reason: 'user requested special demo admission' };
    const bad: RunRow = { ...row, status: RUN_STATUS.BUSTED, metrics: JSON.stringify({ sharpe: -2, trades: 50, finalEquity: 0 }) };
    expect(admissionGate(bad, HASH, SLUG, null).passed).toBe(false);
    expect(admissionGate(bad, HASH, SLUG, exception).passed).toBe(true);
    expect(admissionGate(undefined, HASH, SLUG, exception).passed).toBe(false);
    expect(admissionGate(bad, 'changed', SLUG, exception).passed).toBe(false);
    expect(admissionGate({ ...bad, extra: '{}' }, HASH, SLUG, exception).passed).toBe(false);
    expect(admissionGate({ ...bad, status: RUN_STATUS.ERROR }, HASH, SLUG, exception).passed).toBe(false);
    expect(admissionGate({ ...bad, extra: JSON.stringify({ engineVersion: ENGINE_VERSION, errors: 1 }) }, HASH, SLUG, exception).passed).toBe(false);
  });
  test('new virtual runs need current-code, nonbroken backtests', () => {
    expect(backtestGate(undefined, HASH, SLUG).passed).toBe(false);
    expect(backtestGate(row, 'new-code', SLUG).passed).toBe(false);
    expect(backtestGate(row, HASH, SLUG).passed).toBe(true);
    expect(backtestGate({ ...row, status: 'busted' }, HASH, SLUG).passed).toBe(false);
    expect(
      backtestGate(
        {
          ...row,
          metrics: JSON.stringify({
            sharpe: -0.6,
            trades: 500,
            finalEquity: 9000,
          }),
        },
        HASH,
        SLUG,
      ).passed,
    ).toBe(false);
  });
  test('a lucky early winner cannot jump straight into Capital demo', () => {
    const trades = Array.from({ length: 30 }, (_, i) => ({
      pnl: i % 2 ? 10 : 20,
    })) as Trade[];
    expect(tradeT(trades)).toBeGreaterThan(2);
    expect(virtualEligible(trades, NOW - 27 * DAY, NOW, 0)).toBe(false);
    expect(virtualEligible(trades, NOW - 28 * DAY, NOW, 0)).toBe(true);
    expect(virtualEligible(trades, NOW - 28 * DAY, NOW, 100)).toBe(false);
    expect(virtualEligible(trades.slice(0, 10), NOW - 28 * DAY, NOW, 0)).toBe(false);
  });
});
describe('broker confirmation identity', () => {
  const deal = { epic: EPIC, direction: BUY, size: 100, dealId: 'ours' };
  const confirmation = {
    dealStatus: ACCEPTED,
    epic: EPIC,
    direction: BUY,
    size: 100,
    dealId: 'ours',
  } as const;
  test('accept only the intended deal, including affectedDeals', () => {
    expect(confirmsDeal(confirmation, deal)).toBe(true);
    expect(confirmsDeal({ ...confirmation, epic: 'AUDUSD' }, deal)).toBe(false);
    expect(confirmsDeal({ ...confirmation, dealId: 'other' }, deal)).toBe(false);
    expect(confirmsDeal({ dealStatus: ACCEPTED }, deal)).toBe(false);
    expect(
      confirmsDeal(
        {
          ...confirmation,
          dealId: 'reference',
          affectedDeals: [{ dealId: 'ours', status: 'OPENED' }],
        },
        deal,
      ),
    ).toBe(true);
  });
  test('scaled mirror sizes round down and do not inflate tiny orders without limit', () => {
    expect(scaledSize(getInstrument(EPIC), 10000, 0.2)).toBe(2000);
    expect(scaledSize(getInstrument(EPIC), 100, 0.2)).toBeNull();
  });
});

test('demoted runs are assessed on their fresh virtual window, not their old losing record', async () => {
  const { assess, VERDICT } = await import('@trader/shared');
  const r = { slug: SLUG, status: 'running', epic: EPIC, startedAt: NOW - 100 * DAY,
    metrics: { trades: 100, tStat: -3 }, observation: { since: NOW - DAY, trades: 0, tStat: 0 } } as any;
  expect(assess(r, new Map(), NOW).verdict).toBe(VERDICT.EARLY);
});
