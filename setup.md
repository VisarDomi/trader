# Trader — setup

A platform for collecting many trading agents, running each one forward on live
Capital.com **demo** prices, and ranking them. The demo leaderboard is the one
that matters; the backtest leaderboard is there to show how much an agent was
overfit. Dashboard: <https://trader.veron3.space> (Authelia login).

Start here, then read only what your task needs:

| Task | Read |
|---|---|
| Write or change a trading agent | [`apps/backend/agents/GUIDE.md`](apps/backend/agents/GUIDE.md) |
| Look after the arena: retire, add agents (babysitter visits) | [`apps/backend/agents/LIFECYCLE.md`](apps/backend/agents/LIFECYCLE.md), then [`JOURNAL.md`](apps/backend/agents/JOURNAL.md) |
| Engine, arena, lab tools, broker mirror | [`apps/backend/setup.md`](apps/backend/setup.md) |
| Dashboard | [`apps/ui/setup.md`](apps/ui/setup.md) |
| TimesFM forecaster (GPU) | [`apps/forecaster/setup.md`](apps/forecaster/setup.md) |
| Services, deploys, logs | [Operations](#operations) below |

## Hard rules

- **Demo only.** The Capital.com client has only the demo URL. Never add a live endpoint.
- **The repo is public.** Secrets live only in `.env` files (see [Secrets](#secrets)); never commit them,
  never paste them into docs or logs.
- **This PC** (the "lab") may use at most 50% of its CPU/RAM: run heavy jobs inside `trader.slice`
  (the lab services already do).
- **Hetzner is shared.** Touch only what the trader needs: `trader-arena` and `trader-ui` services,
  `/home/erdal/trader-arena`, `/home/erdal/trader-ui`, the `trader.veron3.space` Caddy block and its
  Authelia rule.
- **The Capital.com login is shared** with other apps (position-opener). Of its 10 demo accounts (the
  maximum), "Arena 01" … "Arena 09" belong to the arena and **Visi is the user's**: the arena trades
  only on accounts whose name starts with "Arena". Each Arena account has one leverage (1:1 … 1:200),
  set by the arena from `apps/backend/agents/roster.json`; change it there, not in Capital.com. The
  login's limits apply to everything on it: 10 requests/s, 1 login/s, 1,000 demo opens/hour.
- `AGENTS.md`, `readme.md` and `test.txt` files are edited only by the user.

## Where things run

```
 Lab PC (this desktop, ≤50% CPU/RAM)                     Hetzner 157.90.28.14 (shared)
 ───────────────────────────────────────────            ──────────────────────────────────────────
 PostgreSQL "trader": 1-minute candles                  trader-arena.service  Bun, 127.0.0.1:4120
 trader-forecaster  TimesFM 3 on the GPU :4130 ◄─┐        live demo runs, broker mirror, SQLite
 trader-tunnel      autossh -R 4130 -L 4120 ─────┼─────►  trader-ui.service     SvelteKit :10003
 trader-lab.timer   03:30 ingest → forecasts →   │        Caddy trader.veron3.space + Authelia
                    backtests → push to arena ───┘
```

If the PC is off, the arena keeps trading; forecast agents pause and backtests wait for the next night.
Architecture in depth: [`apps/backend/ARCHITECTURE.md`](apps/backend/ARCHITECTURE.md).

## Repo layout

| Path | What |
|---|---|
| `apps/backend/` | Bun/TypeScript: agent SDK, simulation engine, lab tools, arena service, agents |
| `apps/ui/` | SvelteKit dashboard |
| `apps/forecaster/` | Python TimesFM 3 HTTP service |
| `packages/shared/` | API wire types shared by the arena and the dashboard |
| `ops/lab/` | Lab PC systemd user units, installer, nightly job |
| `ops/server/` | Arena systemd unit and deploy script |

## Operations

| Task | How |
|---|---|
| Deploy the arena | commit, then `ops/server/deploy-arena.sh` (typechecks, tests, uploads, restarts; runs resume) |
| Deploy the dashboard | push `main`; the veron3 deploy watcher builds `apps/ui` and restarts `trader-ui` |
| Install/refresh lab services | `ops/lab/install.sh` |
| Lab logs | `journalctl --user -u trader-forecaster -u trader-tunnel -u trader-lab` |
| Arena logs | `ssh erdal@157.90.28.14 sudo journalctl -u trader-arena -f`; events also on the dashboard Status page |
| Run the nightly job now | `systemctl --user start trader-lab.service` |
| Lifecycle review (health, verdicts, what to retire) | `cd apps/backend && bun run review` |
| Watchdog (every 10 min, desktop notifications) | `ops/lab/trader-watchdog.timer`; state in `apps/backend/data/watchdog.json`; `bun run watchdog --dry-run` |
| Babysitter visits | T3 Code scheduled task "Trader babysitter", Mondays and Thursdays 09:30, posting into the "Build Trading Agent Platform" thread; it follows `apps/backend/agents/LIFECYCLE.md` |
| Heavy job by hand | `systemd-run --user --slice=trader.slice --wait --pipe -p WorkingDirectory=$PWD -E PATH=$PATH <command>` |

## Secrets

| File | Holds |
|---|---|
| `apps/backend/.env` (lab) | Capital.com demo login, PostgreSQL, `ARENA_URL`/`ARENA_TOKEN`, `FORECASTER_URL` — template: `apps/backend/.env.template` |
| `apps/ui/.env` (lab, for `vite dev`) | `ARENA_URL`, `ARENA_TOKEN` |
| `/home/erdal/trader-arena/.env` (server, mode 600) | Capital.com demo login, `ARENA_TOKEN`, arena settings (see `apps/backend/src/arena/main.ts`) |
| `/home/erdal/trader-ui/.env` (server) | `PORT`, `HOST`, `ORIGIN`, `ARENA_URL`, `ARENA_TOKEN` |

## Fresh install (lab PC)

1. `npm install` at the repo root (npm workspaces: backend, ui, shared).
2. PostgreSQL database `trader` with a user that owns it; copy `apps/backend/.env.template` to
   `apps/backend/.env` and fill it in.
3. `cd apps/backend && bun run ingest` — creates the `candles` table and downloads ~2.75 years of
   1-minute candles for every instrument (hours; resumable).
4. Forecaster: `cd apps/forecaster && uv sync` (needs an NVIDIA GPU; see its setup.md).
5. `ops/lab/install.sh` — forecaster, SSH tunnel, nightly timer.
6. `bun run backtest` (inside `trader.slice`) to fill the backtest leaderboard.
