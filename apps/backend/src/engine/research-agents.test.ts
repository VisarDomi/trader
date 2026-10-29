import { expect,test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import breakout from '../../agents/quote-breakout.ts';
import twin from '../../agents/night-risk-twin/index.ts';
import original from '../../agents/visar-night-trading.ts';
import { localTime,TZ,type AgentContext } from '../sdk/index.ts';
const T=Date.UTC(2026,9,29,14),MINUTE=60000;
test('night twin freezes the original signal and scales planned exposure/risk without copying demo admission',()=>{
  const root=join(import.meta.dir,'../../agents');
  const frozen=readFileSync(join(root,'night-risk-twin/reference.ts'),'utf8').replace("from '../../src/sdk'","from '../src/sdk'");
  expect(frozen).toBe(readFileSync(join(root,'visar-night-trading.ts'),'utf8'));
  const before=original.params.marginPct*original.leverage![0]!/100;
  const after=twin.params.marginPct*twin.leverage![0]!/100;
  expect(after).toBeCloseTo(1.8,12);expect(after/before).toBeCloseTo(.01,12);
  expect(twin.params.lossPct/(twin.params.marginPct*twin.leverage![0]!)).toBeCloseTo(original.params.lossPct/(original.params.marginPct*original.leverage![0]!),12);
});
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
