import { getAgent, getAgents, listRuns } from '$lib/server/api';
import { error } from '@sveltejs/kit';
import { getBehavior } from '$lib/utils/grouping';

export async function load({ params }) {
	const id = params.id;
	try {
		const [agent, runs, allAgents] = await Promise.all([
			getAgent(id),
			listRuns({ agentId: id }),
			getAgents(),
		]);
		const behavior = getBehavior(id);
		const siblingCount = allAgents.filter((a) => getBehavior(a.id) === behavior).length;
		return { agent, runs, behavior, siblingCount, error: null };
	} catch (e) {
		const msg = (e as Error).message;
		if (msg.includes('not found')) error(404, 'Agent not found');
		return { agent: null, runs: [], behavior: '', siblingCount: 0, error: msg };
	}
}
