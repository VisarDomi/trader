import { expect,test } from 'bun:test';
import { ArenaDB,RUN_KIND } from './db.ts';
import { AgentEvidenceService } from './evidence.ts';
import { ingestCosts,costFingerprint } from './cost-ingest.ts';
import { ForecastAvailability } from './dependency.ts';
import { defineAgent,EXIT_REASON } from '../sdk/index.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { Arena } from './arena.ts';
import type { Trade } from '../sdk/types.ts';
import { mkdtempSync,writeFileSync,unlinkSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assess,VERDICT,type LeaderboardRow } from '@trader/shared';
import { matchCostQuote } from '../lab/audit-costs.ts';
const EPIC='US500',HOUR=3600000,DAY=24*HOUR,T=Date.UTC(2026,9,29,10),RUN='demo:fixture:US500:x1:hash',BASE='demo:buy-hold:US500:x1:hash';
function agent(id:string):LoadedAgent {
  return {id,slug:id,variant:null,file:'',source:'',codeHash:'hash',params:{},def:defineAgent({name:id,description:id,instruments:[EPIC],timeframe:'1h',params:{},onBar(){}})};
}
function add(db:ArenaDB,id:string,name:string,now:number){db.upsertAgent(agent(name),now);db.createDemoRun({id,agentId:name,codeHash:'hash',epic:EPIC,leverage:1,capital:10000,params:{},now});}
function fixtureTrade():Trade{return {side:'long',size:10,entryTime:T,exitTime:T+HOUR,entryPrice:101,exitPrice:109,pnl:78,funding:-2,exitReason:EXIT_REASON.SIGNAL,barsHeld:1};}
test('common-date benchmark excludes the earlier control period and keeps unavailable windows explicit',()=>{
  const db=new ArenaDB(':memory:');add(db,BASE,'buy-hold',T-DAY);add(db,RUN,'fixture',T+HOUR/2);
  db.setSetting('feed.ticksSince',T);
  for(const [at,s,b]of [[T,10000,8000],[T+HOUR,10000,10000],[T+2*HOUR,11000,10500]]){db.upsertEquity(RUN,at!,s!);db.upsertEquity(BASE,at!,b!);}
  const service=new AgentEvidenceService({db,tracked:new Map()}as unknown as Arena);
  const result=service.forRun(db.run(RUN)!,T+3*HOUR);
  expect(result.benchmark).toMatchObject({status:'matched',from:T+HOUR,through:T+2*HOUR});
  expect(result.benchmark.strategyReturn).toBeCloseTo(.1,12);
  expect(result.benchmark.benchmarkReturn).toBeCloseTo(.05,12);
  expect(result.benchmark.excessReturn).toBeCloseTo(.05,12);
  db.upsertEquity(RUN,T+3*HOUR,20000);service.invalidate();
  expect(service.forRun(db.run(RUN)!,T+4*HOUR).benchmark.through).toBe(T+2*HOUR);
  db.db.close();
});
test('forward evidence avoids historical trade scans and historical reads stay cached until invalidation',()=>{
  const db=new ArenaDB(':memory:');add(db,RUN,'fixture',T);
  const scans:string[]=[],totals=db.costTotals.bind(db);
  db.costTotals=(kind,retired,runId,standardOnly)=>{scans.push(kind);return totals(kind,retired,runId,standardOnly);};
  const service=new AgentEvidenceService({db,tracked:new Map()}as unknown as Arena);
  service.forRun(db.run(RUN)!,T);service.overview(T+HOUR);
  expect(scans).toEqual([RUN_KIND.DEMO,RUN_KIND.DEMO]);
  const historical={...db.run(RUN)!,kind:RUN_KIND.BACKTEST};
  service.forRun(historical,T+HOUR);service.forRun(historical,T+HOUR+60000);
  expect(scans.filter(k=>k===RUN_KIND.BACKTEST)).toHaveLength(1);
  service.invalidate();service.forRun(historical,T+HOUR+60001);
  expect(scans.filter(k=>k===RUN_KIND.BACKTEST)).toHaveLength(2);db.db.close();
});
test('historical cost backfill verifies identity, preserves original results and remains idempotent',()=>{
  const db=new ArenaDB(':memory:');add(db,RUN,'fixture',T);const trade=fixtureTrade();db.appendTrade(RUN,0,trade);
  const row=db.tradeRow(RUN,0)!;
  const entry={mid:100.5,spread:1,source:'recorded' as const,ageMs:1,journalId:'fixture',sequence:1};
  const exit={mid:109.5,spread:1,source:'recorded' as const,ageMs:1,journalId:'fixture',sequence:2};
  const payload={runId:RUN,idx:0,fingerprint:costFingerprint(row),entry,exit};
  expect(()=>ingestCosts(db,[{...payload,fingerprint:'changed'}])).toThrow('fingerprint');
  expect(()=>ingestCosts(db,[{...payload,entry:{...entry,mid:99}}])).toThrow('does not match');
  expect(ingestCosts(db,[payload])).toEqual({attached:1,existing:0});
  expect(ingestCosts(db,[payload])).toEqual({attached:0,existing:1});
  const stored=db.trades(RUN)[0]!;const {execution,...unchanged}=stored;
  expect(unchanged).toMatchObject(trade);
  expect(execution).toMatchObject({method:'archived-quote-match',midpointPnl:90,spreadCost:10,timingCost:null,adjustmentPnl:0});
  const summary=db.costTotals(RUN_KIND.DEMO)[0]!;
  expect(summary).toMatchObject({closedTrades:1,measuredTrades:1,closedNetPnl:78,closedFunding:-2,midpointPnl:90,spreadCost:10,timedTrades:0});
  db.db.close();
});
test('archived references reject future, stale and different-price quotes and batches roll back atomically',()=>{
  const db=new ArenaDB(':memory:');add(db,RUN,'fixture',T);db.appendTrade(RUN,0,fixtureTrade());
  const row=db.tradeRow(RUN,0)!;
  const tick={id:1,epic:EPIC,time:T,receivedAt:T,bid:100,ask:101,session:1,timestampFallback:0};
  expect(matchCostQuote(row,true,tick,'fixture')?.mid).toBe(100.5);
  expect(matchCostQuote(row,true,{...tick,receivedAt:T+1},'fixture')).toBeUndefined();
  expect(matchCostQuote(row,true,{...tick,time:T-251,receivedAt:T-251},'fixture')).toBeUndefined();
  expect(matchCostQuote(row,true,{...tick,ask:102},'fixture')).toBeUndefined();
  const entry={mid:100.5,spread:1,source:'recorded' as const,ageMs:1,journalId:'fixture',sequence:1};
  const exit={...entry,mid:109.5,sequence:2};
  const payload={runId:RUN,idx:0,fingerprint:costFingerprint(row),entry,exit};
  expect(()=>ingestCosts(db,Array(501).fill(payload))).toThrow('batch');
  expect(()=>ingestCosts(db,[payload,{...payload,idx:1}])).toThrow('fingerprint');
  expect(db.tradeRow(RUN,0)!.execution).toBeNull();db.db.close();
});
test('resource-hold downtime survives restores and stops accumulating after resumption',()=>{
  const directory=mkdtempSync(join(tmpdir(),'trader-dependency-')),marker=join(directory,'pause.json'),db=new ArenaDB(':memory:');
  try{
    writeFileSync(marker,JSON.stringify({paused_at:new Date(T-2*DAY).toISOString()}));
    const history=new ForecastAvailability(db,marker);history.observe(false,T);
    expect(history.evidence(T-3*DAY,T)).toMatchObject({state:'user-paused',pausedMs:2*DAY,trackedSince:T-2*DAY});
    const restored=new ForecastAvailability(db,marker);restored.observe(false,T+HOUR);
    expect(restored.evidence(T-3*DAY,T+HOUR)?.pausedMs).toBe(2*DAY+HOUR);
    unlinkSync(marker);restored.observe(true,T+2*HOUR);
    expect(restored.evidence(T-3*DAY,T+3*HOUR)).toMatchObject({state:'available',pausedMs:2*DAY+2*HOUR});
  }finally{db.db.close();rmSync(directory,{recursive:true,force:true});}
});
test('a live held position is not silent and recorded forecast downtime does not manufacture maturity',()=>{
  const row={status:'running',slug:'holder',startedAt:T-65*DAY,metrics:{trades:0,tStat:0},evidence:{openPosition:true}}as LeaderboardRow;
  expect(assess(row,new Map(),T).verdict).toBe(VERDICT.EARLY);
  row.evidence!.openPosition=false;
  expect(assess(row,new Map(),T).verdict).toBe(VERDICT.RETIRE);
  row.observation={since:row.startedAt,trades:40,tStat:3,pausedMs:64*DAY};
  expect(assess(row,new Map(),T).verdict).toBe(VERDICT.EARLY);
  row.status='busted';
  expect(assess(row,new Map(),T).verdict).toBe(VERDICT.RETIRE);
});
