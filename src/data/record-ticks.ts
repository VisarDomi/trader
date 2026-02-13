/**
 * Tick recorder — streams live quotes from Capital.com WebSocket
 * and saves every tick to the PostgreSQL `ticks` table.
 *
 * Runs indefinitely. Batches inserts every second for efficiency.
 *
 * Reliability features:
 * - Re-authenticates the REST session before each WebSocket reconnect
 * - onclose handler set outside onopen so failed connections reconnect
 * - Watchdog: if no ticks arrive for 30s during market hours, force reconnect
 * - Catches unhandled rejections to prevent silent death
 *
 * Usage: bun run record-ticks
 */

import { CapitalSession } from '../providers/capital/CapitalSession.ts';
import { TickRepository, type Tick } from './TickRepository.ts';
import { sql } from './db.ts';

const EPIC = 'US100';
const FLUSH_INTERVAL_MS = 1_000;
const PING_INTERVAL_MS = 60_000;
const RECONNECT_DELAY_MS = 3_000;
const WATCHDOG_INTERVAL_MS = 30_000;

// --- Logging ---

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function logError(msg: string, err?: unknown) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ERROR: ${msg}`, err ?? '');
}

// --- Buffer ---

let buffer: Tick[] = [];
let totalSaved = 0;
let sessionStart = Date.now();
let lastTickAt = 0;

async function flush() {
  if (buffer.length === 0) return;

  const batch = buffer;
  buffer = [];

  try {
    await TickRepository.insertTicks(batch);
    totalSaved += batch.length;

    const elapsed = ((Date.now() - sessionStart) / 1000).toFixed(0);
    const rate = (totalSaved / (Number(elapsed) || 1)).toFixed(1);
    process.stdout.write(`\r  ${totalSaved} ticks saved (${rate}/s) — ${batch.length} flushed`);
  } catch (err) {
    logError('Flush error, returning batch to buffer', err);
    // Put batch back so we don't lose ticks
    buffer.unshift(...batch);
  }
}

// --- Main ---

async function main() {
  log(`Recording ${EPIC} ticks from Capital.com...`);

  const apiKey = process.env.CAPITAL_API_KEY;
  const identifier = process.env.CAPITAL_IDENTIFIER;
  const password = process.env.CAPITAL_PASSWORD;

  if (!apiKey || !identifier || !password) {
    throw new Error('Missing Capital.com credentials in .env');
  }

  const session = new CapitalSession({
    apiKey,
    identifier,
    password,
    isDemo: false,
  });

  await session.connect();
  log('Authenticated.');

  // Periodic flush
  const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectScheduled = false;

  function scheduleReconnect(reason: string) {
    if (reconnectScheduled) return;
    reconnectScheduled = true;
    log(`Scheduling reconnect in ${RECONNECT_DELAY_MS}ms (reason: ${reason})`);
    setTimeout(() => {
      reconnectScheduled = false;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function cleanup() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (ws) {
      // Detach handlers to prevent double-reconnect
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
  }

  async function connect() {
    cleanup();

    // Re-authenticate the REST session before every WebSocket connect.
    // This ensures tokens are fresh, not stale from hours ago.
    try {
      await session.connect();
      log('Re-authenticated session.');
    } catch (err) {
      logError('Re-authentication failed', err);
      scheduleReconnect('auth-failed');
      return;
    }

    const { cst, securityToken } = session.getTokens();
    const wsUrl = session.getWebSocketUrl();

    log('Opening WebSocket...');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      log('WebSocket connected. Subscribing...');
      ws!.send(JSON.stringify({
        destination: 'marketData.subscribe',
        correlationId: '1',
        cst,
        securityToken,
        payload: { epics: [EPIC] },
      }));

      // Start ping keepalive
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ destination: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.destination === 'quote') {
          const p = data.payload;
          if (typeof p?.bid === 'number' && typeof p?.ofr === 'number') {
            lastTickAt = Date.now();
            buffer.push({
              instrument: EPIC,
              timestamp: lastTickAt,
              bid: p.bid,
              ask: p.ofr,
            });
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    // IMPORTANT: onclose is set here, outside onopen, so it fires
    // even if the connection never opens (e.g. DNS failure).
    ws.onclose = () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      log('WebSocket closed.');
      scheduleReconnect('ws-closed');
    };

    ws.onerror = (err) => {
      logError('WebSocket error', err);
      // onclose will fire after this → triggers reconnect
    };
  }

  // --- Watchdog ---
  // If we haven't received a tick in WATCHDOG_INTERVAL_MS, force reconnect.
  // This catches silent subscription failures (stale tokens accepted by WS
  // but subscription ignored server-side).
  const watchdogTimer = setInterval(() => {
    if (lastTickAt === 0) return; // haven't started yet

    const silentMs = Date.now() - lastTickAt;
    if (silentMs > WATCHDOG_INTERVAL_MS) {
      log(`Watchdog: no ticks for ${(silentMs / 1000).toFixed(0)}s — forcing reconnect`);
      scheduleReconnect('watchdog');
    }
  }, WATCHDOG_INTERVAL_MS);

  // Start
  await connect();

  // Graceful shutdown
  const shutdown = async () => {
    log('Shutting down...');
    clearInterval(flushTimer);
    clearInterval(watchdogTimer);
    cleanup();
    await flush();
    await session.destroy();
    await sql.close();
    log(`Done. ${totalSaved} ticks recorded.`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Catch unhandled errors to prevent silent death
process.on('unhandledRejection', (err) => {
  logError('Unhandled rejection (not crashing)', err);
});

process.on('uncaughtException', (err) => {
  logError('Uncaught exception (not crashing)', err);
});

main().catch(err => {
  logError('Tick recorder main() failed', err);
  process.exit(1);
});
