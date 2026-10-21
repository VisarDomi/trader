# Trader — setup

A platform for collecting many trading agents, running each one forward on live
Capital.com prices, and ranking them through **Backtest → Virtual engine → Capital demo**.
New runs pass a current-code backtest, then build a forward virtual record before competing for
Capital demo slots. Actual demo cashflows are ranked separately. Dashboard: <https://trader.veron3.space> (Authelia login).

Start here. Before changing arena architecture or account behavior, read the
[project intent and settled decisions](apps/backend/PROJECT-CONTEXT.md), reconciled against the full
conversation. Then read only what your task needs:

| Task | Read |
|---|---|
| Write or change a trading agent | [`apps/backend/agents/GUIDE.md`](apps/backend/agents/GUIDE.md) |
| Look after the arena: retire, add agents (babysitter visits) | [`apps/backend/agents/LIFECYCLE.md`](apps/backend/agents/LIFECYCLE.md), then [`JOURNAL.md`](apps/backend/agents/JOURNAL.md) |
| Engine, arena, lab tools, broker mirror | [`apps/backend/setup.md`](apps/backend/setup.md) |
| Dashboard | [`apps/ui/setup.md`](apps/ui/setup.md) |
| Research library (ideas, papers, notes) | [`research/README.md`](research/README.md) |
| TimesFM forecaster (GPU) | [`apps/forecaster/setup.md`](apps/forecaster/setup.md) |
| Services, deploys, logs | [Operations](#operations) below |

## Hard rules

- **Demo only.** The Capital.com client has only the demo URL. Never add a live endpoint.
- **The repo is public.** Secrets live only in `.env` files (see [Secrets](#secrets)); never commit them,
  never paste them into docs or logs.
- **Keep one permanent copy of captured ticks**, losslessly compressed in PostgreSQL; the user set a
  100 GB whole-project storage budget for at least two years. The server is a bounded transfer spool,
  pruned only after the canonical archive is read back and verified. Synthetic paths are never stored
  as recorded history. Do not assume Capital can replace deleted history: that unverified assumption
  led to the premature October 7 deletion. Do not create extra long-term tick backups.
- **This PC** (the "lab") may use at most 50% of its CPU/RAM: run heavy jobs inside `trader.slice`
  (the lab services already do).
- **Shared infrastructure:** after the October 16 migration, trader runs on this PC under
  `~/.local/share/hetzner-pc/mirror/home/erdal/{trader-arena,trader-ui}` with user units
  `pc-server-trader-arena` and `pc-server-trader-ui`. Both belong in `trader.slice` with the lab.
  Hetzner now hosts the public edge only. Touch only trader's runtimes, units, Caddy block and
  Authelia rule; never restart the retired Hetzner app against stale data.
- **The Capital.com login is shared** with other apps (position-opener). Of its 10 demo accounts (the
  maximum), "Arena 01" … "Arena 09" belong to the arena and **Visi is the user's**: the arena trades
  only on accounts whose name starts with "Arena". Each Arena account has one leverage (1:1 … 1:200),
  set by the arena from `apps/backend/agents/roster.json`; change it there, not in Capital.com. The
  login's limits apply to everything on it: 10 requests/s, 1 login/s, 1,000 demo opens/hour.

## Who does what

- **Coding agents own the repository and the running process:** every file (`AGENTS.md`, `README.md` and
  `test.txt` included), the agents, deploys, the lifecycle and its rules. Decide, act and record why in
  the journal or `apps/backend/DECISIONS.md`; do not wait for approval.
- **The user guides the project** (direction, priorities) and gives **physical help**: Capital.com
  accounts and credentials, hardware, anything only a person can do. Contact them only for that, by
  desktop notification (see the runbook in `apps/backend/agents/LIFECYCLE.md`).

## Where things run

```
 PC (all trader workloads share trader.slice, ≤50% CPU/RAM)
 ──────────────────────────────────────────────────────────
 PostgreSQL "trader": candles + one compressed tick archive
 trader-forecaster: GPU :4130   pc-server-trader-arena: Bun :4120
 trader-lab.timer: 03:30        pc-server-trader-ui: SvelteKit :10003
 trader-tick-archive.timer: one minute
       ▲
       └── shared gateway/tunnel ← Hetzner Caddy + Authelia ← public browser
```

The PC must remain on, awake and connected for trading, recording and the dashboard to work.
The public edge remains on Hetzner. The old `trader-tunnel` is deliberately disabled; arena and
forecaster now communicate directly over loopback. Migration operations:
`/home/visar/Documents/environment/services/hetzner-pc/README.md`.
Architecture in depth: [`apps/backend/ARCHITECTURE.md`](apps/backend/ARCHITECTURE.md).

## Repo layout

| Path | What |
|---|---|
| `apps/backend/` | Bun/TypeScript: agent SDK, simulation engine, lab tools, arena service, agents |
| `apps/ui/` | SvelteKit dashboard |
| `apps/forecaster/` | Python TimesFM 3 HTTP service |
| `packages/shared/` | API wire types shared by the arena and the dashboard |
| `research/` | research report, topic notes and sources (saved copies in `research/files/`, not in git) |
| `ops/lab/` | Lab PC systemd user units, installer, nightly job |
| `ops/server/` | Arena systemd unit and deploy script |

## Operations

| Task | How |
|---|---|
| Deploy the arena | commit, then `ops/server/deploy-arena.sh` (typechecks, tests, uploads, restarts; runs resume) |
| Deploy the dashboard | push `main`; the veron3 deploy watcher builds `apps/ui` and restarts `trader-ui` |
| Publish research files | `ops/server/sync-research.sh` (papers and snapshots to the server's Research tab) |
| Install/refresh lab services | `ops/lab/install.sh` |
| Lab logs | `journalctl --user -u trader-forecaster -u trader-tunnel -u trader-lab` |
| Arena logs | `journalctl --user -u pc-server-trader-arena -f`; events also on the dashboard Status page |
| Run the nightly job now | `systemctl --user start trader-lab.service` |
| Free heavy CPU/RAM/GPU work / resume it | `heavy-resources-stop` / `heavy-resources-start`: video pipeline, TimesFM and nightly lab work. Trading, tick capture/archive and dashboard stay running. The hold survives reboot until explicitly resumed. |
| Lifecycle review (health, verdicts, what to retire) | `cd apps/backend && bun run review` |
| Watchdog (every 10 min, desktop notifications) | `ops/lab/trader-watchdog.timer`; state in `apps/backend/data/watchdog.json`; `bun run watchdog --dry-run` |
| Babysitter visits | T3 Code scheduled task "Trader babysitter", Mondays and Thursdays 09:30 Europe/Tirane, posting into the "Trading Agent Platform" thread; it follows `apps/backend/agents/LIFECYCLE.md`. Recreated October 19 with the thread's Codex provider after its former provider was disabled. |
| Heavy job by hand | `systemd-run --user --slice=trader.slice --wait --pipe -p WorkingDirectory=$PWD -E PATH=$PATH <command>` |

An existing `~/.local/share/heavy-resources/user-pause.json` is an explicit user hold. Respect it:
do not restart TimesFM, run heavy manual lab jobs, or clear the marker during maintenance. Its systemd
conditions prevent model/lab starts, and the watchdog suppresses the expected model/lab outage alarms.
The commands live in `~/Documents/environment/shell/heavy_resources.py`.

## Secrets

| File | Holds |
|---|---|
| `apps/backend/.env` (lab) | Capital.com demo login, PostgreSQL, `ARENA_URL`/`ARENA_TOKEN`, `FORECASTER_URL` — template: `apps/backend/.env.template` |
| `apps/ui/.env` (lab, for `vite dev`) | `ARENA_URL`, `ARENA_TOKEN` |
| `~/.local/share/hetzner-pc/mirror/home/erdal/trader-arena/.env` (PC runtime, mode 600) | Capital.com demo login, `ARENA_TOKEN`, arena settings (see `apps/backend/src/arena/main.ts`) |
| `~/.local/share/hetzner-pc/mirror/home/erdal/trader-ui/.env` (PC runtime) | `PORT`, `HOST`, `ORIGIN`, `ARENA_URL`, `ARENA_TOKEN` |

## Fresh install (lab PC)

1. `npm install` at the repo root (npm workspaces: backend, ui, shared).
2. PostgreSQL database `trader` with a user that owns it; copy `apps/backend/.env.template` to
   `apps/backend/.env` and fill it in.
3. `cd apps/backend && bun run ingest` — creates the `candles` table and downloads ~2.75 years of
   1-minute candles for every instrument (hours; resumable).
4. Forecaster: `cd apps/forecaster && uv sync` (needs an NVIDIA GPU; see its setup.md).
5. `ops/lab/install.sh` — forecaster, SSH tunnel, nightly timer.
6. `bun run backtest` (inside `trader.slice`) to fill the backtest leaderboard.
