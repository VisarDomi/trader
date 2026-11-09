import{expect,test}from'bun:test';
import{readFileSync}from'node:fs';
import{runInNewContext}from'node:vm';
const report=JSON.parse(readFileSync(new URL('../../static/night-lab/report.json',import.meta.url),'utf8'));
test('published study has all twenty members and all 648 bounded risk settings',()=>{
 expect(report.cohort).toHaveLength(20);expect(report.cohort.filter((r:any)=>r.epic==='US500')).toHaveLength(10);expect(report.cohort.filter((r:any)=>r.epic==='US100')).toHaveLength(10);
 for(const inst of report.instruments){expect(inst.runs).toHaveLength(324);expect(new Set(inst.runs.map((r:any)=>r.policy+'/'+r.profile)).size).toBe(324);expect(inst.runs.every((r:any)=>r.lossPct>0&&r.lossPct<=50)).toBe(true)}
 const b=report.benchmarks.US100;expect(b.exposure).toBe(1);expect(b.funding).toBe(0);expect(b.returnPct).toBeCloseTo((b.exitBid/b.entryAsk-1)*100,10);
 expect(report.stocks.matched+report.stocks.missing.length).toBe(101);
 const sum=report.stocks.rows.filter((r:any)=>r.usdMatched).reduce((n:number,r:any)=>n+r.minimumNotional,0);expect(sum).toBeCloseTo(report.stocks.partialCFDFloor,8);
 expect(report.stocks.rows.filter((r:any)=>r.usdMatched).every((r:any)=>r.currency==='USD'&&r.lotSize===1)).toBe(true);
});
test('offline worker preserves the last complete cohort, marks it saved, and ignores unrelated paths',async()=>{
 const listeners=new Map<string,Function>(),saved=new Map<string,Response>();
 let fail=false,incomplete=false;
 const cache={match:async(r:Request)=>saved.get(r.url)?.clone(),put:async(r:Request,v:Response)=>saved.set(r.url,v.clone())};
 const scope={URL,Response,caches:{open:async()=>cache},fetch:async()=>{if(fail)throw Error('Offline');return Response.json({schema:2,at:123,rows:Array.from({length:incomplete?19:20},()=>({}))})},self:{location:{origin:'https://trader.invalid'},registration:{scope:'https://trader.invalid/night-lab/'},addEventListener:(name:string,fn:Function)=>listeners.set(name,fn)}};
 runInNewContext(readFileSync(new URL('../../../../ops/lab/night-lab-sw.js',import.meta.url),'utf8'),scope);
 async function request(path:string,method='GET'){let response:Promise<Response>|undefined;listeners.get('fetch')!({request:new Request('https://trader.invalid'+path,{method}),respondWith:(r:Promise<Response>)=>response=r});return response?await(await response).json():null}
 expect(await request('/api/native/v1/leaderboard')).toBeNull();expect(await request('/night-lab/forward.json','POST')).toBeNull();
 expect((await request('/night-lab/forward.json')).rows).toHaveLength(20);
 incomplete=true;expect((await request('/night-lab/forward.json')).offline).toBe(true);
 fail=true;const old=await request('/night-lab/forward.json');expect(old.rows).toHaveLength(20);expect(old.at).toBe(123);expect(old.offline).toBe(true);expect(saved.size).toBe(1);
});
