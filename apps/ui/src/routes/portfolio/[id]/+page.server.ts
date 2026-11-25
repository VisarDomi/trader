import { error } from '@sveltejs/kit';
import { arena } from '$lib/server/arena';

export async function load({ params }) {
	const portfolio = (await arena.portfolios()).find(p => p.id === params.id);
	if (!portfolio) error(404, 'No such portfolio');
	return { portfolio };
}
