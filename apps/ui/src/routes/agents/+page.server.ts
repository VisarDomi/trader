import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load() {
	try {
		return { agents: await arena.agents(), error: null };
	} catch (err) {
		return { agents: [], error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
