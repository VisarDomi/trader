/** Capital's observed market contract. Kept per instrument and shared by virtual runs. */
import type { Instrument } from './instruments.ts';
import type { Side, OrderOptions } from '../sdk/types.ts';
export const QUOTE_MAX_AGE_MS = 30_000;
export const RULE_MAX_AGE_MS = 3 * 60_000;
export const DEFAULT_EXECUTION_MS = 500;
export const VIRTUAL_MODEL = 'capital-v1';
export interface DistanceRule {
  unit: string;
  value: number;
}
export interface CapitalMarket {
  instrument: {
    overnightFee?: { longRate: number; shortRate: number };
    openingHours?: Record<string, unknown>;
  };
  dealingRules: {
    minDealSize: DistanceRule;
    maxDealSize: DistanceRule;
    minSizeIncrement: DistanceRule;
    minStopOrProfitDistance: DistanceRule;
    maxStopOrProfitDistance: DistanceRule;
  };
  snapshot: {
    marketStatus: string;
    decimalPlacesFactor: number;
    bid: number;
    offer: number;
  };
}
export class VirtualVenue {
  market: CapitalMarket | null = null;
  updatedAt = 0;
  constructor(readonly instrument: Instrument) {}
  update(market: CapitalMarket, now: number): void {
    const rules = market.dealingRules;
    if (![rules.minDealSize?.value, rules.maxDealSize?.value, rules.minSizeIncrement?.value].every(v => Number.isFinite(v) && v! > 0))
      throw new Error(`invalid dealing rules for ${this.instrument.epic}`);
    this.market = market;
    this.updatedAt = now;
    this.instrument.minSize = rules.minDealSize.value;
    this.instrument.maxSize = rules.maxDealSize.value;
    this.instrument.sizeStep = rules.minSizeIncrement.value;
    this.instrument.pricePrecision = market.snapshot.decimalPlacesFactor;
    const fee = market.instrument.overnightFee;
    if (fee && Number.isFinite(fee.longRate) && Number.isFinite(fee.shortRate)) {
      this.instrument.overnightLongPct = fee.longRate;
      this.instrument.overnightShortPct = fee.shortRate;
    }
  }
  problem(now: number, quoteTime: number): string | null {
    if (!this.market || now - this.updatedAt > RULE_MAX_AGE_MS) return 'market rules unavailable or stale';
    if (this.market.snapshot.marketStatus !== 'TRADEABLE') return 'market closed';
    if (now - quoteTime > QUOTE_MAX_AGE_MS || quoteTime > now + 1000) return 'quote unavailable or stale';
    return null;
  }
  stopsProblem(side: Side, bid: number, ask: number, opts: OrderOptions): string | null {
    if (!this.market) return 'market rules unavailable';
    const ref = side === 'long' ? bid : ask;
    const distance = (r: DistanceRule) => (r.unit === 'PERCENTAGE' ? (ref * r.value) / 100 : r.value);
    if (opts.trailingStop !== undefined && opts.stopLoss !== undefined) return 'Capital has one stop: choose a fixed or trailing stop';
    const min = distance(this.market.dealingRules.minStopOrProfitDistance);
    const max = distance(this.market.dealingRules.maxStopOrProfitDistance);
    if (opts.trailingStop !== undefined && (!Number.isFinite(opts.trailingStop) || opts.trailingStop < min || opts.trailingStop > max))
      return 'trailing stop outside Capital distance';
    for (const [label, level, isStop] of [
      ['stopLoss', opts.stopLoss, true],
      ['takeProfit', opts.takeProfit, false],
    ] as const) {
      if (level === undefined) continue;
      const d = (side === 'long' ? 1 : -1) * (isStop ? ref - level : level - ref);
      if (!Number.isFinite(level) || d < min - 1e-10 || d > max + 1e-10) return `${label} outside Capital distance ${min}–${max}`;
    }
    return null;
  }
}
/** One synthetic API login per scenario, with the arena's real pacing and hourly safeguards. */
export class VirtualGateway {
  nextSlot = 0;
  private account: number | null = null;
  private opens: number[] = [];
  private runOpens = new Map<string, number[]>();
  observeOpen(runId: string, time: number, now: number): void {
    if (now - time >= 3_600_000) return;
    const recent = this.runOpens.get(runId) ?? [];
    if (recent.includes(time)) return;
    recent.push(time); this.runOpens.set(runId, recent); this.opens.push(time);
  }
  reserve(runId: string, account: number, kind: string, now: number): number | string {
    const hour = 3_600_000;
    if (kind === 'open') {
      this.opens = this.opens.filter(t => now - t < hour);
      const recent = (this.runOpens.get(runId) ?? []).filter(t => now - t < hour);
      if (this.opens.length >= 600 || recent.length >= 12) return 'virtual API open-rate safeguard';
      this.opens.push(now);
      recent.push(now);
      this.runOpens.set(runId, recent);
    }
    let slot = Math.max(this.nextSlot, now);
    if (this.account !== account) {
      slot += 2 * 170;
      this.account = account;
    }
    this.nextSlot = slot + (kind === 'stops' ? 1 : kind === 'open' ? 3 : 2) * 170;
    return slot;
  }
}
export interface LiveExecution {
  venue: VirtualVenue;
  latencyMs: number;
  gateway?: VirtualGateway;
  now?: () => number;
}
