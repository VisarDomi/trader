import{createHash}from'node:crypto';
import{join}from'node:path';
import{loadAgents,type LoadedAgent}from'../../engine/loader';
import{getInstrument}from'../../engine/instruments';
import{MarketEngine}from'../../engine/market';
import{VirtualVenue,DEFAULT_EXECUTION_MS,type CapitalMarket}from'../../engine/venue';
import snapshot from'../../engine/fixtures/capital-markets.json';
import{ENGINE_VERSION}from'../../engine/version';
import{tickMinutes,replayData}from'../tick-tape';
import{replayWindow}from'../replay-coverage';
import{STANDARD_WINDOW,type BacktestResult}from'../backtest-core';
import type{AgentContext,Side}from'../../sdk';

export const GAPS=[0,5,15,30]as const;
export interface Signal{decision:number;session:string;bid:number;reference:number;side:Side}
export function counterMoveBp(side:Side,bid:number,reference:number):number{return Number.isFinite(bid)&&Number.isFinite(reference)&&reference>0?(side==='long'?reference-bid:bid-reference)/reference*10000:NaN}
export function qualifiesGap(side:Side,bid:number,reference:number,minimum:number):boolean{const gap=counterMoveBp(side,bid,reference);return Number.isFinite(gap)&&Number.isFinite(minimum)&&minimum>=0&&gap>0&&gap>=minimum}
export function cachedSignalDefinition(base:LoadedAgent,signals:ReadonlyMap<number,Signal>,minimum:number,epic:string){
 return {...base.def,instruments:[epic],onBar(ctx:AgentContext<any,any>){
  const signal=signals.get(ctx.time);if(!signal||!qualifiesGap(signal.side,signal.bid,signal.reference,minimum))return;
  if(Math.abs(ctx.bar.close-signal.bid)>1e-7)throw Error('Oracle signal bid differs from replay close');
  Object.assign(ctx.state,{referenceDate:signal.session,reference:signal.reference,direction:signal.side==='long'?1:-1});
  base.def.onBar!(ctx); // frozen original order, latency, stop and fill behavior
 }};
}
const ROOT=join(import.meta.dir,'../../..'),OUT=join(ROOT,'data/night-session-study-20261109'),OLD=join(ROOT,'data/night-breakdown-20261109');
async function main(){
 const epic=Bun.argv[2]!,window=Bun.argv[3]!;
 if(!['US500','US100'].includes(epic)||!['full','central'].includes(window))throw Error('Use gap-replay.ts US500|US100 full|central');
 const base=(await loadAgents()).agents.find(a=>a.id==='visar-night-trading')!;if(base.codeHash!=='56ac3bdfe7c1')throw Error('Frozen source changed');
 const oracle=await Bun.file(join(OUT,`${epic}-signals.json`)).json(),spec=await Bun.file(join(OUT,`${epic}-spec.json`)).json();
 const study={...spec,windowId:window,minimumGapBp:GAPS,signalInputSHA:oracle.inputSHA,notes:[...spec.notes,'Minimum positive bid counter-moves: 0,5,15,30bp. Zero means the original strict opposite-side signal, not equality.','Only idle-period quotes are thinned to each minute’s last generated quote; all candidate UTC days, all open positions and the first minute retain the complete tick path.','All 1296 zero-gap control trades and financial metrics must exactly match full strategy replay before a gap result is accepted. Financial fills/stops/sizing still run in the market engine; returns are never filtered/compounded from an old ledger.']};
 await Bun.write(join(OUT,`${epic}-${window}-gap-spec.json`),JSON.stringify(study,null,2));
 for(const policy of spec.policies){
  const signalRows:Signal[]=oracle.opportunities[window][policy.id],signals=new Map(signalRows.map(s=>[s.decision,s]));
  const candidateDays=new Set(signalRows.map(s=>Math.floor(s.decision/86400000)));
  const jobs=GAPS.flatMap(gap=>spec.profiles.map((profile:any)=>({gap,profile})));
  let clock=STANDARD_WINDOW.start;const inst={...getInstrument(epic)},venue=new VirtualVenue(inst),rules=(snapshot.markets as any)[epic]as CapitalMarket;
  venue.update({...rules,snapshot:{...rules.snapshot,marketStatus:'TRADEABLE'}},clock);const engine=new MarketEngine(inst);
  const agents=jobs.map(({gap,profile})=>{const params={...base.params,...policy.params,lossPct:profile.lossPct,marginPct:90,minPullbackBp:gap};return {...base,id:`night-gap/${epic}/${window}/${policy.id}/B${gap}/${profile.id}`,def:cachedSignalDefinition(base,signals,gap,epic),params,codeHash:createHash('sha256').update(base.codeHash+oracle.inputSHA+window+JSON.stringify(params)).digest('hex').slice(0,12)}as LoadedAgent});
  const runs=agents.map((agent,i)=>engine.addRun({runId:agent.id,agent,leverage:jobs[i]!.profile.leverage,capital:10000,checkStopsOnCandles:false,execution:{venue,latencyMs:DEFAULT_EXECUTION_MS,now:()=>clock}}));
  const options={mode:'synthetic'as const,recordings:[],seed:1,ticksPerMinute:16},data=replayData(options);let first=true,delivered=0,minutes=0;const begun=Date.now();
  console.log('START',epic,window,policy.id,jobs.length);
  for await(const minute of tickMinutes(epic,STANDARD_WINDOW.start,STANDARD_WINDOW.end,options,data)){
   clock=minute.time;venue.updatedAt=clock;engine.processClock(clock);
   const complete=first||candidateDays.has(Math.floor(minute.time/86400000))||runs.some(r=>r.position!==null);first=false;
   const quotes=complete?minute.ticks:[minute.ticks.at(-1)!];
   for(const q of quotes){clock=q.receivedAt;engine.processTick(q);delivered++}
   clock=minute.time+60000;engine.processClock(clock);engine.takeCompletedCandles();minutes++;
  }
  for(const run of runs)run.finish(clock);
  data.window=replayWindow(STANDARD_WINDOW.start,STANDARD_WINDOW.end,data.firstTickAt,data.lastTickAt);
  const results=runs.map((run,i)=>({agentId:agents[i]!.id,codeHash:agents[i]!.codeHash,engineVersion:ENGINE_VERSION,epic,leverage:run.leverage,windowId:STANDARD_WINDOW.id,windowStart:STANDARD_WINDOW.start,windowEnd:STANDARD_WINDOW.end,params:agents[i]!.params,capital:10000,status:run.status,errors:run.errors,metrics:run.metrics(),trades:run.trades,equity:run.equity,logs:run.logs.slice(-100),agentUsPerBar:0,bars:run.barsSeen,candles:minutes,ranAt:Date.now(),durationMs:Date.now()-begun,data,ticks:delivered}as BacktestResult));
  const old=await Bun.file(window==='central'?join(OUT,`${epic}-${policy.id}.json`):join(OLD,`${epic==='US100'?'us100-':''}grid-${policy.id}.json`)).json();
  for(let i=0;i<spec.profiles.length;i++){
   const r=results[i]!,control=old.runs[i];
   if(JSON.stringify(r.trades)!==JSON.stringify(control.trades)||JSON.stringify(r.metrics)!==JSON.stringify(control.metrics))throw Error(`Idle-thinning control differs ${epic}/${window}/${policy.id}/${spec.profiles[i].id}`);
  }
  if(results.some(r=>r.errors))throw Error('Gap replay callback error');
  await Bun.write(join(OUT,`${epic}-${window}-${policy.id}-gaps.json`),JSON.stringify({policy,profiles:jobs.map(j=>({...j.profile,minimumGapBp:j.gap})),runs:results,audit:{deliveredTicks:delivered,generatedTicks:data.syntheticTicks,zeroGapControls:spec.profiles.length,allControlsExact:true}}));
  console.log('DONE',epic,window,policy.id,Date.now()-begun,'ms',delivered,'delivered quotes');
 }
}
if(import.meta.main)await main();
