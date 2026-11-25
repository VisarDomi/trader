/**
 * Native app API v2: GET /api/native/v2/<screen>?… returns the screen built on the server ($lib/server/native),
 * with an ETag (unchanged → 304) and gzip; POST mirror/exclude are the demo controls. Access, allowlist and
 * validation: $lib/server/native-contract. The edge passes exactly these paths (ops/server/native-access.py).
 */
import { env } from '$env/dynamic/private';
import { arena } from '$lib/server/arena';
import { nativeResponse } from '$lib/server/native-contract';
import { invalidateNativeCache, loadScreen } from '$lib/server/native/load';
import journal from '../../../../../../../backend/agents/JOURNAL.md?raw';
import type { RequestHandler } from './$types';

const handler: RequestHandler = ({ request, params }) => nativeResponse(request, params.screen, {
	hash: env.TRADER_NATIVE_ACCESS_SHA256,
	build: (screen, q) => loadScreen(screen, q, journal),
	mutate: async (resource, body) => {
		const res = resource === 'mirror'
			? await arena.setMirror(body.enabled as boolean)
			: resource === 'stage'
				? await arena.setStage(body.runId as string, body.target as 'backtest' | 'virtual' | 'demo' | 'real', Boolean(body.confirmed))
				: await arena.setExcluded(body.runId as string, body.excluded as boolean);
		invalidateNativeCache();
		return res;
	},
});
export const GET = handler;
export const POST = handler;
