import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { researchDir, sources, topics } from '$lib/server/research';

export function load() {
	const dir = researchDir();
	return {
		sources: sources().map(s => ({ ...s, here: !!s.file && existsSync(join(dir, s.file)) })),
		topicTitles: Object.fromEntries(topics().map(t => [t.slug, t.name])),
	};
}
