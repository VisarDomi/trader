import { Database } from 'bun:sqlite';
import { join,dirname } from 'node:path';
import { homedir } from 'node:os';
import { readPath } from './archive';
import { inspect,INSPECTION_LIMITS } from './model';
import { subject } from './subjects';
const arenaPath=process.env.INSPECTION_ARENA_DB??join(homedir(),'.local/share/hetzner-pc/mirror/home/erdal/trader-arena/data/arena.db');
const spoolPath=process.env.INSPECTION_TICK_DB??join(dirname(arenaPath),'ticks.db');
const db=new Database(arenaPath,{readonly:true});
const cache=new Map<string,{body:string;until:number;bytes:number}>(),pending=new Map<string,Promise<string>>();
let serial=Promise.resolve();
async function load(id:string,key:string,stage:string){
  const s=subject(db,id,key,stage);const end=s.exitTime??Date.now(),from=Math.max(s.entryTime,end-INSPECTION_LIMITS.windowMs);
  const path=await readPath(s.epic,from,end,spoolPath);
  const body=JSON.stringify(inspect(s,path.quotes,path.sessions,path.candles,Date.now(),path.limited));
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
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store'};
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.INSPECTION_PORT??4140),idleTimeout:60,async fetch(req){
  const url=new URL(req.url);if(req.method!=='GET')return Response.json({error:'Read only'},{status:405});
  if(url.pathname==='/health')return Response.json({ok:true,readOnly:true,cacheEntries:cache.size,queued:pending.size});
  const id=url.searchParams.get('id')??'',stage=url.searchParams.get('stage')??'virtual';
  try{
    if(url.pathname==='/inspection')return new Response(await inspection(id,url.searchParams.get('trade')??'',stage),{headers});
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
