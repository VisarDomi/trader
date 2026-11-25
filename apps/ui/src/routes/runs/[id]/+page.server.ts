import{error}from'@sveltejs/kit';
import{arena}from'$lib/server/arena';
import{inspection,type Inspection}from'$lib/server/inspection';
export async function load({params,url}){
 try{
  const run=await arena.run(params.id),stage=run.kind==='backtest'?'backtest':url.searchParams.get('stage')==='capital'?'capital':'virtual';
  const [agent,previews,capital]=await Promise.all([arena.agent(run.agentId).catch(()=>null),inspection.preview(run.id,stage).catch(():Inspection[]=>[]),stage==='capital'?arena.leaderboard('demo',true,'demo').then(rs=>rs.find(r=>r.runId===run.id)??null).catch(()=>null):Promise.resolve(null)]);
  const selected=url.searchParams.get('trade');
  if(selected&&!previews.some(i=>i.subject.key===selected)){const chosen=await inspection.trade(run.id,selected,stage).catch(()=>null);if(chosen)previews.unshift(chosen)}
  // How often the backtest did what this stage's record did, and every backtest stretch for its chart.
  const frequency=(stage==='capital'?capital?.evidence:run.evidence)?.frequency??null;
  const periods=frequency?await arena.periods(frequency.runId,frequency.days).catch(()=>null):null;
  return{run,agentName:agent?.name??run.agentId,stage,capital,inspections:previews,selected,frequency,periods};
 }catch(e){error(404,e instanceof Error?e.message:'Run unavailable')}
}
