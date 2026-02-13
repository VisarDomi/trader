import { BACKEND_URL } from '$env/static/private';
import type {
	AgentSummary,
	EquityPoint,
	Fill,
	InstrumentInfo,
	Metrics,
	RunConfig,
	RunRecord,
} from '$lib/types';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const url = `${BACKEND_URL}${path}`;
	const res = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `API ${res.status}: ${res.statusText}`);
	}

	return res.json();
}

// Health
export function getHealth(): Promise<{ status: string; timestamp: number }> {
	return api('/health');
}

// Agents
export function getAgents(): Promise<AgentSummary[]> {
	return api('/agents');
}

export function getAgent(id: string): Promise<AgentSummary> {
	return api(`/agents/${id}`);
}

// Instruments
export function getInstruments(): Promise<Record<string, InstrumentInfo>> {
	return api('/instruments');
}

// Runs
export function listRuns(filters?: {
	mode?: string;
	status?: string;
	agentId?: string;
}): Promise<RunRecord[]> {
	const params = new URLSearchParams();
	if (filters?.mode) params.set('mode', filters.mode);
	if (filters?.status) params.set('status', filters.status);
	if (filters?.agentId) params.set('agentId', filters.agentId);
	const qs = params.toString();
	return api(`/runs${qs ? `?${qs}` : ''}`);
}

export function getRun(id: string): Promise<RunRecord> {
	return api(`/runs/${id}`);
}

export function getRunMetrics(id: string): Promise<Metrics> {
	return api(`/runs/${id}/metrics`);
}

export function getRunFills(id: string): Promise<Fill[]> {
	return api(`/runs/${id}/fills`);
}

export function getRunEquityCurve(id: string): Promise<EquityPoint[]> {
	return api(`/runs/${id}/equity-curve`);
}

// Leaderboard
export function getLeaderboard(sortBy?: string): Promise<RunRecord[]> {
	const qs = sortBy ? `?sortBy=${sortBy}` : '';
	return api(`/leaderboard${qs}`);
}

// Actions
export function startRun(config: RunConfig): Promise<{ runId: string; status: string; metrics?: Metrics }> {
	return api('/runs', {
		method: 'POST',
		body: JSON.stringify(config),
	});
}

export function stopRun(id: string): Promise<{ status: string; runId: string }> {
	return api(`/runs/${id}/stop`, { method: 'POST' });
}
