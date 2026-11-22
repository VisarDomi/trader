/**
 * What the money could have done instead over a comparison's dates (EVIDENCE.md "Cash and inflation").
 *
 * Cash, the opportunity cost: rolling 3-month US Treasury bills, the safe home for money that must stay available.
 * FRED DTB3 is the secondary-market rate on the bank-discount basis; it is converted to the bond-equivalent yield the
 * bill actually pays and accrued every calendar day at the latest published rate. A longer Treasury is not the floor:
 * its price moves with interest rates, so holding one is another play.
 *
 * Inflation: US CPI-U, all items, not seasonally adjusted (FRED CPIAUCNS, the index TIPS are paid on). The accounts are
 * in US dollars, so it is the dollar's consumer prices; producer prices (PPI) are not what money buys. A month's index
 * is that month's average price level, so it sits mid-month and days in between interpolate geometrically. Days after
 * the latest published month continue its trailing 12-month pace and are marked estimated until the next release.
 *
 * What owning an instrument pays, for the outright 1:1 hold (hold.ts): dividends of the shares and of the index
 * trackers (SPY, QQQ, DIA; Yahoo Finance, as a fraction of the previous close on each ex-date), and the foreign
 * deposit rate for a currency held instead of dollars (€STR, SONIA, Australia's 3-month interbank rate; FRED).
 *
 * The series live in the arena database. The refresher keeps them current (bill rates fall back to treasury.gov)
 * and a failed refresh keeps what is stored, so a restart without network still answers.
 */
import type { Hurdles } from '@trader/shared/types';
import type { ArenaDB } from './db.ts';
import { DAY_MS, HOUR_MS } from '../engine/clock.ts';

export const BILLS = 'DTB3';
export const CPI = 'CPIAUCNS';
export interface Point { t: number; value: number }
/** A currency held instead of dollars earns its overnight or 3-month deposit rate (percent a year, FRED). */
export const DEPOSITS: Record<string, { currency: string; series: string; name: string; basis: number }> = {
  EURUSD: { currency: 'EUR', series: 'ECBESTRVOLWGTTRMDMNRT', name: '€STR', basis: 360 },
  GBPUSD: { currency: 'GBP', series: 'IUDSOIA', name: 'SONIA', basis: 365 },
  AUDUSD: { currency: 'AUD', series: 'IR3TIB01AUM156N', name: 'AUD 3-month rate', basis: 365 },
};
/** Dividends an outright holder collects: the index trackers and the shares themselves. */
export const DIVIDENDS: Record<string, string> = {
  US500: 'SPY', US100: 'QQQ', US30: 'DIA',
  NVDA: 'NVDA', MSFT: 'MSFT', AAPL: 'AAPL', AMZN: 'AMZN', AVGO: 'AVGO', META: 'META', GOOGL: 'GOOGL', TSLA: 'TSLA',
};
const dividendSeries = (epic: string) => `DIV:${epic}`;

const REFRESH_MS = 6 * HOUR_MS, RETRY_MS = 30 * 60_000, TIMEOUT_MS = 30_000;
const FETCHED_KEY = 'rates.fetchedAt';
const HISTORY_FROM = '2000-01-01';

/** A 91-day bill's bank-discount rate (percent) as the bond-equivalent yield it pays (a fraction a year). */
export const billYield = (discountPct: number): number => {
  const d = discountPct / 100;
  return (365 * d) / (360 - 91 * d);
};
const dayOf = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;
/** The middle of a month: where its average price level belongs. */
const midMonth = (t: number) => {
  const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
  return Date.UTC(y, m, 1) + (new Date(Date.UTC(y, m + 1, 0)).getUTCDate() * DAY_MS) / 2;
};

/** Interest accrued every calendar day at the latest published rate; any period's growth in constant time. */
export class Accrual {
  private readonly start: number;
  /** ln growth from `start` to the start of each day, plus one past the last observed day. */
  private readonly growth: Float64Array;
  private readonly daily: Float64Array;
  readonly through: number;

  /** `perDay` turns a published value into the fraction earned per calendar day. */
  constructor(points: readonly Point[], perDay: (value: number) => number) {
    if (!points.length) throw Error('Accrual needs observations');
    this.start = dayOf(points[0]!.t);
    this.through = dayOf(points.at(-1)!.t);
    const days = (this.through - this.start) / DAY_MS + 1;
    this.daily = new Float64Array(days);
    this.growth = new Float64Array(days + 1);
    for (let i = 0, j = 0; i < days; i++) {
      const t = this.start + i * DAY_MS;
      while (j + 1 < points.length && dayOf(points[j + 1]!.t) <= t) j++;
      // Weekends and holidays keep the last published rate: deposits and bills earn every calendar day.
      this.daily[i] = Math.log1p(perDay(points[j]!.value));
      this.growth[i + 1] = this.growth[i]! + this.daily[i]!;
    }
  }

  /** ln growth from the first observed day to t; null before it. After the latest rate, that rate continues. */
  log(t: number): number | null {
    if (!Number.isFinite(t) || t < this.start) return null;
    const n = this.daily.length, x = (t - this.start) / DAY_MS, i = Math.floor(x);
    if (i >= n) return this.growth[n]! + this.daily[n - 1]! * (x - n);
    return this.growth[i]! + this.daily[i]! * (x - i);
  }

  /** Growth from `from` to `through` as a return; null outside the stored history. */
  over(from: number, through: number): number | null {
    const a = this.log(from), b = this.log(through);
    return a === null || b === null || through < from ? null : Math.expm1(b - a);
  }
}

/** Precomputed growth indexes: any period's cash return and inflation in constant time. */
export class RateBook {
  private readonly bills: Accrual;
  private readonly billsThrough: number;
  private readonly anchors: number[];
  private readonly logs: number[];
  private readonly pace: number;
  private readonly cpiThrough: string;

  constructor(bills: readonly Point[], cpi: readonly Point[]) {
    if (!bills.length || !cpi.length) throw Error('Rates need bill and CPI observations');
    this.bills = new Accrual(bills, v => billYield(v) / 365);
    this.billsThrough = this.bills.through;
    this.anchors = cpi.map(p => midMonth(p.t));
    this.logs = cpi.map(p => Math.log(p.value));
    const n = cpi.length - 1, k = Math.max(0, n - 12);
    this.pace = n > k ? (this.logs[n]! - this.logs[k]!) / (this.anchors[n]! - this.anchors[k]!) : 0;
    this.cpiThrough = new Date(cpi.at(-1)!.t).toISOString().slice(0, 7);
  }

  /** What rolled T-bills paid from `from` to `through` (Sharpe's floor). */
  cash(from: number, through: number): number | null {
    return this.bills.over(from, through);
  }

  private cashLog(t: number): number | null {
    return this.bills.log(t);
  }

  private priceLog(t: number): number | null {
    const a = this.anchors, n = a.length - 1;
    if (t < a[0]!) return null;
    if (t >= a[n]!) return this.logs[n]! + this.pace * (t - a[n]!);
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid]! <= t) lo = mid;
      else hi = mid;
    }
    return this.logs[lo]! + ((this.logs[hi]! - this.logs[lo]!) * (t - a[lo]!)) / (a[hi]! - a[lo]!);
  }

  /** Cash return and inflation from `from` to `through`; null when the stored series do not reach back that far. */
  over(from: number, through: number): Hurdles | null {
    if (!Number.isFinite(from) || !Number.isFinite(through) || through < from) return null;
    const c0 = this.cashLog(from), c1 = this.cashLog(through), p0 = this.priceLog(from), p1 = this.priceLog(through);
    if (c0 === null || c1 === null || p0 === null || p1 === null) return null;
    return { cash: Math.expm1(c1 - c0), inflation: Math.expm1(p1 - p0), billsThrough: this.billsThrough,
      cpiThrough: this.cpiThrough, estimated: through > this.anchors.at(-1)! };
  }
}

/** FRED's graph CSV: `observation_date,SERIES` then `YYYY-MM-DD,value` ('.' marks a missing day). */
export function parseFred(csv: string): Point[] {
  const out: Point[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const m = /^(\d{4})-(\d{2})-(\d{2}),(-?\d+(?:\.\d+)?)$/.exec(line.trim());
    if (m) out.push({ t: Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!), value: Number(m[4]) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** treasury.gov daily bill rates: the 13-week bank-discount column is FRED's DTB3. */
export function parseTreasuryBills(csv: string): Point[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  const head = (lines[0] ?? '').split(',').map(h => h.replaceAll('"', '').trim().toUpperCase());
  const col = head.indexOf('13 WEEKS BANK DISCOUNT');
  if (col < 0) return [];
  const out: Point[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(','), m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0]?.trim() ?? ''), v = Number(cells[col]);
    if (m && cells[col]?.trim() && Number.isFinite(v)) out.push({ t: Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!), value: v });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Yahoo's chart JSON → dividends as fractions of the last close before each ex-date (times in ms). */
export function parseYahooDividends(body: any): Point[] {
  const r = body?.chart?.result?.[0];
  const times: number[] = r?.timestamp ?? [], closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  if (!times.length || times.length !== closes.length) throw Error('Yahoo chart without prices');
  const out: Point[] = [];
  for (const d of Object.values<any>(r?.events?.dividends ?? {})) {
    const at = Number(d?.date), amount = Number(d?.amount);
    if (!(at > 0) || !(amount > 0)) continue;
    let close: number | null = null;
    for (let i = times.length - 1; i >= 0; i--) if (times[i]! < at && closes[i] != null && closes[i]! > 0) { close = closes[i]!; break; }
    if (close) out.push({ t: at * 1000, value: amount / close });
  }
  return out.sort((a, b) => a.t - b.t);
}

const plausible = (points: Point[], lo: number, hi: number, min: number) =>
  points.length >= min && points.every(p => Number.isFinite(p.value) && p.value >= lo && p.value <= hi);

/** The stored series, their refresher, and the read the evidence service uses. */
export class Rates {
  private book: RateBook | null = null;
  private deposits = new Map<string, Accrual>();
  private dividends = new Map<string, Point[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private failing = false;
  /** Called after stored series change (the arena re-scores stored Sharpe ratios). */
  onReload: (() => void) | null = null;

  constructor(private readonly db: ArenaDB, private readonly get: (url: string) => Promise<string> = download, private readonly pauseMs = 1500) {
    this.reload();
  }

  over(from: number, through: number): Hurdles | null {
    return this.book?.over(from, through) ?? null;
  }

  /** Rolled T-bills from `from` to `through`; null without stored rates for those dates. */
  cash(from: number, through: number): number | null {
    return this.book?.cash(from, through) ?? null;
  }

  /** Interest on the foreign currency an outright EURUSD/GBPUSD/AUDUSD holder owns; null when not stored. */
  deposit(epic: string, from: number, through: number): number | null {
    return this.deposits.get(epic)?.over(from, through) ?? null;
  }

  /** Dividends collected from `from` (exclusive) to `through` (inclusive) as one growth factor − 1, and how many;
   *  null when the instrument's dividends were never fetched. */
  dividendsOver(epic: string, from: number, through: number): { income: number; count: number } | null {
    const events = this.dividends.get(epic);
    if (!events) return null;
    let growth = 1, count = 0;
    for (const d of events) if (d.t > from && d.t <= through) { growth *= 1 + d.value; count++; }
    return { income: growth - 1, count };
  }

  private reload(): void {
    const bills = this.db.macroSeries(BILLS), cpi = this.db.macroSeries(CPI);
    this.book = bills.length && cpi.length ? new RateBook(bills, cpi) : null;
    this.deposits = new Map();
    for (const [epic, d] of Object.entries(DEPOSITS)) {
      const points = this.db.macroSeries(d.series);
      if (points.length) this.deposits.set(epic, new Accrual(points, v => v / 100 / d.basis));
    }
    this.dividends = new Map();
    for (const epic of Object.keys(DIVIDENDS))
      if (this.db.getSetting<number | null>(`rates.dividends.${epic}`, null) !== null) this.dividends.set(epic, this.db.macroSeries(dividendSeries(epic)));
    this.onReload?.();
  }

  start(): void {
    this.running = true;
    const due = this.db.getSetting<number>(FETCHED_KEY, 0) + REFRESH_MS - Date.now();
    const complete = this.book && this.deposits.size === Object.keys(DEPOSITS).length && this.dividends.size === Object.keys(DIVIDENDS).length;
    this.schedule(complete ? Math.max(5_000, due) : 5_000);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh().then(ok => this.schedule(ok ? REFRESH_MS : RETRY_MS)), ms);
  }

  /** Fetches both series; each one that arrives and looks right is stored. True when both were refreshed. */
  async refresh(now = Date.now()): Promise<boolean> {
    const errors: string[] = [];
    const fred = (id: string) => this.get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${HISTORY_FROM}`).then(parseFred);
    let bills = await fred(BILLS).catch((e: unknown) => (errors.push(`FRED ${BILLS}: ${String(e)}`), [] as Point[]));
    if (!plausible(bills, -1, 25, 100)) {
      const year = new Date(now).getUTCFullYear();
      const treasury = (y: number) => this.get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_bill_rates&field_tdr_date_value=${y}&page&_format=csv`).then(parseTreasuryBills);
      bills = (await Promise.all([treasury(year - 1), treasury(year)]).catch((e: unknown) => (errors.push(`treasury.gov: ${String(e)}`), [[], []] as Point[][]))).flat();
    }
    const cpi = await fred(CPI).catch((e: unknown) => (errors.push(`FRED ${CPI}: ${String(e)}`), [] as Point[]));
    const billsOk = plausible(bills, -1, 25, 20), cpiOk = plausible(cpi, 5, 5000, 24);
    if (billsOk) this.db.saveMacroSeries(BILLS, bills);
    if (cpiOk) this.db.saveMacroSeries(CPI, cpi);
    const missing = [billsOk ? '' : 'bills', cpiOk ? '' : 'CPI'];
    for (const [epic, d] of Object.entries(DEPOSITS)) {
      const points = await fred(d.series).catch((e: unknown) => (errors.push(`FRED ${d.series}: ${String(e)}`), [] as Point[]));
      if (plausible(points, -2, 30, 12)) this.db.saveMacroSeries(d.series, points);
      else missing.push(d.name);
    }
    for (const [epic, symbol] of Object.entries(DIVIDENDS)) {
      // One request at a time, spaced: Yahoo answers bursts with 429.
      if (this.pauseMs) await new Promise(resolve => setTimeout(resolve, this.pauseMs));
      const events = await this.yahooDividends(symbol).catch((e: unknown) => (errors.push(`Yahoo ${symbol}: ${String(e)}`), null));
      if (events && events.every(p => p.value > 0 && p.value < 0.2)) {
        this.db.saveMacroSeries(dividendSeries(epic), events);
        this.db.setSetting(`rates.dividends.${epic}`, now);
      } else missing.push(`${symbol} dividends`);
    }
    this.reload();
    const ok = missing.every(m => !m);
    if (ok) {
      this.db.setSetting(FETCHED_KEY, now);
      if (this.failing) this.db.event('info', 'rates', 'Treasury bills, CPI, deposit rates and dividends refreshed again');
    } else if (!this.failing) {
      this.db.event('warn', 'rates', `Rate refresh incomplete (${missing.filter(Boolean).join(', ')}); ` +
        `keeping the stored series and retrying every 30 minutes. ${errors.join('; ').slice(0, 1200)}`);
    }
    this.failing = !ok;
    return ok;
  }

  /** Ex-dates and each dividend as a fraction of the previous close (Yahoo Finance daily chart, unadjusted closes). */
  private async yahooDividends(symbol: string): Promise<Point[]> {
    const body = JSON.parse(await this.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${Date.UTC(2015, 0, 1) / 1000}&period2=${Math.floor(Date.now() / 1000)}&events=div`));
    return parseYahooDividends(body);
  }
}

async function download(url: string): Promise<string> {
  // Yahoo refuses unnamed clients and FRED refuses that generic browser name (2026-11-22: HTTP/2 resets), so only
  // Yahoo gets it. Nothing about the user is sent.
  const headers: Record<string, string> = new URL(url).hostname.endsWith('yahoo.com') ? { 'User-Agent': 'Mozilla/5.0' } : {};
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers });
  if (!res.ok) throw Error(`HTTP ${res.status}`);
  return res.text();
}
