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
 * The series live in the arena database. The refresher keeps them current from FRED (bill rates fall back to
 * treasury.gov) and a failed refresh keeps what is stored, so a restart without network still answers.
 */
import type { Hurdles } from '@trader/shared/types';
import type { ArenaDB } from './db.ts';
import { DAY_MS, HOUR_MS } from '../engine/clock.ts';

export const BILLS = 'DTB3';
export const CPI = 'CPIAUCNS';
export interface Point { t: number; value: number }

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

/** Precomputed growth indexes: any period's cash return and inflation in constant time. */
export class RateBook {
  private readonly start: number;
  /** ln growth of rolled bills from `start` to the start of each day, plus one past the last bill day. */
  private readonly growth: Float64Array;
  private readonly daily: Float64Array;
  private readonly billsThrough: number;
  private readonly anchors: number[];
  private readonly logs: number[];
  private readonly pace: number;
  private readonly cpiThrough: string;

  constructor(bills: readonly Point[], cpi: readonly Point[]) {
    if (!bills.length || !cpi.length) throw Error('Rates need bill and CPI observations');
    this.start = dayOf(bills[0]!.t);
    this.billsThrough = dayOf(bills.at(-1)!.t);
    const days = (this.billsThrough - this.start) / DAY_MS + 1;
    this.daily = new Float64Array(days);
    this.growth = new Float64Array(days + 1);
    for (let i = 0, j = 0; i < days; i++) {
      const t = this.start + i * DAY_MS;
      while (j + 1 < bills.length && dayOf(bills[j + 1]!.t) <= t) j++;
      // Weekends and holidays keep the last published rate: a bill earns every calendar day.
      this.daily[i] = Math.log1p(billYield(bills[j]!.value) / 365);
      this.growth[i + 1] = this.growth[i]! + this.daily[i]!;
    }
    this.anchors = cpi.map(p => midMonth(p.t));
    this.logs = cpi.map(p => Math.log(p.value));
    const n = cpi.length - 1, k = Math.max(0, n - 12);
    this.pace = n > k ? (this.logs[n]! - this.logs[k]!) / (this.anchors[n]! - this.anchors[k]!) : 0;
    this.cpiThrough = new Date(cpi.at(-1)!.t).toISOString().slice(0, 7);
  }

  private cashLog(t: number): number | null {
    if (t < this.start) return null;
    const n = this.daily.length, x = (t - this.start) / DAY_MS, i = Math.floor(x);
    // After the latest published rate the last one continues.
    if (i >= n) return this.growth[n]! + this.daily[n - 1]! * (x - n);
    return this.growth[i]! + this.daily[i]! * (x - i);
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

const plausible = (points: Point[], lo: number, hi: number, min: number) =>
  points.length >= min && points.every(p => Number.isFinite(p.value) && p.value >= lo && p.value <= hi);

/** The stored series, their refresher, and the read the evidence service uses. */
export class Rates {
  private book: RateBook | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private failing = false;

  constructor(private readonly db: ArenaDB, private readonly get: (url: string) => Promise<string> = download) {
    this.reload();
  }

  over(from: number, through: number): Hurdles | null {
    return this.book?.over(from, through) ?? null;
  }

  private reload(): void {
    const bills = this.db.macroSeries(BILLS), cpi = this.db.macroSeries(CPI);
    this.book = bills.length && cpi.length ? new RateBook(bills, cpi) : null;
  }

  start(): void {
    this.running = true;
    const due = this.db.getSetting<number>(FETCHED_KEY, 0) + REFRESH_MS - Date.now();
    this.schedule(this.book ? Math.max(5_000, due) : 5_000);
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
    if (billsOk || cpiOk) this.reload();
    const ok = billsOk && cpiOk;
    if (ok) {
      this.db.setSetting(FETCHED_KEY, now);
      if (this.failing) this.db.event('info', 'rates', 'Treasury bill and CPI series refreshed again');
    } else if (!this.failing) {
      this.db.event('warn', 'rates', `Rate refresh incomplete (${[billsOk ? '' : 'bills', cpiOk ? '' : 'CPI'].filter(Boolean).join(', ')}); ` +
        `keeping the stored series and retrying every 30 minutes. ${errors.join('; ')}`);
    }
    this.failing = !ok;
    return ok;
  }
}

async function download(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw Error(`HTTP ${res.status}`);
  return res.text();
}
