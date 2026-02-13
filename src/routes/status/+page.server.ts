import { getHealth, getInstruments } from '$lib/server/api';
import { BACKEND_URL } from '$env/static/private';

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

	return { health, instruments, backendUrl: BACKEND_URL, error };
}
