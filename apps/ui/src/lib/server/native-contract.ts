import { createHash, timingSafeEqual } from 'node:crypto';

export const NATIVE_RESOURCE = ['leaderboard', 'agents', 'agent', 'run', 'broker', 'status', 'graveyard', 'journal', 'research'] as const;
const MUTATIONS = ['mirror', 'exclude'];
const headers = {'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export interface NativeContext {
  hash: string | undefined;
  read: (resource:string,params:URLSearchParams) => Promise<unknown>;
  mutate: (resource:string,body:Record<string,unknown>) => Promise<unknown>;
}
export function authorized(request: Request, hash: string | undefined): boolean {
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  const bearer=request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ') || bearer.length>1024) return false;
  return timingSafeEqual(createHash('sha256').update(bearer.slice(7)).digest(),Buffer.from(hash,'hex'));
}
export async function nativeResponse(request:Request,resource:string,context:NativeContext):Promise<Response> {
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if (!authorized(request,context.hash)) return json({error:'Pair this device to Trader.'},401);
  const params=new URL(request.url).searchParams;
  if (request.method==='GET') {
    if (!NATIVE_RESOURCE.includes(resource as typeof NATIVE_RESOURCE[number])) return json({error:'Unknown resource'},404);
    if (['agent','run'].includes(resource) && (!params.get('id') || params.get('id')!.length>512 || /[\x00-\x1f]/.test(params.get('id')!)))
      return json({error:'Invalid record'},400);
    if (resource==='leaderboard' && !['capital','virtual','backtest'].includes(params.get('stage')??'capital')) return json({error:'Invalid stage'},400);
    try {return json(await context.read(resource,params));}
    catch {return json({error:'Trader is temporarily unavailable. Your saved records remain on this phone.'},502);}
  }
  if (request.method==='POST' && MUTATIONS.includes(resource)) {
    if (request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'JSON required'},415);
    const raw=await request.text();
    if (raw.length>2048) return json({error:'Request too large'},413);
    let body:Record<string,unknown>;
    try {body=JSON.parse(raw);} catch {return json({error:'Invalid request'},400);}
    if (!body || typeof body!=='object' || Array.isArray(body)) return json({error:'Invalid request'},400);
    if ((resource==='mirror' && typeof body.enabled!=='boolean') || (resource==='exclude' &&
      (typeof body.runId!=='string' || !body.runId.startsWith('demo:') || body.runId.length>512 || typeof body.excluded!=='boolean')))
      return json({error:'Invalid demo control'},400);
    try {return json(await context.mutate(resource,body));}
    catch {return json({error:'The demo control could not be confirmed. Refresh before trying again.'},502);}
  }
  return json({error:'Method not allowed'},405);
}
