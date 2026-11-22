import { expect, test } from 'bun:test';
import { ArenaDB } from './db.ts';
import { BILLS, CPI, RateBook, Rates, billYield, parseFred, parseTreasuryBills, type Point } from './rates.ts';

const DAY = 86_400_000;
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const months = (from: number, levels: number[]): Point[] => levels.map((value, i) => ({ t: Date.UTC(2025, from - 1 + i, 1), value }));

test('a bill\'s discount rate is converted to the yield it pays', () => {
  // treasury.gov, 2026-11-19: 13-week bank discount 4.16, coupon equivalent 4.26.
  expect(billYield(4.16) * 100).toBeCloseTo(4.26, 2);
});

test('cash accrues every calendar day at the latest published rate, and continues past the last one', () => {
  // Friday 4.0 discount, nothing on the weekend, Monday 5.0.
  const book = new RateBook([{ t: day(2026, 1, 2), value: 4 }, { t: day(2026, 1, 5), value: 5 }], months(1, [100, 101]));
  const y4 = billYield(4), y5 = billYield(5);
  // Friday → Monday: three days at Friday's rate.
  expect(book.over(day(2026, 1, 2), day(2026, 1, 5))!.cash).toBeCloseTo((1 + y4 / 365) ** 3 - 1, 12);
  // Half a day inside the series, and ten days past the last observation.
  expect(book.over(day(2026, 1, 2), day(2026, 1, 2) + DAY / 2)!.cash).toBeCloseTo((1 + y4 / 365) ** 0.5 - 1, 12);
  expect(book.over(day(2026, 1, 5), day(2026, 1, 15))!.cash).toBeCloseTo((1 + y5 / 365) ** 10 - 1, 12);
  // Before the stored history there is no answer, not a zero.
  expect(book.over(day(2025, 12, 1), day(2026, 1, 5))).toBeNull();
});

test('CPI sits mid-month, interpolates between months and extends the 12-month pace after the last release', () => {
  // 13 months rising 1% a month from 2025-01.
  const cpi = months(1, Array.from({ length: 13 }, (_, i) => 100 * 1.01 ** i));
  const book = new RateBook([{ t: day(2020, 1, 1), value: 4 }], cpi);
  const jan = day(2025, 1, 1) + 15.5 * DAY, feb = day(2025, 2, 1) + 14 * DAY;
  const r = book.over(jan, feb)!;
  expect(r.inflation).toBeCloseTo(0.01, 12);
  expect(r.estimated).toBe(false);
  expect(r.cpiThrough).toBe('2026-01');
  // Halfway between the anchors is half the month's change, geometrically.
  expect(book.over(jan, (jan + feb) / 2)!.inflation).toBeCloseTo(Math.sqrt(1.01) - 1, 12);
  // After the January 2026 release: the trailing 12-month pace (1% a month) continues, marked estimated.
  const last = day(2026, 1, 1) + 15.5 * DAY, after = book.over(last, last + 365 * DAY)!;
  expect(after.estimated).toBe(true);
  expect(after.inflation).toBeGreaterThan(0.12);
  expect(after.inflation).toBeLessThan(0.13);
  expect(book.over(day(2024, 12, 1), jan)).toBeNull();
});

test('FRED and treasury.gov files parse, skipping missing days', () => {
  expect(parseFred('observation_date,DTB3\n2026-11-19,4.16\n2026-11-20,.\n2026-11-18,4.15\n')).toEqual([
    { t: day(2026, 11, 18), value: 4.15 }, { t: day(2026, 11, 19), value: 4.16 }]);
  const csv = 'Date,"4 WEEKS BANK DISCOUNT","4 WEEKS COUPON EQUIVALENT","13 WEEKS BANK DISCOUNT","13 WEEKS COUPON EQUIVALENT"\n' +
    '11/20/2026,4.04,4.11,4.13,4.23\n11/19/2026,4.05,4.12,4.16,4.26\n';
  expect(parseTreasuryBills(csv)).toEqual([{ t: day(2026, 11, 19), value: 4.16 }, { t: day(2026, 11, 20), value: 4.13 }]);
  expect(parseTreasuryBills('Date,Other\n11/20/2026,1\n')).toEqual([]);
});

const fredBills = 'observation_date,DTB3\n' + Array.from({ length: 200 }, (_, i) => `${new Date(day(2026, 1, 1) + i * DAY).toISOString().slice(0, 10)},4.00`).join('\n');
const fredDeposit = 'observation_date,X\n' + Array.from({ length: 30 }, (_, i) => `${new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10)},3.00`).join('\n');
// A Yahoo chart: closes of 100 every day from 2026-01-01, one 0.50 dividend on 2026-03-02 (0.5%).
const yahoo = JSON.stringify({ chart: { result: [{ timestamp: Array.from({ length: 90 }, (_, i) => (Date.UTC(2026, 0, 1) + i * DAY) / 1000 + 52200),
  indicators: { quote: [{ close: Array.from({ length: 90 }, () => 100) }] }, events: { dividends: { x: { amount: 0.5, date: Date.UTC(2026, 2, 2) / 1000 + 52200 } } } }] } });
const answer = (url: string) => (url.includes('yahoo') ? yahoo : url.includes(BILLS) ? fredBills : url.includes(CPI) ? fredCpi : fredDeposit);
const fredCpi = 'observation_date,CPIAUCNS\n' + Array.from({ length: 30 }, (_, i) => `${new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10)},${(300 + i).toFixed(3)}`).join('\n');

test('a refresh stores both series; a failed one keeps them, falls back to treasury.gov for bills and warns once', async () => {
  const db = new ArenaDB(':memory:');
  const urls: string[] = [];
  let online = true;
  const rates = new Rates(db, async url => {
    urls.push(url);
    if (!online) throw Error('offline');
    return answer(url);
  }, 0);
  expect(rates.over(day(2026, 2, 1), day(2026, 3, 1))).toBeNull();
  expect(await rates.refresh()).toBe(true);
  expect(db.macroSeries(BILLS)).toHaveLength(200);
  expect(db.macroSeries(CPI)).toHaveLength(30);
  // Deposits and dividends: EURUSD earns 3% a year as a euro deposit; SPY's dividend counts for US500 once inside.
  expect(rates.deposit('EURUSD', day(2026, 2, 1), day(2026, 3, 1))).toBeCloseTo((1 + 0.03 / 360) ** 28 - 1, 12);
  expect(rates.dividendsOver('US500', day(2026, 2, 1), day(2026, 3, 1))).toEqual({ income: 0, count: 0 });
  expect(rates.dividendsOver('US500', day(2026, 3, 1), day(2026, 3, 3))!.income).toBeCloseTo(0.005, 12);
  expect(rates.dividendsOver('US500', day(2026, 3, 2) + 52_200_000, day(2026, 3, 3))!.count).toBe(0);   // from is exclusive
  expect(urls.filter(u => u.includes('yahoo'))).toHaveLength(11);
  const before = rates.over(day(2026, 2, 1), day(2026, 3, 1))!;
  expect(before.cash).toBeGreaterThan(0.003);
  // Offline: the stored series still answer, and a restart reads them from the database.
  online = false;
  urls.length = 0;
  expect(await rates.refresh()).toBe(false);
  expect(await rates.refresh()).toBe(false);
  expect(urls.some(u => u.includes('home.treasury.gov'))).toBe(true);
  expect(new Rates(db, async () => { throw Error('offline'); }).over(day(2026, 2, 1), day(2026, 3, 1))).toEqual(before);
  expect(db.events(10).filter(e => e.source === 'rates')).toHaveLength(1);
  // Implausible data is not stored.
  online = true;
  const bad = new Rates(db, async url => (url.includes(BILLS) ? fredBills.replace(/4\.00/g, '400.00') : answer(url)), 0);
  expect(await bad.refresh()).toBe(false);
  expect(db.macroSeries(BILLS).every(p => p.value === 4)).toBe(true);
  db.db.close();
});
