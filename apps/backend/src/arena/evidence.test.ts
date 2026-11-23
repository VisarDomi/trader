import { expect,test } from 'bun:test';
import { ArenaDB,RUN_KIND } from './db.ts';
import { AgentEvidenceService } from './evidence.ts';
import { ingestCosts,costFingerprint } from './cost-ingest.ts';
import { ForecastAvailability } from './dependency.ts';
import { BILLS,CPI,DEPOSITS,Rates,billYield } from './rates.ts';
import { outrightHold } from './hold.ts';
import { defineAgent,EXIT_REASON } from '../sdk/index.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { Arena } from './arena.ts';
import type { Trade } from '../sdk/types.ts';
import { mkdtempSync,writeFileSync,unlinkSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assess,VERDICT,type LeaderboardRow } from '@trader/shared';
import { matchCostQuote } from '../lab/audit-costs.ts';
import { resourceHold } from '../engine/resource-hold.ts';
const EPIC='US500',HOUR=3600000,DAY=24*HOUR,T=Date.UTC(2026,9,29,10),RUN='demo:fixture:US500:x1:hash',BASE='demo:buy-hold:US500:x1:hash';
function agent(id:string):LoadedAgent {
  return {id,slug:id,variant:null,file:'',source:'',codeHash:'hash',params:{},def:defineAgent({name:id,description:id,instruments:[EPIC],timeframe:'1h',params:{},onBar(){}})};
}
function add(db:ArenaDB,id:string,name:string,now:number){db.upsertAgent(agent(name),now);db.createDemoRun({id,agentId:name,codeHash:'hash',epic:EPIC,leverage:1,capital:10000,params:{},now});}
function fixtureTrade():Trade{return {side:'long',size:10,entryTime:T,exitTime:T+HOUR,entryPrice:101,exitPrice:109,pnl:78,funding:-2,exitReason:EXIT_REASON.SIGNAL,barsHeld:1};}
const candle=(time:number,close:number,open=close)=>({time,open,high:Math.max(open,close),low:Math.min(open,close),close,spread:0,volume:0});
/** Rates with bills, CPI, one US500 (SPY) dividend of 1% inside the fixture window, AMZN fetched with none, and €STR. */
function rates(db:ArenaDB):Rates {
  db.saveMacroSeries(BILLS,[{t:Date.UTC(2023,0,2),value:4}]);
  db.saveMacroSeries(CPI,Array.from({length:48},(_,i)=>({t:Date.UTC(2023,i,1),value:300*1.002**i})));
  db.saveMacroSeries('DIV:US500',[{t:T+3*HOUR,value:.01}]);db.setSetting('rates.dividends.US500',T);
  db.setSetting('rates.dividends.AMZN',T);
  db.saveMacroSeries(DEPOSITS.EURUSD!.series,[{t:Date.UTC(2023,0,1),value:3.6}]);
  return new Rates(db);
}
const service=(db:ArenaDB,r?:Rates)=>new AgentEvidenceService({db,tracked:new Map(),rates:r??rates(db)}as unknown as Arena);
test('virtual runs compare their whole life with holding the instrument outright: price plus dividends, no CFD fees',()=>{
  // The hold is the instrument owned outright, not the Buy & Hold CFD control (0.9× exposure, ~8%/yr index funding, no dividends).
  const db=new ArenaDB(':memory:');add(db,RUN,'fixture',T);
  for(const [at,s]of [[T+HOUR,9000],[T+6*HOUR,12000]])db.upsertEquity(RUN,at!,s!);
  db.insertCandles(EPIC,[candle(T-60_000,100),candle(T+6*HOUR-60_000,90)]);
  const b=service(db).forRun(db.run(RUN)!,T+7*HOUR).benchmark;
  expect(b).toMatchObject({status:'matched',basis:'shared-hourly-equity',from:T,through:T+6*HOUR});
  expect(b.strategyReturn).toBeCloseTo(.2,12);                 // 12,000 on 10,000 of starting capital
  expect(b.hold).toMatchObject({kind:'dividends',source:'SPY dividends ×1'});
  expect(b.hold!.price).toBeCloseTo(-.1,12);
  expect(b.hold!.income).toBeCloseTo(.01,12);
  expect(b.benchmarkReturn).toBeCloseTo(.9*1.01-1,12);
  expect(b.excessReturn).toBeCloseTo(.2-(.9*1.01-1),12);
  expect(b.hurdles!.cash).toBeGreaterThan(0);
  db.db.close();
});
test('a hold is unavailable, never zero, without prices, dividend history or a first equity observation',()=>{
  const db=new ArenaDB(':memory:');add(db,RUN,'fixture',T);
  expect(service(db).forRun(db.run(RUN)!,T+DAY).benchmark).toMatchObject({status:'unavailable',note:'Waiting for the first hourly equity observation.'});
  db.upsertEquity(RUN,T+HOUR,10100);
  expect(service(db).forRun(db.run(RUN)!,T+DAY).benchmark).toMatchObject({status:'unavailable',note:'No stored prices for these dates.'});
  db.insertCandles(EPIC,[candle(T-60_000,100),candle(T+HOUR-60_000,101)]);
  // Dividends never fetched for US500: waiting, not a price-only hold.
  const bare=new ArenaDB(':memory:');add(bare,RUN,'fixture',T);bare.upsertEquity(RUN,T+HOUR,10100);bare.insertCandles(EPIC,[candle(T-60_000,100),candle(T+HOUR-60_000,101)]);
  expect(service(bare,new Rates(bare)).forRun(bare.run(RUN)!,T+DAY).benchmark).toMatchObject({status:'unavailable',note:'Waiting for the dividend history.'});
  expect(service(db).forRun(db.run(RUN)!,T+DAY).benchmark.status).toBe('matched');
  db.db.close();bare.db.close();
});
test('currencies earn their deposit rate, shares without dividends and gold are price only, oil is an upper bound',()=>{
  const db=new ArenaDB(':memory:'),r=rates(db),day=Date.UTC(2026,9,1);
  for(const epic of ['EURUSD','AMZN','GOLD','OIL_CRUDE'])db.insertDailyBars(epic,[candle(day,1,1),candle(day+DAY,1.1,1),candle(day+30*DAY,1.2,1.1)]);
  const hold=(epic:string)=>outrightHold(db,r,epic,day,day+31*DAY) as Exclude<ReturnType<typeof outrightHold>,string>;
  // Open of the first bar (1.0) to the close of the last bar ended by `through` (1.2).
  const eur=hold('EURUSD');
  expect(eur.price).toBeCloseTo(.2,12);
  expect(eur).toMatchObject({kind:'interest',source:'€STR on EUR'});
  expect(eur.income).toBeCloseTo((1+.036/360)**31-1,12);
  expect(hold('AMZN')).toMatchObject({kind:'dividends',income:0,source:'no AMZN dividend in these dates'});
  expect(hold('GOLD')).toMatchObject({kind:'none',income:0});
  expect(hold('GOLD').priceOnly).toBeUndefined();
  expect(hold('OIL_CRUDE')).toMatchObject({kind:'none',priceOnly:true});
  db.db.close();
});
test('Capital cash since the first deal and backtests over their window are compared with the outright hold',()=>{
  const db=new ArenaDB(':memory:'),r=rates(db),svc=service(db,r);
  db.insertCandles(EPIC,[candle(T+2*HOUR-60_000,100),candle(T+5*HOUR-60_000,105)]);
  const cash=(svc as any).cashComparison({epic:EPIC,metrics:{startTime:T+2*HOUR,totalReturn:.25}} as LeaderboardRow,T+5*HOUR);
  expect(cash).toMatchObject({status:'matched',basis:'cash-vs-hold',from:T+2*HOUR,through:T+5*HOUR});
  expect(cash.benchmarkReturn).toBeCloseTo(1.05*1.01-1,12);expect(cash.excessReturn).toBeCloseTo(.25-(1.05*1.01-1),12);
  expect((svc as any).cashComparison({epic:EPIC,metrics:{startTime:0,totalReturn:0}} as LeaderboardRow).note).toBe('No priced Capital deals yet.');
  const start=Date.UTC(2026,0,5),end=Date.UTC(2026,0,9);
  db.insertDailyBars('GOLD',[candle(start,2000,1990),candle(end-DAY,2100,2050)]);
  db.createDemoRun({id:'bt:w:fixture:GOLD:x1',agentId:'fixture',codeHash:'hash',epic:'GOLD',leverage:1,capital:10000,params:{},now:T});
  db.db.run('UPDATE runs SET kind=?,window_id=?,metrics=? WHERE id=?',[RUN_KIND.BACKTEST,'w',JSON.stringify({startTime:start,endTime:end,totalReturn:.4}),'bt:w:fixture:GOLD:x1']);
  svc.invalidate();
  const bt=svc.forRun(db.run('bt:w:fixture:GOLD:x1')!,T+2*DAY).benchmark;
  expect(bt).toMatchObject({status:'matched',basis:'same-backtest-window',from:start,through:end});
  expect(bt.benchmarkReturn).toBeCloseTo(2100/1990-1,12);
  db.db.close();
});
test('every matched comparison carries Treasury bills and CPI over its own dates; none without stored rates',()=>{
  const db=new ArenaDB(':memory:');add(db,RUN,'fixture',T);db.upsertEquity(RUN,T+30*DAY,11000);
  db.insertCandles('GOLD',[]);
  db.db.run('UPDATE runs SET epic=? WHERE id=?',['GOLD',RUN]);
  db.insertCandles('GOLD',[candle(T-60_000,100),candle(T+30*DAY-60_000,102)]);
  expect(service(db,new Rates(db)).forRun(db.run(RUN)!,T+31*DAY).benchmark).toMatchObject({status:'matched'});
  expect(service(db,new Rates(db)).forRun(db.run(RUN)!,T+31*DAY).benchmark.hurdles).toBeUndefined();
  const r=rates(db),b=service(db,r).forRun(db.run(RUN)!,T+31*DAY).benchmark;
  expect(b.hurdles).toEqual(r.over(T,T+30*DAY)!);
  expect(b.hurdles!.cash).toBeCloseTo((1+billYield(4)/365)**30-1,12);
  expect(b.hurdles!.inflation).toBeGreaterThan(.0015);expect(b.hurdles!.inflation).toBeLessThan(.0025);
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
test('a scoped model resume leaves other holds intact and a later global stop takes precedence',()=>{
  const directory=mkdtempSync(join(tmpdir(),'trader-scoped-hold-')),marker=join(directory,'pause.json'),db=new ArenaDB(':memory:');
  try{
    writeFileSync(marker,JSON.stringify({paused_at:new Date(T-DAY).toISOString(),services:['trader-lab.service']}));
    expect(resourceHold('trader-forecaster.service',marker)).toBeNull();
    expect(resourceHold('trader-lab.service',marker)).not.toBeNull();
    const availability=new ForecastAvailability(db,marker);availability.observe(false,T);
    expect(availability.evidence(T-DAY,T)?.state).toBe('unavailable');
    availability.observe(true,T+HOUR);expect(availability.evidence(T-DAY,T+HOUR)?.state).toBe('available');
    writeFileSync(marker,JSON.stringify({paused_at:new Date(T+HOUR).toISOString(),services:['trader-lab.service','trader-forecaster.service']}));
    availability.observe(false,T+2*HOUR);expect(availability.evidence(T-DAY,T+2*HOUR)?.state).toBe('user-paused');
    for(const raw of ['{','null','{}','{"services":[42]}']){writeFileSync(marker,raw);expect(resourceHold('trader-forecaster.service',marker)).not.toBeNull();}
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
test('a target exit at its level matches the archived quote that crossed it, and only that way',()=>{
  const db=new ArenaDB(':memory:');add(db,RUN,'fixture',T);db.appendTrade(RUN,0,{...fixtureTrade(),exitReason:EXIT_REASON.TAKE_PROFIT});
  const row=db.tradeRow(RUN,0)!;
  const crossing={id:2,epic:EPIC,time:row.exit_time,receivedAt:row.exit_time,bid:row.exit_price+0.5,ask:row.exit_price+1.5,session:1,timestampFallback:0};
  const exit=matchCostQuote(row,false,crossing,'fixture')!;
  expect(exit).toMatchObject({limit:row.exit_price,mid:row.exit_price+1});
  expect(matchCostQuote(row,false,{...crossing,bid:row.exit_price-0.5,ask:row.exit_price+0.5},'fixture')).toBeUndefined();
  const entry=matchCostQuote(row,true,{id:1,epic:EPIC,time:row.entry_time,receivedAt:row.entry_time,bid:row.entry_price-1,ask:row.entry_price,session:1,timestampFallback:0},'fixture')!;
  const payload={runId:RUN,idx:0,fingerprint:costFingerprint(row),entry,exit};
  expect(()=>ingestCosts(db,[{...payload,exit:{...exit,limit:undefined}}])).toThrow('does not match');
  expect(ingestCosts(db,[payload])).toEqual({attached:1,existing:0});
  expect(JSON.parse(db.tradeRow(RUN,0)!.execution!)).toMatchObject({exit:{limit:row.exit_price},adjustmentPnl:-0.5*row.size});
  db.db.close();
});
