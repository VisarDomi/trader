import{test,expect}from'bun:test';
import{qualifiesGap,counterMoveBp,cachedSignalDefinition}from'./gap-replay';
import{loadAgents}from'../../engine/loader';
test('bullish dips and bearish bounces are strict opposite-side signals with symmetric distance limits',()=>{
 expect(qualifiesGap('long',99,100,0)).toBe(true);expect(qualifiesGap('short',101,100,0)).toBe(true);
 expect(qualifiesGap('long',101,100,0)).toBe(false);expect(qualifiesGap('short',99,100,0)).toBe(false);
 expect(qualifiesGap('long',100,100,0)).toBe(false);expect(qualifiesGap('short',100,100,0)).toBe(false);
 expect(counterMoveBp('long',999,1000)).toBeCloseTo(10);expect(counterMoveBp('short',1001,1000)).toBeCloseTo(10);
 expect(qualifiesGap('long',999,1000,15)).toBe(false);expect(qualifiesGap('short',1001,1000,5)).toBe(true);
 expect(qualifiesGap('short',1,0,0)).toBe(false);expect(qualifiesGap('long',NaN,100,0)).toBe(false);expect(qualifiesGap('long',99,100,-1)).toBe(false);
});
test('cached research signals still call the frozen original order logic and reject mismatched signal prices',async()=>{
 const base=(await loadAgents()).agents.find(a=>a.id==='visar-night-trading')!;const time=Date.UTC(2024,0,9,2,27),s={decision:time,session:'2024-01-08',side:'long'as const,bid:99,reference:100};
 const def=cachedSignalDefinition(base,new Map([[time,s]]),5,'US500'),orders:any[]=[];
 const ctx:any={state:base.def.init!(base.params),params:base.params,time,bar:{time:time-60000,open:99,high:99,low:99,close:99,spread:.01,volume:1},isWarmup:false,position:null,balance:10000,leverage:20,instrument:{typicalSpread:.01,pricePrecision:2},buy:(o:any)=>orders.push(o),sell:()=>{throw Error('Wrong side')}};
 def.onBar!(ctx);expect(orders).toHaveLength(1);expect(orders[0]).toMatchObject({marginPct:90,closeAt:time+300*60000,validUntil:time+60000});
 ctx.bar.close=98;expect(()=>def.onBar!(ctx)).toThrow('Oracle signal bid');
});
