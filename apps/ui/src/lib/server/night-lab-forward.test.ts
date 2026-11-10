import{test,expect}from'bun:test';
import type{LeaderboardRow}from'@trader/shared';
import cohort from'./night-lab-cohort.json';
import{nightLabForward,sharedForward}from'./night-lab-forward';
test('Capital cash uses actual demo evidence and frozen run identity, including archived cohort history',async()=>{
 const row=(c:typeof cohort[number],actual:boolean)=>({agentId:c.id,codeHash:c.codeHash,epic:c.epic,leverage:c.leverage,status:'retired',startedAt:1,mirrored:false,metrics:{totalReturn:actual ? 0.12 : 0.8,trades:actual ? 2 : 7}}as unknown as LeaderboardRow);
 const stages:string[]=[];
 const result=await nightLabForward({leaderboard:async(_kind,retired,stage,_scenario,agents)=>{expect(retired).toBe(true);expect([...agents!].sort()).toEqual(cohort.map(c=>c.id).sort());stages.push(stage??'');return [...cohort.map(c=>row(c,stage==='demo')),{...row(cohort[0]!,false),leverage:999}]}});
 expect(stages).toEqual(['','demo']);expect(result.rows[0]!.codeHash).toBe(cohort[0]!.codeHash);expect(result.rows).toHaveLength(20);
 expect(result.rows[0]!.totalReturn).toBe(.8);expect(result.rows[0]!.capitalReturn).toBe(.12);expect(result.rows[0]!.capitalTrades).toBe(2);expect(result.rows[0]!.status).toBe('retired');expect(result.schema).toBe(3);
});
test('one arena read serves every open Night Lab until it is stale; failures are not kept',async()=>{
 let t=0,calls=0,fail=false;
 const get=sharedForward(async()=>{calls++;if(fail)throw Error('arena down');return {schema:3,at:t,rows:[]}},20_000,()=>t);
 const [a,b]=await Promise.all([get(),get()]);expect(calls).toBe(1);expect(a).toBe(b);
 t=19_999;await get();expect(calls).toBe(1);
 t=20_000;fail=true;await expect(get()).rejects.toThrow('arena down');expect(calls).toBe(2);
 fail=false;expect((await get()).at).toBe(20_000);expect(calls).toBe(3);
});
