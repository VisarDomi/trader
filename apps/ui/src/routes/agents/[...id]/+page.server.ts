import { error } from '@sveltejs/kit';
import { arena } from '$lib/server/arena';

export async function load({ params }) {
	try {
		return { agent: await arena.agent(params.id) };
	} catch (err) {
		error(404, err instanceof Error ? err.message : 'agent not found');
	}
}
