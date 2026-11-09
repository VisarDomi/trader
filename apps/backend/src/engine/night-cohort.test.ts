import {test,expect} from 'bun:test';
import {loadAgents} from './loader';
import {loadRoster,planRuns,rosterProblems} from './roster';
import {explain,supportedVersions,atLocal} from '../strategy/evidence';
import {reconstructedState} from '../strategy/history';
import {IndicatorCache,makeIndicators} from '../sdk/ta';
import type {Bar} from '../sdk/types';

test('v3: ten per index, each one base plus a single change, the original kept, every admission pinned',async()=>{
 const {agents,errors}=await loadAgents();expect(errors).toHaveLength(0);
 const cohort=agents.filter(a=>a.slug.startsWith('visar-night-v3-'));
 const controls=cohort.filter(a=>a.slug.startsWith('visar-night-v3-control-'));
 expect(cohort).toHaveLength(19);expect(controls).toHaveLength(4);expect(agents.find(a=>a.id==='visar-night-trading')?.codeHash).toBe('56ac3bdfe7c1');
 expect(agents.some(a=>a.slug.startsWith('visar-night-v2-')||a.slug==='visar-night-lab'||a.slug==='visar-night-us100')).toBe(false);
 const roster=loadRoster();expect(rosterProblems(roster,agents)).toEqual([]);
 const runs=planRuns(cohort,roster).runs;expect(runs).toHaveLength(19);
 for(const r of runs){expect(roster.demoAdmissions?.[`${r.agent.id}:${r.epic}@${r.leverage}`]?.codeHash).toBe(r.agent.codeHash)}
 const by=new Map(runs.map(r=>[r.agent.id,r]));
 // One base per index; every other variant changes exactly one setting (leverage counts as a setting).
 const diff=(a:any,b:any)=>{const x={...a.agent.params,tier:a.leverage},y={...b.agent.params,tier:b.leverage};return Object.keys({...x,...y}).filter(k=>JSON.stringify(x[k])!==JSON.stringify(y[k]))};
 for(const epic of ['us500','us100']){
  const base=by.get(`visar-night-v3-${epic}/base`)!;expect(base.leverage).toBe(20);expect(base.agent.params.lossPct).toBe(50);expect(base.agent.params.profitPct).toBe(0);
  for(const r of runs.filter(r=>r.agent.slug===`visar-night-v3-${epic}`&&r.agent.variant!=='base'&&r.agent.variant!=='full-day-200'))expect(diff(r,base)).toHaveLength(1);
  for(const v of ['always-long','random-direction'])expect(diff(by.get(`visar-night-v3-control-${epic}/${v}`)!,base)).toEqual(['direction']);
 }
 // full-day-200 is leverage-200 with the full NY day: the original agent's settings on US100.
 expect(diff(by.get('visar-night-v3-us100/full-day-200')!,by.get('visar-night-v3-us100/leverage-200')!).sort()).toEqual(['sessionEnd','sessionStart']);
});
test('deployed entry callbacks enforce symmetric exact gap boundaries, clocks and one attempt',async()=>{
 const {agents}=await loadAgents(),a=agents.find(a=>a.id==='visar-night-v3-us100/gap-15bp')!;
 for(const [direction,bid,expected] of [[1,9985,'long'],[1,9986,null],[-1,10015,'short'],[-1,10014,null],[1,10000,null],[1,10015,null],[-1,9985,null]]as const){
  const time=Date.UTC(2024,0,9,2,27),orders:any[]=[];
  const ctx:any={state:{...a.def.init!(a.params),referenceDate:'2024-01-08',reference:10000,direction},params:a.params,time,
   bar:{time:time-60000,open:bid,high:bid,low:bid,close:bid,spread:1,volume:1},isWarmup:false,position:null,balance:10000,leverage:50,instrument:{typicalSpread:1,pricePrecision:1},buy:(o:any)=>orders.push({side:'long',...o}),sell:(o:any)=>orders.push({side:'short',...o})};
  a.def.onBar!(ctx);a.def.onBar!(ctx);expect(orders).toHaveLength(expected?1:0);
  if(expected){expect(orders[0].side).toBe(expected);expect(orders[0].validUntil).toBe(time+60000);expect(orders[0].closeAt).toBe(time+300*60000);expect(orders[0].reason).toContain('15bp')}
 }
});
test('native/web strategy evidence uses the central window and the agent-specific gap headroom',async()=>{
 const {agents}=await loadAgents(),a=agents.find(a=>a.id==='visar-night-v3-us100/gap-15bp')!,p=a.params as any;
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
