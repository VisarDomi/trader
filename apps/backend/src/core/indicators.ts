/**
 * Streaming technical indicators — feed values one at a time.
 * Each indicator maintains its own state and reports `ready` once it has enough data.
 */

// ============================================
// SMA — Simple Moving Average
// ============================================

export class SMA {
  private readonly period: number;
  private readonly buffer: number[] = [];
  private sum = 0;
  private _value = 0;
  private _ready = false;

  constructor(period: number) {
    this.period = period;
  }

  get value(): number { return this._value; }
  get ready(): boolean { return this._ready; }

  update(price: number): number {
    this.buffer.push(price);
    this.sum += price;

    if (this.buffer.length > this.period) {
      this.sum -= this.buffer.shift()!;
    }

    if (this.buffer.length === this.period) {
      this._value = this.sum / this.period;
      this._ready = true;
    }

    return this._value;
  }
}

// ============================================
// EMA — Exponential Moving Average
// ============================================

export class EMA {
  private readonly period: number;
  private readonly k: number;
  private count = 0;
  private sum = 0;
  private _value = 0;
  private _ready = false;

  constructor(period: number) {
    this.period = period;
    this.k = 2 / (period + 1);
  }

  get value(): number { return this._value; }
  get ready(): boolean { return this._ready; }

  update(price: number): number {
    this.count++;

    if (!this._ready) {
      this.sum += price;
      if (this.count === this.period) {
        this._value = this.sum / this.period;
        this._ready = true;
      }
    } else {
      this._value = price * this.k + this._value * (1 - this.k);
    }

    return this._value;
  }
}

// ============================================
// MACD — Moving Average Convergence Divergence
// ============================================

export class MACD {
  private readonly fastEMA: EMA;
  private readonly slowEMA: EMA;
  private readonly signalEMA: EMA;
  private _macdLine = 0;
  private _signal = 0;
  private _histogram = 0;
  private _prevHistogram = 0;
  private _ready = false;

  constructor(fast = 12, slow = 26, signal = 9) {
    this.fastEMA = new EMA(fast);
    this.slowEMA = new EMA(slow);
    this.signalEMA = new EMA(signal);
  }

  get macdLine(): number { return this._macdLine; }
  get signal(): number { return this._signal; }
  get histogram(): number { return this._histogram; }
  get prevHistogram(): number { return this._prevHistogram; }
  get ready(): boolean { return this._ready; }

  /** True when histogram crosses from negative to positive. */
  get bullishCross(): boolean {
    return this._ready && this._prevHistogram <= 0 && this._histogram > 0;
  }

  /** True when histogram crosses from positive to negative. */
  get bearishCross(): boolean {
    return this._ready && this._prevHistogram >= 0 && this._histogram < 0;
  }

  update(price: number): void {
    this.fastEMA.update(price);
    this.slowEMA.update(price);

    if (!this.slowEMA.ready) return;

    this._macdLine = this.fastEMA.value - this.slowEMA.value;
    this.signalEMA.update(this._macdLine);

    if (this.signalEMA.ready) {
      this._prevHistogram = this._histogram;
      this._signal = this.signalEMA.value;
      this._histogram = this._macdLine - this._signal;
      this._ready = true;
    }
  }
}

// ============================================
// RSI — Relative Strength Index (Wilder's)
// ============================================

export class RSI {
  private readonly period: number;
  private prevPrice: number | null = null;
  private avgGain = 0;
  private avgLoss = 0;
  private count = 0;
  private initGains: number[] = [];
  private initLosses: number[] = [];
  private _value = 50;
  private _ready = false;

  constructor(period = 14) {
    this.period = period;
  }

  get value(): number { return this._value; }
  get ready(): boolean { return this._ready; }

  update(price: number): number {
    if (this.prevPrice === null) {
      this.prevPrice = price;
      return this._value;
    }

    const change = price - this.prevPrice;
    this.prevPrice = price;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    this.count++;

    if (this.count <= this.period) {
      this.initGains.push(gain);
      this.initLosses.push(loss);

      if (this.count === this.period) {
        this.avgGain = this.initGains.reduce((a, b) => a + b, 0) / this.period;
        this.avgLoss = this.initLosses.reduce((a, b) => a + b, 0) / this.period;
        this.initGains = [];
        this.initLosses = [];
        this._value = this.avgLoss === 0 ? 100 : 100 - 100 / (1 + this.avgGain / this.avgLoss);
        this._ready = true;
      }
    } else {
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
      this._value = this.avgLoss === 0 ? 100 : 100 - 100 / (1 + this.avgGain / this.avgLoss);
    }

    return this._value;
  }
}

// ============================================
// Bollinger Bands
// ============================================

export class BollingerBands {
  private readonly period: number;
  private readonly multiplier: number;
  private readonly buffer: number[] = [];
  private _upper = 0;
  private _middle = 0;
  private _lower = 0;
  private _bandwidth = 0;
  private _ready = false;

  constructor(period = 20, multiplier = 2) {
    this.period = period;
    this.multiplier = multiplier;
  }

  get upper(): number { return this._upper; }
  get middle(): number { return this._middle; }
  get lower(): number { return this._lower; }
  /** Bandwidth as fraction of middle band — low = squeeze, high = expansion. */
  get bandwidth(): number { return this._bandwidth; }
  get ready(): boolean { return this._ready; }

  update(price: number): void {
    this.buffer.push(price);
    if (this.buffer.length > this.period) this.buffer.shift();

    if (this.buffer.length === this.period) {
      let sum = 0;
      for (let i = 0; i < this.period; i++) sum += this.buffer[i]!;
      this._middle = sum / this.period;

      let variance = 0;
      for (let i = 0; i < this.period; i++) variance += (this.buffer[i]! - this._middle) ** 2;
      const stdDev = Math.sqrt(variance / this.period);

      this._upper = this._middle + this.multiplier * stdDev;
      this._lower = this._middle - this.multiplier * stdDev;
      this._bandwidth = this._middle > 0 ? (this._upper - this._lower) / this._middle : 0;
      this._ready = true;
    }
  }
}

// ============================================
// ATR — Average True Range (Wilder's)
// ============================================

export class ATR {
  private readonly period: number;
  private prevClose: number | null = null;
  private count = 0;
  private initTR: number[] = [];
  private _value = 0;
  private _ready = false;

  constructor(period = 14) {
    this.period = period;
  }

  get value(): number { return this._value; }
  get ready(): boolean { return this._ready; }

  update(high: number, low: number, close: number): number {
    const tr = this.prevClose === null
      ? high - low
      : Math.max(high - low, Math.abs(high - this.prevClose), Math.abs(low - this.prevClose));
    this.prevClose = close;

    this.count++;

    if (this.count <= this.period) {
      this.initTR.push(tr);
      if (this.count === this.period) {
        this._value = this.initTR.reduce((a, b) => a + b, 0) / this.period;
        this.initTR = [];
        this._ready = true;
      }
    } else {
      this._value = (this._value * (this.period - 1) + tr) / this.period;
    }

    return this._value;
  }
}

// ============================================
// ADX — Average Directional Index (Wilder's)
// ============================================

export class ADX {
  private readonly period: number;
  private prevHigh = 0;
  private prevLow = 0;
  private prevClose = 0;
  private hasPrev = false;

  // Wilder-smoothed sums
  private smPlusDM = 0;
  private smMinusDM = 0;
  private smTR = 0;

  // ADX smoothing
  private adxSmoothed = 0;

  private barCount = 0;
  private dxCount = 0;
  private initPlusDM: number[] = [];
  private initMinusDM: number[] = [];
  private initTR: number[] = [];
  private initDX: number[] = [];

  private _plusDI = 0;
  private _minusDI = 0;
  private _value = 0;
  private _ready = false;

  constructor(period = 14) {
    this.period = period;
  }

  get value(): number { return this._value; }
  /** +DI line — strength of upward movement. */
  get plusDI(): number { return this._plusDI; }
  /** -DI line — strength of downward movement. */
  get minusDI(): number { return this._minusDI; }
  get ready(): boolean { return this._ready; }

  update(high: number, low: number, close: number): number {
    if (!this.hasPrev) {
      this.prevHigh = high;
      this.prevLow = low;
      this.prevClose = close;
      this.hasPrev = true;
      return this._value;
    }

    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - this.prevClose),
      Math.abs(low - this.prevClose),
    );

    // Directional Movement
    const upMove = high - this.prevHigh;
    const downMove = this.prevLow - low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    this.prevHigh = high;
    this.prevLow = low;
    this.prevClose = close;
    this.barCount++;

    if (this.barCount <= this.period) {
      this.initPlusDM.push(plusDM);
      this.initMinusDM.push(minusDM);
      this.initTR.push(tr);

      if (this.barCount === this.period) {
        this.smPlusDM = this.initPlusDM.reduce((a, b) => a + b, 0);
        this.smMinusDM = this.initMinusDM.reduce((a, b) => a + b, 0);
        this.smTR = this.initTR.reduce((a, b) => a + b, 0);
        this.initPlusDM = [];
        this.initMinusDM = [];
        this.initTR = [];
        this.computeDI();
      }
    } else {
      // Wilder's smoothing: prev - prev/period + current
      this.smPlusDM = this.smPlusDM - this.smPlusDM / this.period + plusDM;
      this.smMinusDM = this.smMinusDM - this.smMinusDM / this.period + minusDM;
      this.smTR = this.smTR - this.smTR / this.period + tr;
      this.computeDI();
    }

    return this._value;
  }

  private computeDI(): void {
    if (this.smTR === 0) return;

    this._plusDI = 100 * this.smPlusDM / this.smTR;
    this._minusDI = 100 * this.smMinusDM / this.smTR;

    const diSum = this._plusDI + this._minusDI;
    if (diSum === 0) return;

    const dx = 100 * Math.abs(this._plusDI - this._minusDI) / diSum;
    this.dxCount++;

    if (this.dxCount <= this.period) {
      this.initDX.push(dx);
      if (this.dxCount === this.period) {
        this._value = this.initDX.reduce((a, b) => a + b, 0) / this.period;
        this.adxSmoothed = this._value;
        this.initDX = [];
        this._ready = true;
      }
    } else {
      this.adxSmoothed = (this.adxSmoothed * (this.period - 1) + dx) / this.period;
      this._value = this.adxSmoothed;
    }
  }
}
