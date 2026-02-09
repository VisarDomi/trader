import type { Fill, InstrumentInfo, Position } from '../agent/types.ts';
import type { Trigger } from '../position/PositionMonitor.ts';

/**
 * Common interface for all execution engines.
 *
 * SimulatedExecution: fills at simulated prices with configurable slippage.
 * CapitalLiveExecution: fills via Capital.com REST API.
 *
 * All methods are async to support network-based implementations.
 */
export interface ExecutionEngine {
  executeOpen(
    side: 'BUY' | 'SELL',
    size: number,
    referencePrice: number,
    timestamp: number,
  ): Promise<Fill>;

  executeClose(
    position: Position,
    referencePrice: number,
    timestamp: number,
  ): Promise<Fill>;

  executeTrigger(
    trigger: Trigger,
    position: Position,
    timestamp: number,
  ): Promise<Fill>;
}
