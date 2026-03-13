import { getRun, getRunFills, getRunEquityCurve, stopRun } from '$lib/server/api';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const { id } = params;
	try {
		const [run, fills, equityCurve] = await Promise.all([
			getRun(id),
			getRunFills(id),
			getRunEquityCurve(id),
		]);
		return { run, fills, equityCurve, error: null };
	} catch (e) {
		const msg = (e as Error).message;
		if (msg.includes('not found')) error(404, 'Run not found');
		return { run: null, fills: [], equityCurve: [], error: msg };
	}
}

export const actions = {
	stop: async ({ params }) => {
		await stopRun(params.id);
		return { stopped: true };
	},
};
