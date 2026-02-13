import { getBlueprints, startRun } from '$lib/server/api';
import { redirect } from '@sveltejs/kit';
import type { RunConfig } from '$lib/types';

export async function load() {
	try {
		const blueprints = await getBlueprints();
		return { blueprints, error: null };
	} catch (e) {
		return { blueprints: [], error: (e as Error).message };
	}
}

export const actions = {
	default: async ({ request }) => {
		const form = await request.formData();

		const agentIds = form.getAll('agentId') as string[];
		if (agentIds.length === 0) {
			return { error: 'No agents selected' };
		}

		const mode = form.get('mode') as RunConfig['mode'];
		const capital = Number(form.get('capital'));
		const startDate = form.get('startDate') as string;
		const endDate = form.get('endDate') as string;
		const maxDrawdown = form.get('maxDrawdown') as string;
		const tickMode = form.get('tickMode') === 'on';

		const errors: string[] = [];
		const runIds: string[] = [];

		for (const agentId of agentIds) {
			const config: RunConfig = { agentId, capital, mode };
			if (startDate) config.startDate = startDate;
			if (endDate) config.endDate = endDate;
			if (maxDrawdown) config.maxDrawdown = Number(maxDrawdown);
			if (tickMode) config.tickMode = true;

			try {
				const result = await startRun(config);
				runIds.push(result.runId);
			} catch (e) {
				errors.push(`${agentId}: ${(e as Error).message}`);
			}
		}

		if (runIds.length === 1) {
			redirect(303, `/runs/${runIds[0]}`);
		}

		if (runIds.length > 1) {
			// Multiple runs started — redirect to home with mode filter
			redirect(303, `/?mode=${mode}`);
		}

		return { error: errors.join('\n') };
	},
};
