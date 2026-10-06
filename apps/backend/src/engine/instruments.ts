/**
 * Instrument registry — every market the platform can trade.
 *
 * All instruments are quoted in USD so P&L needs no currency conversion.
 * Values come from Capital.com GET /api/v1/markets/{epic} (dealingRules,
 * marginFactor, overnightFee) as of 2026-10-06.
 *
 * Candles are stored bid-side. A BUY fills at ask = bid + spread.
 */

export const ASSET_CLASS = {
  INDEX: 'index',
  COMMODITY: 'commodity',
  FX: 'fx',
  CRYPTO: 'crypto',
} as const;
export type AssetClass = (typeof ASSET_CLASS)[keyof typeof ASSET_CLASS];

export interface Instrument {
  epic: string;
  name: string;
  assetClass: AssetClass;
  /** Decimal places of the quoted price. */
  pricePrecision: number;
  minSize: number;
  sizeStep: number;
  maxSize: number;
  /** Fraction of notional locked as margin (0.05 = 5% = 20x). */
  marginFactor: number;
  /** Spread (price units) used when a candle has no recorded spread. */
  typicalSpread: number;
  /** Overnight funding in % of notional per night. Negative = trader pays. */
  overnightLongPct: number;
  overnightShortPct: number;
  /** Non-crypto markets charge three nights on Friday to cover the weekend. */
  weekendTripleSwap: boolean;
}

export const INSTRUMENTS: Record<string, Instrument> = {
  US100: {
    epic: 'US100', name: 'US Tech 100', assetClass: ASSET_CLASS.INDEX,
    pricePrecision: 1, minSize: 0.001, sizeStep: 0.001, maxSize: 1250, marginFactor: 0.05,
    typicalSpread: 1.8, overnightLongPct: -0.0222347, overnightShortPct: 0.0000124, weekendTripleSwap: true,
  },
  US500: {
    epic: 'US500', name: 'US 500', assetClass: ASSET_CLASS.INDEX,
    pricePrecision: 1, minSize: 0.01, sizeStep: 0.01, maxSize: 2250, marginFactor: 0.05,
    typicalSpread: 0.6, overnightLongPct: -0.0222347, overnightShortPct: 0.0000124, weekendTripleSwap: true,
  },
  US30: {
    epic: 'US30', name: 'US Wall Street 30', assetClass: ASSET_CLASS.INDEX,
    pricePrecision: 1, minSize: 0.001, sizeStep: 0.001, maxSize: 500, marginFactor: 0.05,
    typicalSpread: 3.0, overnightLongPct: -0.0222347, overnightShortPct: 0.0000124, weekendTripleSwap: true,
  },
  GOLD: {
    epic: 'GOLD', name: 'Gold', assetClass: ASSET_CLASS.COMMODITY,
    pricePrecision: 2, minSize: 0.01, sizeStep: 0.01, maxSize: 50000, marginFactor: 0.05,
    typicalSpread: 0.5, overnightLongPct: -0.0161682, overnightShortPct: 0.0079482, weekendTripleSwap: true,
  },
  SILVER: {
    epic: 'SILVER', name: 'Silver', assetClass: ASSET_CLASS.COMMODITY,
    pricePrecision: 3, minSize: 1, sizeStep: 0.1, maxSize: 100000, marginFactor: 0.1,
    typicalSpread: 0.03, overnightLongPct: -0.016188, overnightShortPct: 0.007968, weekendTripleSwap: true,
  },
  OIL_CRUDE: {
    epic: 'OIL_CRUDE', name: 'Crude Oil Spot', assetClass: ASSET_CLASS.COMMODITY,
    pricePrecision: 3, minSize: 1, sizeStep: 0.1, maxSize: 125000, marginFactor: 0.1,
    typicalSpread: 0.03, overnightLongPct: -0.01096, overnightShortPct: -0.01096, weekendTripleSwap: true,
  },
  NATURALGAS: {
    epic: 'NATURALGAS', name: 'Natural Gas', assetClass: ASSET_CLASS.COMMODITY,
    pricePrecision: 4, minSize: 10, sizeStep: 0.1, maxSize: 2000000, marginFactor: 0.1,
    typicalSpread: 0.005, overnightLongPct: -0.01096, overnightShortPct: -0.01096, weekendTripleSwap: true,
  },
  EURUSD: {
    epic: 'EURUSD', name: 'EUR/USD', assetClass: ASSET_CLASS.FX,
    pricePrecision: 5, minSize: 100, sizeStep: 100, maxSize: 45000000, marginFactor: 0.0333333,
    typicalSpread: 0.00006, overnightLongPct: -0.00812, overnightShortPct: -0.0001, weekendTripleSwap: true,
  },
  GBPUSD: {
    epic: 'GBPUSD', name: 'GBP/USD', assetClass: ASSET_CLASS.FX,
    pricePrecision: 5, minSize: 100, sizeStep: 100, maxSize: 40000000, marginFactor: 0.0333333,
    typicalSpread: 0.00013, overnightLongPct: -0.00474, overnightShortPct: -0.00348, weekendTripleSwap: true,
  },
  AUDUSD: {
    epic: 'AUDUSD', name: 'AUD/USD', assetClass: ASSET_CLASS.FX,
    pricePrecision: 5, minSize: 100, sizeStep: 100, maxSize: 75000000, marginFactor: 0.05,
    typicalSpread: 0.00006, overnightLongPct: -0.00239, overnightShortPct: -0.00583, weekendTripleSwap: true,
  },
  BTCUSD: {
    epic: 'BTCUSD', name: 'Bitcoin/USD', assetClass: ASSET_CLASS.CRYPTO,
    pricePrecision: 2, minSize: 0.0001, sizeStep: 0.0001, maxSize: 50, marginFactor: 0.5,
    typicalSpread: 50, overnightLongPct: -0.0616438, overnightShortPct: 0.0136986, weekendTripleSwap: false,
  },
  ETHUSD: {
    epic: 'ETHUSD', name: 'Ethereum/USD', assetClass: ASSET_CLASS.CRYPTO,
    pricePrecision: 2, minSize: 0.001, sizeStep: 0.001, maxSize: 1000, marginFactor: 0.5,
    typicalSpread: 1.75, overnightLongPct: -0.0616438, overnightShortPct: 0.0136986, weekendTripleSwap: false,
  },
};

export const ALL_EPICS: string[] = Object.keys(INSTRUMENTS);

/** Daily overnight-funding charge time (UTC hour). Capital.com charges at 21:00 UTC. */
export const SWAP_HOUR_UTC = 21;

export function getInstrument(epic: string): Instrument {
  const instrument = INSTRUMENTS[epic];
  if (!instrument) {
    throw new Error(`Unknown instrument "${epic}". Known: ${ALL_EPICS.join(', ')}`);
  }
  return instrument;
}
