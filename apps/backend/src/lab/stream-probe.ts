/**
 * Is Capital's quote delay a property of one connection? Since early November the arena's stream runs 5–13 s
 * behind Capital's stamps in busy hours (08:00–21:00 UTC) with holes of 1–3.5 s, the same delay on every
 * instrument; on October 20 it took in 51 quotes/s at 0.14 s. This probe opens one WebSocket per probe, each on
 * its own session (logins a second apart), subscribed to different instrument sets, and records per probe and
 * instrument the quotes received, their delay behind Capital's stamps and the holes in the stamps. Run it while
 * the arena is delayed: if one instrument alone arrives on time, the delay is per connection and volume-driven.
 *
 * Market data only: no account is selected and nothing is traded. Tokens are never printed.
 * Usage: bun run stream-probe [minutes=5] [out.json]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CapitalClient, credentialsFromEnv, STREAM_URL } from '../capital/client.ts';

const ARENA_API = 'http://127.0.0.1:4120/api/twins?days=1';
/** The arena's subscription on 2026-11-17, used when its API is unreachable. */
const FALLBACK_EPICS = ['US100', 'US500', 'US30', 'GOLD', 'SILVER', 'OIL_CRUDE', 'EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD',
  'NATURALGAS', 'NVDA', 'MSFT', 'AAPL', 'AMZN', 'AVGO', 'META', 'GOOGL', 'TSLA'];
const HOLE_MS = 1_000;
const PING_MS = 4 * 60_000;

interface EpicStats { n: number; delays: number[]; holes: number; maxHoleMs: number; lastStamp: number }

async function arenaFeed(): Promise<{ epics: string[]; delays: Record<string, number> } | null> {
  try {
    const res = await fetch(ARENA_API, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { feed?: { epics?: { epic: string; p50Ms: number }[] } };
    const epics = body.feed?.epics ?? [];
    return epics.length ? { epics: epics.map(e => e.epic), delays: Object.fromEntries(epics.map(e => [e.epic, e.p50Ms])) } : null;
  } catch {
    return null;
  }
}

const pct = (v: number[], p: number) => (v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))]! : null);

async function probe(name: string, epics: string[], until: number) {
  const client = new CapitalClient(credentialsFromEnv());
  await client.login();
  const { cst, securityToken } = client.tokens();
  const stats = new Map<string, EpicStats>(epics.map(e => [e, { n: 0, delays: [], holes: 0, maxHoleMs: 0, lastStamp: 0 }]));
  let opened = 0, closed: string | null = null, subscribe: string | null = null;
  await new Promise<void>(resolve => {
    const ws = new WebSocket(STREAM_URL);
    let correlation = 0;
    const finish = () => { clearInterval(ping); clearTimeout(stop); try { ws.close(); } catch {} resolve(); };
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ destination: 'ping', correlationId: String(++correlation), cst, securityToken })), PING_MS);
    const stop = setTimeout(finish, Math.max(0, until - Date.now()));
    ws.onopen = () => {
      opened = Date.now();
      ws.send(JSON.stringify({ destination: 'marketData.subscribe', correlationId: String(++correlation), cst, securityToken, payload: { epics } }));
    };
    ws.onmessage = event => {
      const receivedAt = Date.now();
      let msg: { destination?: string; status?: string; payload?: { epic?: string; timestamp?: number } };
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.destination === 'marketData.subscribe') subscribe = msg.status ?? null;
      if (msg.destination !== 'quote' || !msg.payload?.epic || !Number.isSafeInteger(msg.payload.timestamp)) return;
      const s = stats.get(msg.payload.epic);
      if (!s) return;
      const stamp = msg.payload.timestamp!;
      s.n++;
      s.delays.push(receivedAt - stamp);
      if (s.lastStamp && stamp - s.lastStamp > HOLE_MS) { s.holes++; s.maxHoleMs = Math.max(s.maxHoleMs, stamp - s.lastStamp); }
      s.lastStamp = Math.max(s.lastStamp, stamp);
    };
    ws.onclose = event => { closed = `code ${event.code}`; finish(); };
  });
  const seconds = (until - (opened || until)) / 1000;
  const all = [...stats.values()].flatMap(s => s.delays);
  return {
    name, epics: epics.length, opened: opened ? new Date(opened).toISOString() : null, subscribe, closedEarly: closed && Date.now() < until - 1000 ? closed : null,
    quotesPerSecond: seconds > 0 ? +(all.length / seconds).toFixed(1) : null, delayP50Ms: pct(all, 0.5), delayP95Ms: pct(all, 0.95),
    byEpic: Object.fromEntries([...stats].map(([e, s]) => [e, { perSecond: seconds > 0 ? +(s.n / seconds).toFixed(2) : null, delayP50Ms: pct(s.delays, 0.5), delayP95Ms: pct(s.delays, 0.95), holesOver1s: s.holes, maxHoleMs: s.maxHoleMs }])),
  };
}

const minutes = Number(process.argv[2] ?? 5);
const startedAt = new Date();
const out = process.argv[3] ?? join(process.env.HOME!, '.local/state/trader-diag', `stream-probe-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
const before = await arenaFeed();
const epics = before?.epics ?? FALLBACK_EPICS;
const probes: [string, string[]][] = [['US100 alone', ['US100']], ['three indices', ['US100', 'US500', 'US30']], ['arena set', epics]];
// Logins are paced a second apart by the client; every probe stops at the same moment.
const until = Date.now() + probes.length * 2_000 + minutes * 60_000;
const results = await Promise.all(probes.map(([name, e], i) => Bun.sleep(i * 1_500).then(() => probe(name, e, until))));
const after = await arenaFeed();
const report = { startedAt: startedAt.toISOString(), endedAt: new Date().toISOString(), minutes, arenaP50MsBefore: before?.delays ?? null, arenaP50MsAfter: after?.delays ?? null, probes: results };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
for (const r of results) console.log(`${r.name.padEnd(14)} ${String(r.epics).padStart(2)} epics: ${r.quotesPerSecond}/s, delay p50 ${r.delayP50Ms} ms, p95 ${r.delayP95Ms} ms, US100 holes>1s ${r.byEpic.US100?.holesOver1s} (max ${r.byEpic.US100?.maxHoleMs} ms)${r.closedEarly ? `, closed early (${r.closedEarly})` : ''}`);
console.log(`arena US100 p50 before/after: ${before?.delays.US100 ?? '-'} / ${after?.delays.US100 ?? '-'} ms; report ${out}`);
process.exit(0);
