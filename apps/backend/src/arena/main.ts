/**
 * Arena service entry point (runs on the Hetzner server under systemd).
 *
 * Env:
 *   CAPITAL_API_KEY / CAPITAL_IDENTIFIER / CAPITAL_PASSWORD   demo login
 *   ARENA_TOKEN          bearer token for mutating API calls (required)
 *   ARENA_PORT           default 4120 (bound to 127.0.0.1)
 *   ARENA_DB             default ./data/arena.db
 *   FORECASTER_URL       default http://127.0.0.1:4130 (SSH tunnel to the lab GPU)
 *   BROKER_ACCOUNT       demo sub-account for the mirror, default "Gerti"; "off" disables it
 *   BROKER_ALLOCATION    USD of the broker account the mirror may use, default 1000
 */
import { resolve } from 'node:path';
import { CapitalClient, credentialsFromEnv } from '../capital/client.ts';
import { startApi } from './api.ts';
import { Arena } from './arena.ts';
import { BrokerMirror } from './broker.ts';
import { ArenaDB } from './db.ts';

const BROKER_OFF = 'off';

const token = process.env.ARENA_TOKEN;
if (!token) throw new Error('ARENA_TOKEN is required');
const port = Number(process.env.ARENA_PORT ?? 4120);
const dbPath = resolve(process.env.ARENA_DB ?? resolve(import.meta.dir, '..', '..', 'data', 'arena.db'));
const forecasterUrl = process.env.FORECASTER_URL ?? 'http://127.0.0.1:4130';
const brokerAccount = process.env.BROKER_ACCOUNT ?? 'Gerti';
const brokerAllocation = Number(process.env.BROKER_ALLOCATION ?? 1000);

const db = new ArenaDB(dbPath);
const creds = credentialsFromEnv();
const dataClient = new CapitalClient(creds);

let broker: BrokerMirror | null = null;
if (brokerAccount !== BROKER_OFF) {
  broker = new BrokerMirror(new CapitalClient(creds), db, brokerAccount, brokerAllocation);
}

const arena = new Arena({ db, dataClient, forecasterUrl, broker });
const api = startApi(arena, port, token);
console.log(`arena api on http://127.0.0.1:${api.port} (db ${dbPath})`);

if (broker) {
  try {
    await broker.start();
  } catch (err) {
    db.event('error', 'broker', `broker failed to start; mirror disabled for this session: ${err instanceof Error ? err.message : err}`);
    broker = null;
  }
}

await arena.start();
console.log(`arena live: ${arena.tracked.size} demo runs`);

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
