/**
 * Streaming technical indicators.
 *
 * Each indicator is computed incrementally (once per new bar) and cached per
 * bar series, so every agent on the same instrument + timeframe shares one
 * computation. Values are aligned with bars: values[i] belongs to bars[i].
 * NaN means "not enough bars yet".
 */
import type { Bar, Indicators, SeriesIndicators, Source } from './types.ts';

interface Calc {
  deps: Calc[];
  outs: number[][];
  step(i: number): void;
  /** Bars computed so far (outputs may be shared with dependencies, so track it separately). */
  n?: number;
}

const SOURCE_CLOSE: Source = 'close';

export class IndicatorCache {
  private readonly calcs = new Map<string, Calc>();

  constructor(private readonly bars: readonly Bar[]) {}

  /** Forget all computed values (after the bar array was trimmed). */
  reset(): void {
    this.calcs.clear();
  }

  /** Compute `calc` (and its dependencies) up to the latest bar. */
  private ensure(calc: Calc): void {
    const n = this.bars.length;
    const done = calc.n ?? 0;
    if (done >= n) return;
    for (const dep of calc.deps) this.ensure(dep);
    for (let i = done; i < n; i++) calc.step(i);
    calc.n = n;
  }

  private get(key: string, make: () => Calc): Calc {
    let calc = this.calcs.get(key);
    if (!calc) {
      calc = make();
      this.calcs.set(key, calc);
    }
    this.ensure(calc);
    return calc;
  }

  // ---------------------------------------------------------------- sources

  source(src: Source = SOURCE_CLOSE): number[] {
    return this.get(`src:${src}`, () => {
      const out: number[] = [];
      const bars = this.bars;
      const pick = SOURCE_PICKERS[src];
      if (!pick) throw new Error(`Unknown indicator source "${src}"`);
      return { deps: [], outs: [out], step: i => out.push(pick(bars[i]!)) };
    }).outs[0]!;
  }

  private sourceCalc(src: Source): Calc {
    this.source(src);
    return this.calcs.get(`src:${src}`)!;
  }

  // ---------------------------------------------------------------- moving averages

  sma(period: number, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`sma:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      const x = dep.outs[0]!;
      const out: number[] = [];
      let sum = 0;
      return {
        deps: [dep],
        outs: [out],
        step: i => {
          sum += x[i]!;
          if (i >= period) sum -= x[i - period]!;
          out.push(i >= period - 1 ? sum / period : NaN);
        },
      };
    }).outs[0]!;
  }

  ema(period: number, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`ema:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      return emaCalc(dep, 0, period);
    }).outs[0]!;
  }

  wma(period: number, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`wma:${period}:${src}`, () => wmaCalc(this.sourceCalc(src), 0, period)).outs[0]!;
  }

  hma(period: number, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`hma:${period}:${src}`, () => {
      const half = Math.max(1, Math.round(period / 2));
      const sqrtP = Math.max(1, Math.round(Math.sqrt(period)));
      this.wma(half, src);
      this.wma(period, src);
      const wHalf = this.calcs.get(`wma:${half}:${src}`)!;
      const wFull = this.calcs.get(`wma:${period}:${src}`)!;
      const diffOut: number[] = [];
      const diff: Calc = {
        deps: [wHalf, wFull],
        outs: [diffOut],
        step: i => diffOut.push(2 * wHalf.outs[0]![i]! - wFull.outs[0]![i]!),
      };
      return wmaCalc(diff, 0, sqrtP);
    }).outs[0]!;
  }

  // ---------------------------------------------------------------- oscillators

  rsi(period = 14, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`rsi:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      const x = dep.outs[0]!;
      const out: number[] = [];
      let avgGain = 0;
      let avgLoss = 0;
      return {
        deps: [dep],
        outs: [out],
        step: i => {
          if (i === 0) return void out.push(NaN);
          const change = x[i]! - x[i - 1]!;
          const gain = change > 0 ? change : 0;
          const loss = change < 0 ? -change : 0;
          if (i <= period) {
            avgGain += gain / period;
            avgLoss += loss / period;
            if (i < period) return void out.push(NaN);
          } else {
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
          }
          out.push(avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
        },
      };
    }).outs[0]!;
  }

  stoch(kPeriod = 14, dPeriod = 3): { k: number[]; d: number[] } {
    assertPeriod(kPeriod);
    assertPeriod(dPeriod);
    const calc = this.get(`stoch:${kPeriod}:${dPeriod}`, () => {
      const bars = this.bars;
      const k: number[] = [];
      const d: number[] = [];
      return {
        deps: [],
        outs: [k, d],
        step: i => {
          if (i < kPeriod - 1) {
            k.push(NaN);
            d.push(NaN);
            return;
          }
          let hh = -Infinity;
          let ll = Infinity;
          for (let j = i - kPeriod + 1; j <= i; j++) {
            if (bars[j]!.high > hh) hh = bars[j]!.high;
            if (bars[j]!.low < ll) ll = bars[j]!.low;
          }
          k.push(hh === ll ? 50 : (100 * (bars[i]!.close - ll)) / (hh - ll));
          d.push(meanOfLast(k, i, dPeriod));
        },
      };
    });
    return { k: calc.outs[0]!, d: calc.outs[1]! };
  }

  cci(period = 20): number[] {
    assertPeriod(period);
    return this.get(`cci:${period}`, () => {
      const dep = this.sourceCalc('hlc3');
      const tp = dep.outs[0]!;
      const out: number[] = [];
      return {
        deps: [dep],
        outs: [out],
        step: i => {
          if (i < period - 1) return void out.push(NaN);
          let mean = 0;
          for (let j = i - period + 1; j <= i; j++) mean += tp[j]!;
          mean /= period;
          let dev = 0;
          for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j]! - mean);
          dev /= period;
          out.push(dev === 0 ? 0 : (tp[i]! - mean) / (0.015 * dev));
        },
      };
    }).outs[0]!;
  }

  willr(period = 14): number[] {
    assertPeriod(period);
    return this.get(`willr:${period}`, () => {
      const bars = this.bars;
      const out: number[] = [];
      return {
        deps: [],
        outs: [out],
        step: i => {
          if (i < period - 1) return void out.push(NaN);
          let hh = -Infinity;
          let ll = Infinity;
          for (let j = i - period + 1; j <= i; j++) {
            if (bars[j]!.high > hh) hh = bars[j]!.high;
            if (bars[j]!.low < ll) ll = bars[j]!.low;
          }
          out.push(hh === ll ? -50 : (-100 * (hh - bars[i]!.close)) / (hh - ll));
        },
      };
    }).outs[0]!;
  }

  roc(period: number, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`roc:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      const x = dep.outs[0]!;
      const out: number[] = [];
      return {
        deps: [dep],
        outs: [out],
        step: i => out.push(i >= period && x[i - period]! !== 0 ? (x[i]! / x[i - period]! - 1) * 100 : NaN),
      };
    }).outs[0]!;
  }

  macd(fast = 12, slow = 26, signal = 9): { macd: number[]; signal: number[]; hist: number[] } {
    const calc = this.get(`macd:${fast}:${slow}:${signal}`, () => {
      this.ema(fast);
      this.ema(slow);
      const f = this.calcs.get(`ema:${fast}:close`)!;
      const s = this.calcs.get(`ema:${slow}:close`)!;
      const line: number[] = [];
      const lineCalc: Calc = { deps: [f, s], outs: [line], step: i => line.push(f.outs[0]![i]! - s.outs[0]![i]!) };
      const sig = emaCalc(lineCalc, 0, signal);
      const hist: number[] = [];
      return {
        deps: [sig],
        outs: [line, sig.outs[0]!, hist],
        step: i => hist.push(line[i]! - sig.outs[0]![i]!),
      };
    });
    return { macd: calc.outs[0]!, signal: calc.outs[1]!, hist: calc.outs[2]! };
  }

  // ---------------------------------------------------------------- volatility & bands

  atr(period = 14): number[] {
    assertPeriod(period);
    return this.get(`atr:${period}`, () => {
      const bars = this.bars;
      const out: number[] = [];
      let atr = 0;
      return {
        deps: [],
        outs: [out],
        step: i => {
          const b = bars[i]!;
          const tr = i === 0 ? b.high - b.low : trueRange(b, bars[i - 1]!.close);
          if (i < period) {
            atr += tr / period;
            out.push(i === period - 1 ? atr : NaN);
          } else {
            atr = (atr * (period - 1) + tr) / period;
            out.push(atr);
          }
        },
      };
    }).outs[0]!;
  }

  stdev(period: number, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`stdev:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      const x = dep.outs[0]!;
      const out: number[] = [];
      return {
        deps: [dep],
        outs: [out],
        step: i => {
          if (i < period - 1) return void out.push(NaN);
          let mean = 0;
          for (let j = i - period + 1; j <= i; j++) mean += x[j]!;
          mean /= period;
          let v = 0;
          for (let j = i - period + 1; j <= i; j++) v += (x[j]! - mean) ** 2;
          out.push(Math.sqrt(v / period));
        },
      };
    }).outs[0]!;
  }

  zscore(period: number, src: Source = SOURCE_CLOSE): number[] {
    return this.get(`zscore:${period}:${src}`, () => {
      this.sma(period, src);
      this.stdev(period, src);
      const m = this.calcs.get(`sma:${period}:${src}`)!;
      const s = this.calcs.get(`stdev:${period}:${src}`)!;
      const x = this.sourceCalc(src).outs[0]!;
      const out: number[] = [];
      return {
        deps: [m, s],
        outs: [out],
        step: i => {
          const sd = s.outs[0]![i]!;
          out.push(sd > 0 ? (x[i]! - m.outs[0]![i]!) / sd : NaN);
        },
      };
    }).outs[0]!;
  }

  bollinger(period = 20, mult = 2): { upper: number[]; middle: number[]; lower: number[]; width: number[] } {
    const calc = this.get(`bb:${period}:${mult}`, () => {
      this.sma(period);
      this.stdev(period);
      const m = this.calcs.get(`sma:${period}:close`)!;
      const s = this.calcs.get(`stdev:${period}:close`)!;
      const upper: number[] = [];
      const lower: number[] = [];
      const width: number[] = [];
      return {
        deps: [m, s],
        outs: [upper, m.outs[0]!, lower, width],
        step: i => {
          const mid = m.outs[0]![i]!;
          const sd = s.outs[0]![i]!;
          upper.push(mid + mult * sd);
          lower.push(mid - mult * sd);
          width.push(mid !== 0 ? (2 * mult * sd) / mid : NaN);
        },
      };
    });
    return { upper: calc.outs[0]!, middle: calc.outs[1]!, lower: calc.outs[2]!, width: calc.outs[3]! };
  }

  keltner(period = 20, mult = 2): { upper: number[]; middle: number[]; lower: number[] } {
    const calc = this.get(`kc:${period}:${mult}`, () => {
      this.ema(period);
      this.atr(period);
      const e = this.calcs.get(`ema:${period}:close`)!;
      const a = this.calcs.get(`atr:${period}`)!;
      const upper: number[] = [];
      const lower: number[] = [];
      return {
        deps: [e, a],
        outs: [upper, e.outs[0]!, lower],
        step: i => {
          upper.push(e.outs[0]![i]! + mult * a.outs[0]![i]!);
          lower.push(e.outs[0]![i]! - mult * a.outs[0]![i]!);
        },
      };
    });
    return { upper: calc.outs[0]!, middle: calc.outs[1]!, lower: calc.outs[2]! };
  }

  highest(period: number, src: Source = 'high'): number[] {
    assertPeriod(period);
    return this.get(`highest:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      const x = dep.outs[0]!;
      const out: number[] = [];
      return {
        deps: [dep],
        outs: [out],
        step: i => {
          if (i < period - 1) return void out.push(NaN);
          let m = -Infinity;
          for (let j = i - period + 1; j <= i; j++) if (x[j]! > m) m = x[j]!;
          out.push(m);
        },
      };
    }).outs[0]!;
  }

  lowest(period: number, src: Source = 'low'): number[] {
    assertPeriod(period);
    return this.get(`lowest:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      const x = dep.outs[0]!;
      const out: number[] = [];
      return {
        deps: [dep],
        outs: [out],
        step: i => {
          if (i < period - 1) return void out.push(NaN);
          let m = Infinity;
          for (let j = i - period + 1; j <= i; j++) if (x[j]! < m) m = x[j]!;
          out.push(m);
        },
      };
    }).outs[0]!;
  }

  donchian(period: number): { upper: number[]; lower: number[]; middle: number[] } {
    const calc = this.get(`donchian:${period}`, () => {
      this.highest(period, 'high');
      this.lowest(period, 'low');
      const h = this.calcs.get(`highest:${period}:high`)!;
      const l = this.calcs.get(`lowest:${period}:low`)!;
      const mid: number[] = [];
      return {
        deps: [h, l],
        outs: [h.outs[0]!, l.outs[0]!, mid],
        step: i => mid.push((h.outs[0]![i]! + l.outs[0]![i]!) / 2),
      };
    });
    return { upper: calc.outs[0]!, lower: calc.outs[1]!, middle: calc.outs[2]! };
  }

  // ---------------------------------------------------------------- trend

  adx(period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
    assertPeriod(period);
    const calc = this.get(`adx:${period}`, () => {
      const bars = this.bars;
      const adx: number[] = [];
      const plus: number[] = [];
      const minus: number[] = [];
      let trS = 0;
      let pS = 0;
      let mS = 0;
      let adxV = 0;
      let dxCount = 0;
      return {
        deps: [],
        outs: [adx, plus, minus],
        step: i => {
          if (i === 0) {
            adx.push(NaN);
            plus.push(NaN);
            minus.push(NaN);
            return;
          }
          const b = bars[i]!;
          const p = bars[i - 1]!;
          const up = b.high - p.high;
          const down = p.low - b.low;
          const pdm = up > down && up > 0 ? up : 0;
          const mdm = down > up && down > 0 ? down : 0;
          const tr = trueRange(b, p.close);
          if (i <= period) {
            trS += tr;
            pS += pdm;
            mS += mdm;
          } else {
            trS = trS - trS / period + tr;
            pS = pS - pS / period + pdm;
            mS = mS - mS / period + mdm;
          }
          if (i < period) {
            adx.push(NaN);
            plus.push(NaN);
            minus.push(NaN);
            return;
          }
          const pdi = trS > 0 ? (100 * pS) / trS : 0;
          const mdi = trS > 0 ? (100 * mS) / trS : 0;
          const dx = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
          dxCount++;
          if (dxCount <= period) {
            adxV += dx / period;
            adx.push(dxCount === period ? adxV : NaN);
          } else {
            adxV = (adxV * (period - 1) + dx) / period;
            adx.push(adxV);
          }
          plus.push(pdi);
          minus.push(mdi);
        },
      };
    });
    return { adx: calc.outs[0]!, plusDI: calc.outs[1]!, minusDI: calc.outs[2]! };
  }

  supertrend(period = 10, mult = 3): { value: number[]; direction: number[] } {
    const calc = this.get(`st:${period}:${mult}`, () => {
      this.atr(period);
      const a = this.calcs.get(`atr:${period}`)!;
      const bars = this.bars;
      const value: number[] = [];
      const direction: number[] = [];
      let upperBand = NaN;
      let lowerBand = NaN;
      let dir = 1;
      return {
        deps: [a],
        outs: [value, direction],
        step: i => {
          const atr = a.outs[0]![i]!;
          const b = bars[i]!;
          if (Number.isNaN(atr)) {
            value.push(NaN);
            direction.push(NaN);
            return;
          }
          const hl2 = (b.high + b.low) / 2;
          const basicUpper = hl2 + mult * atr;
          const basicLower = hl2 - mult * atr;
          const prevClose = bars[i - 1]?.close ?? b.close;
          upperBand = Number.isNaN(upperBand) || basicUpper < upperBand || prevClose > upperBand ? basicUpper : upperBand;
          lowerBand = Number.isNaN(lowerBand) || basicLower > lowerBand || prevClose < lowerBand ? basicLower : lowerBand;
          if (dir === 1 && b.close < lowerBand) dir = -1;
          else if (dir === -1 && b.close > upperBand) dir = 1;
          value.push(dir === 1 ? lowerBand : upperBand);
          direction.push(dir);
        },
      };
    });
    return { value: calc.outs[0]!, direction: calc.outs[1]! };
  }

  linregSlope(period: number, src: Source = SOURCE_CLOSE): number[] {
    assertPeriod(period);
    return this.get(`linreg:${period}:${src}`, () => {
      const dep = this.sourceCalc(src);
      const x = dep.outs[0]!;
      const out: number[] = [];
      const meanT = (period - 1) / 2;
      let varT = 0;
      for (let t = 0; t < period; t++) varT += (t - meanT) ** 2;
      return {
        deps: [dep],
        outs: [out],
        step: i => {
          if (i < period - 1) return void out.push(NaN);
          let meanY = 0;
          for (let j = 0; j < period; j++) meanY += x[i - period + 1 + j]!;
          meanY /= period;
          let cov = 0;
          for (let j = 0; j < period; j++) cov += (j - meanT) * (x[i - period + 1 + j]! - meanY);
          out.push(period > 1 ? cov / varT : 0);
        },
      };
    }).outs[0]!;
  }
}

// ------------------------------------------------------------------ helpers

const SOURCE_PICKERS: Record<Source, (b: Bar) => number> = {
  close: b => b.close,
  open: b => b.open,
  high: b => b.high,
  low: b => b.low,
  hl2: b => (b.high + b.low) / 2,
  hlc3: b => (b.high + b.low + b.close) / 3,
};

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) throw new Error(`Indicator period must be a positive integer, got ${period}`);
}

function trueRange(b: Bar, prevClose: number): number {
  return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
}

function meanOfLast(arr: number[], i: number, n: number): number {
  if (i - n + 1 < 0) return NaN;
  let s = 0;
  for (let j = i - n + 1; j <= i; j++) {
    const v = arr[j]!;
    if (Number.isNaN(v)) return NaN;
    s += v;
  }
  return s / n;
}

/** EMA over output `outIdx` of `dep`, seeded with the SMA of its first `period` defined values. */
function emaCalc(dep: Calc, outIdx: number, period: number): Calc {
  const x = dep.outs[outIdx]!;
  const out: number[] = [];
  const alpha = 2 / (period + 1);
  let seen = 0;
  let seed = 0;
  let prev = NaN;
  return {
    deps: [dep],
    outs: [out],
    step: i => {
      const v = x[i]!;
      if (Number.isNaN(v)) return void out.push(NaN);
      if (seen < period) {
        seen++;
        seed += v;
        if (seen === period) {
          prev = seed / period;
          return void out.push(prev);
        }
        return void out.push(NaN);
      }
      prev = alpha * v + (1 - alpha) * prev;
      out.push(prev);
    },
  };
}

function wmaCalc(dep: Calc, outIdx: number, period: number): Calc {
  const x = dep.outs[outIdx]!;
  const out: number[] = [];
  const denom = (period * (period + 1)) / 2;
  return {
    deps: [dep],
    outs: [out],
    step: i => {
      if (i < period - 1) return void out.push(NaN);
      let s = 0;
      for (let j = 0; j < period; j++) {
        const v = x[i - j]!;
        if (Number.isNaN(v)) return void out.push(NaN);
        s += v * (period - j);
      }
      out.push(s / denom);
    },
  };
}

function last(arr: readonly number[]): number {
  return arr.length > 0 ? arr[arr.length - 1]! : NaN;
}

function crossed(a: readonly number[], b: readonly number[] | number, above: boolean): boolean {
  const n = a.length;
  if (n < 2) return false;
  const bNow = typeof b === 'number' ? b : b[b.length - 1]!;
  const bPrev = typeof b === 'number' ? b : b[b.length - 2]!;
  const aNow = a[n - 1]!;
  const aPrev = a[n - 2]!;
  if ([aNow, aPrev, bNow, bPrev].some(Number.isNaN)) return false;
  return above ? aPrev <= bPrev && aNow > bNow : aPrev >= bPrev && aNow < bNow;
}

/** Build the agent-facing `ctx.ta` object on top of a cache. */
export function makeIndicators(cache: IndicatorCache): Indicators {
  const series: SeriesIndicators = {
    sma: (p, s) => cache.sma(p, s),
    ema: (p, s) => cache.ema(p, s),
    wma: (p, s) => cache.wma(p, s),
    hma: (p, s) => cache.hma(p, s),
    rsi: (p, s) => cache.rsi(p, s),
    atr: p => cache.atr(p),
    stdev: (p, s) => cache.stdev(p, s),
    zscore: (p, s) => cache.zscore(p, s),
    highest: (p, s) => cache.highest(p, s),
    lowest: (p, s) => cache.lowest(p, s),
    roc: (p, s) => cache.roc(p, s),
    macd: (f, s, g) => cache.macd(f, s, g),
    bollinger: (p, m) => cache.bollinger(p, m),
    keltner: (p, m) => cache.keltner(p, m),
    donchian: p => cache.donchian(p),
    adx: p => cache.adx(p),
    stoch: (k, d) => cache.stoch(k, d),
    cci: p => cache.cci(p),
    willr: p => cache.willr(p),
    supertrend: (p, m) => cache.supertrend(p, m),
    linregSlope: (p, s) => cache.linregSlope(p, s),
    close: () => cache.source('close'),
    open: () => cache.source('open'),
    high: () => cache.source('high'),
    low: () => cache.source('low'),
  };
  return {
    sma: (p, s) => last(cache.sma(p, s)),
    ema: (p, s) => last(cache.ema(p, s)),
    wma: (p, s) => last(cache.wma(p, s)),
    hma: (p, s) => last(cache.hma(p, s)),
    rsi: (p, s) => last(cache.rsi(p, s)),
    atr: p => last(cache.atr(p)),
    stdev: (p, s) => last(cache.stdev(p, s)),
    zscore: (p, s) => last(cache.zscore(p, s)),
    highest: (p, s) => last(cache.highest(p, s)),
    lowest: (p, s) => last(cache.lowest(p, s)),
    roc: (p, s) => last(cache.roc(p, s)),
    macd: (f, s, g) => {
      const m = cache.macd(f, s, g);
      return { macd: last(m.macd), signal: last(m.signal), hist: last(m.hist) };
    },
    bollinger: (p, m) => {
      const b = cache.bollinger(p, m);
      return { upper: last(b.upper), middle: last(b.middle), lower: last(b.lower), width: last(b.width) };
    },
    keltner: (p, m) => {
      const k = cache.keltner(p, m);
      return { upper: last(k.upper), middle: last(k.middle), lower: last(k.lower) };
    },
    donchian: p => {
      const d = cache.donchian(p);
      return { upper: last(d.upper), lower: last(d.lower), middle: last(d.middle) };
    },
    adx: p => {
      const a = cache.adx(p);
      return { adx: last(a.adx), plusDI: last(a.plusDI), minusDI: last(a.minusDI) };
    },
    stoch: (k, d) => {
      const s = cache.stoch(k, d);
      return { k: last(s.k), d: last(s.d) };
    },
    cci: p => last(cache.cci(p)),
    willr: p => last(cache.willr(p)),
    supertrend: (p, m) => {
      const s = cache.supertrend(p, m);
      return { value: last(s.value), direction: (last(s.direction) >= 0 ? 1 : -1) as 1 | -1 };
    },
    linregSlope: (p, s) => last(cache.linregSlope(p, s)),
    series,
    crossedAbove: (a, b) => crossed(a, b, true),
    crossedBelow: (a, b) => crossed(a, b, false),
  };
}
