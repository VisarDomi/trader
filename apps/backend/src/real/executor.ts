/**
 * RealExecutor — lightweight single-agent live executor running on Hetzner.
 *
 * Safety invariants:
 *   - Talks ONLY to `REAL_BASE_URL` via a live `CapitalClient`, locked to one
 *     explicit `accountId` whose `currency` MUST be `USD`. Other real accounts
 *     (e.g. `Real Euro`) are never selected or touched.
 *   - Only ONE run can control the Real USD account at a time. Any promotion of
 *     a different run is rejected until the current run is demoted first.
 *   - Never calls `/accounts/topUp`; never modifies `hedgingMode`; never closes
 *     or modifies positions it did not open (foreign positions are ignored).
 *   - Runs the assigned strategy independently using live Capital.com 1m bars
 *     and live WebSocket quotes so PC reboots or home-network outages do not
 *     interrupt stops, entries, or scheduled exits.
 */
import type { RealStatus } from '@trader/shared/types';
import type { CapitalClient } from '../capital/client.ts';
import { CapitalApiError, RESOLUTION } from '../capital/client.ts';
import { DAY_MS, MINUTE_MS, SCHEDULED_EXIT_NOTE } from '../engine/clock.ts';
import { getInstrument } from '../engine/instruments.ts';
import { CAPITAL_LEVERAGE_CLASS, effectiveLeverage } from '../engine/leverage.ts';
import { loadAgents, type LoadedAgent } from '../engine/loader.ts';
import { MarketEngine, type ClosedBar } from '../engine/market.ts';
import type { AgentRun, RunEvent } from '../engine/run.ts';
import { VirtualVenue, DEFAULT_EXECUTION_MS } from '../engine/venue.ts';
import type { Side } from '../sdk/types.ts';
import { closingDirection, confirmsDeal } from '../arena/broker.ts';
import { QuoteStream } from '../arena/stream.ts';
import { RealDB, type RealAssignment, type RealDealRow } from './db.ts';
import { realOrderSize } from './sizing.ts';

const REFERENCE_CAPITAL = 10_000;
const CYCLE_MS = 60_000;
const POLL_OFFSET_MS = 10_000;
const MAX_PRICE_WINDOW = 1000;
const CONFIRM_ATTEMPTS = 8;
const CONFIRM_DELAY_MS = 300;
const ADOPT_WINDOW_MS = 5 * 60_000;
const HOUR_MS = 3_600_000;
const MAX_OPENS_PER_HOUR = 6;
const DIRECTION_BUY = 'BUY';
const DIRECTION_SELL = 'SELL';

interface ApiAccount {
  accountId: string;
  accountName: string;
  currency?: string;
  status?: string;
  balance: { balance: number; deposit: number; profitLoss: number; available?: number };
}

interface Preferences {
  hedgingMode: boolean;
  leverages?: Record<string, { current: number; available: number[] }>;
}

interface BrokerPosition {
  position: { dealId: string; direction: string; size: number; level: number; upl?: number; createdDateUTC?: string };
  market: { epic: string; bid: number; offer: number };
}

interface Confirmation {
  dealStatus: 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
  epic?: string;
  direction?: string;
  size?: number;
  dealId?: string;
  affectedDeals?: { dealId: string; status: string }[];
  level?: number;
  profit?: number;
  reason?: string;
}

export interface RealExecutorOptions {
  accountId: string;
  expectedCurrency?: string;
  agentsDir?: string;
  hostLabel?: string;
  /** Disable sockets/timers in unit tests. */
  live?: boolean;
}

export interface AssignRequest {
  runId: string;
  agentId: string;
  epic: string;
  leverage: number;
  codeHash?: string;
}

export class RealExecutor {
  private readonly expectedCurrency: string;
  private readonly liveMode: boolean;
  private readonly hostLabel: string;

  private accountName: string | null = null;
  private currency: string | null = null;
  private balance: number | null = null;
  private available: number | null = null;
  private equity: number | null = null;
  private leverage: number | null = null;
  private leverageOk: boolean | null = null;

  private engine: MarketEngine | null = null;
  private venue: VirtualVenue | null = null;
  private run: AgentRun | null = null;
  private agent: LoadedAgent | null = null;
  private stream: QuoteStream | null = null;
  private lastCandle = 0;

  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private verifiedLogins = -1;
  private serial: Promise<void> = Promise.resolve();
  private lastCycleAt = 0;
  private lastError: string | null = null;
  private ready = false;
  private readonly opens: number[] = [];
  private timedCloseAt = 0;

  constructor(
    private readonly client: CapitalClient,
    readonly db: RealDB,
    private readonly opts: RealExecutorOptions,
  ) {
    if (!opts.accountId || !opts.accountId.trim()) {
      throw new Error('CAPITAL_REAL_ACCOUNT_ID is required for RealExecutor');
    }
    this.expectedCurrency = (opts.expectedCurrency ?? 'USD').toUpperCase();
    this.liveMode = opts.live !== false;
    this.hostLabel = opts.hostLabel ?? 'hetzner';
    const now = Date.now();
    for (const d of this.db.deals(200)) {
      if (now - d.open_time < HOUR_MS) this.opens.push(d.open_time);
    }
  }

  get assignment(): RealAssignment | null {
    return this.db.getAssignment();
  }

  async start(): Promise<void> {
    await this.enqueue(() => this.refreshAccount());
    const saved = this.db.getAssignment();
    if (saved) {
      try {
        await this.activate(saved);
      } catch (err) {
        this.fail(`restore ${saved.runId}`, err);
      }
    }
    await this.enqueue(() => this.reconcile());
    this.ready = true;
    this.lastCycleAt = Date.now();
    if (this.liveMode) {
      this.scheduleCycle();
      this.schedulePoll();
      this.clockTimer = setInterval(() => this.onClock(Date.now()), 1000);
    }
  }

  stop(): void {
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.cycleTimer = null;
    this.pollTimer = null;
    this.clockTimer = null;
    this.teardownRunner();
  }

  status(): RealStatus {
    const deals = this.db.deals(30).map(d => ({
      id: d.id,
      run_id: d.run_id,
      epic: d.epic,
      side: d.side,
      size: d.size,
      deal_id: d.deal_id,
      status: d.status,
      open_time: d.open_time,
      open_price: d.open_price,
      close_time: d.close_time,
      close_price: d.close_price,
      pnl: d.pnl,
      note: d.note,
    }));
    return {
      host: this.hostLabel,
      reachable: true,
      accountId: this.opts.accountId,
      accountName: this.accountName,
      currency: this.currency,
      balance: this.balance,
      available: this.available,
      equity: this.equity,
      leverage: this.leverage,
      leverageOk: this.leverageOk,
      assignment: this.db.getAssignment(),
      streamConnected: this.stream?.connected ?? false,
      ready: this.ready,
      openDeals: this.db.openDeals().length,
      deals,
      lastCycleAt: this.lastCycleAt,
      lastError: this.lastError,
    };
  }

  /**
   * Assign a single strategy run to control the locked Real USD account.
   * Rejects if another run currently controls the account.
   */
  async assign(req: AssignRequest, confirmed: boolean): Promise<RealStatus> {
    if (!confirmed) throw new Error('Confirmation required to assign a strategy to Real');
    const current = this.db.getAssignment();
    if (current && current.runId !== req.runId) {
      throw new Error(`Real ${this.expectedCurrency} account is already controlled by ${current.runId}; demote it from Real first`);
    }
    if (current && current.runId === req.runId) {
      if (!this.run) await this.activate(current);
      return this.status();
    }

    const { agents } = await loadAgents(this.opts.agentsDir);
    const agent = agents.find(a => a.id === req.agentId);
    if (!agent) throw new Error(`Agent ${req.agentId} not found on ${this.hostLabel}`);
    if (req.codeHash && agent.codeHash !== req.codeHash) {
      throw new Error(`Agent ${req.agentId} code hash mismatch on ${this.hostLabel} (expected ${req.codeHash}, deployed ${agent.codeHash})`);
    }
    if (agent.def.forecast) {
      throw new Error(`Agent ${req.agentId} requires the PC GPU forecaster and cannot run standalone on ${this.hostLabel}`);
    }
    if (!agent.def.instruments.includes(req.epic)) {
      throw new Error(`Agent ${req.agentId} does not trade ${req.epic}`);
    }

    const assignment: RealAssignment = {
      runId: req.runId,
      agentId: req.agentId,
      epic: req.epic,
      leverage: req.leverage,
      codeHash: agent.codeHash,
      assignedAt: Date.now(),
    };
    this.db.setAssignment(assignment);
    this.db.event('info', 'real', `assigned ${req.runId} (${req.epic} 1:${req.leverage}) to ${this.accountName ?? this.opts.accountId}`);
    try {
      await this.activate(assignment);
      await this.enqueue(() => this.refreshAccount());
      await this.enqueue(() => this.reconcile());
    } catch (err) {
      this.teardownRunner();
      this.db.setAssignment(null);
      throw err;
    }
    return this.status();
  }

  /**
   * Demote the current Real run: closes any open live deal it opened, stops the
   * runner on Hetzner, and frees the Real USD account for a future promotion.
   */
  async clear(runId: string | undefined, confirmed: boolean): Promise<RealStatus> {
    if (!confirmed) throw new Error('Confirmation required to demote from Real');
    const current = this.db.getAssignment();
    if (!current) return this.status();
    if (runId && current.runId !== runId) {
      throw new Error(`Real account is controlled by ${current.runId}, not ${runId}`);
    }
    this.teardownRunner();
    const open = this.db.openDeals().filter(d => d.run_id === current.runId);
    for (const deal of open) {
      await this.enqueue(() => this.closeDeal(deal, 'demoted from Real to Capital demo'));
    }
    this.db.setAssignment(null);
    this.db.setSnapshot(current.runId, null);
    this.leverage = null;
    this.leverageOk = null;
    this.db.event('info', 'real', `demoted ${current.runId} from Real USD account`);
    return this.status();
  }

  /** Exposed for tests and live order processing. */
  async handleRunEvent(e: RunEvent): Promise<void> {
    const assignment = this.db.getAssignment();
    if (!assignment || e.runId !== assignment.runId) return;
    if (e.type === 'order') {
      if (e.kind === 'close') {
        for (const d of this.db.openDeals().filter(x => x.run_id === assignment.runId)) {
          await this.enqueue(() => this.closeDeal(d, `strategy ${e.reason ?? 'exit'}`));
        }
        return;
      }
      if (e.size === undefined || e.price === undefined) return;
      for (const d of this.db.openDeals().filter(x => x.run_id === assignment.runId && x.side !== e.side)) {
        await this.enqueue(() => this.closeDeal(d, 'strategy reversal'));
      }
      await this.enqueue(() =>
        this.openDeal(assignment, {
          side: e.side,
          paperSize: e.size!,
          price: e.price!,
          stopLoss: e.stopLoss ?? null,
          takeProfit: e.takeProfit ?? null,
          trailingStop: e.trailingStop ?? null,
          validUntil: e.validUntil,
          closeAt: e.closeAt,
        }),
      );
      return;
    }
    if (e.type === 'close') {
      for (const d of this.db.openDeals().filter(x => x.run_id === assignment.runId && x.side === e.trade.side)) {
        await this.enqueue(() => this.closeDeal(d, `strategy ${e.trade.exitReason}`));
      }
      return;
    }
    if (e.type === 'stops') {
      const deal = this.db.openDeals().find(d => d.run_id === assignment.runId && d.deal_id);
      if (deal) {
        await this.enqueue(() => this.putStops(deal.deal_id!, e.stopLoss, e.takeProfit, e.trailingStop));
      }
    }
  }

  // ------------------------------------------------------------------ runner lifecycle

  private teardownRunner(): void {
    this.stream?.stop();
    this.stream = null;
    this.engine = null;
    this.venue = null;
    this.run = null;
    this.agent = null;
    this.lastCandle = 0;
  }

  private async activate(assignment: RealAssignment): Promise<void> {
    this.teardownRunner();
    const { agents } = await loadAgents(this.opts.agentsDir);
    const agent = agents.find(a => a.id === assignment.agentId);
    if (!agent) throw new Error(`Agent ${assignment.agentId} not found`);
    const inst = { ...getInstrument(assignment.epic) };
    const engine = new MarketEngine(inst);
    const venue = new VirtualVenue(inst);
    const run = engine.addRun({
      runId: assignment.runId,
      agent,
      leverage: assignment.leverage,
      capital: REFERENCE_CAPITAL,
      checkStopsOnCandles: false,
      execution: { venue, latencyMs: DEFAULT_EXECUTION_MS },
      onEvent: e => {
        void this.handleRunEvent(e);
      },
    });
    const savedSnap = this.db.getSnapshot(assignment.runId);
    if (savedSnap) run.restore(savedSnap, [], []);
    run.allowOrders = false;

    this.agent = agent;
    this.engine = engine;
    this.venue = venue;
    this.run = run;

    if (this.liveMode) {
      await this.warmUp(assignment, agent, engine, run);
      run.allowOrders = true;
      this.db.setSnapshot(assignment.runId, run.snapshot());
      this.stream = new QuoteStream(
        this.client,
        [assignment.epic],
        q => {
          if (!this.engine || !this.run) return;
          const closed = this.engine.stepTick(q);
          if (closed === null) return;
          this.dispatchClosed(closed);
          this.engine.dispatchTick(q);
        },
        (level, msg) => this.db.event(level, 'stream', msg),
      );
      this.stream.start();
    } else {
      run.allowOrders = true;
    }
  }

  private async warmUp(assignment: RealAssignment, agent: LoadedAgent, engine: MarketEngine, run: AgentRun): Promise<void> {
    const now = Date.now();
    const tfMinutes = agent.def.timeframe === '1m' ? 1 : agent.def.timeframe === '5m' ? 5 : agent.def.timeframe === '15m' ? 15 : agent.def.timeframe === '1h' ? 60 : agent.def.timeframe === '4h' ? 240 : 1440;
    const lookbackMs = Math.max(3 * DAY_MS, ((agent.def.warmup ?? 0) + 20) * tfMinutes * MINUTE_MS);
    const from = now - lookbackMs;
    const completedBefore = Math.floor(now / MINUTE_MS) * MINUTE_MS;
    let cursor = from;
    const bars: { time: number; open: number; high: number; low: number; close: number; spread: number; volume: number }[] = [];
    while (cursor < completedBefore) {
      const windowEnd = Math.min(cursor + (MAX_PRICE_WINDOW - 1) * MINUTE_MS, completedBefore - MINUTE_MS);
      const chunk = await this.client.prices(assignment.epic, RESOLUTION.MINUTE, cursor, windowEnd, MAX_PRICE_WINDOW);
      for (const b of chunk) {
        if (b.time >= cursor && b.time < completedBefore) bars.push(b);
      }
      cursor = windowEnd + MINUTE_MS;
    }
    bars.sort((a, b) => a.time - b.time);
    for (const c of bars) {
      for (const cb of engine.pushHistory(c)) {
        if (cb.series.timeframe === run.primary.timeframe) {
          run.forecast = null;
          run.onBar(cb.bar);
        }
      }
      this.lastCandle = c.time;
    }
    const last = bars.at(-1);
    if (last) run.primeQuote(last);
    run.markSynced((this.lastCandle || completedBefore - MINUTE_MS) + MINUTE_MS);
    this.db.event('info', 'real', `warmed ${assignment.runId} with ${bars.length} live 1m bars on ${assignment.epic}`);
  }

  private dispatchClosed(closed: ClosedBar[]): void {
    if (!this.run || !this.engine) return;
    for (const cb of closed) {
      if (cb.series.timeframe !== this.run.primary.timeframe) continue;
      this.run.adoptQuote(this.engine.lastAcceptedTick);
      this.run.forecast = null;
      this.run.onBar(cb.bar);
    }
    const assignment = this.db.getAssignment();
    if (assignment) this.db.setSnapshot(assignment.runId, this.run.snapshot());
  }

  private onClock(now: number): void {
    if (this.engine && this.run) {
      this.dispatchClosed(this.engine.stepClock(now));
    }
    // Enforce scheduled closeAt deadlines directly on open live deals even if the stream stalls.
    if (now - this.timedCloseAt >= 15_000) {
      for (const d of this.db.openDeals()) {
        if (d.close_at && now >= d.close_at) {
          this.timedCloseAt = now;
          void this.enqueue(() => this.closeDeal(d, SCHEDULED_EXIT_NOTE));
        }
      }
    }
  }

  // ------------------------------------------------------------------ broker account & orders

  private scheduleCycle(): void {
    this.cycleTimer = setTimeout(() => {
      void this.enqueue(async () => {
        await this.refreshAccount();
        await this.reconcile();
        this.lastCycleAt = Date.now();
      }).finally(() => this.scheduleCycle());
    }, CYCLE_MS);
  }

  private schedulePoll(): void {
    const now = Date.now();
    let next = Math.floor(now / MINUTE_MS) * MINUTE_MS + POLL_OFFSET_MS;
    if (next <= now) next += MINUTE_MS;
    this.pollTimer = setTimeout(() => {
      void this.pollCandle().finally(() => this.schedulePoll());
    }, next - now);
  }

  private async pollCandle(): Promise<void> {
    const assignment = this.db.getAssignment();
    if (!assignment || !this.engine || !this.run) return;
    const now = Date.now();
    const completedBefore = Math.floor(now / MINUTE_MS) * MINUTE_MS;
    const from = this.lastCandle ? this.lastCandle + MINUTE_MS : completedBefore - 5 * MINUTE_MS;
    if (from >= completedBefore) return;
    try {
      const bars = await this.client.prices(assignment.epic, RESOLUTION.MINUTE, from, completedBefore - MINUTE_MS, MAX_PRICE_WINDOW);
      for (const c of bars.filter(b => b.time >= from && b.time < completedBefore)) {
        this.lastCandle = Math.max(this.lastCandle, c.time);
        // Feed missed candles only if the stream did not already emit them.
        if (this.engine.lastAcceptedTick === null) {
          this.dispatchClosed(this.engine.pushHistory(c));
        }
      }
    } catch (err) {
      this.fail('poll candle', err);
    }
  }

  private async ensureLockedAccount(): Promise<void> {
    if (this.verifiedLogins === this.client.logins && this.currency === this.expectedCurrency) return;
    await this.client.selectAccount(this.opts.accountId);
    const { accounts } = await this.client.get<{ accounts: ApiAccount[] }>('/api/v1/accounts');
    const mine = accounts.find(a => a.accountId === this.opts.accountId);
    if (!mine) throw new Error(`Locked real account ${this.opts.accountId} not found on Capital.com live API`);
    const cur = (mine.currency ?? '').toUpperCase();
    if (cur !== this.expectedCurrency) {
      throw new Error(`Refusing to use account ${mine.accountName} (${cur}): expected ${this.expectedCurrency}`);
    }
    if (mine.status && mine.status !== 'ENABLED') {
      throw new Error(`Locked real account ${mine.accountName} is ${mine.status}`);
    }
    this.accountName = mine.accountName;
    this.currency = cur;
    this.balance = mine.balance.balance;
    this.available = mine.balance.available ?? mine.balance.balance;
    this.equity = mine.balance.balance + mine.balance.profitLoss;
    this.verifiedLogins = this.client.logins;
  }

  async refreshAccount(): Promise<void> {
    try {
      await this.ensureLockedAccount();
      const { accounts } = await this.client.get<{ accounts: ApiAccount[] }>('/api/v1/accounts');
      const mine = accounts.find(a => a.accountId === this.opts.accountId);
      if (!mine) throw new Error(`Locked real account ${this.opts.accountId} disappeared`);
      const cur = (mine.currency ?? '').toUpperCase();
      if (cur !== this.expectedCurrency) {
        throw new Error(`Locked real account currency changed to ${cur}; expected ${this.expectedCurrency}`);
      }
      this.accountName = mine.accountName;
      this.currency = cur;
      this.balance = mine.balance.balance;
      this.available = mine.balance.available ?? mine.balance.balance;
      this.equity = mine.balance.balance + mine.balance.profitLoss;
      this.lastError = null;
    } catch (err) {
      this.fail('refreshAccount', err);
      throw err;
    }
  }

  private async ensureLeverage(assignment: RealAssignment): Promise<boolean> {
    const inst = getInstrument(assignment.epic);
    const capClass = CAPITAL_LEVERAGE_CLASS[inst.assetClass];
    const want = effectiveLeverage(inst, assignment.leverage);
    const prefs = await this.client.get<Preferences>('/api/v1/accounts/preferences');
    const current = prefs.leverages?.[capClass]?.current ?? null;
    this.leverage = current;
    if (current === want) {
      this.leverageOk = true;
      return true;
    }
    const available = prefs.leverages?.[capClass]?.available ?? [];
    if (!available.includes(want)) {
      this.leverageOk = false;
      this.db.event('error', 'real', `${this.accountName} does not offer 1:${want} for ${capClass} (available: ${available.join(', ')})`);
      return false;
    }
    await this.client.put('/api/v1/accounts/preferences', { leverages: { [capClass]: want } });
    const after = await this.client.get<Preferences>('/api/v1/accounts/preferences');
    this.leverage = after.leverages?.[capClass]?.current ?? null;
    this.leverageOk = this.leverage === want;
    this.db.event(this.leverageOk ? 'info' : 'error', 'real', `${this.accountName} ${capClass} leverage ${this.leverageOk ? `confirmed 1:${want}` : `failed to set 1:${want}`}`);
    return this.leverageOk;
  }

  async reconcile(): Promise<void> {
    try {
      await this.ensureLockedAccount();
      const assignment = this.db.getAssignment();
      if (assignment) await this.ensureLeverage(assignment);
      const { positions } = await this.client.get<{ positions: BrokerPosition[] }>('/api/v1/positions');
      const openById = new Map(positions.map(p => [p.position.dealId, p]));
      const tracked = this.db.openDeals();
      const trackedIds = new Set(tracked.map(d => d.deal_id).filter(Boolean));

      for (const d of tracked.filter(x => !x.deal_id)) {
        const direction = d.side === 'long' ? DIRECTION_BUY : DIRECTION_SELL;
        const matches = positions.filter(
          p =>
            !trackedIds.has(p.position.dealId) &&
            p.market.epic === d.epic &&
            p.position.direction === direction &&
            Math.abs(p.position.size - d.size) < 1e-9,
        );
        if (matches.length === 1) {
          const m = matches[0]!;
          this.db.updateDeal(d.id, { deal_id: m.position.dealId, open_price: m.position.level });
          trackedIds.add(m.position.dealId);
          this.db.event('warn', 'real', `adopted unconfirmed live deal ${m.position.dealId} for ${d.run_id}`);
        } else if (Date.now() - d.open_time > ADOPT_WINDOW_MS) {
          this.db.updateDeal(d.id, { status: 'failed', note: `${d.note ?? ''}; no matching live position` });
        }
      }

      for (const d of tracked) {
        if (d.deal_id && !openById.has(d.deal_id) && Date.now() - d.open_time > 30_000) {
          this.db.updateDeal(d.id, { status: 'closed', close_time: Date.now(), note: 'closed at broker (stop/TP or manual)' });
          this.db.event('info', 'real', `live deal ${d.deal_id} (${d.epic}) closed at broker`);
        }
      }
    } catch (err) {
      this.fail('reconcile', err);
    }
  }

  private async openDeal(
    assignment: RealAssignment,
    req: {
      side: Side;
      paperSize: number;
      price: number;
      stopLoss: number | null;
      takeProfit: number | null;
      trailingStop: number | null;
      validUntil?: number;
      closeAt?: number;
    },
  ): Promise<void> {
    if (req.validUntil !== undefined && Date.now() >= req.validUntil) return;
    if (req.closeAt !== undefined && Date.now() >= req.closeAt) return;
    await this.refreshAccount();
    if (!(await this.ensureLeverage(assignment))) {
      this.db.event('error', 'real', `skip open ${assignment.runId}: leverage not confirmed at 1:${assignment.leverage}`);
      return;
    }
    const existingOpen = this.db.openDeals();
    if (existingOpen.length > 0) {
      this.db.event('warn', 'real', `skip open ${assignment.runId}: real account already has an open managed deal`);
      return;
    }
    const now = Date.now();
    while (this.opens.length > 0 && now - this.opens[0]! > HOUR_MS) this.opens.shift();
    if (this.opens.length >= MAX_OPENS_PER_HOUR) {
      this.db.event('error', 'real', `hourly real open cap (${MAX_OPENS_PER_HOUR}/hr) reached; skipping ${assignment.runId}`);
      return;
    }

    const inst = getInstrument(assignment.epic);
    const effLev = effectiveLeverage(inst, assignment.leverage);
    const paperEquity = this.run?.snapshot().balance ?? REFERENCE_CAPITAL;
    const sized = realOrderSize(
      inst,
      req.paperSize,
      paperEquity,
      this.equity ?? 0,
      this.available ?? 0,
      req.price,
      effLev,
    );
    if (sized.size === null) {
      this.db.event('warn', 'real', `skip open ${assignment.runId}: ${sized.reason}`);
      this.db.insertDeal({
        account_id: this.opts.accountId,
        account_name: this.accountName ?? 'Real USD',
        run_id: assignment.runId,
        epic: inst.epic,
        side: req.side,
        size: 0,
        paper_size: req.paperSize,
        deal_id: null,
        status: 'failed',
        open_time: now,
        open_price: null,
        paper_open_price: req.price,
        close_time: now,
        close_price: null,
        pnl: null,
        note: sized.reason ?? 'below minimum size',
        stop_loss: req.stopLoss,
        take_profit: req.takeProfit,
        close_at: req.closeAt ?? null,
      });
      return;
    }

    this.opens.push(now);
    const rowId = this.db.insertDeal({
      account_id: this.opts.accountId,
      account_name: this.accountName ?? 'Real USD',
      run_id: assignment.runId,
      epic: inst.epic,
      side: req.side,
      size: sized.size,
      paper_size: req.paperSize,
      deal_id: null,
      status: 'open',
      open_time: now,
      open_price: null,
      paper_open_price: req.price,
      close_time: null,
      close_price: null,
      pnl: null,
      note: null,
      stop_loss: req.stopLoss,
      take_profit: req.takeProfit,
      close_at: req.closeAt ?? null,
    });

    try {
      const ref = await this.client.post<{ dealReference: string }>('/api/v1/positions', {
        epic: inst.epic,
        direction: req.side === 'long' ? DIRECTION_BUY : DIRECTION_SELL,
        size: sized.size,
        ...(req.trailingStop ? { trailingStop: true, stopDistance: req.trailingStop } : req.stopLoss === null ? {} : { stopLevel: req.stopLoss }),
        ...(req.takeProfit === null ? {} : { profitLevel: req.takeProfit }),
      });
      const conf = await this.confirm(ref.dealReference);
      const expected = { epic: inst.epic, direction: req.side === 'long' ? DIRECTION_BUY : DIRECTION_SELL, size: sized.size };
      if (!confirmsDeal(conf, expected)) {
        this.db.updateDeal(rowId, { note: 'unconfirmed: unrelated confirmation' });
        return;
      }
      if (conf.dealStatus !== 'ACCEPTED') {
        this.db.updateDeal(rowId, { status: 'failed', close_time: Date.now(), note: `rejected: ${conf.reason ?? 'unknown'}` });
        this.db.event('warn', 'real', `live open rejected on ${this.accountName}: ${conf.reason ?? 'unknown'}`);
        return;
      }
      const dealId = conf.affectedDeals?.[0]?.dealId ?? conf.dealId ?? null;
      this.db.updateDeal(rowId, { deal_id: dealId, open_price: conf.level ?? null });
      this.db.event('info', 'real', `LIVE OPEN ${req.side} ${sized.size} ${inst.epic} @ ${conf.level} on ${this.accountName} (${dealId})`);
    } catch (err) {
      if (err instanceof CapitalApiError && err.status >= 400 && err.status < 500 && err.status !== 408) {
        this.db.updateDeal(rowId, { status: 'failed', close_time: Date.now(), note: `rejected: ${errorText(err)}` });
        this.db.event('warn', 'real', `live open refused on ${this.accountName}: ${errorText(err)}`);
        return;
      }
      this.db.updateDeal(rowId, { note: `unconfirmed: ${errorText(err)}` });
      this.fail(`open ${assignment.runId}`, err);
    }
  }

  private async closeDeal(d: RealDealRow, note: string): Promise<void> {
    const current = this.db.openDeals().find(x => x.id === d.id);
    if (!current) return;
    await this.ensureLockedAccount();
    if (!current.deal_id) {
      this.db.updateDeal(d.id, { status: 'failed', close_time: Date.now(), note: `${note}; never confirmed` });
      return;
    }
    try {
      const ref = await this.client.delete<{ dealReference: string }>(`/api/v1/positions/${current.deal_id}`);
      const conf = await this.confirm(ref.dealReference);
      if (conf.dealStatus !== 'ACCEPTED') {
        this.db.event('warn', 'real', `live close rejected for ${current.deal_id}: ${conf.reason ?? 'unknown'}`);
        return;
      }
      const direction = closingDirection(current.side);
      if (!confirmsDeal(conf, { epic: current.epic, direction, size: current.size, dealId: current.deal_id })) {
        this.db.updateDeal(d.id, { note: 'close unconfirmed' });
        return;
      }
      const closePrice = conf.level ?? null;
      const pnl =
        conf.profit ??
        (closePrice !== null && current.open_price !== null
          ? current.side === 'long'
            ? (closePrice - current.open_price) * current.size
            : (current.open_price - closePrice) * current.size
          : null);
      this.db.updateDeal(d.id, { status: 'closed', close_time: Date.now(), close_price: closePrice, pnl, note });
      this.db.event('info', 'real', `LIVE CLOSE ${current.epic} (${current.deal_id}) @ ${closePrice} pnl=${pnl} (${note})`);
    } catch (err) {
      if (err instanceof CapitalApiError && err.status === 404) {
        this.db.updateDeal(d.id, { status: 'closed', close_time: Date.now(), note: `${note}; already closed at broker` });
        return;
      }
      this.fail(`close ${current.deal_id}`, err);
    }
  }

  private async putStops(dealId: string, stopLoss: number | null, takeProfit: number | null, trailingStop?: number | null): Promise<void> {
    await this.ensureLockedAccount();
    const body = trailingStop
      ? { trailingStop: true, stopDistance: trailingStop, profitLevel: takeProfit }
      : { trailingStop: false, stopLevel: stopLoss, profitLevel: takeProfit };
    try {
      await this.client.put(`/api/v1/positions/${dealId}`, body);
    } catch (err) {
      this.db.event('warn', 'real', `could not update live stops on ${dealId}: ${errorText(err)}`);
    }
  }

  private async confirm(dealReference: string): Promise<Confirmation> {
    for (let i = 0; i < CONFIRM_ATTEMPTS; i++) {
      if (i > 0) await Bun.sleep(CONFIRM_DELAY_MS);
      try {
        const c = await this.client.get<Confirmation>(`/api/v1/confirms/${dealReference}`);
        if (c.dealStatus !== 'UNKNOWN') return c;
      } catch {
        // retry
      }
    }
    throw new Error(`no confirmation for ${dealReference}`);
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.serial.then(fn, fn);
    this.serial = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private fail(what: string, err: unknown): void {
    this.lastError = `${what}: ${errorText(err)}`;
    this.db.event('error', 'real', this.lastError);
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
