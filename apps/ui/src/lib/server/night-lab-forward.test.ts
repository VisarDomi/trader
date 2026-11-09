import{test,expect}from'bun:test';
import type{LeaderboardRow}from'@trader/shared';
import cohort from'./night-lab-cohort.json';
import{nightLabForward}from'./night-lab-forward';
test('Capital cash uses actual demo evidence and frozen run identity, including archived cohort history',async()=>{
 const row=(c:typeof cohort[number],actual:boolean)=>({agentId:c.id,codeHash:c.codeHash,epic:c.epic,leverage:c.leverage,status:'retired',startedAt:1,mirrored:false,metrics:{totalReturn:actual ? 0.12 : 0.8,trades:actual ? 2 : 7}}as unknown as LeaderboardRow);
 const stages:string[]=[];
 const result=await nightLabForward({leaderboard:async(_kind,retired,stage)=>{expect(retired).toBe(true);stages.push(stage??'');return [...cohort.map(c=>row(c,stage==='demo')),{...row(cohort[0]!,false),leverage:999}]}});
 expect(stages).toEqual(['','demo']);expect(result.rows).toHaveLength(20);
 expect(result.rows[0]!.totalReturn).toBe(.8);expect(result.rows[0]!.capitalReturn).toBe(.12);expect(result.rows[0]!.capitalTrades).toBe(2);expect(result.rows[0]!.status).toBe('retired');expect(result.schema).toBe(2);
});
