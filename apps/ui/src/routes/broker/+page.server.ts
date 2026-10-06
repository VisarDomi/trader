import { fail } from '@sveltejs/kit';
import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load() {
	try {
		const [broker, demo] = await Promise.all([arena.broker(), arena.leaderboard('demo')]);
		return { broker, demo, error: null };
	} catch (err) {
		return { broker: { status: null, deals: [] }, demo: [], error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}

export const actions = {
	mirror: async ({ request }) => {
		const form = await request.formData();
		const runIds = form.getAll('runId').map(String);
		try {
			await arena.setMirror({ runIds });
			return { ok: true, message: `Mirroring ${runIds.length} run(s).` };
		} catch (err) {
			return fail(400, { ok: false, message: err instanceof Error ? err.message : String(err) });
		}
	},
	toggle: async ({ request }) => {
		const form = await request.formData();
		const enabled = form.get('enabled') === 'true';
		try {
			await arena.setMirror({ enabled });
			return { ok: true, message: enabled ? 'Mirror enabled.' : 'Mirror disabled; open deals are being closed.' };
		} catch (err) {
			return fail(400, { ok: false, message: err instanceof Error ? err.message : String(err) });
		}
	},
};
