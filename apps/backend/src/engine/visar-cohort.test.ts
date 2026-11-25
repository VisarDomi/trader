import{expect,test}from'bun:test';
import{readFileSync}from'node:fs';
import{loadAgents}from'./loader';
import{familyOf,loadRoster,planRuns,rosterProblems}from'./roster';
import{silentDaysFor}from'./policy';
import{assess,VERDICT}from'@trader/shared';
import type{LeaderboardRow}from'@trader/shared/types';
test('twenty Visar experiments retain the original and one frozen instrument/tier per variant',async()=>{
 const {agents,errors}=await loadAgents();expect(errors).toEqual([]);const roster=loadRoster();expect(rosterProblems(roster,agents)).toEqual([]);
 const plans=planRuns(agents,roster).runs.filter(p=>p.agent.id.startsWith('visar-night-'));
 expect(plans).toHaveLength(20);expect(plans.filter(p=>p.epic==='US500')).toHaveLength(10);expect(plans.filter(p=>p.epic==='US100')).toHaveLength(10);
 expect(agents.find(a=>a.id==='visar-night-trading')?.codeHash).toBe('6ef6caeeb489');
 for(const p of plans){expect(Number(p.agent.params.lossPct)).toBeGreaterThan(0);expect(Number(p.agent.params.lossPct)).toBeLessThanOrEqual(50);expect(roster.demoAdmissions?.[`${p.agent.id}:${p.epic}@${p.leverage}`]?.codeHash).toBe(p.agent.codeHash)}
 // The retired lab copies keep the rule as they ran it, on Tirana clocks; the running original follows New York's.
 const root=import.meta.dir+'/../../agents/';const lab=readFileSync(root+'_retired/visar-night-lab-20261109/reference.ts','utf8');
 expect(readFileSync(root+'_retired/visar-night-us100-20261109/reference.ts','utf8').replace("instruments: ['US100']","instruments: ['US500']")).toBe(lab);
 expect(lab).toContain('timeZone: TZ.TIRANA');expect(readFileSync(root+'visar-night-trading.ts','utf8')).toContain('timeZone: TZ.NEW_YORK');
 expect(Object.keys(roster.retired).filter(k=>k.startsWith('visar-night-'))).toHaveLength(52);
 expect(plans.filter(p=>p.agent.slug.startsWith('visar-night-v3-control-'))).toHaveLength(4);
 // Every night rule file, running or retired, is judged in one family; the direction controls are controls, not members.
 for(const p of plans)expect(familyOf(roster,p.agent.slug).id).toBe(p.agent.slug.includes('-control-')?p.agent.slug:'visar-night');
 for(const slug of ['visar-night-lab','visar-night-us100','visar-night-v2-us100','visar-night-v2-us500'])expect(familyOf(roster,slug)).toEqual({id:'visar-night',name:'Visar night'});
 expect(agents.filter(a=>familyOf(roster,a.slug).id==='visar-night').every(a=>a.slug.startsWith('visar-night-')&&!a.slug.includes('-control-'))).toBe(true);
});
test('sparse experiments have enough observation time while errors and ordinary silence still retire',()=>{
 const now=Date.UTC(2027,2,1),row={agentId:'visar-night-lab/clean-50x',slug:'visar-night-lab',status:'active',startedAt:now-90*86400000,metrics:{trades:0,tStat:0}} as LeaderboardRow;
 expect(silentDaysFor(row.agentId)).toBe(365);expect(assess(row,now).verdict).toBe(VERDICT.EARLY);
 expect(assess({...row,agentId:'other'},now).verdict).toBe(VERDICT.RETIRE);
 expect(assess({...row,status:'error'},now).verdict).toBe(VERDICT.RETIRE);
 expect(assess({...row,startedAt:now-366*86400000},now).verdict).toBe(VERDICT.RETIRE);
 expect(silentDaysFor('visar-night-lab/body-20x')).toBe(180);
 expect(silentDaysFor('visar-night-v2-us100/largest-gap')).toBe(180);
 expect(silentDaysFor('visar-night-v2-us100/frequent-core')).toBe(60);
 expect(silentDaysFor('visar-night-v3-us500/strong-day')).toBe(180);expect(silentDaysFor('visar-night-v3-us500/base')).toBe(60);
});
