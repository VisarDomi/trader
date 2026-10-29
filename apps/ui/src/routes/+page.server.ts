import { arena } from '$lib/server/arena';
import { LeaderboardPages } from '$lib/server/leaderboard-page';

const pages=new LeaderboardPages(arena);

export async function load({ url }) {
  return pages.load(url);
}
