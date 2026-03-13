# Development Workflow

## Git Strategy

Simple feature-branch workflow. No `develop` branch — features branch from and merge into `main`.

```
main (stable, always runnable)
  │
  ├── feature/agent-contract
  ├── feature/backtest-runner
  ├── feature/api-server
  └── feature/data-ingestion
```

### Creating a feature

```bash
git checkout main
git pull
git checkout -b feature/my-feature
```

### Working on a feature

```bash
# make changes
git add <specific files>
git commit -m "feat(component): description"
```

### Commit message convention

```
type(scope): description

Types:
  feat     — new feature
  fix      — bug fix
  refactor — code change that neither fixes a bug nor adds a feature
  docs     — documentation only
  test     — adding or updating tests
  chore    — build, config, tooling changes

Scopes:
  agent    — agent contract, loader, runner
  feed     — price feed (backtest or live)
  exec     — execution engine
  position — position monitor
  account  — account manager
  metrics  — metrics engine
  run      — run manager
  api      — REST/WebSocket API
  data     — database, migrations, ingestion
```

### Merging

```bash
git checkout main
git merge feature/my-feature
git branch -d feature/my-feature
```

For collaborative work or risky changes, use PRs via GitHub.

---

## Project Structure

```
trader-backend/
├── agents/                      # Drop agent .ts files here
│   └── .example/                # Example agents for reference
├── src/
│   ├── core/
│   │   ├── agent/               # Agent contract types, loader, runner
│   │   ├── feed/                # Price feed interface + implementations
│   │   ├── candle/              # Candle builder (minutes → any timeframe)
│   │   ├── execution/           # Execution engine interface + implementations
│   │   ├── position/            # Position monitor (stop/TP/liquidation)
│   │   ├── account/             # Account manager (balance, margin, P&L)
│   │   └── metrics/             # Metrics engine (Sharpe, drawdown, etc.)
│   ├── api/                     # REST + WebSocket server
│   ├── data/                    # Database schema, migrations, ingestion
│   └── run/                     # Run manager (orchestration)
├── DESIGN.md                    # Architecture & all design decisions
├── WORKFLOW.md                  # This file
├── package.json
├── tsconfig.json
├── .env.template
└── .gitignore
```

---

## Running the Project

### Prerequisites

- [Bun](https://bun.sh) runtime
- PostgreSQL database

### Setup

```bash
# Install dependencies
bun install

# Copy and fill in environment variables
cp .env.template .env

# Run database migrations
bun run db:migrate

# Ingest historical price data
bun run ingest
```

### Development

```bash
# Start server with hot reload
bun run dev

# Run tests
bun test
```

### Production

```bash
bun run start
```

---

## Writing an Agent

1. Create a new `.ts` file in `agents/`:

```typescript
// agents/my-strategy.ts
import type { Agent, AgentConfig, Candle, Context, AgentResult, Fill } from '../src/core/agent/types.ts';

interface MyState {
  // your indicator values, counters, etc.
}

const config: AgentConfig = {
  name: 'My Strategy',
  version: '1.0.0',
  instrument: 'US100',
  primaryFeed: '5m',
};

function init(): MyState {
  return { /* initial state */ };
}

function onCandle(candle: Candle, ctx: Context, state: MyState): AgentResult<MyState> {
  // your logic here
  return { order: null, state };
}

function onFill(fill: Fill, state: MyState): MyState {
  return state;
}

export default { config, init, onCandle, onFill } satisfies Agent<MyState>;
```

2. The framework automatically detects the new file and makes it available for runs.

3. Start a backtest via the API:

```bash
curl -X POST http://localhost:3001/runs \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-strategy",
    "mode": "backtest",
    "capital": 10000,
    "startDate": "2024-01-01",
    "endDate": "2024-06-30"
  }'
```

4. Check results:

```bash
curl http://localhost:3001/runs/{runId}/metrics
```

---

## Build Order (implementation roadmap)

Each feature builds on the previous:

1. **Agent contract types** — the interface everything depends on
2. **Account Manager** — pure bookkeeping, easy to test
3. **Candle Builder** — aggregates minute candles to any timeframe
4. **Position Monitor** — watches prices against stops/TPs
5. **Simulated Execution Engine** — fills orders with slippage model
6. **Backtest Feed** — reads minute candles from PostgreSQL
7. **Agent Runner** — the core loop wiring everything together
8. **Data ingestion** — populate PostgreSQL with historical prices
9. **Metrics Engine** — calculate performance from fills + equity curve
10. **REST API** — expose runs, results, leaderboard
11. **WebSocket** — real-time run monitoring
12. **Live Feed + Live Execution** — Capital.com WebSocket + real orders
