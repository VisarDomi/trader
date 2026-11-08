import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { sql } from '../data/db';
import { unpackTicks } from '../data/tick-codec';
import { INSPECTION_LIMITS, type Interval, type Quote, type Candle } from './model';
export async function readPath(epic:string,from:number,through:number,spoolPath:string){
  const quotes:Quote[]=[],sessions:Interval[]=[],candles:Candle[]=[];let limited=false,archiveLimited=false;const loaded:{from:number;through:number}[]=[];
  await sql.begin(async tx=>{
    await tx`SET TRANSACTION READ ONLY`;
    const blocks=await tx`SELECT journal_id,first_id,start_at,end_at FROM tick_chunks WHERE instrument=${epic} AND end_at>=${from-30000} AND start_at<=${through} ORDER BY start_at LIMIT ${INSPECTION_LIMITS.chunks+1}`;
    if(blocks.length>INSPECTION_LIMITS.chunks)limited=archiveLimited=true;
    for(const block of blocks.slice(0,INSPECTION_LIMITS.chunks)){
      const [r]=await tx`SELECT payload,sha256 FROM tick_chunks WHERE journal_id=${block.journal_id} AND first_id=${block.first_id}`;
      for(const q of unpackTicks(r.payload,r.sha256))if(q.epic===epic&&q.receivedAt>=from-30000&&q.receivedAt<=through){if(quotes.length>=INSPECTION_LIMITS.scanTicks-10000){limited=archiveLimited=true;break;}quotes.push({...q,journalId:block.journal_id});}
      if(archiveLimited&&quotes.length>=INSPECTION_LIMITS.scanTicks-10000)break;
    }
    loaded.push({from,through:archiveLimited?quotes.reduce((n,q)=>Math.max(n,q.receivedAt),from):through});
    const captured=await tx`SELECT started_at,COALESCE(ended_at,last_received_at) through FROM tick_capture_sessions WHERE started_at<=${through} AND COALESCE(ended_at,last_received_at)>=${from} AND epics::jsonb ? ${epic}`;
    for(const s of captured)sessions.push({from:Number(s.started_at),through:Number(s.through)});
    const bars=await tx`SELECT timestamp,open,high,low,close FROM candles WHERE instrument=${epic} AND timestamp>=${from} AND timestamp<=${through} ORDER BY timestamp`;
    for(const c of bars)candles.push({t:Number(c.timestamp),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)});
  });
  if(existsSync(spoolPath)){
    const db=new Database(spoolPath,{readonly:true});
    try{
      const journal=(db.query<any,[]>('SELECT value FROM meta WHERE key=\'journalId\'').get())?.value;
      const latest=quotes.filter(q=>q.journalId===journal).reduce((n,q)=>Math.max(n,q.id),0);
      const budget=Math.max(0,INSPECTION_LIMITS.scanTicks-quotes.length);
      const tail=db.query<any,[string,number,number,number,number]>('SELECT id,session,epic,t,received_at,bid,ask FROM ticks WHERE epic=? AND t>=? AND t<=? AND id>? ORDER BY id DESC LIMIT ?').all(epic,from-60000,through+1000,latest,budget+1);
      if(tail.length>budget)limited=true;
      const selected=tail.slice(0,budget);if(selected.length)loaded.push({from:Math.min(...selected.map(q=>q.received_at)),through});
      for(const q of selected)if(q.received_at>=from-30000&&q.received_at<=through)quotes.push({id:q.id,session:q.session,time:q.t,receivedAt:q.received_at,bid:q.bid,ask:q.ask,journalId:journal});
      for(const s of db.query<any,[number,number]>('SELECT started_at,COALESCE(ended_at,last_received_at) through FROM sessions WHERE started_at<=? AND COALESCE(ended_at,last_received_at)>=?').all(through,from))sessions.push({from:s.started_at,through:s.through});
    }finally{db.close();}
  }
  const covered=limited?sessions.flatMap(s=>loaded.map(l=>({from:Math.max(s.from,l.from),through:Math.min(s.through,l.through)})).filter(i=>i.through>i.from)):sessions;
  return {quotes,sessions:covered,candles,limited};
}
