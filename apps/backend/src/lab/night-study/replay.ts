import{createHash}from'node:crypto';
import{mkdirSync,readFileSync}from'node:fs';
import{join}from'node:path';
import{loadAgents,type LoadedAgent}from'../../engine/loader';
import{LEVERAGE_TIERS}from'../../engine/leverage';
import{backtestEpic,STANDARD_WINDOW}from'../backtest-core';
import central from'./central-session';

export const SESSION={id:'central',label:'10:30–15:30 NY',start:630,end:930,minutes:300,intervals:20,coverage:270}as const;
export const POLICIES=[
 {id:'current',label:'Original thresholds',params:{}},
 {id:'reversal50',label:'Reversal ≤50% of range',params:{maxRetraceShare:.5}},
 {id:'reversal35',label:'Reversal ≤35% of range',params:{maxRetraceShare:.35}},
 {id:'steps16',label:'Agreeing steps ≥16/26 (61.5%)',params:{minDirectionalShare:16/26}},
 {id:'body80',label:'Body ≥80% of range',params:{minBodyShare:.8}},
 {id:'efficiency60',label:'Path efficiency ≥60%',params:{minEfficiency:.6}},
];
export const STOPS=[5,10,20,30,40,50];
const ROOT=join(import.meta.dir,'../../..'),OUT=join(ROOT,'data/night-session-study-20261109');
async function sensitivity(epic:string){
 const base=(await loadAgents()).agents.find(a=>a.id==='visar-night-trading')!;
 if(base.codeHash!=='56ac3bdfe7c1')throw Error('Frozen source changed');
 const reference=readFileSync(join(import.meta.dir,'central-session.ts'),'utf8');
 for(const job of [{seed:2,n:16},{seed:3,n:16},{seed:1,n:64}]){
  const specs=[{leverage:1,lossPct:50},{leverage:20,lossPct:20},{leverage:200,lossPct:50}].map(q=>{
   const params={...base.params,lossPct:q.lossPct};return {leverage:q.leverage,agent:{...base,id:`night-central-check/${epic}/L${q.leverage}S${q.lossPct}`,def:{...central,instruments:[epic]},params,codeHash:createHash('sha256').update(reference+epic+JSON.stringify(params)).digest('hex').slice(0,12)}};
  });
  const results=await backtestEpic(epic,specs,STANDARD_WINDOW,null,{mode:'synthetic',recordings:[],seed:job.seed,ticksPerMinute:job.n});
  if(results.some(r=>r.errors))throw Error('Quote-path check failed');
  await Bun.write(join(OUT,`${epic}-sensitivity-${job.seed}-${job.n}.json`),JSON.stringify(results));console.log('CHECK',epic,job.seed,job.n);
 }
}
async function main(){
 const epic=Bun.argv[2],shard=Number(Bun.argv[3]);
 if(['US500','US100'].includes(epic!)&&Bun.argv[3]==='sensitivity')return sensitivity(epic!);
 if(!['US500','US100'].includes(epic!)||![0,1].includes(shard))throw Error('Use replay.ts US500|US100 0|1');
 const base=(await loadAgents()).agents.find(a=>a.id==='visar-night-trading')!;
 if(base.codeHash!=='56ac3bdfe7c1')throw Error('Original source changed; review experiment');
 const reference=readFileSync(join(import.meta.dir,'central-session.ts'),'utf8');
 const profiles=LEVERAGE_TIERS.flatMap(leverage=>STOPS.map(lossPct=>({id:`L${leverage}S${lossPct}`,leverage,marginPct:90,lossPct})));
 mkdirSync(OUT,{recursive:true});
 const spec={epic,session:SESSION,fullSession:{start:570,end:960,minutes:390,intervals:26},policies:POLICIES,profiles,stops:STOPS,leverageTiers:LEVERAGE_TIERS,window:STANDARD_WINDOW,sourceHash:base.codeHash,
  referenceHash:createHash('sha256').update(reference).digest('hex'),notes:['Only bull/bear recognition changes to 10:30–15:30 New York. The 22:00 reference and 03:27/08:27 Albania entry/exit remain fixed.','Agreement thresholds remain fractions: half the 20 steps for baseline, ceil(20×16/26)=13 for the step-consistency policy.','At least 270/300 minutes and all 21 checkpoints required. Move, range, body and retracement use only central-session bars.','FOMC/BOJ guards remain unchanged. New event annotations do not select, exclude or resize trades.','Fresh full-engine diagnostics, not admissions or replacements of the 20 live agents. No primary DB writes.']};
 if(shard===0)await Bun.write(join(OUT,`${epic}-spec.json`),JSON.stringify(spec,null,2));
 for(let pi=0;pi<POLICIES.length;pi++){
  if(pi%2!==shard)continue;const policy=POLICIES[pi]!;
  console.log('START',epic,policy.id,profiles.length);
  const specs=profiles.map(q=>{const params={...base.params,...policy.params,marginPct:90,lossPct:q.lossPct};
   const agent:LoadedAgent={...base,id:`night-central/${epic}/${policy.id}/${q.id}`,slug:'night-central',def:{...central,instruments:[epic!]},params,
    codeHash:createHash('sha256').update(reference+epic+JSON.stringify(params)).digest('hex').slice(0,12)};
   return {agent,leverage:q.leverage};});
  const results=await backtestEpic(epic!,specs,STANDARD_WINDOW,null,{mode:'synthetic',recordings:[],seed:1,ticksPerMinute:16});
  if(results.some(r=>r.errors||!['completed','busted'].includes(r.status)))throw Error(`Failed scenario ${epic}/${policy.id}`);
  await Bun.write(join(OUT,`${epic}-${policy.id}.json`),JSON.stringify({policy,profiles,runs:results}));
  console.log('DONE',epic,policy.id,results[0]!.durationMs);
 }
}
if(import.meta.main)await main();
