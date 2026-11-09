import {test,expect} from 'bun:test';
import reference,{capitalProfitLevel} from '../../../agents/visar-night-v3-us500/reference';
import {MarketEngine} from '../../engine/market';
import {getInstrument} from '../../engine/instruments';
import type {LoadedAgent} from '../../engine/loader';
import {TICK_SOURCE} from '../../engine/ticks';
import {fundingDay} from '../../engine/clock';

test('profit levels are returns on entry capital, rebased symmetrically to actual size/fill',()=>{
 expect(capitalProfitLevel('long',5000,10,10000,20,1)).toBe(5200);
 expect(capitalProfitLevel('short',5000,10,10000,50,1)).toBe(4500);
 expect(capitalProfitLevel('long',5000.1,7,10000,100,1)).toBeGreaterThanOrEqual(5000.1+10000/7);
 expect(capitalProfitLevel('short',5000.1,7,10000,20,1)).toBeLessThanOrEqual(5000.1-2000/7);
 expect(capitalProfitLevel('long',5000,10,10000,0,1)).toBeUndefined();
 expect(capitalProfitLevel('short',5000,1.8,10000,100,1)).toBeUndefined();
 expect(()=>capitalProfitLevel('long',5000,0,10000,20,1)).toThrow();
});
function setup(side:'long'|'short',profitPct:number){
 const engine=new MarketEngine({...getInstrument('US500')});
 const def={...reference,params:{...reference.params,profitPct,lossPct:20},onBar:undefined};
 const a:LoadedAgent={id:'profit-fixture',slug:'profit-fixture',variant:null,file:'',source:'',codeHash:'fixture',def,params:def.params};
 const run=engine.addRun({runId:a.id,agent:a,leverage:20,capital:10000,checkStopsOnCandles:false});
 const at=Date.UTC(2024,0,9,2,27),state=run.state as any;state.entryCapital=10000;
 engine.processCandle({time:at-60000,open:5000,high:5000,low:5000,close:5000,spread:1,volume:1});
 const snap=run.snapshot();snap.position={side,size:10,entryPrice:5000,entryTime:at,entryBarCount:1,heldBars:0,heldThrough:at,heldCount:1,stopLoss:side==='long'?4800:5200,takeProfit:capitalProfitLevel(side,5000,10,10000,profitPct,1)??null,trailingStop:null,trailAnchor:5000,funding:0,lastFundingDay:fundingDay(at),closeAt:at+300*60000} as any;
 run.restore(snap,[],[]);
 const tick=(bid:number,ask:number,time=at+1000)=>engine.processTick({bid,ask,time,receivedAt:time,source:TICK_SOURCE.SYNTHETIC});
 return {run,tick,at};
}
test('exits on executable bid/ask profit before deadline; loss and no-target deadline remain active',()=>{
 const long=setup('long',20);long.tick(5199.9,5200.9);expect(long.run.position).not.toBeNull();long.tick(5200,5201,long.at+2000);expect(long.run.trades[0]?.exitReason).toBe('take_profit');expect(long.run.trades[0]?.pnl).toBe(2000);
 const short=setup('short',50);short.tick(4499.1,4500.1);expect(short.run.position).not.toBeNull();short.tick(4499,4500,short.at+2000);expect(short.run.trades[0]?.pnl).toBe(5000);
 const loss=setup('long',100);loss.tick(4800,4801);expect(loss.run.trades[0]?.exitReason).toBe('stop_loss');
 const deadline=setup('long',0);deadline.tick(5200,5201);expect(deadline.run.position).not.toBeNull();deadline.tick(5200,5201,deadline.at+300*60000);expect(deadline.run.trades[0]?.exitReason).toBe('session_end');
});
test('profit protections survive snapshot restore and fallback uses executable P&L',()=>{
 const original=setup('long',100),restored=setup('long',0);restored.run.restore(original.run.snapshot(),[],[]);restored.tick(6000,6001);expect(restored.run.trades[0]?.exitReason).toBe('take_profit');
 const calls:string[]=[],state={entryCapital:10000};
 reference.onTick!({params:{...reference.params,profitPct:20},state,position:{takeProfit:null,unrealizedPnl:1999},close:(s:string)=>calls.push(s)} as any);
 expect(calls).toHaveLength(0);
 reference.onTick!({params:{...reference.params,profitPct:20},state,position:{takeProfit:null,unrealizedPnl:2000},close:(s:string)=>calls.push(s)} as any);
 expect(calls).toEqual(['capital take profit +20%']);
});
test('opening fill rebases both target and stop to actual rounded units',()=>{
 for(const side of ['long','short'] as const){
  const updates:any[]=[],ctx:any={params:{...reference.params,profitPct:50,lossPct:20},state:{entryCapital:10000},position:{stopLoss:side==='long'?4900:5100,takeProfit:null},instrument:{pricePrecision:1},setStops:(u:any)=>updates.push(u)};
  reference.onFill!(ctx,{kind:'open',side,price:5000.1,size:7,time:1});
  expect(updates).toHaveLength(1);
  const gain=(side==='long'?updates[0].takeProfit-5000.1:5000.1-updates[0].takeProfit)*7;
  expect(gain).toBeGreaterThanOrEqual(5000);expect(gain).toBeLessThan(5001);
 }
});
