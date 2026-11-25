import { arena } from '$lib/server/arena';
import { buildStrategyCatalog } from '$lib/server/strategies';

export async function load() {
	const agents = await arena.agents().catch(() => []);
	return { catalog: buildStrategyCatalog(agents) };
}
