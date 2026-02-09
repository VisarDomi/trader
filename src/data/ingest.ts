/**
 * Historical price data ingestion from Capital.com REST API.
 *
 * Fetches minute OHLC candles and stores them in PostgreSQL.
 * Picks up from the last stored timestamp, fetches in 8-hour windows.
 *
 * Usage: bun run ingest
 *
 * Environment variables (from .env):
 *   CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_PASSWORD
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
 */

import { CandleRepository } from './CandleRepository.ts';
import { sql } from './db.ts';

const REAL_BASE_URL = 'https://api-capital.backend-capital.com';
const EPIC = 'US100';
const RESOLUTION = 'MINUTE';
const WINDOW_HOURS = 8;
const RATE_LIMIT_MS = 200;
const DEFAULT_START = '2017-05-01T00:00:00Z';

interface SessionTokens {
  cst: string;
  securityToken: string;
}

async function authenticate(): Promise<SessionTokens> {
  const apiKey = process.env.CAPITAL_API_KEY;
  const identifier = process.env.CAPITAL_IDENTIFIER;
  const password = process.env.CAPITAL_PASSWORD;

  if (!apiKey || !identifier || !password) {
    throw new Error('Missing CAPITAL_API_KEY, CAPITAL_IDENTIFIER, or CAPITAL_PASSWORD in .env');
  }

  const response = await fetch(`${REAL_BASE_URL}/api/v1/session`, {
    method: 'POST',
    headers: {
      'X-CAP-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identifier, password }),
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status} ${await response.text()}`);
  }

  const cst = response.headers.get('cst');
  const securityToken = response.headers.get('x-security-token');

  if (!cst || !securityToken) {
    throw new Error('Missing session tokens in auth response');
  }

  return { cst, securityToken };
}

async function fetchPrices(
  tokens: SessionTokens,
  from: string,
  to: string,
): Promise<{ timestamp: number; open: number; high: number; low: number; close: number }[]> {
  const params = new URLSearchParams({
    resolution: RESOLUTION,
    from,
    to,
    max: '1000',
  });

  const response = await fetch(`${REAL_BASE_URL}/api/v1/prices/${EPIC}?${params}`, {
    headers: {
      'X-SECURITY-TOKEN': tokens.securityToken,
      CST: tokens.cst,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    // Capital.com returns errors for date ranges with no data
    if (response.status === 400) {
      console.log(`  No data for range ${from} → ${to}`);
      return [];
    }
    throw new Error(`Price fetch failed: ${response.status} ${text}`);
  }

  const data = await response.json() as {
    prices: {
      snapshotTimeUTC: string;
      openPrice: { bid: number };
      closePrice: { bid: number };
      highPrice: { bid: number };
      lowPrice: { bid: number };
    }[];
  };

  return data.prices.map(p => ({
    timestamp: new Date(p.snapshotTimeUTC.replace(/\/$/, '') + 'Z').getTime(),
    open: p.openPrice.bid,
    high: p.highPrice.bid,
    low: p.lowPrice.bid,
    close: p.closePrice.bid,
  }));
}

async function main() {
  console.log(`Ingesting ${EPIC} minute candles from Capital.com...`);

  // Get last stored timestamp
  const latestTs = await CandleRepository.getLatestTimestamp(EPIC);
  const startMs = latestTs ? latestTs + 60_000 : new Date(DEFAULT_START).getTime();
  const endMs = Date.now();

  console.log(`  Start: ${new Date(startMs).toISOString()}`);
  console.log(`  End:   ${new Date(endMs).toISOString()}`);

  if (startMs >= endMs) {
    console.log('  Already up to date.');
    await sql.close();
    return;
  }

  // Authenticate
  const tokens = await authenticate();
  console.log('  Authenticated.');

  // Fetch in windows
  const windowMs = WINDOW_HOURS * 60 * 60 * 1000;
  let current = startMs;
  let totalInserted = 0;

  while (current < endMs) {
    const windowEnd = Math.min(current + windowMs, endMs);
    const from = new Date(current).toISOString();
    const to = new Date(windowEnd).toISOString();

    const prices = await fetchPrices(tokens, from, to);

    if (prices.length > 0) {
      const candles = prices.map(p => ({
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        timestamp: p.timestamp,
        timeframe: '1m' as const,
      }));

      const inserted = await CandleRepository.insertCandles(EPIC, candles);
      totalInserted += inserted;
      console.log(`  ${from} → ${to}: ${prices.length} candles`);
    }

    current = windowEnd;
    await Bun.sleep(RATE_LIMIT_MS);
  }

  console.log(`Done. Inserted ${totalInserted} candles.`);
  await sql.close();
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
