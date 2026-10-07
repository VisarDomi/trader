/**
 * BrokerMirror — copies the paper trades of demo runs onto Capital.com DEMO
 * accounts as real demo orders. It measures how far real fills drift from the
 * paper fills the leaderboard is built on.
 *
 * Accounts: the ones named in BROKER_ACCOUNTS (e.g. "Gerti:5") plus every
 * account whose name starts with the prefix (default "Arena"), picked up within
 * a minute of being created. Prefix accounts are topped up once to the 100k
 * demo maximum; named accounts keep the balance they have. An account nets
 * positions per instrument, so it holds at most one mirrored run per
 * instrument and at most `slots` runs; its balance when enrolled is split
 * across the slots. With $100,000 and 10 slots a mirrored order is exactly the
 * paper size.
 * Runs are assigned to free slots automatically (see slots.ts).
 *
 * Requests: one session switches between accounts; jobs are grouped per
 * account and paced by the RequestPacer shared with the candle poller.
 *
 * Safety rails (an older experiment wiped an account with a runaway loop):
 *   - only accounts matched above are ever touched; the session's account is
 *     verified after every switch and every re-login
 *   - a run opening MAX_OPENS_PER_RUN_PER_HOUR times in an hour is excluded
 *   - at most MAX_OPENS_PER_HOUR opens per hour in total (demo limit is 1,000)
 *   - kill switch per account: equity below KILL_FRACTION of its allocation on
 *     two consecutive checks closes its deals and stops using it
 *   - positions the arena did not open are never touched; their instrument is
 *     skipped on that account
 *   - opens from replayed history (after a restart) are not mirrored, and a
 *     deal whose paper position is gone is closed
 */
import type { CapitalClient } from '../capital/client.ts';
import { CapitalApiError } from '../capital/client.ts';
import type { Instrument } from '../engine/instruments.ts';
import { getInstrument } from '../engine/instruments.ts';
import type { RunEvent } from '../engine/run.ts';
import type { Side } from '../sdk/types.ts';
import type { ArenaDB, DealRow } from './db.ts';
import { DEAL_STATUS } from './db.ts';
import type { SlotCandidate } from './slots.ts';
import { accountsNeeded, assignSlots } from './slots.ts';

export const BROKER_SETTINGS = {
  ENABLED: 'broker.enabled',
  /** runId → account name */
  ASSIGNMENTS: 'broker.assignments',
  /** runIds never to mirror (set by hand or by the runaway guard) */
  EXCLUDED: 'broker.excluded',
  /** account name → { allocation, killed } */
  ACCOUNTS: 'broker.accounts',
} as const;

/** Settings of the single-account mirror (before 2026-10-07), migrated on start. */
const LEGACY_SETTINGS = {
  RUNS: 'broker.runs',
  START_BALANCE: 'broker.startBalance',
  KILLED: 'broker.killed',
} as const;

export const DEFAULT_SLOTS = 10;
export const DEFAULT_ACCOUNT_PREFIX = 'Arena';
/** Capital.com caps a demo balance at 100,000. */
const MAX_ALLOCATION = 100_000;
/** Paper runs are sized for this much capital; broker sizes scale from it. */
const PAPER_CAPITAL = 10_000;

const DIRECTION_BUY = 'BUY';
const DIRECTION_SELL = 'SELL';
const MAX_OPENS_PER_RUN_PER_HOUR = 12;
const MAX_OPENS_PER_HOUR = 600;
const HOUR_MS = 3_600_000;
const KILL_FRACTION = 0.5;
const KILL_CONFIRMATIONS = 2;
/** Paper opens older than this (replayed history) are not mirrored. */
const STALE_EVENT_MS = 2 * 60_000;
/** An order whose confirmation was lost is adopted from /positions, or marked failed after this long. */
const ADOPT_WINDOW_MS = 5 * 60_000;
const CONFIRM_ATTEMPTS = 8;
const CONFIRM_DELAY_MS = 300;
const CYCLE_MS = 60_000;
/** Bars close at :00 and orders follow the candle poll at :10, so housekeeping runs later in the minute. */
const CYCLE_OFFSET_MS = 35_000;
/** How often an account's positions are re-read: unconfirmed deals, open deals, nothing open. */
const RECONCILE_UNCONFIRMED_MS = CYCLE_MS;
const RECONCILE_OPEN_MS = 2 * CYCLE_MS;
const RECONCILE_IDLE_MS = 5 * CYCLE_MS;
/** Slack so a reconcile due "every 2 cycles" is not pushed to the third by timer jitter. */
const RECONCILE_SLACK_MS = 5_000;
/** Jobs for the account the session is on run first, unless an older job has waited this long. */
const JOB_MAX_WAIT_MS = 10_000;
/** Do not over-size: skip when the minimum deal is more than this multiple of the scaled size. */
const MAX_MIN_SIZE_INFLATION = 3;

export interface BrokerOptions {
  /** Accounts used by exact name, with their slot counts. The first one owns deals from before multi-account support. */
  named: { name: string; slots: number }[];
  /** Accounts whose name starts with this (case-insensitive) are used with DEFAULT_SLOTS. Empty = none. */
  prefix: string;
}

/** "Gerti:5,Other" → [{ name: 'Gerti', slots: 5 }, { name: 'Other', slots: DEFAULT_SLOTS }] */
export function parseBrokerAccounts(spec: string): { name: string; slots: number }[] {
  return spec
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const i = s.lastIndexOf(':');
      const slots = i > 0 ? Number(s.slice(i + 1)) : NaN;
      return Number.isInteger(slots) && slots > 0 ? { name: s.slice(0, i).trim(), slots } : { name: s, slots: DEFAULT_SLOTS };
    });
}

/** A live demo run the arena offers for mirroring. */
export interface MirrorCandidate extends SlotCandidate {
  /** Side of the paper position, null when flat. */
  side: Side | null;
  /** Higher is mirrored first when slots are short. */
  score: number;
}

interface Confirmation {
  dealStatus: 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
  dealId?: string;
  affectedDeals?: { dealId: string; status: string }[];
  level?: number;
  profit?: number;
  reason?: string;
}

interface BrokerPosition {
  position: { dealId: string; direction: string; size: number; level: number; upl?: number };
  market: { epic: string; bid: number; offer: number };
}

interface ApiAccount {
  accountId: string;
  accountName: string;
  balance: { balance: number; profitLoss: number };
}

interface StoredAccount {
  allocation: number | null;
  killed: boolean;
  /** A top-up to MAX_ALLOCATION was attempted (prefix accounts only, once). */
  toppedUp?: boolean;
}

interface Account {
  name: string;
  accountId: string;
  /** Matched by prefix rather than by name: owned by the arena, so it may be topped up. */
  auto: boolean;
  slots: number;
  allocation: number | null;
  balance: number | null;
  equity: number | null;
  lowReadings: number;
  foreignEpics: Set<string>;
  lastReconcileAt: number;
}

export interface BrokerAccountStatus {
  name: string;
  accountId: string;
  balance: number | null;
  equity: number | null;
  allocation: number | null;
  slots: number;
  /** Broker size = paper size × scale. */
  scale: number | null;
  runs: string[];
  openDeals: number;
  killed: boolean;
  foreignEpics: string[];
  lastReconcileAt: number;
}

export interface BrokerStatus {
  enabled: boolean;
  prefix: string;
  defaultSlots: number;
  accounts: BrokerAccountStatus[];
  coverage: { liveRuns: number; mirrored: number; excluded: number; unassigned: number; accountsNeeded: number };
  excluded: string[];
  queued: number;
  opensLastHour: number;
  maxOpensPerHour: number;
  lastCycleAt: number;
  lastError: string | null;
}

const JOB_RECONCILE = 'reconcile';

interface Job {
  account: string;
  enqueuedAt: number;
  run: () => Promise<void>;
  tag?: typeof JOB_RECONCILE;
}

export class BrokerMirror {
  private readonly accounts = new Map<string, Account>();
  private readonly queue: Job[] = [];
  private draining = false;
  private sessionAccount: string | null = null;
  private verifiedLogins = -1;
  private readonly opens: number[] = [];
  private readonly runOpens = new Map<string, number[]>();
  private candidates: () => MirrorCandidate[] = () => [];
  private live: MirrorCandidate[] = [];
  private unassigned: SlotCandidate[] = [];
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private cycling = false;
  private lastCycleAt = 0;
  private lastError: string | null = null;
  private ready = false;

  constructor(
    private readonly client: CapitalClient,
    private readonly db: ArenaDB,
    private readonly opts: BrokerOptions,
  ) {}

  /** The arena's live runs, best first. Must be set before start(). */
  setCandidateSource(source: () => MirrorCandidate[]): void {
    this.candidates = source;
  }

  get enabled(): boolean {
    return this.db.getSetting<boolean>(BROKER_SETTINGS.ENABLED, false);
  }

  private get assignments(): Record<string, string> {
    return this.db.getSetting<Record<string, string>>(BROKER_SETTINGS.ASSIGNMENTS, {});
  }

  private get excluded(): string[] {
    return this.db.getSetting<string[]>(BROKER_SETTINGS.EXCLUDED, []);
  }

  private get stored(): Record<string, StoredAccount> {
    return this.db.getSetting<Record<string, StoredAccount>>(BROKER_SETTINGS.ACCOUNTS, {});
  }

  private storeAccount(name: string, patch: Partial<StoredAccount>): void {
    const all = this.stored;
    all[name] = { ...(all[name] ?? { allocation: null, killed: false }), ...patch };
    this.db.setSetting(BROKER_SETTINGS.ACCOUNTS, all);
  }

  private isKilled(name: string): boolean {
    return this.stored[name]?.killed ?? false;
  }

  /** Run ids currently assigned to a broker account. */
  get mirroredRuns(): string[] {
    return Object.keys(this.assignments);
  }

  async start(): Promise<void> {
    this.migrateLegacy();
    await this.cycle();
    this.scheduleCycle();
  }

  stop(): void {
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
  }

  status(): BrokerStatus {
    const assignments = this.assignments;
    const open = this.db.openDeals();
    const liveIds = new Set(this.live.map(c => c.runId));
    const excluded = this.excluded.filter(id => liveIds.has(id));
    const now = Date.now();
    return {
      enabled: this.enabled,
      prefix: this.opts.prefix,
      defaultSlots: DEFAULT_SLOTS,
      accounts: [...this.accounts.values()].map(a => ({
        name: a.name,
        accountId: a.accountId,
        balance: a.balance,
        equity: a.equity,
        allocation: a.allocation,
        slots: a.slots,
        scale: this.scaleOf(a),
        runs: Object.keys(assignments).filter(id => assignments[id] === a.name),
        openDeals: open.filter(d => d.account === a.name).length,
        killed: this.isKilled(a.name),
        foreignEpics: [...a.foreignEpics],
        lastReconcileAt: a.lastReconcileAt,
      })),
      coverage: {
        liveRuns: this.live.length,
        mirrored: Object.keys(assignments).length,
        excluded: excluded.length,
        unassigned: this.unassigned.length,
        accountsNeeded: accountsNeeded(this.unassigned, DEFAULT_SLOTS),
      },
      excluded,
      queued: this.queue.length,
      opensLastHour: this.opens.filter(t => now - t < HOUR_MS).length,
      maxOpensPerHour: MAX_OPENS_PER_HOUR,
      lastCycleAt: this.lastCycleAt,
      lastError: this.lastError,
    };
  }

  setEnabled(enabled: boolean): void {
    this.db.setSetting(BROKER_SETTINGS.ENABLED, enabled);
    if (enabled) {
      for (const name of Object.keys(this.stored)) this.storeAccount(name, { killed: false });
      for (const a of this.accounts.values()) a.lowReadings = 0;
    } else {
      for (const d of this.db.openDeals()) this.enqueueClose(d, 'mirror disabled');
    }
    this.db.event('info', 'broker', `mirror ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** Exclude a run from mirroring (closing its deals) or allow it again. */
  setExcluded(runId: string, excluded: boolean, why = 'by hand'): void {
    const set = new Set(this.excluded);
    if (excluded) set.add(runId);
    else set.delete(runId);
    this.db.setSetting(BROKER_SETTINGS.EXCLUDED, [...set]);
    this.db.event('info', 'broker', `${runId} ${excluded ? 'excluded from' : 'allowed back into'} the mirror (${why})`);
    this.rebalance();
  }

  /** Paper-trade event from the arena. */
  onRunEvent(e: RunEvent): void {
    if (e.type === 'log' || e.type === 'error' || !this.ready || !this.enabled) return;
    if (e.type === 'close') {
      this.closeRunDeals(e.runId, `paper ${e.trade.exitReason}`, e.trade.exitPrice);
      return;
    }
    const name = this.assignments[e.runId];
    const account = name ? this.accounts.get(name) : undefined;
    if (!account) return;
    if (e.type === 'open') {
      if (Date.now() - e.time > STALE_EVENT_MS) return;
      this.enqueue(account.name, () => this.openDeal(account, e));
    } else if (e.type === 'stops') {
      const deal = this.db.openDeals().find(d => d.run_id === e.runId && d.deal_id);
      if (deal) this.enqueue(deal.account, () => this.putStops(deal.deal_id!, e.stopLoss, e.takeProfit));
    }
  }

  // ------------------------------------------------------------------ cycle

  private scheduleCycle(): void {
    const now = Date.now();
    let next = Math.floor(now / CYCLE_MS) * CYCLE_MS + CYCLE_OFFSET_MS;
    if (next <= now) next += CYCLE_MS;
    this.cycleTimer = setTimeout(() => {
      void this.cycle().finally(() => this.scheduleCycle());
    }, next - now);
  }

  /** Once a minute: balances, kill switches, slot assignment, paper sync, reconcile. */
  private async cycle(): Promise<void> {
    if (this.cycling) return;
    this.cycling = true;
    try {
      await this.refreshAccounts();
      this.checkKillSwitches();
      this.rebalance();
      this.syncWithPaper();
      this.scheduleReconciles();
      this.lastCycleAt = Date.now();
      this.ready = true;
    } catch (err) {
      this.fail('cycle', err);
    } finally {
      this.cycling = false;
    }
  }

  private scheduleReconciles(): void {
    const open = this.db.openDeals();
    const now = Date.now();
    for (const a of this.accounts.values()) {
      const mine = open.filter(d => d.account === a.name);
      const every = mine.some(d => !d.deal_id) ? RECONCILE_UNCONFIRMED_MS : mine.length > 0 ? RECONCILE_OPEN_MS : RECONCILE_IDLE_MS;
      if (now - a.lastReconcileAt < every - RECONCILE_SLACK_MS) continue;
      if (this.queue.some(j => j.tag === JOB_RECONCILE && j.account === a.name)) continue;
      this.enqueue(a.name, () => this.reconcile(a), JOB_RECONCILE);
    }
  }

  /** Discover accounts and read every balance with one GET /accounts. */
  private async refreshAccounts(): Promise<void> {
    const { accounts } = await this.client.get<{ accounts: ApiAccount[] }>('/api/v1/accounts');
    const seen = new Set<string>();
    for (const api of accounts) {
      const match = this.match(api.accountName);
      if (match === null) continue;
      seen.add(api.accountName);
      let a = this.accounts.get(api.accountName);
      if (!a) {
        a = {
          name: api.accountName, accountId: api.accountId, auto: match.auto, slots: match.slots,
          allocation: this.stored[api.accountName]?.allocation ?? null,
          balance: null, equity: null, lowReadings: 0, foreignEpics: new Set(), lastReconcileAt: 0,
        };
        this.accounts.set(a.name, a);
      }
      a.accountId = api.accountId;
      a.balance = api.balance.balance;
      a.equity = api.balance.balance + api.balance.profitLoss;
      if (a.allocation === null && a.auto && a.balance < MAX_ALLOCATION && !this.stored[a.name]?.toppedUp) {
        this.storeAccount(a.name, { toppedUp: true });
        const account = a;
        this.enqueue(a.name, () => this.topUp(account));
        continue; // enroll on the next cycle with the new balance
      }
      // Capital.com occasionally reports 0 on a first read; only a positive balance enrolls an account.
      if (a.allocation === null && a.balance > 0) {
        a.allocation = Math.min(a.balance, MAX_ALLOCATION);
        this.storeAccount(a.name, { allocation: a.allocation });
        this.db.event('info', 'broker', `account ${a.name} enrolled: allocation ${a.allocation}, ${a.slots} slots, scale ${this.scaleOf(a)}`);
      }
    }
    for (const name of [...this.accounts.keys()]) {
      if (seen.has(name)) continue;
      this.accounts.delete(name);
      if (this.sessionAccount === name) this.sessionAccount = null;
      for (const d of this.db.openDeals().filter(d => d.account === name)) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.FAILED, close_time: Date.now(), note: 'account no longer listed by Capital.com' });
      }
      this.db.event('warn', 'broker', `account ${name} is no longer listed by Capital.com; its runs will be reassigned`);
    }
  }

  private match(accountName: string): { slots: number; auto: boolean } | null {
    const named = this.opts.named.find(n => n.name === accountName);
    if (named) return { slots: named.slots, auto: false };
    const prefix = this.opts.prefix.toLowerCase();
    return prefix && accountName.toLowerCase().startsWith(prefix) ? { slots: DEFAULT_SLOTS, auto: true } : null;
  }

  /** Demo top-up of a fresh prefix account to the 100k maximum, so mirrored orders can be paper-sized. */
  private async topUp(a: Account): Promise<void> {
    const amount = Math.floor(MAX_ALLOCATION - (a.balance ?? 0));
    if (amount <= 0) return;
    try {
      await this.client.post('/api/v1/accounts/topUp', { amount });
      this.db.event('info', 'broker', `topped up ${a.name} by ${amount} to the ${MAX_ALLOCATION} demo maximum`);
    } catch (err) {
      this.db.event('warn', 'broker', `could not top up ${a.name} (${errorText(err)}); it will be used with its current balance`);
    }
  }

  /** Fires when an account's equity is below KILL_FRACTION of its allocation on two consecutive cycles. */
  private checkKillSwitches(): void {
    if (!this.enabled) return;
    for (const a of this.accounts.values()) {
      if (a.allocation === null || a.equity === null || this.isKilled(a.name)) continue;
      const floor = a.allocation * KILL_FRACTION;
      a.lowReadings = a.equity < floor ? a.lowReadings + 1 : 0;
      if (a.lowReadings < KILL_CONFIRMATIONS) continue;
      this.storeAccount(a.name, { killed: true });
      this.db.event('error', 'broker', `KILL SWITCH: ${a.name} equity ${a.equity} < ${floor} (${KILL_FRACTION * 100}% of its ${a.allocation} allocation); closing its deals`);
      for (const d of this.db.openDeals().filter(d => d.account === a.name)) this.enqueueClose(d, 'kill switch');
    }
  }

  /** Assign live runs to free slots; runs that lose their slot have their deals closed. */
  private rebalance(): void {
    const live = [...this.candidates()].sort((a, b) => b.score - a.score);
    const before = this.assignments;
    if (live.length === 0 && Object.keys(before).length > 0) return; // arena not ready; keep what we have
    this.live = live;
    const usable = [...this.accounts.values()]
      .filter(a => a.allocation !== null && !this.isKilled(a.name))
      .map(a => ({ name: a.name, slots: a.slots, blockedEpics: a.foreignEpics }));
    const plan = assignSlots(before, usable, live, new Set(this.excluded));
    this.db.setSetting(BROKER_SETTINGS.ASSIGNMENTS, plan.assignments);
    this.unassigned = plan.unassigned;
    const dropped = Object.keys(before).filter(id => plan.assignments[id] === undefined);
    const added = Object.keys(plan.assignments).filter(id => before[id] === undefined);
    for (const id of dropped) this.closeRunDeals(id, 'run no longer mirrored');
    if (dropped.length > 0 || added.length > 0) {
      const need = accountsNeeded(plan.unassigned, DEFAULT_SLOTS);
      this.db.event(
        'info',
        'broker',
        `mirroring ${Object.keys(plan.assignments).length} of ${live.length} live runs on ${usable.length} accounts (+${added.length} −${dropped.length})` +
          (need > 0 ? `; ${plan.unassigned.length} unassigned, ${need} more account(s) needed` : ''),
      );
    }
  }

  /** Close confirmed deals whose paper position is gone or on the other side. */
  private syncWithPaper(): void {
    if (this.live.length === 0) return;
    const side = new Map(this.live.map(c => [c.runId, c.side]));
    for (const d of this.db.openDeals()) {
      if (!d.deal_id || !this.accounts.has(d.account)) continue;
      const paper = side.get(d.run_id);
      if (paper === d.side) continue;
      this.enqueueClose(d, paper === undefined ? 'run is no longer live' : 'paper position is flat');
    }
  }

  // ------------------------------------------------------------------ actions

  private closeRunDeals(runId: string, note: string, paperPrice?: number): void {
    for (const d of this.db.openDeals().filter(d => d.run_id === runId)) this.enqueueClose(d, note, paperPrice);
  }

  private enqueueClose(d: DealRow, note: string, paperPrice?: number): void {
    this.enqueue(d.account, () => this.closeDeal(d, note, paperPrice));
  }

  private async openDeal(account: Account, e: Extract<RunEvent, { type: 'open' }>): Promise<void> {
    const inst = getInstrument(epicOfRun(e.runId));
    if (this.isKilled(account.name) || this.assignments[e.runId] !== account.name) return;
    if (account.foreignEpics.has(inst.epic)) {
      this.db.event('warn', 'broker', `skip ${e.runId}: ${account.name} holds a position on ${inst.epic} that the arena did not open`);
      return;
    }
    if (this.db.openDeals().some(d => d.account === account.name && d.epic === inst.epic)) {
      this.db.event('warn', 'broker', `skip ${e.runId}: a mirrored deal on ${inst.epic} is still open on ${account.name}`);
      return;
    }
    const scale = this.scaleOf(account);
    if (scale === null || !this.allowOpen(e.runId)) return;
    const size = scaledSize(inst, e.size, scale);
    if (size === null) {
      this.db.event('info', 'broker', `skip ${e.runId}: scaled size of ${e.size} is below the ${inst.epic} minimum`);
      return;
    }
    const rowId = this.db.insertDeal({
      account: account.name, run_id: e.runId, epic: inst.epic, side: e.side, size, paper_size: e.size, deal_id: null,
      status: DEAL_STATUS.OPEN, open_time: Date.now(), open_price: null, paper_open_price: e.price, close_time: null,
      close_price: null, paper_close_price: null, pnl: null, note: null,
    });
    try {
      const ref = await this.client.post<{ dealReference: string }>('/api/v1/positions', {
        epic: inst.epic,
        direction: e.side === 'long' ? DIRECTION_BUY : DIRECTION_SELL,
        size,
      });
      const conf = await this.confirm(ref.dealReference);
      if (conf.dealStatus !== 'ACCEPTED') {
        this.db.updateDeal(rowId, { status: DEAL_STATUS.FAILED, note: `rejected: ${conf.reason ?? 'unknown'}` });
        this.db.event('warn', 'broker', `open rejected for ${e.runId} on ${account.name}: ${conf.reason ?? 'unknown'}`);
        return;
      }
      const dealId = conf.affectedDeals?.[0]?.dealId ?? conf.dealId ?? null;
      this.db.updateDeal(rowId, { deal_id: dealId, open_price: conf.level ?? null });
      this.db.event('info', 'broker', `opened ${e.side} ${size} ${inst.epic} @ ${conf.level} on ${account.name} for ${e.runId} (paper ${e.size} @ ${e.price})`);
      if (dealId && (e.stopLoss !== null || e.takeProfit !== null)) await this.putStops(dealId, e.stopLoss, e.takeProfit);
    } catch (err) {
      // The order may still have gone through; reconcile() adopts it or marks it failed.
      this.db.updateDeal(rowId, { note: `unconfirmed: ${errorText(err)}` });
      this.fail(`open ${e.runId}`, err);
    }
  }

  private async closeDeal(d: DealRow, note: string, paperPrice?: number): Promise<void> {
    const current = this.db.openDeals().find(x => x.id === d.id);
    if (!current) return;
    if (!current.deal_id) {
      if (Date.now() - current.open_time < ADOPT_WINDOW_MS) {
        // Not confirmed yet: retry after the next reconcile has had a chance to adopt it.
        setTimeout(() => this.enqueueClose(current, note, paperPrice), CYCLE_MS + 5_000);
      } else {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.FAILED, close_time: Date.now(), note: `${note}; never confirmed` });
      }
      return;
    }
    try {
      const ref = await this.client.delete<{ dealReference: string }>(`/api/v1/positions/${current.deal_id}`);
      const conf = await this.confirm(ref.dealReference);
      const price = conf.level ?? null;
      this.db.updateDeal(d.id, {
        status: DEAL_STATUS.CLOSED, close_time: Date.now(), close_price: price, paper_close_price: paperPrice ?? null,
        pnl: conf.profit ?? (price !== null && current.open_price !== null ? dealPnl(current.side as Side, current.size, current.open_price, price) : null),
        note,
      });
      this.db.event('info', 'broker', `closed ${current.epic} deal on ${current.account} for ${current.run_id} @ ${price} (${note})`);
    } catch (err) {
      if (err instanceof CapitalApiError && err.status === 404) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.CLOSED, close_time: Date.now(), paper_close_price: paperPrice ?? null, note: `${note}; already closed at broker` });
        return;
      }
      this.fail(`close ${current.run_id}`, err);
    }
  }

  /** Broker-side copies of the paper stops: a safety net if the arena goes down. Best effort. */
  private async putStops(dealId: string, stopLoss: number | null, takeProfit: number | null): Promise<void> {
    const body: Record<string, number> = {};
    if (stopLoss !== null) body.stopLevel = stopLoss;
    if (takeProfit !== null) body.profitLevel = takeProfit;
    if (Object.keys(body).length === 0) return;
    try {
      await this.client.put(`/api/v1/positions/${dealId}`, body);
    } catch (err) {
      this.db.event('warn', 'broker', `could not set broker stops on ${dealId}: ${errorText(err)}`);
    }
  }

  // ------------------------------------------------------------------ reconcile & safety

  /** Runs as a job on the account's session: match tracked deals with the account's positions. */
  private async reconcile(account: Account): Promise<void> {
    const { positions } = await this.client.get<{ positions: BrokerPosition[] }>('/api/v1/positions');
    const open = new Map(positions.map(p => [p.position.dealId, p]));
    const tracked = this.db.openDeals().filter(d => d.account === account.name);
    const trackedIds = new Set(tracked.map(d => d.deal_id).filter(Boolean));
    for (const d of tracked.filter(d => !d.deal_id)) {
      const direction = d.side === 'long' ? DIRECTION_BUY : DIRECTION_SELL;
      const match = positions.find(p => !trackedIds.has(p.position.dealId) && p.market.epic === d.epic && p.position.direction === direction && Math.abs(p.position.size - d.size) < 1e-9);
      if (match) {
        this.db.updateDeal(d.id, { deal_id: match.position.dealId, open_price: match.position.level });
        trackedIds.add(match.position.dealId);
        d.deal_id = match.position.dealId;
        this.db.event('warn', 'broker', `adopted unconfirmed deal ${match.position.dealId} on ${account.name} for ${d.run_id}`);
      } else if (Date.now() - d.open_time > ADOPT_WINDOW_MS) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.FAILED, note: `${d.note ?? ''}; no matching position at the broker` });
      }
    }
    for (const d of tracked) {
      if (d.deal_id && !open.has(d.deal_id) && Date.now() - d.open_time > 30_000) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.CLOSED, close_time: Date.now(), note: 'closed at broker (stop/TP or manual)' });
        this.db.event('warn', 'broker', `deal ${d.deal_id} (${d.epic}, ${d.run_id}) on ${account.name} was closed at the broker`);
      }
    }
    account.foreignEpics = new Set(positions.filter(p => !trackedIds.has(p.position.dealId)).map(p => p.market.epic));
    account.lastReconcileAt = Date.now();
  }

  private allowOpen(runId: string): boolean {
    const now = Date.now();
    const recent = (this.runOpens.get(runId) ?? []).filter(t => now - t < HOUR_MS);
    if (recent.length >= MAX_OPENS_PER_RUN_PER_HOUR) {
      this.setExcluded(runId, true, `opened ${recent.length} times in an hour`);
      return false;
    }
    while (this.opens.length > 0 && now - this.opens[0]! > HOUR_MS) this.opens.shift();
    if (this.opens.length >= MAX_OPENS_PER_HOUR) {
      this.db.event('warn', 'broker', `${MAX_OPENS_PER_HOUR} opens in the last hour; skipping the order for ${runId}`);
      return false;
    }
    recent.push(now);
    this.runOpens.set(runId, recent);
    this.opens.push(now);
    return true;
  }

  private scaleOf(a: Account): number | null {
    return a.allocation === null ? null : Math.min(1, a.allocation / (a.slots * PAPER_CAPITAL));
  }

  private migrateLegacy(): void {
    const owner = this.opts.named[0]?.name;
    if (!owner) return;
    this.db.claimUnownedDeals(owner);
    const runs = this.db.getSetting<string[] | null>(LEGACY_SETTINGS.RUNS, null);
    if (runs === null) return;
    if (Object.keys(this.assignments).length === 0) {
      this.db.setSetting(BROKER_SETTINGS.ASSIGNMENTS, Object.fromEntries(runs.map(id => [id, owner])));
    }
    const startBalance = this.db.getSetting<number | null>(LEGACY_SETTINGS.START_BALANCE, null);
    if (!this.stored[owner]) {
      this.storeAccount(owner, {
        allocation: startBalance && startBalance > 0 ? Math.min(startBalance, MAX_ALLOCATION) : null,
        killed: this.db.getSetting<boolean>(LEGACY_SETTINGS.KILLED, false),
      });
    }
    for (const key of Object.values(LEGACY_SETTINGS)) this.db.deleteSetting(key);
    this.db.event('info', 'broker', `migrated the single-account mirror: ${runs.length} runs now assigned to ${owner}`);
  }

  // ------------------------------------------------------------------ queue

  private enqueue(account: string, run: () => Promise<void>, tag?: Job['tag']): void {
    this.queue.push({ account, enqueuedAt: Date.now(), run, tag });
    if (!this.draining) void this.drain();
  }

  /** Jobs for the session's current account first (fewer switches), unless the oldest job has waited too long. */
  private nextJob(): Job {
    if (Date.now() - this.queue[0]!.enqueuedAt < JOB_MAX_WAIT_MS) {
      const i = this.queue.findIndex(j => j.account === this.sessionAccount);
      if (i > 0) return this.queue.splice(i, 1)[0]!;
    }
    return this.queue.shift()!;
  }

  private async drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      const job = this.nextJob();
      try {
        await this.ensureAccount(job.account);
        await job.run();
      } catch (err) {
        this.fail(`job on ${job.account}`, err);
      }
    }
    this.draining = false;
  }

  /** Put the session on `name`, verified; again after any re-login. */
  private async ensureAccount(name: string): Promise<void> {
    const account = this.accounts.get(name);
    if (!account) throw new Error(`account ${name} is not available`);
    if (this.sessionAccount === name && this.verifiedLogins === this.client.logins) return;
    this.sessionAccount = null;
    await this.client.selectAccount(account.accountId);
    this.sessionAccount = name;
    this.verifiedLogins = this.client.logins;
  }

  private async confirm(dealReference: string): Promise<Confirmation> {
    for (let i = 0; i < CONFIRM_ATTEMPTS; i++) {
      await Bun.sleep(CONFIRM_DELAY_MS);
      try {
        const c = await this.client.get<Confirmation>(`/api/v1/confirms/${dealReference}`);
        if (c.dealStatus !== 'UNKNOWN') return c;
      } catch {
        // retry
      }
    }
    throw new Error(`no confirmation for ${dealReference}`);
  }

  private fail(what: string, err: unknown): void {
    this.lastError = `${what}: ${errorText(err)}`;
    this.db.event('error', 'broker', this.lastError);
  }
}

function scaledSize(inst: Instrument, paperSize: number, scale: number): number | null {
  const target = paperSize * scale;
  let size = Math.floor(target / inst.sizeStep + 1e-9) * inst.sizeStep;
  size = Number(size.toFixed(10));
  if (size < inst.minSize) {
    if (inst.minSize > target * MAX_MIN_SIZE_INFLATION) return null;
    size = inst.minSize;
  }
  return size;
}

/** Demo run ids are "demo:<agentId>:<epic>:<hash>". */
function epicOfRun(runId: string): string {
  const parts = runId.split(':');
  return parts[parts.length - 2]!;
}

function dealPnl(side: Side, size: number, open: number, close: number): number {
  return side === 'long' ? (close - open) * size : (open - close) * size;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
