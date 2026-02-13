import { getHealth, getInstruments } from '$lib/server/api';
import { env } from '$env/dynamic/private';

export async function load() {
	let health = null;
	let instruments = {};
	let error = null;

	try {
		[health, instruments] = await Promise.all([
			getHealth(),
			getInstruments(),
		]);
	} catch (e) {
		error = (e as Error).message;
	}

	return { health, instruments, backendUrl: env.BACKEND_URL ?? 'http://localhost:3001', error };
}
