import { env } from '$env/dynamic/private';
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
	const url = `${env.BACKEND_URL ?? 'http://localhost:3001'}${path}`;

	let res: Response;
	try {
		res = await fetch(url, {
			...init,
			headers: {
				'Content-Type': 'application/json',
				...init?.headers,
			},
		});
	} catch {
		throw new Error('Backend unreachable — is the trader-backend running?');
	}

	const text = await res.text();

	if (!res.ok) {
		let msg = `API ${res.status}: ${res.statusText}`;
		try {
			const body = JSON.parse(text);
			if (body.error) msg = body.error;
		} catch { /* not JSON */ }
		throw new Error(msg);
	}

	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`Backend returned non-JSON response (${res.status})`);
	}
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
