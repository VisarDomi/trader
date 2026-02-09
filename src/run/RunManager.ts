import type { RunConfig } from '../core/agent/types.ts';
import type { RunResult } from '../core/agent/AgentRunner.ts';
import type { Metrics } from '../core/metrics/MetricsEngine.ts';
import type { PriceFeed } from '../core/feed/types.ts';
import { AgentRunner } from '../core/agent/AgentRunner.ts';
import { AgentLoader, type LoadedAgent } from '../core/agent/AgentLoader.ts';
import { BacktestFeed } from '../core/feed/BacktestFeed.ts';
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

  constructor(agentsDir: string, slippage: SlippageMode = { type: 'none' }) {
    this.agentLoader = new AgentLoader(agentsDir);
    this.slippage = slippage;
  }

  async listAgents(): Promise<LoadedAgent[]> {
    return this.agentLoader.loadAll();
  }

  async getAgent(id: string): Promise<LoadedAgent | null> {
    return this.agentLoader.loadById(id);
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

    // Get instrument
    const instrument = getInstrument(loaded.config.instrument);
    if (!instrument) {
      throw new Error(`Unknown instrument: ${loaded.config.instrument}`);
    }

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
      const feed = new BacktestFeed(candles);
      const execution = new SimulatedExecution(instrument, this.slippage);

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

    // Get instrument
    const instrument = getInstrument(loaded.config.instrument);
    if (!instrument) {
      throw new Error(`Unknown instrument: ${loaded.config.instrument}`);
    }

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
