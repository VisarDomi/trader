import {expect,test} from 'bun:test';
import {getInstrument} from '../engine/instruments';
import {MarketEngine} from '../engine/market';
import {TICK_SOURCE,type Tick} from '../engine/ticks';
import {idleMinuteTicks} from './backtest-core';

const MINUTE=60_000,START=Date.UTC(2026,9,20,13,0);

/** Deterministic quote stream with the recorder's real irregularities: late stamps, reordering, stale and broken quotes. */
function minutes(seed:number,count:number){
  let s=seed>>>0,price=7000,sequence=0;
  const rnd=()=>{s=(s+0x6d2b79f5)|0;let t=Math.imul(s^(s>>>15),s|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
  const out:{time:number;ticks:Tick[]}[]=[];
  for(let m=0;m<count;m++){
    const time=START+m*MINUTE,ticks:Tick[]=[],n=Math.floor(rnd()*40);
    for(let i=0;i<n;i++){
      const receivedAt=time+Math.floor((i+rnd())*MINUTE/Math.max(n,1));price+=Math.round((rnd()-.5)*8)/10;
      let stamp=receivedAt-Math.floor(rnd()*400),bid=price,ask=price+.6,seq=++sequence;
      const roll=rnd();
      if(roll<.04)stamp=receivedAt-1500-Math.floor(rnd()*3000);   // stamped in the previous minute
      else if(roll<.06)stamp=receivedAt-45_000;                    // stale
      else if(roll<.08)ask=bid-.1;                                 // crossed
      else if(roll<.10)seq-=3;                                     // sequence regression
      else if(roll<.11)stamp=receivedAt+900;                       // slightly ahead, still allowed
      ticks.push({time:stamp,receivedAt,bid,ask,source:TICK_SOURCE.RECORDED,sequence:seq,journalId:rnd()<.01?'other':'journal-a'});
    }
    out.push({time,ticks});
  }
  return out;
}

function replay(stream:ReturnType<typeof minutes>,thin:boolean){
  const engine=new MarketEngine({...getInstrument('US500')}),candles=[];let rejected=0,delivered=0;
  for(const m of stream){
    engine.processClock(m.time);
    const t=thin?idleMinuteTicks(m.ticks,m.time,engine.lastAcceptedTick):{ticks:m.ticks,rejected:0};
    rejected+=t.rejected;
    for(const q of t.ticks){engine.processTick(q);delivered++}
    engine.processClock(m.time+MINUTE);
    candles.push(...engine.takeCompletedCandles().map(({volume:_,...c})=>c));
  }
  return {candles,rejected:rejected+engine.rejectedTicks,last:engine.lastAcceptedTick,delivered};
}

test('idle minutes rebuild identical candles, rejections and last quote from far fewer quotes', () => {
  for(const seed of [1,2,3,4,5,6,7,8]){
    const stream=minutes(seed,600),full=replay(stream,false),thin=replay(stream,true);
    expect(thin.candles).toEqual(full.candles);
    expect(thin.rejected).toBe(full.rejected);
    expect(thin.last).toEqual(full.last);
    expect(thin.delivered).toBeLessThan(full.delivered/2);
  }
});

test('short minutes pass through untouched', () => {
  const ticks=minutes(9,1)[0]!.ticks.slice(0,4);
  expect(idleMinuteTicks(ticks,START,null).ticks).toBe(ticks);
});
