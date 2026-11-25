import{expect,test}from'bun:test';
import{readFileSync}from'node:fs';
import{createContext,runInContext}from'node:vm';
import summary from'./server/night-lab-summary.json';
import cohortKeys from'./server/night-lab-cohort.json';

function page(){
 const js=readFileSync(new URL('../../static/night-lab/night-lab.js',import.meta.url),'utf8');
 const slice=(from:string,to:string)=>js.slice(js.indexOf(from),js.indexOf(to));
 const ctx=createContext({D:summary,document:{}});
 runInContext(slice('const $=id=>','let gridData'),ctx,{timeout:10000});
 return ctx;
}

test('Night Lab renders NY-clock benchmarks, cohort, direction controls and rules without Tirana clocks',()=>{
 const ctx=page();
 const html=ctx.benchmarks()+ctx.cohort()+ctx.directionControls()+ctx.rulesSection();
 expect(html).toContain('US500 1:1 hold');
 expect(html).toContain('US100 1:1 hold');
 expect((html.match(/data-agent=/g)||[])).toHaveLength(20);
 expect((html.match(/data-direction-control=/g)||[])).toHaveLength(6);
 expect(html).toContain('21:27');
 expect(html).toContain('02:27');
 expect(html).not.toMatch(/Tirana|Albania|03:27|08:27|22:00/i);
 expect(html).not.toContain('undefined');
});

test('the twenty-member cohort matches night-lab-cohort.json, uses own-index benchmarks and is one designed change from its base',()=>{
 expect(summary.cohort).toHaveLength(20);
 expect(summary.cohort.filter(r=>r.epic==='US500')).toHaveLength(10);
 expect(summary.cohort.filter(r=>r.epic==='US100')).toHaveLength(10);
 expect(summary.cohort.map(({id,codeHash,epic,leverage})=>({id,codeHash,epic,leverage}))).toEqual(cohortKeys);
 expect(new Set(summary.cohort.map(r=>r.minimumGapBp))).toEqual(new Set([0,null]));
 expect(new Set(summary.cohort.map(r=>r.profitPct))).toEqual(new Set([0]));
 expect(summary.cohort.every(r=>r.lossPct===50)).toBe(true);
 for(const epic of ['US500','US100'] as const){
  const hold=summary.benchmarks[epic];
  expect(hold.exposure).toBe(1);expect(hold.funding).toBe(0);
  expect(hold.returnPct).toBeCloseTo((hold.exitBid/hold.entryAsk-1)*100,10);
  const base=summary.cohort.find(r=>r.epic===epic&&r.role==='base')!;
  for(const r of summary.cohort.filter(r=>r.epic===epic)){
   expect(r.benchmarkEpic).toBe(epic);
   expect(r.benchmarkExcessPp).toBeCloseTo(r.metrics.totalReturn*100-hold.returnPct,10);
   if(r.role==='base')continue;
   const changed=(Object.keys(base.coordinates) as (keyof typeof base.coordinates)[]).filter(k=>base.coordinates[k]!==r.coordinates[k]);
   expect(changed.length).toBe(r.comparesWith?.endsWith('/midday-200')||r.id.endsWith('/every-night-20')?2:1);
  }
 }
 const controls=summary.cohort.filter(r=>r.role==='control');
 expect(controls).toHaveLength(4);
 for(const c of controls){
  const partner=summary.cohort.find(r=>r.id===c.partner&&r.epic===c.epic)!;
  expect(partner.metrics.trades).toBe(c.metrics.trades);
  expect({...c.params,direction:undefined}).toEqual({...partner.params,direction:undefined});
 }
});

const sw=readFileSync(new URL('../../static/night-lab/sw.js',import.meta.url),'utf8');
const ORIGIN='https://trader.invalid',SCOPE=ORIGIN+'/night-lab/';
function worker(network:(url:string)=>Response|Promise<Response>){
 const listeners=new Map<string,Function>(),stores=new Map<string,Map<string,Response>>();
 const open=async(name:string)=>{let m=stores.get(name);if(!m)stores.set(name,m=new Map());const key=(r:Request|string)=>typeof r==='string'?r:r.url;
  return {match:async(r:Request|string)=>m.get(key(r))?.clone(),put:async(r:Request|string,v:Response)=>{m.set(key(r),v.clone())},keys:async()=>[...m.keys()].map(u=>new Request(u)),delete:async(r:Request|string)=>m.delete(key(r)),addAll:async(requests:Request[])=>{for(const r of requests){expect(r.cache).toBe('reload');m.set(new URL(r.url,SCOPE).href,new Response('shell'))}}}};
 const scope={URL,Request:class extends Request{constructor(u:string|Request,init?:RequestInit){super(typeof u==='string'?new URL(u,SCOPE).href:u,init)}},Response,Set,JSON,caches:{open,keys:async()=>[...stores.keys()],delete:async(n:string)=>stores.delete(n)},
  fetch:async(r:Request|string)=>{const res=await network(typeof r==='string'?r:r.url);if(!res.url)Object.defineProperty(res,'url',{value:typeof r==='string'?r:r.url});return res},
  self:{location:{origin:ORIGIN},registration:{scope:SCOPE},addEventListener:(n:string,fn:Function)=>listeners.set(n,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
 createContext(scope);runInContext(sw,scope);
 async function get(path:string,method='GET'){let response:Promise<Response>|undefined;listeners.get('fetch')!({request:new Request(ORIGIN+path,{method}),respondWith:(r:Promise<Response>)=>response=r});return response?await response:null}
 async function lifecycle(name:string){let done:Promise<unknown>=Promise.resolve();listeners.get(name)!({waitUntil:(p:Promise<unknown>)=>done=p});await done}
 return {get,lifecycle,stores};
}
const cohortRows=[{id:'visar-night/full-day-200',codeHash:'h1',epic:'US500',leverage:200},{id:'visar-night/full-day-200',codeHash:'h1',epic:'US100',leverage:200}];

test('offline worker keeps the last complete forward cohort and ignores unrelated paths',async()=>{
 let fail=false,incomplete=false,wrongVersion=false;
 const wire=cohortRows.map(r=>({agentId:r.id,codeHash:r.codeHash,epic:r.epic,leverage:r.leverage}));
 const w=worker(url=>{if(fail)throw Error('Offline');if(url.endsWith('summary.json'))return Response.json({schema:2,cohort:cohortRows});
  return Response.json({schema:3,at:123,rows:wire.slice(0,incomplete?1:2).map(r=>wrongVersion?{...r,codeHash:'old'}:r)})});
 expect(await w.get('/api/native/v1/leaderboard')).toBeNull();expect(await w.get('/night-lab/forward.json','POST')).toBeNull();
 await w.get('/night-lab/data/summary.json');
 expect((await (await w.get('/night-lab/forward.json'))!.json()).rows).toHaveLength(2);
 incomplete=true;expect((await (await w.get('/night-lab/forward.json'))!.json()).offline).toBe(true);incomplete=false;
 wrongVersion=true;expect((await (await w.get('/night-lab/forward.json'))!.json()).offline).toBe(true);wrongVersion=false;
 fail=true;const old=await (await w.get('/night-lab/forward.json'))!.json();expect(old.rows).toHaveLength(2);expect(old.at).toBe(123);expect(old.offline).toBe(true);
});

test('activation removes older Night Lab caches and restores the shell offline',async()=>{
 let offline=false;const w=worker(()=>{if(offline)throw Error('Offline');return new Response('latest study')});
 for(const old of ['night-lab-shell-v1','night-lab-shell-v2','night-lab-data-v2','night-lab-study-391e1be551bd','unrelated'])w.stores.set(old,new Map([['x',new Response('old')]]));
 await w.lifecycle('install');await w.lifecycle('activate');
 expect([...w.stores.keys()].sort()).toEqual(['night-lab-shell-v3','unrelated']);
 expect(await (await w.get('/night-lab/index.html?x=1'))!.text()).toBe('latest study');offline=true;
 expect(await (await w.get('/night-lab/index.html?x=2'))!.text()).toBe('latest study');expect(w.stores.get('night-lab-shell-v3')!.size).toBe(5);
});
