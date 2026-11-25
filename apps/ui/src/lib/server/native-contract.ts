/**
 * The native app's API (v2): authorization by the dedicated device key, the allowlisted screens and demo controls,
 * input validation, ETag revalidation and compression. Screens themselves are built in ./native (screens.ts).
 * The website login never authorizes these paths, and the device key authorizes nothing else.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { gzipSync } from 'node:zlib';

export const NATIVE_SCREENS = ['rankings', 'strategies', 'agents', 'agent', 'run', 'trade', 'accounts', 'account', 'status', 'scenarios', 'graveyard', 'archive', 'journal', 'research', 'document', 'source'] as const;
export type NativeScreen = typeof NATIVE_SCREENS[number];
const MUTATIONS = ['mirror', 'exclude'];
const base = { 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff', Vary: 'Accept-Encoding' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...base, 'Content-Type': 'application/json' } });
const text = (v: string | null) => v !== null && v.length <= 512 && !/[\x00-\x1f]/.test(v);

export interface NativeContext {
	hash: string | undefined;
	build: (screen: NativeScreen, params: URLSearchParams) => Promise<unknown>;
	mutate: (resource: string, body: Record<string, unknown>) => Promise<unknown>;
}
export function authorized(request: Request, hash: string | undefined): boolean {
	if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
	const bearer = request.headers.get('authorization') ?? '';
	if (!bearer.startsWith('Bearer ') || bearer.length > 1024) return false;
	return timingSafeEqual(createHash('sha256').update(bearer.slice(7)).digest(), Buffer.from(hash, 'hex'));
}
export async function nativeResponse(request: Request, resource: string, context: NativeContext): Promise<Response> {
	if (!authorized(request, context.hash)) return json({ error: 'Pair this device to Trader.' }, 401);
	const q = new URL(request.url).searchParams;
	if (request.method === 'GET') {
		if (!(NATIVE_SCREENS as readonly string[]).includes(resource)) return json({ error: 'Unknown screen' }, 404);
		const screen = resource as NativeScreen;
		if (['agent', 'run', 'trade', 'account', 'archive', 'document', 'source'].includes(screen) && !(text(q.get('id')) && q.get('id'))) return json({ error: 'Invalid record' }, 400);
		if (screen === 'trade' && (!/^(?:open|\d{1,9})$/.test(q.get('trade') ?? '') || !['capital', 'virtual', 'backtest'].includes(q.get('stage') ?? 'virtual'))) return json({ error: 'Invalid trade' }, 400);
		if (screen === 'rankings' && (!['capital', 'virtual', 'backtest'].includes(q.get('stage') ?? 'capital') || (q.has('scenario') && !text(q.get('scenario'))))) return json({ error: 'Invalid stage' }, 400);
		let body: string;
		try { body = JSON.stringify(await context.build(screen, q)); }
		catch { return json({ error: 'Trader is temporarily unavailable. Your saved screens remain on this phone.' }, 502); }
		const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
		if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ...base, ETag: etag } });
		const gzip = /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '') && body.length > 1024;
		return new Response(gzip ? gzipSync(body, { level: 6 }) : body, { headers: { ...base, 'Content-Type': 'application/json', ETag: etag, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) } });
	}
	if (request.method === 'POST' && MUTATIONS.includes(resource)) {
		if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'JSON required' }, 415);
		const raw = await request.text();
		if (raw.length > 2048) return json({ error: 'Request too large' }, 413);
		let b: Record<string, unknown>;
		try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid request' }, 400); }
		if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'Invalid request' }, 400);
		if ((resource === 'mirror' && typeof b.enabled !== 'boolean') || (resource === 'exclude' &&
			(typeof b.runId !== 'string' || !b.runId.startsWith('demo:') || b.runId.length > 512 || typeof b.excluded !== 'boolean')))
			return json({ error: 'Invalid demo control' }, 400);
		try { return json(await context.mutate(resource, b)); }
		catch { return json({ error: 'The demo control could not be confirmed. Refresh before trying again.' }, 502); }
	}
	return json({ error: 'Method not allowed' }, 405);
}
