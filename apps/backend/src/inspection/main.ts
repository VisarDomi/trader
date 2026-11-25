import { Database } from 'bun:sqlite';
import { join,dirname } from 'node:path';
import { readPath } from './archive';
import { inspect,INSPECTION_LIMITS } from './model';
import { subject } from './subjects';
import { strategyContext } from '../strategy/history';
// Runs from the deployed copy, <runtime>/trader-arena/app; the arena's database is <runtime>/trader-arena/data.
const arenaPath=process.env.INSPECTION_ARENA_DB??join(import.meta.dir,'../../../data/arena.db');
const spoolPath=process.env.INSPECTION_TICK_DB??join(dirname(arenaPath),'ticks.db');
const db=new Database(arenaPath,{readonly:true});
const cache=new Map<string,{body:string;until:number;bytes:number}>(),pending=new Map<string,Promise<string>>();
let serial=Promise.resolve();
async function load(id:string,key:string,stage:string){
  const s=subject(db,id,key,stage);const end=s.exitTime??Date.now(),from=Math.max(s.entryTime,end-INSPECTION_LIMITS.windowMs);
  const path=await readPath(s.epic,from,end,spoolPath);
  const result=inspect(s,path.quotes,path.sessions,path.candles,Date.now(),path.limited);
  result.strategy=await strategyContext(db,s).catch(()=>null);
  const body=JSON.stringify(result);
  cache.delete(`${id}|${stage}|${key}`);cache.set(`${id}|${stage}|${key}`,{body,until:Date.now()+(s.exitTime?300000:10000),bytes:Buffer.byteLength(body)});
  while(cache.size>INSPECTION_LIMITS.cacheEntries||[...cache.values()].reduce((n,c)=>n+c.bytes,0)>INSPECTION_LIMITS.cacheBytes)cache.delete(cache.keys().next().value!);
  return body;
}
async function inspection(id:string,key:string,stage:string){
  const k=`${id}|${stage}|${key}`,cached=cache.get(k);if(cached&&cached.until>Date.now())return cached.body;
  if(pending.has(k))return pending.get(k)!;
  if(pending.size>=8)throw Error('Inspection queue busy');
  const work=serial.then(()=>load(id,key,stage));serial=work.then(()=>{},()=>{});pending.set(k,work);
  try{return await work;}finally{pending.delete(k);}
}
// Mini price paths for trade lists: the minute close at evenly spaced moments from entry to exit, one index seek each.
// Closed trades never change, so their paths are kept (bounded); an open position's path is recomputed.
const closeAt=db.query<{c:number},[string,number]>('SELECT c FROM candles WHERE epic=? AND t<=? ORDER BY t DESC LIMIT 1');
const sparkCache=new Map<string,number[]>();
function spark(epic:string,from:number,to:number,cacheKey?:string):number[]{
  const cached=cacheKey?sparkCache.get(cacheKey):undefined;if(cached)return cached;
  const n=INSPECTION_LIMITS.sparkPoints,out:number[]=[];
  if(to>from)for(let i=0;i<n;i++){const c=closeAt.get(epic,from+(to-from)*i/(n-1))?.c;out.push(c??NaN);}
  if(cacheKey){sparkCache.set(cacheKey,out);if(sparkCache.size>INSPECTION_LIMITS.sparkCache)sparkCache.delete(sparkCache.keys().next().value!);}
  return out;
}
function sparks(runId:string, tradeLimit = INSPECTION_LIMITS.sparkTrades){
  const run=db.query<any,[string]>('SELECT epic,snapshot FROM runs WHERE id=?').get(runId);if(!run)throw Error('Run not found');
  const cap = Math.max(0, Math.min(INSPECTION_LIMITS.sparkTrades, tradeLimit));
  const trades=cap > 0 ? db.query<any,[string,number]>('SELECT idx,entry_time,exit_time FROM trades WHERE run_id=? ORDER BY idx DESC LIMIT ?').all(runId, cap) : [];
  const deals=cap > 0 ? db.query<any,[string,number]>("SELECT id,open_time,confirmed_time,close_time,status FROM broker_deals WHERE run_id=? AND account LIKE 'Arena%' AND status!='failed' AND open_price IS NOT NULL ORDER BY id DESC LIMIT ?").all(runId, cap) : [];
  const position=run.snapshot?JSON.parse(run.snapshot).position:null,now=Date.now();
  const round=(v:number[])=>v.map(x=>Number.isFinite(x)?x:null);
  return {epic:run.epic,points:INSPECTION_LIMITS.sparkPoints,
    trades:trades.map(t=>[String(t.idx),round(spark(run.epic,t.entry_time,t.exit_time,`${runId}|t|${t.idx}|${t.exit_time}`))]),
    deals:deals.map(d=>{const from=d.confirmed_time??d.open_time,to=d.status==='closed'?d.close_time:now;return [String(d.id),round(spark(run.epic,from,to,d.status==='closed'?`${runId}|d|${d.id}`:undefined))]}),
    open:position?round(spark(run.epic,position.entryTime,now)):null};
}
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store'};
const RUN_ID_RE = /^(demo|bt):[A-Za-z0-9_:./@=-]{1,240}$/;
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.INSPECTION_PORT??4140),idleTimeout:60,async fetch(req){
  const url=new URL(req.url);if(req.method!=='GET')return Response.json({error:'Read only'},{status:405});
  if(url.pathname==='/health')return Response.json({ok:true,readOnly:true,cacheEntries:cache.size,queued:pending.size});
  const id=url.searchParams.get('id')??'',stage=url.searchParams.get('stage')??'virtual';
  try{
    if(url.pathname==='/inspection')return new Response(await inspection(id,url.searchParams.get('trade')??'',stage),{headers});
    if(url.pathname==='/sparks'){
      const limit = Number(url.searchParams.get('limit') ?? INSPECTION_LIMITS.sparkTrades) || INSPECTION_LIMITS.sparkTrades;
      const idsParam = url.searchParams.get('ids');
      if (idsParam !== null) {
        const ids = idsParam.split(',').filter(Boolean).slice(0, 64);
        if (!ids.every(x => RUN_ID_RE.test(x))) return Response.json({error:'Invalid selection'},{status:400});
        const out: Record<string, ReturnType<typeof sparks>> = {};
        for (const runId of ids) { try { out[runId] = sparks(runId, limit); } catch { /* skip missing */ } }
        return new Response(JSON.stringify(out),{headers});
      }
      if(!RUN_ID_RE.test(id))return Response.json({error:'Invalid selection'},{status:400});
      return new Response(JSON.stringify(sparks(id, limit)),{headers});
    }
    if(url.pathname==='/preview'){
      if(!/^(demo|bt):[A-Za-z0-9_:./@=-]{1,240}$/.test(id)||!['virtual','capital','backtest'].includes(stage))return Response.json({error:'Invalid selection'},{status:400});
      const ids=stage==='capital'?db.query<any,[string]>("SELECT id key FROM broker_deals WHERE run_id=? AND account LIKE 'Arena%' AND status='closed' ORDER BY close_time DESC LIMIT 2").all(id):db.query<any,[string]>('SELECT idx key FROM trades WHERE run_id=? ORDER BY idx DESC LIMIT 2').all(id);
      const result=await Promise.allSettled(ids.map(row=>inspection(id,String(row.key),stage)));
      return new Response('['+result.flatMap(r=>r.status==='fulfilled'?[r.value]:[]).join(',')+']',{headers});
    }
    return Response.json({error:'Not found'},{status:404});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const known=/Invalid trade selection|not found|No open position|Select a broker deal/.test(message);
    if(!known)console.error('Inspection unavailable',error instanceof Error?error.name:'unknown');
    return Response.json({error:known?message:'Inspection data temporarily unavailable'},{status:known?404:503});
  }
}});
console.log(`Read-only trade inspector on 127.0.0.1:${server.port}`);
