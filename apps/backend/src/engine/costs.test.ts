import { expect,test } from 'bun:test';
import { executionCosts,fillQuote } from './costs.ts';
import { TICK_SOURCE } from './ticks.ts';
import type { FillQuoteEvidence } from '@trader/shared/types';
import { MarketEngine } from './market.ts';
import { getInstrument } from './instruments.ts';
import { defineAgent } from '../sdk/index.ts';
import type { LoadedAgent } from './loader.ts';
import { VirtualVenue } from './venue.ts';
import fixtures from './fixtures/capital-markets.json';
const LONG='long',SHORT='short',EPIC='US500',T=Date.UTC(2026,9,29,10);
const quote=(mid:number,spread:number,decisionMid?:number):FillQuoteEvidence=>({mid,spread,source:TICK_SOURCE.RECORDED,...(decisionMid!==undefined?{decisionMid}:{})});
test('long and short cost identities retain funding, signed timing and exceptional adjustments',()=>{
  for(const side of [LONG,SHORT] as const) {
    const sign=side===LONG?1:-1;
    const entry=quote(100,2,99),exit=quote(110,4,111),size=5,funding=-3;
    const raw=sign*(exit.mid-entry.mid)*size-size*(entry.spread+exit.spread)/2;
    const trade={side,size,funding,pnl:raw+funding+7};
    const e=executionCosts(trade,entry,exit);
    expect(e.spreadCost).toBe(15);
    expect(e.adjustmentPnl).toBe(7);
    expect(e.midpointPnl-e.spreadCost+funding+e.adjustmentPnl).toBe(trade.pnl);
    expect(e.timingCost).toBe(sign*10);
  }
  expect(executionCosts({side:LONG,size:1,pnl:9,funding:0},quote(100,1),quote(110,1)).timingCost).toBeNull();
});
test('a candle or stale reference cannot fabricate an execution price match',()=>{
  expect(fillQuote(null,LONG,true,101,2)).toBeUndefined();
  const q={bid:100,ask:102,time:T,source:TICK_SOURCE.RECORDED};
  expect(fillQuote(q,LONG,true,103,2)).toBeUndefined();
  expect(fillQuote(q,LONG,true,102,2)?.mid).toBe(101);
  expect(fillQuote(q,SHORT,false,102,2)?.spread).toBe(2);
});
test('queued fills capture the decision quotes without changing actual prices or trade outcomes',()=>{
  let now=T;
  const instrument={...getInstrument(EPIC)},venue=new VirtualVenue(instrument);
  venue.update({...fixtures.markets.US500,snapshot:{...fixtures.markets.US500.snapshot,marketStatus:'TRADEABLE'}},now);
  const def=defineAgent({name:'cost-fixture',description:'cost fixture',instruments:[EPIC],timeframe:'1m',warmup:0,params:{},
    onTick(ctx){if(ctx.ticks.length===1)ctx.buy({size:1});if(ctx.ticks.length===2)ctx.close();}});
  const agent:LoadedAgent={id:'cost-fixture',slug:'cost-fixture',variant:null,file:'',source:'',codeHash:'fixture',params:{},def};
  const engine=new MarketEngine(instrument),run=engine.addRun({runId:agent.id,agent,leverage:20,capital:10000,checkStopsOnCandles:false,
    execution:{venue,latencyMs:500,now:()=>now}});
  for(const [i,bid]of [100,102,110].entries()){now=T+i*1000;engine.processTick({time:now,receivedAt:now,bid,ask:bid+1,source:TICK_SOURCE.RECORDED});}
  expect(run.trades).toHaveLength(1);
  expect(run.trades[0]).toMatchObject({entryPrice:103,exitPrice:110,pnl:7,execution:{midpointPnl:8,spreadCost:1,timingCost:-6,adjustmentPnl:0}});
});
