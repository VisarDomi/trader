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

async function attempt(action: () => Promise<unknown>, message: string) {
	try {
		await action();
		return { ok: true, message };
	} catch (err) {
		return fail(400, { ok: false, message: err instanceof Error ? err.message : String(err) });
	}
}

export const actions = {
	toggle: async ({ request }) => {
		const enabled = (await request.formData()).get('enabled') === 'true';
		return attempt(() => arena.setMirror(enabled), enabled ? 'Mirror enabled.' : 'Mirror disabled; open deals are being closed.');
	},
	exclude: async ({ request }) => {
		const form = await request.formData();
		const runId = String(form.get('runId'));
		const excluded = form.get('excluded') === 'true';
		return attempt(() => arena.setExcluded(runId, excluded), excluded ? 'Run excluded; its deals are being closed.' : 'Run allowed back into the mirror.');
	},
};
