import { env } from '$env/dynamic/private';
import { arena } from '$lib/server/arena';
import { nativeResponse } from '$lib/server/native-contract';
import { doc, topics, sources } from '$lib/server/research';
import { PLATFORM_HISTORY } from '$lib/platform-history';
import journal from '../../../../../../../backend/agents/JOURNAL.md?raw';
import type { RequestHandler } from './$types';

const handler:RequestHandler=({request,params})=>nativeResponse(request,params.resource,{
  hash:env.TRADER_NATIVE_ACCESS_SHA256,
  read:async (resource,q)=>{
    switch(resource) {
      case 'leaderboard': {
        const stage=q.get('stage')??'capital';
        return arena.leaderboard(stage==='backtest'?'backtest':'demo',false,stage==='capital'?'demo':'','standard');
      }
      case 'agents': return (await arena.agents()).map(({demo,backtest,...agent})=>({...agent,
        virtualRuns:demo.filter(r=>!r.id.includes(':delay=')).length,backtests:backtest.length}));
      case 'agent': {
        const a=await arena.agent(q.get('id')!);
        return {...a,runs:a.runs.filter(r=>!r.id.includes(':delay='))};
      }
      case 'run': {
        const r=await arena.run(q.get('id')!,500);
        const points=r.equityCurve,stride=Math.max(1,Math.ceil(points.length/500));
        const capital=q.get('stage')==='capital' ? (await arena.leaderboard('demo',true,'demo','standard')).find(row=>row.runId===r.id)??null : null;
        return {...r,capitalDemo:capital,equityCurve:points.filter((_,i)=>i%stride===0 || i===points.length-1)};
      }
      case 'broker': return arena.broker();
      case 'status': {
        const [status,execution,events]=await Promise.all([arena.status(),arena.execution(),arena.events(60)]);
        return {status,execution,events};
      }
      case 'graveyard': return {entries:await arena.graveyard(),platform:PLATFORM_HISTORY};
      case 'journal': return {title:'Arena journal',markdown:journal};
      case 'research': {
        const topic=q.get('topic');
        if (topic && !/^[a-z0-9-]{1,60}$/.test(topic)) throw new Error('Invalid topic');
        if (topic) return {title:topics().find(t=>t.slug===topic)?.title??'Research',markdown:doc(`research/topics/${topic}.md`)??''};
        return {title:'Research',markdown:doc('research/report.md')??'',topics:topics().map(({inShort,...t})=>t),sources:sources()};
      }
    }
  },
  mutate:async(resource,body)=>resource==='mirror'?arena.setMirror(body.enabled as boolean):arena.setExcluded(body.runId as string,body.excluded as boolean),
});
export const GET=handler;
export const POST=handler;
