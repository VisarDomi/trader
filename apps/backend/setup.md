# Trader Backend

Bun/TypeScript: the agent SDK, the simulation engine shared by backtest and demo, the lab tools
(run on the lab PC), and the arena service (runs on Hetzner). Repo-wide map and hard rules:
[`../../setup.md`](../../setup.md).

## Read on demand

- [`agents/GUIDE.md`](agents/GUIDE.md) — writing an agent (the SDK contract, sizing, indicators, TimesFM).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how it fits together: two leaderboards, topology, code map,
  simulation model, arena, broker mirror, known limitations.
- [`WORKFLOW.md`](WORKFLOW.md) — git conventions, everyday commands, adding an agent end to end.
- [`DECISIONS.md`](DECISIONS.md) — why things are the way they are (v2 section first).
- [`TODO.md`](TODO.md) — open work.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed.
- `DESIGN.md`, `VALIDATION.md` — v1 only (historical; its code is gone).
- No-magic-strings rule: `~/Documents/archive/memory/no-magic-strings.md`

## Rules

- Default to Bun instead of Node.js.
- Prefer `Bun.serve()`, `Bun.sql`, built-in `WebSocket`, and `Bun.file` where they fit.
- Log notable backend changes in `CHANGELOG.md` under `## Unreleased` before considering the task done.
- Agents import only from `src/sdk`. Changing an agent file restarts its demo record (new code hash);
  to try a variation, add a new file or a variant instead.
- `src/arena` must not import from `src/lab` (the server only receives `src/` and `agents/`, and the
  lab code needs PostgreSQL).
- Every Capital.com request goes through `CapitalClient` (`src/capital/client.ts`), which paces
  requests; the limits it documents apply to the whole login.

## Commands (from `apps/backend`)

```bash
bun test                                   # engine + slot tests
bun run typecheck
bun run check-agent agents/my-agent.ts     # determinism, speed, rejected orders (seconds)
bun run backtest my-agent                  # backtest 2024-01 → 2026-09, push to the arena
bun run forecasts                          # precompute TimesFM tables for forecast agents (GPU)
bun run ingest                             # gap-fill 1-minute candles into PostgreSQL
bun run arena                              # the arena service (normally only on the server)
```

Heavy jobs (backtest, forecasts, a full ingest) on the lab PC go inside `trader.slice`; see
[`WORKFLOW.md`](WORKFLOW.md).

## Data

- Lab PostgreSQL `trader` has one table, `candles` (1-minute bid OHLC + spread + volume, all
  instruments since 2024-01, US100 since 2020). `bun run ingest` creates it.
- Lab caches (gitignored, rebuildable) under `data/`: candle binaries, TimesFM forecast tables,
  backtest results.
- Arena state is SQLite on the server (`/home/erdal/trader-arena/data/arena.db`): agents and their
  versioned source, runs, trades, equity, logs, broker deals, events, settings.

## Broker mirror (real demo orders)

Paper runs are the leaderboard; the mirror copies them onto Capital.com demo accounts to measure
real fills. It uses the nine accounts named "Arena…" (Visi is the user's): each is topped up to
$100,000 and runs in hedging mode, holding up to 50 runs at 0.2× the paper size, 450 in total.
Details: [`ARCHITECTURE.md`](ARCHITECTURE.md#broker-mirror).
