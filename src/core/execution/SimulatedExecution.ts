import type { Fill, FillReason, InstrumentInfo, Position } from '../agent/types.ts';
import type { Trigger } from '../position/PositionMonitor.ts';
import type { ExecutionEngine } from './types.ts';

export type SlippageMode =
  | { type: 'none' }
  | { type: 'fixed'; amount: number }
  | { type: 'random'; maxAmount: number };

export class SimulatedExecution implements ExecutionEngine {
  private readonly instrument: InstrumentInfo;
  private readonly slippage: SlippageMode;

  constructor(instrument: InstrumentInfo, slippage: SlippageMode = { type: 'none' }) {
    this.instrument = instrument;
    this.slippage = slippage;
  }

  /**
   * Execute an OPEN order.
   *
   * referencePrice is the candle close (bid-side).
   * BUY fills at ask (= reference + spread) + slippage.
   * SELL fills at bid (= reference) - slippage.
   */
  async executeOpen(
    side: 'BUY' | 'SELL',
    size: number,
    referencePrice: number,
    timestamp: number,
  ): Promise<Fill> {
    const slip = this.getSlippage();
    let price: number;

    if (side === 'BUY') {
      price = referencePrice + this.instrument.spread + slip;
    } else {
      price = referencePrice - slip;
    }

    price = this.roundPrice(price);

    return {
      action: 'OPENED',
      reason: 'ORDER',
      side,
      size,
      price,
      timestamp,
    };
  }

  /**
   * Execute a CLOSE order (agent requested).
   *
   * BUY position closes by selling at bid (= reference) - slippage.
   * SELL position closes by buying at ask (= reference + spread) + slippage.
   */
  async executeClose(
    position: Position,
    referencePrice: number,
    timestamp: number,
  ): Promise<Fill> {
    const slip = this.getSlippage();
    let exitPrice: number;
    const closeSide: 'BUY' | 'SELL' = position.direction === 'BUY' ? 'SELL' : 'BUY';

    if (position.direction === 'BUY') {
      // Sell at bid - slippage
      exitPrice = referencePrice - slip;
    } else {
      // Buy back at ask + slippage
      exitPrice = referencePrice + this.instrument.spread + slip;
    }

    exitPrice = this.roundPrice(exitPrice);
    const pnl = this.calculatePnL(position, exitPrice);

    return {
      action: 'CLOSED',
      reason: 'ORDER',
      side: closeSide,
      size: position.size,
      price: exitPrice,
      timestamp,
      pnl,
    };
  }

  /**
   * Execute a triggered close (stop loss, take profit, liquidation, market close).
   *
   * Stop loss / liquidation / market close: trigger price + adverse slippage.
   * Take profit: fills at exactly the trigger price (limit order, no slippage).
   */
  async executeTrigger(
    trigger: Trigger,
    position: Position,
    timestamp: number,
  ): Promise<Fill> {
    const closeSide: 'BUY' | 'SELL' = position.direction === 'BUY' ? 'SELL' : 'BUY';
    let exitPrice: number;

    if (trigger.reason === 'TAKE_PROFIT') {
      // Limit order: fills at exactly the TP level
      exitPrice = trigger.price;
    } else {
      // Stop / liquidation / market close: adverse slippage
      const slip = this.getSlippage();
      if (position.direction === 'BUY') {
        // Selling: price slips down (worse for us)
        exitPrice = trigger.price - slip;
      } else {
        // Buying back: price slips up (worse for us)
        exitPrice = trigger.price + slip;
      }
    }

    exitPrice = this.roundPrice(exitPrice);
    const pnl = this.calculatePnL(position, exitPrice);

    return {
      action: 'CLOSED',
      reason: trigger.reason,
      side: closeSide,
      size: position.size,
      price: exitPrice,
      timestamp,
      pnl,
    };
  }

  private calculatePnL(position: Position, exitPrice: number): number {
    const { direction, size, entryPrice } = position;
    const lotSize = this.instrument.lotSize;

    if (direction === 'BUY') {
      return (exitPrice - entryPrice) * size * lotSize;
    } else {
      return (entryPrice - exitPrice) * size * lotSize;
    }
  }

  private getSlippage(): number {
    switch (this.slippage.type) {
      case 'none':
        return 0;
      case 'fixed':
        return this.slippage.amount;
      case 'random':
        return Math.random() * this.slippage.maxAmount;
    }
  }

  private roundPrice(price: number): number {
    const factor = Math.pow(10, this.instrument.pricePrecision);
    return Math.round(price * factor) / factor;
  }
}
