# Trader — setup

A platform for collecting many trading agents, running each one forward on live
Capital.com prices, and ranking them through **Backtest → Virtual engine → Capital demo → Real USD**.
New runs pass a current-code backtest, then build a forward virtual record. Runs are moved onto Capital
demo slots by hand, and one run at a time can be moved on to a real USD account, with a confirmation.
Actual demo cashflows are ranked separately. Dashboard: <https://trader.veron3.space> (Authelia login).

Start here. Before changing arena architecture or account behavior, read the
[project intent and settled decisions](apps/backend/PROJECT-CONTEXT.md), reconciled against the full
conversation. Then read only what your task needs:

| Task | Read |
|---|---|
| Write or change a trading agent | [`apps/backend/agents/GUIDE.md`](apps/backend/agents/GUIDE.md) |
| Look after the arena: retire, add agents (babysitter visits) | [`apps/backend/agents/LIFECYCLE.md`](apps/backend/agents/LIFECYCLE.md), then [`JOURNAL.md`](apps/backend/agents/JOURNAL.md) |
| Engine, arena, lab tools, broker mirror | [`apps/backend/setup.md`](apps/backend/setup.md) |
| Dashboard | [`apps/ui/setup.md`](apps/ui/setup.md) |
| Native iPhone app | [`apps/ios/README.md`](apps/ios/README.md) — UIKit client, secure device pairing, Mac build/install and monthly renewal |
| Research library (ideas, papers, notes) | [`research/README.md`](research/README.md) |
| TimesFM forecaster (GPU) | [`apps/forecaster/setup.md`](apps/forecaster/setup.md) |
| Services, deploys, logs | [Operations](#operations) below |

## Hard rules

- **Real money only through `trader-real` on Hetzner.** The Capital.com client defaults to the demo URL;
  only `CapitalClient.forLiveRealAccount()` builds a live client, and only `src/real/main.ts` (the
  `trader-real` service) calls it. The PC arena and the lab never reach a live account. The service is
  locked to one USD account and one run at a time ([Real account](apps/backend/ARCHITECTURE.md#real-account)).
- **The repo is public.** Secrets live only in `.env` files (see [Secrets](#secrets)); never commit them,
  never paste them into docs or logs.
- **Keep one permanent copy of captured ticks**, losslessly compressed in PostgreSQL; the user set a
  100 GB whole-project storage budget for at least two years. The arena's tick spool is a bounded
  transfer buffer, pruned only after the canonical archive is read back and verified. Synthetic paths are
  never stored as recorded history. Do not assume Capital can replace deleted history: probes of
  Capital's API found no US500 minute bars before 2024 and it offers no tick history (the journal's
  2026-10-16 context entry records the deletion behind this rule). Do not create extra long-term tick backups.
- **This PC** (the "lab") may use at most 50% of its CPU/RAM: run heavy jobs inside `trader.slice`
  (the lab services already do).
- **Shared infrastructure:** trader runs on this PC under `<runtime>/{trader-arena,trader-ui}` with
  user units `pc-server-trader-arena` and `pc-server-trader-ui`, both in `trader.slice` with the lab.
  `<runtime>` is `TRADER_SERVER_ROOT` from `ops/server/runtime.sh` (the PC mirror of the shared
  server's home, selected by `~/.local/share/hetzner-pc/ACTIVE`). Hetzner hosts the public edge and the
  separate real-money service `trader-real` (system unit, `<server home>/trader-real`).
  Touch only trader's runtimes, units, Caddy block and Authelia rule; never start the arena on Hetzner:
  its data there is stale.
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
 trader-inspector: read-only archive/chart worker :4140
 trader-tick-archive.timer: one minute   trader-watchdog.timer: 10 minutes
       ▲
       └── shared gateway/tunnel ← Hetzner Caddy + Authelia ← public browser

 Hetzner: trader-real (real-money service, one run, one USD account) :4125, ≤300 MB RAM, 50% CPU
```

The PC must remain on, awake and connected for trading, recording and the dashboard to work: when it
is off, nothing on the PC trades or records and the dashboard is down. On Hetzner are the public edge
(Caddy, Authelia) and `trader-real`, which keeps trading its one run when the PC is off.
Arena, forecaster, inspector and lab talk over loopback; `trader-tunnel.service` (the SSH
tunnel for an arena on Hetzner) stays disabled, and `ops/lab/install.sh` disables it. Shared PC-server
operations: `~/Documents/environment/services/hetzner-pc/README.md`.
Architecture in depth: [`apps/backend/ARCHITECTURE.md`](apps/backend/ARCHITECTURE.md).

## Repo layout

| Path | What |
|---|---|
| `apps/backend/` | Bun/TypeScript: agent SDK, simulation engine, lab tools, arena service, agents |
| `apps/ui/` | SvelteKit dashboard |
| `apps/ios/` | Native UIKit iPhone app, vendored NativeKit and reproducible build/delivery scripts |
| `apps/forecaster/` | Python TimesFM 3 HTTP service |
| `packages/shared/` | API wire types shared by the arena and the dashboard |
| `research/` | research report, topic notes and sources (saved copies in `research/files/`, not in git) |
| `ops/lab/` | Lab PC systemd user units, installer, nightly job |
| `ops/server/` | Arena and real-service deploy scripts, research sync, native-access tool, runtime discovery (`runtime.sh`); `trader-real.service` is the Hetzner real-money unit; `trader-arena.service` is the old Hetzner arena unit, unused while the PC runtime is active |

## Operations

| Task | How |
|---|---|
| Deploy the arena | commit, then `ops/server/deploy-arena.sh` (typechecks, tests, copies the committed tree to `<runtime>/trader-arena/app`, restarts the arena and inspector; runs resume) |
| Deploy the real service | commit, then `ops/server/deploy-real.sh` (typechecks, runs the real tests, ships the committed tree to Hetzner, restarts `trader-real` and waits for its health check) |
| Deploy the dashboard | push `main`; the veron3 deploy watcher builds `apps/ui` and restarts `pc-server-trader-ui` |
| Publish research files | `ops/server/sync-research.sh` (papers and snapshots to `<runtime>/trader-ui/research/files` for the Research tab) |
| Install/refresh lab services | `ops/lab/install.sh` |
| Lab logs | `journalctl --user -u trader-forecaster -u trader-lab -u trader-tick-archive` |
| Arena logs | `journalctl --user -u pc-server-trader-arena -f`; events also on the dashboard Status page |
| Run the nightly job now | `systemctl --user start trader-lab.service` |
| Night Lab report | `python3 ops/lab/build-night-lab.py` (inside trader.slice) writes the study once into `apps/backend/data/night-lab/night-lab.db` and publishes it to `<runtime>/trader-ui/night-lab/`; the nightly job republishes it if missing. The dashboard serves each page section from it; nothing data-sized is in `apps/ui/static` or the UI build. Details: `apps/ui/setup.md` → Night Lab. |
| Visar night paper grid | Last nightly step: `cd apps/backend && bun run night-grid` replays all 540 settings per index from 2026-10-01 into `data/night-grid/`, copied to `<runtime>/trader-ui/night-grid/` (Night Lab → Paper grid). Idle minutes carry only their open/high/low/close quotes; `--full` replays every quote for an audit. Paper only. |
| Free heavy CPU/RAM/GPU work / resume it | `heavy-resources-stop` / `heavy-resources-start`: video pipeline, TimesFM and nightly lab work. Trading, tick capture/archive and dashboard stay running. The hold survives reboot until explicitly resumed. |
| Lifecycle review (health, verdicts, what to retire) | `cd apps/backend && bun run review` |
| Watchdog (every 10 min, desktop notifications) | `ops/lab/trader-watchdog.timer`; state in `apps/backend/data/watchdog.json`; `bun run watchdog --dry-run` |
| Babysitter visits | T3 Code scheduled task "Trader", posting into the "Trading Agent Platform" thread with the thread's Codex provider; each visit follows `apps/backend/agents/LIFECYCLE.md`. The owner sets the schedule from the results: up to once a day when the last visit found bugs, down to once a week after a quiet period. |
| Heavy job by hand | `systemd-run --user --slice=trader.slice --wait --pipe -p WorkingDirectory=$PWD -E PATH=$PATH <command>` |

An existing `~/.local/share/heavy-resources/user-pause.json` is an explicit user hold. Respect it:
do not restart TimesFM, run heavy manual lab jobs, or clear the marker during maintenance. Its systemd
conditions prevent model/lab starts, and the watchdog suppresses the expected model/lab outage alarms.
The commands live in `~/Documents/environment/shell/heavy_resources.py`.
The marker's `services` list owns each hold: a user-requested model-only resume can remove
`trader-forecaster.service` while leaving lab/video entries intact. Use
`python3 ops/lab/forecaster-control.py resume` for that scoped action. Forecaster startup, dependency
evidence and health checks honour the service list; a later global stop reinstates every hold.
The nightly lab works the same way: `python3 ops/lab/lab-control.py resume` removes `trader-lab.timer`
and `trader-lab.service` from the list and starts the timer; each run checks `lab-control.py check`
(an `ExecCondition`), so the lab runs while other holds such as the video pipeline stay in place.

## Secrets

| File | Holds |
|---|---|
| `apps/backend/.env` (lab) | Capital.com demo login, PostgreSQL, `ARENA_URL`/`ARENA_TOKEN`, `FORECASTER_URL` — template: `apps/backend/.env.template` |
| `apps/ui/.env` (lab, for `vite dev`) | `ARENA_URL`, `ARENA_TOKEN` |
| `<runtime>/trader-arena/.env` (PC runtime, mode 600) | Capital.com demo login, `ARENA_TOKEN`, arena settings (see `apps/backend/src/arena/main.ts`) |
| `<runtime>/trader-ui/.env` (PC runtime) | `PORT`, `HOST`, `ORIGIN`, `ARENA_URL`, `ARENA_TOKEN` |
| `<server home>/trader-real/.env` (Hetzner, mode 600) | Capital.com live login, `CAPITAL_REAL_ACCOUNT_ID`, `REAL_TOKEN` (see `apps/backend/src/real/main.ts`) |

## Fresh install (lab PC)

1. `npm install` at the repo root (npm workspaces: backend, ui, shared).
2. PostgreSQL database `trader` with a user that owns it; copy `apps/backend/.env.template` to
   `apps/backend/.env` and fill it in.
3. `cd apps/backend && bun run ingest` — creates the `candles` table and downloads every instrument's
   1-minute candles from the earliest day Capital serves, 2024-01 in practice (hours; resumable).
4. Forecaster: `cd apps/forecaster && uv sync` (needs an NVIDIA GPU; see its setup.md).
5. `ops/lab/install.sh` — forecaster, inspector, nightly lab, watchdog and tick-archive timers, and the
   `trader.slice` drop-ins for the `pc-server-trader-*` units.
6. `bun run backtest` (inside `trader.slice`) to fill the backtest leaderboard.
