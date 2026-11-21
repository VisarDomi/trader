import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import { check, type State } from './watchdog.ts';

const NOW = Date.UTC(2026, 9, 19, 14), HOUR = 3600_000;
const FETCH = spyOn(globalThis, 'fetch');
afterEach(() => FETCH.mockReset());
afterAll(() => FETCH.mockRestore());

function fixture(startedAt: number, ready: boolean, reportAt = NOW, crypto = {lastCandle: NOW, marketStatus: 'TRADEABLE'}) {
  const response = async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL(String(input)).pathname;
    const data = path === '/api/status' ? {
      startedAt, execution: {ready}, stream: {connected:true},
      quotes: {BTCUSD:{lastCandle:crypto.lastCandle}, ETHUSD:{lastCandle:crypto.lastCandle}},
      forecaster: {reachable:false, lastSuccessAt:0}, loadErrors:[], tickStorage:{at:reportAt,warning:false},
    } : path === '/api/broker' ? {status:{accounts:[],prefix:'Arena'}}
      : path === '/api/execution' ? {virtual:{markets:['BTCUSD','ETHUSD'].map(epic => ({epic, updatedAt:NOW - 60_000, marketStatus:crypto.marketStatus}))}} : [];
    return Response.json(data);
  };
  FETCH.mockImplementation(Object.assign(response, {preconnect: () => {}}));
  const state: State = {active:{},streaks:{},firstSeen:{},expectedAccounts:9};
  return state;
}

test('a restart does not notify the user that warming accounts disappeared or the forecaster has been down for an hour', async () => {
  for (const ready of [false, true]) {
    const alerts = await check(fixture(NOW - 10_000, ready), NOW, false);
    expect(alerts.filter(a => a.userAction || a.key === 'forecaster')).toEqual([]);
  }
});

test('missing accounts and a failed forecaster are still reported after startup grace', async () => {
  const alerts = await check(fixture(NOW - 2 * HOUR, true), NOW, false);
  expect(alerts.some(a => a.key === 'accounts-missing' && a.userAction)).toBeTrue();
  expect(alerts.some(a => a.key === 'forecaster')).toBeTrue();
});

test('an old storage estimate is detected even when its last projection was below budget', async () => {
  const alerts = await check(fixture(NOW - 8 * HOUR, true, NOW - 7 * HOUR), NOW, false);
  expect(alerts.some(a => a.key === 'storage-stale' && a.needsStreak)).toBeTrue();
});

test('an explicit heavy-resource pause suppresses model/lab alarms while account and storage checks continue', async () => {
  const alerts = await check(fixture(NOW - 8 * HOUR, true, NOW - 7 * HOUR), NOW, true);
  expect(alerts.some(a => a.key === 'forecaster' || a.key === 'unit:trader-forecaster.service' || a.key === 'nightly')).toBeFalse();
  expect(alerts.some(a => a.key === 'accounts-missing')).toBeTrue();
  expect(alerts.some(a => a.key === 'storage-stale')).toBeTrue();
});

test("stale crypto candles alert unless Capital itself reports the market closed (Saturday's maintenance)", async () => {
  const stale = NOW - HOUR;
  const open = await check(fixture(NOW - 8 * HOUR, true, NOW, {lastCandle: stale, marketStatus: 'TRADEABLE'}), NOW, false);
  expect(open.filter(a => a.key.startsWith('candles:')).length).toBe(2);
  const closed = await check(fixture(NOW - 8 * HOUR, true, NOW, {lastCandle: stale, marketStatus: 'CLOSED'}), NOW, false);
  expect(closed.some(a => a.key.startsWith('candles:'))).toBeFalse();
});
