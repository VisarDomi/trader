# Trader Backend - Design Document

## Overview

An agent runner framework for automated trading. Developers write trading agents as TypeScript files, drop them in a folder, and the framework runs them against historical data (backtest) or live Capital.com prices (paper/live trading). Results feed into a leaderboard for comparison.

**Runtime:** Bun (TypeScript)
**Database:** PostgreSQL
**Broker:** Capital.com (first provider, abstracted for future expansion)

---

## Context: What Came Before

### Previous Repos (2023-2025)

Six separate repos built a fragmented pipeline:

| Repo | What it did | Status |
|---|---|---|
| capital-database-updater | Fetch minute OHLC from Capital.com REST API → PostgreSQL | Absorbed into framework |
| capital-database-stream-saver | Record live WebSocket ticks → PostgreSQL | Absorbed into framework |
| capital-database-stream-generator | Generate 600 synthetic ticks/minute from OHLC via linear interpolation | Eliminated (not needed) |
| capital-simulator | Intended price simulator | Was empty (never built) |
| capital-trading-agent | Monolithic agent with strategy + account + data access | Eliminated (agents are now separate files) |
| capital-position-tracker-telegram-bot | Poll positions, post to Telegram | Future notification plugin |

### What was wrong

1. **No framework.** The agent was the framework — strategy, indicators, account management, and data access tangled in one file.
2. **No agent contract.** Impossible for a second developer to write an agent without understanding the entire codebase.
3. **Pull-based backtesting.** The agent queried PostgreSQL directly, controlling its own clock and knowing it was backtesting.
4. **Massive duplication.** Capital.com auth, DB connections, and interfaces copy-pasted across 4+ repos.
5. **Naive synthetic data.** Linear interpolation through O→L→H→C segments produces unrealistic price paths.
6. **No metrics or comparison.** Trade results logged to text files. No structured output, no leaderboard.

### What was right

1. The data pipeline concept (ingest → store → replay).
2. PostgreSQL as central store with timestamp PKs and ON CONFLICT DO NOTHING.
3. Dual-buffer pattern for high-throughput tick ingestion.
4. Thinking about risk (liquidation simulator).
5. Thinking about observability (telegram bot).

---

## Agent Contract

The core interface that developers implement. An agent receives market data and returns trading decisions. It never knows whether it's backtesting or live.

### Types

```typescript
// ============================================
// WHAT THE AGENT IMPLEMENTS
// ============================================

interface Agent<S> {
  config: AgentConfig;
  init(): S;
  onCandle(candle: Candle, ctx: Context, state: S): AgentResult<S>;
  onFill(fill: Fill, state: S): S;
}

// ============================================
// AGENT CONFIG
// ============================================

interface AgentConfig {
  name: string;                      // "MACD Crossover v2"
  version: string;                   // "1.0.0"
  instrument: string;                // "US100" (single instrument per agent, MVP)
  primaryFeed: Timeframe;            // '5m' — triggers onCandle()
  secondaryFeeds?: Timeframe[];      // ['1h'] — available in ctx, don't trigger
  maxDrawdown?: number;              // agent-declared risk preference
  maxPositionSize?: number;          // agent-declared size cap
}

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// ============================================
// WHAT THE FRAMEWORK PROVIDES
// ============================================

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;                 // candle close time (ms)
  timeframe: Timeframe;
}

interface Context {
  account: AccountSnapshot;
  position: Position | null;         // single position (MVP)
  instrument: InstrumentInfo;
  timestamp: number;                 // current time (ms)
  history: Candle[];                 // primary feed — agent manages depth
  secondaryHistory: Record<Timeframe, Candle[]>;
}

interface AccountSnapshot {
  equity: number;                    // balance + unrealized P&L
  balance: number;                   // realized cash
  available: number;                 // free to trade
  margin: number;                    // locked in position
}

interface Position {
  direction: 'BUY' | 'SELL';
  size: number;
  entryPrice: number;                // actual fill price, not order price
  entryTime: number;
  unrealizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface InstrumentInfo {
  epic: string;
  leveraged: boolean;                // true = CFD (force-close at market close)
  leverage: number;                  // 200 for CFDs, 1 for shares
  spread: number;
  lotSize: number;
  minSize: number;
  maxSize: number;
  sizeIncrement: number;
  pricePrecision: number;
  tradingHours: TradingHours;
}

interface TradingHours {
  timezone: string;                  // "America/New_York"
  gaps: TradingGap[];                // sorted by 'from' ascending
}

interface TradingGap {
  from: string;                      // "2023-01-01" — applies from this date
  gapStart: string;                  // "17:00" — when gap begins
  gapEnd: string;                    // "18:00" — when trading resumes
}

// ============================================
// WHAT THE AGENT RETURNS
// ============================================

interface AgentResult<S> {
  order: Order | null;               // null = do nothing
  state: S;
}

type Order = OpenOrder | CloseOrder | ModifyOrder;

interface OpenOrder {
  action: 'OPEN';
  side: 'BUY' | 'SELL';
  size: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface CloseOrder {
  action: 'CLOSE';
}

interface ModifyOrder {
  action: 'MODIFY';
  stopLoss?: number;
  takeProfit?: number;
}

// ============================================
// WHAT THE FRAMEWORK CALLS BACK
// ============================================

interface Fill {
  action: 'OPENED' | 'CLOSED';
  reason: 'ORDER' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MARKET_CLOSE' | 'LIQUIDATION';
  side: 'BUY' | 'SELL';
  size: number;
  price: number;                     // actual execution price (with slippage)
  timestamp: number;
  pnl?: number;                      // present on CLOSED fills
}
```

### Design Decisions

- **State is explicit.** Agent returns new state on every call. Framework persists it. No hidden `this` state. Enables crash recovery, reproducibility, and debugging.
- **Agent declares what data it wants.** Primary feed triggers onCandle(). Secondary feeds are available in context for multi-timeframe analysis.
- **Agent controls orders, framework enforces ceilings.** Agent specifies size and stops. Framework validates against its own risk limits and instrument constraints.
- **Single instrument per agent (MVP).** Multi-instrument is a future extension.
- **Single position per agent (MVP).** No hedging or scaling in/out yet.
- **Framework owns trading hours.** Agent only gets called when the market is tradable. No need for the agent to check hours.
- **Framework owns stop/TP execution.** Live: checked on every tick. Backtest: checked on every minute candle within the agent's timeframe. Agent is notified via onFill with the reason.
- **Leveraged instruments force-close at market close.** Unleveraged instruments carry overnight. Agent notified via onFill with reason MARKET_CLOSE.
- **Capital is a run parameter, not agent config.** Framework decides how much capital to allocate. Enables leaderboard-based capital allocation.

---

## Position Lifecycle & Risk Management

The framework has three layers of risk management. Understanding them is critical for agent development.

### 1. Position-Level: Margin Liquidation (automatic)

Every open position locks up margin: `margin = (size × price × lotSize) / leverage`. At position open, the framework computes a **liquidation price** — the price at which the position's unrealized loss equals 50% of its margin:

- **BUY**: `liquidationPrice = entryPrice × (1 - 0.5 / leverage)`
- **SELL**: `liquidationPrice = entryPrice × (1 + 0.5 / leverage)`

When the market price breaches the liquidation price, the position is force-closed at that price with `reason: 'LIQUIDATION'`.

With high leverage, this happens fast. At 200× leverage, a **0.25% adverse move** triggers liquidation. At 20× leverage, it takes a **2.5% move**. This is why the same strategy produces dramatically different results at different leverage levels.

As a fallback, if total account equity reaches zero (all capital depleted including unrealized losses), the position is also liquidated.

**After liquidation, the agent keeps running.** It receives an `onFill` with `reason: 'LIQUIDATION'`, and on the next candle, `onCandle` is called with `ctx.position = null`. The agent can open a new position — just with less capital.

### 2. Position-Level: Agent Stops (agent-controlled)

Agents set `stopLoss` and `takeProfit` on their orders. The framework checks these on every tick (live) or every minute candle (backtest). These fire before liquidation if set tighter than the liquidation level.

### 3. Account-Level: Capital Depletion (automatic)

After a position closes (by any reason), the framework checks if the remaining capital can afford the minimum position: `minMargin = (minSize × price × lotSize) / leverage`. If not, the run stops — the agent is out of money.

### Optional: Account-Level Drawdown Cap

`maxDrawdown` in RunnerConfig is an **optional safety ceiling**. If set, the framework force-closes the position AND stops the entire run when `(initialCapital - equity) / initialCapital >= maxDrawdown`. This is a kill switch — do NOT set it if you want the agent to naturally trade down to depletion.

### What this means for agent developers

- A position getting liquidated is **not the end of the run**. It's a single bad trade. The agent can recover.
- With high leverage, liquidation is common and expected. An agent at 200× will get liquidated on a ~0.5% adverse move.
- Set stop-losses tighter than the liquidation level, or accept that some positions will be liquidated.
- The run ends when you can't afford the minimum position size, not when a single trade goes wrong.

---

## Framework Architecture

Seven components. Only two swap between backtest and live mode.

```
                    ┌─────────────────────────────────┐
                    │           API Server             │
                    │  REST + WebSocket                │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │         Run Manager              │
                    │  Creates runs, wires components  │
                    └──────────────┬──────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐    ┌───────────────────┐    ┌──────────────────┐
│   Price Feed     │    │   Agent Runner    │    │  Metrics Engine  │
│  [SWAPPABLE]     │───▶│                   │───▶│                  │
│                  │    │                   │    │                  │
└─────────────────┘    └────────┬──────────┘    └──────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
         ┌───────────────────┐   ┌───────────────────┐
         │ Position Monitor  │   │ Execution Engine   │
         │                   │   │  [SWAPPABLE]       │
         └───────────────────┘   └───────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │    Account Manager    │
                    └───────────────────────┘
```

### Component Details

**Price Feed** (swappable)
- BacktestFeed: reads minute candles from PostgreSQL, replays in sequence, controls clock
- LiveFeed: connects to Capital.com WebSocket, receives ~10 ticks/sec

**Candle Builder**
- Aggregates minute candles into any timeframe (5m, 15m, 1h, etc.)
- In backtest: builds from stored minute data
- In live: builds from incoming ticks

**Agent Runner** (one per active run)
- Loads agent, calls init()
- Filters calls by trading hours
- Builds history[] and secondaryHistory
- Assembles Context from Account Manager + Position Monitor
- Calls onCandle(), validates returned orders, passes to Execution Engine
- Calls onFill() with actual fill data
- Persists state after each step

**Position Monitor**
- Watches every price update against open position's stops/TPs
- Live: checks every tick (real-time)
- Backtest: checks every minute candle's high/low within the agent's timeframe
- Triggers: STOP_LOSS, TAKE_PROFIT, LIQUIDATION, MARKET_CLOSE
- Pessimistic execution: if both stop and TP could trigger in same candle, stop wins

**Execution Engine** (swappable)
- SimulatedExecution: fill at candle close ± slippage
- LiveExecution: POST /api/v1/positions on Capital.com, poll confirmation

**Account Manager**
- Tracks: balance, margin, unrealizedPnL, equity, available
- Updates on fills and price changes
- Persisted to DB after every change

**Metrics Engine**
- Inputs: ordered fills + equity curve
- Outputs: totalTrades, winRate, totalPnL, totalReturn, maxDrawdown, sharpe, profitFactor, averageHoldTime, equityCurve

**Run Manager**
- Orchestrator: wires correct Price Feed + Execution Engine based on mode
- Manages run lifecycle: start, stop, complete
- Stores results in DB for leaderboard

### What swaps per mode

| Component | Backtest | Paper | Live |
|---|---|---|---|
| Price Feed | DB replay | WebSocket (demo) | WebSocket (real) |
| Execution Engine | Simulated | Capital.com (demo) | Capital.com (real) |
| Everything else | Same | Same | Same |

---

## API Design

### REST Endpoints

**Agents** (file-based: agents in /agents/ folder, framework watches)
```
GET    /agents              List registered agents
GET    /agents/:id          Agent details + config
```

**Runs**
```
POST   /runs                Start a new run
GET    /runs                List runs (filterable by mode, status, agent)
GET    /runs/:id            Run status + current snapshot
POST   /runs/:id/stop       Stop a run gracefully
GET    /runs/:id/state      Current agent state (debugging)
```

**Results**
```
GET    /runs/:id/metrics        Performance metrics
GET    /runs/:id/fills          Trade history (paginated)
GET    /runs/:id/equity-curve   Equity curve data (with resolution param)
```

**Leaderboard**
```
GET    /leaderboard         Ranked agent performance (filterable, sortable)
```

**System**
```
GET    /instruments          Available instruments + info
GET    /health               Server status
```

### WebSocket

```
WS /ws/runs/:id

Events: candle, order, fill, equity, state, stopped, error
```

### Run Config (POST /runs body)

```typescript
interface RunConfig {
  agentId: string;
  capital: number;
  mode: 'backtest' | 'paper' | 'live';
  startDate?: string;                // backtest only
  endDate?: string;                  // backtest only
  maxDrawdown?: number;              // framework risk ceiling
  maxPositionSize?: number;          // framework size ceiling
}
```

---

## Data Layer

### Database Schema

**Market Data (shared)**

```sql
-- Minute OHLC candles, foundation for all timeframes
CREATE TABLE candles (
    instrument  TEXT        NOT NULL,
    timestamp   BIGINT      NOT NULL,   -- candle close time (ms)
    open        NUMERIC     NOT NULL,
    high        NUMERIC     NOT NULL,
    low         NUMERIC     NOT NULL,
    close       NUMERIC     NOT NULL,
    PRIMARY KEY (instrument, timestamp)
);

-- Raw ticks recorded from live sessions (optional, for future use)
CREATE TABLE ticks (
    instrument  TEXT        NOT NULL,
    timestamp   BIGINT      NOT NULL,   -- ms precision
    bid         NUMERIC     NOT NULL,
    ask         NUMERIC     NOT NULL,
    PRIMARY KEY (instrument, timestamp)
);
```

**Run Data (per agent run)**

```sql
CREATE TABLE runs (
    id              TEXT        PRIMARY KEY,
    agent_id        TEXT        NOT NULL,
    agent_name      TEXT        NOT NULL,
    mode            TEXT        NOT NULL,   -- backtest | paper | live
    status          TEXT        NOT NULL,   -- pending | running | completed | stopped | error
    capital         NUMERIC     NOT NULL,
    instrument      TEXT        NOT NULL,
    config          JSONB       NOT NULL,   -- full run config snapshot
    started_at      BIGINT,
    completed_at    BIGINT,
    metrics         JSONB                   -- final metrics (on completion)
);

CREATE TABLE fills (
    id              SERIAL      PRIMARY KEY,
    run_id          TEXT        NOT NULL REFERENCES runs(id),
    action          TEXT        NOT NULL,   -- OPENED | CLOSED
    reason          TEXT        NOT NULL,   -- ORDER | STOP_LOSS | TAKE_PROFIT | MARKET_CLOSE | LIQUIDATION
    side            TEXT        NOT NULL,   -- BUY | SELL
    size            NUMERIC     NOT NULL,
    price           NUMERIC     NOT NULL,
    pnl             NUMERIC,               -- null for OPENED fills
    timestamp       BIGINT      NOT NULL
);

CREATE TABLE equity_snapshots (
    run_id          TEXT        NOT NULL REFERENCES runs(id),
    timestamp       BIGINT      NOT NULL,
    equity          NUMERIC     NOT NULL,
    balance         NUMERIC     NOT NULL,
    PRIMARY KEY (run_id, timestamp)
);

CREATE TABLE agent_states (
    run_id          TEXT        NOT NULL REFERENCES runs(id),
    timestamp       BIGINT      NOT NULL,
    state           JSONB       NOT NULL,
    PRIMARY KEY (run_id, timestamp)
);
```

### Data Flow

**Ingestion (background job):**
Capital.com REST API → parse bid-side OHLC → INSERT INTO candles ON CONFLICT DO NOTHING

**Backtest read path:**
1. Query minute candles for date range
2. Candle Builder aggregates to agent's timeframe
3. Position Monitor checks each minute candle's high/low for stop/TP triggers
4. Agent receives aggregated candles only

**Live read path:**
1. Capital.com WebSocket → tick arrives
2. Every tick: Position Monitor checks stops/TPs
3. Candle Builder updates current candle
4. On candle close: Agent Runner calls agent.onCandle()
5. (Optional) Record tick to ticks table

---

## Technology Choices

| Choice | Decision | Rationale |
|---|---|---|
| Language | TypeScript | Agent contract is a TS interface. Agents get compile-time checking. Shared types. Fastest path to MVP. |
| Runtime | Bun | Native TypeScript execution (no build step for agents). Fast. Built-in WebSocket server. |
| Database | PostgreSQL | Proven for time-series with proper indexing. Upgrade path to TimescaleDB if needed. |
| Agent delivery | Files in /agents/ folder | Framework watches directory. Drop a .ts file, it runs. Simplest possible DX. |
| Broker | Capital.com | First provider. Abstracted behind Execution Engine + Price Feed interfaces. |

### Why not Go?

Go is a better server language (goroutines, single binary, lower memory). But the core feature — "drop a .ts file and it runs" — requires dynamic code loading, which Go handles poorly (plugins are broken, embedding a JS runtime defeats the purpose). If the framework ever needs Go-level concurrency, the clean agent contract boundary means we can rewrite the framework while keeping agents in TypeScript.

---

## Future Extensions (not MVP)

- Multi-instrument agents
- Multiple concurrent positions / scaling in/out
- Agent marketplace (upload via API, git repo integration)
- Notification plugins (Telegram, Discord, email)
- Frontend integration (trader-svelte showing leaderboard + equity curves)
- Capital allocation based on leaderboard ranking
- Multi-provider support (not just Capital.com)
