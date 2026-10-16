/** One permanent compressed quote copy; the server is a bounded, acknowledged transfer spool. */
import { sql } from '../data/db.ts';
import { TICK_API, type TickExport, type RecordedTick, type CaptureSession } from '../engine/ticks.ts';
import { ensureTickSchema, storeTickChunk, tickStoreStats } from './tick-store.ts';
import { storageReport } from './storage.ts';
import {join} from 'node:path';
import {DATA_DIR} from './candles.ts';
export { ensureTickSchema } from './tick-store.ts';
const ARENA_URL = process.env.ARENA_URL ?? 'http://127.0.0.1:4120';
const TARGET_ROWS = 50_000,
  MAX_AGE_MS = 15 * 60_000;
async function request(path: string, body?: unknown) {
  const token = process.env.ARENA_TOKEN;
  if (!token) throw new Error('ARENA_TOKEN required for tick archive');
  const res = await fetch(ARENA_URL + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`tick archive HTTP ${res.status}`);
  return res.json();
}
export async function syncTicks(force = false) {
  await ensureTickSchema();
  const status = (await request(TICK_API.EXPORT + '?limit=1')) as TickExport;
  const [row] = await sql`SELECT archived_through FROM tick_recordings WHERE journal_id=${status.journalId}`;
  let through = Number(row?.archived_through ?? 0),
    downloaded = 0;
  if (!row && status.acknowledged > 0)
    throw new Error('Journal previously acknowledged by a missing lab archive; restore that archive before continuing');
  for (let chunk = 0; chunk < 10; chunk++) {
    let cursor = through;
    const ticks: RecordedTick[] = [],
      sessions = new Map<number, CaptureSession>();
    let highWater = status.highWater,
      acknowledged = status.acknowledged;
    do {
      const batch = (await request(TICK_API.EXPORT + `?after=${cursor}`)) as TickExport;
      if (batch.journalId !== status.journalId) throw new Error('recording journal changed during archive');
      if (!ticks.length && batch.ticks.length && batch.ticks[0]!.id > through + 1 && through < batch.acknowledged)
        throw new Error('older ticks missing from transfer spool; refusing to silently skip history');
      highWater = batch.highWater;
      acknowledged = batch.acknowledged;
      ticks.push(...batch.ticks);
      for (const s of batch.sessions) sessions.set(s.id, s);
      cursor = batch.ticks.at(-1)?.id ?? cursor;
      if (!force && ticks.length < TARGET_ROWS && cursor >= highWater && ticks[0] && Date.now() - ticks[0].receivedAt < MAX_AGE_MS) break;
      if (!batch.ticks.length) break;
    } while (ticks.length < TARGET_ROWS && cursor < highWater);
    if (!ticks.length) {
      if (through > acknowledged) await request(TICK_API.ACK, { journalId: status.journalId, through });
      break;
    }
    if (!force && ticks.length < TARGET_ROWS && Date.now() - ticks[0]!.receivedAt < MAX_AGE_MS) break;
    await storeTickChunk(status.journalId, ticks, [...sessions.values()]);
    through = cursor;
    downloaded += ticks.length;
    if (through >= acknowledged) await request(TICK_API.ACK, { journalId: status.journalId, through });
    if (through >= highWater) break;
  }
  if (downloaded) await storageReport();
  return { journalId: status.journalId, through, downloaded, storage: await tickStoreStats() };
}
if(import.meta.main && !process.env.TRADER_TICK_ARCHIVE_LOCK) {
  const child=Bun.spawn(['flock','--nonblock','--conflict-exit-code','0',join(DATA_DIR,'tick-archive.lock'),process.execPath,import.meta.path,...process.argv.slice(2)],{env:{...process.env,TRADER_TICK_ARCHIVE_LOCK:'1'},stdin:'inherit',stdout:'inherit',stderr:'inherit'});
  process.exitCode=await child.exited;
} else if (import.meta.main) {
  try {
    console.log(JSON.stringify(await syncTicks(process.argv.includes('--flush'))));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    await sql.close();
  }
}
