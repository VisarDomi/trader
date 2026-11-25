/**
 * Hetzner Real Service entry point (`trader-real.service`, loopback 127.0.0.1:4125).
 *
 * Runs standalone on Hetzner so real-money execution stays isolated from the PC
 * arena (which handles backtests, paper runs, and Capital demo slots only).
 *
 * Env:
 *   CAPITAL_REAL_ACCOUNT_ID    required exact USD live accountId on Capital.com
 *   CAPITAL_REAL_* / CAPITAL_* Capital.com live login credentials
 *   REAL_TOKEN                 required bearer token for API calls
 *   REAL_PORT                  default 4125 (bound to 127.0.0.1)
 *   REAL_DB                    default <app>/data/real.db
 */
import { resolve } from 'node:path';
import { CapitalClient, realCredentialsFromEnv, RequestPacer } from '../capital/client.ts';
import { RealDB } from './db.ts';
import { RealExecutor, type AssignRequest } from './executor.ts';

const token = process.env.REAL_TOKEN;
if (!token) throw new Error('REAL_TOKEN is required');
const accountId = process.env.CAPITAL_REAL_ACCOUNT_ID;
if (!accountId) throw new Error('CAPITAL_REAL_ACCOUNT_ID is required');

const port = Number(process.env.REAL_PORT ?? 4125);
const dbPath = resolve(process.env.REAL_DB ?? resolve(import.meta.dir, '..', '..', 'data', 'real.db'));
const expectedCurrency = process.env.CAPITAL_REAL_CURRENCY ?? 'USD';

const db = new RealDB(dbPath);
const client = CapitalClient.forLiveRealAccount(realCredentialsFromEnv(), new RequestPacer(250));
const executor = new RealExecutor(client, db, {
  accountId,
  expectedCurrency,
  hostLabel: process.env.REAL_HOST_LABEL ?? 'hetzner',
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authorized(req: Request): boolean {
  return req.headers.get('authorization') === `Bearer ${token}`;
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const st = executor.status();
      return json({
        ok: true,
        ready: st.ready,
        accountId: st.accountId,
        accountName: st.accountName,
        currency: st.currency,
        assignedRunId: st.assignment?.runId ?? null,
        memoryMb: Math.round(process.memoryUsage().rss / 1e6),
      });
    }
    if (!authorized(req)) return json({ error: 'unauthorized' }, 401);

    if (req.method === 'GET' && url.pathname === '/api/real/status') {
      return json(executor.status());
    }
    if (req.method === 'GET' && url.pathname === '/api/real/events') {
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
      return json(db.events(limit));
    }
    if (req.method === 'POST' && url.pathname === '/api/real/assign') {
      try {
        const body = (await req.json()) as AssignRequest & { confirmed?: boolean };
        const status = await executor.assign(body, body.confirmed === true);
        return json({ ok: true, status });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = msg.includes('already controlled by') ? 409 : 400;
        return json({ error: msg }, code);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/real/clear') {
      try {
        const body = (await req.json()) as { runId?: string; confirmed?: boolean };
        const status = await executor.clear(body.runId, body.confirmed === true);
        return json({ ok: true, status });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    }
    return json({ error: 'not found' }, 404);
  },
});

console.log(`trader-real on http://127.0.0.1:${server.port} (db ${dbPath}, locked account ${accountId})`);

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  db.event('info', 'real', `shutting down (${signal})`);
  executor.stop();
  server.stop();
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await executor.start();
console.log(`trader-real ready: account=${executor.status().accountName ?? accountId} assigned=${executor.assignment?.runId ?? 'none'}`);
