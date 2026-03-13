import type { Candle, InstrumentInfo } from '../agent/types.ts';
import type { MinuteCandleHandler, PriceFeed } from './types.ts';

export type TickHandler = (bid: number, ask: number, timestamp: number) => void | Promise<void>;

export interface SyntheticTickFeedConfig {
  /** Source minute candles (from DB, same as BacktestFeed). */
  candles: Candle[];
  /** Instrument info (for spread and price precision). */
  instrument: InstrumentInfo;
  /** Called on every synthetic tick (for stop/TP checking via AgentRunner.processTick). */
  onTick: TickHandler;
  /** Ticks to generate per minute candle. Default 600 (10/sec). */
  ticksPerMinute?: number;
}

/**
 * Synthetic tick feed — generates realistic ticks from minute candles.
 *
 * For each source candle, generates ~600 ticks using constrained Brownian
 * bridges that respect the candle's OHLC:
 *   - First tick's mid = open
 *   - Last tick's mid = close
 *   - Path touches high and low at random points
 *   - Tick-to-tick noise matches real market microstructure
 *
 * Each tick is passed to onTick for stop/TP checking (same as BacktestTickFeed
 * and CapitalLiveFeed), then the original candle is emitted to the handler
 * for the agent's onCandle call.
 *
 * This gives candle-only backtests the same SL/TP precision as tick backtests.
 */
export class SyntheticTickFeed implements PriceFeed {
  private readonly candles: Candle[];
  private readonly instrument: InstrumentInfo;
  private readonly onTick: TickHandler;
  private readonly ticksPerMinute: number;
  private readonly tickSigma: number;
  private stopped: boolean = false;

  constructor(config: SyntheticTickFeedConfig) {
    this.candles = config.candles;
    this.instrument = config.instrument;
    this.onTick = config.onTick;
    this.ticksPerMinute = config.ticksPerMinute ?? 600;

    // Same σ scaling as TickGenerator.fromInstrument:
    // Real observed: σ=0.47 at 115 ticks/min. Scale to target rate.
    const observedRate = 115;
    const observedSigma = 0.47;
    this.tickSigma = observedSigma * Math.sqrt(observedRate / this.ticksPerMinute);
  }

  async start(handler: MinuteCandleHandler): Promise<void> {
    for (const candle of this.candles) {
      if (this.stopped) break;

      // 1. Generate synthetic ticks for this candle
      const ticks = this.generateCandleTicks(candle);

      // 2. Feed each tick to the handler for stop/TP checking
      for (const tick of ticks) {
        if (this.stopped) break;
        await this.onTick(tick.bid, tick.ask, tick.timestamp);
      }

      // 3. Emit the original candle for agent's onCandle
      if (!this.stopped) {
        await handler(candle);
      }
    }
  }

  stop(): void {
    this.stopped = true;
  }

  /**
   * Generate ticks for a single minute candle using constrained Brownian bridges.
   *
   * The path visits 4 waypoints in order:
   *   [0] = open, [highIdx] = high, [lowIdx] = low, [N-1] = close
   * sorted by index. Between each pair, a Brownian bridge interpolates
   * with realistic noise, clamped to [low, high].
   */
  generateCandleTicks(candle: Candle): Array<{ timestamp: number; bid: number; ask: number }> {
    const N = this.ticksPerMinute;
    const { open, high, low, close, timestamp } = candle;
    const dtMs = 60_000 / N;
    const spread = this.instrument.spread;
    const factor = Math.pow(10, this.instrument.pricePrecision);
    const halfSpread = spread / 2;

    // Flat candle: all ticks at the same price
    if (high === low) {
      const bid = Math.round((open - halfSpread) * factor) / factor;
      const ask = Math.round((open + halfSpread) * factor) / factor;
      return Array.from({ length: N }, (_, i) => ({
        timestamp: timestamp + Math.round(i * dtMs),
        bid,
        ask,
      }));
    }

    // Pick random indices where high and low are touched.
    // Keep away from edges so bridges have room.
    let highIdx = 1 + Math.floor(Math.random() * (N - 2));
    let lowIdx = 1 + Math.floor(Math.random() * (N - 2));
    while (lowIdx === highIdx) {
      lowIdx = 1 + Math.floor(Math.random() * (N - 2));
    }

    // Build waypoints sorted by index
    const waypoints: Array<[number, number]> = [
      [0, open],
      [highIdx, high],
      [lowIdx, low],
      [N - 1, close],
    ];
    waypoints.sort((a, b) => a[0] - b[0]);

    // Generate mid-prices using Brownian bridges between waypoints
    const mids = new Float64Array(N);

    for (let seg = 0; seg < waypoints.length - 1; seg++) {
      const [i0, y0] = waypoints[seg];
      const [i1, y1] = waypoints[seg + 1];
      const steps = i1 - i0;

      if (steps <= 0) {
        mids[i0] = y0;
        continue;
      }

      if (steps === 1) {
        mids[i0] = y0;
        continue;
      }

      // Brownian bridge: random walk forced to start at y0 and end at y1
      const walk = new Float64Array(steps + 1);
      for (let i = 1; i <= steps; i++) {
        walk[i] = walk[i - 1] + this.tickSigma * boxMuller();
      }

      const endWalk = walk[steps];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const bridge = walk[i] - t * endWalk;
        const trend = y0 + t * (y1 - y0);
        // Clamp to candle range
        mids[i0 + i] = Math.max(low, Math.min(high, trend + bridge));
      }
    }

    // Ensure exact endpoints
    mids[0] = open;
    mids[N - 1] = close;

    // Convert to bid/ask ticks
    const ticks = new Array(N);
    for (let i = 0; i < N; i++) {
      const mid = mids[i];
      ticks[i] = {
        timestamp: timestamp + Math.round(i * dtMs),
        bid: Math.round((mid - halfSpread) * factor) / factor,
        ask: Math.round((mid + halfSpread) * factor) / factor,
      };
    }

    return ticks;
  }
}

/** Box-Muller polar form — single standard normal variate. */
function boxMuller(): number {
  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}
