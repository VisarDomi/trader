import{error,fail}from'@sveltejs/kit';
import{arena}from'$lib/server/arena';
import{inspection,type Inspection}from'$lib/server/inspection';
export async function load({params,url}){
 try{
  const run=await arena.run(params.id),stage=run.kind==='backtest'?'backtest':url.searchParams.get('stage')==='capital'?'capital':'virtual';
  const [agent,previews,capital,broker]=await Promise.all([arena.agent(run.agentId,{source:false,shadows:false}).catch(()=>null),inspection.preview(run.id,stage).catch(():Inspection[]=>[]),stage==='capital'?arena.leaderboard('demo',true,'demo','standard',[run.agentId]).then(rs=>rs.find(r=>r.runId===run.id)??null).catch(()=>null):Promise.resolve(null),run.kind==='backtest'?Promise.resolve(null):arena.broker(0).catch(()=>null)]);
  const selected=url.searchParams.get('trade');
  if(selected&&!previews.some(i=>i.subject.key===selected)){const chosen=await inspection.trade(run.id,selected,stage).catch(()=>null);if(chosen)previews.unshift(chosen)}
  // How often the backtest did what this stage's record did, and every backtest stretch for its chart.
  const frequency=(stage==='capital'?capital?.evidence:run.evidence)?.frequency??null;
  const periods=frequency?await arena.periods(frequency.runId,frequency.days).catch(()=>null):null;
  const account=broker?.status?.accounts.find(a=>a.runs.includes(run.id))?.name??null;
  const mirrored=Boolean(account)||(broker?.status?.promoted?.includes(run.id)??false);
  const realHolder=broker?.status?.realService?.assignment?.runId??broker?.status?.real?.[0]??null;
  const real=(broker?.status?.real?.includes(run.id)??false)||realHolder===run.id;
  return{run,agentName:agent?.name??run.agentId,stage,capital,inspections:previews,selected,frequency,periods,account,mirrored,real,realHolder,realService:broker?.status?.realService??null};
 }catch(e){error(404,e instanceof Error?e.message:'Run unavailable')}
}
export const actions={
 stage:async({request,params})=>{
  const form=await request.formData();
  const target=String(form.get('target')??'') as 'backtest'|'virtual'|'demo'|'real';
  const confirmed=form.get('confirmed')==='true';
  try{
   await arena.setStage(params.id,target,confirmed);
   return{ok:true,message:target==='real'?'Promoted to Real USD account on Hetzner.':target==='demo'?'Moved to Capital demo.':target==='virtual'?'Demoted to Paper.':'Demoted to Backtest.'};
  }catch(e){return fail(400,{ok:false,message:e instanceof Error?e.message:String(e)})}
 },
};
