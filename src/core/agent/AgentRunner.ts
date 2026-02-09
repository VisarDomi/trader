import type {
  Agent,
  AgentResult,
  Candle,
  Context,
  Fill,
  InstrumentInfo,
  OpenOrder,
  Order,
  Position,
  Timeframe,
} from './types.ts';
import { isWithinTradingHours, isMarketCloseCandle } from './tradingHours.ts';
import { AccountManager } from '../account/AccountManager.ts';
import { CandleBuilder } from '../candle/CandleBuilder.ts';
import { PositionMonitor } from '../position/PositionMonitor.ts';
import type { ExecutionEngine } from '../execution/types.ts';
import type { PriceFeed } from '../feed/types.ts';

export interface RunnerConfig {
  agent: Agent<unknown>;
  feed: PriceFeed;
  execution: ExecutionEngine;
  instrument: InstrumentInfo;
  capital: number;
  maxDrawdown?: number;
  maxPositionSize?: number;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  balance: number;
}

export interface RunResult {
  fills: Fill[];
  equityCurve: EquityPoint[];
  finalBalance: number;
  totalCandles: number;
}

export class AgentRunner {
  private readonly agent: Agent<unknown>;
  private readonly feed: PriceFeed;
  private readonly execution: ExecutionEngine;
  private readonly instrument: InstrumentInfo;
  private readonly account: AccountManager;
  private readonly positionMonitor: PositionMonitor;
  private readonly primaryBuilder: CandleBuilder;
  private readonly secondaryBuilders: Map<Timeframe, CandleBuilder>;
  private readonly maxDrawdown?: number;
  private readonly maxPositionSize?: number;

  private state: unknown;
  private position: Position | null = null;
  private history: Candle[] = [];
  private secondaryHistory: Record<Timeframe, Candle[]>;
  private fills: Fill[] = [];
  private equityCurve: EquityPoint[] = [];
  private totalMinuteCandles: number = 0;
  private lastPrice: { bid: number; ask: number } | null = null;
  private executionInFlight: boolean = false;

  constructor(config: RunnerConfig) {
    this.agent = config.agent;
    this.feed = config.feed;
    this.execution = config.execution;
    this.instrument = config.instrument;
    this.account = new AccountManager(config.capital, config.instrument);
    this.positionMonitor = new PositionMonitor();
    this.primaryBuilder = new CandleBuilder(config.agent.config.primaryFeed);
    this.maxDrawdown = config.maxDrawdown;
    this.maxPositionSize = config.maxPositionSize;

    this.secondaryBuilders = new Map();
    this.secondaryHistory = {} as Record<Timeframe, Candle[]>;
    for (const tf of config.agent.config.secondaryFeeds ?? []) {
      this.secondaryBuilders.set(tf, new CandleBuilder(tf));
      this.secondaryHistory[tf] = [];
    }

    this.state = config.agent.init();

    this.equityCurve.push({
      timestamp: 0,
      equity: config.capital,
      balance: config.capital,
    });
  }

  async run(): Promise<RunResult> {
    await this.feed.start(async (minuteCandle) => {
      await this.processMinuteCandle(minuteCandle);
    });

    // Flush any remaining partial candle at end of data
    const lastCandle = this.primaryBuilder.flush();
    if (lastCandle) {
      await this.onPrimaryCandleComplete(lastCandle);
    }

    return {
      fills: this.fills,
      equityCurve: this.equityCurve,
      finalBalance: this.account.getSnapshot().balance,
      totalCandles: this.totalMinuteCandles,
    };
  }

  /**
   * Called on every live tick for real-time stop/TP monitoring.
   * Skipped if an execution call is already in flight.
   */
  async processTick(bid: number, ask: number, timestamp: number): Promise<void> {
    if (this.executionInFlight) return;
    if (!this.position) return;

    this.lastPrice = { bid, ask };
    this.account.updatePrice(bid, ask);

    const trigger = this.positionMonitor.check(bid, ask, this.account.equity);
    if (trigger) {
      this.executionInFlight = true;
      try {
        const fill = await this.execution.executeTrigger(trigger, this.position, timestamp);
        await this.handleCloseFill(fill);
      } finally {
        this.executionInFlight = false;
      }
    }
  }

  private async processMinuteCandle(minute: Candle): Promise<void> {
    this.executionInFlight = true;
    try {
      await this.processMinuteCandleInner(minute);
    } finally {
      this.executionInFlight = false;
    }
  }

  private async processMinuteCandleInner(minute: Candle): Promise<void> {
    this.totalMinuteCandles++;

    const bid = minute.close;
    const ask = minute.close + this.instrument.spread;
    this.lastPrice = { bid, ask };

    // 1. Update account with current price
    this.account.updatePrice(bid, ask);

    // 2. Check position monitor (stops, TP, liquidation)
    if (this.position) {
      const trigger = this.positionMonitor.checkCandle(
        minute.low,
        minute.high,
        this.instrument.spread,
        this.account.equity,
      );

      if (trigger) {
        const fill = await this.execution.executeTrigger(trigger, this.position, minute.timestamp);
        await this.handleCloseFill(fill);
      }
    }

    // 3. Check market close for leveraged instruments
    if (
      this.position &&
      this.instrument.leveraged &&
      isMarketCloseCandle(minute.timestamp, this.instrument.tradingHours)
    ) {
      const fill = await this.execution.executeClose(this.position, bid, minute.timestamp);
      const marketCloseFill: Fill = { ...fill, reason: 'MARKET_CLOSE' };
      await this.handleCloseFill(marketCloseFill);
    }

    // 4. Check framework max drawdown
    if (this.maxDrawdown !== undefined) {
      const snap = this.account.getSnapshot();
      const initialCapital = this.equityCurve[0]!.equity;
      const drawdown = (initialCapital - snap.equity) / initialCapital;
      if (drawdown >= this.maxDrawdown) {
        if (this.position) {
          const fill = await this.execution.executeClose(this.position, bid, minute.timestamp);
          const liquidationFill: Fill = { ...fill, reason: 'LIQUIDATION' };
          await this.handleCloseFill(liquidationFill);
        }
        this.feed.stop();
        return;
      }
    }

    // 5. Feed to primary CandleBuilder
    const completedPrimary = this.primaryBuilder.addMinuteCandle(minute);
    if (completedPrimary) {
      await this.onPrimaryCandleComplete(completedPrimary);
    }

    // 6. Feed to secondary CandleBuilders
    for (const [tf, builder] of this.secondaryBuilders) {
      const completed = builder.addMinuteCandle(minute);
      if (completed) {
        this.secondaryHistory[tf]!.push(completed);
      }
    }
  }

  private async onPrimaryCandleComplete(candle: Candle): Promise<void> {
    this.history.push(candle);

    // Only call agent during trading hours (leveraged instruments)
    // Unleveraged instruments: always call
    if (this.instrument.leveraged) {
      if (!isWithinTradingHours(candle.timestamp, this.instrument.tradingHours)) {
        this.recordEquity(candle.timestamp);
        return;
      }
    }

    // Build context
    const ctx: Context = {
      account: this.account.getSnapshot(),
      position: this.position,
      instrument: this.instrument,
      timestamp: candle.timestamp,
      history: this.history,
      secondaryHistory: this.secondaryHistory,
    };

    // Call agent
    const result: AgentResult<unknown> = this.agent.onCandle(candle, ctx, this.state);
    this.state = result.state;

    // Process order
    if (result.order) {
      await this.processOrder(result.order, candle);
    }

    this.recordEquity(candle.timestamp);
  }

  private async processOrder(order: Order, candle: Candle): Promise<void> {
    const bid = candle.close;
    const timestamp = candle.timestamp;

    switch (order.action) {
      case 'OPEN':
        await this.processOpen(order, bid, timestamp);
        break;
      case 'CLOSE':
        await this.processClose(bid, timestamp);
        break;
      case 'MODIFY':
        this.processModify(order.stopLoss, order.takeProfit);
        break;
    }
  }

  private async processOpen(order: OpenOrder, referencePrice: number, timestamp: number): Promise<void> {
    if (this.position) return; // silently ignore if already have position

    // Validate size
    const size = this.clampSize(order.size);
    if (size === null) return;

    // Check framework position size ceiling
    if (this.maxPositionSize !== undefined && size > this.maxPositionSize) return;

    // Check if agent's own limit is exceeded
    if (this.agent.config.maxPositionSize !== undefined && size > this.agent.config.maxPositionSize) return;

    // Execute
    const fill = await this.execution.executeOpen(order.side, size, referencePrice, timestamp);

    // Update account
    this.account.onOpen(fill);

    // Build position
    this.position = {
      direction: order.side,
      size,
      entryPrice: fill.price,
      entryTime: timestamp,
      unrealizedPnL: 0,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
    };
    this.positionMonitor.setPosition(this.position);

    // Record and notify agent
    this.fills.push(fill);
    this.state = this.agent.onFill(fill, this.state);
  }

  private async processClose(referencePrice: number, timestamp: number): Promise<void> {
    if (!this.position) return; // silently ignore if no position

    const fill = await this.execution.executeClose(this.position, referencePrice, timestamp);
    await this.handleCloseFill(fill);
  }

  private processModify(stopLoss?: number, takeProfit?: number): void {
    if (!this.position) return;

    this.position = {
      ...this.position,
      stopLoss: stopLoss ?? this.position.stopLoss,
      takeProfit: takeProfit ?? this.position.takeProfit,
    };
    this.positionMonitor.setPosition(this.position);
  }

  private async handleCloseFill(fill: Fill): Promise<void> {
    this.account.onClose(fill);
    this.position = null;
    this.positionMonitor.setPosition(null);
    this.fills.push(fill);
    this.state = this.agent.onFill(fill, this.state);
  }

  private clampSize(requestedSize: number): number | null {
    const { minSize, maxSize, sizeIncrement } = this.instrument;

    if (requestedSize < minSize) return null;

    // Round down to nearest size increment
    const stepped = Math.floor(requestedSize / sizeIncrement) * sizeIncrement;
    if (stepped < minSize) return null;

    return Math.min(stepped, maxSize);
  }

  private recordEquity(timestamp: number): void {
    const snap = this.account.getSnapshot();
    this.equityCurve.push({
      timestamp,
      equity: snap.equity,
      balance: snap.balance,
    });
  }
}
