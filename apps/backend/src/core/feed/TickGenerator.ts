import type { InstrumentInfo } from '../agent/types.ts';

export interface Tick {
  timestamp: number;
  bid: number;
  ask: number;
}

export interface TickGeneratorConfig {
  /** Standard deviation of mid-price change per tick. */
  tickSigma: number;
  /** Mean-reversion speed toward the anchor price (0 = random walk). */
  meanReversion: number;
  /** Base spread (bid-ask). */
  spreadMean: number;
  /** Spread noise std dev (0 = fixed spread). */
  spreadStd: number;
  /** Probability of a jump on any given tick. */
  jumpProb: number;
  /** Jump size as multiple of tickSigma. */
  jumpMultiplier: number;
  /** Generation rate (ticks per minute). */
  ticksPerMinute: number;
  /** Decimal places for rounding prices. */
  pricePrecision: number;
}

/**
 * Synthetic tick generator using an Ornstein-Uhlenbeck process with jumps.
 *
 * Mid-price evolves as:
 *   mid_{t+1} = mid_t + θ(anchor - mid_t) + σ·Z + jump
 *
 * Where Z ~ N(0,1) via Box-Muller, and jumps occur with probability jumpProb
 * and have size ~ N(0, σ * jumpMultiplier).
 *
 * Spread is instrument.spread + small Gaussian noise (clamped to stay positive).
 */
export class TickGenerator {
  private readonly config: TickGeneratorConfig;

  constructor(config: TickGeneratorConfig) {
    this.config = config;
  }

  /**
   * Sensible defaults derived from real US100 tick data.
   *
   * Real observed stats (5,291 ticks, ~115 ticks/min):
   *   σ = 0.47/tick, median |move| = 0.2, P99 = 1.5
   *   spread = 1.8 (fixed), autocorrelation ≈ 0 (random walk)
   *
   * We scale σ for the target tick rate using variance-time scaling:
   *   σ_target = σ_observed * √(observed_rate / target_rate)
   */
  static fromInstrument(instrument: InstrumentInfo, overrides?: Partial<TickGeneratorConfig>): TickGenerator {
    const targetRate = overrides?.ticksPerMinute ?? 600;

    // Real observed: σ=0.47 at 115 ticks/min. Scale to target rate.
    const observedRate = 115;
    const observedSigma = 0.47;
    const scaledSigma = observedSigma * Math.sqrt(observedRate / targetRate);

    const config: TickGeneratorConfig = {
      tickSigma: scaledSigma,
      meanReversion: 0.002,
      spreadMean: instrument.spread,
      spreadStd: 0,           // Capital.com uses fixed spreads
      jumpProb: 0.005,        // ~3 jumps per minute at 600 ticks/min
      jumpMultiplier: 5,
      ticksPerMinute: targetRate,
      pricePrecision: instrument.pricePrecision,
      ...overrides,
    };

    return new TickGenerator(config);
  }

  /**
   * Generate a sequence of ticks.
   *
   * @param startBid  Starting bid price
   * @param startAsk  Starting ask price
   * @param startTimestamp  Timestamp of first tick (ms)
   * @param count  Number of ticks to generate
   */
  generate(startBid: number, startAsk: number, startTimestamp: number, count: number): Tick[] {
    const { tickSigma, meanReversion, spreadMean, spreadStd, jumpProb, jumpMultiplier, pricePrecision } = this.config;
    const dtMs = 60_000 / this.config.ticksPerMinute;
    const factor = Math.pow(10, pricePrecision);

    let mid = (startBid + startAsk) / 2;
    const anchor = mid;
    const ticks: Tick[] = [];

    for (let i = 0; i < count; i++) {
      // Mean-reversion drift
      const drift = meanReversion * (anchor - mid);

      // Normal diffusion
      const z = boxMullerSingle();
      let move = drift + tickSigma * z;

      // Occasional jump
      if (Math.random() < jumpProb) {
        move += tickSigma * jumpMultiplier * boxMullerSingle();
      }

      mid += move;

      // Spread: base + optional noise, clamped >= 0.1 * spreadMean
      let spread = spreadMean;
      if (spreadStd > 0) {
        spread += spreadStd * boxMullerSingle();
        spread = Math.max(spread, 0.1 * spreadMean);
      }

      const halfSpread = spread / 2;
      const bid = Math.round((mid - halfSpread) * factor) / factor;
      const ask = Math.round((mid + halfSpread) * factor) / factor;
      const timestamp = Math.round(startTimestamp + i * dtMs);

      ticks.push({ timestamp, bid, ask });
    }

    return ticks;
  }

  /**
   * Generate ticks for a given duration.
   */
  generateForDuration(startBid: number, startAsk: number, startTimestamp: number, durationMs: number): Tick[] {
    const count = Math.max(1, Math.round((durationMs / 60_000) * this.config.ticksPerMinute));
    return this.generate(startBid, startAsk, startTimestamp, count);
  }

  /**
   * Milliseconds between ticks at the configured rate.
   */
  get tickIntervalMs(): number {
    return 60_000 / this.config.ticksPerMinute;
  }
}

/**
 * Box-Muller transform — returns a single standard normal variate.
 * Uses the polar form for simplicity.
 */
function boxMullerSingle(): number {
  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}
