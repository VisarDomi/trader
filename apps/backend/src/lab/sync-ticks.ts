/** Pull raw quotes; commit idempotently to PostgreSQL before acknowledging the server spool. */
import { sql } from '../data/db.ts';
import { TICK_API, type TickExport } from '../engine/ticks.ts';
const ARENA_URL=process.env.ARENA_URL??'http://127.0.0.1:4120';
export async function ensureTickSchema(): Promise<void> {
 await sql`CREATE TABLE IF NOT EXISTS tick_recordings(journal_id TEXT PRIMARY KEY,archived_through BIGINT NOT NULL DEFAULT 0,updated_at BIGINT NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS recorded_ticks(journal_id TEXT NOT NULL,id BIGINT NOT NULL,session BIGINT NOT NULL,instrument TEXT NOT NULL,timestamp BIGINT NOT NULL,received_at BIGINT NOT NULL,bid DOUBLE PRECISION NOT NULL,ask DOUBLE PRECISION NOT NULL,timestamp_fallback BOOLEAN NOT NULL,PRIMARY KEY(journal_id,id))`;
 await sql`CREATE INDEX IF NOT EXISTS recorded_ticks_by_instrument_delivery ON recorded_ticks(instrument,received_at,journal_id,id)`;
 await sql`CREATE TABLE IF NOT EXISTS tick_capture_sessions(journal_id TEXT NOT NULL,id BIGINT NOT NULL,started_at BIGINT NOT NULL,ended_at BIGINT,last_received_at BIGINT NOT NULL,reason TEXT,epics TEXT NOT NULL,PRIMARY KEY(journal_id,id))`;
}
async function request(path:string,body?:unknown) {
 const token=process.env.ARENA_TOKEN;if(!token)throw new Error('ARENA_TOKEN required for tick archive');
 const res=await fetch(ARENA_URL+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
 if(!res.ok)throw new Error(`tick archive HTTP ${res.status}`);return res.json();
}
export async function syncTicks(): Promise<{journalId:string;through:number;downloaded:number}> {
 await ensureTickSchema();
 const status=await request(TICK_API.EXPORT+'?limit=1') as TickExport;
 const [row]=await sql`SELECT archived_through FROM tick_recordings WHERE journal_id=${status.journalId}`;
 let through=Number(row?.archived_through??0),downloaded=0;
 if(!row && status.acknowledged>0)throw new Error('Journal previously acknowledged by a different/lost archive; refusing to silently omit older ticks');
 for(let page=0;page<100;page++) {
  const batch=await request(TICK_API.EXPORT+`?after=${through}`) as TickExport;
  if(batch.journalId!==status.journalId)throw new Error('recording journal changed during archive');
  const ticks=batch.ticks.map(q=>({journal_id:batch.journalId,id:q.id,session:q.session,instrument:q.epic,timestamp:q.time,received_at:q.receivedAt,bid:q.bid,ask:q.ask,timestamp_fallback:Boolean(q.timestampFallback)}));
  const sessions=batch.sessions.map(s=>({journal_id:batch.journalId,id:s.id,started_at:s.startedAt,ended_at:s.endedAt,last_received_at:s.lastReceivedAt,reason:s.reason,epics:s.epics}));
  const next=batch.ticks.at(-1)?.id??through;
  await sql.begin(async tx=>{
   if(ticks.length)await tx`INSERT INTO recorded_ticks ${tx(ticks)} ON CONFLICT(journal_id,id) DO NOTHING`;
   if(sessions.length)await tx`INSERT INTO tick_capture_sessions ${tx(sessions)} ON CONFLICT(journal_id,id) DO UPDATE SET ended_at=EXCLUDED.ended_at,last_received_at=EXCLUDED.last_received_at,reason=EXCLUDED.reason`;
   await tx`INSERT INTO tick_recordings VALUES(${batch.journalId},${next},${Date.now()}) ON CONFLICT(journal_id) DO UPDATE SET archived_through=EXCLUDED.archived_through,updated_at=EXCLUDED.updated_at`;
  });
  through=next;downloaded+=ticks.length;
  await request(TICK_API.ACK,{journalId:batch.journalId,through});
  if(through>=batch.highWater || !ticks.length)break;
 }
 return {journalId:status.journalId,through,downloaded};
}
if(import.meta.main){try{console.log(JSON.stringify(await syncTicks()));}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}finally{await sql.close();}}
