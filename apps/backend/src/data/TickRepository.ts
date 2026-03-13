import { sql } from './db.ts';

export interface Tick {
  instrument: string;
  timestamp: number;
  bid: number;
  ask: number;
}

export class TickRepository {
  static async insertTicks(ticks: Tick[]): Promise<number> {
    if (ticks.length === 0) return 0;

    let inserted = 0;

    for (let i = 0; i < ticks.length; i += 500) {
      const batch = ticks.slice(i, i + 500);
      const values = batch.map(t => ({
        instrument: t.instrument,
        timestamp: t.timestamp,
        bid: t.bid,
        ask: t.ask,
      }));

      await sql`
        INSERT INTO ticks ${sql(values)}
        ON CONFLICT (instrument, timestamp) DO NOTHING
      `;

      inserted += batch.length;
    }

    return inserted;
  }

  static async loadTicks(
    instrument: string,
    startMs: number,
    endMs: number,
  ): Promise<Tick[]> {
    const rows = await sql`
      SELECT timestamp, bid, ask
      FROM ticks
      WHERE instrument = ${instrument}
        AND timestamp >= ${startMs}
        AND timestamp <= ${endMs}
      ORDER BY timestamp ASC
    `;

    return rows.map(row => ({
      instrument,
      timestamp: Number(row.timestamp),
      bid: Number(row.bid),
      ask: Number(row.ask),
    }));
  }

  static async getLatestTimestamp(instrument: string): Promise<number | null> {
    const rows = await sql`
      SELECT MAX(timestamp) as latest
      FROM ticks
      WHERE instrument = ${instrument}
    `;

    const latest = rows[0]?.latest;
    return latest !== null && latest !== undefined ? Number(latest) : null;
  }

  static async count(instrument: string): Promise<number> {
    const rows = await sql`
      SELECT COUNT(*) as cnt
      FROM ticks
      WHERE instrument = ${instrument}
    `;
    return Number(rows[0]?.cnt ?? 0);
  }
}
