import type{LeaderboardRow,RunKind}from'@trader/shared';
import cohort from'./night-lab-cohort.json';
interface Reader{leaderboard(kind:RunKind,retired?:boolean,stage?:string,scenario?:string,agents?:readonly string[]):Promise<LeaderboardRow[]>}
const versions=new Map(cohort.map(r=>[r.id,r]));
const ids=[...versions.keys()];
function member(r:LeaderboardRow){const v=versions.get(r.agentId);return !!v&&v.codeHash===r.codeHash&&v.epic===r.epic&&v.leverage===r.leverage}
/** When a platform reset archives an earlier run with the same source hash, pick the live run (else the newest). */
function latestByAgent(rows:readonly LeaderboardRow[]):Map<string,LeaderboardRow>{
 const picked=new Map<string,LeaderboardRow>();
 for(const r of rows){
  const cur=picked.get(r.agentId);
  if(!cur||(cur.status==='retired'&&r.status!=='retired')||(cur.status===r.status&&r.startedAt>cur.startedAt))picked.set(r.agentId,r);
 }
 return picked;
}
export type NightLabForward=Awaited<ReturnType<typeof nightLabForward>>;
export async function nightLabForward(reader:Reader){
 // Arena's internal stage is "demo"; the native/public UI calls this Capital demo.
 // Only the cohort's agents: the arena builds 20 rows, not the whole leaderboard (an arena without the filter returns all; member() still applies).
 const [virtual,actual]=await Promise.all([reader.leaderboard('demo',true,'','standard',ids),reader.leaderboard('demo',true,'demo','standard',ids)]);
 const rows=[...latestByAgent(virtual.filter(r=>!r.comparisonOnly&&member(r))).values()];
 const capital=latestByAgent(actual.filter(member));
 if(rows.length!==cohort.length)throw Error('Cohort is warming or incomplete');
 return {schema:3,at:Date.now(),rows:rows.map(r=>({agentId:r.agentId,codeHash:r.codeHash,epic:r.epic,leverage:r.leverage,status:r.status,startedAt:r.startedAt,totalReturn:r.metrics?.totalReturn??null,trades:r.metrics?.trades??0,mirrored:r.mirrored,capitalReturn:capital.get(r.agentId)?.metrics?.totalReturn??null,capitalTrades:capital.get(r.agentId)?.metrics?.trades??null}))};
}

/** Every open Night Lab polls every 30 s; one arena read serves all of them for `ttlMs`. */
export function sharedForward(load:()=>Promise<NightLabForward>,ttlMs=20_000,now=()=>Date.now()){
 let value:NightLabForward|undefined,at=-Infinity,pending:Promise<NightLabForward>|undefined;
 return ():Promise<NightLabForward>=>{
  if(value&&now()-at<ttlMs)return Promise.resolve(value);
  return pending??=load().then(v=>{value=v;at=now();return v}).finally(()=>{pending=undefined});
 };
}
