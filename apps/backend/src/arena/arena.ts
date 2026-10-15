import { CONTROL_SLUGS, LIFECYCLE } from '../engine/policy.ts';
import { VirtualVenue, VirtualGateway, DEFAULT_EXECUTION_MS, VIRTUAL_MODEL, type CapitalMarket } from '../engine/venue.ts';
import {
  backtestGate,
  EXECUTION_SCENARIOS,
  VIRTUAL_COMPARISON_TARGET,
  VIRTUAL_RUN_CAP,
  SHADOW_MARKER,
  isShadow,
  virtualEligible,
  tradeT,
} from './pipeline.ts';
import { runKey } from '../engine/run-id.ts';
import { monitorEventLoopDelay } from 'node:perf_hooks';
/**
 * The Arena — runs every agent forward on live Capital.com demo prices.
 *
 * - 1-minute candles: polled from the REST API every minute (same source as
 *   the backtest history; gaps heal on the next poll).
 * - Quotes: streamed over WebSocket for tick-precision stops and fill prices.
 * - Each agent × instrument × account leverage is a demo run with $10,000 of
 *   virtual capital, persisted after every minute so restarts resume where
 *   they left off.
 * - A changed agent file (new code hash) retires the old demo run and starts a
 *   fresh one: a track record always belongs to one exact version of the code.
 * - agents/roster.json sets each agent's leverage tiers and retires single runs
 *   without touching agent code (see src/engine/roster.ts).
 */
import type { CapitalClient } from '../capital/client.ts';
import { RESOLUTION } from '../capital/client.ts';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../engine/clock.ts';
import { getInstrument } from '../engine/instruments.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import { loadAgents } from '../engine/loader.ts';
import type { Roster } from '../engine/roster.ts';
import { loadRoster, planRuns } from '../engine/roster.ts';
import { demoRunId } from '../engine/run-id.ts';
import type { ClosedBar } from '../engine/market.ts';
import { MarketEngine } from '../engine/market.ts';
import type { AgentRun, RunEvent, RunSnapshot } from '../engine/run.ts';
import { RUN_STATUS } from '../engine/run.ts';
import type { Candle } from '../engine/series.ts';
import type { BrokerMirror, MirrorCandidate } from './broker.ts';
import type { ArenaDB } from './db.ts';
import { RUN_KIND } from './db.ts';
import { LiveForecastProvider } from './forecast-client.ts';
import { QuoteStream } from './stream.ts';

export const DEMO_CAPITAL = 10_000;
/** 1-minute history kept for warming agents up (4h agents need ~35 days for 200 bars). */
export const HISTORY_DAYS = Number(process.env.ARENA_HISTORY_DAYS ?? 120);
// Capital.com still revises a minute candle a few seconds after it closes; wait for that.
const POLL_OFFSET_MS = 10_000;
const METRICS_EVERY_MS = 10 * MINUTE_MS;
const MAX_PRICE_WINDOW = 1000;
/** Quotes older than this are not used for fills. */
const QUOTE_FRESH_MS = 30_000;
const FORECASTER_PROBE_MS = 5 * MINUTE_MS;

export interface ArenaOptions {
  db: ArenaDB;
  dataClient: CapitalClient;
  forecasterUrl: string;
  broker: BrokerMirror | null;
  agentsDir?: string;
  /** Offline replay and capacity verification: never starts sockets, timers or forecast calls. */
  live?: boolean;
}

interface Tracked {
  startedAt: number;
  run: AgentRun;
  agent: LoadedAgent;
  epic: string;
  leverage: number;
  persistedTrades: number;
  dirty: boolean;
}

export class Arena {
  readonly db: ArenaDB;
  private readonly client: CapitalClient;
  readonly forecasts: LiveForecastProvider;
  readonly broker: BrokerMirror | null;
  private readonly agentsDir?: string;
  private readonly liveMode: boolean;
  readonly engines = new Map<string, MarketEngine>();
  readonly tracked = new Map<string, Tracked>();
  readonly lastCandle = new Map<string, number>();
  agents: LoadedAgent[] = [];
  roster: Roster | null = null;
  loadErrors: { file: string; error: string }[] = [];
  stream: QuoteStream | null = null;
  startedAt = Date.now();
  private admissionTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private readonly gateways = new Map<string, VirtualGateway>();
  readonly venues = new Map<string, VirtualVenue>();
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });
  private readonly cpuStarted = process.cpuUsage();
  private lastPollMs = 0;
  private maxPollMs = 0;
  ready = false;
  private lastMetricsAt = 0;
  private lastHourWritten = 0;

  constructor(opts: ArenaOptions) {
    this.loopDelay.enable();
    this.db = opts.db;
    this.client = opts.dataClient;
    this.forecasts = new LiveForecastProvider(opts.forecasterUrl);
    this.broker = opts.broker;
    this.agentsDir = opts.agentsDir;
    this.liveMode = opts.live !== false;
  }

  async start(): Promise<void> {
    const now = Date.now();
    const { agents, errors } = await loadAgents(this.agentsDir);
    this.agents = agents;
    this.loadErrors = errors;
    for (const e of errors) this.db.event('error', 'loader', `${e.file}: ${e.error}`);
    for (const a of agents) this.db.upsertAgent(a, now);
    this.db.deactivateMissingAgents(agents.map(a => a.id));
    this.roster = loadRoster(this.agentsDir);

    const epics = [...new Set(agents.flatMap(a => a.def.instruments))];
    for (const epic of epics) {
      const instrument = { ...getInstrument(epic) };
      this.engines.set(epic, new MarketEngine(instrument, this.forecasts));
      this.venues.set(epic, new VirtualVenue(instrument));
    }
    await this.refreshMarkets();

    const fresh = this.createRuns(now);
    await this.backfill(epics);
    const since = Date.now() - HISTORY_DAYS * DAY_MS;
    this.seedDaily(epics, since);
    this.warmUp(epics, fresh, since);
    this.db.event(
      'info',
      'arena',
      `arena started: ${agents.length} agents, ${this.tracked.size} demo runs on ${epics.length} instruments (${fresh.size} new)`,
    );

    this.ready = true;
    if (!this.liveMode) return;
    this.stream = new QuoteStream(
      this.client,
      epics,
      q => this.onQuote(q.epic, q.bid, q.ask, q.time),
      (level, msg) => this.db.event(level, 'stream', msg),
    );
    this.stream.start();
    this.schedulePoll();
    this.clockTimer = setInterval(() => {
      for (const t of this.tracked.values())
        if (t.run.position) {
          t.run.onClock(Date.now());
          t.dirty = true;
        }
    }, 1000);
    void this.forecasts.probe();
    this.probeTimer = setInterval(() => void this.forecasts.probe(), FORECASTER_PROBE_MS);
  }

  stop(): void {
    if (this.admissionTimer) clearTimeout(this.admissionTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.stream?.stop();
    this.loopDelay.disable();
    this.persistAll(true);
  }

  // ------------------------------------------------------------------ runs

  /** Create or restore one demo run per agent × instrument × leverage tier. Returns ids of brand-new runs. */
  /** Backtest pushes can satisfy a previously missing gate. Debounce a service reload until the batch is quiet. */
  scheduleAdmissions(): void {
    if (!this.liveMode || !this.ready || !this.roster) return;
    const backtests = new Map(this.db.runs(RUN_KIND.BACKTEST).map(r => [runKey(r.agent_id, r.epic, r.leverage ?? 0), r]));
    const waiting = planRuns(this.agents, this.roster).runs.filter(
      ({ agent, epic, leverage }) =>
        !this.db.run(demoRunId(agent.id, epic, leverage, agent.codeHash)) &&
        backtestGate(backtests.get(runKey(agent.id, epic, leverage)), agent.codeHash, agent.slug).passed,
    );
    if (!waiting.length) return;
    if (this.admissionTimer) clearTimeout(this.admissionTimer);
    this.admissionTimer = setTimeout(() => {
      this.db.event('info', 'pipeline', `reloading after backtest gate passed: ${waiting.length} new standard runs`);
      process.kill(process.pid, 'SIGTERM'); // systemd resumes existing records and admits the new code after warm-up
    }, 120_000);
  }

  private gateway(delay: string): VirtualGateway {
    let gateway = this.gateways.get(delay);
    if (!gateway) {
      gateway = new VirtualGateway();
      this.gateways.set(delay, gateway);
    }
    return gateway;
  }

  private createRuns(now: number): Set<string> {
    const fresh = new Set<string>();
    const active = this.db.runs(RUN_KIND.DEMO);
    const plan = planRuns(this.agents, this.roster!);
    const backtests = new Map(this.db.runs(RUN_KIND.BACKTEST).map(r => [runKey(r.agent_id, r.epic, r.leverage ?? 0), r]));
    const rosterRetired = new Set<string>();
    for (const { agent, epic, leverage, entry } of plan.retired) {
      for (const old of active.filter(r => r.agent_id === agent.id && r.epic === epic && r.leverage === leverage)) {
        rosterRetired.add(old.id);
        this.db.retireRun(old.id, now, RUN_STATUS.STOPPED);
        this.db.appendLog(old.id, {
          time: now,
          message: `retired ${entry.date}: ${entry.reason}`,
        });
        this.db.event('info', 'arena', `retired ${old.id} (roster): ${entry.reason}`);
      }
    }
    for (const { agent, epic, leverage } of plan.runs) {
      if (this.tracked.size >= VIRTUAL_RUN_CAP) break;
      const id = demoRunId(agent.id, epic, leverage, agent.codeHash);
      const existing = this.db.run(id);
      const gate = backtestGate(backtests.get(runKey(agent.id, epic, leverage)), agent.codeHash, agent.slug);
      if (existing?.retired || (!existing && !gate.passed)) continue;
      const engine = this.engines.get(epic)!;
      const run = engine.addRun({
        runId: id,
        agent,
        leverage,
        capital: DEMO_CAPITAL,
        checkStopsOnCandles: false,
        execution: {
          venue: this.venues.get(epic)!,
          latencyMs: DEFAULT_EXECUTION_MS,
          gateway: this.gateway('standard'),
        },
        onEvent: e => this.onRunEvent(e),
      });
      const row = this.db.run(id);
      if (row && !row.retired && row.snapshot) {
        run.restore(JSON.parse(row.snapshot) as RunSnapshot, this.db.trades(id, 100_000), this.dailyEquity(id));
      } else {
        if (!row)
          this.db.createDemoRun({
            id,
            agentId: agent.id,
            codeHash: agent.codeHash,
            epic,
            leverage,
            capital: DEMO_CAPITAL,
            params: agent.params,
            now,
          });
        run.allowOrders = false;
        fresh.add(id);
      }
      this.db.setRunExtra(id, {
        ...(existing?.extra ? JSON.parse(existing.extra) : {}),
        executionModel: VIRTUAL_MODEL,
        modelChangedAt: existing?.extra ? (JSON.parse(existing.extra).modelChangedAt ?? now) : now,
        latencyMs: DEFAULT_EXECUTION_MS,
        scenario: 'standard',
        gate: gate.reason,
        grandfathered: !gate.passed,
      });
      this.tracked.set(id, {
        startedAt: this.db.run(id)?.started_at ?? now,
        run,
        agent,
        epic,
        leverage,
        persistedTrades: run.trades.length,
        dirty: true,
      });
    }
    // Each scenario changes order-to-fill delay, keeping strategy parameters and random stream fixed.
    // A current-code backtest is required; shadows never take scarce Capital slots.
    const qualified = plan.runs.filter(
      ({ agent, epic, leverage }) =>
        this.tracked.has(demoRunId(agent.id, epic, leverage, agent.codeHash)) &&
        backtestGate(backtests.get(runKey(agent.id, epic, leverage)), agent.codeHash, agent.slug).passed,
    );
    const comparisonScenarios = EXECUTION_SCENARIOS.slice(
      0,
      Math.floor((VIRTUAL_COMPARISON_TARGET - this.tracked.size) / Math.max(1, qualified.length)),
    );
    for (const latencyMs of comparisonScenarios) {
      for (const { agent, epic, leverage } of qualified) {
        if (this.tracked.size >= VIRTUAL_RUN_CAP) break;
        const baseId = demoRunId(agent.id, epic, leverage, agent.codeHash);
        if (!this.tracked.has(baseId) || !backtestGate(backtests.get(runKey(agent.id, epic, leverage)), agent.codeHash, agent.slug).passed)
          continue;
        const id = `${baseId}${SHADOW_MARKER}${latencyMs}`;
        const row = this.db.run(id);
        if (row?.retired) continue;
        const run = this.engines.get(epic)!.addRun({
          runId: id,
          agent,
          leverage,
          capital: DEMO_CAPITAL,
          checkStopsOnCandles: false,
          execution: {
            venue: this.venues.get(epic)!,
            latencyMs,
            gateway: this.gateway(String(latencyMs)),
          },
          onEvent: e => this.onRunEvent(e),
        });
        if (row?.snapshot) run.restore(JSON.parse(row.snapshot), this.db.trades(id, 100_000), this.dailyEquity(id));
        else {
          if (!row)
            this.db.createDemoRun({
              id,
              agentId: agent.id,
              codeHash: agent.codeHash,
              epic,
              leverage,
              capital: DEMO_CAPITAL,
              params: agent.params,
              now,
            });
          run.allowOrders = false;
          fresh.add(id);
        }
        this.db.setRunExtra(id, {
          executionModel: VIRTUAL_MODEL,
          latencyMs,
          scenario: `delay ${latencyMs} ms`,
          baseRunId: baseId,
          comparisonOnly: true,
        });
        this.tracked.set(id, {
          startedAt: this.db.run(id)?.started_at ?? now,
          run,
          agent,
          epic,
          leverage,
          persistedTrades: run.trades.length,
          dirty: true,
        });
      }
    }
    // Runs no longer planned: their agent changed or disappeared, or their leverage tier moved.
    const agentHash = new Map(this.agents.map(a => [a.id, a.codeHash]));
    for (const old of active) {
      if (this.tracked.has(old.id) || rosterRetired.has(old.id)) continue;
      const hash = agentHash.get(old.agent_id);
      const why =
        hash === undefined
          ? 'agent no longer exists'
          : hash !== old.code_hash
            ? 'agent code changed'
            : old.leverage === null
              ? 'runs now trade at an account leverage; restarted per tier'
              : 'its leverage tier is no longer planned (agents/roster.json)';
      this.db.retireRun(old.id, now, RUN_STATUS.STOPPED);
      this.db.event('info', 'arena', `retired ${old.id}: ${why}`);
    }
    return fresh;
  }

  private dailyEquity(runId: string): { t: number; equity: number }[] {
    const byDay = new Map<number, number>();
    for (const p of this.db.equity(runId)) byDay.set(Math.floor(p.t / DAY_MS) * DAY_MS, p.equity);
    return [...byDay.entries()].map(([t, equity]) => ({ t, equity }));
  }

  // ------------------------------------------------------------------ history

  /** Fetch missing 1-minute candles from REST into the local store. */
  private async backfill(epics: string[]): Promise<void> {
    const now = Date.now();
    const horizon = now - HISTORY_DAYS * DAY_MS;
    await Promise.all(
      epics.map(async epic => {
        const last = this.db.lastCandleTime(epic);
        const from = Math.max(horizon, last === null ? horizon : last + MINUTE_MS);
        const n = await this.fetchCandles(epic, from, now, false);
        if (n > 0) this.db.event('info', 'arena', `backfilled ${n} candles for ${epic}`);
      }),
    );
  }

  /** Fetch completed candles in [from, to) and store them. Returns how many were new. */
  private async fetchCandles(epic: string, from: number, to: number, process: boolean): Promise<number> {
    const completedBefore = Math.floor(to / MINUTE_MS) * MINUTE_MS;
    let cursor = from;
    let stored = 0;
    while (cursor < completedBefore) {
      const windowEnd = Math.min(cursor + (MAX_PRICE_WINDOW - 1) * MINUTE_MS, completedBefore - MINUTE_MS);
      const bars = await this.client.prices(epic, RESOLUTION.MINUTE, cursor, windowEnd, MAX_PRICE_WINDOW);
      const fresh = bars.filter(b => b.time >= cursor && b.time < completedBefore);
      if (fresh.length > 0) {
        this.db.insertCandles(epic, fresh);
        stored += fresh.length;
        if (process) for (const c of fresh) await this.processLiveCandle(epic, c);
      }
      cursor = windowEnd + MINUTE_MS;
    }
    return stored;
  }

  /**
   * Daily series start with the lab's daily bars from before the 1-minute
   * history (pushed nightly, see src/lab/push-history.ts), so agents with
   * 200-day lookbacks trade from day one instead of after months of warm-up.
   * The day the 1-minute replay starts in is built from candles as usual.
   */
  private seedDaily(epics: string[], since: number): void {
    const before = Math.floor(since / DAY_MS) * DAY_MS;
    let seeded = 0;
    for (const epic of epics) {
      const series = this.engines.get(epic)!.series.get('1d');
      if (!series) continue;
      const bars = this.db.dailyBarsBefore(epic, before);
      series.seed(bars);
      seeded += bars.length;
    }
    if (seeded > 0) this.db.event('info', 'arena', `seeded ${seeded} daily bars from the lab's history`);
  }

  /**
   * Replay stored history into every series. Brand-new runs see it through
   * onBar with orders disabled (to warm their state); restored runs catch up on
   * candles they missed while the arena was down, with orders enabled.
   */
  private warmUp(epics: string[], fresh: Set<string>, since: number): void {
    for (const epic of epics) {
      const engine = this.engines.get(epic)!;
      const candles = this.db.candlesSince(epic, since);
      const runs = engine.runs;
      const representative = new Map<string, AgentRun>();
      const cloneOf = new Map<string, AgentRun>();
      for (const r of runs) {
        if (!fresh.has(r.runId)) continue;
        const key = `${r.agentId}:${r.leverage}`;
        const source = representative.get(key);
        if (source) cloneOf.set(r.runId, source);
        else representative.set(key, r);
      }
      const resumeAt = new Map(runs.map(r => [r.runId, fresh.has(r.runId) ? Infinity : r.snapshot().lastTime]));
      // Most restored runs resume at the end of history. Do not scan thousands of dormant runs
      // against every historical candle; activate them only when their resume time is reached.
      const waiting = runs.filter(r => !fresh.has(r.runId)).sort((a, b) => resumeAt.get(a.runId)! - resumeAt.get(b.runId)!);
      let next = 0;
      const active: AgentRun[] = [];
      const barRuns = new Map<string, AgentRun[]>();
      const addBarRun = (r: AgentRun) => {
        const list = barRuns.get(r.primary.timeframe) ?? [];
        list.push(r);
        barRuns.set(r.primary.timeframe, list);
      };
      for (const r of runs) if (fresh.has(r.runId) && !cloneOf.has(r.runId)) addBarRun(r);
      for (const c of candles) {
        while (waiting[next] && resumeAt.get(waiting[next]!.runId)! <= c.time) {
          const r = waiting[next++]!;
          active.push(r);
          addBarRun(r);
        }
        for (const r of active) r.onCandle(c);
        for (const cb of engine.pushHistory(c)) {
          const closeTime = cb.bar.time + cb.series.tfMs;
          for (const r of barRuns.get(cb.series.timeframe) ?? []) {
            const resume = resumeAt.get(r.runId)!;
            if (resume === Infinity || closeTime > resume) {
              r.forecast = null;
              r.onBar(cb.bar);
            }
          }
        }
        this.lastCandle.set(epic, c.time);
      }
      const syncedTo = (this.lastCandle.get(epic) ?? 0) + MINUTE_MS;
      const lastCandle = candles.at(-1);
      for (const r of runs) {
        const source = cloneOf.get(r.runId);
        if (source) {
          const snapshot = r.snapshot();
          const warm = source.snapshot();
          snapshot.state = structuredClone(warm.state);
          snapshot.rngState = warm.rngState;
          r.restore(snapshot, [], []);
        }
        if (lastCandle) r.primeQuote(lastCandle);
        r.markSynced(syncedTo);
        r.allowOrders = true;
        const t = this.tracked.get(r.runId);
        if (t) t.dirty = true;
      }
    }
    this.persistAll(true);
  }

  // ------------------------------------------------------------------ live loop

  private schedulePoll(): void {
    const now = Date.now();
    const next = Math.floor(now / MINUTE_MS) * MINUTE_MS + MINUTE_MS + POLL_OFFSET_MS;
    this.pollTimer = setTimeout(() => void this.poll(), next - now);
  }

  private async poll(): Promise<void> {
    if (this.polling) return this.schedulePoll();
    this.polling = true;
    try {
      const started = performance.now();
      const now = Date.now();
      await this.refreshMarkets();
      for (const [epic] of this.engines) {
        const last = this.lastCandle.get(epic) ?? this.db.lastCandleTime(epic) ?? now - HOUR_MS;
        try {
          await this.fetchCandles(epic, last + MINUTE_MS, now, true);
        } catch (err) {
          this.db.event('warn', 'arena', `candle poll failed for ${epic}: ${err instanceof Error ? err.message : err}`);
        }
      }
      this.persistAll(false);
      this.housekeeping(now);
      this.lastPollMs = performance.now() - started;
      this.maxPollMs = Math.max(this.maxPollMs, this.lastPollMs);
    } catch (err) {
      this.db.event('error', 'arena', `poll failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.polling = false;
      this.schedulePoll();
    }
  }

  private async processLiveCandle(epic: string, c: Candle): Promise<void> {
    const last = this.lastCandle.get(epic);
    if (last !== undefined && c.time <= last) return;
    const engine = this.engines.get(epic)!;
    const closed = engine.stepCandle(c);
    this.lastCandle.set(epic, c.time);
    // Fill at the live quote when we have a fresh one.
    const q = this.stream?.lastQuote.get(epic);
    if (q && Date.now() - q.time < QUOTE_FRESH_MS) for (const r of engine.runs) r.onTick({ bid: q.bid, ask: q.ask, time: q.time });
    for (const cb of closed) {
      await this.prepareForecasts(engine, cb);
      // Forecast requests can take seconds: re-read the latest quote after they finish.
      const latest = this.stream?.lastQuote.get(epic);
      if (latest) for (const r of engine.runs) r.onTick(latest);
      engine.dispatchBar(cb);
    }
    for (const r of engine.runs) {
      const t = this.tracked.get(r.runId);
      if (t) t.dirty = true;
    }
  }

  private async prepareForecasts(engine: MarketEngine, cb: ClosedBar): Promise<void> {
    const items = engine
      .runsOn(cb.series.timeframe)
      .filter(r => r.agent.forecast && r.status === RUN_STATUS.RUNNING)
      .map(r => ({
        series: cb.series,
        spec: r.agent.forecast!,
        bar: cb.bar,
      }));
    if (items.length > 0) await this.forecasts.prepare(items);
  }

  private onQuote(epic: string, bid: number, ask: number, time: number): void {
    const engine = this.engines.get(epic);
    if (!engine) return;
    for (const r of engine.runs) {
      r.onTick({ bid, ask, time });
    }
  }

  private onRunEvent(e: RunEvent): void {
    const t = this.tracked.get(e.runId);
    if (t) t.dirty = true;
    if (e.type === 'log' || e.type === 'error')
      this.db.appendLog(e.runId, {
        time: e.time,
        message: e.type === 'error' ? `ERROR ${e.message}` : e.message,
      });
    if (!isShadow(e.runId)) this.broker?.onRunEvent(e);
  }

  // ------------------------------------------------------------------ persistence

  persistAll(force: boolean): void {
    const now = Date.now();
    const withMetrics = force || now - this.lastMetricsAt > METRICS_EVERY_MS;
    if (withMetrics) this.lastMetricsAt = now;
    const hour = Math.floor(now / HOUR_MS) * HOUR_MS;
    const writeHour = hour !== this.lastHourWritten;
    this.db.tx(() => {
      for (const t of this.tracked.values()) {
        if (!t.dirty && !withMetrics && !writeHour) continue;
        const { run } = t;
        for (let i = t.persistedTrades; i < run.trades.length; i++) this.db.appendTrade(run.runId, i, run.trades[i]!);
        t.persistedTrades = run.trades.length;
        const equity = run.markToMarket();
        this.db.saveRunState({
          id: run.runId,
          status: run.status,
          equity,
          snapshot: run.snapshot(),
          metrics: withMetrics ? run.metrics() : null,
          now,
        });
        if (writeHour || force) this.db.upsertEquity(run.runId, hour, Math.round(equity * 100) / 100);
        t.dirty = false;
      }
    });
    if (writeHour) this.lastHourWritten = hour;
    if (withMetrics && this.ready) this.demoteVirtual(now);
  }

  private demoteVirtual(now: number): void {
    for (const [id, t] of this.tracked) {
      const control = CONTROL_SLUGS.has(t.agent.slug);
      if (control) continue;
      const row = this.db.run(id)!;
      const demoted = this.db.getSetting<Record<string, { at: number }>>('broker.demotions', {})[id];
      const days = (now - (demoted?.at ?? row.started_at)) / DAY_MS;
      const trades = t.run.trades.filter(tr => tr.entryTime >= (demoted?.at ?? 0));
      const mature =
        (trades.length >= LIFECYCLE.MIN_TRADES && days >= LIFECYCLE.MIN_DAYS) ||
        (trades.length >= LIFECYCLE.SLOW_MIN_TRADES && days >= LIFECYCLE.SLOW_MIN_DAYS);
      const reason =
        t.run.status === RUN_STATUS.BUSTED
          ? 'virtual account busted'
          : t.run.status === RUN_STATUS.ERROR
            ? 'agent errors'
            : trades.length === 0 && days >= LIFECYCLE.SILENT_DAYS
              ? 'no trades in 60 days'
              : mature && tradeT(trades) <= LIFECYCLE.RETIRE_TSTAT
                ? 'losing virtual trade evidence'
                : null;
      if (!reason) continue;
      if (this.broker?.mirroredRuns.includes(id)) {
        this.broker.demoteToVirtual(id, reason);
        continue;
      }
      if (demoted && days < LIFECYCLE.MIN_DAYS) continue;
      t.run.stop();
      // Persist the close before archiving the run.
      for (let i = t.persistedTrades; i < t.run.trades.length; i++) this.db.appendTrade(id, i, t.run.trades[i]!);
      this.db.saveRunState({
        id,
        status: t.run.status,
        equity: t.run.markToMarket(),
        snapshot: t.run.snapshot(),
        metrics: t.run.metrics(),
        now,
      });
      this.db.setRunExtra(id, {
        ...(row.extra ? JSON.parse(row.extra) : {}),
        demotedTo: 'backtest',
        demotedAt: now,
        demotionReason: reason,
      });
      this.db.retireRun(id, now, RUN_STATUS.STOPPED);
      this.engines.get(t.epic)!.removeRun(t.run);
      this.tracked.delete(id);
      this.db.event('info', 'pipeline', `demoted ${id} from virtual to backtest: ${reason}`);
    }
  }

  private housekeeping(now: number): void {
    if (now % HOUR_MS < MINUTE_MS + POLL_OFFSET_MS * 2) {
      this.db.pruneCandles(now - (HISTORY_DAYS + 5) * DAY_MS);
      this.db.pruneLogs();
      this.db.thinEquity(now);
    }
  }

  /** Standard virtual runs for Capital slots; only mature evidence can earn a new assignment. */
  mirrorCandidates(): MirrorCandidate[] {
    const out: MirrorCandidate[] = [];
    const now = Date.now();
    const demotions = this.db.getSetting<Record<string, { at: number }>>('broker.demotions', {});
    const monkeys = new Map<string, number>();
    for (const t of this.tracked.values())
      if (!isShadow(t.run.runId) && t.agent.slug === 'random-baseline')
        monkeys.set(t.epic, Math.max(monkeys.get(t.epic) ?? -Infinity, tradeT(t.run.trades)));

    for (const t of this.tracked.values()) {
      if (t.run.status !== RUN_STATUS.RUNNING || isShadow(t.run.runId)) continue;
      const p = t.run.position;
      const eligible = virtualEligible(
        t.run.trades.filter(tr => tr.entryTime >= (demotions[t.run.runId]?.at ?? 0)),
        demotions[t.run.runId]?.at ?? t.startedAt,
        now,
        monkeys.get(t.epic) ?? 0,
      );
      out.push({
        runId: t.run.runId,
        epic: t.epic,
        tier: t.leverage,
        side: p?.side ?? null,
        entry: p
          ? {
              size: p.size,
              price: p.entryPrice,
              time: p.entryTime,
              stopLoss: p.stopLoss,
              takeProfit: p.takeProfit,
              trailingStop: p.trailingStop,
            }
          : null,
        score: eligible ? tradeT(t.run.trades) : -1_000_000,
        eligible,
      });
    }
    return out;
  }

  private async refreshMarkets(): Promise<void> {
    for (const [epic, venue] of this.venues) {
      try {
        venue.update(await this.client.get<CapitalMarket>(`/api/v1/markets/${epic}`), Date.now());
      } catch (err) {
        this.db.event('warn', 'virtual', `market rules refresh failed for ${epic}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  executionStatus() {
    const cpu = process.cpuUsage(this.cpuStarted);
    const elapsedMs = Date.now() - this.startedAt;
    const totals = {
      submitted: 0,
      filled: 0,
      rejected: 0,
      totalDelayMs: 0,
      maxDelayMs: 0,
      pending: 0,
    };
    for (const { run } of this.tracked.values()) {
      for (const key of ['submitted', 'filled', 'rejected', 'totalDelayMs'] as const) totals[key] += run.executionStats[key];
      totals.maxDelayMs = Math.max(totals.maxDelayMs, run.executionStats.maxDelayMs);
      totals.pending += run.pendingOrders;
    }
    return {
      ready: this.ready,
      model: VIRTUAL_MODEL,
      runCap: VIRTUAL_RUN_CAP,
      standardRuns: [...this.tracked.keys()].filter(id => !isShadow(id)).length,
      comparisonRuns: [...this.tracked.keys()].filter(isShadow).length,
      ...totals,
      meanDelayMs: totals.filled ? Math.round(totals.totalDelayMs / totals.filled) : null,
      cpuCorePercent: elapsedMs > 0 ? Math.round((cpu.user + cpu.system) / (elapsedMs * 10)) : 0,
      eventLoopP95Ms: Math.round(this.loopDelay.percentile(95) / 1e6),
      lastPollMs: Math.round(this.lastPollMs),
      maxPollMs: Math.round(this.maxPollMs),
      markets: [...this.venues].map(([epic, v]) => ({
        epic,
        updatedAt: v.updatedAt,
        marketStatus: v.market?.snapshot.marketStatus ?? 'UNKNOWN',
      })),
    };
  }

  runIdsForEpic(epic: string): string[] {
    return [...this.tracked.values()].filter(t => t.epic === epic).map(t => t.run.runId);
  }
}
