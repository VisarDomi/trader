/**
 * Ingest 1-minute candles from Capital.com (demo API) into PostgreSQL.
 *
 * Usage:
 *   bun run ingest                 # all instruments, gap-fill up to now
 *   bun run ingest US100 GOLD      # selected instruments
 *   bun run ingest --enrich US100  # also re-fetch existing range to add spread/volume
 *
 * Resumable: each run only fetches what is missing. Capital.com keeps a rolling
 * window of minute history (~2-3 years), so the first fetch for a new
 * instrument walks forward from the earliest available day.
 */
import { sql } from '../data/db.ts';
import { ALL_EPICS, getInstrument } from '../engine/instruments.ts';
import { CapitalClient, credentialsFromEnv, RESOLUTION } from '../capital/client.ts';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const WINDOW_MINUTES = 1000;
const SEARCH_FLOOR_MS = Date.parse('2020-01-01T00:00:00Z');
const FLAG_ENRICH = '--enrich';
const CONCURRENCY = 4;

/** The only PostgreSQL table: 1-minute bid candles, spread = ask - bid at the close. */
async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS candles (
      instrument TEXT    NOT NULL,
      timestamp  BIGINT  NOT NULL,
      open       NUMERIC NOT NULL,
      high       NUMERIC NOT NULL,
      low        NUMERIC NOT NULL,
      close      NUMERIC NOT NULL,
      spread     REAL,
      volume     REAL,
      PRIMARY KEY (instrument, timestamp)
    )`;
}

async function bounds(epic: string): Promise<{ earliest: number | null; latest: number | null }> {
  const [row] = await sql`SELECT MIN(timestamp) AS earliest, MAX(timestamp) AS latest FROM candles WHERE instrument = ${epic}`;
  return {
    earliest: row?.earliest == null ? null : Number(row.earliest),
    latest: row?.latest == null ? null : Number(row.latest),
  };
}

/** Binary-search the first day Capital.com has minute data for (day precision). */
async function findHistoryStart(client: CapitalClient, epic: string): Promise<number> {
  let lo = SEARCH_FLOOR_MS; // assumed: no data before lo... verified below
  let hi = Date.now();
  if (await client.hasDataBefore(epic, lo)) return lo;
  while (hi - lo > DAY_MS) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (await client.hasDataBefore(epic, mid)) hi = mid;
    else lo = mid;
  }
  return Math.floor(lo / DAY_MS) * DAY_MS;
}

async function insertBars(epic: string, bars: Awaited<ReturnType<CapitalClient['prices']>>): Promise<void> {
  if (bars.length === 0) return;
  const rows = bars.map(b => ({
    instrument: epic,
    timestamp: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    spread: b.spread,
    volume: b.volume,
  }));
  await sql`
    INSERT INTO candles ${sql(rows)}
    ON CONFLICT (instrument, timestamp) DO UPDATE
      SET spread = EXCLUDED.spread, volume = EXCLUDED.volume
      WHERE candles.spread IS NULL
  `;
}

async function fetchRange(client: CapitalClient, epic: string, fromMs: number, toMs: number, label: string): Promise<number> {
  const totalWindows = Math.ceil((toMs - fromMs) / (WINDOW_MINUTES * MINUTE_MS));
  let cursor = fromMs;
  let windows = 0;
  let stored = 0;
  const started = Date.now();
  while (cursor <= toMs) {
    const windowEnd = Math.min(cursor + (WINDOW_MINUTES - 1) * MINUTE_MS, toMs);
    const bars = await client.prices(epic, RESOLUTION.MINUTE, cursor, windowEnd, WINDOW_MINUTES);
    await insertBars(epic, bars);
    stored += bars.length;
    cursor = windowEnd + MINUTE_MS;
    windows++;
    if (windows % 50 === 0 || cursor > toMs) {
      const pct = ((windows / Math.max(1, totalWindows)) * 100).toFixed(1);
      const rate = (windows / ((Date.now() - started) / 1000)).toFixed(1);
      console.log(`  [${epic} ${label}] ${windows}/${totalWindows} windows (${pct}%), ${stored} bars, ${rate} req/s, at ${new Date(cursor).toISOString().slice(0, 16)}`);
    }
  }
  return stored;
}

async function ingestEpic(client: CapitalClient, epic: string, enrich: boolean): Promise<void> {
  getInstrument(epic); // validates the epic
  const { earliest, latest } = await bounds(epic);
  const historyStart = await findHistoryStart(client, epic);
  const now = Date.now();
  console.log(`[${epic}] db=${fmt(earliest)}..${fmt(latest)} capital history starts ~${fmt(historyStart)}`);

  if (earliest === null || latest === null) {
    await fetchRange(client, epic, historyStart, now, 'full');
    return;
  }
  if (historyStart < earliest) {
    await fetchRange(client, epic, historyStart, earliest - MINUTE_MS, 'backfill');
  }
  if (enrich) {
    await fetchRange(client, epic, Math.max(historyStart, earliest), latest, 'enrich');
  }
  await fetchRange(client, epic, latest + MINUTE_MS, now, 'forward');
}

function fmt(ms: number | null): string {
  return ms === null ? '—' : new Date(ms).toISOString().slice(0, 16);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const enrich = args.includes(FLAG_ENRICH);
  const epics = args.filter(a => !a.startsWith('--'));
  const targets = epics.length > 0 ? epics : ALL_EPICS;

  await ensureSchema();
  const client = new CapitalClient(credentialsFromEnv());
  await client.login();

  // A few instruments in flight at once; the client's throttle caps the total request rate.
  const queue = [...targets];
  const worker = async (): Promise<void> => {
    for (let epic = queue.shift(); epic; epic = queue.shift()) {
      try {
        await ingestEpic(client, epic, enrich);
      } catch (err) {
        console.error(`[${epic}] ingest failed:`, err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('ingest done');
  process.exit(0);
}

await main();
