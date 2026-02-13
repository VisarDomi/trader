import { getAgent, listRuns } from '$lib/server/api';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const id = params.id;
	try {
		const [agent, runs] = await Promise.all([
			getAgent(id),
			listRuns({ agentId: id }),
		]);
		return { agent, runs, error: null };
	} catch (e) {
		const msg = (e as Error).message;
		if (msg.includes('not found')) error(404, 'Agent not found');
		return { agent: null, runs: [], error: msg };
	}
}
