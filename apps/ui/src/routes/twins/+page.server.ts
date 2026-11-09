import { arena, ArenaUnavailable } from '$lib/server/arena';

const WINDOWS = [7, 14, 30] as const;

export async function load({ url }) {
	const asked = Number(url.searchParams.get('days'));
	const days = (WINDOWS as readonly number[]).includes(asked) ? asked : 14;
	try {
		return { days, windows: WINDOWS, report: await arena.twins(days), error: null };
	} catch (err) {
		return { days, windows: WINDOWS, report: null, error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
