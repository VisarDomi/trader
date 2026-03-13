import type { InstrumentInfo } from '../core/agent/types.ts';

export const INSTRUMENTS: Record<string, InstrumentInfo> = {
  US100: {
    epic: 'US100',
    leveraged: true,
    leverage: 200,
    category: 'INDICES',
    spread: 1.8,
    lotSize: 1,
    minSize: 0.001,
    maxSize: 1250,
    sizeIncrement: 0.001,
    pricePrecision: 1,
    tradingHours: {
      timezone: 'America/New_York',
      gaps: [
        { from: '2023-01-01', gapStart: '17:00', gapEnd: '18:00' },
        { from: '2025-06-02', gapStart: '17:00', gapEnd: '17:05' },
      ],
    },
  },
  BTCUSD: {
    epic: 'BTCUSD',
    leveraged: true,
    leverage: 2,
    category: 'CRYPTOCURRENCIES',
    spread: 50,
    lotSize: 1,
    minSize: 0.01,
    maxSize: 50,
    sizeIncrement: 0.01,
    pricePrecision: 0,
    tradingHours: {
      timezone: 'America/New_York',
      gaps: [],
    },
  },
};

/**
 * Instruments to record ticks for.
 * Capital.com allows max 40 per WebSocket subscription (see DECISIONS.md).
 */
export const RECORDED_EPICS: string[] = [
  'US100',
  'BTCUSD',
];

const MAX_WS_SUBSCRIPTIONS = 40;
if (RECORDED_EPICS.length > MAX_WS_SUBSCRIPTIONS) {
  throw new Error(
    `RECORDED_EPICS has ${RECORDED_EPICS.length} instruments, but Capital.com allows max ${MAX_WS_SUBSCRIPTIONS} per WebSocket subscription.`
  );
}

export function getInstrument(epic: string): InstrumentInfo | undefined {
  return INSTRUMENTS[epic];
}
