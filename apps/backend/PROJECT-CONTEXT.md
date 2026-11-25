# Project intent and settled decisions

The user's direction and the decisions already settled, so a new agent or context does not reopen them.
Reconciled against the conversation **Trading Agent Platform** (thread
`31dac9e1-f010-42b7-a6e7-e73525242b2c`); how each decision was reached is in the [journal](agents/JOURNAL.md).
Current runtime facts come from the API and the journal; later user instructions take precedence.

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
  That includes AGENTS.md, README.md and test.txt.

## Capital accounts: already provisioned and allocated

The nine Arena accounts exist and **Visi** is reserved for the user. A login allows ten demo accounts, so
there are no more to add: do not propose an account per trading agent or ask for more accounts to expand
virtual experiments. Track accounts by stable Capital account ID, not names.

| Capital demo account | Arena 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 |
|---|---|---|---|---|---|---|---|---|---|
| Account leverage | 1:1 | 1:2 | 1:3 | 1:5 | 1:10 | 1:20 | 1:50 | 1:100 | 1:200 |

- All nine use **hedging**, verified with actual minimum-size demo orders. Multiple positions on the
  same instrument can coexist, each identified and closed by its own deal ID.
- Each account is topped up to the demo maximum of $100,000. Up to 50 mirrored run allocations per
  account, $2,000 each: actual demo orders are **0.2×** the virtual run's $10,000 sizing.
  Capacity is 450 assignments total. Pooled broker margin still differs from isolated virtual accounts.
- Each run has its own agent version, instrument, leverage and record. An account holds many runs;
  it is not a new strategy and is not a second spelling of the virtual engine.
- `agents/roster.json` owns leverage allocation. Do not silently change account leverage, move run
  tiers or reset strategy histories while implementing infrastructure.
- **Visi is never traded, configured or topped up.** Only Arena accounts are owned by the platform.
- Shared login limits affect arena, lab and position-opener together: 10 HTTP requests/second,
  one login/second, 1,000 demo opens/hour. Existing arena pacing, queueing, retries and safeguards matter.

## Funding and broker facts

- **All supported 1:1 instruments except natural gas have no overnight funding**, verified from actual
  Arena 01 cashflows as well as Capital's fee information. Preserve this engine rule.
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

- Decommissioned agents and old platform/agent history belong in the **Graveyard**. Preserve source,
  reasons, trades and results; archive replaced source/engine backtests, and distinguish
  replacements/platform migrations from losing-strategy retirements.
- The user wants roughly ten virtual experiments per Capital demo slot, plus a tighter virtual broker
  checked against real demo behavior. Most virtual runs are labeled latency comparisons of the standard
  runs (cap 5,000 runs in total, 450 Capital assignments; `bun run review` shows the current counts).
- Correlated latency copies are not independently invented strategies: they never multiply statistical
  evidence, monkey counts, candidates or confirmed records.
- Capital assignments made before the evidence gate are a calibration cohort. New slots require current-code/current-engine
  backtests and mature forward evidence. Promotion and demotion wait for appropriate execution safety;
  today's weak backtest does not retroactively erase an existing forward record.
- Records are judged on the daily clock (one return per weekday) from 10 trades and 42 days. Candidates for
  Capital slots need a daily t ≥2 above the instrument's standard random monkeys; confirmed records clear the
  bar for every strategy record ever started and agree with their backtest. A daily t ≤−1 after 30 trades (10
  over 90 days for slow strategies), silence, errors or ruin trigger demotion/retirement. Full details:
  [LIFECYCLE.md](agents/LIFECYCLE.md).
- Random monkeys, buy/hold and leverage controls are deliberate baselines. `bold-play` and
  `martingale-monkey` are permanent virtual-only ruin controls, including new source versions.
- Infrastructure changes retain records and annotate model changes. Changing agent source deliberately
  creates a new version/record. Do not rewrite all agents just to add a shared engine capability.

## The user's night strategy

`visar-night-trading` is an explicit **special Capital demo experiment**, not an earned candidate:
US500, consistently directional 09:30–16:00 New York session, pullback entry at 21:27 New York relative
to the 16:00 close, 02:27 exit or a stop targeting half the strategy capital, 1:200. The clocks are New
York's so the trade keeps its place in the US day; in Tirana they read 22:00, 03:27 and 08:27 except in
the weeks when Europe and the US change their clocks apart.
The user clarified that the path matters, neutral/volatile days should be skipped, FOMC/BOJ decisions
should be excluded, and the intended frequency is 25–50 entries/year. Source `6ef6caeeb489` meets that
frequency on the stored history, but its backtest loses 99.99%. It retains its
user-authorized Arena 09 experiment and normal subsequent safety/demotion rules. See
[its complete contract](agents/visar-night-trading.md). Refresh results honestly after an engine change;
do not tune this or other strategies for a better reported profit.

## Data and ticks

- The lab keeps minute candles from February 2020 for US100 and January 2024 for the rest. Old ticks and
  the old run tables no longer exist and cannot be downloaded again; the journal's 2026-10-16 context entry
  records how they were removed. Sampled older US500 minute API windows were empty; some older hourly/daily
  bars remain available. Do not infer an official universal retention limit or invent minute/tick paths as
  actual history.
- The user's tick requirements: **record actual ticks, replay them in backtests, generate ticks on the fly
  where only minute candles exist, and run the agent engine on ticks**. Bid/ask, event order, delivery time,
  risk and decisions follow one consistent path. Synthetic paths stay labeled, deterministic and separate from
  captured history; OHLC cannot reveal the actual path. Capture began **2026-10-16 04:09:38 UTC** on the
  arena's quote stream for all 20 instruments.
- **One permanent tick copy** and a **100 GB whole-project budget for at least two years**: only losslessly
  compressed PostgreSQL blocks plus metadata, a bounded transfer spool next to the arena, verification before
  acknowledgement, and tracked measured/stress growth estimates. No extra backups. See [TICKS.md](TICKS.md).

## Operations, research and scope

- Everything runs on this PC: arena, dashboard, PostgreSQL, backtests, ingestion and TimesFM 3 on the
  RTX 3060 12 GB, all in `trader.slice`, ≤50% CPU/RAM. Hetzner is the public edge only (Caddy, Authelia).
  The PC must stay on: when it is off, nothing trades or records. Never start the arena's stale Hetzner copy.
  Deploy, storage and resource-cap handling: root [setup.md](../../setup.md).
- Touch only trader's parts of the shared infrastructure. Demo only; public repository, no committed secrets.
- Nightly lab work at 03:30; watchdog every ten minutes. Visits follow a schedule the owner sets from the
  results: up to once a day when the last visit found bugs, down to once a week after a quiet period.
  Usual additions: 1–3 agents at a time, at most every seven days, capacity permitting. Explicit user
  requests already authorized larger batches and the night experiment. Changes to these rules require
  evidence and a journal entry, not automatic requests for the user's approval.
- Notify the Linux desktop only when the user must physically act. Routine implementation and choices
  belong to the coding agent. The user follows the dashboard and should not have to repeat decisions.
- Research is published in the Research tab: the ranked report, the topic notes and their sources (saved
  copies stay off git). The report's ranked list says which ideas run as agents.
  Saved third-party papers stay out of the public repo. Pending ideas and rejected approaches are in
  the journal's idea log; avoid restarting research or adding duplicate strategies unintentionally.
