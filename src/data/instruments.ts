import type { InstrumentInfo } from '../core/agent/types.ts';

export const INSTRUMENTS: Record<string, InstrumentInfo> = {
  US100: {
    epic: 'US100',
    leveraged: true,
    leverage: 200,
    spread: 1.8,
    lotSize: 1,
    minSize: 0.5,
    maxSize: 200,
    sizeIncrement: 0.01,
    pricePrecision: 1,
    tradingHours: {
      timezone: 'America/New_York',
      open: '09:30',
      close: '16:00',
    },
  },
};

export function getInstrument(epic: string): InstrumentInfo | undefined {
  return INSTRUMENTS[epic];
}
