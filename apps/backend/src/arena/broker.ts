/**
 * BrokerMirror — copies the paper trades of a few selected demo runs onto the
 * Capital.com DEMO sub-account (default "Gerti") as real demo orders, scaled
 * to that account's balance. It measures how far real fills drift from the
 * paper fills the leaderboard is built on.
 *
 * Safety rails (an older experiment wiped this account with a runaway loop):
 *   - at most one mirrored run per instrument (the account nets positions)
 *   - global order rate limit, and runs that order too often get unmirrored
 *   - kill switch: equity below KILL_FRACTION of the starting balance closes
 *     every mirrored deal and disables the mirror
 *   - deals the arena did not open are never touched; their instrument is skipped
 */
import type { CapitalClient } from '../capital/client.ts';
import { CapitalApiError } from '../capital/client.ts';
import type { Instrument } from '../engine/instruments.ts';
import { getInstrument } from '../engine/instruments.ts';
import type { RunEvent } from '../engine/run.ts';
import type { Side } from '../sdk/types.ts';
import type { ArenaDB, DealRow } from './db.ts';
import { DEAL_STATUS } from './db.ts';

export const BROKER_SETTINGS = {
  ENABLED: 'broker.enabled',
  RUNS: 'broker.runs',
  START_BALANCE: 'broker.startBalance',
  KILLED: 'broker.killed',
} as const;

const DIRECTION_BUY = 'BUY';
const DIRECTION_SELL = 'SELL';
const MIN_ORDER_GAP_MS = 1_000;
const MAX_ORDERS_PER_MINUTE = 20;
const MAX_ORDERS_PER_RUN_PER_HOUR = 12;
const KILL_FRACTION = 0.5;
const CONFIRM_ATTEMPTS = 8;
const CONFIRM_DELAY_MS = 300;
const RECONCILE_MS = 60_000;
/** Do not over-size: skip when the minimum deal is more than this multiple of the scaled size. */
const MAX_MIN_SIZE_INFLATION = 3;
/** Paper runs are sized for this much capital; broker sizes scale from it. */
const PAPER_CAPITAL = 10_000;

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

export interface BrokerStatus {
  enabled: boolean;
  killed: boolean;
  account: string;
  accountId: string | null;
  balance: number | null;
  equity: number | null;
  startBalance: number | null;
  mirroredRuns: string[];
  openDeals: number;
  foreignEpics: string[];
  lastReconcileAt: number;
  lastError: string | null;
}

type Job = () => Promise<void>;

export class BrokerMirror {
  private readonly queue: Job[] = [];
  private draining = false;
  private lastOrderAt = 0;
  private readonly orderTimes: number[] = [];
  private readonly runOrderTimes = new Map<string, number[]>();
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private accountId: string | null = null;
  private balance: number | null = null;
  private equity: number | null = null;
  private foreignEpics = new Set<string>();
  private lastReconcileAt = 0;
  private lastError: string | null = null;
  private ready = false;

  constructor(
    private readonly client: CapitalClient,
    private readonly db: ArenaDB,
    private readonly accountName: string,
    private readonly allocation: number,
  ) {}

  get mirroredRuns(): string[] {
    return this.db.getSetting<string[]>(BROKER_SETTINGS.RUNS, []);
  }

  get enabled(): boolean {
    return this.db.getSetting<boolean>(BROKER_SETTINGS.ENABLED, false) && !this.db.getSetting<boolean>(BROKER_SETTINGS.KILLED, false);
  }

  async start(): Promise<void> {
    this.accountId = await this.client.useAccount(this.accountName);
    await this.refreshAccount();
    if (this.db.getSetting<number | null>(BROKER_SETTINGS.START_BALANCE, null) === null && this.balance !== null) {
      this.db.setSetting(BROKER_SETTINGS.START_BALANCE, this.balance);
    }
    await this.reconcile();
    this.ready = true;
    this.reconcileTimer = setInterval(() => void this.reconcile().catch(err => this.fail('reconcile', err)), RECONCILE_MS);
    this.db.event('info', 'broker', `broker mirror ready on ${this.accountName} (balance ${this.balance}, mirroring ${this.mirroredRuns.length} runs, enabled=${this.enabled})`);
  }

  stop(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  status(): BrokerStatus {
    return {
      enabled: this.enabled,
      killed: this.db.getSetting<boolean>(BROKER_SETTINGS.KILLED, false),
      account: this.accountName,
      accountId: this.accountId,
      balance: this.balance,
      equity: this.equity,
      startBalance: this.db.getSetting<number | null>(BROKER_SETTINGS.START_BALANCE, null),
      mirroredRuns: this.mirroredRuns,
      openDeals: this.db.openDeals().length,
      foreignEpics: [...this.foreignEpics],
      lastReconcileAt: this.lastReconcileAt,
      lastError: this.lastError,
    };
  }

  /** Replace the mirrored set. Enforces one run per instrument. Closes deals of runs that were dropped. */
  setMirroredRuns(runIds: string[], epicOf: (runId: string) => string | null): string[] {
    const byEpic = new Map<string, string>();
    for (const id of runIds) {
      const epic = epicOf(id);
      if (epic && !byEpic.has(epic)) byEpic.set(epic, id);
    }
    const next = [...byEpic.values()];
    const dropped = this.mirroredRuns.filter(id => !next.includes(id));
    this.db.setSetting(BROKER_SETTINGS.RUNS, next);
    for (const id of dropped) this.closeRunDeals(id, 'run removed from mirror');
    this.db.event('info', 'broker', `mirrored runs: ${next.join(', ') || '(none)'}`);
    return next;
  }

  setEnabled(enabled: boolean): void {
    this.db.setSetting(BROKER_SETTINGS.ENABLED, enabled);
    if (enabled) this.db.setSetting(BROKER_SETTINGS.KILLED, false);
    if (!enabled) for (const d of this.db.openDeals()) this.enqueue(() => this.closeDeal(d, 'mirror disabled'));
    this.db.event('info', 'broker', `mirror ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** Paper-trade event from the arena. */
  onRunEvent(e: RunEvent, paperCapital: number = PAPER_CAPITAL): void {
    if (!this.ready || !this.enabled || !this.mirroredRuns.includes(e.runId)) return;
    if (e.type === 'open') this.enqueue(() => this.openDeal(e, paperCapital));
    else if (e.type === 'close') this.closeRunDeals(e.runId, `paper ${e.trade.exitReason}`, e.trade.exitPrice);
    else if (e.type === 'stops') this.enqueue(() => this.updateStops(e.runId, e.stopLoss, e.takeProfit));
  }

  // ------------------------------------------------------------------ actions

  private closeRunDeals(runId: string, note: string, paperPrice?: number): void {
    for (const d of this.db.openDeals().filter(d => d.run_id === runId)) {
      this.enqueue(() => this.closeDeal(d, note, paperPrice));
    }
  }

  private async openDeal(e: Extract<RunEvent, { type: 'open' }>, paperCapital: number): Promise<void> {
    const inst = getInstrument(this.epicOfRun(e.runId));
    if (this.foreignEpics.has(inst.epic)) {
      this.db.event('warn', 'broker', `skip ${e.runId}: account holds a position on ${inst.epic} that the arena did not open`);
      return;
    }
    if (this.db.openDeals().some(d => d.epic === inst.epic)) {
      this.db.event('warn', 'broker', `skip ${e.runId}: a mirrored deal on ${inst.epic} is still open`);
      return;
    }
    if (!this.allowOrder(e.runId)) return;
    const size = this.scaledSize(inst, e.size, paperCapital);
    if (size === null) {
      this.db.event('info', 'broker', `skip ${e.runId}: scaled size of ${e.size} is below ${inst.epic} minimum`);
      return;
    }
    const rowId = this.db.insertDeal({
      run_id: e.runId, epic: inst.epic, side: e.side, size, paper_size: e.size, deal_id: null, status: DEAL_STATUS.OPEN,
      open_time: Date.now(), open_price: null, paper_open_price: e.price, close_time: null, close_price: null,
      paper_close_price: null, pnl: null, note: null,
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
        this.db.event('warn', 'broker', `open rejected for ${e.runId}: ${conf.reason ?? 'unknown'}`);
        return;
      }
      const dealId = conf.affectedDeals?.[0]?.dealId ?? conf.dealId ?? null;
      this.db.updateDeal(rowId, { deal_id: dealId, open_price: conf.level ?? null });
      this.db.event('info', 'broker', `opened ${e.side} ${size} ${inst.epic} @ ${conf.level} for ${e.runId} (paper ${e.size} @ ${e.price})`);
      if (dealId && (e.stopLoss !== null || e.takeProfit !== null)) {
        await this.putStops(dealId, e.stopLoss, e.takeProfit);
      }
    } catch (err) {
      this.db.updateDeal(rowId, { status: DEAL_STATUS.FAILED, note: errorText(err) });
      this.fail(`open ${e.runId}`, err);
    }
  }

  private async closeDeal(d: DealRow, note: string, paperPrice?: number): Promise<void> {
    const current = this.db.openDeals().find(x => x.id === d.id);
    if (!current) return;
    if (!current.deal_id) {
      this.db.updateDeal(d.id, { status: DEAL_STATUS.FAILED, close_time: Date.now(), note: `${note}; never had a deal id` });
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
      this.db.event('info', 'broker', `closed ${current.epic} deal for ${current.run_id} @ ${price} (${note})`);
    } catch (err) {
      if (err instanceof CapitalApiError && err.status === 404) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.CLOSED, close_time: Date.now(), paper_close_price: paperPrice ?? null, note: `${note}; already closed at broker` });
        return;
      }
      this.fail(`close ${current.run_id}`, err);
    }
  }

  private async updateStops(runId: string, stopLoss: number | null, takeProfit: number | null): Promise<void> {
    const deal = this.db.openDeals().find(d => d.run_id === runId);
    if (deal?.deal_id) await this.putStops(deal.deal_id, stopLoss, takeProfit);
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

  async reconcile(): Promise<void> {
    const { positions } = await this.client.get<{ positions: BrokerPosition[] }>('/api/v1/positions');
    const open = new Map(positions.map(p => [p.position.dealId, p]));
    const tracked = this.db.openDeals();
    const trackedIds = new Set(tracked.map(d => d.deal_id).filter(Boolean));
    for (const d of tracked) {
      if (d.deal_id && !open.has(d.deal_id) && Date.now() - d.open_time > 30_000) {
        this.db.updateDeal(d.id, { status: DEAL_STATUS.CLOSED, close_time: Date.now(), note: 'closed at broker (stop/TP or manual)' });
        this.db.event('warn', 'broker', `deal ${d.deal_id} (${d.epic}, ${d.run_id}) was closed at the broker`);
      }
    }
    this.foreignEpics = new Set(positions.filter(p => !trackedIds.has(p.position.dealId)).map(p => p.market.epic));
    await this.refreshAccount();
    this.lastReconcileAt = Date.now();
    this.checkKillSwitch();
  }

  private async refreshAccount(): Promise<void> {
    const { accounts } = await this.client.get<{ accounts: { accountId: string; balance: { balance: number; profitLoss: number } }[] }>('/api/v1/accounts');
    const me = accounts.find(a => a.accountId === this.accountId);
    if (me) {
      this.balance = me.balance.balance;
      this.equity = me.balance.balance + me.balance.profitLoss;
    }
  }

  private checkKillSwitch(): void {
    const start = this.db.getSetting<number | null>(BROKER_SETTINGS.START_BALANCE, null);
    if (start === null || this.equity === null || !this.enabled) return;
    if (this.equity < start * KILL_FRACTION) {
      this.db.setSetting(BROKER_SETTINGS.KILLED, true);
      this.db.event('error', 'broker', `KILL SWITCH: ${this.accountName} equity ${this.equity} < ${KILL_FRACTION * 100}% of ${start}; closing all mirrored deals`);
      for (const d of this.db.openDeals()) this.enqueue(() => this.closeDeal(d, 'kill switch'));
    }
  }

  private allowOrder(runId: string): boolean {
    const now = Date.now();
    const recent = (this.runOrderTimes.get(runId) ?? []).filter(t => now - t < 3_600_000);
    if (recent.length >= MAX_ORDERS_PER_RUN_PER_HOUR) {
      this.setMirroredRuns(this.mirroredRuns.filter(id => id !== runId), id => this.epicOfRun(id));
      this.db.event('error', 'broker', `${runId} placed ${recent.length} orders in an hour; removed from the mirror`);
      return false;
    }
    while (this.orderTimes.length > 0 && now - this.orderTimes[0]! > 60_000) this.orderTimes.shift();
    if (this.orderTimes.length >= MAX_ORDERS_PER_MINUTE) {
      this.db.event('warn', 'broker', `global order limit reached; skipping order for ${runId}`);
      return false;
    }
    recent.push(now);
    this.runOrderTimes.set(runId, recent);
    this.orderTimes.push(now);
    return true;
  }

  private scaledSize(inst: Instrument, paperSize: number, paperCapital: number): number | null {
    const target = paperSize * (this.allocationPerRun() / paperCapital);
    let size = Math.floor(target / inst.sizeStep + 1e-9) * inst.sizeStep;
    size = Number(size.toFixed(10));
    if (size < inst.minSize) {
      if (inst.minSize > target * MAX_MIN_SIZE_INFLATION) return null;
      size = inst.minSize;
    }
    return size;
  }

  private allocationPerRun(): number {
    const n = Math.max(1, this.mirroredRuns.length);
    return this.allocation / n;
  }

  private epicOfRun(runId: string): string {
    // demo run ids are "demo:<agentId>:<epic>:<hash>"
    const parts = runId.split(':');
    return parts[parts.length - 2]!;
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

  private enqueue(job: Job): void {
    this.queue.push(job);
    if (!this.draining) void this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      const wait = this.lastOrderAt + MIN_ORDER_GAP_MS - Date.now();
      if (wait > 0) await Bun.sleep(wait);
      try {
        await job();
      } catch (err) {
        this.fail('job', err);
      }
      this.lastOrderAt = Date.now();
    }
    this.draining = false;
  }

  private fail(what: string, err: unknown): void {
    this.lastError = `${what}: ${errorText(err)}`;
    this.db.event('error', 'broker', this.lastError);
  }
}

function dealPnl(side: Side, size: number, open: number, close: number): number {
  return side === 'long' ? (close - open) * size : (open - close) * size;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
