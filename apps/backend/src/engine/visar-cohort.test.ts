import{expect,test}from'bun:test';
import{readFileSync}from'node:fs';
import{loadAgents}from'./loader';
import{loadRoster,planRuns,rosterProblems}from'./roster';
import{silentDaysFor}from'./policy';
import{assess,VERDICT}from'@trader/shared';
import type{LeaderboardRow}from'@trader/shared/types';
test('twenty Visar experiments retain the original and one frozen instrument/tier per variant',async()=>{
 const {agents,errors}=await loadAgents();expect(errors).toEqual([]);const roster=loadRoster();expect(rosterProblems(roster,agents)).toEqual([]);
 const plans=planRuns(agents,roster).runs.filter(p=>p.agent.id.startsWith('visar-night-'));
 expect(plans).toHaveLength(20);expect(plans.filter(p=>p.epic==='US500')).toHaveLength(10);expect(plans.filter(p=>p.epic==='US100')).toHaveLength(10);
 expect(agents.find(a=>a.id==='visar-night-trading')?.codeHash).toBe('56ac3bdfe7c1');
 for(const p of plans){expect(Number(p.agent.params.lossPct)).toBeGreaterThan(0);expect(Number(p.agent.params.lossPct)).toBeLessThanOrEqual(50);expect(roster.demoAdmissions?.[`${p.agent.id}:${p.epic}@${p.leverage}`]?.codeHash).toBe(p.agent.codeHash)}
 const root=import.meta.dir+'/../../agents/';const original=readFileSync(root+'visar-night-trading.ts','utf8');
 expect(readFileSync(root+'_retired/visar-night-lab-20261109/reference.ts','utf8').replace("from '../../src/sdk'","from '../src/sdk'")).toBe(original);
 expect(readFileSync(root+'_retired/visar-night-us100-20261109/reference.ts','utf8').replace("from '../../src/sdk'","from '../src/sdk'").replace("instruments: ['US100']","instruments: ['US500']")).toBe(original);
 expect(Object.keys(roster.retired).filter(k=>k.startsWith('visar-night-'))).toHaveLength(19);
});
test('sparse experiments have enough observation time while errors and ordinary silence still retire',()=>{
 const now=Date.UTC(2027,2,1),row={agentId:'visar-night-lab/clean-50x',slug:'visar-night-lab',status:'active',startedAt:now-90*86400000,metrics:{trades:0,tStat:0}} as LeaderboardRow;
 expect(silentDaysFor(row.agentId)).toBe(365);expect(assess(row,new Map(),now).verdict).toBe(VERDICT.EARLY);
 expect(assess({...row,agentId:'other'},new Map(),now).verdict).toBe(VERDICT.RETIRE);
 expect(assess({...row,status:'error'},new Map(),now).verdict).toBe(VERDICT.RETIRE);
 expect(assess({...row,startedAt:now-366*86400000},new Map(),now).verdict).toBe(VERDICT.RETIRE);
 expect(silentDaysFor('visar-night-lab/body-20x')).toBe(180);
 expect(silentDaysFor('visar-night-v2-us100/largest-gap')).toBe(180);
 expect(silentDaysFor('visar-night-v2-us100/frequent-core')).toBe(60);
});
