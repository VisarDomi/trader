import { expect,test } from 'bun:test';
import breakout from '../../agents/quote-breakout.ts';
import { localTime,TZ } from '../sdk/index.ts';
const T=Date.UTC(2026,9,29,14),MINUTE=60000;
function context(){
  const orders:unknown[]=[];
  const state=breakout.init!(breakout.params);Object.assign(state,{day:localTime(T+6*3600000,TZ.NEW_YORK).date,open:100,high:106,low:96,prevRange:10});
  const ctx={state,params:{...breakout.params,gated:true},time:T+15*MINUTE,isWarmup:false,position:null,
    bar:{time:T,open:104,high:106,low:104,close:106,spread:.1,volume:1},
    tick:{bid:106,ask:106.1,time:T,receivedAt:T},ta:{atr:()=>2},buy:(o:unknown)=>orders.push(o),sell:(o:unknown)=>orders.push(o)};
  return {ctx,orders};
}
test('spread gate rejects wide quotes/adverse chasing, accepts a normal quote once, and expires missed entries',()=>{
  const {ctx,orders}=context();breakout.onBar!(ctx as unknown as Parameters<NonNullable<typeof breakout.onBar>>[0]);
  expect(ctx.state.side).toBe('long');
  ctx.tick.ask=107;breakout.onTick!(ctx as unknown as Parameters<NonNullable<typeof breakout.onTick>>[0]);expect(orders).toHaveLength(0);
  ctx.tick={...ctx.tick,bid:108,ask:108.1};breakout.onTick!(ctx as unknown as Parameters<NonNullable<typeof breakout.onTick>>[0]);expect(orders).toHaveLength(0);
  ctx.tick={...ctx.tick,bid:106,ask:106.1};breakout.onTick!(ctx as unknown as Parameters<NonNullable<typeof breakout.onTick>>[0]);
  expect(orders).toHaveLength(1);expect(orders[0]).toMatchObject({stopLoss:100,riskPct:.5,validUntil:ctx.time+2*MINUTE});
  breakout.onTick!(ctx as unknown as Parameters<NonNullable<typeof breakout.onTick>>[0]);expect(orders).toHaveLength(1);
  const expired=context();breakout.onBar!(expired.ctx as unknown as Parameters<NonNullable<typeof breakout.onBar>>[0]);
  expired.ctx.time=expired.ctx.state.expires;breakout.onTick!(expired.ctx as unknown as Parameters<NonNullable<typeof breakout.onTick>>[0]);
  expect(expired.orders).toHaveLength(0);expect(expired.ctx.state.traded).toBe(true);
});
