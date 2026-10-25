import { createHash } from 'node:crypto';
import { expect,test } from 'bun:test';
import { nativeResponse, type NativeContext } from './native-contract';
const TOKEN='native-test-credential',HASH=createHash('sha256').update(TOKEN).digest('hex');
function request(resource:string,token=TOKEN,body?:unknown) {
  return new Request(`https://trader.invalid/api/native/v1/${resource}`,{method:body===undefined?'GET':'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
test('native access fails closed without its dedicated credential and never calls the arena',async()=>{
  let calls=0;const ctx:NativeContext={hash:HASH,read:async()=>{calls++;return []},mutate:async()=>{calls++;return {}}};
  for(const hash of [undefined,'',HASH]) expect((await nativeResponse(request('status','wrong'),'status',{...ctx,hash})).status).toBe(401);
  expect(calls).toBe(0);
});
test('native resources and demo controls are allowlisted and validated',async()=>{
  const calls:unknown[]=[];const ctx:NativeContext={hash:HASH,read:async r=>{calls.push(r);return []},mutate:async(r,b)=>{calls.push([r,b]);return {ok:true}}};
  expect((await nativeResponse(request('status'),'status',ctx)).status).toBe(200);
  expect((await nativeResponse(request('secrets'),'secrets',ctx)).status).toBe(404);
  expect((await nativeResponse(request('run'),'run',ctx)).status).toBe(400);
  expect((await nativeResponse(request('mirror',TOKEN,{enabled:'yes'}),'mirror',ctx)).status).toBe(400);
  expect((await nativeResponse(request('exclude',TOKEN,{runId:'Visi',excluded:true}),'exclude',ctx)).status).toBe(400);
  expect((await nativeResponse(request('mirror',TOKEN,{enabled:false}),'mirror',ctx)).status).toBe(200);
  expect(calls).toEqual(['status',['mirror',{enabled:false}]]);
});
