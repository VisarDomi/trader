/**
 * Consistent agent display names, family categorization, and plain-English rule specs.
 * Used across both the Web UI and iPhone API v2 screens without altering strategy codeHashes.
 */
import type { AgentDetail, AgentListItem, LeaderboardRow } from '@trader/shared';
import roster from '../../../../../apps/backend/agents/roster.json';

export type AgentCategoryId = 'visar' | 'trend' | 'reversion' | 'allocation' | 'forecast' | 'controls';

export const AGENT_CATEGORIES: readonly { id: AgentCategoryId; title: string }[] = [
	{ id: 'visar', title: 'Visar Night' },
	{ id: 'trend', title: 'Trend & Momentum' },
	{ id: 'reversion', title: 'Mean Reversion & Session' },
	{ id: 'allocation', title: 'Volatility & Allocation' },
	{ id: 'forecast', title: 'TimesFM Forecast' },
	{ id: 'controls', title: 'Controls & Benchmarks' },
];

const VISAR_VARIANT_LABELS: Record<string, string> = {
	'full-day-200': 'Full Day 1:200',
	'midday-200': 'Midday 1:200',
	'midday-20': 'Midday 1:20',
	'full-day-20': 'Full Day 1:20',
	'no-pullback-20': 'No Pullback 1:20',
	'loose-body-20': 'Loose Body 1:20',
	'any-day-20': 'Any Day 1:20',
	'every-night-20': 'Every Night 1:20',
	'always-long': 'Always Long',
	'random-direction': 'Random Direction',
};

const EXACT_NAME_FIXES: Record<string, string> = {
	'cppi/cppi': 'CPPI · Standard',
	'cppi/tipp': 'CPPI · TIPP',
	'lrs-sma200/x1': 'Leverage Rotation 200d · 1×',
	'lrs-sma200/x2': 'Leverage Rotation 200d · 2×',
	'lrs-sma200/x3': 'Leverage Rotation 200d · 3×',
	'random-baseline/monkey-a': 'Random Baseline · Monkey A',
	'random-baseline/monkey-b': 'Random Baseline · Monkey B',
	'random-baseline/monkey-c': 'Random Baseline · Monkey C',
	'quote-breakout/immediate': 'Quote-Aware Range Breakout · Immediate',
	'quote-breakout/spread-gated': 'Quote-Aware Range Breakout · Spread-Gated',
	'tsmom-12m': 'Time-Series Momentum · 12m',
	'tsmom/20d': 'Time-Series Momentum · 20d',
	'tsmom/5d': 'Time-Series Momentum · 5d',
	'bold-play': 'Bold Play · 1:200',
	'timesfm-swing': 'TimesFM Swing · 4h',
};

/** Normalize agent display names consistently (Title Case, no double parentheses, no raw slugs). */
export function cleanAgentName(id: string, rawName: string): string {
	if (EXACT_NAME_FIXES[id]) return EXACT_NAME_FIXES[id]!;
	const [slug, variant] = id.split('/');
	if (slug === 'visar-night' && variant && VISAR_VARIANT_LABELS[variant]) {
		return `Visar Night · ${VISAR_VARIANT_LABELS[variant]}`;
	}
	if (slug === 'visar-night-control' && variant && VISAR_VARIANT_LABELS[variant]) {
		return `Visar Night Control · ${VISAR_VARIANT_LABELS[variant]}`;
	}
	// Replace trailing " (variant)" with " · variant" and avoid double parentheses like "Foo (bar) (baz)".
	const match = /^(.*?)\s+\(([^()]+)\)$/.exec(rawName.trim());
	if (match) {
		const base = match[1]!.replace(/\s*\(([^()]+)\)$/, ' $1').trim();
		const suffix = match[2]!.trim();
		return `${base} · ${suffix}`;
	}
	return rawName.trim();
}

const TREND_SLUGS = new Set([
	'tsmom', 'tsmom-12m', 'donchian-breakout', 'donchian-ensemble', 'ema-cross', 'macd-trend',
	'supertrend', 'adx-dmi', 'hma-slope', 'keltner-trend', 'lrs-sma200', 'noise-area-momentum',
]);
const ALLOCATION_SLUGS = new Set(['vol-managed-hold', 'vol-target', 'cppi', 'shannon-demon']);
const CONTROL_SET = new Set([
	'buy-hold', 'random-baseline', 'leverage-ladder', 'constant-leverage',
	'bold-play', 'martingale-monkey', 'skew-monkey', 'visar-night-control',
]);

export function agentCategory(slug: string): AgentCategoryId {
	if (slug === 'visar-night') return 'visar';
	if (CONTROL_SET.has(slug)) return 'controls';
	if (slug.startsWith('timesfm-')) return 'forecast';
	if (TREND_SLUGS.has(slug)) return 'trend';
	if (ALLOCATION_SLUGS.has(slug)) return 'allocation';
	return 'reversion';
}

export function leverageTiersForAgent(id: string, slug: string): number[] {
	const agentsMap = (roster as { leverage?: { default?: number; agents?: Record<string, number[]> } }).leverage?.agents ?? {};
	const def = (roster as { leverage?: { default?: number } }).leverage?.default ?? 20;
	return agentsMap[id] ?? agentsMap[slug] ?? [def];
}

export interface AgentRuleSummary {
	headline: string;
	subtitle: string;
	stats: { label: string; value: string; tone?: -1 | 0 | 1 }[];
	lines: string[];
}

function fmtMinute(m: number): string {
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function pctText(v: number | null | undefined): string {
	if (v == null || !Number.isFinite(v)) return '—';
	return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;
}

/** Plain-English rule specification shown right at the top when clicking an agent. */
export function agentRuleSpec(
	agent: Pick<AgentDetail, 'id' | 'slug' | 'variant' | 'timeframe' | 'instruments' | 'params' | 'description'>,
	backtests?: Map<string, LeaderboardRow>,
): AgentRuleSummary {
	const tiers = leverageTiersForAgent(agent.id, agent.slug);
	const tierLabel = tiers.map(t => `1:${t}`).join(', ');
	const p = (agent.params ?? {}) as Record<string, unknown>;
	const btRows = [...(backtests?.values() ?? [])].filter(r => r.agentId === agent.id);

	if (agent.slug === 'visar-night' || agent.slug === 'visar-night-control') {
		const start = Number(p.sessionStart ?? 570);
		const end = Number(p.sessionEnd ?? 960);
		const windowName = start === 570 && end === 960 ? 'Full NY cash day (09:30–16:00 NY)' : `Midday NY core (${fmtMinute(start)}–${fmtMinute(end)} NY)`;
		const pullbackReq = p.pullback !== 0;
		const minGap = Number(p.minPullbackBp ?? 0);
		const dir = String(p.direction ?? 'rule');
		const trendPct = Number(p.trendPct ?? 0.25);
		const bodyPct = Math.round(Number(p.minBodyShare ?? 0.6) * 100);
		const filterDesc =
			trendPct === 0 && bodyPct === 0
				? 'Any up/down day (day filter off)'
				: bodyPct === 30
					? 'Loose body (≥0.25% move, ≥30% body, ≤2% range)'
					: `Standard (≥${trendPct}% move, ≥${bodyPct}% body, ≤${Number(p.maxRangePct ?? 2)}% range)`;
		const entryDesc =
			dir === 'long'
				? 'Control: always long on qualifying midday-20 nights'
				: dir === 'random'
					? 'Control: fair coin flip on qualifying midday-20 nights'
					: pullbackReq
						? minGap > 0
							? `Follow day direction after ≥${minGap} bp overnight pullback`
							: 'Follow day direction after overnight pullback vs 16:00 NY close'
						: 'Follow day direction at 21:27 NY (no pullback required)';

		const us100 = btRows.find(r => r.epic === 'US100');
		const us500 = btRows.find(r => r.epic === 'US500');
		const stats: AgentRuleSummary['stats'] = [
			{ label: 'Leverage', value: tierLabel },
			{
				label: 'US100 BT',
				value: us100?.metrics ? `${pctText(us100.metrics.totalReturn)} (${us100.metrics.trades})` : '—',
				tone: us100?.metrics ? (us100.metrics.totalReturn > 0 ? 1 : us100.metrics.totalReturn < 0 ? -1 : 0) : 0,
			},
			{
				label: 'US500 BT',
				value: us500?.metrics ? `${pctText(us500.metrics.totalReturn)} (${us500.metrics.trades})` : '—',
				tone: us500?.metrics ? (us500.metrics.totalReturn > 0 ? 1 : us500.metrics.totalReturn < 0 ? -1 : 0) : 0,
			},
		];
		const lines = [
			`Session: ${windowName}`,
			`Clock: 16:00 NY ref → 21:27 NY entry → 02:27 NY exit (Mon–Thu)`,
			`Entry: ${entryDesc}`,
			`Day filter: ${filterDesc} · skips FOMC & BOJ days`,
			`Risk: ${Number(p.marginPct ?? 90)}% margin · ${Number(p.lossPct ?? 50)}% capital stop · no take-profit`,
			`Symmetric pair: exact same rule runs on US500 and US100`,
		];
		return {
			headline: `${windowName} · ${tierLabel}`,
			subtitle: `${agent.timeframe} · ${agent.instruments.join(' & ')} · NY clocks`,
			stats,
			lines,
		};
	}

	const entries = Object.entries(p).filter(([, v]) => v !== undefined && v !== null);
	const paramLine = entries
		.map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
		.join(' · ');
	const btReturns = btRows.map(r => r.metrics?.totalReturn).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
	const medianBt = btReturns.length ? btReturns[Math.floor(btReturns.length / 2)] : null;
	const btTrades = btRows.reduce((n, r) => n + (r.metrics?.trades ?? 0), 0);

	const instruments = agent.instruments ?? [];
	const timeframe = agent.timeframe ?? '—';
	return {
		headline: `${timeframe} · ${tierLabel}${instruments.length ? ` · ${instruments.length} ${instruments.length === 1 ? 'market' : 'markets'}` : ''}`,
		subtitle: instruments.join(', '),
		stats: [
			{ label: 'Timeframe', value: timeframe },
			{ label: 'Leverage', value: tierLabel },
			{
				label: 'Median BT',
				value: medianBt != null ? `${pctText(medianBt)}${btTrades ? ` (${btTrades} tr)` : ''}` : '—',
				tone: medianBt != null ? (medianBt > 0 ? 1 : medianBt < 0 ? -1 : 0) : 0,
			},
		],
		lines: [agent.description, ...(paramLine ? [`Settings: ${paramLine}`] : [])].filter(Boolean),
	};
}

export function groupActiveAgents(items: AgentListItem[]): { id: AgentCategoryId; title: string; items: AgentListItem[] }[] {
	const buckets = new Map<AgentCategoryId, AgentListItem[]>();
	for (const a of items.filter(x => x.active)) {
		const cat = agentCategory(a.slug);
		const list = buckets.get(cat) ?? [];
		list.push(a);
		buckets.set(cat, list);
	}
	const out: { id: AgentCategoryId; title: string; items: AgentListItem[] }[] = [];
	for (const c of AGENT_CATEGORIES) {
		const list = buckets.get(c.id);
		if (!list?.length) continue;
		list.sort((a, b) => cleanAgentName(a.id, a.name).localeCompare(cleanAgentName(b.id, b.name), undefined, { numeric: true }));
		out.push({ id: c.id, title: c.title, items: list });
	}
	return out;
}
