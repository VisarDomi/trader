/**
 * Native app API v2: GET /api/native/v2/<screen>?… returns the screen, built on the server (see
 * $lib/server/native/wire.ts), with an ETag. The app sends If-None-Match and gets 304 when the screen
 * has not changed. Bodies are gzip-compressed when the client accepts it. POST mirror/exclude are the
 * demo controls, as in v1. Access is the dedicated device key, never the website login.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { env } from '$env/dynamic/private';
import { arena } from '$lib/server/arena';
import { authorized } from '$lib/server/native-contract';
import { SCREENS, loadScreen, type ScreenName } from '$lib/server/native/load';
import journal from '../../../../../../../backend/agents/JOURNAL.md?raw';
import type { RequestHandler } from './$types';

const base = { 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff', Vary: 'Accept-Encoding' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...base, 'Content-Type': 'application/json' } });
const text = (v: string | null) => v !== null && v.length <= 512 && !/[\x00-\x1f]/.test(v);

export const GET: RequestHandler = async ({ request, params, url }) => {
	if (!authorized(request, env.TRADER_NATIVE_ACCESS_SHA256)) return json({ error: 'Pair this device to Trader.' }, 401);
	const screen = params.screen as ScreenName, q = url.searchParams;
	if (!SCREENS.includes(screen)) return json({ error: 'Unknown screen' }, 404);
	if (['agent', 'run', 'trade', 'account', 'archive', 'document', 'source'].includes(screen) && !(text(q.get('id')) && q.get('id'))) return json({ error: 'Invalid record' }, 400);
	if (screen === 'trade' && (!/^(?:open|\d{1,9})$/.test(q.get('trade') ?? '') || !['capital', 'virtual', 'backtest'].includes(q.get('stage') ?? 'virtual'))) return json({ error: 'Invalid trade' }, 400);
	if (screen === 'rankings' && (!['capital', 'virtual', 'backtest'].includes(q.get('stage') ?? 'capital') || (q.has('scenario') && !text(q.get('scenario'))))) return json({ error: 'Invalid stage' }, 400);
	let body: string;
	try { body = JSON.stringify(await loadScreen(screen, q, journal)); }
	catch { return json({ error: 'Trader is temporarily unavailable. Your saved screens remain on this phone.' }, 502); }
	const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
	if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ...base, ETag: etag } });
	const gzip = /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '') && body.length > 1024;
	return new Response(gzip ? gzipSync(body, { level: 6 }) : body, { headers: { ...base, 'Content-Type': 'application/json', ETag: etag, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) } });
};

export const POST: RequestHandler = async ({ request, params }) => {
	if (!authorized(request, env.TRADER_NATIVE_ACCESS_SHA256)) return json({ error: 'Pair this device to Trader.' }, 401);
	if (!['mirror', 'exclude'].includes(params.screen)) return json({ error: 'Method not allowed' }, 405);
	if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'JSON required' }, 415);
	const raw = await request.text();
	if (raw.length > 2048) return json({ error: 'Request too large' }, 413);
	let b: Record<string, unknown>;
	try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid request' }, 400); }
	if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'Invalid request' }, 400);
	if ((params.screen === 'mirror' && typeof b.enabled !== 'boolean') || (params.screen === 'exclude' &&
		(typeof b.runId !== 'string' || !b.runId.startsWith('demo:') || b.runId.length > 512 || typeof b.excluded !== 'boolean')))
		return json({ error: 'Invalid demo control' }, 400);
	try { return json(params.screen === 'mirror' ? await arena.setMirror(b.enabled as boolean) : await arena.setExcluded(b.runId as string, b.excluded as boolean)); }
	catch { return json({ error: 'The demo control could not be confirmed. Refresh before trying again.' }, 502); }
};
