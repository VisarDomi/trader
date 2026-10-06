/**
 * The Arena — runs every agent forward on live Capital.com demo prices.
 *
 * - 1-minute candles: polled from the REST API every minute (same source as
 *   the backtest history; gaps heal on the next poll).
 * - Quotes: streamed over WebSocket for tick-precision stops and fill prices.
 * - Each agent × instrument is a demo run with $10,000 of virtual capital,
 *   persisted after every minute so restarts resume where they left off.
 * - A changed agent file (new code hash) retires the old demo run and starts a
 *   fresh one: a track record always belongs to one exact version of the code.
 */
import type { CapitalClient } from '../capital/client.ts';
import { RESOLUTION } from '../capital/client.ts';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../engine/clock.ts';
import { getInstrument } from '../engine/instruments.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import { loadAgents } from '../engine/loader.ts';
import type { ClosedBar } from '../engine/market.ts';
import { MarketEngine } from '../engine/market.ts';
import type { AgentRun, RunEvent, RunSnapshot } from '../engine/run.ts';
import { RUN_STATUS } from '../engine/run.ts';
import type { Candle } from '../engine/series.ts';
import type { BrokerMirror } from './broker.ts';
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
}

interface Tracked {
  run: AgentRun;
  agent: LoadedAgent;
  epic: string;
  persistedTrades: number;
  dirty: boolean;
}

export class Arena {
  readonly db: ArenaDB;
  private readonly client: CapitalClient;
  readonly forecasts: LiveForecastProvider;
  readonly broker: BrokerMirror | null;
  private readonly agentsDir?: string;
  readonly engines = new Map<string, MarketEngine>();
  readonly tracked = new Map<string, Tracked>();
  readonly lastCandle = new Map<string, number>();
  agents: LoadedAgent[] = [];
  loadErrors: { file: string; error: string }[] = [];
  stream: QuoteStream | null = null;
  startedAt = Date.now();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private lastMetricsAt = 0;
  private lastHourWritten = 0;

  constructor(opts: ArenaOptions) {
    this.db = opts.db;
    this.client = opts.dataClient;
    this.forecasts = new LiveForecastProvider(opts.forecasterUrl);
    this.broker = opts.broker;
    this.agentsDir = opts.agentsDir;
  }

  async start(): Promise<void> {
    const now = Date.now();
    const { agents, errors } = await loadAgents(this.agentsDir);
    this.agents = agents;
    this.loadErrors = errors;
    for (const e of errors) this.db.event('error', 'loader', `${e.file}: ${e.error}`);
    for (const a of agents) this.db.upsertAgent(a, now);
    this.db.deactivateMissingAgents(agents.map(a => a.id));

    const epics = [...new Set(agents.flatMap(a => a.def.instruments))];
    for (const epic of epics) this.engines.set(epic, new MarketEngine(getInstrument(epic), this.forecasts));

    const fresh = this.createRuns(now);
    await this.backfill(epics);
    this.warmUp(epics, fresh);
    this.db.event('info', 'arena', `arena started: ${agents.length} agents, ${this.tracked.size} demo runs on ${epics.length} instruments (${fresh.size} new)`);

    this.stream = new QuoteStream(this.client, epics, q => this.onQuote(q.epic, q.bid, q.ask, q.time), (level, msg) => this.db.event(level, 'stream', msg));
    this.stream.start();
    this.schedulePoll();
    void this.forecasts.probe();
    this.probeTimer = setInterval(() => void this.forecasts.probe(), FORECASTER_PROBE_MS);
  }

  stop(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.stream?.stop();
    this.persistAll(true);
  }

  // ------------------------------------------------------------------ runs

  /** Create or restore one demo run per agent × instrument. Returns ids of brand-new runs. */
  private createRuns(now: number): Set<string> {
    const fresh = new Set<string>();
    const active = this.db.runs(RUN_KIND.DEMO);
    for (const agent of this.agents) {
      for (const epic of agent.def.instruments) {
        const id = demoRunId(agent.id, epic, agent.codeHash);
        for (const old of active) {
          if (old.agent_id === agent.id && old.epic === epic && old.id !== id) {
            this.db.retireRun(old.id, now, RUN_STATUS.STOPPED);
            this.db.event('info', 'arena', `retired ${old.id}: agent code changed`);
          }
        }
        const engine = this.engines.get(epic)!;
        const run = engine.addRun({
          runId: id,
          agent,
          capital: DEMO_CAPITAL,
          checkStopsOnCandles: true,
          onEvent: e => this.onRunEvent(e),
        });
        const row = this.db.run(id);
        if (row && !row.retired && row.snapshot) {
          run.restore(JSON.parse(row.snapshot) as RunSnapshot, this.db.trades(id, 100_000), this.dailyEquity(id));
        } else {
          if (!row) this.db.createDemoRun({ id, agentId: agent.id, codeHash: agent.codeHash, epic, capital: DEMO_CAPITAL, params: agent.params, now });
          run.allowOrders = false;
          fresh.add(id);
        }
        this.tracked.set(id, { run, agent, epic, persistedTrades: run.trades.length, dirty: true });
      }
    }
    // Agents that disappeared from disk: retire their demo runs.
    const live = new Set(this.tracked.keys());
    for (const old of active) {
      if (!live.has(old.id)) {
        this.db.retireRun(old.id, now, RUN_STATUS.STOPPED);
        this.db.event('info', 'arena', `retired ${old.id}: agent no longer exists`);
      }
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
   * Replay stored history into every series. Brand-new runs see it through
   * onBar with orders disabled (to warm their state); restored runs catch up on
   * candles they missed while the arena was down, with orders enabled.
   */
  private warmUp(epics: string[], fresh: Set<string>): void {
    const since = Date.now() - HISTORY_DAYS * DAY_MS;
    for (const epic of epics) {
      const engine = this.engines.get(epic)!;
      const candles = this.db.candlesSince(epic, since);
      const runs = engine.runs;
      const resumeAt = new Map(runs.map(r => [r.runId, fresh.has(r.runId) ? Infinity : r.snapshot().lastTime]));
      for (const c of candles) {
        for (const r of runs) {
          // snapshot.lastTime is the end of the last candle the run processed.
          if (c.time >= resumeAt.get(r.runId)!) r.onCandle(c);
        }
        for (const cb of engine.pushHistory(c)) {
          const closeTime = cb.bar.time + cb.series.tfMs;
          for (const r of engine.runsOn(cb.series.timeframe)) {
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
      for (const r of runs) {
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
      const now = Date.now();
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
      .map(r => ({ series: cb.series, spec: r.agent.forecast!, bar: cb.bar }));
    if (items.length > 0) await this.forecasts.prepare(items);
  }

  private onQuote(epic: string, bid: number, ask: number, time: number): void {
    const engine = this.engines.get(epic);
    if (!engine) return;
    for (const r of engine.runs) {
      if (r.position) r.onTick({ bid, ask, time });
    }
  }

  private onRunEvent(e: RunEvent): void {
    const t = this.tracked.get(e.runId);
    if (t) t.dirty = true;
    if (e.type === 'log' || e.type === 'error') this.db.appendLog(e.runId, { time: e.time, message: e.type === 'error' ? `ERROR ${e.message}` : e.message });
    this.broker?.onRunEvent(e);
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
  }

  private housekeeping(now: number): void {
    if (now % HOUR_MS < MINUTE_MS + POLL_OFFSET_MS * 2) {
      this.db.pruneCandles(now - (HISTORY_DAYS + 5) * DAY_MS);
      this.db.pruneLogs();
      this.db.thinEquity(now);
    }
  }

  runIdsForEpic(epic: string): string[] {
    return [...this.tracked.values()].filter(t => t.epic === epic).map(t => t.run.runId);
  }
}

export function demoRunId(agentId: string, epic: string, codeHash: string): string {
  return `demo:${agentId}:${epic}:${codeHash}`;
}
