import { expect,test } from 'bun:test';
import { RefreshLoop } from './refresh-loop';
function timer(){let task:(()=>void)|null=null,delay=0;return {clock:{set(fn:()=>void,ms:number){task=fn;delay=ms;return 1 as unknown as ReturnType<typeof setTimeout>},clear(){task=null}},get delay(){return delay},get scheduled(){return !!task},fire(){const fn=task;task=null;fn?.()}};}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('recovery refreshes serialize, switch back to normal cadence, and stop on unmount',async()=>{
 const t=timer();let failed=true,calls=0,release=()=>{};
 const loop=new RefreshLoop(async()=>{calls++;await new Promise<void>(r=>release=r)},()=>failed,()=>true,t.clock);
 loop.start();expect(t.delay).toBe(5000);t.fire();loop.wake();expect(calls).toBe(1);expect(t.scheduled).toBe(false);
 failed=false;release();await settle();expect(t.delay).toBe(30000);expect(t.scheduled).toBe(true);loop.stop();expect(t.scheduled).toBe(false);
});
test('hidden tabs stop refreshing and returning to the tab retries after a rejected refresh',async()=>{
 const t=timer();let visible=false,calls=0;
 const loop=new RefreshLoop(async()=>{calls++;throw Error('network')},()=>true,()=>visible,t.clock);
 loop.start();expect(t.scheduled).toBe(false);loop.wake();expect(calls).toBe(0);
 visible=true;loop.wake();await settle();expect(calls).toBe(1);expect(t.delay).toBe(5000);
 visible=false;t.fire();expect(calls).toBe(1);expect(t.scheduled).toBe(false);loop.stop();
});
