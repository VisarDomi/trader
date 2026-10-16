/** Sole permanent tick store: lossless compressed per-instrument blocks plus compact indexes. */
import { sql } from '../data/db.ts';
import { packTicks, unpackTicks, TICK_CODEC_VERSION } from '../data/tick-codec.ts';
import type { RecordedTick, CaptureSession } from '../engine/ticks.ts';
export const TICK_STORAGE_BUDGET_BYTES = 70_000_000_000;
export async function ensureTickSchema(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS tick_recordings(journal_id TEXT PRIMARY KEY,archived_through BIGINT NOT NULL DEFAULT 0,updated_at BIGINT NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS tick_capture_sessions(journal_id TEXT NOT NULL,id BIGINT NOT NULL,started_at BIGINT NOT NULL,ended_at BIGINT,last_received_at BIGINT NOT NULL,reason TEXT,epics TEXT NOT NULL,PRIMARY KEY(journal_id,id))`;
  await sql`CREATE TABLE IF NOT EXISTS tick_chunks(journal_id TEXT NOT NULL,first_id BIGINT NOT NULL,through_id BIGINT NOT NULL,instrument TEXT NOT NULL,n INTEGER NOT NULL,start_at BIGINT NOT NULL,end_at BIGINT NOT NULL,sha256 TEXT NOT NULL,payload BYTEA NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(journal_id,first_id))`;
  await sql`CREATE INDEX IF NOT EXISTS tick_chunks_by_instrument_delivery ON tick_chunks(instrument,start_at,end_at)`;
  await sql`CREATE INDEX IF NOT EXISTS tick_chunks_by_delivery ON tick_chunks(start_at,end_at)`;
  await sql`CREATE TABLE IF NOT EXISTS tick_recording_stats(journal_id TEXT PRIMARY KEY,n BIGINT NOT NULL,bytes BIGINT NOT NULL,chunks BIGINT NOT NULL,first_at BIGINT NOT NULL,last_at BIGINT NOT NULL)`;
}
export async function storeTickChunk(journalId: string, ticks: RecordedTick[], sessions: CaptureSession[]): Promise<number> {
  const byEpic = new Map<string, RecordedTick[]>();
  for (const q of ticks) {
    const list = byEpic.get(q.epic) ?? [];
    list.push(q);
    byEpic.set(q.epic, list);
  }
  const blocks = [...byEpic].map(([epic, quotes]) => {
    const packed = packTicks(quotes);
    if (JSON.stringify(unpackTicks(packed.payload, packed.sha256)) !== JSON.stringify(quotes))
      throw new Error('tick compression round-trip failed');
    return {
      epic,
      quotes,
      packed,
      first: quotes[0]!.id,
      through: quotes.at(-1)!.id,
      start: Math.min(...quotes.map((q) => q.receivedAt)),
      end: Math.max(...quotes.map((q) => q.receivedAt)),
    };
  });
  const metadata = sessions.map((s) => ({
    journal_id: journalId,
    id: s.id,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    last_received_at: s.lastReceivedAt,
    reason: s.reason,
    epics: s.epics,
  }));
  await sql.begin(async (tx) => {
    if (metadata.length)
      await tx`INSERT INTO tick_capture_sessions ${tx(metadata)} ON CONFLICT(journal_id,id) DO UPDATE SET ended_at=EXCLUDED.ended_at,last_received_at=GREATEST(tick_capture_sessions.last_received_at,EXCLUDED.last_received_at),reason=EXCLUDED.reason`;
    if (!blocks.length) return;
    const [size] = await tx`SELECT pg_total_relation_size('tick_chunks') bytes`;
    if (Number(size.bytes) + blocks.reduce((n, b) => n + b.packed.bytes, 0) > TICK_STORAGE_BUDGET_BYTES)
      throw new Error('Tick archive reached its 70 GB budget; unacknowledged data remains in the server transfer spool');
    for (const b of blocks) {
      const inserted =
        await tx`INSERT INTO tick_chunks VALUES(${journalId},${b.first},${b.through},${b.epic},${b.quotes.length},${b.start},${b.end},${b.packed.sha256},${Buffer.from(b.packed.payload)},${Date.now()}) ON CONFLICT(journal_id,first_id) DO NOTHING RETURNING first_id`;
      const [saved] = await tx`SELECT sha256,payload FROM tick_chunks WHERE journal_id=${journalId} AND first_id=${b.first}`;
      if (saved.sha256 !== b.packed.sha256 || JSON.stringify(unpackTicks(saved.payload, saved.sha256)) !== JSON.stringify(b.quotes))
        throw new Error('durable tick block verification failed');
      if (inserted.length)
        await tx`INSERT INTO tick_recording_stats VALUES(${journalId},${b.quotes.length},${b.packed.bytes},1,${b.start},${b.end}) ON CONFLICT(journal_id) DO UPDATE SET n=tick_recording_stats.n+EXCLUDED.n,bytes=tick_recording_stats.bytes+EXCLUDED.bytes,chunks=tick_recording_stats.chunks+1,first_at=LEAST(tick_recording_stats.first_at,EXCLUDED.first_at),last_at=GREATEST(tick_recording_stats.last_at,EXCLUDED.last_at)`;
    }
    const through = ticks.at(-1)!.id;
    await tx`INSERT INTO tick_recordings VALUES(${journalId},${through},${Date.now()}) ON CONFLICT(journal_id) DO UPDATE SET archived_through=GREATEST(tick_recordings.archived_through,EXCLUDED.archived_through),updated_at=EXCLUDED.updated_at`;
  });
  return blocks.reduce((n, b) => n + b.packed.bytes, 0);
}
export async function tickStoreStats() {
  await ensureTickSchema();
  const [s] =
    await sql`SELECT COALESCE(SUM(n),0) n,COALESCE(SUM(bytes),0) bytes,MIN(first_at) first,MAX(last_at) last,COALESCE(SUM(chunks),0) chunks FROM tick_recording_stats`;
  const [disk] = await sql`SELECT pg_total_relation_size('tick_chunks') bytes,pg_database_size(current_database()) database_bytes`;
  const rows = Number(s.n),
    span = s.first === null ? 0 : (Number(s.last) - Number(s.first)) / 1000,
    bytes = Number(s.bytes);
  return {
    codec: TICK_CODEC_VERSION,
    rows,
    chunks: Number(s.chunks),
    payloadBytes: bytes,
    diskBytes: Number(disk.bytes),
    databaseBytes: Number(disk.database_bytes),
    first: s.first === null ? null : Number(s.first),
    last: s.last === null ? null : Number(s.last),
    bytesPerTick: rows ? bytes / rows : 0,
    ticksPerSecond: span > 0 ? rows / span : 0,
    budgetBytes: TICK_STORAGE_BUDGET_BYTES,
  };
}
