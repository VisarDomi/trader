/**
 * The research library (repo `research/`, see its README.md).
 *
 * The report, topic notes and source lists are bundled at build time, so a push
 * publishes them. The reference files (papers, page snapshots) are not in git:
 * they live in RESEARCH_DIR/files on the server (synced by
 * ops/server/sync-research.sh) and are served by /research/files/….
 */
import { existsSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import { Marked, type Tokens } from 'marked';

export interface Source {
	id: string;
	title: string;
	authors?: string;
	year?: number | string;
	kind?: string;
	url?: string;
	file?: string | null;
	summary?: string;
	/** Topic slug the source was collected for. */
	topic: string;
}

export interface Topic {
	slug: string;
	/** Short name for the tabs. */
	name: string;
	title: string;
	/** The note's "In short" bullets, as HTML. */
	inShort: string[];
}

const ROOT = '../../../../../research/';
/** Tab names, in reading order; notes not listed come last, by title. */
const TOPIC_NAMES: Record<string, string> = {
	leverage: 'Leverage',
	unlevered: 'Trading at 1:1',
	anomalies: 'Anomalies',
	portfolio: 'Portfolios',
	'ai-trading': 'AI trading',
	community: 'Communities',
	reddit: 'Reddit',
};
const ORDER = Object.keys(TOPIC_NAMES);
const REPO_BLOB = 'https://github.com/VisarDomi/trader/blob/main/';
/** "[leverage-03]", "[portfolio-10..15]", "[anomalies-05, anomalies-07]". */
const CITATION = /\[((?:[a-z0-9]+-)+\d{2,3}(?:\s*(?:,|;|\.\.|–)\s*(?:(?:[a-z0-9]+-)+)?\d{2,3})*)\]/g;
const BARE_FILE = /(?<![="/\w])(files\/[\w./-]+\.(?:pdf|md|html|txt|csv|json))/g;

const docs = import.meta.glob(['../../../../../research/**/*.md', '!../../../../../research/files/**'], {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;
const sourceLists = import.meta.glob('../../../../../research/sources/*.json', { import: 'default', eager: true }) as Record<
	string,
	Omit<Source, 'topic'>[]
>;

/** "research/topics/leverage.md" → its text. */
const byPath = new Map(Object.entries(docs).map(([k, v]) => [`research/${k.slice(ROOT.length)}`, v]));

/** Where reference files are on this machine: RESEARCH_DIR, else ./research (server), else the repo's (dev). */
export function researchDir(): string {
	if (env.RESEARCH_DIR) return resolve(env.RESEARCH_DIR);
	return existsSync('research/files') ? resolve('research') : resolve('../../research');
}

export function doc(path: string): string | null {
	return byPath.get(path) ?? null;
}

export function topics(): Topic[] {
	const out: Topic[] = [];
	for (const [path, text] of byPath) {
		const m = /^research\/topics\/([\w-]+)\.md$/.exec(path);
		if (!m) continue;
		const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? m[1]!;
		const short = /^## In short\s*\n([\s\S]*?)(?=\n## |$)/m.exec(text)?.[1] ?? '';
		const bullets = short
			.split(/\n(?=\s*[-*]\s)/)
			.map(b => b.replace(/^\s*[-*]\s+/, '').replace(/\s*\n\s*/g, ' ').trim())
			.filter(Boolean);
		const slug = m[1]!;
		out.push({ slug, name: TOPIC_NAMES[slug] ?? title, title, inShort: bullets.map(b => inline(b, `research/topics`)) });
	}
	const rank = (t: Topic) => (ORDER.includes(t.slug) ? ORDER.indexOf(t.slug) : ORDER.length);
	return out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

export function sources(): Source[] {
	const out: Source[] = [];
	for (const [path, list] of Object.entries(sourceLists)) {
		const topic = /([\w-]+)\.json$/.exec(path)![1]!;
		for (const s of Array.isArray(list) ? list : []) out.push({ ...s, topic });
	}
	return out;
}

/** Markdown → HTML. `dir` is the document's folder in the repo, for relative links. */
export function render(src: string, dir: string): string {
	return postprocess(parser(dir).parse(src) as string);
}

function inline(src: string, dir: string): string {
	return postprocess(parser(dir).parseInline(src) as string);
}

function parser(dir: string): Marked {
	return new Marked({
		gfm: true,
		renderer: {
			// Notes quote web pages: show any raw HTML as text.
			html: ({ text }: Tokens.HTML | Tokens.Tag) => escape(text),
			heading({ tokens, depth }: Tokens.Heading) {
				const text = this.parser.parseInline(tokens);
				const id = text.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
				return `<h${depth} id="${id}">${text}</h${depth}>\n`;
			},
			link({ href, tokens }: Tokens.Link) {
				const url = resolveHref(href, dir);
				const external = /^https?:/.test(url);
				return `<a href="${escape(url)}"${external ? ' rel="noopener" target="_blank"' : ''}>${this.parser.parseInline(tokens)}</a>`;
			},
		},
	});
}

/** Repo-relative links become dashboard links: notes → /research/<slug>, reference files → /research/files/…. */
export function resolveHref(href: string, dir: string): string {
	if (/^(https?:|mailto:|#|\/)/.test(href)) return href;
	const [path = '', hash = ''] = href.split('#');
	// Source lists and notes name reference files relative to research/.
	const full = /^files\//.test(path) ? `research/${path}` : posix.normalize(posix.join(dir, path));
	const anchor = hash ? `#${hash}` : '';
	if (full.startsWith('research/files/')) return `/research/${full.slice('research/'.length)}`;
	if (full === 'research/report.md' || full === 'research/README.md') return `/research${anchor}`;
	const topic = /^research\/topics\/([\w-]+)\.md$/.exec(full);
	if (topic) return `/research/${topic[1]}${anchor}`;
	if (full.startsWith('research/sources/')) return '/research/library';
	return `${REPO_BLOB}${full}${anchor}`;
}

/** Link citations ("[leverage-03]") and bare reference-file paths, outside existing links. */
function postprocess(html: string): string {
	return html
		.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/)
		.map((part, i) =>
			i % 2
				? part
				: part
						.replace(CITATION, (_, group: string) => `[${citeLinks(group)}]`)
						.replace(BARE_FILE, (_, f: string) => `<a href="/research/${f}">${f}</a>`),
		)
		.join('');
}

/** Each id in a citation group links to its library entry; "10..15" after "portfolio-" means portfolio-15. */
function citeLinks(group: string): string {
	let prefix = '';
	return group.replace(/((?:[a-z0-9]+-)+)?(\d{2,3})/g, (_, p: string | undefined, n: string) => {
		if (p) prefix = p;
		return `<a class="cite" href="/research/library#${prefix}${n}">${p ?? ''}${n}</a>`;
	});
}

function escape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
