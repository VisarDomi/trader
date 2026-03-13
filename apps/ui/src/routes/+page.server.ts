import { getLeaderboard } from '$lib/server/api';

export async function load({ url }) {
	const sortBy = url.searchParams.get('sortBy') ?? 'totalReturn';
	const mode = url.searchParams.get('mode') ?? 'backtest';
	try {
		const leaderboard = await getLeaderboard(sortBy);
		return { leaderboard, sortBy, mode, error: null };
	} catch (e) {
		return { leaderboard: [], sortBy, mode, error: (e as Error).message };
	}
}
