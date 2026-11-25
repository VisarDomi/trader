import { error } from '@sveltejs/kit';
import { arena } from '$lib/server/arena';
import { render } from '$lib/server/research';
import { buildStrategyCatalog, findStrategy } from '$lib/server/strategies';

export async function load({ params }) {
	const agents = await arena.agents().catch(() => []);
	const item = findStrategy(buildStrategyCatalog(agents), params.slug);
	if (!item) error(404, 'Strategy not found');
	return {
		item,
		sections: item.sections.map(s => ({ title: s.title, html: render(s.body, 'research/strategies') })),
	};
}
