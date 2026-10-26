# Arena journal

Newest entry first. Written by the coding agent on each babysitter visit; the rules it follows are in
[LIFECYCLE.md](LIFECYCLE.md). The idea log at the bottom lists every agent idea tried.

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

One line per idea: agent — mechanism — status (date).

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
