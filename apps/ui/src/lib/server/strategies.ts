/**
 * Strategy SOTA Hub catalog (repo `research/strategies/*.md` merged with active agents from the arena).
 *
 * Markdown guides are bundled at build time, so each new strategy research note publishes to both the
 * web dashboard and the native iPhone app as soon as `main` is pushed—no iOS rebuild required.
 */
import type { AgentListItem } from '@trader/shared';
import { CONTROL_SLUGS } from '@trader/shared';
import roster from '../../../../../apps/backend/agents/roster.json';

export type StrategyGroup = 'guide' | 'strategy' | 'control';
export type StrategyStatus = 'researched' | 'queued';

export interface StrategySection {
	title: string;
	body: string;
}

export interface StrategySource {
	title: string;
	url: string;
}

export interface StrategyDoc {
	id: string;
	name: string;
	group: StrategyGroup;
	status: StrategyStatus;
	verdict: string;
	verdictTone: -1 | 0 | 1 | null;
	bestFit: string;
	expectedEdge: string;
	tldr: string;
	slugs: string[];
	sections: StrategySection[];
	sources: StrategySource[];
	markdown: string;
}

export interface StrategyEntry extends StrategyDoc {
	variants: { id: string; name: string; timeframe: string; instruments: string[]; usesForecast: boolean }[];
	timeframes: string[];
	instruments: string[];
	usesForecast: boolean;
}

export interface StrategyCatalog {
	guides: StrategyEntry[];
	researched: StrategyEntry[];
	queued: StrategyEntry[];
	controls: StrategyEntry[];
	all: StrategyEntry[];
}

const rawDocs = import.meta.glob('../../../../../research/strategies/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

const CONTROL_EXPLANATIONS: Record<string, { verdict: string; tldr: string }> = {
	'buy-hold': {
		verdict: 'Benchmark',
		tldr: 'Long-only 0.9× CFD hold control. Measures what simply staying long each market earns after Capital CFD spreads and funding.',
	},
	'random-baseline': {
		verdict: 'Null control',
		tldr: 'Random coin-flip entries with fixed stops/targets. Shows what pure luck looks like so real strategies must beat the luckiest monkey.',
	},
	'leverage-ladder': {
		verdict: 'Leverage control',
		tldr: 'Holds the same market across all nine leverage tiers (1:1 to 1:200) to measure volatility drag, funding drag, and margin-call risk live.',
	},
	'constant-leverage': {
		verdict: 'Drag control',
		tldr: 'Daily-rebalanced leveraged-ETF emulator measuring geometric volatility drag L(L−1)σ²/2 against fixed-unit leverage.',
	},
	'bold-play': {
		verdict: 'Ruin control',
		tldr: 'Dubins & Savage double-or-nothing control at 1:200 (paper only). Tests maximum-variance path to a fixed goal before ruin.',
	},
	'martingale-monkey': {
		verdict: 'Skew control',
		tldr: 'Doubles size after losses (paper only). Demonstrates how negative-skew steamroller payoffs fake high short-term Sharpe before blowing up.',
	},
	'skew-monkey': {
		verdict: 'Skew control',
		tldr: 'High win-rate, tiny-profit, large-loss random control. Calibrates how often zero-edge high-win-rate curves look like leaders.',
	},
};

function parseTone(v: string | undefined): -1 | 0 | 1 | null {
	if (v === '1' || v === '+1') return 1;
	if (v === '-1') return -1;
	if (v === '0') return 0;
	return null;
}

export function parseStrategyMarkdown(fileId: string, raw: string): StrategyDoc {
	const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
	const meta: Record<string, string> = {};
	const bodyText = fmMatch ? fmMatch[2]! : raw;
	if (fmMatch) {
		for (const line of fmMatch[1]!.split(/\r?\n/)) {
			const idx = line.indexOf(':');
			if (idx <= 0) continue;
			meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
		}
	}

	const sections: StrategySection[] = [];
	const sources: StrategySource[] = [];
	let currentTitle = '';
	let currentLines: string[] = [];

	const flush = () => {
		const text = currentLines.join('\n').trim();
		if (!currentTitle || !text) {
			currentLines = [];
			return;
		}
		if (currentTitle.toLowerCase() === 'sources' || currentTitle.toLowerCase() === 'key sources') {
			for (const line of text.split(/\r?\n/)) {
				const m = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(line);
				if (m) sources.push({ title: m[1]!, url: m[2]! });
			}
		} else {
			sections.push({ title: currentTitle, body: text });
		}
		currentLines = [];
	};

	for (const line of bodyText.split(/\r?\n/)) {
		const heading = /^##\s+(.+)$/.exec(line);
		if (heading) {
			flush();
			currentTitle = heading[1]!.trim();
		} else {
			currentLines.push(line);
		}
	}
	flush();

	const group = (meta.group === 'guide' || meta.group === 'control' ? meta.group : 'strategy') as StrategyGroup;
	const status = (meta.status === 'researched' ? 'researched' : 'queued') as StrategyStatus;
	const slugs = (meta.slugs ?? '')
		.split(',')
		.map(s => s.trim())
		.filter(Boolean);

	return {
		id: meta.id || fileId,
		name: meta.name || fileId,
		group,
		status,
		verdict: meta.verdict || (status === 'researched' ? 'Reviewed' : 'Queued'),
		verdictTone: parseTone(meta.verdictTone),
		bestFit: meta.bestFit || '',
		expectedEdge: meta.expectedEdge || '',
		tldr: meta.tldr || '',
		slugs,
		sections,
		sources,
		markdown: bodyText.trim(),
	};
}

const DOCS: StrategyDoc[] = Object.entries(rawDocs)
	.map(([path, text]) => {
		const fileId = /\/([^/]+)\.md$/.exec(path)?.[1] ?? path;
		return parseStrategyMarkdown(fileId, text);
	})
	.sort((a, b) => a.name.localeCompare(b.name));

const FAMILY_CONFIG = (roster.families ?? {}) as Record<string, { name?: string; slugs: string[] }>;

function familyForSlug(slug: string): { id: string; name?: string } {
	for (const [id, fam] of Object.entries(FAMILY_CONFIG)) {
		if (fam.slugs.includes(slug)) return { id, name: fam.name };
	}
	return { id: slug };
}

/** Merges researched strategy notes with every currently active agent family from the arena. */
export function buildStrategyCatalog(agents: AgentListItem[]): StrategyCatalog {
	const active = agents.filter(a => a.active);
	const byId = new Map<string, StrategyEntry>();

	// 1. Seed all markdown strategy docs first (guides + researched strategy files).
	for (const d of DOCS) {
		byId.set(d.id, { ...d, variants: [], timeframes: [], instruments: [], usesForecast: false });
	}

	// Map agent slugs to an existing StrategyEntry id if declared via `slugs`.
	const slugToDocId = new Map<string, string>();
	for (const d of DOCS) {
		for (const s of d.slugs) slugToDocId.set(s, d.id);
	}

	// 2. Group active agents into their strategy families and attach live metadata.
	const families = new Map<string, { name: string; control: boolean; items: AgentListItem[] }>();
	for (const a of active) {
		const isControl = CONTROL_SLUGS.has(a.slug);
		const fam = familyForSlug(a.slug);
		const docId = slugToDocId.get(a.slug) ?? fam.id;
		const existing = families.get(docId);
		const cleanName = fam.name ?? a.name.replace(/\s*\([^)]+\)$/, '');
		if (existing) {
			existing.items.push(a);
			if (!isControl) existing.control = false;
		} else {
			families.set(docId, { name: cleanName, control: isControl, items: [a] });
		}
	}

	for (const [id, fam] of families) {
		const variants = fam.items
			.map(a => ({ id: a.id, name: a.name, timeframe: a.timeframe, instruments: a.instruments, usesForecast: a.usesForecast }))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
		const timeframes = [...new Set(fam.items.map(a => a.timeframe))];
		const instruments = [...new Set(fam.items.flatMap(a => a.instruments))];
		const usesForecast = fam.items.some(a => a.usesForecast);
		const slugs = [...new Set(fam.items.map(a => a.slug))];

		const existing = byId.get(id);
		if (existing) {
			existing.variants = variants;
			existing.timeframes = timeframes;
			existing.instruments = instruments;
			existing.usesForecast = usesForecast;
			if (!existing.slugs.length) existing.slugs = slugs;
			continue;
		}

		const ctrl = CONTROL_EXPLANATIONS[id];
		const desc = fam.items[0]?.description ?? '';
		byId.set(id, {
			id,
			name: fam.name,
			group: fam.control ? 'control' : 'strategy',
			status: 'queued',
			verdict: fam.control ? (ctrl?.verdict ?? 'Control') : 'Queued',
			verdictTone: null,
			bestFit: fam.control ? 'Baseline control' : `${timeframes.join('/')} · ${instruments.length} markets`,
			expectedEdge: fam.control ? 'Baseline' : 'Not researched yet',
			tldr: fam.control ? (ctrl?.tldr ?? desc) : desc,
			slugs,
			sections: [
				{
					title: fam.control ? 'What this control measures' : 'Current implementation',
					body: fam.control
						? (ctrl?.tldr ?? desc)
						: `${desc}\n\nFull SOTA literature review and implementation audit are queued for this strategy.`,
				},
			],
			sources: [],
			markdown: '',
			variants,
			timeframes,
			instruments,
			usesForecast,
		});
	}

	const all = [...byId.values()];
	const guides = all.filter(x => x.group === 'guide').sort((a, b) => a.name.localeCompare(b.name));
	const researched = all.filter(x => x.group === 'strategy' && x.status === 'researched').sort((a, b) => a.name.localeCompare(b.name));
	const queued = all.filter(x => x.group === 'strategy' && x.status !== 'researched').sort((a, b) => a.name.localeCompare(b.name));
	const controls = all.filter(x => x.group === 'control').sort((a, b) => a.name.localeCompare(b.name));

	return { guides, researched, queued, controls, all };
}

export function findStrategy(catalog: StrategyCatalog, id: string): StrategyEntry | null {
	return catalog.all.find(x => x.id === id) ?? null;
}
