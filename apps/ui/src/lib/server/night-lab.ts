/**
 * Night Lab study results, served per page section from the lab's SQLite file
 * (ops/lab/night_lab_db.py writes it once per published report).
 *
 * The file lives in NIGHT_LAB_DB, else ./night-lab/night-lab.db next to the running build
 * (PC deploys copy that folder forward; nightly.sh republishes it when missing), else the
 * backend's data folder in dev. Nothing data-sized is in static/ or the UI build.
 *
 * Every response is built once per report version and kept compressed (gzip, and brotli when a
 * client asks for it). Section URLs carry the version, so browsers and the service worker can
 * keep them forever; only summary.json is revalidated (304 while the report is unchanged).
 */
import {existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {brotliCompress,constants,gunzip,gzip} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';

export const NIGHT_LAB_SCHEMA=1;
export const NIGHT_LAB_FILE='night-lab.db';
export const EPICS=['US500','US100'] as const;
export const WINDOWS=['full','central'] as const;
/** The profile every dimension summary, curve, payoff and year table uses; sent with the summary. */
export const SUMMARY_PROFILE='L20S20';
/** The exit-mix bars use the original 1:200 /50% risk of the current day definition. */
export const EXIT_MIX={policy:'current',profile:'L200S50'};

export function nightLabDbPath(configured?:string):string{
  if(configured)return resolve(configured);
  const server=resolve('night-lab',NIGHT_LAB_FILE);
  return existsSync(server)?server:resolve('../backend/data/night-lab',NIGHT_LAB_FILE);
}

/** Fields a risk cell renders; the payoff and year columns only exist for the 1:20 /20% profile. */
const CELL_FIELDS=['sessionWindow','minimumGapBp','profitPct','policy','profile','leverage','lossPct','n','eligible','tradesPerYear','wins','winPct',
  'returnPct','maxDrawdownPct','worstTradePct','stops','rejected','targetHits','deadlineExits','otherExits'] as const;
const SUMMARY_FIELDS=[...CELL_FIELDS,'years','avgWinPct','avgLossPct','meanPct','meanSpreadPct','breakEvenWinPct','longestLossStreak'] as const;

export class NightLabMissing extends Error {}
export class NightLabNotFound extends Error {}

interface RunRow{session_window:string;gap_bp:number;profit_pct:number;policy:string;profile:string;record:string}
interface Table{fields:readonly string[];rows:unknown[][]}

function table(rows:RunRow[],fields:readonly string[]):Table{
  return {fields,rows:rows.map(r=>{
    const x=JSON.parse(r.record) as Record<string,unknown>;
    // The full-window and central baselines were published without these keys; the database knows them.
    x.sessionWindow=r.session_window;x.minimumGapBp=r.gap_bp;x.profitPct=r.profit_pct;
    return fields.map(f=>x[f]??null);
  })};
}

export interface Prepared{etag:string;body:Buffer;encoded:Map<string,Promise<Buffer>>}
const gzipAsync=promisify(gzip),brotliAsync=promisify(brotliCompress),gunzipAsync=promisify(gunzip);

export function prepare(value:unknown,tag:string):Prepared{
  const body=Buffer.from(JSON.stringify(value));
  return {etag:`"${tag}-${createHash('sha256').update(body).digest('hex').slice(0,16)}"`,body,encoded:new Map()};
}

export function accepts(accept:string|null,name:string):boolean{
  const offered=new Map((accept??'').split(',').map(part=>{const [coding,...params]=part.trim().toLowerCase().split(';');const q=params.find(p=>p.trim().startsWith('q='));return [coding.trim(),q?Number(q.trim().slice(2)):1] as const}));
  return (offered.get(name)??offered.get('*')??0)>0;
}
/** Picks brotli, then gzip, else identity; each encoding is computed once per prepared body. */
export function encoding(accept:string|null):'br'|'gzip'|null{
  return accepts(accept,'br')?'br':accepts(accept,'gzip')?'gzip':null;
}

function encoded(p:Prepared,kind:'br'|'gzip'):Promise<Buffer>{
  let out=p.encoded.get(kind);
  if(!out){
    out=kind==='br'
      ?brotliAsync(p.body,{params:{[constants.BROTLI_PARAM_MODE]:constants.BROTLI_MODE_TEXT,[constants.BROTLI_PARAM_QUALITY]:BROTLI_QUALITY,[constants.BROTLI_PARAM_SIZE_HINT]:p.body.length}})
      :gzipAsync(p.body,{level:9});
    p.encoded.set(kind,out);
    out.catch(()=>p.encoded.delete(kind));
  }
  return out;
}
/** Measured over every section (4.0 MB of JSON): quality 9 gives 343 KB in 0.27 s of CPU, quality 11 gives 267 KB in 6.7 s. */
export const BROTLI_QUALITY=9;

export async function respond(request:Request,p:Prepared,cacheControl:string,contentType='application/json; charset=utf-8'):Promise<Response>{
  const headers=new Headers({'content-type':contentType,'cache-control':cacheControl,etag:p.etag,vary:'accept-encoding'});
  if(request.headers.get('if-none-match')?.split(',').some(t=>t.trim()===p.etag))return new Response(null,{status:304,headers});
  const kind=encoding(request.headers.get('accept-encoding'));
  if(!kind)return new Response(new Uint8Array(p.body),{headers});
  headers.set('content-encoding',kind);
  return new Response(new Uint8Array(await encoded(p,kind)),{headers});
}

interface ExportRow{name:string;content_type:string;bytes:number;sha256:string;gzip:Uint8Array}

export class NightLab{
  #db?:DatabaseSync;#identity='';#checkedAt=-Infinity;#meta?:Record<string,any>;#cache=new Map<string,Prepared>();
  constructor(readonly path:string,readonly recheckMs=2000,private readonly now=()=>Date.now()){}

  /** Reopens the file when the lab publishes a new one (an atomic rename gives it a new identity). */
  #open():{db:DatabaseSync;meta:Record<string,any>}{
    const t=this.now();
    if(this.#db&&t-this.#checkedAt<this.recheckMs)return {db:this.#db,meta:this.#meta!};
    this.#checkedAt=t;
    let identity:string;
    try{const s=statSync(this.path);identity=`${s.ino}:${s.size}:${s.mtimeMs}`}
    catch{this.close();throw new NightLabMissing('The Night Lab report has not been published on this server yet')}
    if(this.#db&&identity===this.#identity)return {db:this.#db,meta:this.#meta!};
    this.close();
    const db=new DatabaseSync(this.path,{readOnly:true});
    const meta=Object.fromEntries((db.prepare("SELECT key,value FROM meta").all() as {key:string;value:string}[]).map(r=>[r.key,JSON.parse(r.value)]));
    if(meta.schema!==NIGHT_LAB_SCHEMA){db.close();throw new NightLabMissing(`Night Lab schema ${meta.schema} is not ${NIGHT_LAB_SCHEMA}`)}
    this.#db=db;this.#meta=meta;this.#identity=identity;
    return {db,meta};
  }

  close(){this.#db?.close();this.#db=undefined;this.#meta=undefined;this.#identity='';this.#cache.clear()}

  get version():string{return this.#open().meta.version}

  /** One prepared response per report version and view; rebuilt only after a new publish. */
  #prepared(key:string,build:(db:DatabaseSync,meta:Record<string,any>)=>unknown):Prepared{
    const {db,meta}=this.#open(),id=meta.version+'/'+key;
    let p=this.#cache.get(id);
    if(!p){p=prepare(build(db,meta),meta.version);this.#cache.set(id,p)}
    return p;
  }

  summary():Prepared{
    return this.#prepared('summary',(db,meta)=>{
      const s=meta.skeleton,instruments=s.instruments as any[];
      const byEpic=Map.groupBy(db.prepare(`SELECT epic,session_window,gap_bp,profit_pct,policy,profile,record FROM runs
        WHERE profile=? OR (profile=? AND policy=?) ORDER BY list,position`).all(SUMMARY_PROFILE,EXIT_MIX.profile,EXIT_MIX.policy) as unknown as (RunRow&{epic:string})[],r=>r.epic);
      return {
        schema:NIGHT_LAB_SCHEMA,version:meta.version,generatedAt:s.generatedAt,years:s.years,window:s.window,gapThresholds:s.gapThresholds,
        takeProfitTargets:s.takeProfitTargets,caseCount:s.caseCount,selection:s.selection,
        benchmarks:Object.fromEntries((db.prepare('SELECT epic,record FROM benchmarks ORDER BY position').all() as {epic:string;record:string}[]).map(r=>[r.epic,JSON.parse(r.record)])),
        cohort:(db.prepare('SELECT record FROM cohort ORDER BY position').all() as {record:string}[]).map(r=>JSON.parse(r.record)),
        events:JSON.parse((db.prepare("SELECT body FROM documents WHERE name='events'").get() as {body:string}).body),
        instruments:instruments.map(i=>({epic:i.epic,spec:i.spec,centralQuoteChecks:i.centralQuoteChecks,classificationChanges:i.classificationChanges,
          runs:table(byEpic.get(i.epic)??[],SUMMARY_FIELDS)})),
      };
    });
  }

  /** Every risk cell of one day policy (both windows, all gaps and exits) and its 1:20 /20% curves. */
  policy(epic:string,policy:string):Prepared{
    return this.#prepared(`policy/${epic}/${policy}`,(db,meta)=>{
      const inst=(meta.skeleton.instruments as any[]).find(i=>i.epic===epic);
      if(!inst||!inst.spec.policies.some((p:{id:string})=>p.id===policy))throw new NightLabNotFound(`No ${epic} policy ${policy}`);
      const rows=db.prepare(`SELECT session_window,gap_bp,profit_pct,policy,profile,record FROM runs WHERE epic=? AND policy=? AND profile<>?
        ORDER BY list,position`).all(epic,policy,SUMMARY_PROFILE) as unknown as RunRow[];
      const curves:Record<string,unknown>={};
      for(const c of db.prepare(`SELECT session_window,gap_bp,profit_pct,points FROM curves WHERE epic=? AND policy=? AND profile=? ORDER BY list,position`)
        .all(epic,policy,SUMMARY_PROFILE) as {session_window:string;gap_bp:number;profit_pct:number;points:string}[])
        curves[`${c.session_window}/${c.gap_bp}/${c.profit_pct}`]??=JSON.parse(c.points);
      return {version:meta.version,epic,policy,runs:table(rows,CELL_FIELDS),curves};
    });
  }

  /** Baseline-rule trades (any positive gap) of one index and NY window, with their quarter-hour paths. */
  ledger(epic:string,window:string):Prepared{
    return this.#prepared(`ledger/${epic}/${window}`,(db,meta)=>{
      if(!EPICS.includes(epic as never)||!WINDOWS.includes(window as never))throw new NightLabNotFound(`No ${epic} ${window} ledger`);
      const trades=(db.prepare('SELECT record FROM trades WHERE epic=? AND session_window=? AND gap_bp=0 ORDER BY position').all(epic,window) as {record:string}[]).map(r=>JSON.parse(r.record));
      return {version:meta.version,epic,window,trades};
    });
  }

  stocks():Prepared{
    return this.#prepared('stocks',(db,meta)=>({version:meta.version,stocks:JSON.parse((db.prepare("SELECT body FROM documents WHERE name='stocks'").get() as {body:string}).body)}));
  }

  exportFile(name:string):ExportRow|null{
    const {db}=this.#open();
    return (db.prepare('SELECT name,content_type,bytes,sha256,gzip FROM exports WHERE name=?').get(name) as unknown as ExportRow|undefined)??null;
  }

  /** Downloads keep their published names and full precision; compressed once by the lab. */
  async respondExport(request:Request,name:string):Promise<Response>{
    const row=this.exportFile(name);
    if(!row)throw new NightLabNotFound(`No export ${name}`);
    const etag=`"${row.sha256.slice(0,32)}"`;
    const headers=new Headers({'content-type':row.content_type==='text/csv'?'text/csv; charset=utf-8':row.content_type,'cache-control':'no-cache',etag,vary:'accept-encoding'});
    if(request.headers.get('if-none-match')?.split(',').some(t=>t.trim()===etag))return new Response(null,{status:304,headers});
    if(accepts(request.headers.get('accept-encoding'),'gzip')){headers.set('content-encoding','gzip');return new Response(new Uint8Array(row.gzip),{headers})}
    return new Response(new Uint8Array(await gunzipAsync(row.gzip)),{headers});
  }
}
