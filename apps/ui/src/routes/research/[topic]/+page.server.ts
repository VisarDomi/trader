import { error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { doc, render, researchDir, sources } from '$lib/server/research';

export function load({ params }) {
	const text = doc(`research/topics/${params.topic}.md`);
	if (!text) error(404, `No research note "${params.topic}"`);
	const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? params.topic;
	const dir = researchDir();
	return {
		slug: params.topic,
		title,
		html: render(text.replace(/^# .*\n/, ''), 'research/topics'),
		sources: sources()
			.filter(s => s.topic === params.topic)
			.map(s => ({ ...s, here: !!s.file && existsSync(join(dir, s.file)) })),
	};
}
