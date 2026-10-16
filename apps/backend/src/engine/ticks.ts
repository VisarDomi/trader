/** Quote provenance is part of the public contract, never inferred from a backtest label. */
export const TICK_SOURCE = { LIVE: 'live', RECORDED: 'recorded', SYNTHETIC: 'synthetic' } as const;
export type TickSource = (typeof TICK_SOURCE)[keyof typeof TICK_SOURCE];
export interface Tick {
  /** Capital's quote timestamp, UTC milliseconds. */
  time: number;
  /** Local delivery time. Replay preserves this clock and arrival order. */
  receivedAt: number;
  bid: number;
  ask: number;
  source: TickSource;
  /** Durable sequence within one recording journal, including repeated prices/timestamps. */
  sequence?: number;
  journalId?: string;
  /** Synthetic quote's share of the candle's reported tick volume; real updates contribute one. */
  volume?: number;
}
export interface RecordedTick {
  id: number;
  session: number;
  epic: string;
  time: number;
  receivedAt: number;
  bid: number;
  ask: number;
  timestampFallback: number;
}
export interface CaptureSession {
  id: number;
  startedAt: number;
  endedAt: number | null;
  lastReceivedAt: number;
  reason: string | null;
  epics: string;
}
export interface TickExport {
  journalId: string;
  highWater: number;
  acknowledged: number;
  ticks: RecordedTick[];
  sessions: CaptureSession[];
}
export const TICK_API = {
  STATUS: '/api/ticks',
  EXPORT: '/api/ticks/export',
  ACK: '/api/ticks/ack',
  STORAGE: '/api/ticks/storage',
} as const;
export const TICK_EXPORT_LIMIT = 5000;
