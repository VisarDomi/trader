import{expect,test}from'bun:test';
import{readFileSync}from'node:fs';
import central,{nightSessionFeatures,classifyNightSession}from'./central-session';
import original from'../../../agents/visar-night-trading';
import{SESSION}from'./replay';
import{localTime,TZ}from'../../sdk';

test('central recognition changes only the NY window; overnight execution and original source stay frozen',()=>{
 const text=readFileSync(new URL('./central-session.ts',import.meta.url),'utf8').replace("from '../../sdk'","from '../src/sdk'").replace('const CASH_OPEN = 10 * 60 + 30;','const CASH_OPEN = 9 * 60 + 30;').replace('const CASH_CLOSE = 15 * 60 + 30;','const CASH_CLOSE = 16 * 60;');
 expect(text).toBe(readFileSync(new URL('../../../agents/visar-night-trading.ts',import.meta.url),'utf8'));
 expect(central.params).toEqual(original.params);expect(SESSION.intervals).toBe(20);
});
test('opening/closing volatility is excluded and central-session coverage/checkpoints are enforced',()=>{
 const state=central.init!(central.params),base=Date.UTC(2026,8,8,13,30),orders:unknown[]=[];
 for(let i=0;i<390;i++){
  const inside=i>=60&&i<360,open=inside?100+(i-60)*.003:200,close=inside?open+.003:50;
  const ctx={state,params:central.params,time:base+(i+1)*60000,bar:{time:base+i*60000,open,high:inside?close+.0001:300,low:inside?open-.0001:1,close,volume:1,spread:.01},isWarmup:true,position:null,buy:(x:unknown)=>orders.push(x),sell:(x:unknown)=>orders.push(x)};
  central.onBar!(ctx as any);
 }
 const day=state.session,f=nightSessionFeatures(day);expect(day.open).toBe(100);expect(day.minutes).toBe(300);expect(day.points).toHaveLength(21);expect(day.direction).toBe(1);expect(f.rangePct).toBeLessThan(1);expect(orders).toHaveLength(0);
 expect(classifyNightSession({...f,minutes:269},central.params)).toBe(0);expect(classifyNightSession({...f,checkpoints:20},central.params)).toBe(0);
 expect(classifyNightSession({...f,directionalShare:12/20},{...central.params,minDirectionalShare:16/26})).toBe(0);
 expect(classifyNightSession({...f,directionalShare:13/20},{...central.params,minDirectionalShare:16/26})).toBe(1);
 expect(localTime(base+60*60000,TZ.NEW_YORK).minuteOfDay).toBe(630);
});
