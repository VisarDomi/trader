import{afterAll,expect,test}from'bun:test';
import{mkdtempSync,rmSync,renameSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{spawnSync}from'node:child_process';
import{gunzipSync,brotliDecompressSync}from'node:zlib';
import{NightLab,NightLabMissing,NightLabNotFound,encoding,prepare,respond}from'./night-lab';

const ROOT=new URL('../../../../../',import.meta.url).pathname,dir=mkdtempSync(join(tmpdir(),'night-lab-'));
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
/** A small report written by the lab's own writer (ops/lab/test_night_lab_db.py builds it). */
function fixture(path:string,weight=0.1){
 const r=spawnSync('python3',['-c',`import sys;sys.path.insert(0,'${ROOT}ops/lab');import night_lab_db as nl,test_night_lab_db as t
r=t.report();r['stocks']['rows'][0]['weight']=${weight};print(nl.write(r,[('trades.csv','text/csv',b'a,b\\n1,2\\n')],sys.argv[1],'fixture'))`,path],{encoding:'utf8'});
 if(r.status)throw Error(r.stderr);return r.stdout.trim();
}
const body=(p:{body:Buffer})=>JSON.parse(p.body.toString());

test('sections come from the database; settings carry their window, gap and exit',()=>{
 const path=join(dir,'a.db'),version=fixture(path),lab=new NightLab(path);
 const s=body(lab.summary());
 expect(s.version).toBe(version);expect(s.cohort[0].x).toBe('é');expect(s.benchmarks.US500.equity).toHaveLength(2);
 const us500=s.instruments[0],row=(t:any,i:number)=>Object.fromEntries(t.fields.map((f:string,k:number)=>[f,t.rows[i][k]]));
 // Summary: every 1:20 /20% setting (with payoff and year columns), nothing else for this fixture.
 expect(us500.runs.rows.map((_:unknown,i:number)=>row(us500.runs,i)).map((r:any)=>[r.sessionWindow,r.minimumGapBp,r.profitPct,r.profile]).sort())
  .toEqual([['central',0,0,'L20S20'],['central',0,20,'L20S20'],['central',5,0,'L20S20'],['full',0,0,'L20S20'],['full',0,20,'L20S20'],['full',5,0,'L20S20']]);
 expect(row(us500.runs,us500.runs.rows.findIndex((r:any)=>r[0]==='full'&&r[1]===0&&r[2]===0)).years).toEqual({'2024':{n:1}});
 // A policy section: the other profiles, and every 1:20 /20% curve keyed window/gap/exit.
 const p=body(lab.policy('US500','current'));
 expect(p.runs.rows.map((_:unknown,i:number)=>row(p.runs,i).profile)).toEqual(['L1S50','L1S50']);expect(p.runs.fields).not.toContain('years');
 expect(Object.keys(p.curves).sort()).toEqual(['central/0/0','central/0/20','central/5/0','full/0/0','full/0/20','full/5/0']);
 expect(body(lab.ledger('US500','central')).trades.map((t:any)=>t.id)).toEqual([2]);
 expect(()=>lab.policy('US500','nope')).toThrow(NightLabNotFound);expect(()=>lab.ledger('US999','full')).toThrow(NightLabNotFound);
 // Built once per version: the same prepared response is reused.
 expect(lab.policy('US500','current')).toBe(lab.policy('US500','current'));
 lab.close();
});

test('a republished file is picked up and a missing one is reported, not crashed on',()=>{
 const path=join(dir,'b.db');let t=0;
 const lab=new NightLab(path,2000,()=>t);
 expect(()=>lab.summary()).toThrow(NightLabMissing);
 const v1=fixture(path);t+=2000;expect(lab.version).toBe(v1);const first=lab.summary();
 const v2=fixture(join(dir,'next.db'),0.2);renameSync(join(dir,'next.db'),path);
 expect(lab.version).toBe(v1);t+=2000;expect(lab.version).toBe(v2);expect(v2).not.toBe(v1);
 expect(lab.summary()).not.toBe(first);expect(body(lab.stocks()).stocks.rows[0].weight).toBe(.2);
 lab.close();
});

test('responses are compressed once, negotiated per client, and revalidate with 304',async()=>{
 const p=prepare({a:'x'.repeat(5000)},'v1'),req=(h:Record<string,string>)=>new Request('https://t/x',{headers:h});
 expect(encoding('gzip, deflate, br')).toBe('br');expect(encoding('gzip;q=1, br;q=0')).toBe('gzip');expect(encoding('identity')).toBeNull();expect(encoding(null)).toBeNull();
 const br=await respond(req({'accept-encoding':'br'}),p,'private, no-cache');
 expect(br.headers.get('content-encoding')).toBe('br');expect(JSON.parse(brotliDecompressSync(Buffer.from(await br.arrayBuffer())).toString()).a).toHaveLength(5000);
 const again=await respond(req({'accept-encoding':'br'}),p,'private, no-cache');expect((await again.arrayBuffer()).byteLength).toBeLessThan(200);
 const plain=await respond(req({}),p,'private, no-cache');expect(plain.headers.get('content-encoding')).toBeNull();expect((await plain.json()).a).toHaveLength(5000);
 expect((await respond(req({'if-none-match':p.etag}),p,'private, no-cache')).status).toBe(304);
});

test('downloads keep their names and bytes; gzip is stored once and inflated only for clients without it',async()=>{
 const path=join(dir,'c.db');fixture(path);const lab=new NightLab(path);
 const gz=await lab.respondExport(new Request('https://t/night-lab/trades.csv',{headers:{'accept-encoding':'gzip, br'}}),'trades.csv');
 expect(gz.headers.get('content-encoding')).toBe('gzip');expect(gz.headers.get('content-type')).toBe('text/csv; charset=utf-8');
 expect(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString()).toBe('a,b\n1,2\n');
 const raw=await lab.respondExport(new Request('https://t/night-lab/trades.csv'),'trades.csv');expect(await raw.text()).toBe('a,b\n1,2\n');
 const report=await lab.respondExport(new Request('https://t/night-lab/report.json'),'report.json');expect((await report.json()).caseCount).toBe(4);
 expect((await lab.respondExport(new Request('https://t/x',{headers:{'if-none-match':gz.headers.get('etag')!}}),'trades.csv')).status).toBe(304);
 await expect(lab.respondExport(new Request('https://t/x'),'secrets.env')).rejects.toThrow(NightLabNotFound);
 lab.close();
});
