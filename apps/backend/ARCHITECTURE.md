# Trader platform — architecture

A place to collect many trading agents, run them forward on live demo prices,
and rank them. **Backtest → Virtual engine → Capital demo** is the promotion path; demotion reverses it.
Actual Capital demo cashflows are ranked separately from virtual performance.

- Repo map, hard rules, operations: [`../../setup.md`](../../setup.md).
- Writing an agent: [`agents/GUIDE.md`](agents/GUIDE.md) (one file, no other changes).
- Dashboard: <https://trader.veron3.space> (Authelia login).
- Execution contract, measured broker behavior and capacity: [`EXECUTION.md`](EXECUTION.md).
- Tick capture, replay and the single-copy archive: [`TICKS.md`](TICKS.md).

## Three execution stages

| Stage | Data and costs | Purpose |
|---|---|---|
| Backtest | 2024-01 → 2026-09 bid candles, recorded spreads, estimated funding/margin | reject clearly broken ideas; qualify a current agent hash and engine version |
| Virtual engine | forward live quotes, delayed fills, refreshed Capital dealing rules, isolated $10k accounts | establish out-of-sample evidence and execution robustness |
| Capital demo | actual orders and deal-linked cashflows on Arena accounts, 0.2× size | measure realized execution and rank actual results |

Every agent × instrument × leverage has a record. Existing Capital assignments form a calibration cohort;
new assignments need candidate evidence on the daily clock. Demotion reverses the stages and retains history.
A changed source file starts a new record. Standard monkey controls measure luck; correlated latency
comparisons do not count as independent hypotheses. See [`EXECUTION.md`](EXECUTION.md) for details and limits.
Internally a virtual run has the kind `demo` (it is part of every stored run id).

## Topology

```
 PC (this desktop; everything trader runs shares trader.slice, capped at 50% CPU/RAM)
 ───────────────────────────────────────────────────────────────────────────────────
 pc-server-trader-arena   Bun, API 127.0.0.1:4120
                          - REST 1m candles every minute (stored for history)
                          - WebSocket quotes: decisions, tick-built bars, fills; recorded to a spool
                          - every agent × instrument × leverage, $10k each; broker mirror (demo accounts)
                          - SQLite <runtime>/trader-arena/data/arena.db
 pc-server-trader-ui      SvelteKit :10003 (dashboard, native API)
 trader-forecaster        TimesFM 3 on the RTX 3060, 127.0.0.1:4130
 trader-inspector         read-only trade inspection, 127.0.0.1:4140
 PostgreSQL               candles (20 instruments, 1m from 2024-01; US100 from 2020-02) + compressed ticks
 trader-tick-archive.timer (1 min)   spool → PostgreSQL
 trader-lab.timer (03:30)            ingest → history → forecasts → backtests → night grid
 trader-watchdog.timer (10 min)      desktop notifications
        ▲
        └── shared gateway ← Hetzner: Caddy trader.veron3.space + Authelia (public edge only)
```

All services bind to 127.0.0.1 and talk over loopback. `<runtime>` is `TRADER_SERVER_ROOT` from
`ops/server/runtime.sh`. The PC must stay on: when it is off, nothing trades or records and the
dashboard is down. When the forecaster is paused or down, TimesFM agents get `ctx.forecast = null` and
do nothing new; backtests wait for the next nightly job.

## Code map (`apps/backend`)

| Path | What |
|---|---|
| `src/sdk/` | The agent contract: `defineAgent`, `ctx` types, streaming indicators (`ta.ts`), `localTime`. The only thing agents import. |
| `src/engine/` | Simulation shared by backtest and demo: `BarSeries` (1m → any timeframe, owns the indicator cache), `AgentRun` (account, sizing, stops, trailing stops, funding, margin call, session close), `MarketEngine` (one instrument, many runs), metrics, agent loader, instrument registry. |
| `src/capital/` | Capital.com REST client. **Demo URL only** — no live endpoint exists in the code. |
| `src/lab/` | Lab tools: `ingest`, `backtest` (worker pool), `check-agent`, `forecasts` (precompute), `push-history`, `sync-ticks`, `storage`, `review`, `twins`, `watchdog`, audits, benchmarks, `night-study/`. |
| `src/arena/` | The arena service: live loop, SQLite store, HTTP API, broker mirror, forecast client, tick spool, twins, evidence, the daily clock records are judged on. |
| `src/inspection/` | The read-only trade inspector (`trader-inspector`). |
| `src/strategy/` | Version-pinned strategy explanations for entries ([README](src/strategy/README.md)). |
| `agents/` | One file per agent (+ `GUIDE.md`, `_template.ts`). |
| `apps/forecaster/` | Python TimesFM 3 HTTP service. |
| `apps/ui/` | SvelteKit dashboard. |
| `packages/shared/` | API wire types used by the arena API and the dashboard. |
| `ops/` | systemd units, lab installer, nightly job, arena deploy script. |

## Simulation model (shared tick engine)

- Live, recorded and synthetic bid/ask ticks drive the same execution and agent callbacks. Orders
  queue and require a later usable quote after their delay. Risk and trailing protections follow the
  tick sequence; no candle stop-before-target guess is used in the default backtest.
- `onTick` can decide on every quote; optional `onBar` keeps closed-bar strategies' intended cadence.
  UTC bars aggregate observed ticks. Minute OHLC generates a deterministic lazy fallback when recorded
  history is absent. Synthetic paths/spreads/cadence remain assumptions, exposed in every result
  ([`TICKS.md`](TICKS.md)). Records keep the engine version they ran under (`src/engine/version.ts`).
- Every run has an **account leverage** (1:1 … 1:200; crypto and shares at most
  1:20; `src/engine/leverage.ts`): margin = notional ÷ leverage.
- Sizing precedence: `size` → `exposure` → `marginPct` (share of equity as margin,
  × leverage) → risk-to-stop (`riskPct`, default 1%) → 1× exposure; capped at 90%
  of equity as margin (0.9 × equity × leverage of notional); rounded to the
  instrument step.
- Margin call at equity < 50% of margin (Capital.com close-out); account floors at
  $0 (negative-balance protection) and the run is `busted`.
- Overnight funding at each 17:00 New York rollover using Capital.com's current
  rates (indices long ≈ −8%/yr); weekends count three nights. None at 1:1
  except on natural gas (Capital.com waives it on 1:1 positions on most markets;
  verified on Arena 01's transactions).
- `intradayOnly` agents are flattened 5 minutes before 17:00 New York.
- Indicators are computed once per bar per (instrument, timeframe) and shared.
  Series keep 5,000–10,000 bars; recursive indicators re-converge after trimming.
- Determinism: `ctx.random()` is seeded per run id; two backtests are identical
  (`check-agent` verifies this).

## Demo specifics

- REST minute candles are polled every minute into the arena's candle store (history and warm-up).
  Forward agents use bars built from the quote stream; a late REST candle cannot rewrite an already
  observed live path. Tick-built bars and per-run tick watermarks preserve that path across restarts.
- On start the arena backfills 120 days of candles, replays them so new agents
  warm up (orders disabled), and restores existing runs from their snapshot,
  catching up on candles they missed while the service was down.
- Daily series start earlier: before the replay, every 1d series is seeded with
  the lab's daily bars from 2024-01 up to the 120-day window (built from the
  lab's 1-minute history the same way, pushed nightly by `push-history`), so
  200-day and 12-month lookbacks are ready on the first live day.
- Runs a quote can change (open position, order in flight, tick callback) are saved every minute;
  idle flat runs every 10 minutes and hourly. Hourly equity points are thinned to daily after 30 days.

## Broker mirror

Demo runs are copied as real orders onto Capital.com **demo** accounts
(`src/arena/broker.ts`, `src/arena/slots.ts`). The virtual and Capital demo leaderboards are separate; the
mirror measures execution drift (real vs paper fills, rejections, broker-side
closes).

- **Accounts:** every demo account whose name starts with
  `BROKER_ACCOUNT_PREFIX` (default `Arena`, case-insensitive), discovered
  within a minute and tracked by accountId. Other accounts (Visi is the user's)
  are never touched. Capital.com allows 10 demo accounts per login, so the
  arena has 9: "Arena 01" … "Arena 09".
- **Leverage:** `agents/roster.json` gives each account a tier (Arena 01 = 1:1 …
  Arena 09 = 1:200). The mirror sets the account's leverage per asset class to
  match (`PUT /accounts/preferences`, re-checked on every reconcile; a position
  keeps the leverage it was opened with) and mirrors only runs of that tier there,
  so every demo deal has its paper run's leverage. An account without a tier, or
  whose leverage could not be set, gets no runs.
- **Capacity:** a new account is topped up once to the $100,000 demo maximum
  (the cap counts total deposits, so the top-up is sized from the higher of
  balance and deposits; retried daily if refused) and switched to **hedging
  mode**, so it holds many runs on the same instrument, each as its own deal.
  Every mirrored order is **0.2 × the paper size**, and each run reserves
  $2,000 of an account: 50 runs per account, 450 across the nine. At 0.2,
  0.7% of backtest trades fall below an
  instrument's minimum size and 0.9% round by more than 10% (mostly crypto).
  An account that cannot be switched to hedging holds one run per instrument.
- **Assignment:** every live run is mirrored on an account of its tier while
  capacity lasts, candidates on the daily clock first, spread over the accounts with the most
  free slots; assignments are sticky. When a tier is full, a waiting run takes the slot of
  the weakest mirrored run of that tier once its daily t-statistic is higher by 0.25 and
  the weaker run is flat (`PROMOTION_MARGIN`, `src/arena/slots.ts`). Runs can be excluded
  by hand. A run never has more than one open deal.
- **Renames:** deals are re-attached by deal id if an account is renamed;
  renaming an account away from the prefix closes the arena's deals there and
  stops using it.
- **Requests:** one Capital session per demo account, so no account switching;
  each account has its own job queue, orders before reconciliation. All sessions and the candle
  poller share a ~6 req/s pacer in which orders take the next free slot, then
  confirmations and protection updates, then everything else. Each new position
  is checked against its order by the account's next reconciliation (one list of
  all positions, within about a minute), not by a request per order, so a
  burst carries orders and confirmations only. Capital answers an
  order in ~0.12 s (p50; 0.6 s p95). Backtest trade logs put the load at 3 orders in a typical active
  minute, 34 at the 99th percentile and ~108 at the worst top-of-hour minute; a
  burst that large still needs seconds at Capital's 10 req/s, which is the
  mirror's queue only: paper orders never wait for it.
- **Rails:** a run opening ≥12 times in an hour is excluded; ≤600 opens/hour in
  total (demo limit 1,000/hour); per-account kill switch below 50% of its
  allocation (two consecutive readings); hedging mode re-checked on every
  reconcile; positions the arena did not open are left alone; opens replayed
  from history after a restart are not mirrored; a deal whose paper position
  is gone is closed; broker-side stop/target copies protect deals if the arena
  is down; lost order confirmations are adopted from `/positions` on the next
  reconcile; an open the broker rejects is retried up to 4 times, 5 minutes
  apart, while the paper position lasts (the first a second later when Capital
  gave no reason; one refused because the market is
  closed waits until `GET /markets/{epic}` says it trades again, without using
  up the retries), and a close, refused or rejected, is retried every minute
  until it goes through.

Toggle the mirror and exclude runs on the dashboard's Broker page.

## Lifecycle

Agents move Backtest → Virtual engine → Capital demo, with reverse demotion ([`agents/LIFECYCLE.md`](agents/LIFECYCLE.md)).
Verdicts (early, keep, candidate, confirmed, retire) come from `packages/shared/src/lifecycle.ts`, read off each
record's daily clock (`src/arena/judging.ts`, [`EVIDENCE.md`](EVIDENCE.md)) and used by the dashboard's Stage column,
the native screens and `bun run review`. The arena portfolio, every record picked by its backtest and judged as
one record, is picked once a month by `src/arena/portfolio.ts` from the rule in `roster.json`; its picks are stored in the
arena database.
`agents/roster.json` (read by the arena and the lab;
`src/engine/roster.ts`) holds what is decided without touching agent code: each account's leverage,
each agent's leverage tiers, and retired single runs. A run is agent × instrument × leverage (its id
includes all three and the code hash). Whole agents are retired by moving them to `agents/_retired/`.
Claude applies the policy on scheduled babysitter visits and records them in
[`agents/JOURNAL.md`](agents/JOURNAL.md), shown on the dashboard's Journal page. Between visits the
watchdog (`src/lab/watchdog.ts`) notifies the desktop when the platform needs attention.

## Operations

| Task | Command |
|---|---|
| New agent | write `agents/x.ts`, `bun run check-agent agents/x.ts`, `bun run backtest x`, commit, `ops/server/deploy-arena.sh` |
| Deploy arena | `ops/server/deploy-arena.sh` (needs committed changes; runs typecheck + tests; restarts; runs resume) |
| Deploy dashboard | push `main`; the veron3 watcher builds `apps/ui` and restarts `pc-server-trader-ui` |
| Lab services | `ops/lab/install.sh`; logs: `journalctl --user -u trader-forecaster -u trader-lab -u trader-tick-archive` |
| Arena logs | `journalctl --user -u pc-server-trader-arena -f`; events also on the Status page |
| Refresh candles | `bun run ingest` (gap-fills all instruments, resumable) |
| Forecasts for new agents | `bun run forecasts` (GPU, ~2 min per instrument for 1h bars) |
| Heavy jobs by hand | prefix with `systemd-run --user --slice=trader.slice --wait --pipe -p WorkingDirectory=$PWD -E PATH=$PATH` to stay within the 50% cap |

Secrets live only in `.env` files (never committed): `apps/backend/.env` for the lab
(Capital.com login, `ARENA_TOKEN`, the shared server's `TRADER_SERVER_SSH`/`TRADER_SERVER_HOME`),
`<runtime>/trader-arena/.env` and `<runtime>/trader-ui/.env` for the services.

## Known limitations

- History: the stored shared minute dataset begins in 2024-01 (US100 also has minutes from 2020-02).
  Read-only US500 API probes (2026-10-15) returned no minute bars before 2024; older hourly (2023) and daily (2015)
  quotes were available. The common leaderboard window is 2024-01 → 2026-09. Older coarse candles cannot
  reproduce minute-specific entries or overnight stops; a longer exact US500 test needs another verified
  source of overnight minute bid/ask data, with the broker/source differences disclosed.
- Spreads before ingest enrichment fall back to a typical spread per instrument.
- One position per agent per instrument; no pyramiding, no limit orders.
- Demo results need weeks and ~30+ trades per row before they say much; slow
  (4h/1d) agents need months.
- TimesFM forecasts are precomputed for backtests only for the (instrument,
  timeframe, context) combinations agents declare; precompute is ~140 series/s.
