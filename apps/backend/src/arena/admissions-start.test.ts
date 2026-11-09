import{expect,test,spyOn}from'bun:test';
import{mkdtempSync,writeFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{Arena}from'./arena';
import{ArenaDB}from'./db';
import{loadAgents}from'../engine/loader';
import{ENGINE_VERSION}from'../engine/version';
import{computeMetrics}from'../engine/metrics';
import{STANDARD_WINDOW,type BacktestResult}from'../lab/backtest-core';
import type{CapitalClient}from'../capital/client';
test('a backtest arriving during startup is reconsidered after warmup without another upload',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'trader-admission-start-')),db=new ArenaDB(':memory:');
 writeFileSync(join(dir,'fixture.ts'),`import{defineAgent}from${JSON.stringify(new URL('../sdk/index.ts',import.meta.url).pathname)};export default defineAgent({name:'Fixture',description:'fixture',instruments:['US500'],timeframe:'1m',leverage:[1],warmup:0,params:{},onBar(){}})`);
 const agent=(await loadAgents(dir)).agents[0]!;
 const arena=new Arena({db,dataClient:{}as CapitalClient,forecasterUrl:'',broker:null,agentsDir:dir,live:false});
 const refresh=spyOn(arena as any,'refreshMarkets').mockResolvedValue(undefined);
 const backfill=spyOn(arena as any,'backfill').mockImplementation(async()=>{
  expect(arena.ready).toBe(false);expect(arena.tracked.size).toBe(0);
  const metrics={...computeMetrics({trades:[],equity:[],initialCapital:10000,finalEquity:10001,startTime:STANDARD_WINDOW.start,endTime:STANDARD_WINDOW.end,maxDrawdown:0,exposure:0}),sharpe:1,trades:25};
  db.saveBacktest({agentId:agent.id,codeHash:agent.codeHash,engineVersion:ENGINE_VERSION,epic:'US500',leverage:1,windowId:STANDARD_WINDOW.id,windowStart:STANDARD_WINDOW.start,windowEnd:STANDARD_WINDOW.end,params:{},capital:10000,status:'completed',errors:0,metrics,trades:[],equity:[],logs:[],ranAt:Date.now(),durationMs:1,bars:1,candles:1,agentUsPerBar:0}as BacktestResult);
  arena.scheduleAdmissions(); // same callback as POST /api/backtests, before readiness
 });
 const real=arena.scheduleAdmissions;let queued=false;
 const schedule=spyOn(arena,'scheduleAdmissions').mockImplementation(function(this:Arena){
  if(!this.ready)return;
  // Permit just the queueing branch, then restore offline startup before sockets/timers.
  (this as any).liveMode=true;
  try{real.call(this);queued=(this as any).admissionTimer!==null}finally{(this as any).liveMode=false}
 });
 try{await arena.start();expect(arena.ready).toBe(true);expect(queued).toBe(true);expect(arena.tracked.size).toBe(0)}
 finally{arena.stop();schedule.mockRestore();refresh.mockRestore();backfill.mockRestore();db.db.close();rmSync(dir,{recursive:true,force:true})}
});
