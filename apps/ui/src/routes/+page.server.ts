import { arena } from '$lib/server/arena';
import { LeaderboardPages } from '$lib/server/leaderboard-page';

const pages=new LeaderboardPages(arena);

export async function load({ url }) {
  const [page, portfolios] = await Promise.all([pages.load(url), arena.portfolios().catch(() => [])]);
  return { ...page, portfolios };
}
