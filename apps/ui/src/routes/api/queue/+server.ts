import { json } from '@sveltejs/kit';
import { getQueueState } from '$lib/server/api';

export async function GET() {
	try {
		const queue = await getQueueState();
		return json(queue);
	} catch (e) {
		return json({ current: null, queued: [], queueLength: 0 }, { status: 502 });
	}
}
