/**
 * BrokerMirror — copies the paper trades of demo runs onto Capital.com DEMO
 * accounts as real demo orders. It measures how far real fills drift from the
 * paper fills the leaderboard is built on.
 *
 * Accounts: every demo account whose name starts with the prefix (default
 * "Arena", case-insensitive), picked up within a minute. Other accounts (the
 * user's) are never touched. Accounts are tracked by accountId, so renaming one
 * keeps its deals; renaming it away from the prefix closes the arena's deals
 * there and stops using it. Capital.com allows 10 demo accounts per login.
 *
 * Leverage: agents/roster.json gives each account a leverage tier ("Arena 01":
 * 1 … "Arena 09": 200). The mirror sets the account's per-asset-class leverage
 * to match (re-checked on every reconcile) and only mirrors runs of that tier
 * there, so a deal gets the same leverage as its paper run. Accounts without a
 * tier get no runs.
 *
 * Capacity: a new account is topped up to the 100k demo maximum and switched
 * to hedging mode, so it can hold many runs on the same instrument, each as its
 * own deal. Every mirrored order is SCALE × the paper size, and each run
 * reserves SCALE × $10,000 of an account: 50 runs per $100,000 account. An
 * account that cannot be switched to hedging holds one run per instrument.
 * Runs are assigned to free slots of their tier, best demo equity first. When
 * every slot is taken, a waiting run whose paper equity beats the weakest
 * mirrored run of the tier by PROMOTION_MARGIN takes its slot once that run is
 * flat (promotion/demotion; see slots.ts).
 *
 * Requests: one session switches between accounts; jobs are grouped per
 * account and paced by the RequestPacer shared with the candle poller.
 *
 * Safety rails (an older experiment wiped an account with a runaway loop):
 *   - the session's account is verified after every switch and re-login
 *   - a run opening MAX_OPENS_PER_RUN_PER_HOUR times in an hour is excluded
 *   - at most MAX_OPENS_PER_HOUR opens per hour in total (demo limit is 1,000)
 *   - kill switch per account: equity below KILL_FRACTION of its allocation on
 *     two consecutive checks closes its deals and stops using it
 *   - one open deal per run; positions the arena did not open are never touched
 *   - hedging mode and leverage are re-checked on every reconcile; no order goes
 *     to an account whose leverage is not confirmed
 *   - opens from replayed history (after a restart) are not mirrored, and a
 *     deal whose paper position is gone is closed
 */
import type { CapitalClient } from '../capital/client.ts';
import { CapitalApiError } from '../capital/client.ts';
import type { Instrument } from '../engine/instruments.ts';
import { ALL_EPICS, getInstrument } from '../engine/instruments.ts';
import { accountLeverages } from '../engine/leverage.ts';
import { parseDemoRunId } from '../engine/run-id.ts';
import type { RunEvent } from '../engine/run.ts';
import type { Side } from '../sdk/types.ts';
import type { ArenaDB, DealRow } from './db.ts';
import { DEAL_STATUS } from './db.ts';
import type { SlotCandidate } from './slots.ts';
import { accountsNeeded, assignSlots } from './slots.ts';

export const BROKER_SETTINGS = {
  ENABLED: 'broker.enabled',
  /** runId → accountId */
  RUN_ACCOUNTS: 'broker.runAccounts',
  /** runIds never to mirror (set by hand or by the runaway guard) */
  EXCLUDED: 'broker.excluded',
  /** accountId → StoredAccount */
  ACCOUNTS: 'broker.accountState',
} as const;

/** Keys of earlier mirror versions (accounts by name), dropped on start. */
const LEGACY_KEYS = ['broker.assignments', 'broker.accounts', 'broker.runs', 'broker.startBalance', 'broker.killed'];

export const DEFAULT_ACCOUNT_PREFIX = 'Arena';
/** Broker size = paper size × SCALE. At 0.2, 0.7% of backtest trades fall below a minimum size. */
export const SCALE = 0.2;
/** Paper runs are sized for this much capital. */
const PAPER_CAPITAL = 10_000;
/** Account balance each mirrored run reserves. */
export const RUN_ALLOCATION = SCALE * PAPER_CAPITAL;
/** Capital.com caps a demo account's balance, and its total deposits, at 100,000. */
const MAX_BALANCE = 100_000;
/** An account is used only once it can hold at least this many runs. */
const MIN_RUNS_PER_ACCOUNT = 10;
/** Capital.com limit observed 2026-10: 10 demo accounts per login. */
export const MAX_ACCOUNTS_PER_LOGIN = 10;

const DIRECTION_BUY = 'BUY';
const DIRECTION_SELL = 'SELL';
const MAX_OPENS_PER_RUN_PER_HOUR = 12;
const MAX_OPENS_PER_HOUR = 600;
const HOUR_MS = 3_600_000;
const TOP_UP_RETRY_MS = 24 * HOUR_MS;
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
/** A job whose account switch failed (e.g. a Capital.com gateway timeout) is tried once more after this. */
const JOB_RETRY_DELAY_MS = 5_000;
/** Do not over-size: skip when the minimum deal is more than this multiple of the scaled size. */
const MAX_MIN_SIZE_INFLATION = 3;
/** Paper equity a waiting run must be ahead of the weakest mirrored run to take its slot (2% of paper capital). */
const PROMOTION_MARGIN = 0.02 * PAPER_CAPITAL;
const MAX_PROMOTIONS_PER_CYCLE = 10;

export interface BrokerOptions {
  /** Accounts whose name starts with this (case-insensitive) are used. */
  prefix: string;
  /** Account name → leverage tier (agents/roster.json "accounts"). */
  accountTiers: Readonly<Record<string, number>>;
}

/** A live demo run the arena offers for mirroring. */
export interface MirrorCandidate extends SlotCandidate {
  /** Side of the paper position, null when flat. */
  side: Side | null;
  /** Higher is mirrored first when slots are short. */
  score: number;
  /** The run's leverage tier: it is mirrored on an account of that tier. */
  tier: number;
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
  balance: { balance: number; deposit: number; profitLoss: number };
}

interface Preferences {
  hedgingMode: boolean;
  /** Capital.com asset class (INDICES, CURRENCIES, …) → current and available leverage. */
  leverages?: Record<string, { current: number; available: number[] }>;
}

interface StoredAccount {
  name: string;
  allocation: number | null;
  killed: boolean;
  /** Last hedging mode read from the account (kept so a restart does not reshuffle runs). */
  hedging?: boolean;
  /** Leverage tier last confirmed on the account. */
  leverage?: number;
  /** Last top-up attempt (ms). */
  topUpAt?: number;
}

interface Account {
  id: string;
  name: string;
  balance: number;
  deposit: number;
  equity: number;
  allocation: number | null;
  /** Null until read from the account's preferences. */
  hedging: boolean | null;
  /** Leverage tier from the roster; null = no tier, no runs. */
  tier: number | null;
  /** Whether the account's leverages match its tier; null until read. */
  leverageOk: boolean | null;
  /** Renamed away from the prefix: no new runs; the arena's deals there are being closed. */
  retiring: boolean;
  lowReadings: number;
  foreignEpics: Set<string>;
  lastReconcileAt: number;
}

export interface BrokerAccountStatus {
  id: string;
  name: string;
  balance: number;
  equity: number;
  allocation: number | null;
  slots: number;
  hedging: boolean | null;
  /** Leverage tier (agents/roster.json); null = not used. */
  leverage: number | null;
  /** The account's leverage settings match the tier; null until read. */
  leverageOk: boolean | null;
  runs: string[];
  openDeals: number;
  killed: boolean;
  retiring: boolean;
  /** Instruments with positions the arena did not open. */
  foreignEpics: string[];
  lastReconcileAt: number;
}

export interface BrokerStatus {
  enabled: boolean;
  prefix: string;
  /** Broker size ÷ paper size. */
  scale: number;
  /** Runs a full ($100,000, hedging) account holds. */
  slotsPerAccount: number;
  maxAccountsPerLogin: number;
  accounts: BrokerAccountStatus[];
  /** Per leverage tier: its accounts and how many of its live runs are mirrored. */
  tiers: { leverage: number; accounts: string[]; slots: number; liveRuns: number; mirrored: number }[];
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
  accountId: string;
  enqueuedAt: number;
  run: () => Promise<void>;
  tag?: typeof JOB_RECONCILE;
  /** Set when the job was put back after its account switch failed. */
  retried?: boolean;
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

  /** The arena's live runs. Must be set before start(). */
  setCandidateSource(source: () => MirrorCandidate[]): void {
    this.candidates = source;
  }

  get enabled(): boolean {
    return this.db.getSetting<boolean>(BROKER_SETTINGS.ENABLED, false);
  }

  private get runAccounts(): Record<string, string> {
    return this.db.getSetting<Record<string, string>>(BROKER_SETTINGS.RUN_ACCOUNTS, {});
  }

  private get excluded(): string[] {
    return this.db.getSetting<string[]>(BROKER_SETTINGS.EXCLUDED, []);
  }

  private get stored(): Record<string, StoredAccount> {
    return this.db.getSetting<Record<string, StoredAccount>>(BROKER_SETTINGS.ACCOUNTS, {});
  }

  private storeAccount(a: Account, patch: Partial<StoredAccount>): void {
    const all = this.stored;
    all[a.id] = { ...(all[a.id] ?? { name: a.name, allocation: null, killed: false }), name: a.name, ...patch };
    this.db.setSetting(BROKER_SETTINGS.ACCOUNTS, all);
  }

  private isKilled(id: string): boolean {
    return this.stored[id]?.killed ?? false;
  }

  /** Run ids currently assigned to a broker account. */
  get mirroredRuns(): string[] {
    return Object.keys(this.runAccounts);
  }

  async start(): Promise<void> {
    for (const key of LEGACY_KEYS) this.db.deleteSetting(key);
    await this.cycle();
    this.scheduleCycle();
  }

  stop(): void {
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
  }

  status(): BrokerStatus {
    const runAccounts = this.runAccounts;
    const open = this.db.openDeals();
    const liveIds = new Set(this.live.map(c => c.runId));
    const excluded = this.excluded.filter(id => liveIds.has(id));
    const now = Date.now();
    const accounts = [...this.accounts.values()];
    const tierList = [...new Set([...accounts.flatMap(a => (a.tier === null ? [] : [a.tier])), ...this.live.map(c => c.tier)])].sort((a, b) => a - b);
    const accountOf = (runId: string) => this.accounts.get(runAccounts[runId] ?? '');
    return {
      enabled: this.enabled,
      prefix: this.opts.prefix,
      scale: SCALE,
      slotsPerAccount: MAX_BALANCE / RUN_ALLOCATION,
      maxAccountsPerLogin: MAX_ACCOUNTS_PER_LOGIN,
      accounts: [...this.accounts.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(a => ({
          id: a.id,
          name: a.name,
          balance: a.balance,
          equity: a.equity,
          allocation: a.allocation,
          slots: slotsOf(a),
          hedging: a.hedging,
          leverage: a.tier,
          leverageOk: a.leverageOk,
          runs: Object.keys(runAccounts).filter(id => runAccounts[id] === a.id),
          openDeals: open.filter(d => d.account_id === a.id).length,
          killed: this.isKilled(a.id),
          retiring: a.retiring,
          foreignEpics: [...a.foreignEpics],
          lastReconcileAt: a.lastReconcileAt,
        })),
      tiers: tierList.map(leverage => {
        const mine = accounts.filter(a => a.tier === leverage && !a.retiring && !this.isKilled(a.id));
        const live = this.live.filter(c => c.tier === leverage);
        return {
          leverage,
          accounts: mine.map(a => a.name).sort(),
          slots: mine.reduce((n, a) => n + slotsOf(a), 0),
          liveRuns: live.length,
          mirrored: live.filter(c => accountOf(c.runId)?.tier === leverage).length,
        };
      }),
      coverage: {
        liveRuns: this.live.length,
        mirrored: Object.keys(runAccounts).length,
        excluded: excluded.length,
        unassigned: this.unassigned.length,
        accountsNeeded: accountsNeeded(this.unassigned, MAX_BALANCE / RUN_ALLOCATION, false),
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
      for (const a of this.accounts.values()) {
        this.storeAccount(a, { killed: false });
        a.lowReadings = 0;
      }
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
    if (e.type === 'stops') {
      const deal = this.db.openDeals().find(d => d.run_id === e.runId && d.deal_id && d.account_id);
      if (deal) this.enqueue(deal.account_id!, () => this.putStops(deal.deal_id!, e.stopLoss, e.takeProfit));
      return;
    }
    const id = this.runAccounts[e.runId];
    const account = id ? this.accounts.get(id) : undefined;
    if (!account || Date.now() - e.time > STALE_EVENT_MS) return;
    this.enqueue(account.id, () => this.openDeal(account, e));
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
      if (!this.ready) this.db.fillDealAccountIds(new Map([...this.accounts.values()].map(a => [a.name, a.id])));
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
      const mine = open.filter(d => d.account_id === a.id);
      const every =
        a.tier !== null && a.leverageOk === null ? 0
        : mine.some(d => !d.deal_id) ? RECONCILE_UNCONFIRMED_MS
        : mine.length > 0 ? RECONCILE_OPEN_MS
        : RECONCILE_IDLE_MS;
      if (now - a.lastReconcileAt < every - RECONCILE_SLACK_MS) continue;
      if (this.queue.some(j => j.tag === JOB_RECONCILE && j.accountId === a.id)) continue;
      this.enqueue(a.id, () => this.reconcile(a), JOB_RECONCILE);
    }
  }

  /** Discover accounts, read every balance with one GET /accounts, fund and enroll new ones. */
  private async refreshAccounts(): Promise<void> {
    const { accounts } = await this.client.get<{ accounts: ApiAccount[] }>('/api/v1/accounts');
    const listed = new Set(accounts.map(a => a.accountId));
    const prefix = this.opts.prefix.toLowerCase();
    const now = Date.now();
    for (const api of accounts) {
      const matches = api.accountName.toLowerCase().startsWith(prefix);
      let a = this.accounts.get(api.accountId);
      if (!matches) {
        if (a && !a.retiring) this.retire(a, `renamed to "${api.accountName}"`);
        if (!a) continue;
      }
      if (!a) {
        a = {
          id: api.accountId, name: api.accountName, balance: 0, deposit: 0, equity: 0,
          allocation: this.stored[api.accountId]?.allocation ?? null, hedging: this.stored[api.accountId]?.hedging ?? null,
          tier: null, leverageOk: null, retiring: false, lowReadings: 0, foreignEpics: new Set(), lastReconcileAt: 0,
        };
        this.accounts.set(a.id, a);
      } else if (matches && a.retiring) {
        a.retiring = false;
        this.db.event('info', 'broker', `account ${api.accountName} matches "${this.opts.prefix}" again; using it`);
      }
      if (a.name !== api.accountName) {
        this.db.event('info', 'broker', `account ${a.name} is now called ${api.accountName}`);
        a.name = api.accountName;
      }
      const tier = this.opts.accountTiers[a.name] ?? null;
      if (tier !== a.tier || (a.tier === null && a.leverageOk !== null)) {
        a.tier = tier;
        // A restart trusts the leverage confirmed last time; a new tier is checked on the next reconcile.
        a.leverageOk = tier !== null && this.stored[a.id]?.leverage === tier ? true : null;
      }
      a.balance = api.balance.balance;
      a.deposit = api.balance.deposit;
      a.equity = api.balance.balance + api.balance.profitLoss;
      if (a.retiring) {
        const mine = this.db.openDeals().filter(d => d.account_id === a.id);
        if (mine.length === 0) {
          this.accounts.delete(a.id);
          this.db.event('info', 'broker', `stopped using ${a.name}: no arena deals left there`);
        } else if (!this.queue.some(j => j.accountId === a.id)) {
          for (const d of mine) this.enqueueClose(d, 'account no longer used');
        }
        continue;
      }
      if (a.allocation === null && !a.retiring) this.enroll(a, now);
    }
    for (const a of [...this.accounts.values()]) {
      if (listed.has(a.id)) continue;
      this.accounts.delete(a.id);
      if (this.sessionAccount === a.id) this.sessionAccount = null;
      for (const d of this.db.openDeals().filter(d => d.account_id === a.id)) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.FAILED, close_time: Date.now(), note: 'account deleted at Capital.com' });
      }
      this.db.event('warn', 'broker', `account ${a.name} no longer exists; its runs will be reassigned`);
    }
  }

  /** Top up once (retried daily) to the demo maximum, then reserve the balance for runs. */
  private enroll(a: Account, now: number): void {
    const st = this.stored[a.id];
    // Both the balance and the total deposits are capped; whichever is higher limits the top-up.
    const funded = Math.max(a.balance, a.deposit);
    if (funded < MAX_BALANCE - 1 && (!st?.topUpAt || now - st.topUpAt > TOP_UP_RETRY_MS)) {
      this.storeAccount(a, { topUpAt: now });
      this.enqueue(a.id, () => this.topUp(a, Math.floor(MAX_BALANCE - funded)));
      return; // enroll on the next cycle with the new balance
    }
    // Capital.com occasionally reports 0 on a first read; only a real balance enrolls an account.
    if (a.balance < MIN_RUNS_PER_ACCOUNT * RUN_ALLOCATION) return;
    a.allocation = Math.min(a.balance, MAX_BALANCE);
    this.storeAccount(a, { allocation: a.allocation });
    this.db.event('info', 'broker', `account ${a.name} enrolled: allocation ${a.allocation}, room for ${slotsOf({ ...a, hedging: true })} runs${a.tier === null ? '; no leverage tier in agents/roster.json, so no runs yet' : ` at 1:${a.tier}`}`);
  }

  private retire(a: Account, why: string): void {
    a.retiring = true;
    this.db.event('warn', 'broker', `account ${a.name} ${why}: no longer used; closing the arena's deals there`);
    for (const d of this.db.openDeals().filter(d => d.account_id === a.id)) this.enqueueClose(d, `account ${why}`);
  }

  private async topUp(a: Account, amount: number): Promise<void> {
    if (amount <= 0) return;
    try {
      await this.client.post('/api/v1/accounts/topUp', { amount });
      this.db.event('info', 'broker', `topped up ${a.name} by ${amount} to the ${MAX_BALANCE} demo maximum`);
    } catch (err) {
      this.db.event('warn', 'broker', `could not top up ${a.name} (${errorText(err)}); will retry in a day, or use the current balance if it is enough`);
    }
  }

  /** Fires when an account's equity is below KILL_FRACTION of its allocation on two consecutive cycles. */
  private checkKillSwitches(): void {
    if (!this.enabled) return;
    for (const a of this.accounts.values()) {
      if (a.allocation === null || this.isKilled(a.id)) continue;
      const floor = a.allocation * KILL_FRACTION;
      a.lowReadings = a.equity < floor ? a.lowReadings + 1 : 0;
      if (a.lowReadings < KILL_CONFIRMATIONS) continue;
      this.storeAccount(a, { killed: true });
      this.db.event('error', 'broker', `KILL SWITCH: ${a.name} equity ${a.equity} < ${floor} (${KILL_FRACTION * 100}% of its ${a.allocation} allocation); closing its deals`);
      for (const d of this.db.openDeals().filter(d => d.account_id === a.id)) this.enqueueClose(d, 'kill switch');
    }
  }

  /** Assign live runs to free slots; runs that lose their slot have their deals closed. */
  private rebalance(): void {
    const live = [...this.candidates()].sort((a, b) => b.score - a.score);
    const before = this.runAccounts;
    if (live.length === 0 && Object.keys(before).length > 0) return; // arena not ready; keep what we have
    this.live = live;
    const active = [...this.accounts.values()].filter(a => a.allocation !== null && !a.retiring && !this.isKilled(a.id) && a.tier !== null);
    // Modes are read on the next reconcile (due at once); until then keep what we have.
    if (active.some(a => a.hedging === null || a.leverageOk === null)) return;
    const usable = active
      .filter(a => a.leverageOk)
      .map(a => ({ name: a.id, slots: slotsOf(a), onePerEpic: !a.hedging, blockedEpics: a.foreignEpics, tier: a.tier! }));
    const flat = new Set(live.filter(c => c.side === null).map(c => c.runId));
    const withDeal = new Set(this.db.openDeals().map(d => d.run_id));
    const plan = assignSlots(before, usable, live, new Set(this.excluded), {
      margin: PROMOTION_MARGIN,
      maxSwaps: MAX_PROMOTIONS_PER_CYCLE,
      canDemote: id => flat.has(id) && !withDeal.has(id),
    });
    this.db.setSetting(BROKER_SETTINGS.RUN_ACCOUNTS, plan.assignments);
    this.unassigned = plan.unassigned;
    const dropped = Object.keys(before).filter(id => plan.assignments[id] === undefined);
    const added = Object.keys(plan.assignments).filter(id => before[id] === undefined);
    for (const id of dropped) this.closeRunDeals(id, 'run no longer mirrored');
    for (let i = 0; i < plan.promoted.length; i++) {
      this.db.event('info', 'broker', `promoted ${plan.promoted[i]} to the broker in place of ${plan.demoted[i]} (better demo equity)`);
    }
    if (dropped.length > 0 || added.length > 0) {
      this.db.event(
        'info',
        'broker',
        `mirroring ${Object.keys(plan.assignments).length} of ${live.length} live runs on ${usable.length} accounts (+${added.length} −${dropped.length})` +
          (plan.unassigned.length > 0 ? `; ${plan.unassigned.length} without a slot` : ''),
      );
    }
  }

  /** Close confirmed deals whose paper position is gone or on the other side. */
  private syncWithPaper(): void {
    if (this.live.length === 0) return;
    const side = new Map(this.live.map(c => [c.runId, c.side]));
    for (const d of this.db.openDeals()) {
      if (!d.deal_id || !d.account_id || !this.accounts.has(d.account_id)) continue;
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
    if (d.account_id) this.enqueue(d.account_id, () => this.closeDeal(d, note, paperPrice));
  }

  private async openDeal(account: Account, e: Extract<RunEvent, { type: 'open' }>): Promise<void> {
    const run = parseDemoRunId(e.runId);
    if (!run || account.retiring || this.isKilled(account.id) || this.runAccounts[e.runId] !== account.id) return;
    if (account.leverageOk !== true || account.tier !== run.leverage) {
      this.db.event('warn', 'broker', `skip ${e.runId}: ${account.name} is not confirmed at 1:${run.leverage}`);
      return;
    }
    const inst = getInstrument(run.epic);
    const open = this.db.openDeals();
    if (open.some(d => d.run_id === e.runId)) {
      this.db.event('warn', 'broker', `skip ${e.runId}: its previous deal is still open`);
      return;
    }
    if (!account.hedging) {
      if (account.foreignEpics.has(inst.epic)) {
        this.db.event('warn', 'broker', `skip ${e.runId}: ${account.name} (netting) holds a position on ${inst.epic} that the arena did not open`);
        return;
      }
      if (open.some(d => d.account_id === account.id && d.epic === inst.epic)) {
        this.db.event('warn', 'broker', `skip ${e.runId}: ${account.name} (netting) already has a deal on ${inst.epic}`);
        return;
      }
    }
    if (!this.allowOpen(e.runId)) return;
    const size = scaledSize(inst, e.size, SCALE);
    if (size === null) {
      this.db.event('info', 'broker', `skip ${e.runId}: ${SCALE} × ${e.size} is below the ${inst.epic} minimum`);
      return;
    }
    const rowId = this.db.insertDeal({
      account: account.name, account_id: account.id, run_id: e.runId, epic: inst.epic, side: e.side, size, paper_size: e.size,
      deal_id: null, status: DEAL_STATUS.OPEN, open_time: Date.now(), open_price: null, paper_open_price: e.price,
      close_time: null, close_price: null, paper_close_price: null, pnl: null, note: null,
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

  /**
   * Hedging mode lets one account hold many runs on the same instrument, and the
   * account's leverage must match its tier; set both and keep them. A position
   * keeps the leverage it was opened with, so changing it never touches open deals.
   */
  private async ensureSettings(a: Account): Promise<void> {
    let prefs = await this.client.get<Preferences>('/api/v1/accounts/preferences');
    const want = a.tier === null ? null : accountLeverages(a.tier);
    const leverageWrong = () =>
      want !== null && Object.entries(want).some(([cls, l]) => prefs.leverages?.[cls] !== undefined && prefs.leverages[cls]!.current !== l);
    if (a.leverageOk === true && leverageWrong()) this.db.event('error', 'broker', `${a.name} leverage changed outside the arena; setting it back to 1:${a.tier}`);
    if (!a.retiring && (!prefs.hedgingMode || leverageWrong())) {
      const body: { hedgingMode?: boolean; leverages?: Record<string, number> } = {};
      if (!prefs.hedgingMode) body.hedgingMode = true;
      if (leverageWrong()) body.leverages = want!;
      try {
        await this.client.put('/api/v1/accounts/preferences', body);
      } catch (err) {
        this.db.event('warn', 'broker', `could not update ${a.name} settings ${JSON.stringify(body)} (${errorText(err)})`);
      }
      prefs = await this.client.get<Preferences>('/api/v1/accounts/preferences');
      if (body.hedgingMode) {
        this.db.event(
          prefs.hedgingMode ? 'info' : 'warn',
          'broker',
          prefs.hedgingMode ? `${a.name} switched to hedging mode` : `${a.name} stays in netting mode: one run per instrument`,
        );
      }
      if (body.leverages) {
        const settings = Object.entries(body.leverages).map(([cls, l]) => `${cls} 1:${l}`).join(', ');
        if (leverageWrong()) this.db.event('error', 'broker', `${a.name} could not be set to 1:${a.tier} (${settings}); no runs there until it is`);
        else this.db.event('info', 'broker', `${a.name} set to 1:${a.tier}: ${settings}`);
      }
    }
    if (a.hedging === true && !prefs.hedgingMode) this.db.event('error', 'broker', `${a.name} left hedging mode; runs there are limited to one per instrument`);
    a.hedging = prefs.hedgingMode;
    a.leverageOk = want === null ? null : !leverageWrong();
    const patch: Partial<StoredAccount> = {};
    if (this.stored[a.id]?.hedging !== a.hedging) patch.hedging = a.hedging;
    if (a.leverageOk && this.stored[a.id]?.leverage !== a.tier) patch.leverage = a.tier!;
    if (Object.keys(patch).length > 0) this.storeAccount(a, patch);
  }

  /** Runs as a job on the account's session: match tracked deals with the account's positions. */
  private async reconcile(a: Account): Promise<void> {
    await this.ensureSettings(a);
    const { positions } = await this.client.get<{ positions: BrokerPosition[] }>('/api/v1/positions');
    const open = new Map(positions.map(p => [p.position.dealId, p]));
    const tracked = this.db.openDeals().filter(d => d.account_id === a.id);
    const trackedIds = new Set(tracked.map(d => d.deal_id).filter(Boolean));
    // A deal the arena lost track of (e.g. its account was renamed) is still recognisable by its deal id.
    for (const p of positions) {
      if (trackedIds.has(p.position.dealId)) continue;
      const row = this.db.dealByDealId(p.position.dealId);
      if (!row || row.status === DEAL_STATUS.OPEN) continue;
      this.db.updateDeal(row.id, { status: DEAL_STATUS.OPEN, account: a.name, account_id: a.id, close_time: null, note: `re-attached on ${a.name}` });
      trackedIds.add(p.position.dealId);
      tracked.push({ ...row, status: DEAL_STATUS.OPEN, account: a.name, account_id: a.id });
      this.db.event('warn', 'broker', `re-attached deal ${p.position.dealId} (${row.epic}, ${row.run_id}) found on ${a.name}`);
    }
    for (const d of tracked.filter(d => !d.deal_id)) {
      const direction = d.side === 'long' ? DIRECTION_BUY : DIRECTION_SELL;
      const match = positions.find(p => !trackedIds.has(p.position.dealId) && p.market.epic === d.epic && p.position.direction === direction && Math.abs(p.position.size - d.size) < 1e-9);
      if (match) {
        this.db.updateDeal(d.id, { deal_id: match.position.dealId, open_price: match.position.level });
        trackedIds.add(match.position.dealId);
        d.deal_id = match.position.dealId;
        this.db.event('warn', 'broker', `adopted unconfirmed deal ${match.position.dealId} on ${a.name} for ${d.run_id}`);
      } else if (Date.now() - d.open_time > ADOPT_WINDOW_MS) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.FAILED, note: `${d.note ?? ''}; no matching position at the broker` });
      }
    }
    for (const d of tracked) {
      if (d.deal_id && !open.has(d.deal_id) && Date.now() - d.open_time > 30_000) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.CLOSED, close_time: Date.now(), note: 'closed at broker (stop/TP or manual)' });
        this.db.event('warn', 'broker', `deal ${d.deal_id} (${d.epic}, ${d.run_id}) on ${a.name} was closed at the broker`);
      }
    }
    a.foreignEpics = new Set(positions.filter(p => !trackedIds.has(p.position.dealId)).map(p => p.market.epic));
    a.lastReconcileAt = Date.now();
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

  // ------------------------------------------------------------------ queue

  private enqueue(accountId: string, run: () => Promise<void>, tag?: Job['tag']): void {
    this.queue.push({ accountId, enqueuedAt: Date.now(), run, tag });
    if (!this.draining) void this.drain();
  }

  /** Jobs for the session's current account first (fewer switches), unless the oldest job has waited too long. */
  private nextJob(): Job {
    if (Date.now() - this.queue[0]!.enqueuedAt < JOB_MAX_WAIT_MS) {
      const i = this.queue.findIndex(j => j.accountId === this.sessionAccount);
      if (i > 0) return this.queue.splice(i, 1)[0]!;
    }
    return this.queue.shift()!;
  }

  private async drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      const job = this.nextJob();
      const name = this.accounts.get(job.accountId)?.name ?? job.accountId;
      try {
        await this.ensureAccount(job.accountId);
      } catch (err) {
        if (!job.retried && this.accounts.has(job.accountId)) {
          setTimeout(() => {
            this.queue.push({ ...job, retried: true });
            if (!this.draining) void this.drain();
          }, JOB_RETRY_DELAY_MS);
          this.db.event('warn', 'broker', `switch to ${name} failed (${errorText(err)}); retrying the job`);
        } else {
          this.fail(`job on ${name}`, err);
        }
        continue;
      }
      try {
        await job.run();
      } catch (err) {
        this.fail(`job on ${name}`, err);
      }
    }
    this.draining = false;
  }

  /** Put the session on the account, verified; again after any re-login. */
  private async ensureAccount(id: string): Promise<void> {
    if (!this.accounts.has(id)) throw new Error(`account ${id} is not available`);
    if (this.sessionAccount === id && this.verifiedLogins === this.client.logins) return;
    this.sessionAccount = null;
    await this.client.selectAccount(id);
    this.sessionAccount = id;
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

/** Runs an account can hold: its allocation in RUN_ALLOCATION units; in netting mode also one per instrument. */
function slotsOf(a: Pick<Account, 'allocation' | 'hedging'>): number {
  if (a.allocation === null) return 0;
  // 1% tolerance: a $99,999.76 account still holds 50 runs.
  const bySize = Math.floor(a.allocation / RUN_ALLOCATION + 0.01);
  return a.hedging === false ? Math.min(bySize, ALL_EPICS.length) : bySize;
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

function dealPnl(side: Side, size: number, open: number, close: number): number {
  return side === 'long' ? (close - open) * size : (open - close) * size;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
