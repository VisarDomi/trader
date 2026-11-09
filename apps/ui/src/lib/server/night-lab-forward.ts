import type{LeaderboardRow,RunKind}from'@trader/shared';
import cohort from'./night-lab-cohort.json';
interface Reader{leaderboard(kind:RunKind,retired?:boolean,stage?:string,scenario?:string):Promise<LeaderboardRow[]>}
const versions=new Map(cohort.map(r=>[r.id,r]));
function member(r:LeaderboardRow){const v=versions.get(r.agentId);return !!v&&v.codeHash===r.codeHash&&v.epic===r.epic&&v.leverage===r.leverage}
export async function nightLabForward(reader:Reader){
 // Arena's internal stage is "demo"; the native/public UI calls this Capital demo.
 const [virtual,actual]=await Promise.all([reader.leaderboard('demo',true,'','standard'),reader.leaderboard('demo',true,'demo','standard')]);
 const rows=virtual.filter(r=>!r.comparisonOnly&&member(r)),capital=new Map(actual.filter(member).map(r=>[r.agentId,r]));
 if(rows.length!==20)throw Error('Cohort is warming or incomplete');
 return {schema:2,at:Date.now(),rows:rows.map(r=>({agentId:r.agentId,epic:r.epic,leverage:r.leverage,status:r.status,startedAt:r.startedAt,totalReturn:r.metrics?.totalReturn??null,trades:r.metrics?.trades??0,mirrored:r.mirrored,capitalReturn:capital.get(r.agentId)?.metrics?.totalReturn??null,capitalTrades:capital.get(r.agentId)?.metrics?.trades??null}))};
}
