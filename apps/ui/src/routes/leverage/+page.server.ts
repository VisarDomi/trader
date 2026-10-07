import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load() {
	try {
		const [demo, broker] = await Promise.all([arena.leaderboard('demo'), arena.broker()]);
		return { demo, accounts: broker.status?.accounts ?? [], error: null };
	} catch (err) {
		return { demo: [], accounts: [], error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
