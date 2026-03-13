import type { Candle } from '../core/agent/types.ts';
import { sql } from './db.ts';

export class CandleRepository {
  /**
   * Load minute candles from the database for a given instrument and date range.
   * Returns candles sorted by timestamp ascending.
   */
  static async loadMinuteCandles(
    instrument: string,
    startMs: number,
    endMs: number,
  ): Promise<Candle[]> {
    const rows = await sql`
      SELECT timestamp, open, high, low, close
      FROM candles
      WHERE instrument = ${instrument}
        AND timestamp >= ${startMs}
        AND timestamp <= ${endMs}
      ORDER BY timestamp ASC
    `;

    return rows.map(row => ({
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      timestamp: Number(row.timestamp),
      timeframe: '1m' as const,
    }));
  }

  /**
   * Insert minute candles into the database.
   * Uses ON CONFLICT DO NOTHING for idempotent inserts.
   */
  static async insertCandles(instrument: string, candles: Candle[]): Promise<number> {
    if (candles.length === 0) return 0;

    let inserted = 0;

    // Batch insert in chunks of 500
    for (let i = 0; i < candles.length; i += 500) {
      const batch = candles.slice(i, i + 500);
      const values = batch.map(c => ({
        instrument,
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      await sql`
        INSERT INTO candles ${sql(values)}
        ON CONFLICT (instrument, timestamp) DO NOTHING
      `;

      inserted += batch.length;
    }

    return inserted;
  }

  /**
   * Get the latest candle timestamp for an instrument.
   * Returns null if no candles exist.
   */
  static async getLatestTimestamp(instrument: string): Promise<number | null> {
    const rows = await sql`
      SELECT MAX(timestamp) as latest
      FROM candles
      WHERE instrument = ${instrument}
    `;

    const latest = rows[0]?.latest;
    return latest !== null && latest !== undefined ? Number(latest) : null;
  }

  static async getEarliestTimestamp(instrument: string): Promise<number | null> {
    const rows = await sql`
      SELECT MIN(timestamp) as earliest
      FROM candles
      WHERE instrument = ${instrument}
    `;

    const earliest = rows[0]?.earliest;
    return earliest !== null && earliest !== undefined ? Number(earliest) : null;
  }
}
