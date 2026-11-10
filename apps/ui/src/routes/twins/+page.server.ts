import { arena, ArenaUnavailable } from '$lib/server/arena';

/** 'engine': trades decided since the current engine version started (within the last 30 days). */
const WINDOWS = ['engine', 7, 14, 30] as const;
type Window = (typeof WINDOWS)[number];

export async function load({ url }) {
	const param = url.searchParams.get('days');
	const asked: Window | undefined = WINDOWS.find(w => String(w) === param);
	const window: Window = asked ?? 'engine';
	try {
		const report = window === 'engine' ? await arena.twins(30, true) : await arena.twins(window);
		return { window, windows: WINDOWS, report, error: null };
	} catch (err) {
		return { window, windows: WINDOWS, report: null, error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
