/**
 * Historical price data ingestion from Capital.com REST API.
 *
 * Fetches minute OHLC candles and stores them in PostgreSQL.
 * Uses the "to + max" pattern (no "from") — Capital.com counts
 * backwards "max" rows from "to". Walks backwards in batches of 1000.
 *
 * Two passes:
 *   1. Fill recent gap: from now backwards until we overlap existing data.
 *   2. Extend history: from oldest existing candle backwards to cutoff.
 *
 * DB deduplicates via ON CONFLICT DO NOTHING, so overlap is safe.
 *
 * Usage: bun run ingest
 */

import { CandleRepository } from './CandleRepository.ts';
import { sql } from './db.ts';

const BASE_URL = 'https://api-capital.backend-capital.com';
const EPIC = 'US100';
const RESOLUTION = 'MINUTE';
const MAX_PER_REQUEST = 1000;
const RATE_LIMIT_MS = 200;
const SIX_YEARS_MS = 6 * 365 * 24 * 60 * 60 * 1000;

interface SessionTokens {
  cst: string;
  securityToken: string;
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '');
}

async function authenticate(): Promise<SessionTokens> {
  const apiKey = process.env.CAPITAL_API_KEY;
  const identifier = process.env.CAPITAL_IDENTIFIER;
  const password = process.env.CAPITAL_PASSWORD;

  if (!apiKey || !identifier || !password) {
    throw new Error('Missing CAPITAL_API_KEY, CAPITAL_IDENTIFIER, or CAPITAL_PASSWORD in .env');
  }

  const response = await fetch(`${BASE_URL}/api/v1/session`, {
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

async function fetchBatch(
  tokens: SessionTokens,
  toStr: string,
): Promise<{ timestamp: number; open: number; high: number; low: number; close: number }[]> {
  const params = new URLSearchParams({
    resolution: RESOLUTION,
    to: toStr,
    max: String(MAX_PER_REQUEST),
  });

  const response = await fetch(`${BASE_URL}/api/v1/prices/${EPIC}?${params}`, {
    headers: {
      'X-SECURITY-TOKEN': tokens.securityToken,
      CST: tokens.cst,
    },
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      return [];
    }
    throw new Error(`Price fetch failed: ${response.status} ${await response.text()}`);
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

  if (!data.prices || data.prices.length === 0) return [];

  return data.prices.map(p => ({
    timestamp: new Date(p.snapshotTimeUTC.replace(/\/$/, '') + 'Z').getTime(),
    open: p.openPrice.bid,
    high: p.highPrice.bid,
    low: p.lowPrice.bid,
    close: p.closePrice.bid,
  }));
}

/**
 * Walk backwards from `startMs` until `stopMs` or until we hit
 * `maxZeroInsertBatches` consecutive batches with 0 new rows.
 */
async function walkBackwards(
  tokens: SessionTokens,
  startMs: number,
  stopMs: number,
  label: string,
  maxZeroInsertBatches = 10,
): Promise<number> {
  let cursorMs = startMs;
  let totalInserted = 0;
  let emptyBatches = 0;
  let zeroInsertBatches = 0;

  while (cursorMs > stopMs) {
    const toStr = formatDate(cursorMs);
    const prices = await fetchBatch(tokens, toStr);

    if (prices.length === 0) {
      emptyBatches++;
      cursorMs -= MAX_PER_REQUEST * 60_000;
      if (emptyBatches > 10) {
        console.log(`  [${label}] 10 consecutive empty batches — reached end of available data.`);
        break;
      }
      await Bun.sleep(RATE_LIMIT_MS);
      continue;
    }

    emptyBatches = 0;
    prices.sort((a, b) => a.timestamp - b.timestamp);
    const oldest = prices[0].timestamp;
    const newest = prices[prices.length - 1].timestamp;

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

    console.log(`  [${label}] ${formatDate(oldest)} → ${formatDate(newest)}: ${prices.length} candles (${inserted} new)`);

    // If we got data but inserted 0 new rows, we've overlapped existing data
    if (inserted === 0) {
      zeroInsertBatches++;
      if (zeroInsertBatches >= maxZeroInsertBatches) {
        console.log(`  [${label}] ${maxZeroInsertBatches} consecutive batches with 0 new rows — fully overlapped.`);
        break;
      }
    } else {
      zeroInsertBatches = 0;
    }

    cursorMs = oldest - 60_000;
    await Bun.sleep(RATE_LIMIT_MS);
  }

  return totalInserted;
}

async function main() {
  console.log(`Ingesting ${EPIC} minute candles from Capital.com...`);

  const nowMs = Date.now();
  const cutoffMs = nowMs - SIX_YEARS_MS;

  const tokens = await authenticate();
  console.log('  Authenticated.');

  const earliestTs = await CandleRepository.getEarliestTimestamp(EPIC);
  const latestTs = await CandleRepository.getLatestTimestamp(EPIC);

  let totalInserted = 0;

  // Pass 1: Fill recent gap (from now backwards to latest existing data)
  if (latestTs) {
    console.log(`\n  Latest existing candle: ${new Date(latestTs).toISOString()}`);
    console.log(`  Filling recent gap (now → existing data)...`);
    const inserted = await walkBackwards(tokens, nowMs, latestTs - 60_000, 'recent', 3);
    totalInserted += inserted;
    console.log(`  Recent fill: ${inserted} new candles.`);
  }

  // Pass 2: Extend history backwards (from oldest existing candle to cutoff)
  if (earliestTs && earliestTs > cutoffMs) {
    console.log(`\n  Earliest existing candle: ${new Date(earliestTs).toISOString()}`);
    console.log(`  Extending history backwards to ${new Date(cutoffMs).toISOString()}...`);
    const inserted = await walkBackwards(tokens, earliestTs, cutoffMs, 'history');
    totalInserted += inserted;
    console.log(`  History extension: ${inserted} new candles.`);
  } else if (!earliestTs) {
    // No data at all — fetch everything from now
    console.log(`\n  No existing data. Fetching from now backwards...`);
    const inserted = await walkBackwards(tokens, nowMs, cutoffMs, 'full');
    totalInserted += inserted;
  } else {
    console.log(`\n  History already reaches cutoff (${new Date(cutoffMs).toISOString()}).`);
  }

  // Final stats
  const finalEarliest = await CandleRepository.getEarliestTimestamp(EPIC);
  const finalLatest = await CandleRepository.getLatestTimestamp(EPIC);
  console.log(`\nDone. Inserted ${totalInserted} new candles.`);
  if (finalEarliest && finalLatest) {
    console.log(`  Range: ${new Date(finalEarliest).toISOString()} → ${new Date(finalLatest).toISOString()}`);
  }

  await sql.close();
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
