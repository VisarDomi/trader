import {test,expect} from 'bun:test';
import {loadAgents} from './loader';
import {loadRoster,planRuns,rosterProblems} from './roster';
import {explain,supportedVersions,atLocal} from '../strategy/evidence';
import {reconstructedState} from '../strategy/history';
import {IndicatorCache,makeIndicators} from '../sdk/ta';
import type {Bar} from '../sdk/types';

test('v2 keeps fifteen rule experiments plus four direction controls, retains the original, and pins every admission',async()=>{
 const {agents,errors}=await loadAgents();expect(errors).toHaveLength(0);
 const cohort=agents.filter(a=>a.slug.startsWith('visar-night-v2-'));
 const controls=cohort.filter(a=>a.slug.startsWith('visar-night-v2-control-'));
 // The four replaced rule variants still load (their records live on as retired); the roster retires them.
 expect(cohort).toHaveLength(23);expect(controls).toHaveLength(4);expect(agents.find(a=>a.id==='visar-night-trading')?.codeHash).toBe('56ac3bdfe7c1');
 expect(agents.some(a=>a.slug==='visar-night-lab'||a.slug==='visar-night-us100')).toBe(false);
 const roster=loadRoster();expect(rosterProblems(roster,agents)).toEqual([]);
 const runs=planRuns(cohort,roster).runs;expect(runs).toHaveLength(19);
 expect(runs.filter(r=>r.agent.slug.startsWith('visar-night-v2-control-'))).toHaveLength(4);
 expect(new Set(runs.map(r=>r.agent.params.minPullbackBp))).toEqual(new Set([0,5,15]));
 expect(new Set(runs.map(r=>r.agent.params.profitPct))).toEqual(new Set([0,20,50,100]));
 for(const r of runs){expect(roster.demoAdmissions?.[`${r.agent.id}:${r.epic}@${r.leverage}`]?.codeHash).toBe(r.agent.codeHash)}
 for(const k of ['visar-night-v2-us500/full-reversal:US500@100','visar-night-v2-us500/full-steps:US500@50','visar-night-v2-us100/largest-gap:US100@100','visar-night-v2-us100/full-steps:US100@3'])expect(roster.retired[k]?.reason).toContain('replacement');
});
test('direction controls trade exactly frequent-core nights, always long or by a coin',async()=>{
 const {agents}=await loadAgents(),by=new Map(agents.map(a=>[a.id,a]));
 for(const epic of ['us100','us500']){
  const partner=by.get(`visar-night-v2-${epic}/frequent-core`)!;
  for(const v of ['always-long','random-direction']){
   const c=by.get(`visar-night-v2-control-${epic}/${v}`)!;const {direction,...rest}=c.params as any;
   expect(rest).toEqual(partner.params);expect(direction).toBe(v==='always-long'?'long':'random');
  }
 }
 const run=(id:string,direction:number,bid:number,coin=0.9)=>{
  const a=by.get(id)!,time=Date.UTC(2024,0,9,2,27),orders:any[]=[];
  const ctx:any={state:{...a.def.init!(a.params),referenceDate:'2024-01-08',reference:10000,direction},params:a.params,time,random:()=>coin,
   bar:{time:time-60000,open:bid,high:bid,low:bid,close:bid,spread:1,volume:1},isWarmup:false,position:null,balance:10000,leverage:20,instrument:{typicalSpread:1,pricePrecision:1},buy:(o:any)=>orders.push({side:'long',...o}),sell:(o:any)=>orders.push({side:'short',...o})};
  a.def.onBar!(ctx);return orders;
 };
 // A bearish day with an overnight bounce: the rule sells; always-long buys; the coin decides.
 expect(run('visar-night-v2-us100/frequent-core',-1,10010)[0].side).toBe('short');
 expect(run('visar-night-v2-control-us100/always-long',-1,10010)[0].side).toBe('long');
 expect(run('visar-night-v2-control-us100/random-direction',-1,10010,0.2)[0].side).toBe('long');
 expect(run('visar-night-v2-control-us100/random-direction',-1,10010,0.7)[0].side).toBe('short');
 expect(run('visar-night-v2-control-us500/always-long',-1,10010)[0].reason).toContain('rule would sell');
 // Not an eligible night for the rule (bearish day, 03:27 below 22:00): no control trades either.
 for(const id of ['visar-night-v2-control-us100/always-long','visar-night-v2-control-us100/random-direction'])expect(run(id,-1,9990)).toHaveLength(0);
});
test('deployed entry callbacks enforce symmetric exact gap boundaries, clocks and one attempt',async()=>{
 const {agents}=await loadAgents(),a=agents.find(a=>a.id==='visar-night-v2-us100/large-gap')!;
 for(const [direction,bid,expected] of [[1,9985,'long'],[1,9986,null],[-1,10015,'short'],[-1,10014,null],[1,10000,null],[1,10015,null],[-1,9985,null]]as const){
  const time=Date.UTC(2024,0,9,2,27),orders:any[]=[];
  const ctx:any={state:{...a.def.init!(a.params),referenceDate:'2024-01-08',reference:10000,direction},params:a.params,time,
   bar:{time:time-60000,open:bid,high:bid,low:bid,close:bid,spread:1,volume:1},isWarmup:false,position:null,balance:10000,leverage:50,instrument:{typicalSpread:1,pricePrecision:1},buy:(o:any)=>orders.push({side:'long',...o}),sell:(o:any)=>orders.push({side:'short',...o})};
  a.def.onBar!(ctx);a.def.onBar!(ctx);expect(orders).toHaveLength(expected?1:0);
  if(expected){expect(orders[0].side).toBe(expected);expect(orders[0].validUntil).toBe(time+60000);expect(orders[0].closeAt).toBe(time+300*60000);expect(orders[0].reason).toContain('15bp')}
 }
});
test('native/web strategy evidence uses the central window and the agent-specific gap headroom',async()=>{
 const {agents}=await loadAgents(),a=agents.find(a=>a.id==='visar-night-v2-us100/large-gap')!,p=a.params as any;
 const start=atLocal('2026-11-02','America/New_York',570),bars:Bar[]=[];
 for(let i=0;i<390;i++){const open=100+i*.002,close=open+.002;bars.push({time:start+i*60000,open,high:i<60||i>=360?150:close+.0001,low:i<60||i>=360?50:open-.0001,close,volume:1,spread:.01})}
 const ref=atLocal('2026-11-02',p.timeZone,1320);bars.push({time:ref-60000,open:100.78,high:100.8,low:100.7,close:100.78,volume:1,spread:.01});
 const time=atLocal('2026-11-03',p.timeZone,207);bars.push({time:time-60000,open:100.6,high:100.6,low:100.5,close:100.5,volume:1,spread:.01});
 const state=reconstructedState(a.slug,bars,time,p),ta=makeIndicators(new IndicatorCache(bars));
 const x=explain(a.id,supportedVersions[a.slug]!.hash,{bars,bar:bars.at(-1)!,ta,tf:()=>({bars,ta}),params:p,state,time,timeframe:'1m',leverage:50,equity:10000,position:null,forecast:null,tick:null},'long',{},'reconstructed');
 expect(x.panels[0]!.series[0]!.points).toHaveLength(21);expect(x.panels[0]!.from).toBe(start+60*60000);expect(x.panels[0]!.through).toBe(start+360*60000);
 expect(x.gates.find(g=>g.label==='Observed minutes')?.value).toBe(300);
 expect(x.gates.find(g=>g.label==='Minimum opposite-side bid gap')).toMatchObject({limit:15,op:'>=',state:'pass'});
 expect(x.panels[1]!.guides.some(g=>g.label==='15bp entry boundary')).toBe(true);
});
