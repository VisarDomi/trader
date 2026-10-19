# Project intent and settled decisions

Reconciled on 2026-10-16 against the conversation **Trading Agent Platform**, thread
`31dac9e1-f010-42b7-a6e7-e73525242b2c`: all available conversation messages, plus the
original database-removal activity. This records the user's direction and superseded
assumptions so context handoffs do not restart settled design questions. Current runtime
facts come from the API and [journal](agents/JOURNAL.md); later user instructions take precedence.

**Operations update, October 19:** the shared infrastructure was migrated to this PC on October 16.
Arena/UI now use `pc-server-trader-{arena,ui}` user units and the private
`~/.local/share/hetzner-pc/mirror/home/erdal` runtime root. Hetzner is the public edge only.
The PC must stay on for trading and recording. This supersedes the historical topology below;
see root setup.md for deploy, storage and resource-cap handling. Never revive the old server writer.

## What the user is building

- A platform for choosing among many trading agents, watching them forward, and adding an agent
  easily with an LLM. The SDK should be small and consistent across historical and forward runs.
- Backtest success is weak evidence because of overfitting. Forward performance, ultimately actual
  Capital demo execution, matters most. Show historical/virtual/Capital differences honestly.
- The settled pipeline is **Backtest → Virtual engine → Capital demo**; demotion reverses it.
  There is no live-money stage. Virtual orders and actual demo-account orders are different evidence.
- Leverage is an experimental dimension. The user is especially interested in 1:1 and 1:200,
  while all nine tiers should be represented. Account leverage is a ceiling, not a command to use it all.
- The user guides direction and provides physical help. Coding agents own the repo and operations,
  decide and act, fix health, research, add/retire agents, commit/push/deploy, and document reasons.
  The earlier prohibition on changing AGENTS.md/README/test.txt was explicitly superseded on October 12.

## Capital accounts: already provisioned and allocated

The user created/renamed the nine accounts on October 7 and reserved **Visi** for personal use.
Do not propose an account per trading agent or ask for more accounts to expand virtual experiments.
The initial request for 40 accounts was superseded after the ten-account login limit was discovered.
Gerti became Arena 03 and Endri became Arena 05. Track accounts by stable Capital account ID, not names.
The user subsequently closed the old unrelated Endri short.

| Capital demo account | Arena 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 |
|---|---|---|---|---|---|---|---|---|---|
| Account leverage | 1:1 | 1:2 | 1:3 | 1:5 | 1:10 | 1:20 | 1:50 | 1:100 | 1:200 |

- All nine use **hedging**, verified with actual minimum-size demo orders. Multiple positions on the
  same instrument can coexist, each identified and closed by its own deal ID. The early assumption
  that an account could hold only one position per instrument was superseded by this verification.
- Each account is topped up to the demo maximum of $100,000. Up to 50 mirrored run allocations per
  account, initially $2,000 each: actual demo orders are **0.2×** the virtual run's $10,000 sizing.
  Capacity is 450 assignments total. Pooled broker margin still differs from isolated virtual accounts.
- Each run has its own agent version, instrument, leverage and record. An account holds many runs;
  it is not a new strategy and is not a second spelling of the virtual engine.
- `agents/roster.json` owns leverage allocation. Do not silently change account leverage, move run
  tiers or reset strategy histories while implementing infrastructure.
- **Visi is never traded, configured or topped up.** Only Arena accounts are owned by the platform.
- Shared login limits affect arena, lab and position-opener together: 10 HTTP requests/second,
  one login/second, 1,000 demo opens/hour. Existing arena pacing, queueing, retries and safeguards matter.

## Funding and broker facts: later evidence supersedes early guesses

- The October 7 answer that only shares/crypto were fee-free at 1:1 was corrected on October 13:
  **all supported 1:1 instruments except natural gas have no overnight funding**, verified from actual
  Arena 01 cashflows as well as Capital's fee information. Preserve the corrected engine rule.
- Higher-leverage positions incur applicable funding; holding a small position on a 1:200 account
  does not turn it into a fee-free 1:1 position. Crypto/shares have lower instrument leverage caps.
- Broker confirmations can return an unrelated latest deal. Match instrument, direction, size and
  deal identity, then reconcile uncertain results instead of attributing invented fills or P&L.
- Capital transaction responses can truncate at 100 rows. Traverse bounded time windows. Funding and
  corporate adjustments without deal IDs remain visible at account level, not invented per-run charges.
- Native broker stops, trailing protections, market rules, queues, failed opens/closes, clock deadlines,
  and restarts already have measured contracts and regression tests: see [EXECUTION.md](EXECUTION.md).
  Tick work must extend these, not replace them with instant-fill or zero-cost assumptions.

## Virtual capacity, selection and controls

- The user requested roughly ten virtual experiments per Capital demo slot, plus a tighter virtual
  broker checked against real demo behavior. The deployed pool before the tick upgrade has 4,561 runs:
  **551 standard runs and 4,010 labeled latency comparisons**, with 450 Capital assignments.
- These are 63 loaded agent variants across 20 instruments, not 4,561 independently invented strategies.
  Correlated latency copies never multiply statistical evidence, monkey counts or earned leaders.
- Existing Capital assignments are a calibration cohort. New slots require current-code/current-engine
  backtests and mature forward evidence. Promotion and demotion wait for appropriate execution safety;
  today's weak backtest does not retroactively erase an existing forward record.
- Normal maturity: 30 trades and 28 days, or 10 trades and 90 days for slow strategies. Leaders need
  trade t ≥2 and must beat the instrument's standard random monkeys. Mature t ≤−1, silence, errors or
  ruin trigger demotion/retirement. Full details: [LIFECYCLE.md](agents/LIFECYCLE.md).
- Random monkeys, buy/hold and leverage controls are deliberate baselines. `bold-play` and
  `martingale-monkey` are permanent virtual-only ruin controls, including new source versions.
- Infrastructure changes retain records and annotate model changes. Changing agent source deliberately
  creates a new version/record. Do not rewrite all agents just to add a shared engine capability.

## The user's night strategy

`visar-night-trading` is an explicit **special Capital demo experiment**, not an earned leader:
US500, consistently directional 09:30–16:00 New York session, next local 03:27 pullback entry relative
 to 22:00, 08:27 exit or a stop targeting half the strategy capital, 1:200. Local means Europe/Tirane.
The user clarified that the path matters, neutral/volatile days should be skipped, FOMC/BOJ decisions
should be excluded, and the intended frequency is 25–50 entries/year. Source `56ac3bdfe7c1` meets that
frequency on the stored history, but its prior candle-engine backtest loses 99.97%. It retains its
user-authorized Arena 09 experiment and normal subsequent safety/demotion rules. See
[its complete contract](agents/visar-night-trading.md). Refresh results honestly after an engine change;
do not tune this or other strategies for a better reported profit.

## Data, old deletion and the current tick request

- On October 6 the original inspection found roughly **64 million old ticks**, old Donchian backtests,
  and US100 minute candles back to 2020. On October 7 the user explicitly requested **"remove the old
  database"**. The assistant dropped the v1 tick/run/fill/equity/state tables and removed the old recorder;
  database size fell from 12 GB to 1.7 GB. **Minute candles were kept.** The thread confirms this removal;
  a claim that we cannot establish whether those v1 ticks were dropped is incorrect.
- This does not establish the fate of the separate Windows-era database remembered from 2016/2017.
  Its archived US100 downloader requests from May 2017, but a requested start is not proof of stored data. The user accepted the old deletion because both sides
  expected Capital still to supply the history; this assumption was not verified, so the removal was premature.
  The present candle store starts February 2020 for US100 and January 2024 for US500.
- Sampled older US500 minute API windows were empty; some older hourly/daily bars remain available.
  Do not infer an official universal retention limit or invent minute/tick paths as actual history.
- The October 16 request is explicit: **record actual ticks from now on, replay them in backtests,
  generate ticks on the fly where only minute candles exist, and make the agent engine work on ticks**.
  Bid/ask, event order, delivery time, risk and decisions need one consistent path. Synthetic paths must
  remain labeled, deterministic and separate from captured history; OHLC cannot reveal the actual path.
- Tick capture was deployed first as `939898b`, beginning **2026-10-16 04:09:38 UTC**, on the existing
  arena quote stream for all 20 instruments. A durable server spool and acknowledged PostgreSQL archive are running. The shared tick engine
  and replay have been validated; deployment status is recorded in the latest journal entry.
- The user then explicitly requested **one permanent tick copy** and a **100 GB whole-project budget
  for at least two years**. This supersedes the extra backup proposal. Keep only losslessly compressed
  PostgreSQL blocks plus metadata; retain a bounded temporary server transfer spool, verify before
  acknowledgement, and track measured/stress growth estimates. See [TICKS.md](TICKS.md).

## Operations, research and scope

- Hetzner runs the arena and dashboard continuously. The lab PC runs PostgreSQL, backtests, ingestion
  and TimesFM 3 on the RTX 3060 12 GB. Heavy PC work belongs in `trader.slice`, ≤50% CPU/RAM.
  Trading/recording must keep running on Hetzner when the PC is off; archive resumes when it returns.
- Touch only trader's parts of the shared server. Demo only; public repository, no committed secrets.
- Nightly lab work at 03:30; watchdog every ten minutes; scheduled visits Monday/Thursday 09:30.
  Usual additions: 1–3 agents on Monday, at most every seven days, capacity permitting. Explicit user
  requests already authorized larger batches and the night experiment. Changes to these rules require
  evidence and a journal entry, not automatic requests for the user's approval.
- Notify the Linux desktop only when the user must physically act. Routine implementation and choices
  belong to the coding agent. The user follows the dashboard and should not have to repeat decisions.
- Research is already published in the Research tab: ranked report, seven topic notes, 273 sources,
  214 saved source copies. Thirteen research-inspired agents/controls were implemented and deployed.
  Saved third-party papers stay out of the public repo. Pending ideas and rejected approaches are in
  the journal's idea log; avoid restarting research or adding duplicate strategies unintentionally.
