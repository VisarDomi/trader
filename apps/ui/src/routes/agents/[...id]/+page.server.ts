import { error } from '@sveltejs/kit';
import { arena } from '$lib/server/arena';

export async function load({ params }) {
	try {
		const agent=await arena.agent(params.id);
        return {agent:{...agent,runs:agent.runs.filter(r=>!r.id.includes(':delay='))}};
	} catch (err) {
		error(404, err instanceof Error ? err.message : 'agent not found');
	}
}
