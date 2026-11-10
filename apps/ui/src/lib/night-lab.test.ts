import{expect,test}from'bun:test';
import{existsSync,readFileSync}from'node:fs';
import{spawnSync}from'node:child_process';
import{createContext,runInContext}from'node:vm';
import{NightLab}from'./server/night-lab';
const ROOT=new URL('../../../../',import.meta.url).pathname;
// The lab's published database (ops/lab/night_lab_db.py). Data checks need it; it is not in git.
const DB=process.env.NIGHT_LAB_DB??ROOT+'apps/backend/data/night-lab/night-lab.db';
const data=test.skipIf(!existsSync(DB));
// The complete report, rebuilt from the database exactly as /night-lab/report.json serves it.
const report=existsSync(DB)?JSON.parse(spawnSync('python3',[ROOT+'ops/lab/night_lab_db.py','report',DB],{encoding:'utf8',maxBuffer:1<<26}).stdout):null;
const json=(p:{body:Buffer})=>JSON.parse(p.body.toString());

/** The page's own rendering code (static/night-lab/night-lab.js) in a sandbox, fed from the server's views. */
function page(lab:NightLab){
 const js=readFileSync(new URL('../../static/night-lab/night-lab.js',import.meta.url),'utf8');
 const slice=(from:string,to:string)=>js.slice(js.indexOf(from),js.indexOf(to));
 const D=json(lab.summary()),ctx=createContext({D,document:{}});
 runInContext(slice('const RUNS=new Map()','for(const inst of D.instruments)addRuns')+slice('const $=id=>','let gridData')+slice('function stockSection()','let html=`')
  +'\nfor(const inst of D.instruments)addRuns(inst.epic,inst.runs);Object.assign(this,{RUNS,CURVES,LEDGERS,addRuns});',ctx,{timeout:10000});
 const load=()=>{
  for(const inst of D.instruments)for(const p of inst.spec.policies){const d=json(lab.policy(inst.epic,p.id));ctx.addRuns(inst.epic,d.runs);ctx.CURVES.set(inst.epic+'/'+p.id,d.curves)}
  for(const inst of D.instruments)for(const w of ['full','central'])ctx.LEDGERS.set(inst.epic+'/'+w,json(lab.ledger(inst.epic,w)).trades);
  D.stocks=json(lab.stocks()).stocks;
 };
 return {D,ctx,load};
}

data('first paint needs only the summary; every section placeholder names its own data',()=>{
 const lab=new NightLab(DB),{D,ctx}=page(lab);
 expect(lab.summary().body.length).toBeLessThan(400_000);
 // Exit mix and the dimension overview render from the summary alone.
 const top=ctx.exitFocus()+ctx.studyOverview();
 expect((top.match(/data-exit-mix=/g)||[])).toHaveLength(16);expect(top).not.toContain('undefined');
 const sections=D.instruments.map((i:any)=>ctx.instrumentView(i)).join('');
 expect((sections.match(/data-section="policy\//g)||[])).toHaveLength(12);
 expect((sections.match(/data-section="ledger\//g)||[])).toHaveLength(4);
 expect(sections).not.toMatch(/<select|<details|\shidden[\s>]/);
 lab.close();
});

data('all session/gap/risk combinations render once their sections load, without a reveal control',()=>{
 const lab=new NightLab(DB),{D,ctx,load}=page(lab);load();
 const rendered=ctx.exitFocus()+ctx.studyOverview()+D.instruments.flatMap((inst:any)=>inst.spec.policies.map((p:any)=>ctx.policyView(inst,p))).join('');
 expect((rendered.match(/class="cell"/g)||[])).toHaveLength(20736);
 expect((rendered.match(/class="gap-panel"/g)||[])).toHaveLength(48);
 expect((rendered.match(/id="curve-/g)||[])).toHaveLength(192);
 expect(rendered).not.toMatch(/<select|<details|\shidden[\s>]/);
 for(const gap of [0,5,15,30])expect((rendered.match(new RegExp('data-gap="'+gap+'"','g'))||[])).toHaveLength(12);
 for(const target of [0,20,50,100])expect((rendered.match(new RegExp('data-profit="'+target+'"','g'))||[])).toHaveLength(12);
 // Every chart has both NY windows for every policy, gap and exit.
 for(const inst of D.instruments)for(const p of inst.spec.policies)expect(Object.keys(ctx.CURVES.get(inst.epic+'/'+p.id)).length).toBe(32);
 const ledgers=D.instruments.map((i:any)=>ctx.ledger(i,'full')+ctx.ledger(i,'central')).join('');
 expect((ledgers.match(/class="spark"/g)||[])).toHaveLength(report.trades.US500.length+report.trades['US500-central'].length+report.trades.US100.length+report.trades['US100-central'].length);
 expect(ctx.stockSection()).toContain('id="stocks"');
 // The views carry exactly the published cohort and hold benchmarks.
 expect(D.cohort).toEqual(report.cohort);expect(D.benchmarks).toEqual(report.benchmarks);
 lab.close();
});

data('the twenty-member v3 cohort is one designed change from its base',()=>{
 // v3: ten designed directions per index around one base, plus the original record.
 const v3=report.cohort.filter((r:any)=>r.id.startsWith('visar-night-v3-'));expect(v3).toHaveLength(19);
 expect(new Set(report.cohort.map((r:any)=>r.minimumGapBp))).toEqual(new Set([0,5,15]));
 expect(new Set(report.cohort.map((r:any)=>r.profitPct))).toEqual(new Set([0]));
 expect(report.cohort.every((r:any)=>r.lossPct===50)).toBe(true);
 for(const epic of ['US500','US100']){
  const base=report.cohort.find((r:any)=>r.epic===epic&&r.role==='base');
  for(const r of report.cohort.filter((r:any)=>r.epic===epic&&r.role!=='base')){
   const changed=Object.keys(base.coordinates).filter(k=>base.coordinates[k]!==r.coordinates[k]);
   // One change from the base; the full-day 1:200 points (original, US100 full-day-200) are one change from leverage-200.
   expect(changed.length).toBe(r.comparesWith?.endsWith('/leverage-200')?2:1);
  }
 }
 // Direction controls: same nights as their base (equal trade counts), settings equal apart from the side.
 const controls=report.cohort.filter((r:any)=>r.role==='control');expect(controls).toHaveLength(4);
 for(const c of controls){const partner=report.cohort.find((r:any)=>r.id===c.partner);expect(partner.metrics.trades).toBe(c.metrics.trades);expect({...c.params,direction:undefined}).toEqual({...partner.params,direction:undefined})}
 const original=report.cohort.find((r:any)=>r.role==='original');expect(original.id).toBe('visar-night-trading');expect(original.name).toBe('US500 · original');
});

data('expanded study retains the twenty-member cohort and original 648 bounded risk settings',()=>{
 expect(report.cohort).toHaveLength(20);expect(report.cohort.filter((r:any)=>r.epic==='US500')).toHaveLength(10);expect(report.cohort.filter((r:any)=>r.epic==='US100')).toHaveLength(10);
 for(const inst of report.instruments){expect(inst.runs).toHaveLength(324);expect(new Set(inst.runs.map((r:any)=>r.policy+'/'+r.profile)).size).toBe(324);expect(inst.runs.every((r:any)=>r.lossPct>0&&r.lossPct<=50)).toBe(true)}
 const b=report.benchmarks.US100;expect(b.exposure).toBe(1);expect(b.funding).toBe(0);expect(b.returnPct).toBeCloseTo((b.exitBid/b.entryAsk-1)*100,10);
 expect(report.stocks.matched+report.stocks.missing.length).toBe(101);
 const sum=report.stocks.rows.filter((r:any)=>r.usdMatched).reduce((n:number,r:any)=>n+r.minimumNotional,0);expect(sum).toBeCloseTo(report.stocks.partialCFDFloor,8);
 expect(report.stocks.rows.filter((r:any)=>r.usdMatched).every((r:any)=>r.currency==='USD'&&r.lotSize===1)).toBe(true);
});
data('all strategies use the hold benchmark of their own instrument',()=>{
 for(const inst of report.instruments){
  const hold=report.benchmarks[inst.epic];
  expect(hold.exposure).toBe(1);expect(hold.funding).toBe(0);
  for(const r of inst.runs){expect(r.benchmarkEpic).toBe(inst.epic);expect(r.benchmarkExcessPp).toBeCloseTo(r.returnPct-hold.returnPct,10)}
 }
 for(const r of report.cohort){expect(r.benchmarkEpic).toBe(r.epic);expect(r.benchmarkExcessPp).toBeCloseTo(r.metrics.totalReturn*100-report.benchmarks[r.epic].returnPct,10)}
 const original=report.cohort.find((r:any)=>r.id==='visar-night-trading');
 expect(original.benchmarkExcessPp).not.toBeCloseTo(original.metrics.totalReturn*100-report.benchmarks.US100.returnPct,5);
});
data('session and minimum-gap dimensions retain the original 5184 deadline controls',()=>{
 expect(report.caseCount).toBe(20736);expect(report.gapThresholds).toEqual([0,5,15,30]);let count=0;
 for(const inst of report.instruments){
  expect(inst.central.runs).toHaveLength(324);
  const rows=[...inst.runs.map((r:any)=>({...r,sessionWindow:'full',minimumGapBp:0})),...inst.central.runs.map((r:any)=>({...r,sessionWindow:'central',minimumGapBp:0}))];
  for(const window of ['full','central']){const s=inst.gapStudy.sessions[window];expect(s.audit.allControlsExact).toBe(true);expect(s.audit.exactControls).toBe(324);expect(s.runs).toHaveLength(972);rows.push(...s.runs)}
  expect(new Set(rows.map((r:any)=>[r.sessionWindow,r.minimumGapBp,r.policy,r.profile].join('|'))).size).toBe(2592);
  for(const r of rows){expect(r.benchmarkEpic).toBe(inst.epic);expect(r.benchmarkExcessPp).toBeCloseTo(r.returnPct-report.benchmarks[inst.epic].returnPct,10)}count+=rows.length;
 }
 expect(count).toBe(5184);expect(report.trades.US500).toHaveLength(71);expect(report.trades.US100).toHaveLength(60);
});
data('all capital-profit cases retain their own hold benchmark and reconcile every close reason',()=>{
 expect(report.takeProfitTargets).toEqual([0,20,50,100]);let count=5184;
 for(const inst of report.instruments){
  expect(inst.exitStudy.audit.deadlineControls).toBe(2592);expect(inst.exitStudy.audit.allDeadlineControlsExact).toBe(true);
  expect(inst.exitStudy.runs).toHaveLength(7776);
  expect(new Set(inst.exitStudy.runs.map((r:any)=>[r.sessionWindow,r.minimumGapBp,r.profitPct,r.policy,r.profile].join('|'))).size).toBe(7776);
  for(const r of inst.exitStudy.runs){expect(r.benchmarkEpic).toBe(inst.epic);expect(r.benchmarkExcessPp).toBeCloseTo(r.returnPct-report.benchmarks[inst.epic].returnPct,10);expect(r.targetHits+r.stops+r.deadlineExits+r.otherExits).toBe(r.n);expect(r.funding).toBe(0)}
  count+=inst.exitStudy.runs.length;
 }
 expect(count).toBe(20736);
});
data('trade context has strict opposite-side bid gaps, honest event timing and the correct recognition window',()=>{
 const clock=(t:number)=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(t));
 for(const inst of report.instruments){
  for(const window of ['full','central']){
   const sets=[report.trades[inst.epic+(window==='central'?'-central':'')],...Object.values(inst.gapStudy.sessions[window].trades)]as any[][];
   for(const rows of sets)for(const t of rows){
    const gap=(t.side==='long'?t.reference-t.signalBid:t.signalBid-t.reference)/t.reference*10000;
    expect(gap).toBeGreaterThan(0);expect(gap).toBeGreaterThanOrEqual(t.minimumGapBp);expect(t.pullbackBp).toBeCloseTo(gap,8);
    expect(t.recognitionPoints).toHaveLength(window==='central'?21:27);expect(t.intervals).toBe(window==='central'?20:26);
    expect(clock(t.recognitionFrom)).toBe(window==='central'?'10:30':'09:30');expect(clock(t.recognitionThrough)).toBe(window==='central'?'15:30':'16:00');
    for(const e of t.events){const source=report.events.events.find((x:any)=>x.id===e.id);expect(source.sessionDate).toBe(t.session);expect(source.policyGuard??false).toBe(false);if(source.reportedAt)expect(e.knownAtEntry).toBe(Date.parse(source.reportedAt)<=t.entryTime)}
   }
  }
 }
 expect(report.events.taggedSessionShare).toBeLessThanOrEqual(.15);expect(report.events.taggedSessionShare).toBeGreaterThan(0);
});

const sw=readFileSync(new URL('../../static/night-lab/sw.js',import.meta.url),'utf8');
const ORIGIN='https://trader.invalid',SCOPE=ORIGIN+'/night-lab/';
/** The worker in a sandbox with an in-memory Cache Storage and a scripted network. */
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
const cohortRows=[{id:'a',codeHash:'h1',epic:'US500',leverage:20},{id:'b',codeHash:'h2',epic:'US100',leverage:200}];
const summary=(version:string)=>Response.json({schema:1,version,cohort:cohortRows});

test('offline worker keeps the last complete forward cohort of the saved report and ignores unrelated paths',async()=>{
 let fail=false,incomplete=false,wrongVersion=false;
 const wire=cohortRows.map(r=>({agentId:r.id,codeHash:r.codeHash,epic:r.epic,leverage:r.leverage}));
 const w=worker(url=>{if(fail)throw Error('Offline');if(url.endsWith('summary.json'))return summary('0123456789abcdef');
  return Response.json({schema:3,at:123,rows:wire.slice(0,incomplete?1:2).map(r=>wrongVersion?{...r,codeHash:'old'}:r)})});
 expect(await w.get('/api/native/v1/leaderboard')).toBeNull();expect(await w.get('/night-lab/forward.json','POST')).toBeNull();
 await w.get('/night-lab/data/summary.json');
 expect((await (await w.get('/night-lab/forward.json'))!.json()).rows).toHaveLength(2);
 incomplete=true;expect((await (await w.get('/night-lab/forward.json'))!.json()).offline).toBe(true);incomplete=false;
 wrongVersion=true;expect((await (await w.get('/night-lab/forward.json'))!.json()).offline).toBe(true);wrongVersion=false;
 fail=true;const old=await (await w.get('/night-lab/forward.json'))!.json();expect(old.rows).toHaveLength(2);expect(old.at).toBe(123);expect(old.offline).toBe(true);
});

test('sections are kept per report version; a new summary drops older ones; downloads are never stored',async()=>{
 let version='0123456789abcdef',offline=false;const seen:string[]=[];
 const w=worker(url=>{seen.push(url);if(offline)throw Error('Offline');return url.endsWith('summary.json')?summary(version):Response.json({version,url})});
 await w.get('/night-lab/data/summary.json');
 const section=`/night-lab/data/${version}/policy/US500/current.json`;
 await w.get(section);await w.get(section);expect(seen.filter(u=>u.endsWith('current.json'))).toHaveLength(1);
 offline=true;expect((await (await w.get(section))!.json()).version).toBe('0123456789abcdef');
 expect((await (await w.get('/night-lab/data/summary.json'))!.json()).version).toBe('0123456789abcdef');
 expect((await w.get(`/night-lab/data/${version}/policy/US500/body80.json`))!.status).toBe(503);
 offline=false;version='fedcba9876543210';await w.get('/night-lab/data/summary.json');
 expect([...w.stores.get('night-lab-data-v1')!.keys()].filter(k=>k.includes('/policy/'))).toHaveLength(0);
 expect(await w.get('/night-lab/report.json')).toBeNull();expect(await w.get('/night-lab/us500-exit-risk-grid.csv')).toBeNull();
});

test('activation removes the earlier full-report caches; a bookmarked URL restores the shell offline without growing the cache',async()=>{
 let offline=false;const w=worker(url=>{if(offline)throw Error('Offline');return new Response('latest study')});
 for(const old of ['night-lab-study-391e1be551bd','night-lab-forward-v3-cf4d147e1bab','night-lab-grid-v1','unrelated'])w.stores.set(old,new Map([['x',new Response('36 MB')]]));
 await w.lifecycle('install');await w.lifecycle('activate');
 expect([...w.stores.keys()].sort()).toEqual(['night-lab-shell-v1','unrelated']);
 expect(await (await w.get('/night-lab/index.html?gap=5'))!.text()).toBe('latest study');offline=true;
 expect(await (await w.get('/night-lab/index.html?gap=30'))!.text()).toBe('latest study');expect(w.stores.get('night-lab-shell-v1')!.size).toBe(5);
});
