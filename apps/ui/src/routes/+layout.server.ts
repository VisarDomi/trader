import { getHealth } from '$lib/server/api';

export async function load() {
	try {
		const health = await getHealth();
		return { healthy: health.status === 'ok' };
	} catch {
		return { healthy: false };
	}
}
