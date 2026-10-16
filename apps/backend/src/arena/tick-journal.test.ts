import {expect,test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TickJournal} from './tick-journal.ts';
import {DAY_MS} from '../engine/clock.ts';
const EPIC='US500',T=Date.UTC(2026,9,16);
test('journal preserves repeated quotes, arrival order and timestamps; only acknowledged ticks expire',()=>{
 const j=new TickJournal(':memory:');j.connected([EPIC],T);
 const q={epic:EPIC,time:T,receivedAt:T+10,bid:100,ask:101};
 j.record(q);j.record(q);j.record({...q,time:T-1,receivedAt:T+20});
 expect(j.export(0,2).ticks.map(t=>t.id)).toEqual([1,2]);
 expect(j.export(2).ticks[0]!.time).toBe(T-1);
 expect(j.export(0).sessions[0]!.endedAt).toBeNull();
 j.maintain(T+4*DAY_MS);expect(j.export(0).ticks).toHaveLength(3);
 expect(()=>j.acknowledge('wrong',3)).toThrow();expect(()=>j.acknowledge(j.journalId,4)).toThrow();
 j.acknowledge(j.journalId,2);j.maintain(T+5*DAY_MS);
 expect(j.export(0).ticks.map(t=>t.id)).toEqual([3]);j.close();
});
test('restart preserves journal identity and sequence and marks interrupted coverage',()=>{
 const dir=mkdtempSync(join(tmpdir(),'trader-ticks-')),path=join(dir,'ticks.db');
 try{
  const j=new TickJournal(path),id=j.journalId;j.connected([EPIC],T);
  j.record({epic:EPIC,time:T,receivedAt:T+5,bid:100,ask:101});j.close();
  const n=new TickJournal(path);expect(n.journalId).toBe(id);expect(n.export(0).ticks).toHaveLength(1);
  n.connected([EPIC],T+60_000);expect(n.record({epic:EPIC,time:T+60_000,receivedAt:T+60_010,bid:102,ask:103})).toBe(2);
  n.flush();n.db.close();
  const r=new TickJournal(path);expect(r.export(0).sessions[1]).toMatchObject({endedAt:T+60_010,reason:'process interrupted'});r.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
