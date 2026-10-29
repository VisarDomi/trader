/** Reconstruct quote-supported costs from the sole compressed archive; never rewrite fills/P&L. */
import { sql } from '../data/db.ts';
import { unpackTicks } from '../data/tick-codec.ts';
import type { RecordedTick } from '../engine/ticks.ts';
import type { CostCandidate } from '../arena/db.ts';
import type { FillQuoteEvidence } from '@trader/shared/types';
import { fillQuote } from '../engine/costs.ts';
import { getInstrument } from '../engine/instruments.ts';
import { COST_INGEST_BATCH } from '../arena/cost-ingest.ts';

const MATCH_AGE_MS = 250;
interface Candidate extends CostCandidate {fingerprint:string}
interface Block {journal_id:string;first_id:string|number;instrument:string;start_at:string|number;end_at:string|number}
interface Endpoint {key:string;epic:string;time:number;candidate:Candidate;entry:boolean}
interface Reference {tick:RecordedTick;journalId:string}
const endpointKey=(c:Candidate,entry:boolean)=>`${c.run_id}:${c.idx}:${entry?'entry':'exit'}`;
export function matchCostQuote(c:CostCandidate,entry:boolean,tick:RecordedTick,journalId:string):FillQuoteEvidence|undefined {
  const at=entry?c.entry_time:c.exit_time;
  if(tick.epic!==c.epic||tick.receivedAt>at||at-tick.receivedAt>MATCH_AGE_MS||tick.time>tick.receivedAt+1000||tick.receivedAt-tick.time>30_000)return;
  return fillQuote({bid:tick.bid,ask:tick.ask,time:tick.time,receivedAt:tick.receivedAt,source:'recorded',sequence:tick.id,journalId},
    c.side,entry,entry?c.entry_price:c.exit_price,getInstrument(c.epic).pricePrecision,undefined,at);
}
async function request(path:string,body?:unknown) {
  const token=process.env.ARENA_TOKEN;if(!token)throw new Error('ARENA_TOKEN required for cost evidence');
  const r=await fetch((process.env.ARENA_URL??'http://127.0.0.1:4120')+path,{method:body===undefined?'GET':'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
  if(!r.ok)throw new Error(`cost evidence HTTP ${r.status}`);return r.json();
}
export async function auditCosts(limit=5000,backfill=false) {
  const [bounds]=await sql`SELECT MIN(start_at) first FROM tick_chunks`;
  if(bounds.first==null)return {candidates:0,matched:0,attached:0,note:'No recorded ticks available.'};
  const candidates=await request(`/api/evidence/cost-candidates?from=${Number(bounds.first)}&limit=${limit}`)as Candidate[];
  if(!candidates.length)return {candidates:0,matched:0,attached:0};
  const endpoints:Endpoint[]=candidates.flatMap(c=>[true,false].map(entry=>({key:endpointKey(c,entry),epic:c.epic,time:entry?c.entry_time:c.exit_time,candidate:c,entry})));
  const byEpic=Map.groupBy(endpoints,e=>e.epic);for(const es of byEpic.values())es.sort((a,b)=>a.time-b.time);
  const from=Math.min(...endpoints.map(e=>e.time))-MATCH_AGE_MS,through=Math.max(...endpoints.map(e=>e.time));
  const metadata=await sql`SELECT journal_id,first_id,instrument,start_at,end_at FROM tick_chunks WHERE end_at>=${from} AND start_at<=${through} ORDER BY instrument,start_at`as Block[];
  const best=new Map<string,Reference>();let decoded=0;
  for(const block of metadata) {
    const es=byEpic.get(block.instrument);if(!es)continue;
    const start=Number(block.start_at),end=Number(block.end_at)+MATCH_AGE_MS;
    let lo=0,hi=es.length;while(lo<hi){const m=(lo+hi)>>>1;if(es[m]!.time<start)lo=m+1;else hi=m;}
    const relevant:Endpoint[]=[];for(let i=lo;i<es.length&&es[i]!.time<=end;i++)relevant.push(es[i]!);
    if(!relevant.length)continue;
    const [row]=await sql`SELECT payload,sha256 FROM tick_chunks WHERE journal_id=${block.journal_id} AND first_id=${block.first_id}`;
    const tape=unpackTicks(row.payload,row.sha256).sort((a,b)=>a.receivedAt-b.receivedAt||a.id-b.id);decoded++;
    // Raw delivery timestamps can be equal or move backwards; choose the latest preceding
    // delivered quote, never search backwards for a price that happens to fit a trade.
    let index=0;
    for(const e of relevant) {
      while(index<tape.length&&tape[index]!.receivedAt<=e.time)index++;
      const q=tape[index-1];if(!q||e.time-q.receivedAt>MATCH_AGE_MS)continue;
      const old=best.get(e.key)?.tick;
      if(!old||q.receivedAt>old.receivedAt||(q.receivedAt===old.receivedAt&&q.id>old.id))best.set(e.key,{tick:q,journalId:block.journal_id});
    }
  }
  const payload=[];
  for(const c of candidates) {
    const a=best.get(endpointKey(c,true)),b=best.get(endpointKey(c,false));if(!a||!b)continue;
    const entry=matchCostQuote(c,true,a.tick,a.journalId),exit=matchCostQuote(c,false,b.tick,b.journalId);
    if(entry&&exit)payload.push({runId:c.run_id,idx:c.idx,fingerprint:c.fingerprint,entry,exit});
  }
  let attached=0;
  if(backfill)for(let i=0;i<payload.length;i+=COST_INGEST_BATCH)attached+=(await request('/api/evidence/costs',payload.slice(i,i+COST_INGEST_BATCH))as{attached:number}).attached;
  return {candidates:candidates.length,matched:payload.length,unmatched:candidates.length-payload.length,decodedBlocks:decoded,attached,
    maxQuoteAgeMs:MATCH_AGE_MS,backfill,note:'Archived quote-side prices match stored fills; the exact historical quote identity and decision timing remain inferred/unknown. No fills, P&L, strategy source or tick history changed.'};
}
if(import.meta.main) {
  const at=process.argv.indexOf('--limit'),limit=at<0?5000:Number(process.argv[at+1]);
  if(!Number.isInteger(limit)||limit<1||limit>5000)throw new Error('--limit must be 1..5000');
  try{console.log(JSON.stringify(await auditCosts(limit,process.argv.includes('--backfill')),null,2));}finally{await sql.close();}
}
