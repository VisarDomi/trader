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
/**
 * A runaway guard per run, the same rule the broker mirror applies to one run's real orders. Other runs'
 * orders never delay or block a paper order: Capital's request budget is the real mirror's queue, not the
 * engine's (user request 2026-11-10).
 */
export const MAX_OPENS_PER_RUN_PER_HOUR = 12;
export interface LiveExecution {
  venue: VirtualVenue;
  latencyMs: number;
  now?: () => number;
  /** Recording failures pause new entries while existing protections and closes continue. */
  entryAllowed?:()=>boolean;
}
