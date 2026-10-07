/**
 * Arena service entry point (runs on the Hetzner server under systemd).
 *
 * Env:
 *   CAPITAL_API_KEY / CAPITAL_IDENTIFIER / CAPITAL_PASSWORD   demo login
 *   ARENA_TOKEN          bearer token for mutating API calls (required)
 *   ARENA_PORT           default 4120 (bound to 127.0.0.1)
 *   ARENA_DB             default ./data/arena.db
 *   FORECASTER_URL       default http://127.0.0.1:4130 (SSH tunnel to the lab GPU)
 *   BROKER_ACCOUNT_PREFIX  demo accounts whose name starts with this are used by the broker
 *                        mirror, default "Arena"; "off" disables the mirror
 */
import { resolve } from 'node:path';
import { CapitalClient, credentialsFromEnv, RequestPacer } from '../capital/client.ts';
import { startApi } from './api.ts';
import { Arena } from './arena.ts';
import { BrokerMirror, DEFAULT_ACCOUNT_PREFIX } from './broker.ts';
import { ArenaDB } from './db.ts';

const BROKER_OFF = 'off';
/**
 * ~6 requests/s of the login's 10, shared by candle polling and the broker.
 * The lab (≤3.3/s, mostly at night) and position-opener use the rest.
 */
const ARENA_REQUEST_INTERVAL_MS = 170;

const token = process.env.ARENA_TOKEN;
if (!token) throw new Error('ARENA_TOKEN is required');
const port = Number(process.env.ARENA_PORT ?? 4120);
const dbPath = resolve(process.env.ARENA_DB ?? resolve(import.meta.dir, '..', '..', 'data', 'arena.db'));
const forecasterUrl = process.env.FORECASTER_URL ?? 'http://127.0.0.1:4130';
const brokerPrefix = process.env.BROKER_ACCOUNT_PREFIX ?? DEFAULT_ACCOUNT_PREFIX;

const db = new ArenaDB(dbPath);
const creds = credentialsFromEnv();
const pacer = new RequestPacer(ARENA_REQUEST_INTERVAL_MS);
const dataClient = new CapitalClient(creds, pacer);

const broker =
  brokerPrefix === BROKER_OFF || brokerPrefix.trim() === ''
    ? null
    : new BrokerMirror(new CapitalClient(creds, pacer), db, { prefix: brokerPrefix });

const arena = new Arena({ db, dataClient, forecasterUrl, broker });
const api = startApi(arena, port, token);
console.log(`arena api on http://127.0.0.1:${api.port} (db ${dbPath})`);

await arena.start();
console.log(`arena live: ${arena.tracked.size} demo runs`);

if (broker) {
  // After the arena: the mirror needs the live runs, and replayed history is never mirrored.
  broker.setCandidateSource(() => arena.mirrorCandidates());
  await broker.start();
}

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: saving state`);
  db.event('info', 'arena', `shutting down (${signal})`);
  arena.stop();
  broker?.stop();
  api.stop();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
