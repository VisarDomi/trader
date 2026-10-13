import { error } from '@sveltejs/kit';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { render, researchDir } from '$lib/server/research';

const TYPES: Record<string, string> = {
	'.pdf': 'application/pdf',
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.csv': 'text/csv; charset=utf-8',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.svg': 'image/svg+xml',
};

/** Reference files (papers, page snapshots) from RESEARCH_DIR/files. Markdown snapshots are shown as pages; ?raw for the source. */
export function GET({ params, url }) {
	const root = resolve(researchDir(), 'files');
	const full = resolve(root, params.path);
	if (!full.startsWith(root + sep) || !existsSync(full) || !statSync(full).isFile()) {
		error(404, 'This file is not on the server (yet): reference files are synced separately from the dashboard.');
	}
	const ext = extname(full).toLowerCase();
	const headers = { 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' };
	if (ext === '.md' && !url.searchParams.has('raw')) {
		const dir = `research/files/${params.path.split('/').slice(0, -1).join('/')}`;
		return new Response(page(params.path, render(readFileSync(full, 'utf8'), dir)), {
			headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
		});
	}
	// Saved web pages are shown as text, never run: they come from other sites.
	const type = ext === '.md' || ext === '.html' || ext === '.htm' ? 'text/plain; charset=utf-8' : (TYPES[ext] ?? 'application/octet-stream');
	return new Response(readFileSync(full), { headers: { ...headers, 'content-type': type } });
}

function page(title: string, body: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title>
<style>
body{font:15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#0b0b0b;background:#f9f9f7}
a{color:#2a78d6}code,pre{font:13px ui-monospace,Menlo,monospace}pre{overflow:auto;background:#f3f3f0;padding:10px;border-radius:6px}
blockquote{border-left:3px solid #c3c2b7;margin:10px 0;padding:2px 12px;color:#52514e}table{border-collapse:collapse}td,th{border:1px solid #e1e0d9;padding:4px 8px}
nav{font-size:13px;margin-bottom:16px}
@media (prefers-color-scheme:dark){body{background:#0d0d0d;color:#fff}a{color:#3987e5}pre{background:#232321}blockquote{color:#c3c2b7}td,th{border-color:#2c2c2a}}
</style></head><body><nav><a href="/research">← Research</a> · <a href="?raw">source</a></nav>${body}</body></html>`;
}
