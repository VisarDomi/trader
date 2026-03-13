import { getAgents } from '$lib/server/api';

export async function load() {
	try {
		const agents = await getAgents();
		return { agents, error: null };
	} catch (e) {
		return { agents: [], error: (e as Error).message };
	}
}
