import type { FillQuoteEvidence } from '@trader/shared/types';
import type { ArenaDB, CostCandidate } from './db.ts';
import { executionCosts } from '../engine/costs.ts';
import { getInstrument } from '../engine/instruments.ts';

export const MAX_COST_QUOTE_AGE_MS = 1000;
export const COST_INGEST_BATCH = 500;
export function costFingerprint(t: CostCandidate): string {
  return new Bun.CryptoHasher('sha256').update(JSON.stringify([t.run_id,t.idx,t.side,t.size,t.entry_time,t.exit_time,t.entry_price,t.exit_price,t.pnl,t.funding])).digest('hex');
}
interface Ingest { runId:string;idx:number;fingerprint:string;entry:FillQuoteEvidence;exit:FillQuoteEvidence }
function quote(value:FillQuoteEvidence,trade:CostCandidate,entry:boolean):FillQuoteEvidence {
  if(!value||value.source!=='recorded'||![value.mid,value.spread,value.ageMs].every(Number.isFinite)||value.mid<=0||value.spread<0||value.mid-value.spread/2<=0||
    value.ageMs!<0||value.ageMs!>MAX_COST_QUOTE_AGE_MS||!Number.isSafeInteger(value.sequence)||value.sequence!<1||typeof value.journalId!=='string'||value.journalId.length>80)
    throw new Error('invalid archived fill reference');
  const precision=getInstrument(trade.epic).pricePrecision,scale=10**precision;
  const price=value.mid+(((trade.side==='long')===entry)?1:-1)*value.spread/2;
  const expected=entry?price:Math.round(price*scale)/scale;
  if(Math.abs(expected-(entry?trade.entry_price:trade.exit_price))>1/scale*1e-6)throw new Error('archived quote does not match the stored fill');
  // Old decision prices cannot be inferred from fill quotes.
  return {mid:value.mid,spread:value.spread,source:'recorded',ageMs:value.ageMs,journalId:value.journalId,sequence:value.sequence};
}
export function ingestCosts(db:ArenaDB,body:unknown) {
  if(!Array.isArray(body)||body.length>COST_INGEST_BATCH)throw new Error('invalid cost batch');
  let attached=0,existing=0;
  db.tx(()=>{
    for(const input of body as Ingest[]) {
      if(typeof input.runId!=='string'||!input.runId.startsWith('demo:')||input.runId.includes(':delay=')||!Number.isSafeInteger(input.idx)||input.idx<0)
        throw new Error('invalid cost record');
      const row=db.tradeRow(input.runId,input.idx);
      if(!row||input.fingerprint!==costFingerprint(row))throw new Error('cost record changed; refresh its fingerprint');
      if(row.execution){existing++;continue;}
      const entry=quote(input.entry,row,true),exit=quote(input.exit,row,false);
      const evidence=executionCosts({side:row.side,size:row.size,pnl:row.pnl,funding:row.funding},entry,exit,'archived-quote-match');
      if(db.attachExecution(input.runId,input.idx,evidence))attached++;
    }
  });
  return {attached,existing};
}
