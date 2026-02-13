import { getLeaderboard } from '$lib/server/api';

export async function load({ url }) {
	const sortBy = url.searchParams.get('sortBy') ?? 'totalReturn';
	try {
		const leaderboard = await getLeaderboard(sortBy);
		return { leaderboard, sortBy, error: null };
	} catch (e) {
		return { leaderboard: [], sortBy, error: (e as Error).message };
	}
}
