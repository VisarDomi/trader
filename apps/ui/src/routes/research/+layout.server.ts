import { topics } from '$lib/server/research';

export function load() {
	return { topics: topics().map(t => ({ slug: t.slug, name: t.name })) };
}
