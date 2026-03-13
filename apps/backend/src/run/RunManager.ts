import type { RunConfig } from '../core/agent/types.ts';
import type { RunResult } from '../core/agent/AgentRunner.ts';
import type { Metrics } from '../core/metrics/MetricsEngine.ts';
import type { PriceFeed } from '../core/feed/types.ts';
import { AgentRunner } from '../core/agent/AgentRunner.ts';
import { AgentLoader, type LoadedAgent, type BlueprintMeta } from '../core/agent/AgentLoader.ts';
import { BacktestFeed } from '../core/feed/BacktestFeed.ts';
import { BacktestTickFeed } from '../core/feed/BacktestTickFeed.ts';
import { TickRepository } from '../data/TickRepository.ts';
import { SimulatedExecution, type SlippageMode } from '../core/execution/SimulatedExecution.ts';
import { CapitalSession, type CapitalCredentials } from '../providers/capital/CapitalSession.ts';
import { CapitalLiveFeed } from '../providers/capital/CapitalLiveFeed.ts';
import { CapitalLiveExecution } from '../providers/capital/CapitalLiveExecution.ts';
import { MetricsEngine } from '../core/metrics/MetricsEngine.ts';
import { CandleRepository } from '../data/CandleRepository.ts';
import { RunRepository } from '../data/RunRepository.ts';
import { getInstrument } from '../data/instruments.ts';

export interface BacktestResult {
  runId: string;
  metrics: Metrics;
  runResult: RunResult;
}

export interface QueueProgress {
  processed: number;
  total: number;
}

export interface QueueEntry {
  runId: string;
  agentId: string;
  agentName: string;
  mode: string;
  progress?: QueueProgress;
}

export interface QueueState {
  current: QueueEntry | null;
  queued: QueueEntry[];
  queueLength: number;
}

interface LiveRunHandle {
  runner: AgentRunner;
  feed: PriceFeed;
  session: CapitalSession;
}

/**
 * Orchestrates agent runs.
 *
 * For backtest: loads agent, loads candles, runs AgentRunner, calculates metrics, stores results.
 * For paper/live: connects to Capital.com WebSocket + REST API.
 */
export class RunManager {
  private readonly agentLoader: AgentLoader;
  private readonly activeRuns: Map<string, { runner: AgentRunner; feed: BacktestFeed }> = new Map();
  private readonly activeLiveRuns: Map<string, LiveRunHandle> = new Map();
  private readonly slippage: SlippageMode;

  // Backtest queue
  private backtestQueue: Array<{ runId: string; config: RunConfig; agentName: string }> = [];
  private currentBacktest: { runId: string; config: RunConfig; agentName: string } | null = null;
  private currentFeed: (BacktestFeed | BacktestTickFeed) | null = null;
  private processing = false;

  // Callbacks for WebSocket broadcast (set by server.ts)
  onBacktestComplete?: (runId: string, metrics: Metrics) => void;
  onBacktestError?: (runId: string, error: string) => void;

  constructor(agentsDir: string, slippage: SlippageMode = { type: 'none' }) {
    this.agentLoader = new AgentLoader(agentsDir);
    this.slippage = slippage;
  }

  /** Recovery on startup: mark orphaned 'running' as error, re-queue orphaned 'queued' */
  async init(): Promise<void> {
    const activeRuns = await RunRepository.getActiveRuns();
    for (const run of activeRuns) {
      if (run.status === 'running') {
        console.log(`[queue] Marking orphaned running backtest ${run.id} as error`);
        await RunRepository.failRun(run.id, 'Server restarted — run state lost');
      } else if (run.status === 'queued') {
        console.log(`[queue] Re-queuing orphaned backtest ${run.id}`);
        const config = run.config as unknown as RunConfig;
        this.backtestQueue.push({ runId: run.id, config, agentName: run.agentName });
      }
    }
    if (this.backtestQueue.length > 0) {
      console.log(`[queue] Recovered ${this.backtestQueue.length} queued backtest(s)`);
      this.processNext();
    }
  }

  /** Enqueue a backtest — returns immediately with runId and status */
  async enqueueBacktest(config: RunConfig): Promise<{ runId: string; status: 'queued' | 'duplicate' }> {
    // Validate agent exists
    const loaded = await this.agentLoader.loadById(config.agentId);
    if (!loaded) {
      throw new Error(`Agent not found: ${config.agentId}`);
    }

    // Check for duplicate
    if (this.isDuplicateRun(config.agentId, config.mode)) {
      return { runId: '', status: 'duplicate' };
    }

    // Generate run ID
    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Create DB record with status 'queued' and no startedAt
    await RunRepository.createRun({
      id: runId,
      agentId: config.agentId,
      agentName: loaded.config.name,
      mode: 'backtest',
      status: 'queued',
      capital: config.capital,
      instrument: loaded.config.instrument,
      config: config as unknown as Record<string, unknown>,
      startedAt: null,
    });

    // Push to queue and kick processing
    this.backtestQueue.push({ runId, config, agentName: loaded.config.name });
    this.processNext();

    return { runId, status: 'queued' };
  }

  /** Get current queue state */
  getQueueState(): QueueState {
    return {
      current: this.currentBacktest ? {
        runId: this.currentBacktest.runId,
        agentId: this.currentBacktest.config.agentId,
        agentName: this.currentBacktest.agentName,
        mode: this.currentBacktest.config.mode,
        progress: this.currentFeed ? {
          processed: this.currentFeed.processed,
          total: this.currentFeed.length,
        } : undefined,
      } : null,
      queued: this.backtestQueue.map(entry => ({
        runId: entry.runId,
        agentId: entry.config.agentId,
        agentName: entry.agentName,
        mode: entry.config.mode,
      })),
      queueLength: this.backtestQueue.length + (this.currentBacktest ? 1 : 0),
    };
  }

  private isDuplicateRun(agentId: string, mode: string): boolean {
    // Check current running backtest
    if (this.currentBacktest && this.currentBacktest.config.agentId === agentId && this.currentBacktest.config.mode === mode) {
      return true;
    }
    // Check queue
    return this.backtestQueue.some(entry => entry.config.agentId === agentId && entry.config.mode === mode);
  }

  private processNext(): void {
    if (this.processing || this.backtestQueue.length === 0) return;
    this.processing = true;

    const entry = this.backtestQueue.shift()!;
    this.currentBacktest = entry;

    this.executeBacktest(entry.runId, entry.config)
      .then(async (result) => {
        this.currentBacktest = null;
        this.currentFeed = null;
        this.processing = false;
        this.onBacktestComplete?.(entry.runId, result.metrics);
        this.processNext();
      })
      .catch(async (err) => {
        this.currentBacktest = null;
        this.currentFeed = null;
        this.processing = false;
        const message = err instanceof Error ? err.message : String(err);
        this.onBacktestError?.(entry.runId, message);
        this.processNext();
      });
  }

  /** Core backtest execution — takes a pre-created runId */
  private async executeBacktest(runId: string, config: RunConfig): Promise<BacktestResult> {
    if (!config.startDate || !config.endDate) {
      throw new Error('Backtest requires startDate and endDate');
    }

    const loaded = await this.agentLoader.loadById(config.agentId);
    if (!loaded) {
      throw new Error(`Agent not found: ${config.agentId}`);
    }

    const baseInstrument = getInstrument(loaded.config.instrument);
    if (!baseInstrument) {
      throw new Error(`Unknown instrument: ${loaded.config.instrument}`);
    }
    const instrument = { ...baseInstrument, leverage: loaded.config.leverage };

    // Update status to running
    await RunRepository.updateRunStatus(runId, 'running', Date.now());

    try {
      const startMs = new Date(config.startDate).getTime();
      const endMs = new Date(config.endDate).getTime();
      const candles = await CandleRepository.loadMinuteCandles(loaded.config.instrument, startMs, endMs);

      if (candles.length === 0) {
        throw new Error(`No candle data for ${loaded.config.instrument} between ${config.startDate} and ${config.endDate}`);
      }

      const execution = new SimulatedExecution(instrument, this.slippage);

      let feed: BacktestFeed | BacktestTickFeed;

      if (config.tickMode) {
        const ticks = await TickRepository.loadTicks(loaded.config.instrument, startMs, endMs);
        if (ticks.length === 0) {
          throw new Error(`No tick data for ${loaded.config.instrument} between ${config.startDate} and ${config.endDate}`);
        }

        const runner = new AgentRunner({
          agent: loaded.agent,
          feed: null!,
          execution,
          instrument,
          capital: config.capital,
          maxDrawdown: config.maxDrawdown,
          maxPositionSize: config.maxPositionSize,
        });

        const tickFeed = new BacktestTickFeed(
          ticks,
          (bid, ask, ts) => runner.processTick(bid, ask, ts),
        );
        (runner as any).feed = tickFeed;
        this.activeRuns.set(runId, { runner, feed: tickFeed as any });
        this.currentFeed = tickFeed;

        const runResult = await runner.run();
        this.activeRuns.delete(runId);

        const metrics = MetricsEngine.calculate(runResult.fills, runResult.equityCurve, config.capital);
        await RunRepository.completeRun(runId, metrics);
        await RunRepository.saveFills(runId, runResult.fills);
        await RunRepository.saveEquityCurve(runId, runResult.equityCurve);

        return { runId, metrics, runResult };
      }

      feed = new BacktestFeed(candles);
      this.currentFeed = feed;

      const runner = new AgentRunner({
        agent: loaded.agent,
        feed,
        execution,
        instrument,
        capital: config.capital,
        maxDrawdown: config.maxDrawdown,
        maxPositionSize: config.maxPositionSize,
      });

      this.activeRuns.set(runId, { runner, feed });

      const runResult = await runner.run();
      this.activeRuns.delete(runId);

      const metrics = MetricsEngine.calculate(runResult.fills, runResult.equityCurve, config.capital);
      await RunRepository.completeRun(runId, metrics);
      await RunRepository.saveFills(runId, runResult.fills);
      await RunRepository.saveEquityCurve(runId, runResult.equityCurve);

      return { runId, metrics, runResult };
    } catch (err) {
      this.activeRuns.delete(runId);
      const message = err instanceof Error ? err.message : String(err);
      await RunRepository.failRun(runId, message);
      throw err;
    }
  }

  async listAgents(): Promise<LoadedAgent[]> {
    return this.agentLoader.loadAll();
  }

  async getAgent(id: string): Promise<LoadedAgent | null> {
    return this.agentLoader.loadById(id);
  }

  async listBlueprints(): Promise<BlueprintMeta[]> {
    return this.agentLoader.loadBlueprints();
  }

  async startBacktest(config: RunConfig): Promise<BacktestResult> {
    // Validate
    if (config.mode !== 'backtest') {
      throw new Error(`RunManager.startBacktest only supports backtest mode, got ${config.mode}`);
    }
    if (!config.startDate || !config.endDate) {
      throw new Error('Backtest requires startDate and endDate');
    }

    // Load agent
    const loaded = await this.agentLoader.loadById(config.agentId);
    if (!loaded) {
      throw new Error(`Agent not found: ${config.agentId}`);
    }

    // Get instrument with agent's leverage
    const baseInstrument = getInstrument(loaded.config.instrument);
    if (!baseInstrument) {
      throw new Error(`Unknown instrument: ${loaded.config.instrument}`);
    }
    const instrument = { ...baseInstrument, leverage: loaded.config.leverage };

    // Generate run ID
    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Create run record
    await RunRepository.createRun({
      id: runId,
      agentId: config.agentId,
      agentName: loaded.config.name,
      mode: 'backtest',
      status: 'running',
      capital: config.capital,
      instrument: loaded.config.instrument,
      config: config as unknown as Record<string, unknown>,
      startedAt: Date.now(),
    });

    try {
      // Load candles
      const startMs = new Date(config.startDate).getTime();
      const endMs = new Date(config.endDate).getTime();
      const candles = await CandleRepository.loadMinuteCandles(loaded.config.instrument, startMs, endMs);

      if (candles.length === 0) {
        throw new Error(`No candle data for ${loaded.config.instrument} between ${config.startDate} and ${config.endDate}`);
      }

      // Build components
      const execution = new SimulatedExecution(instrument, this.slippage);

      let feed: BacktestFeed | BacktestTickFeed;

      if (config.tickMode) {
        // Tick-level backtest — replay real stored ticks for accurate SL/TP resolution.
        // Each tick goes through PositionMonitor.check(bid, ask), so whichever
        // level is hit first wins naturally (no pessimistic guessing).
        const ticks = await TickRepository.loadTicks(loaded.config.instrument, startMs, endMs);
        if (ticks.length === 0) {
          throw new Error(`No tick data for ${loaded.config.instrument} between ${config.startDate} and ${config.endDate}`);
        }

        const runner = new AgentRunner({
          agent: loaded.agent,
          feed: null!,
          execution,
          instrument,
          capital: config.capital,
          maxDrawdown: config.maxDrawdown,
          maxPositionSize: config.maxPositionSize,
        });

        const tickFeed = new BacktestTickFeed(
          ticks,
          (bid, ask, ts) => runner.processTick(bid, ask, ts),
        );
        (runner as any).feed = tickFeed;
        this.activeRuns.set(runId, { runner, feed: tickFeed as any });

        const runResult = await runner.run();
        this.activeRuns.delete(runId);

        const metrics = MetricsEngine.calculate(runResult.fills, runResult.equityCurve, config.capital);
        await RunRepository.completeRun(runId, metrics);
        await RunRepository.saveFills(runId, runResult.fills);
        await RunRepository.saveEquityCurve(runId, runResult.equityCurve);

        return { runId, metrics, runResult };
      }

      feed = new BacktestFeed(candles);

      const runner = new AgentRunner({
        agent: loaded.agent,
        feed,
        execution,
        instrument,
        capital: config.capital,
        maxDrawdown: config.maxDrawdown,
        maxPositionSize: config.maxPositionSize,
      });

      this.activeRuns.set(runId, { runner, feed });

      // Run
      const runResult = await runner.run();

      this.activeRuns.delete(runId);

      // Calculate metrics
      const metrics = MetricsEngine.calculate(runResult.fills, runResult.equityCurve, config.capital);

      // Store results
      await RunRepository.completeRun(runId, metrics);
      await RunRepository.saveFills(runId, runResult.fills);
      await RunRepository.saveEquityCurve(runId, runResult.equityCurve);

      return { runId, metrics, runResult };
    } catch (err) {
      this.activeRuns.delete(runId);
      const message = err instanceof Error ? err.message : String(err);
      await RunRepository.failRun(runId, message);
      throw err;
    }
  }

  async startLive(config: RunConfig): Promise<string> {
    if (config.mode !== 'paper' && config.mode !== 'live') {
      throw new Error(`startLive only supports paper/live mode, got ${config.mode}`);
    }

    // Load agent
    const loaded = await this.agentLoader.loadById(config.agentId);
    if (!loaded) {
      throw new Error(`Agent not found: ${config.agentId}`);
    }

    // Get instrument with agent's leverage
    const baseInstrument = getInstrument(loaded.config.instrument);
    if (!baseInstrument) {
      throw new Error(`Unknown instrument: ${loaded.config.instrument}`);
    }
    const instrument = { ...baseInstrument, leverage: loaded.config.leverage };

    // Read credentials from environment
    const apiKey = process.env.CAPITAL_API_KEY;
    const identifier = process.env.CAPITAL_IDENTIFIER;
    const password = process.env.CAPITAL_PASSWORD;

    if (!apiKey || !identifier || !password) {
      throw new Error('Missing Capital.com credentials: CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_PASSWORD');
    }

    const credentials: CapitalCredentials = {
      apiKey,
      identifier,
      password,
      isDemo: config.mode === 'paper',
    };

    // Generate run ID
    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Create run record
    await RunRepository.createRun({
      id: runId,
      agentId: config.agentId,
      agentName: loaded.config.name,
      mode: config.mode,
      status: 'running',
      capital: config.capital,
      instrument: loaded.config.instrument,
      config: config as unknown as Record<string, unknown>,
      startedAt: Date.now(),
    });

    // Build components
    const session = new CapitalSession(credentials);
    await session.connect();

    // Set broker leverage to match agent's config
    if (instrument.category) {
      await session.setLeverage(instrument.category, loaded.config.leverage);
    }

    const execution = new CapitalLiveExecution(session, instrument);

    const runner = new AgentRunner({
      agent: loaded.agent,
      feed: null!, // Set below after creating feed with runner reference
      execution,
      instrument,
      capital: config.capital,
      maxDrawdown: config.maxDrawdown,
      maxPositionSize: config.maxPositionSize,
    });

    const feed = new CapitalLiveFeed({
      session,
      epic: instrument.epic,
      onTick: (bid, ask, timestamp) => {
        runner.processTick(bid, ask, timestamp);
      },
    });

    // Wire feed into runner
    (runner as any).feed = feed;

    this.activeLiveRuns.set(runId, { runner, feed, session });

    // Start in background — don't await
    runner.run()
      .then(async (runResult) => {
        this.activeLiveRuns.delete(runId);
        const metrics = MetricsEngine.calculate(runResult.fills, runResult.equityCurve, config.capital);
        await RunRepository.completeRun(runId, metrics);
        await RunRepository.saveFills(runId, runResult.fills);
        await RunRepository.saveEquityCurve(runId, runResult.equityCurve);
        await session.destroy();
      })
      .catch(async (err) => {
        this.activeLiveRuns.delete(runId);
        const message = err instanceof Error ? err.message : String(err);
        await RunRepository.failRun(runId, message);
        await session.destroy();
      });

    return runId;
  }

  async stopRun(runId: string): Promise<void> {
    // Check backtest runs
    const active = this.activeRuns.get(runId);
    if (active) {
      active.feed.stop();
      return;
    }

    // Check live runs
    const liveRun = this.activeLiveRuns.get(runId);
    if (liveRun) {
      liveRun.feed.stop();
    }
  }

  async getRun(runId: string) {
    return RunRepository.getRun(runId);
  }

  async listRuns(filters?: { mode?: string; status?: string; agentId?: string }) {
    return RunRepository.listRuns(filters);
  }
}
