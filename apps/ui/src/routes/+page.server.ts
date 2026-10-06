import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load({ url }) {
	const retired = url.searchParams.get('retired') === '1';
	try {
		const [demo, backtest] = await Promise.all([arena.leaderboard('demo', retired), arena.leaderboard('backtest')]);
		return { demo, backtest, error: null };
	} catch (err) {
		return { demo: [], backtest: [], error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
