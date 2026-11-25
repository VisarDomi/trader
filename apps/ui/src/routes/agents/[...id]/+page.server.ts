import { error } from '@sveltejs/kit';
import { arena } from '$lib/server/arena';
import { findStrategyDocForSlug } from '$lib/server/strategies';
import { agentRuleSpec, cleanAgentName } from '$lib/server/agent-spec';

export async function load({ params }) {
	try {
		const agent=await arena.agent(params.id,{source:true,shadows:false});
		const [rows,btRows]=await Promise.all([
			arena.leaderboard('demo',false,'','standard',[agent.id]).catch(()=>[]),
			arena.leaderboard('backtest',false,'','standard',[agent.id]).catch(()=>[]),
		]);
		const family=rows.flatMap(r=>r.evidence?.family?[{label:`${r.epic} · 1:${r.leverage}`,family:r.evidence.family}]:[]);
		const brief=findStrategyDocForSlug(agent.slug);
		const ruleSpec=agentRuleSpec(agent,new Map(btRows.map(r=>[r.runId,r])));
        return {agent:{...agent,name:cleanAgentName(agent.id,agent.name),runs:agent.runs.filter(r=>!r.id.includes(':delay='))},family,ruleSpec,brief:brief?{id:brief.id,name:brief.name,verdict:brief.verdict,bestFit:brief.bestFit,expectedEdge:brief.expectedEdge,tldr:brief.tldr}:null};
	} catch (err) {
		error(404, err instanceof Error ? err.message : 'agent not found');
	}
}
