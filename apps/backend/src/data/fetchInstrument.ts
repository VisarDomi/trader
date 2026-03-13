/**
 * Fetch instrument settings from Capital.com demo API.
 *
 * Uses env vars: CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_PASSWORD.
 * Trading hours stay hardcoded (derived from candle data analysis, not API).
 */

import { CapitalSession } from '../providers/capital/CapitalSession.ts';
import type { InstrumentInfo, TradingHours } from '../core/agent/types.ts';

// Trading hours from candle data analysis — not available from API
const TRADING_HOURS: Record<string, TradingHours> = {
  US100: {
    timezone: 'America/New_York',
    gaps: [
      { from: '2000-01-01', gapStart: '17:00', gapEnd: '18:00' },
      { from: '2025-06-02', gapStart: '17:00', gapEnd: '17:05' },
    ],
  },
};

interface MarketDetailsResponse {
  instrument: {
    epic: string;
    type: string;
    lotSize: number;
  };
  dealingRules: {
    minDealSize: { value: number };
    maxDealSize: { value: number };
    minSizeIncrement: { value: number };
  };
  snapshot: {
    bid: number;
    offer: number;
    decimalPlacesFactor: number;
  };
}

interface AccountPreferences {
  leverages: Record<string, { current: number; available: number[] }>;
}

export async function fetchInstrument(epic: string): Promise<InstrumentInfo> {
  const session = new CapitalSession({
    apiKey: process.env.CAPITAL_API_KEY ?? '',
    identifier: process.env.CAPITAL_IDENTIFIER ?? '',
    password: process.env.CAPITAL_PASSWORD ?? '',
    isDemo: true,
  });

  await session.connect();

  try {
    const market = await session.get<MarketDetailsResponse>(`/api/v1/markets/${epic}`);
    const prefs = await session.get<AccountPreferences>('/api/v1/accounts/preferences');

    const category = market.instrument.type;
    const leverageInfo = prefs.leverages[category];
    const leverage = leverageInfo?.current ?? 20;
    const decimals = market.snapshot.decimalPlacesFactor;
    const spread = +(market.snapshot.offer - market.snapshot.bid).toFixed(decimals);

    const info: InstrumentInfo = {
      epic: market.instrument.epic,
      leveraged: true,
      leverage,
      category,
      spread,
      lotSize: market.instrument.lotSize,
      minSize: market.dealingRules.minDealSize.value,
      maxSize: market.dealingRules.maxDealSize.value,
      sizeIncrement: market.dealingRules.minSizeIncrement.value,
      pricePrecision: decimals,
      tradingHours: TRADING_HOURS[epic] ?? TRADING_HOURS.US100!,
    };

    console.error(`Fetched ${epic} from Capital.com demo:`);
    console.error(`  leverage=${info.leverage}, spread=${info.spread}, lotSize=${info.lotSize}`);
    console.error(`  minSize=${info.minSize}, maxSize=${info.maxSize}, sizeIncrement=${info.sizeIncrement}`);

    return info;
  } finally {
    await session.destroy();
  }
}
