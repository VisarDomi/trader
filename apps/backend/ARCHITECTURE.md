# Trader platform — architecture (v2, 2026-10)

A place to collect many trading agents, run them forward on live demo prices,
and rank them. The **demo** leaderboard is the one that matters; the
**backtest** leaderboard is there to show how much each agent was overfit.

- Writing an agent: [`agents/GUIDE.md`](agents/GUIDE.md) (one file, no other changes).
- Dashboard: <https://trader.veron3.space> (Authelia login).
- v1 (blueprints, `AgentRunner`, tick recorder) is described in `DESIGN.md` / `VALIDATION.md`;
  its code was removed in October 2026 and lives in git history.

## Why two leaderboards

Anything can be fitted to history: one of the three random coin-flip "monkey"
agents ranks near the top of the 2024–2026 backtest. Live prices that arrive
after an agent's code was frozen cannot be fitted, so:

| | Backtest | Demo |
|---|---|---|
| Data | 1-minute candles 2024-01 → 2026-09, all instruments | live Capital.com demo prices from deployment onwards |
| Capital | $10,000 per agent × instrument | same |
| Costs | historical per-minute spread, overnight funding, margin | same model on live quotes |
| Purpose | context; reveals overfitting by comparison | the ranking |

Every agent × instrument is a separate row. Two **control agents** anchor the
scale: `random-baseline` (three monkeys: what luck looks like) and `buy-hold`
(the passive benchmark, funding included). The dashboard shows the monkeys'
range as a "luck band", and an Overfit view plots backtest vs demo Sharpe.

A track record belongs to one exact version of an agent: the loader hashes the
agent's source, and a changed file retires the old demo run and starts a new one.

## Topology

```
 Lab PC (this desktop, capped at 50% CPU/RAM by trader.slice)         Hetzner (shared server)
 ──────────────────────────────────────────────────────────          ─────────────────────────────────────
 PostgreSQL  candles (12 instruments, 1m since 2024-01;              trader-arena.service  (Bun, ≤700 MB)
             US100 since 2020)                                         - REST 1m candles every minute
 trader-forecaster.service   TimesFM 3 on the RTX 3060 :4130  ◄─┐      - WebSocket quotes (stops, fills)
 trader-tunnel.service       autossh  -R 4130  -L 4120  ─────────┼──►  - every agent × instrument, $10k each
 trader-lab.timer (03:30)    ingest → forecasts → backtest ─push─┘      - Gerti broker mirror
 bun run backtest / check-agent / forecasts (by hand)                  - SQLite data/arena.db, API :4120
                                                                     trader-ui.service (SvelteKit :10003)
                                                                     Caddy trader.veron3.space + Authelia
```

Ports are bound to 127.0.0.1 on both machines; the SSH tunnel is the only link.
If the PC is off, the arena keeps running; TimesFM agents get `ctx.forecast = null`
and do nothing new, and backtests wait for the next nightly job.

## Code map (`apps/backend`)

| Path | What |
|---|---|
| `src/sdk/` | The agent contract: `defineAgent`, `ctx` types, streaming indicators (`ta.ts`), `localTime`. The only thing agents import. |
| `src/engine/` | Simulation shared by backtest and demo: `BarSeries` (1m → any timeframe, owns the indicator cache), `AgentRun` (account, sizing, stops, trailing stops, funding, margin call, session close), `MarketEngine` (one instrument, many runs), metrics, agent loader, instrument registry. |
| `src/capital/` | Capital.com REST client. **Demo URL only** — no live endpoint exists in the code. |
| `src/lab/` | PC-side tools: `ingest`, `backtest` (worker pool), `check-agent`, `forecasts` (precompute), `seed-arena`. |
| `src/arena/` | Server-side service: live loop, SQLite store, HTTP API, broker mirror, forecast client. |
| `agents/` | One file per agent (+ `GUIDE.md`, `_template.ts`). |
| `apps/forecaster/` | Python TimesFM 3 HTTP service. |
| `apps/ui/` | SvelteKit dashboard. |
| `packages/shared/` | API wire types used by the arena API and the dashboard. |
| `ops/` | systemd units, lab installer, nightly job, arena deploy script. |

## Simulation model (identical in backtest and demo)

- Candles are **bid-side** 1-minute OHLC with the spread at the close. Bars of
  any timeframe are built by `BarSeries`, UTC-aligned, closing on the bucket's last minute.
- An agent sees a bar only after it closed. Orders fill **immediately**: buy at
  ask (bid + spread), sell at bid. In demo the fill uses the live WebSocket quote.
- Stops: checked per minute in backtests (gap → fill at the open; stop beats
  take-profit inside one minute) and per tick in demo. Only minutes that started
  after the entry can trigger.
- Sizing precedence: `size` → `exposure` → risk-to-stop (`riskPct`, default 1%) →
  1× exposure; capped at 90% of equity as margin; rounded to the instrument step.
- Margin call at equity < 50% of margin (Capital.com close-out); account floors at
  $0 (negative-balance protection) and the run is `busted`.
- Overnight funding at each 17:00 New York rollover using Capital.com's current
  rates (indices long ≈ −8%/yr); weekends count three nights.
- `intradayOnly` agents are flattened 5 minutes before 17:00 New York.
- Indicators are computed once per bar per (instrument, timeframe) and shared.
  Series keep 5,000–10,000 bars; recursive indicators re-converge after trimming.
- Determinism: `ctx.random()` is seeded per run id; two backtests are identical
  (`check-agent` verifies this).

## Demo specifics

- 1-minute candles are polled from REST at :10 past every minute — the same
  source as the backtest history — so a missed minute heals on the next poll.
- On start the arena backfills 120 days of candles, replays them so new agents
  warm up (orders disabled), and restores existing runs from their snapshot,
  catching up on candles they missed while the service was down.
- Runs are persisted every minute; hourly equity points (thinned to daily after 30 days).

## Broker mirror (Gerti)

Selected demo runs are copied as real orders onto the Capital.com **demo**
sub-account "Gerti", scaled to `BROKER_ALLOCATION` ($1,000) split across the
mirrored runs. It measures execution drift (real vs paper fills). Rails: one
mirrored run per instrument (the account nets), ≤20 orders/minute, a run placing
≥12 orders in an hour is dropped, kill switch below 50% of the allocation (two
consecutive readings), positions the arena did not open are never touched,
broker-side stop/target copies protect deals if the arena is down, and lost
order confirmations are adopted from `/positions` on the next reconcile.
Choose runs and toggle the mirror on the dashboard's Gerti page.

## Operations

| Task | Command |
|---|---|
| New agent | write `agents/x.ts`, `bun run check-agent agents/x.ts`, `bun run backtest x`, commit, `ops/server/deploy-arena.sh` |
| Deploy arena | `ops/server/deploy-arena.sh` (needs committed changes; runs typecheck + tests; restarts; runs resume) |
| Deploy dashboard | push `main`; the veron3 watcher builds `apps/ui` and restarts `trader-ui` |
| Lab services | `ops/lab/install.sh`; logs: `journalctl --user -u trader-forecaster -u trader-tunnel -u trader-lab` |
| Arena logs | `ssh erdal@157.90.28.14 sudo journalctl -u trader-arena -f`; events also on the Status page |
| Refresh candles | `bun run ingest` (gap-fills all instruments, resumable) |
| Forecasts for new agents | `bun run forecasts` (GPU, ~2 min per instrument for 1h bars) |
| Heavy jobs by hand | prefix with `systemd-run --user --slice=trader.slice --wait --pipe -p WorkingDirectory=$PWD -E PATH=$PATH` to stay within the 50% cap |

Secrets live only in `.env` files (never committed): `apps/backend/.env` on the
PC (Capital.com login, `ARENA_TOKEN`), `/home/erdal/trader-arena/.env` and
`/home/erdal/trader-ui/.env` on the server.

## Known limitations

- History: Capital.com serves minute candles only from 2024-01 (US100 has
  2020+ from an older ingest). The backtest window is therefore ~2.75 years.
- Spreads before ingest enrichment fall back to a typical spread per instrument.
- One position per agent per instrument; no pyramiding, no limit orders.
- Demo results need weeks and ~30+ trades per row before they say much; slow
  (4h/1d) agents need months.
- TimesFM forecasts are precomputed for backtests only for the (instrument,
  timeframe, context) combinations agents declare; precompute is ~140 series/s.
