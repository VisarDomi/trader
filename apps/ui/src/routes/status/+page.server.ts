import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load() {
	try {
		const [status, events] = await Promise.all([arena.status(), arena.events(300)]);
		return { status, events, error: null };
	} catch (err) {
		return { status: null, events: [], error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
