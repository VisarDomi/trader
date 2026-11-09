import {json} from '@sveltejs/kit';
import {arena} from '$lib/server/arena';
import {isVisarCohort} from '$lib/leaderboard-state';
import cohort from '$lib/server/night-lab-cohort.json';
const versions=new Map(cohort.map(r=>[r.id,r.codeHash]));
export async function GET(){
  try {
    const [virtual,actual]=await Promise.all([arena.leaderboard('demo',true,'','standard'),arena.leaderboard('demo',true,'capital','standard')]);
    const rows=virtual.filter(r=>!r.comparisonOnly&&versions.has(r.agentId)&&versions.get(r.agentId)===r.codeHash);
    const capital=new Map(actual.filter(r=>isVisarCohort(r.agentId)&&versions.get(r.agentId)===r.codeHash).map(r=>[r.agentId,r]));
    if(rows.length!==20)return json({error:'Cohort is warming or incomplete'},{status:503,headers:{'cache-control':'private, no-store'}});
    return json({at:Date.now(),rows:rows.map(r=>({agentId:r.agentId,epic:r.epic,leverage:r.leverage,status:r.status,startedAt:r.startedAt,totalReturn:r.metrics?.totalReturn??null,trades:r.metrics?.trades??0,mirrored:r.mirrored,capitalReturn:capital.get(r.agentId)?.metrics?.totalReturn??null,capitalTrades:capital.get(r.agentId)?.metrics?.trades??null}))},{headers:{'cache-control':'private, no-store'}});
  }catch{return json({error:'Forward data temporarily unavailable'},{status:503,headers:{'cache-control':'private, no-store'}})}
}
