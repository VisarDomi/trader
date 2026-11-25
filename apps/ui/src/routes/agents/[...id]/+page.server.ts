import { error } from '@sveltejs/kit';
import { arena } from '$lib/server/arena';
import { findStrategyDocForSlug } from '$lib/server/strategies';

export async function load({ params }) {
	try {
		const agent=await arena.agent(params.id);
		// What the family says about each of this agent's live records (its own section on the page).
		const rows=await arena.leaderboard('demo',false,'','standard',[agent.id]).catch(()=>[]);
		const family=rows.flatMap(r=>r.evidence?.family?[{label:`${r.epic} · 1:${r.leverage}`,family:r.evidence.family}]:[]);
		const brief=findStrategyDocForSlug(agent.slug);
        return {agent:{...agent,runs:agent.runs.filter(r=>!r.id.includes(':delay='))},family,brief:brief?{id:brief.id,name:brief.name,verdict:brief.verdict,bestFit:brief.bestFit,expectedEdge:brief.expectedEdge,tldr:brief.tldr}:null};
	} catch (err) {
		error(404, err instanceof Error ? err.message : 'agent not found');
	}
}
