import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {loadAgents,type LoadedAgent} from '../../engine/loader';
import {getInstrument} from '../../engine/instruments';
import {MarketEngine} from '../../engine/market';
import {VirtualVenue,VirtualGateway,DEFAULT_EXECUTION_MS,type CapitalMarket} from '../../engine/venue';
import snapshot from '../../engine/fixtures/capital-markets.json';
import {ENGINE_VERSION} from '../../engine/version';
import {tickMinutes,replayData} from '../tick-tape';
import {replayWindow} from '../replay-coverage';
import {STANDARD_WINDOW,type BacktestResult} from '../backtest-core';
import {cachedSignalDefinition,GAPS,type Signal} from './gap-replay';
import reference from '../../../agents/visar-night-v2-us500/reference';
export const PROFITS=[0,20,50,100] as const;
const ROOT=join(import.meta.dir,'../../..'),OLD=join(ROOT,'data/night-session-study-20261109'),OUT=join(ROOT,'data/night-exit-study-20261109');
const financialTrades=(rows:unknown[])=>rows.map(t=>Object.fromEntries(Object.entries(t as object).filter(([k])=>k!=='entryReason')));

async function main(){
 const epic=Bun.argv[2]!,window=Bun.argv[3]!,only=Bun.argv[4];
 if(!['US500','US100'].includes(epic)||!['full','central'].includes(window))throw Error('Use exit-replay.ts US500|US100 full|central [policy]');
 const base=(await loadAgents()).agents.find(a=>a.id==='visar-night-trading')!;if(base.codeHash!=='56ac3bdfe7c1')throw Error('Original source changed');
 const source=readFileSync(join(ROOT,'agents/visar-night-v2-us500/reference.ts'),'utf8'),referenceHash=createHash('sha256').update(source).digest('hex');
 const oracle=await Bun.file(join(OLD,`${epic}-signals.json`)).json(),spec=await Bun.file(join(OLD,`${epic}-spec.json`)).json();
 mkdirSync(OUT,{recursive:true});
 await Bun.write(join(OUT,`${epic}-${window}-spec.json`),JSON.stringify({...spec,sessionWindow:window,minimumGapBp:GAPS,profitPct:PROFITS,referenceHash,signalInputSHA:oracle.inputSHA},null,2));
 for(const policy of spec.policies){
  if(only&&policy.id!==only)continue;
  const path=join(OUT,`${epic}-${window}-${policy.id}.json`);
  if(await Bun.file(path).exists()){
   try{const old=await Bun.file(path).json();if(old.referenceHash===referenceHash&&old.audit?.deadlineControls===216&&old.runs?.length===864&&old.profiles?.length===864){console.log('CACHED',epic,window,policy.id);continue}}
   catch{console.log('Incomplete derived result; replaying',epic,window,policy.id)}
  }
  const rows:Signal[]=oracle.opportunities[window][policy.id],signals=new Map(rows.map(s=>[s.decision,s]));
  const days=new Set(rows.map(s=>Math.floor(s.decision/86400000))),jobs=PROFITS.flatMap(profitPct=>GAPS.flatMap(minimumGapBp=>spec.profiles.map((p:any)=>({...p,profitPct,minimumGapBp}))));
  let clock=STANDARD_WINDOW.start;const inst={...getInstrument(epic)},venue=new VirtualVenue(inst),rules=(snapshot.markets as any)[epic] as CapitalMarket;
  venue.update({...rules,snapshot:{...rules.snapshot,marketStatus:'TRADEABLE'}},clock);const engine=new MarketEngine(inst);
  const defs:LoadedAgent['def'][]=jobs.map((p:any)=>cachedSignalDefinition({...base,def:reference},signals,p.minimumGapBp,epic));
  const barCallbacks=defs.map(d=>d.onBar),tickCallbacks=defs.map(d=>d.onTick);
  const agents=jobs.map((p:any,i:number)=>{const params={...reference.params,...policy.params,sessionStart:window==='central'?630:570,sessionEnd:window==='central'?930:960,lossPct:p.lossPct,marginPct:90,minPullbackBp:p.minimumGapBp,profitPct:p.profitPct};return {...base,id:`night-exit/${epic}/${window}/${policy.id}/B${p.minimumGapBp}/T${p.profitPct}/${p.id}`,def:defs[i]!,params,codeHash:createHash('sha256').update(referenceHash+oracle.inputSHA+JSON.stringify(params)).digest('hex').slice(0,12)} as LoadedAgent});
  const runs=agents.map((agent,i)=>engine.addRun({runId:agent.id,agent,leverage:jobs[i]!.leverage,capital:10000,checkStopsOnCandles:false,execution:{venue,latencyMs:DEFAULT_EXECUTION_MS,gateway:new VirtualGateway(),now:()=>clock}}));
  const options={mode:'synthetic' as const,recordings:[],seed:1,ticksPerMinute:16},data=replayData(options);let first=true,delivered=0,minutes=0;const began=Date.now();
  console.log('START',epic,window,policy.id,jobs.length);
  for await(const minute of tickMinutes(epic,STANDARD_WINDOW.start,STANDARD_WINDOW.end,options,data)){
   const decision=signals.has(minute.time)||signals.has(minute.time+60000);
   for(let i=0;i<runs.length;i++){
    // The cached callback is a proven no-op outside these signal minutes.
    // All bars, clocks, equity, funding, quotes and risk still pass through the engine.
    defs[i]!.onBar=decision?barCallbacks[i]:undefined;
    defs[i]!.onTick=decision||(jobs[i]!.profitPct>0&&runs[i]!.position?.takeProfit===null)?tickCallbacks[i]:undefined;
   }
   clock=minute.time;venue.updatedAt=clock;engine.processClock(clock);
   const complete=first||days.has(Math.floor(minute.time/86400000))||runs.some(r=>r.position!==null);first=false;
   for(const q of complete?minute.ticks:[minute.ticks.at(-1)!]){clock=q.receivedAt;engine.processTick(q);delivered++}
   clock=minute.time+60000;engine.processClock(clock);engine.takeCompletedCandles();minutes++;
  }
  for(const run of runs)run.finish(clock);
  data.window=replayWindow(STANDARD_WINDOW.start,STANDARD_WINDOW.end,data.firstTickAt,data.lastTickAt);
  const results=runs.map((run,i)=>({agentId:agents[i]!.id,codeHash:agents[i]!.codeHash,engineVersion:ENGINE_VERSION,epic,leverage:run.leverage,windowId:STANDARD_WINDOW.id,windowStart:STANDARD_WINDOW.start,windowEnd:STANDARD_WINDOW.end,params:agents[i]!.params,capital:10000,status:run.status,errors:run.errors,metrics:run.metrics(),trades:run.trades,equity:run.equity,logs:run.logs.slice(-100),agentUsPerBar:0,bars:run.barsSeen,candles:minutes,ranAt:Date.now(),durationMs:Date.now()-began,data,ticks:delivered} as BacktestResult));
  const controls=await Bun.file(join(OLD,`${epic}-${window}-${policy.id}-gaps.json`)).json();
  for(let i=0;i<216;i++)if(JSON.stringify(results[i]!.metrics)!==JSON.stringify(controls.runs[i].metrics)||JSON.stringify(financialTrades(results[i]!.trades))!==JSON.stringify(financialTrades(controls.runs[i].trades)))throw Error(`Deadline control differs ${epic}/${window}/${policy.id}/${i}`);
  if(results.some(r=>r.errors))throw Error('Profit replay callback error');
  await Bun.write(path+'.partial',JSON.stringify({policy,profiles:jobs,referenceHash,runs:results,audit:{deadlineControls:216,allDeadlineControlsExact:true,deliveredTicks:delivered}}));
  renameSync(path+'.partial',path);
  console.log('DONE',epic,window,policy.id,Date.now()-began,'ms;216 controls exact');
 }
}
if(import.meta.main)await main();
