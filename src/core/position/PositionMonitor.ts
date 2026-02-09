import type { FillReason, Position } from '../agent/types.ts';

export interface Trigger {
  reason: FillReason;
  price: number;
}

export class PositionMonitor {
  private position: Position | null = null;

  setPosition(position: Position | null): void {
    this.position = position;
  }

  getPosition(): Position | null {
    return this.position;
  }

  /**
   * Check a price update against the current position's stops/TP and equity.
   *
   * For BUY positions: stop/TP check against bid (sell side).
   * For SELL positions: stop/TP check against ask (buy-back side).
   *
   * Pessimistic: if both stop and TP could trigger, stop wins.
   * Liquidation (equity <= 0) takes priority over everything.
   *
   * Returns a Trigger if something fires, null otherwise.
   */
  check(bid: number, ask: number, equity: number): Trigger | null {
    if (!this.position) return null;

    // Liquidation takes highest priority
    if (equity <= 0) {
      const price = this.position.direction === 'BUY' ? bid : ask;
      return { reason: 'LIQUIDATION', price };
    }

    const { direction, stopLoss, takeProfit } = this.position;

    let stopTriggered = false;
    let tpTriggered = false;

    if (direction === 'BUY') {
      // Would sell at bid to exit
      if (stopLoss !== undefined && bid <= stopLoss) stopTriggered = true;
      if (takeProfit !== undefined && bid >= takeProfit) tpTriggered = true;
    } else {
      // Would buy back at ask to exit
      if (stopLoss !== undefined && ask >= stopLoss) stopTriggered = true;
      if (takeProfit !== undefined && ask <= takeProfit) tpTriggered = true;
    }

    // Pessimistic: stop wins over TP
    if (stopTriggered) {
      const price = stopLoss!;
      return { reason: 'STOP_LOSS', price };
    }

    if (tpTriggered) {
      const price = takeProfit!;
      return { reason: 'TAKE_PROFIT', price };
    }

    return null;
  }

  /**
   * Check a backtest candle against stops/TP.
   * Uses the candle's high and low to determine if stops/TP were breached.
   *
   * candleLow/candleHigh are bid-side prices (from stored OHLC).
   * spread is added for SELL position ask-side checks.
   */
  checkCandle(
    candleLow: number,
    candleHigh: number,
    spread: number,
    equity: number,
  ): Trigger | null {
    if (!this.position) return null;

    const { direction, stopLoss, takeProfit } = this.position;

    // For liquidation, use worst-case price
    if (equity <= 0) {
      const price = direction === 'BUY' ? candleLow : candleHigh + spread;
      return { reason: 'LIQUIDATION', price };
    }

    let stopTriggered = false;
    let tpTriggered = false;

    if (direction === 'BUY') {
      // Exit at bid side
      if (stopLoss !== undefined && candleLow <= stopLoss) stopTriggered = true;
      if (takeProfit !== undefined && candleHigh >= takeProfit) tpTriggered = true;
    } else {
      // Exit at ask side (bid + spread)
      const askLow = candleLow + spread;
      const askHigh = candleHigh + spread;
      if (stopLoss !== undefined && askHigh >= stopLoss) stopTriggered = true;
      if (takeProfit !== undefined && askLow <= takeProfit) tpTriggered = true;
    }

    // Pessimistic: stop wins
    if (stopTriggered) {
      return { reason: 'STOP_LOSS', price: stopLoss! };
    }

    if (tpTriggered) {
      return { reason: 'TAKE_PROFIT', price: takeProfit! };
    }

    return null;
  }
}
