import { expect, test } from 'bun:test';
import { CapitalClient, DEMO_BASE_URL, RequestPacer, CapitalApiError } from './client.ts';
import { networkStats } from './telemetry.ts';
const POST = 'POST';
const API_KEY = 'test-key';
const SECRET = 'test-password';
const AUTH = '/api/v1/session';
const POSITIONS = '/api/v1/positions';
test('uncertain order failures are never replayed and telemetry keeps no credentials', async () => {
  const saved = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit) => {
    const path = String(url).slice(DEMO_BASE_URL.length);
    calls.push(`${init.method} ${path}`);
    expect(String(url).startsWith(DEMO_BASE_URL)).toBe(true);
    expect(init.signal).toBeDefined();
    if (path === AUTH)
      return new Response(JSON.stringify({ currentAccountId: 'arena' }), {
        headers: { CST: 'test-cst', 'X-SECURITY-TOKEN': 'test-token' },
      });
    return new Response('gateway timeout', { status: 504 });
  }) as typeof fetch;
  try {
    const client = new CapitalClient({ apiKey: API_KEY, identifier: 'test@example.invalid', password: SECRET }, new RequestPacer(0));
    await expect(client.post(POSITIONS, { size: 100 })).rejects.toBeInstanceOf(CapitalApiError);
    expect(calls.filter(c => c === `${POST} ${POSITIONS}`)).toHaveLength(1);
    const telemetry = JSON.stringify(networkStats());
    expect(telemetry.includes(API_KEY)).toBe(false);
    expect(telemetry.includes(SECRET)).toBe(false);
    expect(telemetry.includes('test-cst')).toBe(false);
  } finally {
    globalThis.fetch = saved;
  }
});
test('one pacer spaces concurrent callers instead of granting a simultaneous burst', async () => {
  const pacer = new RequestPacer(10);
  const times = await Promise.all(
    Array.from({ length: 4 }, async () => {
      await pacer.wait();
      return performance.now();
    }),
  );
  expect(times[3]! - times[0]!).toBeGreaterThanOrEqual(25);
});
