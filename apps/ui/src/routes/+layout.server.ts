import { arena } from '$lib/server/arena';

export async function load() {
	try {
		const status = await arena.status();
		return {
			arena: {
				up: true,
				streamConnected: status.stream.connected,
				demoRuns: status.demoRuns,
				forecasterOk: status.forecaster.reachable,
			},
		};
	} catch {
		return { arena: { up: false, streamConnected: false, demoRuns: 0, forecasterOk: false } };
	}
}
