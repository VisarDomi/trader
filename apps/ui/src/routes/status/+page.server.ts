import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load() {
	try {
		const [status, events, execution] = await Promise.all([arena.status(), arena.events(300), arena.execution()]);
		return { status, events, execution, error: null };
	} catch (err) {
		return { status: null, events: [], execution: null, error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
