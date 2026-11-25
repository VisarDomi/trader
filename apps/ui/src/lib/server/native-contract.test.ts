import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'bun:test';
import { nativeResponse, type NativeContext } from './native-contract';
const TOKEN = 'native-test-credential', HASH = createHash('sha256').update(TOKEN).digest('hex');
function request(path: string, token = TOKEN, body?: unknown, headers: Record<string, string> = {}) {
	return new Request(`https://trader.invalid/api/native/v2/${path}`, { method: body === undefined ? 'GET' : 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const screenOf = (path: string) => path.split('?')[0]!;
const call = (path: string, ctx: NativeContext, token = TOKEN, body?: unknown, headers?: Record<string, string>) => nativeResponse(request(path, token, body, headers), screenOf(path), ctx);

test('native access fails closed without its dedicated credential and never reaches the arena', async () => {
	let calls = 0; const ctx: NativeContext = { hash: HASH, build: async () => { calls++; return {}; }, mutate: async () => { calls++; return {}; } };
	for (const hash of [undefined, '', HASH]) expect((await call('status', { ...ctx, hash }, 'wrong')).status).toBe(401);
	expect((await call('mirror', ctx, 'wrong', { enabled: false })).status).toBe(401);
	expect(calls).toBe(0);
});
test('screens and demo controls are allowlisted and validated', async () => {
	const calls: unknown[] = []; const ctx: NativeContext = { hash: HASH, build: async s => { calls.push(s); return { v: 2 }; }, mutate: async (r, b) => { calls.push([r, b]); return { ok: true }; } };
	expect((await call('status', ctx)).status).toBe(200);
	expect((await call('secrets', ctx)).status).toBe(404);
	expect((await call('leaderboard', ctx)).status).toBe(404);
	expect((await call('run', ctx)).status).toBe(400);
	expect((await call('mirror', ctx, TOKEN, { enabled: 'yes' })).status).toBe(400);
	expect((await call('exclude', ctx, TOKEN, { runId: 'Visi', excluded: true })).status).toBe(400);
	expect((await call('mirror', ctx, TOKEN, { enabled: false })).status).toBe(200);
	expect((await call('stage', ctx, TOKEN, { runId: 'demo:a:US500:x200:h', target: 'demo', confirmed: false })).status).toBe(200);
	expect((await call('stage', ctx, TOKEN, { runId: 'demo:a:US500:x200:h', target: 'real', confirmed: false })).status).toBe(400);
	expect((await call('stage', ctx, TOKEN, { runId: 'demo:a:US500:x200:h', target: 'real', confirmed: true })).status).toBe(200);
	expect((await call('status', ctx, TOKEN, {})).status).toBe(405);
	expect(calls).toEqual([
		'status',
		['mirror', { enabled: false }],
		['stage', { runId: 'demo:a:US500:x200:h', target: 'demo', confirmed: false }],
		['stage', { runId: 'demo:a:US500:x200:h', target: 'real', confirmed: true }],
	]);
});
test('scenario labels may contain display punctuation but cannot contain controls', async () => {
	const ctx: NativeContext = { hash: HASH, build: async (_s, q) => ({ v: 2, scenario: q.get('scenario') }), mutate: async () => null };
	expect((await call('rankings?stage=virtual&scenario=' + encodeURIComponent('Capital-like / 170 ms'), ctx)).status).toBe(200);
	expect((await call('rankings?scenario=%00', ctx)).status).toBe(400);
	expect((await call('rankings?stage=live', ctx)).status).toBe(400);
});
test('a trade needs a stable trade key and a known stage, and is read-only', async () => {
	const calls: string[] = []; const ctx: NativeContext = { hash: HASH, build: async (s, q) => { calls.push(s); return { trade: q.get('trade') }; }, mutate: async () => { throw Error('Must not mutate'); } };
	const selected = 'trade?id=demo%3Atest%3AUS500%3Ahash&trade=0&stage=virtual';
	for (const trade of ['', '-1', '1/../../status', '1000000000']) expect((await call('trade?id=demo:test&trade=' + encodeURIComponent(trade), ctx)).status).toBe(400);
	expect((await call(selected.replace('virtual', 'live'), ctx)).status).toBe(400);
	expect((await call(selected, ctx, TOKEN, {})).status).toBe(405);
	expect((await call(selected, ctx)).status).toBe(200);
	expect(calls).toEqual(['trade']);
});
test('an unchanged screen is a 304 with no body; a large one is gzip-compressed', async () => {
	const big = { v: 2, rows: Array.from({ length: 200 }, (_, i) => ({ id: String(i), title: 'Row ' + i })) };
	const ctx: NativeContext = { hash: HASH, build: async () => big, mutate: async () => null };
	const first = await call('agents', ctx, TOKEN, undefined, { 'Accept-Encoding': 'gzip' });
	expect(first.headers.get('content-encoding')).toBe('gzip');
	expect(JSON.parse(gunzipSync(Buffer.from(await first.arrayBuffer())).toString())).toEqual(big);
	const again = await call('agents', ctx, TOKEN, undefined, { 'If-None-Match': first.headers.get('etag')! });
	expect(again.status).toBe(304);
	expect(await again.text()).toBe('');
});
