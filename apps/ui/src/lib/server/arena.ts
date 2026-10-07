/**
 * Server-side client for the arena API (127.0.0.1:4120 on the server; the
 * same port through the SSH tunnel when developing on the lab PC).
 */
import { env } from '$env/dynamic/private';
import type {
	AgentDetail,
	AgentListItem,
	ArenaEvent,
	ArenaStatus,
	BrokerStatus,
	Deal,
	LeaderboardRow,
	RunDetail,
	RunKind,
} from '@trader/shared';

const DEFAULT_ARENA_URL = 'http://127.0.0.1:4120';

function base(): string {
	return env.ARENA_URL ?? env.BACKEND_URL ?? DEFAULT_ARENA_URL;
}

export class ArenaUnavailable extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${base()}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
	} catch {
		throw new ArenaUnavailable(`The arena API at ${base()} is not reachable.`);
	}
	const text = await res.text();
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		throw new Error(`Arena returned non-JSON (${res.status})`);
	}
	if (!res.ok) throw new Error((body as { error?: string }).error ?? `Arena error ${res.status}`);
	return body as T;
}

export const arena = {
	status: () => call<ArenaStatus>('/api/status'),
	events: (limit = 200) => call<ArenaEvent[]>(`/api/events?limit=${limit}`),
	leaderboard: (kind: RunKind, retired = false) => call<LeaderboardRow[]>(`/api/leaderboard?kind=${kind}${retired ? '&retired=1' : ''}`),
	agents: () => call<AgentListItem[]>('/api/agents'),
	agent: (id: string) => call<AgentDetail>(`/api/agents/${id.split('/').map(encodeURIComponent).join('/')}`),
	run: (id: string, trades = 2000) => call<RunDetail>(`/api/runs/${encodeURIComponent(id)}?trades=${trades}`),
	broker: () => call<{ status: BrokerStatus | null; deals: Deal[] }>('/api/broker'),
	setMirror: (enabled: boolean) => post<BrokerStatus>('/api/broker/mirror', { enabled }),
	setExcluded: (runId: string, excluded: boolean) => post<BrokerStatus>('/api/broker/exclude', { runId, excluded }),
};

function post<T>(path: string, body: unknown): Promise<T> {
	return call<T>(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ARENA_TOKEN ?? ''}` },
		body: JSON.stringify(body),
	});
}
