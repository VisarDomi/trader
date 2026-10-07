/**
 * Watchdog: runs every 10 minutes on the lab PC (ops/lab/trader-watchdog.timer)
 * and sends a desktop notification when the platform needs the user, or needs
 * Claude sooner than the next babysitter run. Each alert notifies once when it
 * starts, again every RENOTIFY_MS while it lasts, and once when it clears.
 *
 *   bun run watchdog            check now
 *   bun run watchdog --dry-run  print what would be notified (separate state file)
 *
 * State: data/watchdog.json (alerts in progress, failure streaks).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ArenaEvent, ArenaStatus, BrokerStatus } from '@trader/shared';

const ARENA_URL = process.env.ARENA_URL ?? 'http://127.0.0.1:4120';
const STATE_PATH = resolve(import.meta.dir, '..', '..', 'data', 'watchdog.json');
const FLAG_DRY_RUN = '--dry-run';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const RENOTIFY_MS = 12 * HOUR_MS;
/** Consecutive failed checks (10 minutes apart) before an alert fires, so blips stay quiet. */
const STREAK_TO_ALERT = 3;
/** Crypto trades around the clock, so its candles are always fresh unless the feed is broken. */
const ALWAYS_OPEN_EPICS = ['BTCUSD', 'ETHUSD'];
const STALE_CANDLE_MS = 20 * MINUTE_MS;
const FORECASTER_DOWN_MS = HOUR_MS;
const ENROLLING_TOO_LONG_MS = 3 * HOUR_MS;
/** A failing Capital.com login shows up as an error on /session. */
const LOGIN_FAILURE = /Capital\.com (400|401|403) on \/session/;
const APP_NAME = 'Trader';
const ASK_CLAUDE = 'Ask Claude to look at it.';
const LAB_UNITS = ['trader-tunnel.service', 'trader-forecaster.service'];
const NIGHTLY_UNIT = 'trader-lab.service';

interface Alert {
  key: string;
  title: string;
  body: string;
  /** Something only the user can do (accounts, credentials). */
  userAction: boolean;
  /** Fire only after STREAK_TO_ALERT consecutive checks. */
  needsStreak?: boolean;
}

interface State {
  active: Record<string, { since: number; notifiedAt: number; title: string }>;
  streaks: Record<string, number>;
  firstSeen: Record<string, number>;
  /** Most "Arena" accounts seen; fewer means one was deleted or renamed. */
  expectedAccounts: number;
}

function loadState(path: string): State {
  const empty: State = { active: {}, streaks: {}, firstSeen: {}, expectedAccounts: 0 };
  if (!existsSync(path)) return empty;
  return { ...empty, ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<State>) };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${ARENA_URL}${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function unitState(unit: string, verb: 'is-active' | 'is-failed'): string {
  const r = Bun.spawnSync(['systemctl', '--user', verb, unit]);
  return r.stdout.toString().trim();
}

async function check(state: State, now: number): Promise<Alert[]> {
  const alerts: Alert[] = [];
  for (const unit of LAB_UNITS) {
    if (unitState(unit, 'is-active') !== 'active') {
      alerts.push({ key: `unit:${unit}`, title: `${unit} is not running`, body: `The lab service ${unit} stopped. ${ASK_CLAUDE}`, userAction: false, needsStreak: true });
    }
  }
  if (unitState(NIGHTLY_UNIT, 'is-failed') === 'failed') {
    alerts.push({ key: 'nightly', title: 'Nightly lab job failed', body: `journalctl --user -u ${NIGHTLY_UNIT} has the details. ${ASK_CLAUDE}`, userAction: false });
  }

  let status: ArenaStatus;
  let broker: BrokerStatus | null;
  let events: ArenaEvent[];
  try {
    [status, { status: broker }, events] = await Promise.all([
      get<ArenaStatus>('/api/status'),
      get<{ status: BrokerStatus | null }>('/api/broker'),
      get<ArenaEvent[]>('/api/events?limit=300'),
    ]);
  } catch (err) {
    alerts.push({
      key: 'arena',
      title: 'Arena unreachable',
      body: `The arena API (via the SSH tunnel) has not answered for 30 minutes: ${err instanceof Error ? err.message : err}. Demo trading may be down. ${ASK_CLAUDE}`,
      userAction: false,
      needsStreak: true,
    });
    return alerts;
  }

  if (!status.stream.connected) {
    alerts.push({ key: 'stream', title: 'Price stream disconnected', body: `The arena has had no live Capital.com prices for 30 minutes. ${ASK_CLAUDE}`, userAction: false, needsStreak: true });
  }
  for (const epic of ALWAYS_OPEN_EPICS) {
    const last = status.quotes[epic]?.lastCandle ?? 0;
    if (now - last > STALE_CANDLE_MS) {
      alerts.push({ key: `candles:${epic}`, title: `No new ${epic} candles`, body: `The arena's last ${epic} candle is ${Math.round((now - last) / MINUTE_MS)} minutes old. ${ASK_CLAUDE}`, userAction: false, needsStreak: true });
    }
  }
  if (!status.forecaster.reachable && now - status.forecaster.lastSuccessAt > FORECASTER_DOWN_MS) {
    alerts.push({ key: 'forecaster', title: 'TimesFM forecaster unreachable', body: `Forecast agents have been paused for over an hour. ${ASK_CLAUDE}`, userAction: false });
  }
  if (status.loadErrors.length > 0) {
    alerts.push({ key: 'load-errors', title: 'An agent failed to load', body: `${status.loadErrors.map(e => e.file).join(', ')}. ${ASK_CLAUDE}`, userAction: false });
  }
  const loginFailures = events.filter(e => e.level === 'error' && LOGIN_FAILURE.test(e.message) && now - e.time < HOUR_MS);
  if (loginFailures.length > 0) {
    alerts.push({
      key: 'login',
      title: 'Capital.com login failing',
      body: 'The arena cannot log in to Capital.com. Did the password or API key change? Update /home/erdal/trader-arena/.env and apps/backend/.env, or give Claude the new credentials.',
      userAction: true,
    });
  }

  if (broker) {
    const expected = Math.max(state.expectedAccounts, broker.accounts.length);
    state.expectedAccounts = expected;
    if (broker.accounts.length < expected) {
      alerts.push({
        key: 'accounts-missing',
        title: 'Arena demo account missing',
        body: `Only ${broker.accounts.length} of ${expected} "${broker.prefix}…" demo accounts are listed by Capital.com. Was one deleted or renamed? Recreate or rename it to start with "${broker.prefix}".`,
        userAction: true,
      });
    }
    for (const a of broker.accounts) {
      if (a.killed) {
        alerts.push({ key: `killed:${a.id}`, title: `Kill switch: ${a.name}`, body: `${a.name} lost half its allocation and was switched off. ${ASK_CLAUDE}`, userAction: false });
      }
      if (a.retiring) {
        alerts.push({ key: `retiring:${a.id}`, title: `${a.name} renamed away`, body: `The arena is closing its deals on ${a.name} and will stop using it. Intended?`, userAction: true });
      }
      if (a.leverageOk === false) {
        alerts.push({ key: `leverage:${a.id}`, title: `${a.name} leverage not set`, body: `Capital.com refused to set ${a.name} to 1:${a.leverage}, so its runs are not mirrored. ${ASK_CLAUDE}`, userAction: false });
      }
      if (a.leverage === null && !a.retiring) {
        alerts.push({ key: `no-tier:${a.id}`, title: `${a.name} has no leverage tier`, body: `${a.name} is not listed in agents/roster.json "accounts", so it gets no runs. ${ASK_CLAUDE}`, userAction: false });
      }
      if (a.hedging === false) {
        alerts.push({ key: `netting:${a.id}`, title: `${a.name} left hedging mode`, body: `${a.name} can only hold one run per instrument. Switch it back to hedging in Capital.com, or ${ASK_CLAUDE.toLowerCase()}`, userAction: true });
      }
      const enrollingKey = `enrolling:${a.id}`;
      if (a.allocation === null) {
        state.firstSeen[enrollingKey] ??= now;
        if (now - state.firstSeen[enrollingKey]! > ENROLLING_TOO_LONG_MS) {
          alerts.push({
            key: enrollingKey,
            title: `${a.name} cannot be funded`,
            body: `${a.name} has $${a.balance.toFixed(0)} and its top-up was refused. Top it up to $100,000 in Capital.com (demo), or close its positions.`,
            userAction: true,
          });
        }
      } else {
        delete state.firstSeen[enrollingKey];
      }
    }
  }
  return alerts;
}

function notify(title: string, body: string, urgent: boolean, dryRun: boolean): void {
  if (dryRun) {
    console.log(`[notify${urgent ? ', urgent' : ''}] ${title} — ${body}`);
    return;
  }
  Bun.spawnSync(['notify-send', '-a', APP_NAME, '-u', urgent ? 'critical' : 'normal', `${APP_NAME}: ${title}`, body]);
}

const dryRun = process.argv.includes(FLAG_DRY_RUN);
const statePath = dryRun ? `${STATE_PATH}.dry` : STATE_PATH;
const now = Date.now();
const state = loadState(statePath);
const found = await check(state, now);

const firing = new Map<string, Alert>();
for (const a of found) {
  if (a.needsStreak) {
    state.streaks[a.key] = (state.streaks[a.key] ?? 0) + 1;
    if (state.streaks[a.key]! < STREAK_TO_ALERT) continue;
  }
  firing.set(a.key, a);
}
for (const key of Object.keys(state.streaks)) {
  if (!found.some(a => a.key === key)) delete state.streaks[key];
}

for (const [key, a] of firing) {
  const prev = state.active[key];
  if (!prev || now - prev.notifiedAt >= RENOTIFY_MS) {
    notify(a.title, a.body, a.userAction, dryRun);
    state.active[key] = { since: prev?.since ?? now, notifiedAt: now, title: a.title };
  }
}
for (const [key, prev] of Object.entries(state.active)) {
  if (firing.has(key)) continue;
  notify(`resolved: ${prev.title}`, 'Back to normal.', false, dryRun);
  delete state.active[key];
}

mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(`${new Date(now).toISOString()} watchdog: ${firing.size} alert(s) active${found.length > firing.size ? `, ${found.length - firing.size} pending` : ''}`);
