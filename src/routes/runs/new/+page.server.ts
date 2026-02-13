import { getAgents, getInstruments, startRun } from '$lib/server/api';
import { redirect } from '@sveltejs/kit';
import type { RunConfig } from '$lib/types';

export async function load({ url }) {
	const preselectedAgent = url.searchParams.get('agentId') ?? '';
	try {
		const [agents, instruments] = await Promise.all([
			getAgents(),
			getInstruments(),
		]);
		return { agents, instruments, preselectedAgent, error: null };
	} catch (e) {
		return { agents: [], instruments: {}, preselectedAgent, error: (e as Error).message };
	}
}

export const actions = {
	default: async ({ request }) => {
		const form = await request.formData();

		const config: RunConfig = {
			agentId: form.get('agentId') as string,
			capital: Number(form.get('capital')),
			mode: form.get('mode') as RunConfig['mode'],
		};

		const startDate = form.get('startDate') as string;
		const endDate = form.get('endDate') as string;
		if (startDate) config.startDate = startDate;
		if (endDate) config.endDate = endDate;

		const maxDrawdown = form.get('maxDrawdown') as string;
		if (maxDrawdown) config.maxDrawdown = Number(maxDrawdown);

		const leverage = form.get('leverage') as string;
		if (leverage) config.leverage = Number(leverage);

		const tickMode = form.get('tickMode');
		if (tickMode === 'on') config.tickMode = true;

		try {
			const result = await startRun(config);
			redirect(303, `/runs/${result.runId}`);
		} catch (e) {
			return { error: (e as Error).message };
		}
	},
};
