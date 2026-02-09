import type { AccountSnapshot, Fill, InstrumentInfo } from '../agent/types.ts';

interface OpenPosition {
  direction: 'BUY' | 'SELL';
  size: number;
  entryPrice: number;
}

export class AccountManager {
  private balance: number;
  private margin: number = 0;
  private unrealizedPnL: number = 0;
  private openPosition: OpenPosition | null = null;
  private readonly instrument: InstrumentInfo;

  constructor(capital: number, instrument: InstrumentInfo) {
    this.balance = capital;
    this.instrument = instrument;
  }

  get equity(): number {
    return this.balance + this.unrealizedPnL;
  }

  get available(): number {
    return Math.max(0, this.balance - this.margin + this.unrealizedPnL);
  }

  getSnapshot(): AccountSnapshot {
    return {
      equity: this.equity,
      balance: this.balance,
      available: this.available,
      margin: this.margin,
    };
  }

  hasPosition(): boolean {
    return this.openPosition !== null;
  }

  onOpen(fill: Fill): void {
    if (this.openPosition) {
      throw new Error('Cannot open position: already have an open position');
    }
    if (fill.action !== 'OPENED') {
      throw new Error(`Expected OPENED fill, got ${fill.action}`);
    }

    this.openPosition = {
      direction: fill.side,
      size: fill.size,
      entryPrice: fill.price,
    };

    this.margin = (fill.size * fill.price * this.instrument.lotSize) / this.instrument.leverage;
    this.unrealizedPnL = 0;
  }

  onClose(fill: Fill): void {
    if (!this.openPosition) {
      throw new Error('Cannot close position: no open position');
    }
    if (fill.action !== 'CLOSED') {
      throw new Error(`Expected CLOSED fill, got ${fill.action}`);
    }
    if (fill.pnl === undefined) {
      throw new Error('CLOSED fill must include pnl');
    }

    this.balance += fill.pnl;
    this.margin = 0;
    this.unrealizedPnL = 0;
    this.openPosition = null;
  }

  updatePrice(bid: number, ask: number): void {
    if (!this.openPosition) {
      this.unrealizedPnL = 0;
      return;
    }

    const { direction, size, entryPrice } = this.openPosition;
    const lotSize = this.instrument.lotSize;

    if (direction === 'BUY') {
      // Bought at ask, would sell at bid
      this.unrealizedPnL = (bid - entryPrice) * size * lotSize;
    } else {
      // Sold at bid, would buy back at ask
      this.unrealizedPnL = (entryPrice - ask) * size * lotSize;
    }
  }

  calculatePnL(exitPrice: number): number {
    if (!this.openPosition) {
      throw new Error('Cannot calculate P&L: no open position');
    }

    const { direction, size, entryPrice } = this.openPosition;
    const lotSize = this.instrument.lotSize;

    if (direction === 'BUY') {
      return (exitPrice - entryPrice) * size * lotSize;
    } else {
      return (entryPrice - exitPrice) * size * lotSize;
    }
  }
}
