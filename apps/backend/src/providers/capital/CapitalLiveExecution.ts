import type { Fill, InstrumentInfo, Position } from '../../core/agent/types.ts';
import type { ExecutionEngine } from '../../core/execution/types.ts';
import type { Trigger } from '../../core/position/PositionMonitor.ts';
import type { CapitalSession } from './CapitalSession.ts';

const CONFIRM_POLL_DELAY_MS = 200;
const CONFIRM_MAX_RETRIES = 5;

interface DealConfirmation {
  dealId: string;
  dealStatus: 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
  level: number;      // actual fill price
  size: number;
  direction: 'BUY' | 'SELL';
  reason?: string;
}

/**
 * Live execution engine via Capital.com REST API.
 *
 * Opens and closes positions via the Capital.com positions endpoint.
 * Polls deal confirmations after each order.
 *
 * Framework monitors stops via ticks and closes via API — no server-side stops.
 */
export class CapitalLiveExecution implements ExecutionEngine {
  private readonly session: CapitalSession;
  private readonly instrument: InstrumentInfo;
  private activeDealId: string | null = null;

  constructor(session: CapitalSession, instrument: InstrumentInfo) {
    this.session = session;
    this.instrument = instrument;
  }

  async executeOpen(
    side: 'BUY' | 'SELL',
    size: number,
    referencePrice: number,
    timestamp: number,
  ): Promise<Fill> {
    const direction = side === 'BUY' ? 'BUY' : 'SELL';

    const response = await this.session.post<{ dealReference: string }>('/api/v1/positions', {
      epic: this.instrument.epic,
      direction,
      size,
    });

    const confirmation = await this.pollConfirmation(response.dealReference);

    if (confirmation.dealStatus !== 'ACCEPTED') {
      throw new Error(`Order rejected: ${confirmation.reason ?? 'unknown'}`);
    }

    this.activeDealId = confirmation.dealId;

    return {
      action: 'OPENED',
      reason: 'ORDER',
      side,
      size: confirmation.size,
      price: confirmation.level,
      timestamp,
    };
  }

  async executeClose(
    position: Position,
    referencePrice: number,
    timestamp: number,
  ): Promise<Fill> {
    return this.closePosition(position, 'ORDER', timestamp);
  }

  async executeTrigger(
    trigger: Trigger,
    position: Position,
    timestamp: number,
  ): Promise<Fill> {
    return this.closePosition(position, trigger.reason, timestamp);
  }

  private async closePosition(
    position: Position,
    reason: Fill['reason'],
    timestamp: number,
  ): Promise<Fill> {
    if (!this.activeDealId) {
      throw new Error('No active deal to close');
    }

    const dealId = this.activeDealId;

    await this.session.delete(`/api/v1/positions/${dealId}`);

    // Poll for close confirmation
    const confirmation = await this.pollConfirmation(dealId);
    const closeSide: 'BUY' | 'SELL' = position.direction === 'BUY' ? 'SELL' : 'BUY';

    const exitPrice = confirmation.level;
    const pnl = this.calculatePnL(position, exitPrice);

    this.activeDealId = null;

    return {
      action: 'CLOSED',
      reason,
      side: closeSide,
      size: position.size,
      price: exitPrice,
      timestamp,
      pnl,
    };
  }

  private async pollConfirmation(dealReference: string): Promise<DealConfirmation> {
    for (let i = 0; i < CONFIRM_MAX_RETRIES; i++) {
      await sleep(CONFIRM_POLL_DELAY_MS);

      try {
        const confirmation = await this.session.get<DealConfirmation>(
          `/api/v1/confirms/${dealReference}`,
        );
        if (confirmation.dealStatus !== 'UNKNOWN') {
          return confirmation;
        }
      } catch {
        // Retry on transient errors
      }
    }

    throw new Error(`Deal confirmation timeout for ${dealReference}`);
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
