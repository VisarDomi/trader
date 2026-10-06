import { error } from '@sveltejs/kit';
import { arena } from '$lib/server/arena';

export async function load({ params }) {
	try {
		const run = await arena.run(params.id);
		const agent = await arena.agent(run.agentId).catch(() => null);
		return { run, agentName: agent?.name ?? run.agentId };
	} catch (err) {
		error(404, err instanceof Error ? err.message : 'run not found');
	}
}
