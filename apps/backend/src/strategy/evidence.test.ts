import {test,expect} from 'bun:test';
import {explain,gate,atLocal,supportedVersions,beforeEntryState,type Inputs} from './evidence';
import {reconstructedState,strategyContext} from './history';
import {loadAgents} from '../engine/loader';
import {IndicatorCache,makeIndicators} from '../sdk/ta';
import {TIMEFRAME_MS,type Bar} from '../sdk/types';
import {ArenaDB} from '../arena/db';
import {MarketEngine} from '../engine/market';
import {getInstrument} from '../engine/instruments';
import {defineAgent} from '../sdk';
const p={timeZone:'Europe/Tirane',trendPct:.25,minEfficiency:.15,minDirectionalShare:.5,maxRetraceShare:.75,maxRangePct:2,minBodyShare:.6,minCoverage:.9,marginPct:90,lossPct:50};
function input(bars:Bar[],params:Record<string,unknown>=p):Inputs {const ta=makeIndicators(new IndicatorCache(bars));return {bars,bar:bars.at(-1)!,ta,tf:()=>({bars,ta}),params,state:{},time:bars.at(-1)!.time+60000,timeframe:'1m',leverage:200,equity:10000,position:null,forecast:null,tick:null};}
test('headroom preserves strict boundaries, signs and unknown thresholds',()=>{
 expect(gate('min',.25,'>=',.25).state).toBe('pass');expect(gate('strict',.25,'>',.25).state).toBe('fail');expect(gate('max',1.9,'<=',2).margin).toBeCloseTo(.1);
 expect(gate('missing',100,'>',NaN).state).toBe('unknown');expect(gate('missing',null,'>',0).margin).toBeNull();
});
test('night path classification and headroom use the prior NY cash session, not the night profit',()=>{
 const start=atLocal('2026-11-02','America/New_York',570),bars:Bar[]=[];
 for(let i=0;i<390;i++){const open=100+i*.002,close=open+.002;bars.push({time:start+i*60000,open,high:close+.0001,low:open-.0001,close,volume:1,spread:.01});}
 const ref=atLocal('2026-11-02',p.timeZone,1320);if(ref-60000!==bars.at(-1)!.time)bars.push({time:ref-60000,open:100.78,high:100.8,low:100.7,close:100.78,volume:1,spread:.01});
 const at=atLocal('2026-11-03',p.timeZone,207);bars.push({time:at-60000,open:100.6,high:100.6,low:100.5,close:100.5,volume:1,spread:.01});
 const c=input(bars);c.state=reconstructedState('visar-night-trading',bars,at,p);
 const x=explain('visar-night-trading',supportedVersions['visar-night-trading']!.hash,c,'long',{},'reconstructed');
 expect(x.panels[0]!.series[0]!.points).toHaveLength(27);expect(x.panels[0]!.through).toBe(start+390*60000);
 expect(x.gates.find(g=>g.label==='Directional move')?.value).toBeCloseTo(.78);expect(x.gates.find(g=>g.label.startsWith('Dip below'))?.margin).toBeCloseTo(.28);
 expect(x.gates.find(g=>g.label==='Entry clock')?.state).toBe('pass');expect(x.basis).toBe('reconstructed');
 expect(atLocal('2026-10-30','America/New_York',570)).toBe(Date.UTC(2026,9,30,13,30));expect(start).toBe(Date.UTC(2026,10,2,14,30));
});
test('all current variants have pinned adapters; explanations cannot mutate source inputs or request forecasts',async()=>{
 const {agents,errors}=await loadAgents();expect(errors).toHaveLength(0);
 for(const a of agents){expect(supportedVersions[a.slug]?.hash).toBe(a.codeHash);
  const bars=Array.from({length:650},(_,i)=>({time:Date.UTC(2024,0,1)+i*TIMEFRAME_MS[a.def.timeframe],open:100+i*.01,high:101+i*.01,low:99+i*.01,close:100+i*.01,volume:1,spread:.01}));
  const c={...input(bars,a.params),timeframe:a.def.timeframe,time:bars.at(-1)!.time+TIMEFRAME_MS[a.def.timeframe]};const before=JSON.stringify({state:c.state,bars:c.bars,params:c.params});
  const x=explain(a.id,a.codeHash,c,'long',{},'reconstructed');expect(x.basis).not.toBe('unavailable');expect(x.panels.length).toBeGreaterThan(0);expect(Buffer.byteLength(JSON.stringify(x))).toBeLessThan(24576);
  expect(JSON.stringify({state:c.state,bars:c.bars,params:c.params})).toBe(before);
  expect(explain(a.id,'old-version',c,'long').basis).toBe('unavailable');
 }
});
test('compressed decision frames link to fills, survive DB reopen and take priority over reconstruction',async()=>{
 const file='/tmp/trader-context-test-'+crypto.randomUUID()+'.db';const d=new ArenaDB(file),x=explain('visar-night-trading',supportedVersions['visar-night-trading']!.hash,input([{time:Date.UTC(2026,10,3),open:100,high:101,low:99,close:100,volume:1,spread:.1}]),'long');
 d.saveDecision('demo:fixture',1000,JSON.stringify(x));d.linkDecision('demo:fixture',1000,1200);d.db.close();const re=new ArenaDB(file);
 const result=await strategyContext(re.db,{agentId:x.agentId,codeHash:x.codeHash,runId:'demo:fixture',entryTime:1200} as any);expect(result).toEqual(JSON.parse(JSON.stringify(x)));re.db.close();
 const fs=await import('node:fs');for(const suffix of ['', '-wal','-shm'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix);
});
test('entry observation runs once, cannot mutate outcomes through a thrown error, and stays out of snapshots',()=>{
 const def=defineAgent({name:'observe',description:'fixture',instruments:['US500'],timeframe:'1m',warmup:0,params:{},onBar(c){if(!c.position)c.buy({size:1});}}),a={id:'observe',slug:'observe',variant:null,def,params:{},file:'',source:'',codeHash:'fixture'};
 const run=(observer?:()=>void)=>{const e=new MarketEngine(getInstrument('US500'));const r=e.addRun({runId:'same',agent:a,leverage:1,capital:10000,checkStopsOnCandles:true,onEntryDecision:observer});for(let i=0;i<3;i++)e.processCandle({time:Date.UTC(2026,10,3)+i*60000,open:100,high:101,low:99,close:100,volume:1,spread:.1});return r.snapshot();};
 let calls=0;const reference=run(),observed=run(()=>{calls++;throw Error('observer failed')});expect(calls).toBe(1);expect(observed).toEqual(reference);
});
test('forecast surprise uses the prior envelope saved before the agent overwrites its state',async()=>{
 const {agents}=await loadAgents(),a=agents.find(a=>a.slug==='timesfm-band')!,c=input([{time:Date.UTC(2026,10,3),open:99,high:100,low:98,close:99,volume:1,spread:.1}],a.params);
 const before=beforeEntryState(a.slug,{q10:100,q90:104});c.state={q10:95,q90:105};
 const ctx={...c,forecast:{horizon:8,mean:Array(8).fill(102),median:Array(8).fill(102),quantiles:[],quantile:(q:number)=>q<.5?95:105}};
 const x=explain(a.id,a.codeHash,ctx,'long',{},'recorded',before);
 expect(x.gates.find(g=>g.label==='Previous forecast surprise')).toMatchObject({value:99,limit:100,state:'pass'});
 const widths=Array.from({length:120},(_,i)=>i/1000),original=[...widths];expect(beforeEntryState('timesfm-vol-breakout',{widths}).typical).toBe(.06);expect(widths).toEqual(original);
});
test('IBS composite alternatives do not falsely fail a valid RSI/three-down setup',async()=>{
 const {agents}=await loadAgents(),a=agents.find(a=>a.id==='ibs-dip/composite')!;
 const b=Array.from({length:210},(_,i)=>({time:Date.UTC(2026,0,1)+i*86400000,open:100,high:110,low:90,close:100,volume:1,spread:.1}));b.at(-1)!.close=105;
 const c=input(b,a.params);c.state={high:110,low:90,closes:[110,109,108,105]};
 const x=explain(a.id,a.codeHash,c,'long');expect(x.gates.find(g=>g.label==='At least one dip condition')?.state).toBe('pass');expect(x.gates.some(g=>g.label==='Session IBS')).toBe(false);
});
