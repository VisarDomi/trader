import type{LeaderboardRow,RunKind}from'@trader/shared';
import cohort from'./night-lab-cohort.json';
interface Reader{leaderboard(kind:RunKind,retired?:boolean,stage?:string,scenario?:string,agents?:readonly string[]):Promise<LeaderboardRow[]>}
const keyOf=(id:string,epic:string,leverage:number|null)=>`${id}:${epic}:${leverage??0}`;
const versions=new Map(cohort.map(r=>[keyOf(r.id,r.epic,r.leverage),r]));
const ids=[...new Set(cohort.map(r=>r.id))];
function member(r:LeaderboardRow){const v=versions.get(keyOf(r.agentId,r.epic,r.leverage));return !!v&&v.codeHash===r.codeHash&&v.epic===r.epic&&v.leverage===r.leverage}
/** When a platform reset archives an earlier run with the same source hash, pick the live run (else the newest). */
function latestByMember(rows:readonly LeaderboardRow[]):Map<string,LeaderboardRow>{
 const picked=new Map<string,LeaderboardRow>();
 for(const r of rows){
  const k=keyOf(r.agentId,r.epic,r.leverage);
  const cur=picked.get(k);
  if(!cur||(cur.status==='retired'&&r.status!=='retired')||(cur.status===r.status&&r.startedAt>cur.startedAt))picked.set(k,r);
 }
 return picked;
}
export type NightLabForward=Awaited<ReturnType<typeof nightLabForward>>;
export async function nightLabForward(reader:Reader){
 // Arena's internal stage is "demo"; the native/public UI calls this Capital demo.
 // Only the cohort's agents: the arena builds 20 rows, not the whole leaderboard (an arena without the filter returns all; member() still applies).
 const [virtual,actual]=await Promise.all([reader.leaderboard('demo',true,'','standard',ids),reader.leaderboard('demo',true,'demo','standard',ids)]);
 const rows=[...latestByMember(virtual.filter(r=>!r.comparisonOnly&&member(r))).values()];
 const capital=latestByMember(actual.filter(member));
 if(rows.length!==cohort.length)throw Error('Cohort is warming or incomplete');
 return {schema:3,at:Date.now(),rows:rows.map(r=>({agentId:r.agentId,codeHash:r.codeHash,epic:r.epic,leverage:r.leverage,status:r.status,startedAt:r.startedAt,totalReturn:r.metrics?.totalReturn??null,trades:r.metrics?.trades??0,mirrored:r.mirrored,capitalReturn:capital.get(keyOf(r.agentId,r.epic,r.leverage))?.metrics?.totalReturn??null,capitalTrades:capital.get(keyOf(r.agentId,r.epic,r.leverage))?.metrics?.trades??null}))};
}

/** Every open Night Lab polls every 30 s; one arena read serves all of them for `ttlMs`. */
export function sharedForward(load:()=>Promise<NightLabForward>,ttlMs=20_000,now=()=>Date.now()){
 let value:NightLabForward|undefined,at=-Infinity,pending:Promise<NightLabForward>|undefined;
 return ():Promise<NightLabForward>=>{
  if(value&&now()-at<ttlMs)return Promise.resolve(value);
  return pending??=load().then(v=>{value=v;at=now();return v}).finally(()=>{pending=undefined});
 };
}
