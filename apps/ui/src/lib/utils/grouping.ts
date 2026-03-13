import type { AgentSummary, RunRecord, Metrics } from '@trader/shared';

export function getBehavior(agentId: string): string {
	return agentId.split('/')[0];
}

export function getDimension(agentId: string): string {
	const idx = agentId.indexOf('/');
	return idx === -1 ? '' : agentId.slice(idx + 1);
}

export interface BehaviorAgentGroup {
	behavior: string;
	agents: AgentSummary[];
	instruments: string[];
	feeds: string[];
}

export function groupAgentsByBehavior(agents: AgentSummary[]): BehaviorAgentGroup[] {
	const map = new Map<string, AgentSummary[]>();
	for (const agent of agents) {
		const b = getBehavior(agent.id);
		const list = map.get(b);
		if (list) list.push(agent);
		else map.set(b, [agent]);
	}

	return Array.from(map.entries()).map(([behavior, group]) => ({
		behavior,
		agents: group,
		instruments: [...new Set(group.map((a) => a.config.instrument))],
		feeds: [...new Set(group.map((a) => a.config.primaryFeed))],
	}));
}

export interface BehaviorRunGroup {
	behavior: string;
	runs: RunRecord[];
	bestRun: RunRecord;
	dimCount: number;
}

const metricHigherIsBetter: Record<string, boolean> = {
	totalReturn: true,
	sharpe: true,
	winRate: true,
	totalPnL: true,
	profitFactor: true,
	totalTrades: true,
	maxDrawdown: false,
};

function getMetricValue(run: RunRecord, key: string): number {
	if (!run.metrics) return -Infinity;
	const val = run.metrics[key as keyof Metrics];
	if (typeof val !== 'number' || !isFinite(val)) return -Infinity;
	return val;
}

export function groupRunsByBehavior(runs: RunRecord[], sortKey: string): BehaviorRunGroup[] {
	const map = new Map<string, RunRecord[]>();
	for (const run of runs) {
		const b = getBehavior(run.agentId);
		const list = map.get(b);
		if (list) list.push(run);
		else map.set(b, [run]);
	}

	const higherBetter = metricHigherIsBetter[sortKey] ?? true;

	return Array.from(map.entries())
		.map(([behavior, group]) => {
			const sorted = [...group].sort((a, b) => {
				const va = getMetricValue(a, sortKey);
				const vb = getMetricValue(b, sortKey);
				return higherBetter ? vb - va : va - vb;
			});
			return {
				behavior,
				runs: sorted,
				bestRun: sorted[0],
				dimCount: new Set(group.map((r) => r.agentId)).size,
			};
		})
		.sort((a, b) => {
			const va = getMetricValue(a.bestRun, sortKey);
			const vb = getMetricValue(b.bestRun, sortKey);
			return higherBetter ? vb - va : va - vb;
		});
}
