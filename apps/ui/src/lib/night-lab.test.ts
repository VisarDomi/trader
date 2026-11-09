import{expect,test}from'bun:test';
import{readFileSync}from'node:fs';
import{runInNewContext}from'node:vm';
const report=JSON.parse(readFileSync(new URL('../../static/night-lab/report.json',import.meta.url),'utf8'));
test('all session/gap/risk combinations are rendered together without a reveal control',()=>{
 const template=readFileSync(new URL('../../../../ops/lab/night-lab-template.html',import.meta.url),'utf8');
 const cell=template.slice(template.indexOf('function cell('),template.indexOf('\n__STUDY_SCRIPT__'));
 const view=readFileSync(new URL('../../../../ops/lab/night-lab-study-view.js',import.meta.url),'utf8');
 const scope:any={D:report,esc:String,pct:(v:any)=>String(v),tone:()=>'',f:String,money:String,time:String,stat:()=>''};
 runInNewContext(cell+'\n'+view+'\nthis.rendered=exitFocus()+studyOverview()+D.instruments.map(instrumentView).join(\'\');',scope,{timeout:10000});
 expect((scope.rendered.match(/class="cell"/g)||[])).toHaveLength(20736);
 expect((scope.rendered.match(/class="gap-panel"/g)||[])).toHaveLength(48);
 expect((scope.rendered.match(/id="curve-/g)||[])).toHaveLength(192);
 expect(scope.rendered).not.toMatch(/<select|<details|\shidden[\s>]/);
 for(const gap of [0,5,15,30])expect((scope.rendered.match(new RegExp('data-gap="'+gap+'"','g'))||[])).toHaveLength(12);
 for(const target of [0,20,50,100])expect((scope.rendered.match(new RegExp('data-profit="'+target+'"','g'))||[])).toHaveLength(12);
 const html=readFileSync(new URL('../../static/night-lab/index.html',import.meta.url),'utf8');
 const packed=html.split('id="data">')[1]!.split('</script>')[0]!;
 const embedded=JSON.parse(Buffer.from(Bun.gunzipSync(Buffer.from(packed,'base64'))).toString());
 const compact:any={...scope,D:embedded};
 runInNewContext(cell+'\n'+view+'\nthis.rendered=exitFocus()+studyOverview()+D.instruments.map(instrumentView).join(\'\');',compact,{timeout:10000});
 expect(compact.rendered).toBe(scope.rendered);
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
test('expanded study retains the twenty-member cohort and original 648 bounded risk settings',()=>{
 expect(report.cohort).toHaveLength(20);expect(report.cohort.filter((r:any)=>r.epic==='US500')).toHaveLength(10);expect(report.cohort.filter((r:any)=>r.epic==='US100')).toHaveLength(10);
 for(const inst of report.instruments){expect(inst.runs).toHaveLength(324);expect(new Set(inst.runs.map((r:any)=>r.policy+'/'+r.profile)).size).toBe(324);expect(inst.runs.every((r:any)=>r.lossPct>0&&r.lossPct<=50)).toBe(true)}
 const b=report.benchmarks.US100;expect(b.exposure).toBe(1);expect(b.funding).toBe(0);expect(b.returnPct).toBeCloseTo((b.exitBid/b.entryAsk-1)*100,10);
 expect(report.stocks.matched+report.stocks.missing.length).toBe(101);
 const sum=report.stocks.rows.filter((r:any)=>r.usdMatched).reduce((n:number,r:any)=>n+r.minimumNotional,0);expect(sum).toBeCloseTo(report.stocks.partialCFDFloor,8);
 expect(report.stocks.rows.filter((r:any)=>r.usdMatched).every((r:any)=>r.currency==='USD'&&r.lotSize===1)).toBe(true);
});
test('all strategies use the hold benchmark of their own instrument',()=>{
 for(const inst of report.instruments){
  const hold=report.benchmarks[inst.epic];
  expect(hold.exposure).toBe(1);expect(hold.funding).toBe(0);
  for(const r of inst.runs){expect(r.benchmarkEpic).toBe(inst.epic);expect(r.benchmarkExcessPp).toBeCloseTo(r.returnPct-hold.returnPct,10)}
 }
 for(const r of report.cohort){expect(r.benchmarkEpic).toBe(r.epic);expect(r.benchmarkExcessPp).toBeCloseTo(r.metrics.totalReturn*100-report.benchmarks[r.epic].returnPct,10)}
 const original=report.cohort.find((r:any)=>r.id==='visar-night-trading');
 expect(original.benchmarkExcessPp).not.toBeCloseTo(original.metrics.totalReturn*100-report.benchmarks.US100.returnPct,5);
});
test('session and minimum-gap dimensions retain the original 5184 deadline controls',()=>{
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
test('all capital-profit cases retain their own hold benchmark and reconcile every close reason',()=>{
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
test('trade context has strict opposite-side bid gaps, honest event timing and the correct recognition window',()=>{
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
test('offline worker preserves the last complete cohort, marks it saved, and ignores unrelated paths',async()=>{
 const listeners=new Map<string,Function>(),saved=new Map<string,Response>();
 const wire=report.cohort.map((r:any)=>({agentId:r.id,codeHash:r.codeHash,epic:r.epic,leverage:r.leverage}));
 let fail=false,incomplete=false,wrongVersion=false;
 const cache={match:async(r:Request)=>saved.get(r.url)?.clone(),put:async(r:Request,v:Response)=>saved.set(r.url,v.clone())};
 const scope={URL,Request,Response,caches:{open:async()=>cache},fetch:async()=>{if(fail)throw Error('Offline');return Response.json({schema:3,at:123,rows:wire.slice(0,incomplete?19:20).map((r:any)=>wrongVersion?{...r,codeHash:'old'}:r)})},self:{location:{origin:'https://trader.invalid'},registration:{scope:'https://trader.invalid/night-lab/'},addEventListener:(name:string,fn:Function)=>listeners.set(name,fn)}};
 runInNewContext(readFileSync(new URL('../../static/night-lab/sw.js',import.meta.url),'utf8'),scope);
 async function request(path:string,method='GET'){let response:Promise<Response>|undefined;listeners.get('fetch')!({request:new Request('https://trader.invalid'+path,{method}),respondWith:(r:Promise<Response>)=>response=r});return response?await(await response).json():null}
 expect(await request('/api/native/v1/leaderboard')).toBeNull();expect(await request('/night-lab/forward.json','POST')).toBeNull();
 expect((await request('/night-lab/forward.json')).rows).toHaveLength(20);
 incomplete=true;expect((await request('/night-lab/forward.json')).offline).toBe(true);incomplete=false;wrongVersion=true;expect((await request('/night-lab/forward.json')).offline).toBe(true);
 fail=true;const old=await request('/night-lab/forward.json');expect(old.rows).toHaveLength(20);expect(old.at).toBe(123);expect(old.offline).toBe(true);expect(saved.size).toBe(1);
});
test('a bookmarked minimum-gap URL restores the same offline report without growing the static cache',async()=>{
 const listeners=new Map<string,Function>(),saved=new Map<string,Response>();let offline=false;
 saved.set('https://trader.invalid/night-lab/index.html',new Response('cached study'));
 const cache={match:async(r:Request)=>saved.get(r.url)?.clone(),put:async(r:Request,v:Response)=>saved.set(r.url,v.clone())};
 const scope={URL,Request,Response,caches:{open:async()=>cache},fetch:async(r:Request)=>{if(offline)throw Error('Offline');const response=new Response('latest study');Object.defineProperty(response,'url',{value:r.url});return response},self:{location:{origin:'https://trader.invalid'},registration:{scope:'https://trader.invalid/night-lab/'},addEventListener:(n:string,fn:Function)=>listeners.set(n,fn)}};
 runInNewContext(readFileSync(new URL('../../static/night-lab/sw.js',import.meta.url),'utf8'),scope);
 async function get(gap:number){let response:Promise<Response>|undefined;listeners.get('fetch')!({request:new Request('https://trader.invalid/night-lab/index.html?gap='+gap),respondWith:(r:Promise<Response>)=>response=r});return (await response!).text()}
 expect(await get(5)).toBe('latest study');offline=true;expect(await get(30)).toBe('latest study');expect(saved.size).toBe(1);
});
