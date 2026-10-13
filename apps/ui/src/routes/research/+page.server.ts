import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { doc, render, researchDir, sources, topics } from '$lib/server/research';

export function load() {
	const report = doc('research/report.md');
	const all = sources();
	const dir = researchDir();
	return {
		// The report's first heading is its title; the page has its own.
		html: report ? render(report.replace(/^# .*\n/, ''), 'research') : null,
		topics: topics(),
		counts: {
			sources: all.length,
			files: all.filter(s => s.file).length,
			filesHere: all.filter(s => s.file && existsSync(join(dir, s.file))).length,
		},
	};
}
