/**
 * Night Lab summary and HTTP response compression helpers.
 *
 * The cohort summary (night-lab-summary.json, built by ops/lab/build-night-lab.py from the current
 * New York-clock backtests and 1:1 hold benchmarks) is bundled and prepared once per process.
 * Compression/ETag helpers are shared with the nightly paper grid (/night-lab/grid.json).
 */
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {brotliCompress,constants,gzip} from 'node:zlib';
import summaryData from './night-lab-summary.json';

export const NIGHT_LAB_SCHEMA=2;
export const BROTLI_QUALITY=9;

export interface Prepared{etag:string;body:Buffer;encoded:Map<string,Promise<Buffer>>}
const gzipAsync=promisify(gzip),brotliAsync=promisify(brotliCompress);

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

export async function respond(request:Request,p:Prepared,cacheControl:string,contentType='application/json; charset=utf-8'):Promise<Response>{
  const headers=new Headers({'content-type':contentType,'cache-control':cacheControl,etag:p.etag,vary:'accept-encoding'});
  if(request.headers.get('if-none-match')?.split(',').some(t=>t.trim()===p.etag))return new Response(null,{status:304,headers});
  const kind=encoding(request.headers.get('accept-encoding'));
  if(!kind)return new Response(new Uint8Array(p.body),{headers});
  headers.set('content-encoding',kind);
  return new Response(new Uint8Array(await encoded(p,kind)),{headers});
}

let cachedSummary:Prepared|undefined;
export function nightLabSummary():Prepared{
  return cachedSummary??=prepare(summaryData,`s${NIGHT_LAB_SCHEMA}`);
}
