import {join} from 'node:path';
import {loadAgents} from '../../engine/loader';
import {loadRoster,planRuns} from '../../engine/roster';
import {backtestEpic,STANDARD_WINDOW} from '../backtest-core';
const epic=Bun.argv[2]!;
if(!['US500','US100'].includes(epic))throw Error('Use exit-sensitivity.ts US500|US100');
const {agents,errors}=await loadAgents();if(errors.length)throw Error('Agent load failed');
const plans=planRuns(agents.filter(a=>a.slug.startsWith('visar-night-v2-')),loadRoster()).runs.filter(r=>r.epic===epic);
for(const p of [{seed:2,n:16},{seed:3,n:16},{seed:1,n:64}]){
 const runs=await backtestEpic(epic,plans.map(r=>({agent:r.agent,leverage:r.leverage})),STANDARD_WINDOW,null,{mode:'synthetic',recordings:[],seed:p.seed,ticksPerMinute:p.n});
 if(runs.some(r=>r.errors))throw Error('Sensitivity callback error');
 await Bun.write(join(import.meta.dir,`../../../data/night-exit-study-20261109/${epic}-s${p.seed}-n${p.n}.json`),JSON.stringify({seed:p.seed,ticksPerMinute:p.n,runs}));
 console.log('PATH CHECK',epic,p.seed,p.n,runs.length);
}
