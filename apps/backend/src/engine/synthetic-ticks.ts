/** Deterministic OHLC-constrained paths. These are simulations, never recovered historical ticks. */
import type { Candle } from './series.ts';
import { TICK_SOURCE, type Tick } from './ticks.ts';
import { MINUTE_MS } from './clock.ts';
export const SYNTHETIC_TICK_VERSION = 'ohlc-bridge-v1';
export const DEFAULT_TICKS_PER_MINUTE = 16;
export const DEFAULT_TICK_SEED = 1;
export interface SyntheticTickOptions {
  seed?: number;
  ticksPerMinute?: number;
  precision?: number;
  spread?: number;
}
/** Lazy, bounded allocation: a minute is discarded after replay, no synthetic tape is stored. */
export function* syntheticTicks(epic: string, c: Candle, options: SyntheticTickOptions = {}): Generator<Tick> {
  const count = options.ticksPerMinute ?? DEFAULT_TICKS_PER_MINUTE;
  if (!Number.isInteger(count) || count < 4 || count > 240) throw new Error('ticksPerMinute must be an integer 4..240');
  if (
    ![c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) ||
    c.low > Math.min(c.open, c.close) ||
    c.high < Math.max(c.open, c.close) ||
    c.low <= 0
  )
    throw new Error('invalid OHLC candle');
  let state = 2166136261;
  for (const ch of `${epic}:${c.time}:${options.seed ?? DEFAULT_TICK_SEED}:${SYNTHETIC_TICK_VERSION}`)
    state = Math.imul(state ^ ch.charCodeAt(0), 16777619);
  const random = () => {
    let t = (state = (state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const first = 1 + Math.floor(random() * (count - 3));
  const second = first + 1 + Math.floor(random() * (count - first - 2));
  const highFirst = random() < 0.5;
  const anchors = [
    { i: 0, p: c.open },
    { i: first, p: highFirst ? c.high : c.low },
    { i: second, p: highFirst ? c.low : c.high },
    { i: count - 1, p: c.close },
  ];
  const factor = 10 ** (options.precision ?? 8),
    spread = c.spread > 0 ? c.spread : (options.spread ?? 0);
  let segment = 0;
  for (let i = 0; i < count; i++) {
    while (i > anchors[segment + 1]!.i) segment++;
    const a = anchors[segment]!,
      b = anchors[segment + 1]!,
      f = (i - a.i) / (b.i - a.i);
    const noise = (random() - 0.5) * (c.high - c.low) * 0.12 * Math.sin(Math.PI * f);
    const price = i === a.i ? a.p : i === b.i ? b.p : Math.max(c.low, Math.min(c.high, a.p + (b.p - a.p) * f + noise));
    const bid = Math.max(c.low, Math.min(c.high, Math.round(price * factor) / factor));
    const time = c.time + Math.floor((i * (MINUTE_MS - 1)) / (count - 1));
    yield {
      time,
      receivedAt: time,
      bid,
      ask: Math.round((bid + spread) * factor) / factor,
      source: TICK_SOURCE.SYNTHETIC,
      volume: c.volume / count,
    };
  }
}
