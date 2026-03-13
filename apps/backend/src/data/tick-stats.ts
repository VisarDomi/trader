/**
 * Tick data disk usage monitor.
 *
 * Shows per-instrument tick stats (count, date range, days of data,
 * growth rate) and total table size on disk.
 *
 * Usage: bun run tick-stats
 */

import { sql } from './db.ts';

interface InstrumentStats {
  instrument: string;
  tickCount: number;
  firstTick: Date;
  lastTick: Date;
  daysOfData: number;
  ticksPerDay: number;
}

async function getInstrumentStats(): Promise<InstrumentStats[]> {
  const rows = await sql`
    SELECT
      instrument,
      COUNT(*)::bigint AS tick_count,
      MIN(timestamp) AS first_ts,
      MAX(timestamp) AS last_ts
    FROM ticks
    GROUP BY instrument
    ORDER BY instrument
  `;

  return rows.map(row => {
    const firstMs = Number(row.first_ts);
    const lastMs = Number(row.last_ts);
    const spanMs = lastMs - firstMs;
    const daysOfData = spanMs / (1000 * 60 * 60 * 24);
    const tickCount = Number(row.tick_count);

    return {
      instrument: row.instrument,
      tickCount,
      firstTick: new Date(firstMs),
      lastTick: new Date(lastMs),
      daysOfData,
      ticksPerDay: daysOfData > 0 ? tickCount / daysOfData : tickCount,
    };
  });
}

async function getTableSize(): Promise<{ totalBytes: number; pretty: string }> {
  const rows = await sql`
    SELECT
      pg_total_relation_size('ticks') AS total_bytes,
      pg_size_pretty(pg_total_relation_size('ticks')) AS pretty
  `;
  return {
    totalBytes: Number(rows[0].total_bytes),
    pretty: rows[0].pretty,
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function pad(s: string, width: number): string {
  return s.padEnd(width);
}

function padLeft(s: string, width: number): string {
  return s.padStart(width);
}

async function main() {
  const [stats, tableSize] = await Promise.all([
    getInstrumentStats(),
    getTableSize(),
  ]);

  if (stats.length === 0) {
    console.log('No tick data recorded yet.');
    await sql.close();
    return;
  }

  // Header
  console.log('\n  Tick Data Stats');
  console.log('  ' + '='.repeat(90));

  // Per-instrument table
  const cols = {
    instrument: 12,
    ticks: 14,
    first: 22,
    last: 22,
    days: 8,
    rate: 14,
  };

  console.log(
    '  ' +
    pad('Instrument', cols.instrument) +
    padLeft('Ticks', cols.ticks) +
    padLeft('First Tick', cols.first) +
    padLeft('Last Tick', cols.last) +
    padLeft('Days', cols.days) +
    padLeft('Ticks/Day', cols.rate)
  );
  console.log('  ' + '-'.repeat(90));

  let totalTicks = 0;

  for (const s of stats) {
    totalTicks += s.tickCount;
    console.log(
      '  ' +
      pad(s.instrument, cols.instrument) +
      padLeft(formatNumber(s.tickCount), cols.ticks) +
      padLeft(s.firstTick.toISOString().slice(0, 19).replace('T', ' '), cols.first) +
      padLeft(s.lastTick.toISOString().slice(0, 19).replace('T', ' '), cols.last) +
      padLeft(s.daysOfData.toFixed(1), cols.days) +
      padLeft(formatNumber(Math.round(s.ticksPerDay)), cols.rate)
    );
  }

  console.log('  ' + '-'.repeat(90));

  // Totals
  console.log(
    '  ' +
    pad('TOTAL', cols.instrument) +
    padLeft(formatNumber(totalTicks), cols.ticks) +
    padLeft('', cols.first) +
    padLeft('', cols.last) +
    padLeft('', cols.days) +
    padLeft('', cols.rate)
  );

  // Disk usage
  console.log('\n  Disk Usage');
  console.log('  ' + '='.repeat(90));
  console.log(`  Table size (incl. indexes): ${tableSize.pretty}`);

  if (totalTicks > 0) {
    const bytesPerTick = tableSize.totalBytes / totalTicks;
    console.log(`  Bytes per tick: ~${bytesPerTick.toFixed(0)}`);

    // Project 1 year of storage for current instruments
    const totalTicksPerDay = stats.reduce((sum, s) => sum + s.ticksPerDay, 0);
    const yearBytes = totalTicksPerDay * 365 * bytesPerTick;
    const yearGB = yearBytes / (1024 * 1024 * 1024);
    console.log(`  Projected 1-year storage: ~${yearGB.toFixed(1)} GB (at current rate of ${formatNumber(Math.round(totalTicksPerDay))} ticks/day)`);
  }

  console.log('');

  await sql.close();
}

main().catch(err => {
  console.error('tick-stats failed:', err);
  process.exit(1);
});
