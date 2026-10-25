import { env } from '$env/dynamic/private';
import { arena } from '$lib/server/arena';
import { nativeResponse } from '$lib/server/native-contract';
import { doc, topics, sources } from '$lib/server/research';
import { PLATFORM_HISTORY } from '$lib/platform-history';
import journal from '../../../../../../../backend/agents/JOURNAL.md?raw';
import type { RequestHandler } from './$types';
import { CONTROL_SLUGS, assess, luckBands } from '@trader/shared';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const handler:RequestHandler=({request,params})=>nativeResponse(request,params.resource,{
  hash:env.TRADER_NATIVE_ACCESS_SHA256,
  read:async (resource,q)=>{
    switch(resource) {
      case 'leaderboard': {
        const stage=q.get('stage')??'capital';
        const rows=await arena.leaderboard(stage==='backtest'?'backtest':'demo',false,stage==='capital'?'demo':'',stage==='virtual'?(q.get('scenario')??'standard'):'standard');
        const bands=luckBands(rows.filter(row=>!row.comparisonOnly));
        return rows.map(row=>({...row,control:CONTROL_SLUGS.has(row.slug),
          forwardVerdict:stage==='virtual'&&!row.comparisonOnly?assess(row,bands,Date.now()).verdict:null}));
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
        const [agent,broker,actual]=await Promise.all([arena.agent(r.agentId),arena.broker(),
          q.get('stage')==='capital'?arena.leaderboard('demo',true,'demo','standard'):Promise.resolve([])]);
        const comparison=agent.runs.filter(b=>b.kind==='backtest' && b.status!=='retired' && b.epic===r.epic && b.leverage===r.leverage && b.codeHash===r.codeHash).sort((a,b)=>b.updatedAt-a.updatedAt)[0]??null;
        return {...r,capitalDemo:actual.find(row=>row.runId===r.id)??null,backtestComparison:comparison,
          brokerExcluded:broker.status?.excluded.includes(r.id)??false,
          equityCurve:points.filter((_,i)=>i%stride===0 || i===points.length-1)};
      }
      case 'broker': return arena.broker();
      case 'status': {
        const [status,execution,events,scenarios]=await Promise.all([arena.status(),arena.execution(),arena.events(60),arena.scenarios()]);
        return {status,execution,events,scenarios,heavyResourcesPaused:existsSync(join(homedir(),'.local/share/heavy-resources/user-pause.json'))};
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
