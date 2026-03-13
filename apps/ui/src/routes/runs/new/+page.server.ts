import { getBlueprints, startRunQueued, getQueueState } from '$lib/server/api';
import type { BlueprintMeta, RunConfig, QueueState } from '$lib/types';

export async function load() {
	let blueprints: BlueprintMeta[] = [];
	let error: string | null = null;
	let queue: QueueState = { current: null, queued: [], queueLength: 0 };

	try {
		blueprints = await getBlueprints();
	} catch (e) {
		error = (e as Error).message;
	}

	try {
		queue = await getQueueState();
	} catch {
		// Queue unavailable — show empty
	}

	return { blueprints, error, queue };
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

		let queued = 0;
		let duplicates = 0;
		let errors = 0;
		const errorMessages: string[] = [];

		for (const agentId of agentIds) {
			const config: RunConfig = { agentId, capital, mode };
			if (startDate) config.startDate = startDate;
			if (endDate) config.endDate = endDate;
			if (maxDrawdown) config.maxDrawdown = Number(maxDrawdown);
			if (tickMode) config.tickMode = true;

			try {
				const result = await startRunQueued(config);
				if (result.duplicate) {
					duplicates++;
				} else {
					queued++;
				}
			} catch (e) {
				errors++;
				errorMessages.push(`${agentId}: ${(e as Error).message}`);
			}
		}

		return {
			success: true,
			summary: {
				queued,
				duplicates,
				errors,
				total: agentIds.length,
			},
			error: errorMessages.length > 0 ? errorMessages.join('\n') : null,
		};
	},
};
