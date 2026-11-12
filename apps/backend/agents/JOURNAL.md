# Arena journal

Newest entry first. Written by the coding agent on each babysitter visit; the rules it follows are in
[LIFECYCLE.md](LIFECYCLE.md). The idea log at the bottom lists every agent idea tried.



## 2026-11-12 (Thu) — daily visit: orders fill at the price on arrival; demotions are not twins; reasonless refusals resent

- Health: green. Stream and forecaster up; tick journal 54.46M received, 0 dropped; storage 15.8 GB (two-year
  36.0 GB, 4× stress 76.9 GB of 100); no errors in 3 days. Nightly lab 03:36–03:50: all backtests refreshed for
  `2026-11-tp-level` (40 instrument groups in 4.7 min), night grid built 03:50 (US500 186 / US100 156 of 336
  traded), Night Lab report already published. Cost backfill: 2 attached. Arena RSS 578 MB 24 h after yesterday's
  restart (411 MB at 9 h), above the ~500 MB guide; today's two deploys restarted it (228 MB). Calendar coverage
  through 2027-12-31. Dashboard redeployed by the watcher in 11 s.
- Verdicts: control 148, early 394, keep 9, leader 0, retire 0; monkey sanity 0 of 36. Nothing to retire; no
  additions (Thursday).
- Twins under `2026-11-tp-level` (decided since 2026-11-11 08:44 UTC): 104 pairs, 79% agree, mean +1.16 bp:
  CHECK. Two pairs made +103 of the +120 bp: ema-cross/9-21 US30 and BTCUSD 1:10 were demoted to virtual ("losing
  virtual trade evidence") 3–4 minutes after their demo entries, which the demotion closed, while the paper trades
  ran 1 h and 10 h (+36, +66 bp). A lifecycle close is not a twin: such deals are now counted apart (20993ac).
  Without them: 102 pairs, 80% agree, mean +0.18 bp, p95 4.2 bp; targets 19 pairs, 95% agree. Both demotions
  followed reversals: the new side's demo order leaves at the decision, before the closing paper trade's P&L
  triggers the demotion (one spread at 0.2× size each, rare; left as is).
- Found (engine): entry fills. Capital fills an order at the last quote stamped at or before it accepts it (189 of
  246 orders since 2026-11-10 21:00 exactly; 13 at the next quote). Paper filled at the first quote stamped at or
  after decision + 500 ms, so a hole in our stream gave it a later price (16 of 246 fills more than 2 s after the
  due time, up to 10.7 s). Replayed on those 246 orders: mean |entry gap| 0.55 → 0.40 bp, median 0.24 → 0.15 bp,
  p95 1.90 → 1.72 bp, no bias either way. Fixed: engine `2026-11-arrival-price` (20993ac, deployed ~09:35): the
  first quote stamped after the due time releases the order at the quote before it; after a pause over a minute the
  reopening quote is still the fill. Thinned and full recorded replays trade identically. The version restarts the
  twin window (08:40 UTC) and tonight's lab refreshes the backtests.
- The 23:00 US100 pairs (−7.9 bp and others) are timing, not a rule: Capital's US100 jumped from 28134 to 28178 and
  back between 23:00:00.17 and 0.40; the demo order filled inside the jump 0.18 s after the decision, paper 0.5 s
  later (it would still differ by ~10 bp under the new rule).
- Burst latency after yesterday's broker change (13b560d): 170 orders, decision → accepted median 0.41 s, p90
  1.6 s, p99 2.9 s; the largest burst (16:00, 13 orders) took at most 2.7 s.
- Found (mirror): Capital refused 3 orders without a reason (swing-reversal/p05 ETHUSD 15:45, donchian/turtle-20
  GOLD 16:00, rsi2/long-only US100 23:00); its activity shows a REJECTED working order from SYSTEM. One such
  refusal since October before. Not a request collision (orders 170 ms apart across accounts); other orders on the
  same account seconds later went through. Each demo entry then waited for the 5-minute retry (5.3–5.5 min behind
  its paper twin). Now the first retry of a reasonless refusal goes out after 1 s, within the 5 attempts
  (1c0ce48, deployed).
- Next: twin pairs under `2026-11-arrival-price`; whether the 1 s resends go through; arena RSS at 24 h; tonight's
  backtest refresh.

## 2026-11-11 (Wed) — daily visit: targets fill at their level; bursts lose the per-order position check

- Health: green. Stream and forecaster up; tick journal 51.7M received, 0 dropped; storage 15.6 GB (two-year
  35.7 GB, 4× stress 76 GB of 100); no errors in 3 days. Nightly lab 03:31–03:43, no backtest work (engine
  unchanged), night grid built 03:43 (US500 186 / US100 156 of 336 settings traded), Night Lab report already
  published. Cost backfill: 0 candidates. Arena RSS 411 MB nine hours after the midnight restart (606 MB at 8 h
  the day before). Calendar coverage through 2027-12-31.
- Verdicts: control 148, early 394, keep 9, leader 0, retire 0; monkey sanity 0 of 36. Nothing to retire; no
  additions (Wednesday).
- Twins, current engine (decided since 2026-11-09 22:19 UTC): 180 pairs, 82% agree, mean +0.83 bp; since
  yesterday's mirror fixes (08:43 UTC) 139 pairs, 81% agree, mean −0.38 bp. CHECK: swing-reversal/p05 US100
  1:2, 5 of 7 agree; one pair is the 16:00 burst (demo entered 6.1 s after the decision), the other within a
  bp. Of the 27 disagreeing pairs since the fixes, 9 come from burst entry delays (random sign, no bias).
- Found: the largest gap (swing-reversal/p10 ETHUSD, −83 bp) was the engine. Capital's activity shows the
  target at 2055.76 filled at 2055.28 at 13:30:26 (US release); our stream was 12–14 s late and arrived in
  bursts with ~3 s holes, and the next quote we got was 2038.36, where paper filled. Over 14 days: 25 targets
  where paper beat demo beyond a spread (−356 bp in total), 3 the other way. Capital's own records (4 days, all
  Arena accounts): targets fill at the level or better (median +0.26 bp, 83 closes); stops slip a median
  0.15 bp (p5 −3.5 bp). Fixed (engine `2026-11-tp-level`, 13b560d, deployed 09:44): a target crossed while the
  instrument quotes continuously (quotes under a minute apart) fills at its level; after a pause the reopening
  quote is still the fill. Stops unchanged: they are market orders and paper stays conservative (demo better in
  60 of 845 stop pairs, +514 bp). The version bump restarts the twin window and refreshes backtests tonight.
- Burst latency: Capital still answers an order in ~0.14 s, but at 16:00 41 orders took 25 s to leave our
  queue (decision → sent up to 14 s): every order needs its confirmation before the account's next one, plus a
  position check, all in the ~6 requests/s budget. The per-order position check (a GET each) now happens in the
  account's next reconciliation (one GET of all positions, within about a minute), and the protection resync
  sends nothing when levels did not change: about a third fewer requests per burst. The budget itself stays:
  position-opener shares the login and its usage is unknown.
- Next: burst decision → sent after this deploy (16:00 and 00:00 bursts); twin pairs under `2026-11-tp-level`;
  broker-closed stops (paper conservative) if they keep many pairs from agreeing.

## 2026-11-10 (Tue) — daily visit: three mirror fixes; twins judged on the current engine

- Health: green. Stream and forecaster up; tick journal 48.8M received, 0 dropped; storage 15.6 GB (two-year
  35.5 GB, 4× stress 75 GB of 100); no errors in 3 days. Nightly lab 03:37–03:46: all 556 backtests refreshed
  for `2026-11-feed-time-v2` in 2.6 min (555 completed; leverage-ladder/hold US100 1:200 busted, −100% in 3
  trades); night grid built 03:46. No agent was waiting for admission. Arena RSS 606 MB after 8 h (330 MB after
  a restart, cgroup peak 742 MB): above the ~500 MB guide, to watch.
- Verdicts: control 148, early 395, keep 9, leader 0, retire 0; monkey sanity 0 of 36. Nothing to retire; no
  additions (Tuesday).
- Twins: all trades over 14 days 2,202 pairs, 55% agree, 141 agents diverged: the old engine and the old queue.
  Since engine v2 (decided after 2026-11-09 22:19 UTC) 11 pairs, 10 agree; all 16 entries since the feed-time
  engine within a spread. Every disagreement found was the mirror: three timesfm-drift pairs (AUDUSD,
  OIL_CRUDE ×2) from the early-close bug fixed in 0e754e4, and ema-cross/9-21 BTCUSD from the reversal bug
  below. The remaining CHECK (mean +8.9 bp over 11 pairs) is that pair (+96 bp); it fades as pairs accumulate.
- Fixed (13d3ba5, deployed d57347a 09:43):
  - Reversals: the old side's paper close, seconds after the decision, closed every demo deal of the run,
    including the new side's deal sent at the decision, and the fill then reopened it. All 4 reversals since
    decision-time orders (ema-cross BTCUSD ×2, hma-slope GOLD, tsmom/5d US500): an extra spread and order, and
    a 1–5 s demo deal paired with an hours-long paper trade. A paper close now closes only its own side.
  - A decided order that waited in a burst until after its paper fill went out linked to the fill; the fill then
    tried a second open, stopped by the guard ("previous deal is still open": SILVER 02:00, US100 and ETHUSD
    05:00). The fill now recognises its deal.
  - Several orders on one account in a burst: each waited ~1 s for the previous one's confirmation and position
    check. The check (never failed in 5,633 deals since October 1) and the protection resync now run after the
    account's queued orders. Since last night's broker fix: 47 orders, decision → accepted median 0.30 s, 35
    under 1 s, 90th percentile 2.2 s; the slow ones were the 2nd–4th orders on one account at 02:00 and 05:00.
- Twins judge the current engine (492ee71): the arena records `engine.since` when its engine version changes
  (seeded to the v2 start, 2026-11-09 22:19 UTC); `bun run twins` raises CHECKs on trades decided since then,
  with all trades as context, and Paper vs demo opens on that view.
- Correction: the funding gap was not real. Capital books SWAP transactions without a deal id (known since
  October, kept per account), so the twins compared paper funding with zero. Over 14 days at paper size,
  Capital's swaps were −$3.5k against −$1.8k paper funding on paired, closed trades: paper does not overcharge,
  and Capital may charge more. The 2026-11-09 entry's "$2.8k more" is wrong. CLI and page show paper funding.
- Next: burst latency after this deploy (later orders on one account); match swaps to positions per account
  and night (amount ∝ size × price) for a real funding comparison; arena RSS after 24 h; current-engine pairs
  toward agent verdicts.

## 2026-11-10 (Tue, user-requested, night) — sub-second demo orders; bursts never touch the engine; cheaper quotes

- Why: the user saw Capital's app answer in under a second, while our demo orders took seconds; a burst
  must only queue on the broker side, never affect the engine; and the optimizations named the day before.
- Diagnosis (14 days, 2,240 deals): Capital answers an order in 123 ms (p50; 602 ms p95). All the delay was
  ours: decision → order sent 7.1 s median, 4.5 s even with under 10 decisions a minute, 52 s at 40+. One
  session switched between the nine accounts (two requests per switch), each order held the single queue for
  its confirmation (300 ms sleep first) and position check, and the minute's 40 candle/market requests
  shared the same 170 ms pacer. Capital's limits (open-api.capital.com FAQ): 10 requests/s per user, orders
  at most 1 per 0.1 s, 1,000 demo orders an hour, one login per second; concurrent sessions undocumented.
- Fix (332d263): one session per demo account (nine concurrent sessions probed read-only first: all stayed
  valid, the arena saw no 401s), a job queue per account with orders before reconciliation, a pacer that gives
  the next slot to orders, then confirmations and position checks, then everything else, and an immediate
  first confirmation. First night after it: decision → accepted 0.2 s median, 1.1 s p90, 2.3 s worst (8 deals,
  at most 4 in a minute; the morning's hourly bursts are the real test). A burst of 40 still needs ~7 s at
  Capital's budget; that is the mirror's queue only.
- Engine `2026-11-feed-time-v2`: the modelled shared broker queue is gone from paper execution (it paced all
  runs FIFO and capped them at 600 opens an hour together); each paper order fills after its own delay. A
  per-run guard of 12 opens an hour stays. Tonight's lab refreshes the backtests for the version.
- Quotes only reach positions they can change (a stop, the trailing anchor, take-profit, margin close-out, a
  new equity peak or deeper drawdown, a time rule): 99.5% of position checks on 3 BTC days needed nothing.
  11 recorded days, 486 runs, 1,525 trades: identical to delivering every quote. Agent contexts are built
  from a per-run base (the top hotspot for agents with a quote callback): identical results, replay 69 → 52 s.
  The benchmark now trades for real (it had refused orders after 3 minutes on stale venue rules): 5,000 runs
  with 2,092 open positions, a full day, 237 s CPU delivering every quote vs 172 s skipping, same trades.
- Not done: sharing bar work across copies of an agent (bars are 0.6% of engine CPU at 50,000 runs, and agents
  branch on their own position). The night cohort and its delay copies (~113 runs per US index) define a quote
  callback, so every US100/US500 quote still reaches them although it only acts with a profit target; a future
  SDK flag could let new agent versions ask for quotes only while positioned (changing these agents' code
  would restart the cohort).
- Live after c33e40e: 0.23 ms per quote, quote callbacks 0.07 ms, 2–4% of a core in total by session.

## 2026-11-09 (Mon, user-requested) — paper–demo twins, Capital's late quote stream, cheap idle agents

- Why: the user wants every agent, demo or paper, trading on ticks by its own policy; each demo agent with a
  paper twin whose convergence is checked daily; then as many paper agents as possible on as little as
  possible (thousands now, 20k–1M later). The 9 demo accounts validate the engine; paper carries the rest.
- Twin report: each closed demo deal paired with its paper trade (run + paper fill time), compared per unit of
  notional; demo close prices from Capital's booked P&L (85% of demo closes had no close price: broker stops,
  or closes confirmed with another deal's confirmation). Last 30 days: 3,609 pairs, 63% within one spread,
  mean gap +0.4 bp (demo slightly better), 95th percentile 9.8 bp, demo − paper +$314 at paper size; paper
  funding charged $2.8k more than Capital's swaps (to investigate). Agents: 48 converged, 38 watch, 167
  diverged, 91 too few.
- Found: Capital's demo quote stream arrives 2–13 s after each quote's timestamp (grew from 5 s to 13 s over
  late October and early November; 2 s after tonight's restart). REST shows the same price and timestamp 5–7 s
  earlier; a fresh connection was exactly as late as the arena's (6 ms apart), so it is Capital's. PC clock
  NTP-synced (0.8 ms). Effects: paper filled on stale quotes, live minutes closed before their last quotes,
  Capital's stops fired a median 5.7 s before ours, demo orders left after the paper fill.
- Changed (engine `2026-11-feed-time`, 4cb33da): fills on the first quote stamped at or after the order's
  arrival; quiet minutes close after 1.5 × the observed delay; the mirror sends demo orders at the decision
  and links the later paper fill. Backtests on generated quotes unchanged; the night grid keeps the same
  trades in all 336 US500 settings (returns +0.1 pp on average; the original's Nov 3 entry 7548.3 vs 7548.5),
  and its thinned replay still equals a full replay exactly (all 672 settings, both indexes). The version bump refreshes all backtests in
  tonight's lab run; admissions wait for it.
- Cheaper agents: idle flat runs skip quotes and take the latest quote when observed (identical results for
  486 runs, 1,525 trades, 11 recorded days); idle runs are saved every 10 minutes, not every minute. Full
  recorded day: 5,000 runs 219 → 99 s CPU, 20,000 runs 963 → 386 s (0.45% of a core); state rows 28.2M → 4.8M;
  50,000 runs 963 s (1.1%), 420 MB. Same opens and trades before and after.
  Live arena CPU by part is now in `/api/execution`: after the deploy 5.3% of a core, of which quotes 1.7%
  (0.34 ms per quote; 2,820 of 4,644 runs hold a position and are checked on every quote, ≈0.7 µs each).
  Positions, not agents, set the per-quote cost; the step toward a million runs is a trigger-price index.
- Capital's delay switches between regimes (BTC today: ~0.1 s 17:15–19:15 UTC, 7–10 s before and after),
  across restarts and connections alike; the engine follows the measured delay per instrument.
- The demo order historically reached Capital a median 7.3 s after the decision (95th percentile 45 s):
  the mirror's single session switching between nine accounts at top-of-hour bursts. Decision-time orders
  remove the wait for the paper fill, not this queue; it is the next gap to close.
- Visits are now daily at 09:30 with `bun run twins` first (LIFECYCLE "Paper–demo twins").
- Deployed 8fedc5f 21:27; 85 agents, 4,644 runs, no load errors. First decision-time demo orders: Capital
  accepted them 0.5–20 s after the decision while the paper fills came 12–31 s after it (Capital's stream
  was ~9 s late again); entry prices within 0–3.4 bp. Bug: the minute sync closed 3 of the 6 demo deals as
  "paper position is flat" while their paper orders were still on the way (timesfm-drift OIL_CRUDE ×2,
  AUDUSD). Fixed: a pending paper open of the same side keeps its decided deal, and a paper fill whose
  decided deal was closed in between opens a new one. Those three paper positions stay without a demo twin
  until they close.
- Next: first twin numbers under the new engine (agreement should rise if the feed delay was the main gap);
  funding gap; the 167 diverged agents by exit type; the run cap (5,000) once production CPU parts are known.

## 2026-11-09 (Mon, user-requested) — Visar night paper grid (672 settings, nightly)

- Why: the user agreed ten demo probes per index cannot map the space, and asked whether a few hundred
  paper settings is too much. Inert settings stay out (profit targets; the loss limit at 1:20).
- Grid per index: NY window (central, full) × day filter (standard, big-move, strong-day, steady-day,
  efficient-day, small-pullback, tiny-pullback) × gap (0, 5, 15, 30 bp) × leverage (1:20, 1:200, loss limit
  50%) × side (rule, always long, coin) = 336, built from the v3 base and control sources. A test proves the
  19 v3 demo agents are exactly their grid cells. Window from 2026-10-01 (after the study window); the
  per-cell split shows the holdout before the cohort was fixed and strictly forward nights from 2026-11-10.
- Cross-check: the full/standard/1:200 rule cell reproduces the original agent's two live nights
  (2026-10-16 long, 2026-11-03 short; Nov 3 identical fills, +93.5% vs +96.96% live).
- Cost: a full replay took 207 s (US500) and 834 s (US100) for 39 days. Idle minutes now carry only the
  quotes that set open/high/low/close (after the engine's own acceptance rule): every candle and rejected
  count since October is identical, and all 672 cells match the full replay exactly, in 54 s + 100 s. About
  4 s per day of data, so roughly 25 minutes a night after a year, inside trader.slice. A first version
  picked quotes by arrival rather than quote time and differed on one US500 day; caught by the comparison.
- Since 2026-10-01 (5 qualifying US500 nights at most): the US500 rule beat always-long in all 62 traded
  settings and the coin in 42; US100 the rule beat always-long in none of 52 and the coin in 21. A handful
  of shared nights; nothing is selected from this.
- Night Lab → Paper grid; data in `trader-ui/night-grid/`, written by the nightly job.

## 2026-11-09 (Mon, user-requested) — nightly lab resumed after 19 days

- Why it stopped: `heavy-resources-stop` on 2026-10-21 10:54 UTC wrote the hold file listing the video
  pipeline, TimesFM and both lab units. `heavy-resources-start` was never run. On 2026-11-01 TimesFM was
  resumed alone (removed from the list), but the lab units carried `ConditionPathExists=!` on the hold file,
  so they waited for the file itself to disappear, which it never does while the video pipeline is held.
  Last lab run 2026-10-21; arena trading, tick capture and the archive were unaffected.
- Fix (db1f855): `ops/lab/lab-control.py` (`check` / `resume`, same pattern as `forecaster-control.py`);
  `trader-lab.service` uses it as `ExecCondition`, the timer's file condition is gone. Ran the scoped resume
  at the user's request; the hold now lists only `video-pipeline.service`, which stays paused (not ours).
  A future `heavy-resources-stop` rewrites the full list and pauses the lab again.
- The timer is `Persistent=true`, so the missed run started at 18:26 inside `trader.slice`: 19 days of
  candles to ingest, then history push, tick flush, storage, forecasts, backtests.

## 2026-11-09 (Mon, user-requested) — uniform v3 night cohort: one base, one change per agent

- Why: the user wants each of the ten agents per index on its own direction in the parameter space, uniform
  names, and to see at a glance what each explores, the original included. The v2 agents each changed three
  to five settings at once. The user also asked to leave out inert dimensions: at 1:20 a 50% loss limit never
  triggered in the backtest (0 stops) and a +20% target once in 67 trades.
- v3 per index: `base` (10:30–15:30 NY day, standard day filter, any overnight counter-move, 1:20, 50% loss
  limit, 08:27, no target) plus one change each: `big-move` (day ≥0.5%), `strong-day` (net move ≥80% of
  range), `steady-day` (≥62% of steps agree), `gap-5bp`, `gap-15bp`, `leverage-200`, and the controls
  `always-long` and `random-direction`. The original `visar-night-trading` keeps its record (2 trades,
  $19,696) as the US500 full-day 1:200 point; US100 gets the same settings (`full-day-200`). Cohort file
  `research/night-cohort-v3-20261109.json`; v2 agents archived to `_retired/` with their histories.
- Backtest 2024-01 – 2026-09 (matches the existing study cells exactly; big-move is new): US500 base +18.0%,
  big-move +31.5%, strong-day +5.2%, steady-day +28.0%, gap-5bp +28.8%, gap-15bp −7.0%, leverage-200 −90.0%,
  always long −6.9%, random −22.1%, original −99.98%. US100 base +125.1%, big-move +106.7%, strong-day +16.9%,
  steady-day +96.2%, gap-5bp +117.2%, gap-15bp +63.4%, leverage-200 +322.4% (98.5% drawdown), full-day-200
  −100%, always long +58.6%, random −17.3%. Selected on design, not on these results.
- Deployed 9f4cf67: all 20 run and are on Capital demo; the original's record matches the pre-deploy
  snapshot. 16 cohort runs now sit on 1:20, displacing flat legacy runs (adx-dmi, timesfm-band) to paper.
  Night Lab cohort table shows coordinates with each change from the base in bold. Verdicts: control 148,
  early 396, keep 8, leader 0; monkeys 0 of 36. Backend 180 and UI 22 tests pass.
- Recommendation given: keep ten on demo as probes; run the full meaningful grid forward in paper by
  replaying recorded ticks nightly rather than as thousands of arena runs (see the user summary).

## 2026-11-09 (Mon, user-requested) — direction controls for the night cohort

- Why: the overnight assessment suggested comparing the night rule with always-long and random-direction
  trades on the same eligible nights; the user asked to add both as control agents, two per index, replacing
  two agents per index so the cohort stays at 20.
- Added `visar-night-v2-control-us100` and `-us500`, each with `always-long` and `random-direction`. Their
  source is the v2 reference with one change: on a night the rule would trade (same window, day filter, gap,
  calendar and clocks), the side is long, or a fair coin from `ctx.random()` (reproducible per run). Settings
  equal their partner `frequent-core` exactly (US100: 1:20, −20%, +20% or 08:27; US500: 1:20, −10%, 08:27).
  Controls in `CONTROL_SLUGS` (never judged or retired) with user-requested demo admissions on 1:20.
- Removed, by roster with replacement reasons (records kept in the Graveyard): US500 `full-reversal` (1:100)
  and `full-steps` (1:50), US100 `largest-gap` (1:100) and `full-steps` (1:3), the overnight assessment's
  lowest-weight roles (full-session or sparse/large-gap). Shortlisted families are untouched.
- Backtest 2024-01 – 2026-09, same nights (equal trade counts confirm it): US100 rule +132% (67 trades),
  always long +52%, random −55%; US500 rule +18% (81), always long −4%, random +1%. Random is one coin
  sequence. The rule beat both controls on both indexes in history; the forward records will test it.
- Night Lab report rebuilt (only the cohort changed; the 16 kept members are byte-identical) with a same-nights
  comparison table; strategy explanations show the control's side against the rule's.
- Deployed 4a6e029: 89 agents, 4,653 runs, no load errors. All 20 cohort runs assigned to Capital; the
  original's record matches the pre-deploy snapshot (2 trades, $19,696). The controls took four 1:20 slots
  from flat legacy `adx-dmi` runs (US500, US30, GOLD, SILVER), which continue on paper. Verdicts: control 148,
  early 396, keep 8, leader 0; monkeys 0 of 36. Backend 181 and UI 22 tests pass.

## 2026-11-09 (Mon) — babysitter visit, virtual day 33

- Ran at 15:45 UTC instead of 08:30: the scheduled run failed twice on its provider (unsupported model).
- Health: green after one broker fix. Stream and forecaster up, 0 errors in 3 days, queue 0, watchdog quiet.
  Tick journal 46.9 M received, 0 dropped, archive one minute behind on its every-minute timer. Storage
  15.1 GB; two-year projection 35.0 GB, 4× stress 74.3 GB of 100 GB. Arena 489–534 MB before the deploy,
  330 MB after. Both `pc-server-trader-*` units in trader.slice. The nightly lab stays paused by the user's
  heavy-resource hold (since Oct 21; forecaster resumed Nov 1), so no backtests or additions from this visit.
- Fix (041104e): close confirmations carry the closing order's direction (SELL for a long), which a
  minimum-size EURUSD round trip on Arena 01 confirmed ($0.013 in spread). The Oct 15 identity check compared
  them with the position's direction, so from then on nearly every arena close was left to reconcile, sent
  again and recorded from the 404 without an exit price: 7 of 3,630 closes priced from Oct 16 to Nov 9. P&L was not
  affected (it is allocated from Capital.com's transactions; 11 of 5,315 trade entries unallocated), but exit
  prices and exit slippage are missing for Oct 15 – Nov 9 and each close cost a second request. After the
  deploy, 4 of the first 5 closes were priced (within 0.3 points of paper); the fifth was its own broker
  take-profit. The test fixture now answers like the real API and asserts the exit price.
- Cost evidence: `audit-costs --backfill` attached quote metadata to all 7 candidates (0 unmatched).
- Policy calendar: FOMC (page updated Oct 28) and BOJ decision dates through 2027-12-31 match the official
  schedules; no change. Coverage ends 2027-12-31, more than 90 days ahead.
- Verdicts: control 144, early 400, keep 8, leader 0, retire 0; monkey sanity 0 of 36.
- Retired: none listed. Added: none (today's user-requested Visar v2 cohort is this week's addition).
- Left alone: uncommitted edits to `AGENTS.md` and `apps/forecaster/server.py` from another session.
- Next: Thursday — confirm exit prices stay recorded and exit slippage reappears on the Status panel.

## 2026-11-09 (Mon, user-requested) — profit exits as a full dimension

- Added deadline-only versus +20/+50/+100% of each trade's starting capital, with the same loss
  protection and08:27Tirana deadline. Long targets trigger on executable bid and shorts on ask;
  opening spread is already in the actual fill. Rebase to actual rounded units/fill; round outward.
  Targets outside the broker's native distance range use an executable-P&L tick fallback instead
  of sending impossible levels. These are ordinary price protections, not guaranteed cash returns.
  Original visar-night-trading stays56ac3bdfe7c1 with its own history and deadline-only behavior.
- Full-engine sweep:20,736cases (prior5,184×four closes), same2024-01–2026-09prices, calendars,
  gap/day/window/risk definitions. Every one of5,184deadline-only controls matches the previous
  complete financial metrics/trades, excluding expanded entry explanation text only. Independent
  signal oracle, ledger balances and exit-reason totals reconcile. All study funding is zero as
  these night holdings do not cross the financing cutoff. No captured tick copy or price rewrite.
- Bounded replay uses four one-CPU workers inside trader.slice. All bars/clocks/equity/risk/fills
  still run in the engine; known empty signal callbacks are disabled, and the engine avoids
  allocating a context when no bar callback/observer exists. Atomic derived results can resume
  after interruption. Raw study is in data/night-exit-study-20261109; no primary study uploads.
- Re-selected nineteen variants with explicit exit roles, same positive-primary-return/<=40%DD
  and sample limits, original tier capacity and ten>=18entries/year frequency roles. Exit mix:
  eight deadline-only, five+20%, three+50%, three+100%. Several targets do not bind historically;
  target-hit counts remain explicit rather than claiming independent new winning histories.
  Two 1:1 endpoints and the source-pinned original are retained. All nineteen fresh source-specific
  backtests/check-agent pass and exactly match the selected full-engine study trades/metrics.
- Four synthetic quote-path checks per selected agent (seeds1/2/3at16quotes, seed1at64) are visible
  as return ranges beside baseline results. US500 full-reversal spans−5.42%to+17.50%; US100
  largest-gap spans+15.08%to+52.24%. These inspected simulations are not independent validation;
  original-risk exit-mix charts also make extreme drawdowns conspicuous, alongside returns.
- Capital API's native profitLevel contract checked at https://open-api.capital.com/ . Fixed a
  pre-confirmation race: queued opens now use latest rebased SL/TP, and changes before a permanent
  deal id are synchronized after confirmation. Regression verifies the actual request bodies.
  Existing native protection and deadline/snapshot paths are retained; no account or leverage
  settings are changed. Only Arena-owned demo accounts remain eligible; Visi is untouched.
- Report expands all20,736cells/192equity plots with no reveal controls. Adds exit-mix bars,
  close-reason counts, all-four-exit summaries and four target rows per leverage/loss setting.
  Same-index fee-free1:1holds remain. Embedded display data omits unused fields without rounding;
  its rendered result is tested equal to full export data. Full JSON and10,368-row CSV/asset remain.
  Forward schema3 and worker/client source membership checks prevent an older same-id agent
  version from lending its cash/P&L to the replacements, including offline or during publication.
- Pre-deploy snapshots preserve all20assigned identities and prove the nineteen replaced versions
  flat. Native decision/inspection data carries target prices and exit rules through the existing
  app contract. No phone installation or user action is required. Deployment verification follows.
- Deployed33cd0cc: all20source/instrument/tier-pinned records are assigned; no unrelated mirror
  was displaced. Original run id/start/source, two trades, return, win rate, equity and drawdown
  match the pre-deploy snapshot. All19prior source versions retain source, runs and backtests in
  Graveyard. Pool remains4645(553standard/4092comparisons),442Capital assignments, queue0,
  stream/model healthy,468MB RSS; errors0 and dropped ticks0. Storage15.0GB, two-year34.7GB,
  stress73.6GB under100GB. Verdicts400early/9keep/0leaders/144controls; monkeys0/36.
- Published HTML/full JSON/worker and both10,368-row exit CSVs match committed bytes. Forward
  schema3 returns all20current sources/assignments; original actual cash remains distinct from
  virtual P&L. Complete projected/full-data renders agree for20,736cells/192plots; representative
  desktop/phone QA has zero reveal controls and no document overflow. Backend179tests, both native
  Rust tests and UI12tests pass. Archive timer has a future trigger; no physical action needed.


## 2026-11-09 (Mon, user-requested) — deploy gap/session cohort; show every dimension

- User explicitly requested replacing the nineteen newly added experiments with backtest-selected,
  diverse session/gap/risk variants and more frequent entries. Original visar-night-trading stays
  byte-for-byte 56ac3bdfe7c1 and keeps its forward record. This request authorizes selection on the
  inspected grid; it does not make the selected history independent validation.
- Reproducible selection in ops/lab/select-night-cohort.py and research/night-cohort-20261109.json:
  nine US500 plus ten US100 roles, two NY windows, all four gap minimums, five day definitions,
  seven leverage tiers across the new agents plus the original1:200, and5/10/20/50% loss targets.
  Positive historical return and <=40% portfolio DD are required; N>=20 except the explicit 30bp
  endpoint with18. Ten higher-frequency roles have18.2–29.5entries/year; the remaining dimensions
  deliberately include slower6.5–12.0/year roles. Two 1:1 endpoints remain. Financially identical
  nonbinding stops are deduplicated; prefer20% rather than inventing diversity from equal histories.
  Each role balances risk-adjusted return with parameter distance within75% of its available best
  quality score. Tier capacities constrain selection, so no unrelated incumbent needs displacement.
- Added visar-night-v2-us500 (nine) and visar-night-v2-us100 (ten), each with source-pinned demo
  admissions. Recognition uses570–960 or630–930 NY minutes and the corresponding20/26 step
  denominator; bullish+lower/bearish+higher remains strict, then enforces the selected0/5/15/30bp
  minimum. Reference, clocks, policy exclusions, original market/latency/fill/stop callbacks remain.
  Fresh source-specific full-engine backtests exactly match all nineteen selected metric objects
  and complete trade objects except the expanded human-readable entry reason. No filtered-ledger
  shortcut. Backtests/check-agent passed inside trader.slice with two workers and bounded memory.
- Superseded nineteen agents are moved unchanged into agents/_retired/. Roster reasons explicitly
  identify replacement, not mature losing performance. Removed-source retirement now retains a
  matching explicit roster reason rather than replacing it with generic missing-agent text.
  Historical backtest, virtual and Capital records/source remain; no original trade is rewritten.
  Typechecking excludes frozen archived source, whose original relative imports are preserved.
- Native/web decision graphs now use the source-pinned session bounds,21/27 checkpoints,270/351
  coverage and the agent-specific bid-gap boundary/headroom. Existing native rendering handles
  these server panels; no app install is required. Sparse v2 roles with fewer than30 historical
  fills receive180days to observe an entry; frequent roles retain60. Error/ruin/demotion unchanged.
- Removed the report's gap selector after the user rejected hidden comparisons. All5,184risk cells
  and48equity plots render together. Every day policy first groups all four gap charts, then shows
  full/central leverage/loss tables for every gap. Both-instrument summaries show all day filters,
  windows and gaps together. Baseline trade paths show each night's gap membership once, avoiding
  four copies of the same setup. No tabs, accordions or selection required to reveal results.
  Cohort rows expose session, policy, minimum gap and observed frequency. Offline forward caches
  are keyed to exact cohort identity, so old20-row responses cannot masquerade as the replacements.
- Pre-deploy: stream/model healthy,4600virtual (553standard),442Capital assignments, queue0,
  no dropped ticks,13.9GB storage and33.6GB two-year projection/72.4GB stress under100GB.
  Verdicts401early/8keep/0leader/144controls; monkeys0/36. All nineteen replaced virtual records
  were checked flat; the bounded broker deal read has no corresponding open deal. Holds, accounts,
  original account leverage, capture/archive and unrelated services remain unchanged.
- Deployed c474ea3 and verified20/20source-pinned Capital assignments (10US500/10US100), with
  no unrelated mirrored record displaced. Original run id/start/source, two trades, return and DD
  are unchanged. All nineteen superseded agents have source, forward runs and backtests in the
  live Graveyard, with explicit superseded-experiment reasons. Standard count remains553; total
  virtual4645 includes4092correlated comparisons and stays under5000. Queue0, stream/model healthy,
  no dropped ticks; normal RSS observed308–501MB after startup. Verdict counts remain unchanged.
- Published HTML/report/worker match committed bytes; live PWA feed contains exactly19v2members
  plus the original, all assigned. Cohort cache namespace is90d3609c0a7a. Desktop/phone rendering
  checks confirm5184cells/48charts/zero reveal controls and no document overflow. Each policy's
  four equity charts share axes and appear together above its risk tables. Backend174tests and
  UI11tests pass, plus both Rust parity tests; UI diagnostics have zero errors/warnings. No user
  action or phone installation is needed: the native app receives the new agents and graph panels.


## 2026-11-09 (Mon, user-requested) — rare event context, central session and gap sizes

- Publication exposed that the shared publisher invoked dashboard builds outside trader.slice.
  The repository's UI build entry now joins a two-CPU/2 GiB scope inside the aggregate budget,
  reuses an existing trader scope, and fails closed if the configured lab manager is unavailable.
  A real Vite build passed with its process verified in trader.slice and its scope limits read back
  as two CPUs/2 GiB. Other build hosts retain normal Vite behavior. No shared publisher or unrelated
  service changed. Published report/worker/exports match source bytes; forward feed has all20assigned.
- Confirmed the frozen original has always implemented the user's direction rule: bullish prior NY
  session plus a 03:27 bid below the 22:00 reference buys; bearish plus a bid above sells. Equal or
  same-side prices skip. Existing twenty agents accept any positive bid counter-move. Bid signal
  distance and executable fill distance/cost are now separate fields in the report.
- Added research-only 10:30–15:30 NY recognition alongside full 09:30–16:00. Only the recognition
  window changes:300 minutes/20 intervals/21 points/270 minimum observations versus390/26/27/351.
  Minimum agreement remains a fraction:baseline 10/20 or 13/26; stricter 16/26 requires 13/20.
  All path features exclude the first hour and last half-hour in the central version. The 22:00
  reference, 03:27/08:27 Albania clocks, policy-date guards and original execution/stop callbacks
  remain fixed. A source-normalization regression proves the isolated research reference differs
  from the frozen original only in these two window constants and SDK import path.
- Added prespecified minimum positive gaps 0/5/15/30bp (0/0.05/0.15/0.30%). Full Cartesian study is
  2 instruments×2 recognition windows×6 day policies×4 gap minimums×9 tiers×6 loss targets=5,184.
  Threshold 0 preserves strict inequality; it does not allow equality. Research results never
  upload to primary history or change the live cohort. All current source/admission hashes stay.
- Independent Python/ZoneInfo oracle reproduces old full-session opportunities 72 US500/60US100,
  and all new trade dates/sides. Central baseline opportunities 83/67 produce 81/67 fills: missing
  execution minutes expire normally. All ledgers reconcile. At fixed 1:20/20% loss and any gap,
  central US500 returns+17.9979%(81trades) and US100+125.1114%(67), versus full −33.8575%/−49.4033%.
  These inspected historical dimensions are not fresh validation; no winner is automatically deployed.
- To bound the enlarged replay, cached signals contain only prior-session features,22:00 reference
  and the signal bid. The engine still executes original order/fill/stop logic on complete candidate
  UTC days and while positions exist. Flat idle minutes retain their last generated quote. Every
  one of 1,296 zero-gap control trade lists AND complete financial metrics exactly matches the prior
  unthinned/full-strategy replay, across both windows/assets/policies/tiers/stops. No filtered-return
  compounding shortcut or raw tick copy. Four one-CPU workers stayed inside trader.slice; per-worker
  memory limits≤1.5 GiB and aggregate limits preserved. Eighteen additional central quote-path checks
  (seeds 2/3, density 64) preserve the broad result; baseline 1:20/20% return ranges 17.86–18.67% US500,
  125.11–127.35% US100. Financial source remains the original 56ac3bdfe7c1.
- Curated major context is 54 of 706observed NY sessions (7.65%): scheduled FOMC/BOJ decision dates,
  broad tariff regime changes, election day, major Iran/Israel/US war episodes and exceptional
  VIX/DeepSeek repricing dates. No routine CPI/jobs/earnings/speaker/daily tariff commentary. Sources
  and selection criteria are committed in research/night-lab-events.json. Source timestamps are
  checked against entry when verified; date-only/retrospective context remains unknown, not falsely
  ex-ante. Weekend shocks attach once to the first observed NY session. A 15% calendar-density guard
  prevents silently turning most days into major days. No new news-based trading filter is applied.
- Full-session baseline trade tags are 2/71 US500 and 2/60 US100; central baseline has none on this
  curated list. Policy decision dates were already skipped and many shock days fail price-path guards.
  Unlisted is explicitly not a verified quiet day. Trade paths shade ignored edges, show20vs26step
  denominators and actual entry/exit/spread/signal/fill gaps. Every gap summary is side by side at
  fixed 1:20/20%, with a persistent selector for detailed paired risk grids, charts, years and trades.
  Each comparison still uses its own instrument's fee-free1:1hold. The live twenty stay visibly full
  session/any positive gap. No arena restart or native update is needed for these research changes.
- Offline static cache keys now strip the gap query so bookmarked parameters survive offline reload
  without duplicating the report per threshold. Tests cover the query/offline path, all 5,184matched
  cases, all trade gap directions/thresholds, window boundaries, event timing and financial controls.
  Responsive runtime checks cover all four gap states and 1,296 visible detail cells per selected state.
  Paid app, roster, tick capture/archive, resource holds and the original two-trade record are intact.

## 2026-11-09 (Mon, user-requested) — match Night Lab hold comparisons

- User corrected the opportunity-cost comparison: US500 against US500 1:1 hold, US100 against
  US100 1:1 hold. Changed all 648 risk-cell and 20 cohort excess calculations, each dashed chart
  baseline, legends and labels. Both full-cash, zero-funding hold summaries are visible. The
  Nasdaq constituent purchase-budget snapshot remains its own separate section.
- Regenerated the published report from the same frozen inputs. Added a regression covering
  every strategy's benchmark identity/arithmetic and the original US500 cross-index mismatch.
  Presentation/research only; no agent parameters, backtests, forward records or account changes.
  No arena restart or native build is required. The static study cache revision updates with the
  report so installed PWAs receive the corrected comparisons.

## 2026-11-09 (Mon, user-requested) — twenty-member Visar cohort and Night Lab

- User expanded the requested cohort from ten to twenty: ten US500 including unchanged original
  56ac3bdfe7c1, plus ten US100. Implemented nine variants in visar-night-lab (b50b682fde5b) and ten
  in visar-night-us100 (8f1a2d30b2c0), each with one instrument/tier and an exact-source special demo
  admission. These are correlated, selected-on-history experiments, not validated leaders.
- US500 contrasts broad/step/body/retracement/rare-clean definitions across tiers 1,3,5,10,20,50,100
  and 10/20/40% loss targets, alongside the original tier200/50%. US100's independent oracle finds
  60 current-rule opportunities and all 60 fills/sides match. Its 324-cell replay shows positive
  cells only for the 16-step policy; its cohort concentrates seven risk variants there, with three
  low-exposure original/broad/body reference definitions. Do not copy US500's strongest classifier
  blindly across instruments. Published source-specific backtests exactly match all selected grid
  trades/metrics. All check-agent determinism/runtime checks pass (rare US500 clean rule has no
  trades in the recent 120-day check, as expected from three in the full window).
- Replacement roster targets 19 weak eligible forward runs, ranked by closed-trade t with N≥10 and
  a negative forward return, checked flat in virtual and actual Capital execution. No ordinary
  retirement verdict was due at the initial visit (401 early/8 keep/144 controls, no leaders; monkeys
  0/36). Reasons explicitly record user-directed capacity replacement while immature, not a normal
  statistically mature failure. Controls and original Visar run are protected; source/history remain
  in the Graveyard. Deployment/live counts are recorded after final verification below.
- Extended only named sparse-cohort no-trade windows: five body/retracement variants get 180 days,
  annual clean-50x gets 365; runtime and shared review use the same policy. The ordinary 60-day
  silence rule would otherwise invalidate an intentionally rare frequency endpoint before a useful
  observation. Error/ruin, performance maturity/demotion and source-specific re-entry rules remain.
- Added a standalone Night Lab PWA: both full 324-cell grids, 131 baseline NY-session trade paths,
  all twenty cohort members, equity comparisons, explicit risk/return/payoff/frequency/cost evidence,
  and a full-cash fee-free Nasdaq price-hold opportunity-cost benchmark. Same-window Nasdaq proxy
  returns +81.5057%, versus US500 +61.0%; this is distinct from the win rate needed for zero P&L.
  It omits dividends/direct-stock rebalancing costs, not a historical reconstruction of today's stocks.
- Purchase budget uses official Invesco QQQ equity holdings dated November 5: 101 securities, with
  fund cash/futures excluded and weights normalized. One-whole-share scenario is $27,685.80; the
  weighted whole-share scale floor is $425,133.40, set by MPWR, before rounding. Those assume a
  one-share minimum, not an unidentified cash broker's fractional rules. Read-only paced Capital
  market metadata matches 96 USD contracts; known minimum notional totals $2,391.87, an incomplete
  lower bound. SNDK/HONA/AXON/CRWV are unmatched and FER is a EUR listing. No invented full-basket
  minimum or claim of stock ownership through CFDs. No account selection, orders or settings used.
- Native/PWA search alias visar selects the twenty-member cohort, retaining the older risk twin's
  independent searches. Web snapshots and URL state preserve query, filters, sorting and page across
  detail/back/forward/reload and stage links. Native protects saved search from navigation dismissal,
  resets intentionally edited searches to the top and preserves anchors across notice/header changes.
  Twelve native domain checks and simulator compilation pass; focused 20-member search/sort,
  detail/back/forward, focal scroll anchor, both orientations and offline cold/warm restoration pass.
  Paid delivery is submitted after the verified source is committed. No physical-phone UI automation is part of this work.
- Found/fixed a startup admission race during deployment: an uploaded backtest could satisfy its gate
  after createRuns while warm-up was still in progress, and its API callback returned before readiness.
  Startup now rechecks persisted eligible results when ready. A real offline-start regression injects
  the upload during backfill and verifies a queued admission without reposting. No orders/network in
  that regression. Source/record IDs are retained across the normal systemd reload.
- Native paid job 20261109T014034Z-3148a2ba42 is installed in place and approved for renewal;
  source b9b8ad5, no phone UI launch/automation. Native focus-anchor fractions are stable across
  navigation and restart; raw pixel offset appropriately changes when header geometry changes.
- All 20 standard virtual records are present (10/10); nineteen initial Capital assignments required
  one further Tier1 slot. Excluded the weakest current eligible non-control Tier1 incumbent,
  tsmom/20d NATURALGAS at −2.91% over four closed trades, from Capital only. This is a user-directed
  capacity demotion, not a mature failure claim. Its virtual evidence continues and broker close jobs
  retain its actual deal history. Existing 19 roster retirements remain separate and archived.
- Live verification caught/corrected a new-report wiring error: the internal Capital stage parameter
  is demo, not capital. The PWA had duplicated virtual returns into its cash column. Native/main
  evidence was unaffected. Corrected the explicit stage read, added a regression with distinct cash/
  virtual returns, and versioned/purged the affected forward cache. Cohort reads pin instrument,
  tier and source hash and retain archived records, so demotion cannot masquerade as an outage.
- Final live verification: all twenty cohort records (10 US500/10 US100) are assigned to Capital demo;
  excluded incumbent has no open broker deal, queue is empty. Review: stream/model healthy, arena
  428 MB, 4,600 virtual records (553 standard/4,047 comparisons), 442/450 broker slots, no dropped
  ticks; projected two-year storage33.3GB, stress72.0GB under100GB. Verdicts401early/8keep/0leaders
  plus144controls; monkeys0/36. Original keeps its two trades, +96.9577% virtual versus +97.3535%
  actual cash. Night Lab HTTP200 and its authenticated-edge redirect verified; final cash read/cache
  verification follows the small report correction’s normal dashboard publication. No physical action
  is needed; native installation is already verified.
- Final corrected PWA feed verified live after publication: schema 2, exactly 20 source/instrument/tier
  pinned rows, 20/20 Capital assignments, original virtual 0.969577 versus actual cash 0.973535. All 19
  requested replacement histories are present in Graveyard. Standalone report/manifest/worker/icon
  assets are served by the normal UI runtime; edge authentication stays intact. Six web regressions
  pass, including distinct actual cash, archived identity and bounded offline fallback. UI diagnostics
  have zero errors/warnings; backend/regression/native-risk checks and paid/native checks pass.
- Every heavy research/build job is isolated inside trader.slice on this PC, below aggregate 50%;
  Mac builds/guest use the shared guard, exact shared guest and isolated QA bundle. Existing holds
  and original histories are preserved. No extra tick recording copy or new quote subscription.
  PWA assets plus a bounded last-complete twenty-row forward response survive offline/reboot; no
  temporary server/agent session is required. Five web contract/cache/state tests pass.

## 2026-11-09 (Mon, user-requested) — inspect all 71 night setups

- Joined every original night trade to the independent prior-session oracle, overnight reference and
  frozen low-exposure replay. This is descriptive research, not a babysitter retirement/admission
  cycle or a new optimized agent. Source 56ac3bdfe7c1, parameters, original results and demo records
  remain unchanged. All work stays within January 2024–September 2026.
- Strongest descriptive split: the 20 setups with 50–75% adverse daytime reversals have six wins,
  −18.47% mean account return/trade and lose in each calendar-year slice. Keeping only <50% leaves
  51 trades, −2.36% mean and 18.6/year versus the original 25.8/year; 2026 remains poor. Stricter
  ≤35% retains 22, roughly break-even arithmetic mean (−0.12%) but just eight/year. Efficiency ≥60%
  retains only three, all in 2024. Body ≥80% retains 18 at +1.99% mean but loses in 2025. None is
  validated. Both directions lose overall; two of eleven stopped trades finish positive at 08:27.
- Added a standalone interactive decision view and CSV for all 71 trades: declared feature bins,
  per-year samples, exploratory single-filter subsets/frequency, efficiency/reversal scatter and
  selectable previous-session paths, high/low envelopes, conservative adverse spans, exact cutoffs,
  night pullbacks, execution outcomes and spread drag. Verified desktop/mobile and interaction
  states using html_preview. No generic app panels or native/PWA feature changes were introduced.
- Private artifacts are in data/night-breakdown-20261109; findings and limitations are appended to
  visar-night-trading.md. Checks cover all date/side joins, full bin partitions, independent feature
  agreement and identical entries in the no-tight-stop comparison. Bounded one-CPU /1 GiB jobs ran
  in trader.slice; existing heavy-service holds and the one-copy tick archive were left intact.
  Research/docs only: no arena restart or user physical action required. Future variants must be
  frozen prospectively; inspected years are not fresh holdouts, and frequency must not force loose
  trend definitions. Unrelated user edits remain outside this commit.
- User clarified the decision axes during research: trade frequency from strict/loose day rules,
  and win rate at every leverage and per-trade loss target, not just portfolio drawdown. Completed
  all 324 fresh full-engine comparisons: six definitions × nine tiers × loss targets 5/10/20/30/40/50%.
  Nothing is configured beyond 50%; actual stop overshoot is shown. All ledgers reconcile, and every
  eligible night is either filled or accounted for by an entry rejection. Current-policy/50% controls
  at 1:1, 1:20 and 1:200 exactly reproduce the prior audit. All 54 current-definition cells lose.
- Interactive report opens on the win-rate grid, with return/worst-trade/portfolio-DD alternatives,
  each scenario's equity, frequency, N, win/loss sizes, same-payoff break-even win rate, streaks,
  spread drag, yearly results and human-readable rejections. 1:200/5% has 62 fills because nine
  stop-distance rejections join the original one expiry. Higher win rate can worsen profitability:
  1:50/50% wins 46.5% yet loses 68.6% overall, versus 38.0% wins and a 52.9% loss at the 5% target.
  Body ≥80% at 1:20/50% returns +9.85% with 14.87% portfolio DD, but only 18 trades /6.5 per year;
  at 1:200 it still loses 43%. These observed subsets are hypotheses, not independent validation.
- Seven representative risk cells received three extra generated-path checks (21 runs). Original
  1:200/50% remains 31/71 wins across paths; 1:200/5% ranges 61–63 fills, 9.5–11.5% wins, −82.45%
  to −75.42% total. Tight-stop fills remain approximate and the view shows these tested ranges.
  Full matrix CSV, spec, replay results, summaries and HTML builder are retained privately beside
  the original 71-trade CSV. Each replay worker was capped at one CPU /2 GiB in trader.slice;
  aggregate use stayed below the user's 50% limit. No live policy, account or production deployment
  changed. Only the research contract and journal are shipped.

## 2026-11-08 (Sun, user-requested) — night backtest versus 2/2 forward wins

- Audited unchanged source 56ac3bdfe7c1 rather than tuning it. Standard 973,384 minute rows are
  byte-identical to a fresh PG read (SHA in agent contract). Current replay exactly reproduces all
  71 primary trades, $2.205 raw /$2.21 displayed ending capital, −99.9779%, 31 wins /40 losses,
  11 stops, zero funding/errors. Independent Python/ZoneInfo feature math reproduces all 72 signal
  dates, every side, 03:27 entries and 08:27 timed exits across DST; Decimal accounting and lot-size
  checks match all 71 fills. July 3, 2024's missing 03:27 minute causes an expiry at 03:28, correctly
  explaining 72 opportunities versus 71 fills. Corrected the prior documentation's capital explanation.
- Frozen sensitivity: seeds 2/3 end $2.17/$1.85; 64 ticks/minute $2.36. Zero-spread replay still ends
  $5.70 at 1:200. Same rules at tier 20 end $6,614.25; tier 1 $9,810.31 (zero-spread $9,869.76).
  Margin use is 90%, so exposures are roughly 180×/18×/0.9×. Fresh-capital annual checks all lose:
  2024 −86.56%, 2025 −82.45%, 2026 Jan–Sep −99.13%. Small negative historical price returns,
  concentrated downside and compounding are the main explanation; neither funding nor one seed
  creates the ruin. Ordinary stop losses range about 49.8–52.3% with rounding/quote slippage.
- Replaying only 122,785 archived Nov 2–3 quotes with actual entry capital exactly reproduces the
  second win: 287.8 short, 7548.5 →7522.0, $7,626.70, zero funding. First win's entry/early path
  predates capture and remains approximate. Mixed forward replay finds the same two wins (+93.54%
  vs actual +96.96%); its first trade differs by about 0.9 index point across entry/exit, explaining
  the gap and subsequent capital/size difference. No captured quotes were copied into another archive.
- Two wins alone are plausible under historical p=31/71 (about 19.1% under independent stationary
  trials); 15/70 adjacent historical pairs won and a four-win streak occurred during the losing
  history. The recent +97% magnitude is nevertheless stronger than any historical adjacent pair
  (+87.3% maximum). About 0.97% of empirical independent two-trade resamples reach it, a descriptive
  post-observation comparison with strong assumptions, not a probability that skill/luck is true.
  Exact 95% win-rate interval for 2/2 is ~15.8–100%. One further planned −50% loss roughly wipes
  out both wins. Mirrored Capital trades are the same signals, not extra independent observations.
- Found/fixed a lab reporting defect: newer synthetic-only requests can lack recent minute inputs
  (here, tape ends Oct 21 01:34 UTC despite requested Nov 7). `uncoveredMinutes=0` had not verified
  calendar coverage. New results expose requested/actual input bounds and unknown calendar gaps;
  CLI flags large missing tails. The primary Jan 2024–Sep 2026 tape reaches its requested end and
  its financial result is unaffected. Added meaningful empty/truncated-window regressions; typecheck
  and all 165 backend/native-parity tests pass. Lab-only correction needs no arena restart.
- Audit jobs were explicitly user-requested, isolated, no-push and bounded inside trader.slice
  (up to two cores /2 GiB per replay, within aggregate 50%). Existing video/nightly holds were left
  intact; no ordinary heavy service was resumed. Agent source/roster, Capital assignments, original
  primary history and two forward records stay unchanged. No user physical action needed.
- Full results/limits/reproduction are appended to visar-night-trading.md; raw audit JSON and the
  independent oracle remain privately in data/night-audit-20261108. Continue the frozen demo
  experiment to obtain more comparable forward evidence. No profitability claim from two wins.

## 2026-11-08 (Sun, user-requested) — remove non-content

- User reiterated that the app must contain content only. Removed generic setup/strategy introduction
  cards, methodology and provenance paragraphs, repeated section headings, positive verification/
  success badges, refresh instructions, static exit-plan prose and duplicate dates/status labels.
  Native charts now lead their cards; filters show their actual comparison and signed delta in one
  line with the gauge. Recorded trade reasons, chart levels, numeric costs/limits, nonzero adjustments
  and compact missing/partial/recomputed labels remain. The PWA has the same cleanup, including its
  expanded benchmark/cost details. Research, journal history and strategy definitions remain content.
- Persisted the rule in apps/ios/AGENTS.md and apps/ui/AGENTS.md so feature work does not reintroduce
  explanatory filler. Successful-network banners and empty native headers are removed. Actual error
  states and demo controls remain functional. No agent, engine, tick/archive, account or roster change;
  the arena was not restarted for this presentation-only work. Unrelated working-tree edits retained.
- Native domain checks (11) and simulator build pass. Compact charts/gauges, portrait/landscape,
  offline content and exact first-frame/eight-second cold plus warm restoration verified. One script
  check needed Unicode-aware JSON matching for the delta symbol; the app rendered it correctly.
  Svelte check has zero errors/warnings and production build passes. PWA a7cac72 published normally.
- Paid build a7cac72 passed signing/validation, but the Mac could not reach the phone. Durable job
  `20261108T123547Z-5688e0b951` published the signed app through the existing tailnet installer and
  remains `awaiting_ota`, with automatic direct-delivery retries. Installation is not claimed. Sent
  the required desktop notification with the Tailscale/Install Trader instructions because device
  access now needs the user. Shared compiler-cache warnings were nonfatal. Simulator/owned GUI
  shut down and QA app/temporary fixture removed; unrelated work-tree edits preserved.

## 2026-11-08 (Sun, user-requested) — strategy context, criteria and near misses

- Added source-pinned explanation adapters for all 46 current families / 66 variants. Native is primary;
  PWA shares the same data. Trade inspection now shows the price lead-up and relevant moving averages,
  crosses, oscillators, bands, breakout/inside-bar ranges, session/calendar windows, volatility sizing
  and retained forecast envelopes. Each numeric condition shows its exact operator, observed value,
  cutoff, signed headroom and an allowed-region gauge. Clocks/directions use readable labels. Composite
  alternatives are combined as OR conditions; random/passive controls are not assigned fictional signals.
- Original night experiment: previous 09:30–16:00 New York path and 15-minute checkpoints, cash-open /
  minimum bullish / maximum bearish closes; then the full 22:00 → 03:27 Tirana path and reference.
  Move, efficiency, agreeing steps, conservative retrace, range, body/range, coverage, checkpoint,
  direction, calendar, clock and reference-date criteria are visible. November 3's reconstructed
  body/range is 61.909% vs a 60% minimum, only +1.909 pp headroom; the move magnitude is 0.996% vs
  0.25%, efficiency 37.780% vs 15%, and reference bounce about 6.2 points. October 16 reconstructs a
  qualifying bullish day. These explain the stored directions, not future profitability.
- New standard entry requests retain a bounded derived context in gzip-compressed `decision_frames`,
  linked to the exact virtual fill; pending-command recovery retains that link. At most 24 KiB before
  compression, four panels / 72 sampled points per series / 16 conditions. Correlated comparisons do
  not duplicate capture. Forecast surprise/envelope state is sampled before the agent overwrites it.
  The observer does not change source, RNG, strategy state, orders or financial calculations; failures
  cannot reject orders. No per-tick reconstruction or extra Capital/model request was added.
- Historical context is explicitly reconstructed from closed canonical candles, existing arena feed
  candles and daily seeds, with no bars after the known/approximated decision. Old recursive/persistent
  state and unavailable forecasts stay labeled; no model is rerun to explain the past. Retained exact
  frames take precedence; unsupported source versions fail closed to an unavailable explanation.
  Fixed a discovered historical-data gap by reading the existing retained stream bars when the held
  nightly ingest had not populated newer PG candles. Did not re-download or duplicate the tick tape.
- Read-side work remains in the separate inspector under trader.slice: serialized requests, bounded
  history (500 days / 1,200 bars per timeframe / 100,000 local minutes), six-second PG statement limit
  with parallelism disabled, existing twelve-entry / 16 MiB chart cache. Warm night reads ~0.1–1 s;
  sampled longer-lookback cold reads up to ~3.4 s. Inspector roughly 22 MB after reads. Compressed
  derived decision evidence consumes the existing non-tick growth reserve; growth remains monitored.
- Deployed ca1418c and boundary corrections 2bdac06. Verified all 4,994 forward IDs, all 66 hashes and
  all 442 exact Capital assignments unchanged. No agents, parameters, tiers, roster or histories reset.
  Final review: 4,599 virtual = 553 standard + 4,046 comparisons; control 144 / early 401 / keep 8 /
  leader 0 / retire 0, monkey sanity 0/36. Stream/model healthy, queue zero, no load errors, watchdog
  zero alerts. Tick archive continues; TimesFM stays enabled and the video/nightly holds remain intact.
- Validation: backend typecheck and 163 tests across default/native preflights, including source pins
  for every current variant, strict/inclusive boundaries, OR alternatives, prior forecast envelopes,
  non-mutating adapters, observer error isolation, compressed frame persistence/reopen and NY DST.
  Svelte check/build pass; native presentation/domain and simulator builds pass. Native session,
  filter/gauge, portrait/landscape and offline screens visually checked. Cold checking caught a one-point
  label-height redistribution despite the correct anchor/offset; fixed with explicit text sizing and
  a rounding spacer. Exact first-frame through eight-second cold restoration and warm return pass.
  QA app removed and shared simulator/owned GUI closed, with no new graphics failure reported.
- Signed native delivery installed in place on the first attempt via durable ios-push job
  `20261108T112706Z-7fa16ca4ba`, source b64db55, input hash e441595469a833f4. Approved exact
  frozen inputs for renewal; product app was not launched or driven. The shared build cache reported
  unchanged NativeKit modules recompiling (178-second build); this was a nonfatal build-cache warning,
  not an app/installation failure. Temporary fixture and dev services removed; no physical user action
  or desktop notification needed. Unrelated AGENTS/forecaster working-tree edits preserved.

## 2026-11-08 (Sun, user-requested) — native trade inspection and content-first results

- Native iPhone is the primary client. Replaced number-only recent trades with inline bid/ask charts,
  open/close markers and recorded entry/exit reasons; tap through to executable-price P&L, intratrade
  price drawdown, adverse/favorable excursion, quoted spread, a signal-to-net cost waterfall, sizing,
  coverage checks and order timing. Capital cash remains distinct from virtual equity/risk. A known
  broker close time remains marked even when its execution price was not recorded.
- A separate, read-only inspector reads the existing canonical compressed tick archive and bounded
  transfer spool; no Capital calls, writable DB connection, new raw archive or trading-thread scan.
  At most seven days / 250,000 quotes / 1,600 chunks per read; rendered series preserve extrema and
  paired bid/ask, response cache capped at twelve entries / 16 MiB. Work serializes under trader.slice,
  worker quota two cores / 1 GiB inside the aggregate six-core / 15 GiB cap. Initial two-trade reads
  peaked around 22 MB. Enabled systemd restart/startup and committed deploy integration persist over reboot.
- Verified both original night trades against stored fills. November 3: 12,285 valid recorded quotes,
  complete coverage, $7,626.70 net, $172.68 spread, signed decision-to-fill timing cost $86.34,
  zero funding, $3,079.46 maximum price drawdown and 16.08% maximum relative drawdown. October 16:
  4,017 quotes plus fallback minute candles; first hours and a reconnect interval lack ticks. Its
  observed $2,906 drawdown is a lower bound; paid spread remains unknown. No tick order, fee, reason
  or broker fill price was invented. Funding is a terminal recorded amount, not a fabricated path.
- PWA pass deployed: results/bar comparisons and trade charts lead; extended filters, methodology,
  source and logs are behind details. Compact navigation, monthly/market charts and trade tables fit
  phone portrait/landscape. Checked 390×844, 844×390 and desktop, light/dark; no page-width overflow.
  Web chart axes use UTC consistently. Native charts use the phone's local dates/times.
- Backend deploy b580701 preserved every active/historical run identity, all 66 source hashes and
  all 442 exact Capital assignments. Original night source/special admission intact; no agent source,
  roster, fill, P&L, retirement or history changed. Post-deploy review: 4,599 active virtual records
  (553 standard, 4,046 correlated comparisons); control 144 / early 401 / keep 8 / leader 0 / retire 0;
  monkey sanity 0/36. Stream/model healthy, broker queue zero, no load errors, watchdog zero alerts.
- Storage snapshot 13.37 GB; measured two-year estimate 33.2 GB, four-times-rate stress 72.7 GB /100 GB.
  One compressed archive, recurring timer and advancing acknowledgements. TimesFM remains enabled;
  video/nightly lab holds retained. No addition/backtest batch or account-setting operation performed.
- Validation: backend typecheck, 155 tests across default/native preflights; dedicated inspection tests
  cover executable-side drawdown, gaps, rejected quotes, extrema, stable indices and Arena-only deal
  selection. Four native API authorization/validation tests and Svelte diagnostics/build pass. Public
  authenticated inspection succeeds; anonymous access remains 401; other web routes retain Authelia.
- Native simulator checking found an existing cache/refresh race on newly opened saved screens offline;
  fixed cached-first loading before refresh. Ten Swift domain tests and unsigned final build pass.
  Native screenshots verified price/decision/cost screens, both orientations and the older trade
  with partial capture. Exact cold first-frame through eight-second restoration and warm return
  pass after persisting the connection notice. QA used an isolated bundle and private derived
  fixtures, never real credentials or demo mutations; guest/GUI closed and QA app uninstalled.
  Signed paid build installed in place on the primary iPhone on the first delivery attempt, job
  `20261108T100131Z-e357947495`, source commit 2314d79. Exact frozen inputs approved for renewal;
  no uninstall, product-app launch or phone UI automation. Public native data verified separately.
  Final health/counts unchanged, archive acknowledged through 44,498,848 with zero received-tick
  losses. No physical user action or desktop notification needed. Unrelated working-tree edits preserved.

## 2026-11-05 (Thu) — virtual day 28.7; first mature demotions

- Health after review/deploy: 66 loaded variants, 4,599 active virtual records = 553 standard + 4,046
  correlated execution comparisons; 444 Capital assignments across nine healthy Arena accounts.
  Stream/TimesFM reachable, correct hedging/tiers, fresh reconciliation, queue/pending commands zero,
  no foreign positions, missing open IDs/prices, unpriced closes or load errors. Watchdog zero alerts.
  Read-only Capital probe passed all 20 markets on Arena 01; no test orders or account changes.
- First 28-day decisions fired automatically November 4 around 17:48 local. Verified two virtual-only
  BTCUSD records archived to backtest and retained in Graveyard: macd-trend/ema200 at 1:100 (31
  closed trades, t -1.3105, return -7.35%) and macd-trend/ema50 at 1:100 (30 trades, t -2.1203,
  return -9.33%). Both satisfied the trade/day/loss thresholds. They are individual run retirements;
  other markets in the family continue. Source/reasons/history retained; no roster/source reset.
- Six losing mature runs lost Capital slots and continue virtually with fresh observation from that
  demotion: ema-cross/9-21 EURUSD and ETHUSD at 1:10; hma-slope BTCUSD, ETHUSD and OIL_CRUDE
  at 1:50; rsi2-reversion/both ETHUSD at 1:10. Verified 30–39 lifetime trades and t below -1 for each,
  persisted fresh-window timestamps, and no remaining actual open deals for those six runs. Their
  old evidence is preserved. Arena 05/07 now each have 47 assignments; six slots stay vacant because
  replacements must earn the existing gate. No new candidate or control was shoehorned in.
- Current verdicts: control 144, early 401, keep 8, leader 0, retire/retired zero in the active review;
  the two archived records are outside that active list. Monkey sanity 0/36. No additional manual or
  whole-agent retirement needed. Keep means continued observation, not proven skill. Model-dependent
  runs retain their known-outage adjustment and remain early. Added none (Thursday); next ordinary
  window November 9 remains conditional on explicit lab resumption and resource/admission gates.
- Fixed a reboot-only comparison lifecycle bug found during this audit. Existing frozen latency
  records could continue after a standard record retired, then be incorrectly archived at restart as
  an unplanned tier. They now restore independently, while new comparisons still require an admitted
  standard run. Retired standards and explicitly retired comparisons stay retired; no new experiment
  is admitted by the fix. The two retired BTC MACD records never had comparison copies, so no live
  history had to be recovered or rewritten. Reproduced the defect in an isolated database test first.
- Shipped 872b566. All 149 backend tests pass with native parity, including two database reopen cycles
  preserving an open comparison position/state without reviving retired rows or adding records, even
  with a passing backtest. Typecheck and packaged/native deploy preflight pass. Actual restart preserved
  every one of 4,599 active IDs, 4,046 comparison IDs, all 66 source hashes and all 444 exact Capital
  assignments. Graveyard now has 395 forward records across 41 versions. Capture session metadata
  records an approximately 11.2-second planned restart gap; no synthetic quotes relabeled as captured.
- A host reboot was observed at 09:42 local during this visit (cause not established here). TimesFM
  automatically restarted at 09:42:36 and loaded its cached CUDA model in 6.4 seconds, while the
  nightly hold remained intact. The pre-reboot ID/hash/assignment baseline also matched after the
  subsequent planned deployment; automatic retirements and fresh demotion windows survived both.
- Reviewed 15 recent broker-cycle errors (12 timeouts, three Capital /session 504 responses), all in
  the November 4 22:20–22:35 local interval. Normal recovery/reconciliation succeeded; no ambiguous
  order was manually replayed. Current accounts/deals are reconciled with lastError clear. Source
  response latency sample median/p95 about 99/124 ms; latest poll about seven seconds, event-loop
  p95 1 ms. Historical maxima remain historical; there is no current command backlog.
- TimesFM remains on CUDA; initial arena counters showed 88 forecast requests with zero failures.
  Allocated GPU memory about 1.33 GB. Its enabled offline-cache startup succeeded on this boot;
  the model-only resume persists while nightly lab holds remain intact. All running Trader services
  share trader.slice (six CPU cores / 15 GiB); no training, precompute or nightly job started.
  Pre-deploy 60-second sample: 3.87% of one core, one-second p95 8.0%, max 23.0%; RSS 507–540 MB
  during reads, with post-deploy review at 327 MB. Monitor transient memory headroom before additions.
- Tick archive has future minute triggers and advancing acknowledgements, unchanged journal identity,
  zero received-tick drops/invalid messages/recording errors. Verified through sequence 39,049,850
  after deploy, with normal bounded pending batching. One canonical compressed archive; no extra tick
  copy/history deletion. Storage refresh: 13.3 GB project, 284.7 MB tick table at that snapshot; two-year
  33.3 GB and four-times-rate stress 73.3 GB / 100 GB including reserve. These are projections.
  Attached 40 missing archived-quote cost references; final sampled strategy coverage 2,898 / 4,587
  stored trades. Old decision timing/pre-recording costs remain unknown; prices/P&L were not rewritten.
- Original night source 56ac3bdfe7c1 and its special demo assignment remain intact. Rechecked official
  [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm),
  [BOJ 2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf) and
  [BOJ 2027](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf) calendars: stored
  decision dates unchanged, coverage through 2027-12-31 still exceeds 90 days. No agent/calendar source
  changed. Public/native reads and browser sign-in policy pass; three dashboard reads took 0.39–0.59 s.
- Re-review confirmed 444 assignments and unchanged verdicts with zero watchdog alerts. Journal/idea
  log publish separately without another arena restart. Preserved the unrelated forecaster working-tree
  edit. Next: watch fresh post-demotion samples, mature keep candidates, comparison continuity and
  memory headroom. No desktop notification or physical user action needed.

## 2026-11-02 (Mon) — virtual day 25.7; healthy observation

- Health: 66 loaded variants, 4,601 virtual records (555 standard, 4,046 correlated execution
  comparisons), all 450 exact Capital assignments preserved across nine Arena accounts. Stream
  connected, fresh account reconciliation, correct tiers/hedging, queue zero, no pending virtual
  commands, missing open IDs/prices, unpriced closes, foreign positions or load errors. Read-only
  Capital contract probe passed all 20 markets on Arena 01; no orders or account-setting changes.
- Reviewed all 32 error entries in the last three days: 26 connectivity failures (11 stream logins,
  15 broker jobs/cycles) and six broker-job timeouts, concentrated October 30 and the November 1
  10:41–10:52 local connectivity interruption. Normal reconnect/reconciliation recovered. Short code
  1006 reconnects also occurred, especially Saturday morning; current stream has been stable since
  Sunday 23:04 local. Their cause is not established by the logs. No ambiguous order was replayed
  manually. Capture gaps remain recorded as gaps; zero received-tick drops does not imply every
  quote during an external outage was captured. Watchdog dry run zero alerts; no user action needed.
- Verdicts unchanged on re-review: control 144, early 411, keep/leader/retire/retired zero; monkey
  sanity 0/36. Retired none. Added none: the frozen October 29 batch is only four days old, so the
  next ordinary Monday window is November 9, and the nightly lab hold still forbids heavy additions/
  backtests until explicitly resumed. There are 399 numerical virtual slots; headroom remains a gate.
  The first older cohorts approach their 28-day threshold around November 4; do not judge/tune early.
- TimesFM remains enabled and reachable on CUDA after the user's model-only resume. The arena has
  made 176 successful forecast requests with zero failures since its latest start; the model health
  counter shows 177 successful requests including yesterday's smoke check. Allocated GPU memory
  about 1.33 GB, process-reserved memory about 1,494 MiB. Known model downtime stays excluded from
  maturity; other user holds remain intact. No GPU training/precompute or nightly batch was started.
- Resource check: all three running Trader services remain in trader.slice, capped at six CPU cores /
  15 GiB. A 60-second process sample measured 4.51% of one core, one-second p95 8.0%, max 44.0%;
  RSS 485.5–510.3 MB. The initial review briefly reported 536 MB; later status settled to 429 MB.
  Event-loop p95 1 ms, latest poll about 7 seconds, median/p95 sampled HTTP response 96/120 ms.
  Continue watching transient API/GC memory bursts before expanding the pool. All live services and
  archive/watchdog timers are enabled, user lingering is enabled, and the archive timer has future
  calendar triggers; no restart was needed during this visit.
- Archival is recurring successfully and acknowledgements advanced, same journal identity, zero
  received-tick drops, invalid messages or recording errors. Canonical archive verified through
  sequence 31,127,435 at the storage check; normal bounded transfer batching leaves a short pending
  tail. One permanent compressed tick archive, 226.5 MB tick table. Refreshed whole-project storage
  13.2 GB, two-year estimate 32.6 GB, four-times-rate stress 70.2 GB / 100 GB, including non-tick
  reserve. These remain measured-rate projections. No history deleted or additional tick copy made.
- Attached 76 missing archived-quote cost references after archive verification; no fills, P&L or source
  changed. Final sampled non-control coverage 2,153 / 3,863 stored trades. These are inferred archived
  fill-price matches; pre-recording costs and old decision timing remain unknown. Original night
  experiment retains source 56ac3bdfe7c1, its demo assignment, one historical closed trade, and is flat.
  Each of the four new quote-breakout standard records is running with one closed trade. Graveyard
  still preserves 393 forward records across 41 versions and their sources/reasons.
- Rechecked official [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm),
  [BOJ 2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf) and
  [BOJ 2027](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf) schedules: stored
  decision dates unchanged, coverage through 2027-12-31 remains beyond 90 days. No calendar/agent
  source was edited. Public native reads succeed, anonymous native access returns 401, browser
  access retains the sign-in redirect; three dashboard reads completed in 0.39–0.62 seconds.
- Only this journal and idea-log update ship today, with no arena restart or recording interruption.
  Preserved the unrelated forecaster working-tree edit. Next: watch mature-evidence eligibility,
  forecast continuity, self-recovered connectivity interruptions and memory headroom. No desktop
  notification or physical help required.

## 2026-11-01 (Sun, user-requested) — resume TimesFM GPU only

- Explicitly resumed TimesFM without invoking the all-workloads start command. The video pipeline was
  already running and was left alone; the nightly lab remains inactive/held. The persistent hold now
  excludes only trader-forecaster.service, retaining its other entries and original pause timestamp.
- Enabled the model service for subsequent boots. Its ExecCondition reads the service list afresh at
  every start; legacy/malformed holds fail closed, and a later heavy-resources-stop writes the full list
  again and takes precedence. Scoped state writes use atomic replacement plus file/directory fsync.
  Dependency evidence, review/watchdog and native status distinguish the model resume from other holds.
- Service loaded google/timesfm-3.0-pytorch on CUDA in 7.3 seconds, with 1,323 MB allocated GPU memory.
  HF_HUB_OFFLINE=1 uses the existing local checkpoint, avoiding a network dependency during reboot.
  A 512-point synthetic-input smoke request returned 16 finite forecast steps and nine quantiles in
  2.975 seconds. No training, historical batch, Capital order or account change was used for this check.
  The arena's normal five-minute probe detected the model again and ended its known dependency pause.
- Resource containment unchanged: model/arena/UI in trader.slice, aggregate six CPU cores / 15 GiB.
  No nightly schedule or unrelated pipeline control was resumed. The existing uncommitted forecaster
  memory-trimming edit is preserved separately. No strategy source, admission, allocation or history reset.
- Validation: 148 backend tests including native parity, two Python scoped-hold/restart-policy tests,
  three native API authorization tests; typechecks and production UI build pass. The Python checks
  simulate a new process reading a resumed hold and a later global stop, without rebooting the PC or
  stopping other workloads. The enabled service's cold start succeeded using the offline cache.

## 2026-10-29 (Thu, user-requested) — public dashboard timeout recovery

- Investigated the screenshot's empty leaderboard. Hetzner's Trader block forwards both protected
  web and device-key routes to the PC gateway; local/public status identifies the same active arena.
  No stale Hetzner writer was started and no shared edge/authentication rule needed changing.
- Repeated twelve local web loads and health probes: all succeeded, page times 0.34–1.62 seconds.
  The dashboard nevertheless had a real recovery bug: a deployment/backend timeout stayed on screen
  until manual reload, and a failed scenario-count request discarded otherwise successful rows.
- UI-only repair: independent primary/supporting loads; automatic visible-tab refresh every 30 seconds
  and failure retries after five seconds, with no overlap. A bounded memory-only last-success summary
  can keep rows visible for up to ten minutes during an outage, explicitly labeled with its timestamp.
  Cache keys separate actual cash, backtests, archived runs and execution scenarios; six pages / 16 MiB
  maximum, no credentials or raw ticks. Optional evidence/count failures are warnings; unknown counts
  are no longer shown as zero. Timeout messages no longer expose an internal loopback address.
- Validation: nine UI/domain/authentication tests pass; Svelte diagnostics clear and production build
  passes. Isolated production-build fault injection verified healthy rows, supporting-endpoint failure,
  primary outage with labeled retained rows, and fresh recovery. Trading backend/source/assignments,
  recording and resource hold remain unchanged. Publish via the UI watcher only; no arena restart.

## 2026-10-29 (Thu, user-requested) — agent evidence and frozen execution study

- Shipped arena/dashboard `54984fa`: common-date 1:1 controls, exposure/stop downside, cost coverage,
  family grouping, calibration/admission labels and known forecast-outage clocks. Price/funding/fill
  rules and engine version are unchanged. Existing 63 source hashes, 551 standard IDs, all 450 exact
  Capital assignments and 393 archived forward records across 41 versions were preserved. Original
  night source `56ac3bdfe7c1` and its special demo admission remain unchanged.
- Live: 66 registered variants, 4,601 virtual records = 555 standard + 4,046 correlated comparisons;
  55 non-control forward variants. Verdicts: control 144, early 411, keep/leader/retire/retired zero;
  monkey sanity 0/36. Retired none. The four new standard records and 36 latency comparisons are
  the two frozen quote-breakout variants on US500/US100 at tier 3, 0.5% planned risk. Existing gates
  admit all four to virtual observation; none is promoted to Capital. Capacity remains 50 per tier,
  450 assignments total, with 399 numerical virtual slots free.
- Frozen primary backtests (Jan 2024–Sep 2026): immediate/gated US100 +22.9%/+20.8%, Sharpe
  1.03/1.06; US500 -3.1%/+2.5%, Sharpe -0.13/0.20. The small-risk night twin returned -4.9%, DD
  5.0%, Sharpe -1.25 over 71 trades: rejected by the ordinary gate, visible in backtest only, with no
  inherited demo exception. No tuning followed the results. Seed-7 and tiny recorded-only checks
  remain separate sensitivity records; historical synthetic spreads cannot establish a tick-execution
  edge. Brief: [RESEARCH-2026-10-29.md](RESEARCH-2026-10-29.md); outcomes:
  [agent-health note](../../../research/topics/agent-evidence.md).
- New fills capture midpoint/spread references and known decision timing. The live archive audits
  attached 2,438 inferred quote-side matches (2,349 initially, then 89 after archival caught up), without
  rewriting prices/P&L or raw quotes. At the final evidence snapshot, 1,871 of 3,559 stored non-control
  trades had coverage; pre-recording entries remain unknown. Old decision timing remains unknown
  even when both archived fill prices match. The frozen 1,799-trade example was negative before
  quoted spread, so funding alone did not explain that subset; it is virtual money, not actual Capital
  cash or a portfolio. Actual realized cash, open P&L and unallocated adjustments remain distinct.
- Common-date TSLA comparison in the frozen copy: volatility-managed +6.62494%, hold +6.62173%,
  only about 0.0032 percentage points apart. Different lifetime start dates had exaggerated their
  apparent difference. Excess return is explicitly not risk-adjusted alpha. Forecast-dependent runs
  show the persistent user hold and exclude only known downtime from virtual maturity/promotion;
  older unknown outages are not invented. Open holdings with no closed trades are not called silent.
- Validation: 147 backend tests pass with native parity enabled, six Swift tests pass, typechecks and
  web production build pass with zero Svelte diagnostics. Frozen-copy existing business fields match
  for virtual/actual/backtest leaderboards, agents and original night detail. Ten web routes returned
  200; evidence cards inspected at 390/728px. Snapshot-free list reads, a covering deal-identity index,
  cached forward aggregates and lazy historical cost reads keep reporting work off the quote path.
- Deployment needed one clean restart. Host disk waits delayed save/restore beyond the deploy
  script's readiness deadline; the service continued and became live at 21:47:44 local without a
  second restart. Capture sessions explicitly retain the approximately 6m58s gap from the last
  pre-restart received quote to the new connection; candles are not relabeled as recovered ticks.
  Post-deploy 60-second sample: 4.28% of one core, one-second p95 23.0%, max 46.0%; RSS
  403.5–643.7 MB, ending 403.5 MB. Monitor API/GC bursts and disk latency before further additions;
  the approximate 500 MB target is not a claim that every transient read stays below it.
- Found and repaired a separate archive schedule failure after today's 15:52 PC reboot: timer was
  active/elapsed, next trigger infinity, service inactive since 15:45. About one million received
  quotes remained safely in the protected spool. Switched to a persistent minute calendar timer;
  verified the unit/calendar, recurring successful runs and future triggers. Drained/read-back/acked
  through sequence 26,844,468, same journal identity, zero received-tick drops, invalid messages or
  recording errors. No captured history deleted or second permanent tick copy created. Removed the
  temporary app-state validation database. Storage refreshed: 13.1 GB now, two-year 33.4 GB,
  four-times-rate stress 74.3 GB / 100 GB, including non-tick reserve; estimates, not guarantees.
- Native update `55c99bbd1d99b77a` built/signed and installed wirelessly in place on the unlocked
  primary phone. Its diagnostic confirms this revision, live data and 501 actual-demo history rows;
  pairing bootstrap absent and November 25 renewal retained. New simulator screen/restoration QA
  is incomplete: the old guest reported Data Migration Failed before app checks. Stopped the guarded
  session, verified no guest/GUI/owned command remained and no new panic/GPU reset. No repeated
  boot, erase, driver change or physical-phone UI test substituted. Both builds and domain tests pass.
- Reconciliation recovered normally; no manual order replay/account changes. Authenticated native
  reads work locally and publicly, anonymous access returns 401. Watchdog dry run zero alerts. Both
  live units remain in trader.slice; TimesFM/nightly stay held, and the unrelated forecaster edit is
  preserved. Only scoped CPU validation was authorized by this user request; no GPU/nightly restart.
  Next ordinary addition window is November 9 (Monday, at least seven days after this batch), still
  subject to resource resumption and headroom. No desktop notification or physical help needed.

## 2026-10-29 (Thu) — virtual day 21.7; healthy observation

- Health: 4,561 virtual runs (551 standard, 4,010 correlated execution comparisons), 63 loaded variants,
  all 450 Capital assignments preserved across nine correctly hedged/leverage-tiered Arena accounts.
  Stream connected, fresh account reconciliation, broker queue zero, no pending virtual commands,
  load errors, unconfirmed active deals, foreign positions or unpriced broker closes. Read-only Capital
  market probe passed all 20 instruments on Arena 01; no orders/account changes. Watchdog zero alerts.
- Sanity-checked all five errors in the last three days. The October 27 US500 open timed out, then
  reconciliation adopted its confirmed position within the next minute. The October 28 EURUSD order
  with a missing confirmation was marked failed after no matching position was found; a subsequent
  entry closed normally. Remaining account/cycle timeouts recovered. No ambiguous POST was manually
  replayed, no broker position was left untracked, and no platform/agent repair was needed.
- CPU follow-up: a 60-second sample measured 3.27% of one core, one-second p95 7.0%, maximum 14.0%,
  1,890 received quotes, event-loop p95 1 ms. The selected JS backend and arena-only single-marker
  configuration remain active; both live services share the capped trader.slice. RSS briefly reached
  521 MB during API checks and a later review reported 509 MB; a separate 30-second read-only process
  sample settled at 419–421 MB. This is a burst above the approximate 500 MB target, not a sustained
  outage or a reason to restart trading. Watch memory headroom before any new admissions. No heavy
  replay/build/model/backtest work was started; the user's TimesFM/nightly hold remains intact.
- Verdicts: control 144, early 407, keep/leader/retire/retired zero; monkey sanity 0/36. Retired: none.
  Added: none (Thursday). Still 439 numerical virtual slots free; next ordinary addition window
  November 2 also requires explicit heavy-work resumption, memory headroom and the usual gates.
  The oldest cohort reaches 28 days around November 4; do not judge it early or tune away losses.
- Restore-accounting follow-up: all 9,347 virtual trades closed since the October 22 fix have exact,
  nonnegative holding counters, with no partial counts in that sample. Old invalid raw values stay
  preserved. The night experiment keeps source 56ac3bdfe7c1 and its demo assignment, is flat with one
  historical closed trade and no overdue actual position. Graveyard retains all 393 archived forward
  records across 41 versions; every source and recorded reason remains available.
- Archive/read-back/acknowledgement verified through sequence 25,048,035, with the same journal
  identity, zero dropped received ticks, invalid messages or recording errors. One permanent compressed
  PostgreSQL archive, 182.9 MB tick table; no history removed or extra tick copies created. Refreshed
  whole-project storage 13.0 GB, two-year estimate 32.9 GB, four-times-rate estimate 72.6 GB against
  100 GB, including the non-tick reserve. These remain measured-rate projections.
- Official [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm),
  [BOJ 2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf) and
  [BOJ 2027](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf) calendars rechecked:
  decision dates unchanged, including October 28 FOMC and October 30 BOJ; coverage through 2027-12-31
  exceeds 90 days. Browser access redirects to sign-in; native reads succeed with the device credential
  and anonymous native access returns 401. No credentials printed or control mutations performed.
- Re-ran review: unchanged runs/assignments/verdicts and no retirements. Only journal/idea-log updates
  ship today, with no arena restart or recording interruption. Preserved the unrelated forecaster
  working-tree edit. Next: watch RSS bursts, archival growth and mature-judgement eligibility.
  No desktop notification or physical user action needed.

## 2026-10-26 (Mon, user-requested) — CPU optimization loop and Rust risk prototype

- Investigated CPU spikes with live per-thread samples, hardware perf counters, a frozen production
  snapshot and captured quotes. Original 60-second live sample: 19.94% of one core on average,
  37.99% one-second p95, 46.98% maximum, 2,221 received quotes, 170 MB RSS. GC helpers accounted
  for 54% of an initial perf sample; a later live minute spent 9.48 CPU seconds in heap helpers
  versus 5.01 seconds on the main thread. Trading arithmetic alone was not the live bottleneck.
- Removed per-quote run-ID dirty lookups, empty-queue rule checks and no-op tick-callback dispatch;
  eliminated temporary stop objects and cached funding-day results for identical quote timestamps.
  Every run still processes tick risk/account updates, and capture remains lossless for received quotes.
  No agent source, sizing, leverage, lifecycle threshold or history changed.
- Built a Cargo-locked Rust/Node-API risk core with contiguous instrument-local buffers, sparse state
  updates, no per-position JSON/IPC/allocation/threads and a checked synchronous boundary. It covers
  long/short equity, drawdown, fixed/trailing stops, targets and margin checks. Funding, delayed orders,
  scheduled/session exits and callbacks retain the reference path. Fixed an installed-Bun typed-array
  mutation incompatibility by using Buffer views; ABI/mutation canary and boundary checks guard startup.
- Nine final unprofiled trials replayed the same 4,561-run snapshot and 4,794 archived quotes. Identical
  full snapshot/trade/equity/log digest throughout. Median tick CPU: original 801.6 ms, optimized JS
  522.4 ms, JS plus Rust 569.6 ms; quote p95 0.231/0.146/0.158 ms. The selected JS path saves 35% CPU
  and 37% p95 in that workload. Rust remains opt-in because the bridge still loses to optimized JS;
  paced trials also failed to establish a native latency advantage. A larger account-state port is the
  next Rust candidate, with differential replay required before admission. Research/design/commands:
  [PERFORMANCE.md](../PERFORMANCE.md).
- Did not stop at the replay result: the first live post-deploy minute still averaged 24.1% of one
  core. Paced replay with persistence/dashboard reads tested default, two and one GC markers; one
  reduced total CPU about 21%, with unchanged results/quote p95 and about 120 MB extra RSS. Applied
  BUN_JSC_numberOfGCMarkers=1 only to the arena, through committed deploy/install configuration.
- Two consecutive live minutes after that change averaged 3.15% and 3.30% of one core, with p95
  12%/10%, maxima 22%/20%, 1,840/1,834 received quotes and 258/271 MB RSS. This is about 80–81%
  less CPU per quote than the original live sample. Event-loop p95 1 ms; GC helper CPU threads are
  gone. These are short measurements, not a promise about every future market/bar burst. Watch RSS.
- Validation: 136 backend tests (including native/reference parity through callbacks, funding, DST,
  pending orders, restore and removal, plus persistence/invalid-buffer regressions), Rust unit test,
  typecheck, Rust formatting/Clippy, packaged native build/canary/parity and paced benchmark smoke.
  Added a reusable bounded offline replay tool, including optional paced delivery and real dashboard
  read handlers. All build/replay work ran within trader.slice. The scoped request authorized these
  optimization jobs; TimesFM/nightly lab and the explicit resource hold remained untouched.
- Deployed b2e95e8, then 9b25c93. All 4,561 run IDs, 63 source hashes, 450 Capital assignments and the
  recording journal identity survived exactly; zero new runs/load errors. Two planned restarts left
  about 24.6 seconds of explicit session coverage gaps. Zero dropped received quotes; no continuous
  history was invented across those gaps. One archive job hit restart downtime; subsequent archival
  caught up and the watchdog returned to zero alerts. No other account/app or user forecaster edits
  were changed. No model resumption, new agents, retirements, or physical user action.
- The canonical compressed archive remains the only permanent tick copy. Temporary application-state
  snapshots used for benchmarking are removed after validation; no raw quote copies were created.
  After cleanup, refreshed project estimate: 12.9 GB, two-year 32.3 GB, four-times-rate
  69.8 GB against 100 GB. Next: monitor live CPU/RSS and archive continuity, then profile the next
  bottleneck before expanding Rust. Keep the fastest measured backend active.

## 2026-10-26 (Mon) — virtual day 18.7; observation continues

- Health: 4,561 virtual runs (551 standard, 4,010 correlated comparisons), 63 loaded variants and all
  450 Capital assignments across the nine intended leverage tiers. Every account is hedged, correctly
  leveraged and recently reconciled; no killed accounts, load errors, pending virtual commands or
  unpriced closes. Broker queue drained from two to zero during inspection. Arena observed at
  173 MB RSS, 19% of one CPU core, event-loop p95 2 ms, last poll 6.9 s, HTTP p95 117 ms and adverse
  open slippage p95 3.57 bp. Arena/UI still share the capped trader.slice.
- The four errors in the review are recovered events: one broker connection failure on October 23
  and three Capital session HTTP 500s on October 24. The stream has remained connected since
  October 24 at 21:04 UTC; current quotes and account reconciliation are fresh. Read-only Capital
  contract probe succeeded on all 20 markets using Arena 01. No probe orders or account changes.
  Watchdog dry-run reports zero alerts. No repair or arena restart was necessary.
- Verdicts: control 144, early 407, keep/leader/retire/retired 0; monkey sanity 0/36. Retired: none.
  Added: none. Today meets the ordinary addition cadence, with 439 virtual slots free, but the user's
  explicit heavy-resource hold still defers admission backtests and additions. TimesFM and the
  nightly lab remain stopped; no heavy batch or GPU work started and no hold marker was cleared.
  Next ordinary addition window November 2, subject to resumption and the usual gates.
- Holding-counter follow-up: all 3,885 virtual trades closed since the October 22 deployment have
  nonnegative, exact holding counters; no partial counts in that sample. Earlier invalid raw counters
  remain preserved. The night experiment retains source 56ac3bdfe7c1 and its Capital assignment,
  is flat with one historical closed trade, and skipped this morning after a neutral Friday session.
  No parameters, source hashes or lifecycle thresholds changed.
- Tick archive: forced transfer/read-back/acknowledgement succeeded through sequence 17,805,212,
  preserving the same journal identity and single canonical compressed PostgreSQL copy. Zero dropped
  received ticks, invalid messages or recording errors. Compressed tick table 128.7 MB; whole project
  12.6 GB. Refreshed two-year estimate 31.7 GB, four-times-rate estimate 68.0 GB against 100 GB,
  including the non-tick reserve. These remain measured-rate forecasts; no captured history removed.
- Graveyard integrity: 393 archived forward records across 41 versions, every source and retirement
  reason present. Public browser requests still redirect to Authelia; anonymous native API access is
  refused and authenticated native status/agents/Graveyard reads succeed. No app control mutations.
- Rechecked official [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm),
  [BOJ 2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf) and
  [BOJ 2027](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf) decision schedules:
  stored dates match, including October 28 FOMC and October 30 BOJ; coverage through 2027-12-31
  exceeds 90 days. No calendar/runtime change required.
- Dashboard publication exposed dependency audit warnings. Updated compatible UI dependencies to
  SvelteKit 2.70.3, Svelte 5.57.2, Vite 7.3.7 and patched transitive packages; minimum direct versions
  and the lockfile agree. Audit fell from seven high/one moderate/two low package entries to four low
  entries, with no moderate/high/critical findings. Remaining entries cover Kit/adapters and cookie:
  the [enhanced-form redirect](https://github.com/sveltejs/kit/security/advisories/GHSA-pfhg-q3qv-9q6r)
  requires catch-all form actions (our enhanced actions use the fixed /broker route), the
  [prerender XSS](https://github.com/sveltejs/kit/security/advisories/GHSA-27mw-82g8-phjj) requires
  untrusted prerender cache headers (not used), and this app does not set cookies with untrusted
  names/options. A future Kit 3 migration can remove these low entries; no forced major update today.
  Clean Svelte diagnostics, production build and all three native API contract tests (13 assertions).
  Isolated loopback production smoke passed ten rendered pages and four authenticated native reads;
  anonymous native access still fails closed. The temporary server was stopped after verification.
- Re-ran review with unchanged run/assignment/verdict counts. Dashboard dependencies and journal
  publish through the normal UI deploy; no arena restart or interruption to tick capture. Existing
  unrelated forecaster edits were preserved. Next visit October 29: watch feed/archive continuity,
  time stops and the observation windows as the oldest cohort approaches 28 days. No desktop
  notification needed.

## 2026-10-25 (Sun, user-requested) — native Trader iPhone app

- User superseded the mobile-web request with a native iOS app and authorized delivery when the
  paired phone was reachable/unlocked. Built a UIKit/iOS 26/Swift 6 client using the existing NativeKit
  and trusted Mac workflow. Portrait/landscape rankings, agents/parameters/source, run equity/trades,
  actual demo evidence, Arena accounts, confirmed mirror/exclusion controls, latency cohorts,
  Graveyard, journal, research and platform health are native screens.
- Native access uses a dedicated device credential: only its SHA-256 hash is kept in the private UI
  environment. Exact native API routes validate the credential and allowlist reads/demo controls;
  the website keeps Authelia. No Capital credentials or ARENA_TOKEN enter the app. The pairing seed
  was delivered through the paired app data container, imported into the phone's device-only Keychain
  and removed. Anonymous API access returns 401. No credentials, products or raw captures committed.
- Cache-first rendering, actor-based parsing/sorting/formatting, background atomic writes, bounded
  cache and foreground-only refresh. Updates wait during list movement. Fixed startup search callbacks
  that reset saved anchors; cold restore now matches every recorded sample from the first frame,
  and warm return matches. Reused fonts/stat views; sampled simulator cell work max 1.9 ms and cached
  list application max 0.8 ms. These are app spans, not a claim about physical-phone scrolling frames.
- Validation: four Swift domain tests, three API auth/validation tests, clean Svelte diagnostics,
  simulator native-screen/orientation/offline/archive-source batch, cold and warm restore checks.
  Corrected execution cohort query validation to accept their display names; authenticated live check
  returned 401 correlated rows with comparison flags and no independent verdicts. No demo controls
  were activated during testing. The ordinary website still redirects to sign-in.
- Paid ARM64 build and signature/profile/team/device membership verified. Installed and launched
  wirelessly on the unlocked primary phone. Its runtime diagnostic reports source 925c0a25fbd99af3,
  live API data and 501 actual-demo records (including past assignments). Temporary pairing file is
  absent. Monthly renewal registration/baseline approved; the first scheduled renewal succeeded,
  advancing the profile from October 13 to October 25, 2027. Next renewal due November 25.
- Source, scripts, vendored Kit, icon and operation guide live in apps/ios. The signed IPA is generated
  locally and ignored. Shared native/renewal docs include Trader; no shared Kit code changed, unrelated
  apps/data were not modified, and the simulator was shut down after verification.
- Platform sanity: 4,561 virtual runs, all 450 current Capital assignments, feed connected, no load
  errors, demo mirror enabled. TimesFM/nightly lab remain under the user's explicit heavy-resource
  hold. No agents added/retired or strategy thresholds changed; no trading engine restart needed.
  Details: [native app guide](../../ios/README.md).

## 2026-10-22 (Thu) — virtual day 14.6; holding-bar recovery

- Health: feed connected, 4,561 virtual runs (551 standard, 4,010 correlated comparisons), all 450
  Capital assignments preserved across the nine intended tiers; no load errors, broker queue or
  unpriced closes. Observed 326 MB RSS after warm-up, 27% of one CPU core, event-loop p95 2 ms,
  HTTP p95 121 ms and adverse-open slippage p95 3.76 bp. The two review errors are old October 19
  broker timeouts; none have repeated since then. Both live services remain in trader.slice.
- The explicit heavy-resource hold remains active. TimesFM and the nightly lab stay stopped; this is
  expected and needs no user action. The watchdog reports zero alerts, and the review now labels the
  forecaster as **paused by user**. No model, forecast batch, ingestion or historical backtest started.
- Verdicts: control 144, early 407, keep/leader/retire/retired 0; monkey sanity 0/36. Retired: none.
  Added: none (Thursday). Next ordinary addition window October 26, only if the user has resumed
  heavy work and the usual admission checks/capacity permit. Still 439 virtual slots available.
- Found a real restore bug while checking the night experiment: its earlier closed trade had
  `barsHeld = -471`. Entry counts belonged to the previous process's warm-up origin, while exits
  subtracted the rebuilt series counter. This also affects strategies using the SDK's bar-based time
  stops. Fixed per-position observed counts and a timestamp cursor across restarts, with a constant-time
  counter during normal operation. Old snapshots recover from observed bars, excluding empty clock
  buckets; incomplete retained history is explicitly a lower bound and its quality flag is persisted.
- Historical trade prices, P&L, quantities, times and raw counter values were preserved. Recomputed
  averages exclude invalid/partial counts and return unknown when nothing exact remains. The night
  experiment now reports an unknown holding average; its raw old counter is retained. All live saved
  holding totals are nonnegative. Eighty-eight newly opened higher-timeframe positions correctly await
  their first post-entry bar. No partial recoveries at verification. Agent source/hashes and thresholds
  are unchanged; uninterrupted historical backtests are unaffected, so their engine/cache gate stays valid.
- Shipped 43eb576 and re-ran review: all runs, assignments and recording journal identity/sequence
  survived the planned restart. Night experiment source 56ac3bdfe7c1 remains on Capital demo, currently
  flat with no overdue actual position; its one closed trade is still too little evidence to judge.
  Graveyard remains 393 archived forward records across 41 versions, with every stored reason intact.
- Recording/archive: 11,285,925 quotes archived, 82.0 MB compressed table, same single canonical copy;
  zero dropped received quotes or recording errors. Whole project 12.5 GB; two-year estimate 32.1 GB,
  four-times-rate estimate 70.6 GB against 100 GB, including the non-tick reserve. Recording gaps from
  restarts remain explicit. No retained history removed or additional tick copies created.
- Validation: 133 backend tests and typecheck, isolated packaged import preflight, UI check with zero
  errors/warnings; actual post-deploy assignment/journal comparison and duration metadata inspection.
  Bounded maintenance checks ran in trader.slice; the user's paused GPU/batch jobs stayed off.
  Clarified the runbook: journal/docs-only pushes do not restart trading/recording; executable agent,
  roster or arena changes still require deployment. This avoids unnecessary recording gaps.
- Rechecked official [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm),
  [BOJ 2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf) and
  [BOJ 2027](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf) calendars: no changes;
  coverage through 2027-12-31 exceeds 90 days. No desktop notification or user intervention needed.
- Next: observe restored time stops, archive growth and the mature-judgement clock. Respect the
  resource hold; do not mistake its forecast pause for an outage or erase its history.

## 2026-10-21 (Wed, user-requested) — heavy-resource pause controls

- Renamed the user's pipeline-force stop/start shortcuts to `heavy-resources-stop` and
  `heavy-resources-start`, including executable commands for terminals already open. The environment
  controller preserves the existing video pause/checkpoint behavior and now includes TimesFM and the
  heavy nightly lab job/timer. Resume restores the normal schedule, rather than restarting a partial lab job.
- Persistent user hold at `~/.local/share/heavy-resources/user-pause.json`; installed systemd conditions
  block automatic model/lab activation, including after reboot. The watchdog respects this deliberate
  pause, while continuing account, feed, recorder, archive and storage checks. Future maintenance must
  not clear the hold or restart heavy jobs without explicit user resumption.
- The video pipeline was already paused. Applied the broader stop: TimesFM released 1,494 MiB VRAM;
  video/model/lab job/lab timer are inactive, arena/UI and tick-archive timer remain active. Actual
  attempted model/timer starts were blocked by the hold. Arena ready, watchdog dry-run zero alerts.
- Validation: four controller regression checks, four watchdog checks and backend typecheck passed.
  Resume was checked with mocks and a read-only dry-run; the user's paused workloads were not resumed.
  Shell aliases and their chezmoi source agree; unrelated forecaster/Bluetooth edits were preserved.

## 2026-10-19 (Mon) — virtual day 11.9; PC maintenance and Graveyard

- Health after repairs: 4,561 virtual runs (551 standard, 4,010 correlated comparisons), 63 loaded
  variants, all 450 Capital assignments preserved exactly across nine correctly hedged/leverage-tiered
  accounts. Feed and TimesFM reachable, queue 0, no unpriced broker closes or load errors, 177 MB RSS.
  Observed CPU 15% of one core, event-loop p95 4 ms, HTTP p95 132 ms, adverse-open slippage p95 3.73 bp.
  Two earlier transient broker job timeouts over three days; reconciliation recovered. No user action.
- Verdicts: control 144, early 407, keep/leader/retire/retired 0; monkey sanity 0/36. Retired today: none.
  Added: none. The October 14 research batch and October 15 user experiment are less than seven days
  old; the next eligible normal addition visit is Monday October 26. Capacity remains 439 runs.
- Reconciled the October 16 shared-infrastructure migration against its runbook and running units.
  Arena/UI now live on this PC; the old per-app tunnel is intentionally disabled. Storage, watchdog,
  install, arena deploy and research sync now select the active PC runtime instead of missing Hetzner
  directories. Both live user services now share trader.slice with the lab (600% CPU, 15 GiB hard RAM
  cap); updated setup/context/lifecycle docs to prevent reviving the retired remote writer.
- Storage reporting had been stale since the migration and caused intermittent archive-job failures
  after successful transfers. Fixed the measurement paths and cache location; added a six-hour report
  freshness alert. Forced archival/read-back succeeded: 4,512,001 quotes, 32.2 MB compressed table,
  zero dropped received quotes or recording errors. Same journal identity/sequence retained.
  Whole project 12.4 GB; two-year estimate 29.2 GB / 56.4 GB at four times the observed rate, including
  the 10 GB non-tick growth reserve. Weekend-inclusive sample; estimates continue updating.
- User requested a **Graveyard** for decommissioned agents and old platform/agent history. Added
  `/graveyard` and its read-only API: 393 surviving archived forward runs across 41 agent versions
  (39 older platform cohorts, two replaced versions), with dates, recorded reasons, outcomes and
  exact-version source/run links. All 393 historical reasons were rescued into durable run metadata
  before rolling events can expire. No active agent was relabeled a failed/decommissioned strategy.
  Platform timeline links to the journal; the old v1 deletion is stated honestly.
- Future source/engine backtest replacements now archive their full trades, equity and logs instead
  of overwriting them; identical-version uploads remain idempotent. Startup retains pre-tier backtests
  instead of deleting them. Lifecycle policy now requires Graveyard preservation and platform milestones.
  Previously overwritten/deleted backtests cannot be reconstructed by this change.
- Deployment: PC fixes deployed as 4564b48; Graveyard backend as 0824364. A shared-package root import
  failed in the first Graveyard package: arena stopped at 14:25:37 UTC, API recovered at 14:26:21 and
  live warm-up finished at 14:26:37. Corrected the import, shipped the workspace dependency and added
  an isolated exported-tree import preflight before future uploads/restarts. Recording coverage keeps
  this interruption explicit; no forward records or account assignments were reset.
- Validation: 127 backend tests and typecheck; UI check/build with no errors or warnings; desktop and
  390-pixel browser checks, search, expanded history, horizontal table containment and exact historical
  source selection. Post-restart watchdog falsely interpreted warm-up as missing accounts/forecaster;
  fixed startup grace and added regressions. Final watchdog dry-run: zero alerts.
- Official [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm) and
  [BOJ 2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf) /
  [2027](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf) schedules rechecked;
  no date changes, coverage through 2027-12-31. Scheduler repair before this visit replaced the task
  pinned to a disabled provider; Codex dispatch succeeded, next visit October 22 at 09:30 Tirana.
- Next: watch PC runtime/archival and storage forecasts, keep the calibration cohort intact, and judge
  mature strategies only when their observation windows qualify. No desktop notification sent.

## 2026-10-16 (Fri, user-requested) — tick engine and single-copy storage

- Request: every agent must operate on tick execution, record Capital quotes for replay, generate ticks
  lazily from minute-only history, recover the full project context, and keep **one permanent tick copy**
  with the whole project below 100 GB over a two-year horizon. No new strategy or leverage allocation.
- Captured quotes now drive the shared risk/fill path and UTC bar builder. Added direct `onTick` SDK
  callbacks with bid/ask, broker/arrival times and source. Closed-bar strategies keep their cadence.
  Durable delayed orders, clock exits, funding, margins and existing broker protections are preserved.
  Async forecast work no longer blocks quotes; stale bar contexts and mismatched cached inputs are guarded.
- Replay prefers actual recorded minutes and declares partial capture; minute-only periods generate
  deterministic OHLC paths on demand (seed 1, 16 updates/minute by default). Strict recorded mode and
  alternate seed/density/windows are separate records. The standard 2024–September 2026 period predates
  capture and is wholly synthetic. Provenance is visible in leaderboards, run detail and Status.
- Storage steering supersedes the initial backup proposal: one losslessly compressed PostgreSQL block
  store, no extra file/remote/raw-table archives. All 46,277 initially archived quotes were checked field
  by field before redundant copies were removed. SHA-256 and full round-trip verification precede
  acknowledgement. Server spool: 10-minute acknowledged recovery tail, unacknowledged transfer buffer,
  4 GiB page cap; new entries pause on recording errors. Synthetic ticks are never stored.
- Budget: about 13 GB for repo/dependencies, model blobs, lab database and trader server folders in the
  first inventory. Quiet-session sample about 26 quotes/s and 6.1 compressed bytes/quote. Two-year
  estimates about 38 GB observed / 84 GB at four times the rate, including measured overhead and a
  10 GB non-tick growth reserve. This is an early forecast, not a promise about future tick rates.
  Canonical tick quota 70 GB; whole-project and forecast warnings appear on Status and the watchdog.
- Validation: 121 backend tests, typecheck, UI check/build; recorded US500 replay 602 actual quotes,
  zero synthetic quotes and identical repeated trades. Production-copy replay retained all 4,561
  records (551 standard, 4,010 comparisons), no load errors; 385 MB RSS and 0.493 ms p95 per quote in a
  three-minute captured workload with restored positions. All 551 backtests were refreshed after a
  regression caught and fixed a tick/minute drawdown accounting error. No agent thresholds were tuned.
- Final refresh completed and all 551 results were pushed, with zero missing provenance. Production
  verified at 05:17 UTC, arena code `1a37af8`: all 4,561 runs and all 450 earlier Capital assignments
  preserved, each account still at its intended leverage and 50/50 slots; no load errors, stream/GPU
  healthy, queue 0, 182 MB RSS. Night experiment entry time, size, stop and 08:27 local deadline survived
  unchanged. Recording has zero dropped ticks or errors. Review: control 144, early 407, keep/leader/retire
  0; monkey leaders 0/36. Desktop Status verified; mobile table overflow found and fixed.
- After verification-copy cleanup, measured project storage 12.3 GB; two-year estimate 34.9 GB,
  stress estimate 74.9 GB. Capture/transfer remains live on the one-minute timer.
- Full contract and limits: [TICKS.md](../TICKS.md).

## 2026-10-16 (Fri, user-requested) — recover the full project context

- Read all 347 available conversation messages, including the original account requests, leverage and
  funding corrections, ownership changes, research rollout, virtual expansion and night strategy.
  Checked the October 7 deletion activity as well. Settled decisions are now linked from setup.md in
  [PROJECT-CONTEXT.md](../PROJECT-CONTEXT.md), so future handoffs have a direct route to them.
- Correct the previous database answer: the user explicitly requested removing the old database on
  October 7. The v1 tick/run/fill/equity/state tables and old recorder were then removed; minute candles
  survived. The original inspection reported roughly 64 million ticks. This is established history,
  separate from the still-unlocated Windows-era 2017 database.
- Account context: Arena 01–09 were already provided; Visi is reserved; nine hedged accounts, 50 slots
  each, 0.2× mirror scale, fixed tiers 1/2/3/5/10/20/50/100/200. Gerti became Arena 03, Endri Arena 05.
  Preserve existing assignments and the later, verified fee-free 1:1 rule (natural gas excepted).
- Tick capture deployed first as 939898b; all 20 instruments are recording from 04:09:38 UTC, repeated
  quotes and broker/arrival times included. PostgreSQL archival and acknowledgements are working on a
  one-minute timer in trader.slice. Shared tick execution/replay integration remains in progress.

## 2026-10-15 (Thu, user-requested) — search for the older minute database

- Request: determine whether the minute history remembered from around 2016 survives locally, or was
  dropped. This investigation did not change any database or trading account.
- Surviving lab store: PostgreSQL 16 has one application database, `trader` (2,282 MB), and its only
  user table is `public.candles`. US100 has 2,376,056 minute rows from 2020-02-11 19:46 UTC; US500 has
  987,548 rows from 2024-01-01 23:01 UTC. Both extend to 2026-10-15 01:30 UTC. The maintenance/template
  databases have no user tables. No other native PostgreSQL cluster or custom tablespace is configured.
- Older source survives in `~/Documents/archive/capital-database-updater` and the related stream/trading
  projects. The downloader requests **US100**, starting from **2017-05-01** when its table is empty.
  This is evidence of intended collection, not proof of successful downloads or of US500 history.
  Only placeholder `.template.env` files survive (`PG_DATABASE=etr`); the actual old connection settings
  are absent, so `etr` is a lead, not a verified former database name. The programs ran on Windows;
  the stream-generator notes put generated tick tables in `D:/postgres`, which does not establish where
  the original minute table lived.
- Recovery search: no matching old dump or PostgreSQL data directory found in the searched home,
  Documents/archive, Downloads or Trash locations (excluding media/dependency caches). Rootless
  PostgreSQL container volumes identify an unrelated project's databases, not an older trader store.
  No Windows filesystem or additional drive is currently attached. An old Windows installation or its
  backups remain the recovery lead; there is no evidence here establishing that the user dropped it.
- Cleanup audit: commit `b612b0b` (2026-10-07) removed legacy ticks, tick statistics and old run/fill/state
  tables, retaining minute candles. It does not explain a missing 2017-era Windows database. Corrected
  DECISIONS.md's overly broad API retention claim to the specific US500 probes actually observed.

## 2026-10-15 (Thu, user-requested) — night frequency and history boundary

- Request: bring `visar-night-trading` to 25–50 bets/year, allowing ordinary day-to-day price noise but
  excluding neutral/volatile days and FOMC/BOJ decisions; explain the historical cutoff. This authorizes
  a new source version and renewal of its existing special Capital demo admission.
- Diagnosis: the 60% path-efficiency rule alone admitted 16/676 complete sessions. Revised efficiency
  to 15%, agreeing quarter-hours to 13/26, maximum retracement to 75%; retain ≥0.25% session move and
  data coverage. Add ≥60% directional body/range and ≤2% session range, preserving rejection of V-shaped
  reversals, late spikes and hidden intra-minute swings. Normal counter-moves can now pass.
- Calibration: `bun run calibrate-night`, 150 declared candidates, **2024 entry counts only**, no P&L
  objective. Selected source `56ac3bdfe7c1`: 25 entries in 2024; later checks 25 in 2025 and 22 in Jan–Sep
  2026 (29.4/year annualized). All 72 signals match actual funded backtest entry dates. Later dates are
  a frequency check, not a pristine unseen profitability holdout after prior experiments on this dataset.
- Performance retained honestly: $10,000 → $2.61 (−99.9739%), maxDD 99.9783%, 72 trades (46 long/26 short),
  win rate 43.06%, PF 0.3697, Sharpe −1.2124, t −2.0317. 61 scheduled exits, 11 stop exits, zero errors.
  Every entry 03:27 and every timed exit 08:27 Albania time. Last-120-day fresh-capital check: 8 trades,
  −86.2%. Frequency is achieved; the 1:200 strategy still has no demonstrated edge. Risk sizing unchanged.
- Policy exclusions: official Fed/BOJ 2024–2027 schedules in `src/sdk/policy-calendar.ts`; exclude the
  completed decision-day NY session and BOJ decisions on the overnight entry day. Calendar coverage
  ends 2027-12-31; uncovered dates block entries. Added maintenance checks to the visit runbook.
- History evidence: stored US500 minute tape starts 2024-01-01 23:01 UTC. Read-only API probes returned
  no pre-2024 minute quotes, but did return 2023 hourly and 2015 daily data. Exact 03:27 entries and tight
  overnight stops cannot be inferred from those old coarse bars. The shared test actually extends through
  September 2026; the earlier version merely had all three selected trades in 2024.
- Validation: 109 backend tests and typecheck green, deterministic agent check, funded backtest/date audit.
  Previous forward source has zero Capital deals; deploying the new version preserves its historical
  record and the other strategies' records. Full rules/results: [visar-night-trading.md](visar-night-trading.md).
- Production verified at 16:16 UTC, arena code `bb76bff`: source `56ac3bdfe7c1` is running on Arena 09
  at confirmed 1:200, with its matching 72-trade backtest and special user-experiment admission. The
  prior night source is archived and unassigned. Compared all assignments with the pre-night deployment
  snapshot: all 449 earlier assignments remain; the new night source is the only added assignment.
  Review: 450/551 standard runs mirrored, 4,561 total virtual runs, stream/forecaster healthy, 185 MB RSS,
  queue 0, no recent errors. Verdicts: control 144, early 407, keep/leader/retire 0; monkey leaders 0/36.

## 2026-10-15 (Thu, user-requested) — visar-night-trading

- Request: implement Visar's manually tested US500 day-direction/overnight-pullback rule, backtest it,
  then admit it as a special Capital demo agent. This explicitly overrides the normal addition date and
  promotion maturity gate for this one experiment. No other strategies were retired or added.
- Frozen assumptions: Europe/Tirane clock (user timezone, clarification offered). The user clarified
  that the NY day must be consistently directional: use 09:30–16:00 New York, ≥0.25% net move, ≥18/26
  quarter-hours agreeing, ≥60% path efficiency and ≤35% adverse retracement of the session range.
  Require opening/closing/quarter-hour observations and ≥90% minute coverage. Choppy, reversal and
  late-spike days are neutral. Capture the separate 22:00 local reference. At 03:27 next calendar day,
  buy a bullish day's dip or sell a bearish day's bounce relative to that reference. Neutral/missing/stale
  observations skip. 1:200, 90% margin sizing, stop targeting 50% of entry capital, remaining position out
  at 08:27. Full contract/results: [visar-night-trading.md](visar-night-trading.md), source `98de49ace1c6`.
- Result, 2024-01 → 2026-09: $10,000 → $5,181.87 (−48.1813%), **3 trades**, 33.33% wins, PF 0.0235,
  Sharpe −0.7545, t −1.6246, max drawdown 57.2877%. All three entered at 03:27 and exited at 08:27;
  zero agent errors. Session audit: 705 sessions with closes, 676 sufficiently observed, 10 consistent
  trends, three satisfying the next-night entry; final 120-day sanity window zero trades. No profit-based
  threshold tuning. This is too small a sample to judge. The previous 153-trade net-change-only rule was
  superseded before deployment by the user's path-consistency clarification; its result is not this version.
- Engine/SDK: persisted `validUntil`/`closeAt` deadlines; late entries discarded; backtests with missing
  deadline candles use the next observed open before that candle's later range. Capital independently
  requests timed exits on the one-second clock, so candle/quote outages do not suppress the close request.
  Actual fills still incur API/network delay and ordinary stops can slip. 50% means this strategy's capital,
  not half the pooled Arena account; Capital mirrors initially $2,000 of strategy allocation at 0.2× size.
- Admission: explicit `demoAdmissions` roster entry scoped to this agent/instrument/tier/source hash,
  shown as **user experiment**. Current backtest required; performance/maturity bypassed only for admission.
  Normal safety and demotion remain; the exception does not re-admit a demoted record. Added lifecycle
  documentation and tests for full-capacity admission, expired real entries and a clock-driven real close.
- Before deploy: stream/forecaster healthy, 4,560 virtual runs (550 standard/4,010 comparisons), 449/450
  Capital slots, Arena 09 at 49/50, no recent errors. Validation: 103 backend tests, typecheck and Svelte
  check/build green.
- Production verified at 13:36 UTC, arena code `6ec6541`: exact source `98de49ace1c6`, run
  `demo:visar-night-trading:US500:x200:98de49ace1c6`, assigned to Arena 09 at confirmed 1:200 (now 50/50).
  All 449 earlier assignments remain; total 450/551 standard runs mirrored, 4,561 virtual runs including
  the unchanged 4,010 comparisons. This experiment has one standard run; its failed ordinary backtest
  gate does not spawn comparison cohorts. Stream/forecaster healthy, 186 MB RSS, queue 0, no recent
  errors. Verdicts: control 144, early 407, keep/leader/retire 0; monkey leaders 0/36.
- Capital leaderboard verified through the production UI on desktop and a 390-pixel mobile viewport:
  **user experiment**, US500, 1:200, zero trades, no invented return/Sharpe before its first actual order.
  Its initial demo allocation is $2,000; it is waiting for a qualifying night, not opening outside the rule.
  The corrected backtest is attached with matching source hash. Temporary UI inspection tunnel removed.

## 2026-10-15 (Thu, user-requested) — virtual broker and three-stage pipeline

- Why: the user asked to account for Capital's execution flow, increase virtual testing capacity, and
  use Backtest → Virtual engine → Capital demo, with reverse demotion. This explicitly authorizes this
  execution-comparison batch outside the usual Monday additions. No new alpha parameters were tuned.
- Contract evidence: two minimum-size EURUSD buy/sell rounds on the already hedged Arena 01, plus invalid
  size/stop and protection-update probes. All confirmed probe positions were closed. Bid/ask P&L matched;
  explicit null removes broker protections, zero is refused, native trailing works despite the metadata's
  NOT_AVAILABLE label, and 150 units was accepted despite the advertised 100-unit increment. Captured
  public observations and all 20 markets are fixtures; private working reports stay in ignored data/.
- Virtual fixes: durable delayed commands, fresh-quote and market-status admission, refreshed dealing and
  funding rules, Capital stop distances, frozen submitted size and margin recheck at execution, paced
  synthetic API logins, Friday triple funding, and negative-balance protection in net trade results.
  Funding has a clock independent of quotes during daily breaks. Existing histories are retained and the
  execution-model change is annotated, not backdated.
- Mirror fixes: native trailing and explicit protection removal, atomic entry protections, stale queued
  opens discarded, stronger confirmation/position identity (including unrelated rejections), and exact
  deal-linked cashflow reconciliation. Missing broker-stop P&L can now be recovered from transactions.
- Pipeline: new admissions need current source AND engine-version backtests; new Capital slots need the
  mature virtual leader gate. Existing 449 assignments are explicitly a calibration cohort. Losing actual
  demo evidence demotes to virtual; re-entry uses a fresh window. Losing virtual evidence demotes to
  backtest with the old record archived. Verdicts and the review use the same post-demotion observation
  window. Ruin controls are permanently virtual-only by slug, even when source changes.
- Capacity: 550 standard runs, 401 qualified instrument/tier combinations, ten complete latency cohorts
  (170 ms to 120 s): 4,010 extra comparisons, expected total 4,560, about ten times Capital capacity. They
  have freshly warmed records and paired random streams, never take demo slots, and never inflate
  strategy verdicts or monkey counts. The 5,000 total cap leaves 440 slots for new ideas. There are already
  62 loaded agent variants; testing execution robustness adds more evidence now than inventing near-duplicates.
- Validation: full 5,000-run production-state replay, 22.3 s and 332 MB RSS; synthetic two-day capacity
  check, 138 MB and 178 ms persistence. All 550 backtests refreshed in 62 s (five workers, 2 GB peak) inside
  trader.slice. 69 backend regression tests, UI check/build, desktop/mobile renders, and API stage-separation
  checks run before shipping. Default dashboard payload cut from 13.3 MB to under 1 MB by selecting a
  stage/scenario server-side and omitting unused monthly data from leaderboard rows.
- Limits remain explicit in ../EXECUTION.md: isolated virtual cash vs pooled Capital margin, historical
  funding rates, corporate/basis adjustments, missed tick tape and an unobservable remote queue. Fixed
  latency scenarios are assumptions to test, not a claim of perfect Capital equivalence.
- Production check: Capital silently returns at most 100 transactions per response. Added bounded
  time-window bisection and a regression test so older broker-stop P&L is not silently missed. SWAP rows
  omit deal IDs: all such cashflows are retained and shown at account level, not falsely assigned to a
  strategy. The demo ranking is explicitly realized trade P&L plus linked adjustments, with unallocated
  funding/corporate adjustments and open P&L excluded. The first deployment also required re-pushing the
  refreshed backtests after the new API could retain engine-version metadata; the full pool then reached
  4,560 as expected. Before the final history fix: stream/forecaster green, 184 MB RSS, 449 mirrored, queue 0.
- CPU follow-up: production's first full warm-up took 51 s under its one-core quota. Replay now activates
  restored runs only at their resume point instead of scanning every dormant run on every historical
  candle. A full 4,560-record offline replay dropped to 4.1 s at 308 MB. Regression suite now 72 tests, including restoration of actual and virtual hourly API budgets across restarts.
- Final verification (13:01 UTC, before the final request-budget persistence patch): 4,560 virtual runs,
  449/550 standard runs on Capital, queue 0, stream and forecaster healthy, 151 MB RSS, no recent errors.
  No unpriced broker closes remain (485 recovered after full history traversal). Cashflows: 1,565 trades,
  583 funding rows (−$690.09), 154 corporate adjustments (+$0.37); unlinked funding/corporate rows are
  shown separately. Ten new real orders have complete timing: p95 candle→decision 17.3 s, virtual queue
  13.6 s, broker queue 4.4 s, POST response 107 ms, send→verified confirmation 653 ms. These component
  percentiles are not additive. The latency cohorts had 226 commands, 206 executed, 20 pending as expected
  for the long-delay scenarios. Actual-fill adverse slippage p95 4.11 bp across the recorded history.
- Post-patch verification (13:05 UTC): code 8a1874d deployed; 4,560 virtual records, 449 active Capital
  assignments, all 456 historical/current broker rows priced, no missing closes, no broker error or queue,
  stream and forecaster healthy. RSS 194 MB, event-loop p95 2 ms, no pending virtual commands.
  The last-hour open count correctly survived restart (12); 72 tests and UI check/build pass. Temporary
  verification services stopped; the production and regular lab services continue.
- Next: watch closed-market behavior, trailing stops, account cost attribution and resource growth.
  No standard agents retired or added; 144 controls / 406 early, no leaders yet; monkey sanity 0/36.
  No user action or desktop notification needed.

## 2026-10-15 (Thu) — demo day 8.6

- Health: green; 0 errors in 3 days. The nightly job pushed daily history (868–1,018 bars per instrument)
  as planned. Two fixes, both deployed:
  - Broker confirmations: Capital.com's `GET /confirms/{reference}` answers with the account's latest
    confirmation whenever the reference is not the latest (verified: a dozen old references all returned the
    same US500 close). A EURUSD close whose broker stop had just filled was stored with an AUDUSD price:
    −$5,019 recorded, −$26.64 real (record corrected). 1 of 1,756 deals; no open was affected and no deal id
    is shared. Confirmations must now match the deal's epic, direction, size and id.
  - Restored runs are priced at start: after each restart, a run holding a position saved its cash balance
    as equity until its first live candle, so equity curves show a false dip at 22:00 on Oct 14 and 07:00 on
    Oct 15 (left in place).
- Broker: bold-play and martingale-monkey (7 runs) excluded from mirroring. They are built to go bust, and
  the martingale was already trading on Arena 09, draining the account the other 1:200 runs share. They stay
  on paper.
- Verdicts: control 144, early 406, keep 0, leader 0, retire 0; monkey sanity 0 of 36.
- Retired: none (nothing judged yet). Added: none (Thursday).
- Accounts: 1:200 −9.4% (mostly the ladder's US100 rungs margin-called at the broker, −$1,845 each), 1:100
  −4.1%, 1:50 −2.1%, 1:20 −1.6%, 1:1 −1.5%; 1:2 to 1:10 within 0.5%.
- New agents, first 1.5 days: the daily-bar agents opened at the first 00:00 UTC close as designed (seeded
  history works). Bold-play: 3 of 4 runs already down 85–99%. Noise-area momentum and gold-session are
  trading; ibs-dip and the weekly or monthly ones have not had a signal yet.
- Next: Monday 2026-10-19 — add agents if due (candidates: the TimesFM quantile audit, then timesfm-stops;
  kelly-ladder; cppi). First judgements start in early November.

## 2026-10-14 (Wed) — 13 agents from the research

- Why: the user asked to implement most of the research report's ideas at once, to watch them over the
  coming weeks. That overrides the usual 1–3 agents a week for this batch; capacity allowed it (480 → 550
  runs, room for 50 more).
- Platform: the arena now seeds every 1d series with the lab's daily bars from 2024-01 (`push-history`,
  nightly), so 200-day and 12-month rules trade from the first live day instead of after months of warm-up
  (it keeps only 120 days of 1-minute candles). 14,397 daily bars seeded at the 22:58 UTC start.
- Gate: agents built to trade a few times a year now need 5 trades per backtest run instead of 20
  (LIFECYCLE.md); controls are not gated.
- Added (backtest 2024-01 → 2026-09, Sharpe per run; parameters fixed from the sources):
  - noise-area-momentum (base 1× at 1:2, voltarget up to 4× at 1:5) — Concretum intraday momentum on US
    indices. US100 +0.91, US500 −0.34, US30 −0.50 (base); about 600 trades per run. Positive only on US100.
  - ibs-dip (pagonidis, composite; 1:2) — buy a close near the session low above the 200-day average. All six
    runs positive: 0.23 to 1.43; 53–71 trades.
  - lrs-sma200 (x1 at 1:1, x2 at 1:3, x3 at 1:5; US500, US100) — leveraged index above its 200-day average.
    0.41 to 0.91; 6–8 trades (slow).
  - shannon-demon (1:1; BTC, ETH, TSLA, NVDA) — 50% of equity, rebalanced at 45/55%. 0.41 to 1.42; 13–26 trades.
  - tsmom-12m (1:5; 10 markets) — sign of the 12-month return, 15% volatility target, monthly. Median 0.1:
    GOLD 1.20, SILVER 1.09, ETH −0.81; 22 trades each (no trades in the first year: it needs 12 months).
  - donchian-ensemble (1:1; BTC, ETH) — five breakout systems averaged, long-only. 0.37, 0.26.
  - gold-session (overnight, both; 1:1) — long from the London afternoon fix to the next morning fix. 1.00
    (overnight), 0.49 (both); the last 120 days alone were negative.
  - crypto-sunday-asia (1:1; BTC, ETH) — long Sunday 19:00 to Monday 19:00 New York. 1.12, 0.78; 143 trades.
  - vol-managed-hold (1:1; 8 shares, BTC, ETH) — full size unless last month is more volatile than the last
    year. Median about 0.4; 5–17 trades (slow).
  - Controls: bold-play (1:200; ruined on all four backtest runs, −99%), martingale-monkey (1:200; ruined),
    skew-monkey (1:5; wins 85% of trades, loses 11–17%), constant-leverage (1:2, 1:5, 1:20: gold +77%, +197%,
    −96%; US500 +30%, +63%, −88% — the volatility-drag curve).
- Tiers now: 1:1 88 runs, 1:2 67, 1:3 57, 1:5 71, 1:10 50, 1:20 56, 1:50 51, 1:100 54, 1:200 56. Every account
  holds 50 mirrored runs; new runs reach the demo accounts by promotion ($200 ahead).
- Not built yet from the report: timesfm-stops and vol-target-blend (need the TimesFM quantile audit first),
  jump-regime (needs longer daily history), LLM strategy writers, kelly-ladder, cppi.
- Next: Thursday visit — check the long-lookback agents traded at their first daily closes, and that the
  nightly job pushes daily history.

## 2026-10-13 (Tue, evening) — research pass; no overnight fee at 1:1

- Why: the user asked for research to get inspired (general strategies, the 1:1 account, leverage). First
  pass: six topics plus Reddit, 233 sources, about 170 saved papers and page snapshots. It is on the
  dashboard's Research tab (`research/report.md` ranks what to build next).
- Fix: Capital.com charges no overnight fee on 1:1 positions on every market except natural gas, not only
  on shares and crypto. Arena 01's transactions (8–12 October) showed funding only on NATURALGAS, while
  Arena 06 (1:20) paid it on everything. The engine now matches. 1:1 backtests were re-run: US100
  buy-and-hold is +73% instead of +46%. The 1:1 demo runs keep the fees charged in their first 6 days.
  The arena was deployed at 21:41 UTC.
- Also seen on Arena 01: index dividend adjustments (longs credited, shorts charged), which the engine
  does not model yet; worth 0.6–1.7% a year on index longs.
- buy-hold's description still says "crypto and shares hold fee-free, the rest pay CFD funding". Left
  as is: editing the file would restart the control's record. Fix it when buy-hold next changes.
- Next: candidates for Monday from the report: noise-area-momentum, ibs-dip, lrs-sma200, crypto-demon;
  platform: a "confirmed" verdict at t ≥ 3, `ctx.resize`, index dividends.

## 2026-10-12 (Mon) — demo day 5

- Health: green after one broker fix. Capital.com's price stream dropped on Saturday 05:00–07:00 UTC (it
  reconnected every minute; candles kept arriving over REST, so only live quotes were missing). The watchdog
  raised 2 alerts and cleared them by itself; if this repeats next Saturday, it is weekly maintenance and the
  watchdog should stay quiet then. Broker fix: at Friday's 21:00 close the paper engine still traded, and the
  three opens it sent were refused ("market closed") and used up all 4 retries in 25 minutes, so monkey-b US500
  stayed unmirrored all weekend. Now an open refused by a closed market waits for `GET /markets/{epic}` to say
  the market trades again, without using up its retries (monkey-b US500 opened at 07:39). Also, two GBPUSD
  closes at Sunday's reopen were rejected but recorded as closed, and the next reconcile re-attached and closed
  them; a rejected close now stays open and is retried. Seen once since: a stoch-range GBPUSD deal hit its
  broker stop and Capital.com still listed it for ~4 minutes, so it was re-attached twice before a 404 settled
  it (harmless; watch for more). Nightly lab job fine. Arena 144 MB, 448/480 runs mirrored, 0 errors in 3 days.
- Verdicts: control 122, early 358, keep 0, leader 0, retire 0; monkey sanity 0 of 36.
- Retired: none (nothing can be judged before early November).
- Added: turn-of-month — the turn-of-the-month effect (Ariel 1987, Lakonishok & Smidt 1988, McConnell & Xu
  2008): long from the 16:00 New York close two weekdays before month end to the close of the third trading
  day of the next month; US500, US100, US30 and the 8 shares; 1:1 (shares fee-free); no variants. Backtest
  median Sharpe 0.42, 31–33 trades per run (META +59%, TSLA −32%).
- Added: vol-target — volatility targeting (Moreira & Muir 2017): long US500, US100, US30 at 15% ÷ last
  month's realized volatility, 0–2× equity, rebalanced monthly; 1:3 (uses up to 2×). Backtest median Sharpe
  0.40, 34 trades per run (US100 +31%, US30 −0.3%).
- Rejected: intraday-momentum — market intraday momentum (Gao, Han, Li & Zhou 2018): trade 15:30–16:00 New
  York in the direction of the previous close → 10:00 return, sized with marginPct 20 at 1:5, 1:50 and 1:200.
  Backtest median Sharpe −0.55 (gate −0.5): 704 trades, 47% won; on US500 at 1× the gross edge was about +2%
  over 33 months against about 7% of spread, so leverage only multiplied the loss (−99% at 1:200).
- Leverage after 5 days: tier averages fall with leverage (1:1 −0.1%, 1:20 −0.5%, 1:200 −1.9%). The ladder
  scales almost exactly with leverage so far, with no margin calls: GOLD hold +32.6% at 1:200, US100 hold
  −34.3%. The share basket (−0.6% average) is ahead of US100 (−1.6%) at 1:1.
- Tiers: 1:1 now has 66 runs for 50 slots, 1:3 has 55; promotion decides who is mirrored.
- Next: Thursday visit; Monday 2026-10-19 may add 1–3 agents (candidates in the idea log).

## 2026-10-08 (Thu) — demo day 0.6

- Health: green after one broker fix. An open Capital.com rejected was never retried, so buy-hold AVGO
  (1:1, rejected without a reason at 00:00 UTC) had no demo deal; and 3 closes that hit the 21:00–21:05 UTC
  break were retried every minute and went through at 21:05, but logged 18 errors. Now rejected opens are
  tried again up to 4 times, 5 minutes apart, while the paper position lasts, and closed-market closes are
  logged once. AVGO opened on Arena 01 at 07:33 UTC (373.28, paper 377.05). Nightly lab job fine (share
  backtests pushed). Arena 101 MB, 448/466 runs mirrored.
- Verdicts: control 122, early 344, keep 0, leader 0, retire 0; monkey sanity 0 of 36.
- Retired: none. Added: none (Thursday).
- Leverage: the 1:200 account is down 0.9% after 15 hours, mostly the ladder's 20× positions; too early to read.
- Share basket backtest (1:1, no fees): +123% on average (NVDA +340%, MSFT +35%) against US100 +46% after
  $2,697 of fees. Most of the gap is hindsight: these are today's eight largest companies because they rose.
  The fees are about 27 points of it. The demo is the fair comparison.
- Next: Monday 2026-10-12, first new agents (candidate: a strategy on the shares at 1:1).

## 2026-10-07 (Wed, evening) — leverage tiers

- Why: the user asked for leverage as another dimension, with all nine Arena accounts on different
  leverages, 1:1 and 1:200 the most interesting.
- Accounts: Arena 01 … 09 = 1:1, 1:2, 1:3, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200 (crypto and shares stop at
  1:20). At 1:1, crypto and shares pay no overnight fee.
- Allocation: agents sorted by backtest leverage use (90th percentile of position ÷ equity), least on 1:1
  (buy-hold, tsmom, overnight-drift) and most on 1:200 (bollinger-fade, mtf-pullback, london-breakout,
  stoch-range); one monkey each on 1:50, 1:100 and 1:200; 49–55 runs per account, 466 in all.
- Added: leverage-ladder (control) — hold and 20-day trend on US100, GOLD, EURUSD, BTCUSD at every tier
  with 10% of equity as margin (0.1× at 1:1 … 20× at 1:200). Backtest 2024-01 → 2026-09: US100 hold
  +4.6% at 1:1, +93% at 1:20, +232% at 1:50 (93% drawdown), −80% at 1:100, wiped out at 1:200; BTC hold
  +11.5% at 1:1 (no fee) but −2.4% at 1:2 and −88% at 1:20 (the fee grows with the position).
- Added: the eight largest Nasdaq-100 shares to buy-hold, all on 1:1, as a fee-free stand-in for US100.
- All demo runs restarted (run ids now include the leverage; they were 1.5 days old).
- Next: watch the ladder and 1:1 vs other tiers; strategies on shares at 1:1 are a candidate for Monday.

## 2026-10-07 (Wed) — demo day 0.6: lifecycle starts

- Health: all green. 40 agents, 392 demo runs, all 392 mirrored on Arena 01–09 (hedging mode, 0.2× size,
  capacity 450). Stream connected, forecaster reachable, arena 116 MB.
- Verdicts: early 344, control 48; nothing can be judged yet (judgement starts at 30 trades and 28 days).
- Set up: lifecycle verdicts on the dashboard (Stage column), `bun run review`, `agents/roster.json` for
  retiring single runs, broker promotion/demotion once the 450 slots are full, a watchdog every 10 minutes
  with desktop notifications, and babysitter visits on Mondays and Thursdays at 09:30.
- Next: no retirements possible before early November; first new agents on Monday 2026-10-12.

## Idea log

- Visar capital-profit exits — user-requested deadline/+20/+50/+100% close dimension, full20,736-case study and nineteen source-pinned demo updates; unused targets labeled by hit counts, not treated as new evidence (2026-11-09).

- Visar night v2 — user-selected full/central-session and minimum bid-gap/risk cohort; ten higher-frequency roles, nineteen replacements plus unchanged original. Backtest-selected, not validated; old nineteen archived (2026-11-09).

One line per idea: agent — mechanism — status (date).

Visit 2026-11-10: no new agent, retirement or tuning; mirror and twin-report fixes only.
Visit 2026-11-11: no new agent, retirement or tuning; engine (targets fill at their level) and mirror (position checks in reconciliation) fixes only.
Visit 2026-11-12: no new agent, retirement or tuning; engine (orders fill at the price on arrival), twins (lifecycle closes are not pairs) and mirror (reasonless refusals resent after 1 s) fixes only.

- visar-night-lab (nine variants) and visar-night-us100 (ten) — user-requested night frequency/risk
  cohort; 10 US500 including original, 10 US100, source-pinned special demo experiments (2026-11-09).
  Selected on inspected history; explicit low-exposure classifier references and sparse endpoints,
  not nineteen independent discoveries. Original remains unchanged; old risk twin remains separate.


User request 2026-11-08 (follow-up): strategy-context explanations and saved entry evidence added
for all current families. No new agent, retirement or parameter tuning; existing run identities and
admission/resource rules retained.

User request 2026-11-08: native-first trade inspection and content-first PWA; no new strategy,
retirement or parameter tuning. Tick/cost/decision evidence improved without resetting any record.
Normal admission gates and the held nightly lab remain unchanged.

Visit 2026-11-05: first mature actions verified: macd-trend/ema200 and ema50 BTCUSD at 1:100 archived
for losing virtual trade evidence; other family runs continue. Six losing Capital runs demoted to fresh
virtual observation (EMA 9/21 EURUSD/ETHUSD, HMA BTCUSD/ETHUSD/OIL, RSI2-both ETHUSD). No new
strategy, tuning or forced replacement. Active verdicts: 401 early / 8 keep / 0 leaders, plus 144 controls;
monkey sanity 0/36. Fixed comparison restoration across reboot, preserving all active IDs. Next ordinary
addition window November 9 still requires lab resumption and resource/admission gates.

Visit 2026-11-02: no additions, retirements or parameter tuning; 411 strategy records remain early,
monkey sanity 0/36. October 29 batch is not seven days old. Next ordinary window November 9,
conditional on explicit lab resumption, normal admission gates and memory headroom. TimesFM alone
is resumed; nightly additions/backtests remain held. Backfilled 76 archived-quote cost references.

User request 2026-10-29: evaluation/cost infrastructure shipped without changing old sources or
Capital assignments. Two quote-breakout variants × US500/US100 admitted to virtual at tier 3;
small-risk night twin failed the normal backtest gate and remains backtest-only. Frozen results and
sensitivity limits are in RESEARCH-2026-10-29.md and the agent-health research note. No tuning or
retirements. Next ordinary addition window November 9, conditional on resources and headroom.

- quote-breakout (immediate, spread-gated) — previous-session range breakout; paired tick spread/adverse-price gate, 0.5% risk — virtual on US500/US100 at 1:3 (2026-10-29)
- night-risk-twin — frozen original night signal, 100× lower initial exposure/risk budget, ordinary gate — rejected (2026-10-29): primary Sharpe -1.25; no special demo exception

Visit 2026-10-29: no strategy additions/retirements or tuning; 407 strategies remain early, monkey
sanity 0/36. Next ordinary window November 2 requires resumed heavy work and admission/memory gates.
CPU remains low; monitor transient RSS bursts before expanding the virtual pool.

User request 2026-10-26: performance loop only; no strategy additions/retirements or tuning. Rust risk
prototype passes parity but stays opt-in after losing to optimized JS; live GC contention was reduced.

Visit 2026-10-26: no additions/retirements; 407 strategies remain early, monkey sanity 0/36.
Monday admissions deferred by the explicit heavy-resource hold despite 439 available virtual slots;
next ordinary window November 2 if heavy work has resumed. No new/rejected idea or parameter tuning.

Visit 2026-10-22: no additions/retirements; 407 strategies remain early and the heavy-resource hold
defers GPU/batch work. Next ordinary addition date October 26, subject to explicit user resumption
and admission checks; 439 virtual slots remain. Restore accounting was fixed without strategy tuning.

Visit 2026-10-19: no new strategy or retirement; recent additions remain in observation. Next normal
addition window October 26, with 439 virtual slots available. Graveyard now preserves decommissioned
versions and their evidence; it does not turn platform migrations into strategy verdicts.

- visar-night-trading — NY-session direction plus US500 03:27 pullback, 08:27 or 50%-capital-loss exit, 1:200 — special demo experiment (2026-10-15), frequency calibrated to 25/25/22 annual entries (2024/2025/Jan–Sep 2026); 72-trade backtest −99.9739%, selection used entry counts only

- execution-latency cohorts — paired forward records under frozen API/transport delay assumptions; no strategy parameter changes — comparison only (2026-10-15), excluded from independent verdict counts

- adx-dmi — ADX trend strength with DI direction, 1h — live (2026-10-06)
- bold-play — control: the fewest, largest bets at 1:200 until the account doubles or is ruined, 1h — control (2026-10-14)
- bollinger-fade — fade closes outside Bollinger bands, 15m — live (2026-10-06)
- buy-hold — passive benchmark, funding included; on 1:1 with the 8-share Nasdaq basket (fee-free) — control
- constant-leverage — control: half the account leverage as a constant multiple of equity, rebalanced daily (volatility drag) — control (2026-10-14)
- crypto-sunday-asia — long BTC and ETH Sunday 19:00 → Monday 19:00 New York, 1:1 — live (2026-10-14)
- donchian-breakout (turtle-20, turtle-55) — channel breakouts, 4h — live (2026-10-06)
- donchian-ensemble — five breakout systems (10–200 days) averaged, volatility-scaled, long-only BTC/ETH at 1:1 — live (2026-10-14)
- ema-cross (9-21, 20-50) — moving-average crossover, 1h — live (2026-10-06)
- gold-session (overnight, both) — long gold from the London afternoon fix to the next morning fix, 1:1 — live (2026-10-14)
- hma-slope — Hull MA slope turns, 1h — live (2026-10-06)
- ibs-dip (pagonidis, composite) — buy US indices closing near the session low above the 200-day average, 30m — live (2026-10-14)
- inside-bar — inside-bar breakouts, 4h — live (2026-10-06)
- intraday-momentum — last half hour follows the first (Gao et al. 2018), marginPct at 1:5/1:50/1:200, 30m — rejected (2026-10-12): backtest median Sharpe −0.55, spread larger than the edge
- keltner-trend — Keltner channel trend entries, 4h — live (2026-10-06)
- leverage-ladder (hold, trend) — one signal at every leverage tier, 10% of equity as margin — control (2026-10-07)
- london-breakout — Asian-range breakout at the London open, 15m — live (2026-10-06)
- lrs-sma200 (x1, x2, x3) — 1×/2×/3× index above the 200-day average, cash below (Gayed & Bilello) — live (2026-10-14)
- macd-trend (ema50, ema200) — MACD with a trend filter, 1h — live (2026-10-06)
- martingale-monkey — control: random entries, risk doubling after losses, 1:200 — control (2026-10-14)
- mtf-pullback — 1h pullbacks within a 4h trend — live (2026-10-06)
- noise-area-momentum (base, voltarget) — Concretum intraday momentum: outside the 14-day noise band, VWAP stop, 30m — live (2026-10-14)
- orb-ny (15min, 30min) — New York opening-range breakout, 5m — live (2026-10-06)
- overnight-drift — hold indices overnight, 30m — live (2026-10-06)
- random-baseline (monkey-a/b/c) — random entries with stops — control
- rsi2-reversion (both, long-only) — Connors RSI(2) dips in a trend, 1h — live (2026-10-06)
- shannon-demon — 50% of equity in BTC/ETH/TSLA/NVDA, rebalanced at 45/55%, 1:1 — live (2026-10-14)
- skew-monkey — control: random entries, 0.5 ATR target and 3 ATR stop (85% winners, no edge) — control (2026-10-14)
- squeeze-breakout — Bollinger-inside-Keltner squeeze release, 1h — live (2026-10-06)
- stoch-range — stochastic reversals in ranges, 30m — live (2026-10-06)
- supertrend (10x3, 20x5) — SuperTrend flips, 1h — live (2026-10-06)
- swing-reversal (p05, p10) — swing high/low reversals, 15m — live (2026-10-06)
- timesfm-band — fade moves outside the TimesFM band, 1h — live (2026-10-06); backtest −2.75 median Sharpe
- timesfm-drift (h4, h8, h16) — trade the TimesFM median's direction, 1h — live (2026-10-06); backtests negative
- timesfm-swing — 4h, TimesFM inner band entirely on one side of the price — live (2026-10-07)
- timesfm-trend — TimesFM direction as a trend confirmation, 1h — live (2026-10-06)
- timesfm-vol-breakout — channel breakouts when TimesFM forecasts wide ranges, 1h — live (2026-10-07)
- tsmom (5d, 20d) — time-series momentum, 4h — live (2026-10-06)
- tsmom-12m — sign of the 12-month return, 15% volatility target, monthly, 10 markets — live (2026-10-14)
- turn-of-month — long from 2 weekdays before month end to the 3rd trading day, indices + 8 shares at 1:1, 30m — live (2026-10-12)
- vol-managed-hold — 8 shares, BTC, ETH at 1:1, scaled down when last month is more volatile than the last year — live (2026-10-14)
- vol-target — long US indices at 15% ÷ realized volatility (0–2×), monthly rebalance, 1d, 1:3 — live (2026-10-12)
- volatility-breakout (k05, k08) — open ± k × previous range, 15m — live (2026-10-06); best backtest
- zscore-fade — z-score mean reversion, 1h — live (2026-10-06)

Candidates (not built yet): see the ranked list in `research/report.md` (the Research tab). Settled by the
research: FX carry is not available on Capital.com (no FX side earns funding); standalone calendar
effects (pre-holiday, Monday, pre-FOMC) and BTC's 21:00–23:00 UTC window are not worth building.
