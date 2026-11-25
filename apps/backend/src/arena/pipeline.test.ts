import { ENGINE_VERSION } from '../engine/version.ts';
import { describe, expect, test } from 'bun:test';
import { admissionGate, backtestGate, floorMet, isCandidate, loserMature } from './pipeline.ts';
import type { RunRow } from './db.ts';
import { closingDirection, confirmsDeal, scaledSize } from './broker.ts';
import { getInstrument } from '../engine/instruments.ts';
import { RUN_STATUS } from '../engine/run.ts';
import {PRIMARY_BACKTEST_WINDOW_ID} from '../engine/run-id.ts';
const EPIC = 'EURUSD';
const BUY = 'BUY';
const ACCEPTED = 'ACCEPTED';
const HASH = 'code';
const SLUG = 'ema-cross';
const NOW = Date.now();
const DAY = 86_400_000;
const row = {
  window_id:PRIMARY_BACKTEST_WINDOW_ID,
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
    expect(backtestGate({...row,window_id:'short-debug-window'},HASH,SLUG).passed).toBe(false);
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
  test('the gate checks the Sharpe of the returns themselves, not the one shown above T-bills', () => {
    // A rarely invested low-leverage variant: positive on its own, far below T-bills.
    const sparse = { ...row, metrics: JSON.stringify({ sharpe: -2.7, cashFreeSharpe: 0.3, riskFree: 'tbills', trades: 50, finalEquity: 10400 }) };
    expect(backtestGate(sparse, HASH, SLUG).passed).toBe(true);
    const losing = { ...row, metrics: JSON.stringify({ sharpe: -1.1, cashFreeSharpe: -0.6, riskFree: 'tbills', trades: 50, finalEquity: 9000 }) };
    expect(backtestGate(losing, HASH, SLUG)).toEqual({ passed: false, reason: 'backtest Sharpe before T-bills -0.60 below -0.5' });
  });
  test('a lucky early winner cannot jump straight into Capital demo', () => {
    // Candidates need ten closed trades, 42 days observed, a daily t of 2 and to be above the instrument's luckiest monkey.
    expect(isCandidate(30, 41, 3.5, null)).toBe(false);
    expect(isCandidate(30, 42, 3.5, null)).toBe(true);
    expect(isCandidate(9, 400, 3.5, null)).toBe(false);
    expect(isCandidate(10, 42, 1.99, null)).toBe(false);
    expect(isCandidate(10, 42, 2, null)).toBe(true);
    expect(isCandidate(10, 42, 2.4, 2.4)).toBe(false);
    expect(isCandidate(10, 42, 2.4, 2.39)).toBe(true);
    expect(floorMet(10, 42)).toBe(true);
    expect(floorMet(10, 41.9)).toBe(false);
  });
  test('losing evidence acts after thirty trades, or ten on a record three months long', () => {
    expect(loserMature(30, 42)).toBe(true);
    expect(loserMature(30, 41)).toBe(false);
    expect(loserMature(29, 89)).toBe(false);
    expect(loserMature(10, 90)).toBe(true);
    expect(loserMature(9, 400)).toBe(false);
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
  test('a close confirmation carries the closing direction, so a long closes as SELL', () => {
    // Shape of a real EURUSD close confirmation (Arena 01 round trip, 2026-11-09).
    const close = {
      dealStatus: ACCEPTED,
      status: 'CLOSED',
      epic: EPIC,
      dealId: 'ours',
      affectedDeals: [{ dealId: 'ours', status: 'FULLY_CLOSED' }] as { dealId: string; status: string }[],
      direction: 'SELL',
      size: 100,
      level: 1.1192,
      profit: -0.007,
    } as const;
    expect(closingDirection('long')).toBe('SELL');
    expect(closingDirection('short')).toBe('BUY');
    expect(confirmsDeal(close, { epic: EPIC, direction: closingDirection('long'), size: 100, dealId: 'ours' })).toBe(true);
    expect(confirmsDeal(close, { epic: EPIC, direction: 'BUY', size: 100, dealId: 'ours' })).toBe(false);
  });
  test('scaled mirror sizes round down and do not inflate tiny orders without limit', () => {
    expect(scaledSize(getInstrument(EPIC), 10000, 0.2)).toBe(2000);
    expect(scaledSize(getInstrument(EPIC), 100, 0.2)).toBeNull();
  });
});

test('verdicts read the record clock: early, keep, candidate, confirmed and retire', async () => {
  const { assess, VERDICT } = await import('@trader/shared');
  const clock = { since: NOW - 60 * DAY, days: 60, trades: 40, observations: 43, t: 0.4, monkey: 1.1, life: { observations: 43, t: 0.4, e: 0.5 }, backtestZ: 0.3, trials: 844, confirmAt: 5.4, aloneAt: 3.4, confirmed: false };
  const row = (c: object, extra: object = {}) => ({ slug: SLUG, agentId: SLUG, status: 'running', epic: EPIC, startedAt: NOW - 100 * DAY, metrics: { trades: 100, tStat: -3 }, evidence: { clock: { ...clock, ...c } }, ...extra }) as any;
  expect(assess(row({}), NOW)).toMatchObject({ verdict: VERDICT.KEEP, reason: 'daily t = 0.40 over 60 days and 40 trades' });
  // A demoted run is judged on its fresh window, not its old losing record.
  expect(assess(row({ since: NOW - DAY, days: 1, trades: 0, t: 0 }), NOW).verdict).toBe(VERDICT.EARLY);
  expect(assess(row({ trades: 9 }), NOW).reason).toBe('9 trades in 60 days (judged from 10 trades and 42 days)');
  expect(assess(row({ t: 2.3 }), NOW)).toMatchObject({ verdict: VERDICT.CANDIDATE, reason: 'daily t = 2.30 over 60 days and 40 trades, above every monkey; may still be luck' });
  expect(assess(row({ t: 2.3, monkey: 2.5 }), NOW).verdict).toBe(VERDICT.KEEP);
  expect(assess(row({ t: 2.3, trades: 12 }), NOW).verdict).toBe(VERDICT.CANDIDATE);
  expect(assess(row({ t: 5.1, confirmed: true }), NOW)).toMatchObject({ verdict: VERDICT.CONFIRMED, reason: 'daily t = 5.10 over 60 days and 40 trades; clears the bar for all 844 records tried and agrees with its backtest' });
  // Losing evidence needs thirty trades (or ten over three months); below that a losing t only keeps.
  expect(assess(row({ t: -1 }), NOW)).toMatchObject({ verdict: VERDICT.RETIRE, reason: 'losing: daily t = -1.00 over 60 days and 40 trades' });
  expect(assess(row({ t: -1.5, trades: 12 }), NOW).verdict).toBe(VERDICT.KEEP);
  expect(assess(row({ t: -1.5, trades: 12, days: 90 }), NOW).verdict).toBe(VERDICT.RETIRE);
  expect(assess(row({ t: 9, confirmed: true }, { slug: 'random-baseline' }), NOW).verdict).toBe(VERDICT.CONTROL);
});
