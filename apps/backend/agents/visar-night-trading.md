# visar-night-trading

User-requested special demo experiment, updated 2026-10-15. Source: `56ac3bdfe7c1`.

## Current rule

US500 only, 1:200, one position and at most one entry attempt per night. The night clock is
**Europe/Tirane**, including DST. Classify the previous **09:30–16:00 New York** session, then separately
capture its **22:00 Albania-time** bid. During US/EU DST mismatch weeks these are different observations.

| Day filter | Earlier version | Current version |
|---|---:|---:|
| Minimum absolute session move | 0.25% | 0.25% |
| Net move / total absolute quarter-hour movement | 60% | **15%** |
| Quarter-hours agreeing with the net direction | 18/26 | **13/26** |
| Largest adverse excursion / session range | ≤35% | **≤75%** |
| Absolute open-to-close move / session range | none | **≥60%** |
| Session high-to-low range / opening price | none | **≤2%** |
| Observed minute coverage | ≥90% | ≥90% |

Opening/closing observations and all 26 quarter-hour endpoints are required. Bullish and bearish use
symmetric conditions. Otherwise the day is neutral. Minute highs/lows count toward excursions. The
body/range rule preserves rejection of large morning reversals while softer efficiency/agreement
thresholds allow ordinary counter-moves.

Skip a NY session containing a scheduled FOMC or Bank of Japan decision. Also skip an entry day with a
BOJ decision, since the release can occur during the overnight holding window. A FOMC decision later
on the entry day is outside that window; its completed NY session is excluded for the next night.
Decision dates use the issuing bank's date label, not the first meeting day or minutes release.
The calendar is verified through **2027-12-31**; uncovered dates block entries until refreshed.
Sources: [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm),
[BOJ 2024](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref230728a.pdf),
[2025](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref240731a.pdf),
[2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf),
[2027](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf).
Unexpected news is not predicted; the price-range and path filters provide additional exclusions.

At **03:27 on the next calendar day**, buy a bullish session's overnight dip below its 22:00 bid, or sell
a bearish session's bounce above it. Equal prices, missing observations, weekends and a reference older
than the immediately previous date skip. Entries expire at **03:28**, including virtual commands and
Capital HTTP pacing/retries.

Size with **90% of current strategy capital as margin**, the existing engine ceiling: approximately
180 times equity in notional exposure at 1:200, subject to size limits/rounding. Attach a stop targeting
**50% of this trade's starting strategy capital**, rounded toward entry and rebased after the virtual
fill/rounded size. This is separate from Capital's pooled-account margin call. Request the remaining
position's exit at **08:27**, without a take-profit. The persisted one-second clock requests Capital
closes independently of candle/quote arrival. API/network delay, unavailable markets and ordinary
stop slippage can change the actual fill time and loss.

Virtual starting capital is $10,000; Capital uses 0.2 times the position size, corresponding initially to
a $2,000 strategy allocation within shared $100,000 Arena 09. The loss target applies to that allocation.

## Frequency calibration

The user requested **25–50 entries per year**. The earlier 60% path-efficiency threshold alone passed
only 16 of 676 sufficiently observed sessions; all filters together yielded three trades.

`bun run calibrate-night` extracts potential entries with trading disabled, so account balance/profits
cannot affect selection. It checks a declared 150-point grid of efficiency/agreement/retracement
thresholds against **2024 entry counts only**, with neutral/reversal/volatility/calendar guards fixed.
Among settings in the requested band it prefers proximity to simple conservative reference thresholds;
it never scores returns, wins, Sharpe or later-period counts. The current settings produced:

| Period | Purpose | Opportunities | Actual full-backtest fills |
|---|---|---:|---:|
| 2024 | frequency calibration | **25** | **25** |
| 2025 | later-period check | **25** | **25** |
| January–September 2026 | later-period check | **22** (29.4/year annualized) | **22** |
| Total | | **72** | **72** |

Later dates were checked without retuning for their returns. This is not a pristine unseen profitability
holdout: the dataset was inspected during earlier interpretations. Frequency is an average opportunity
rate, not a quota or a promise of an entry every week.

## Backtest result

Standard window **2024-01-01 through 2026-09-30**, minute bid candles, ask-side buys/short exits, spread,
rounded sizes, pessimistic stops and shared margin model. No funding rollover falls inside the
03:27–08:27 holding period.
All 72 potential entry dates match the actual fills; there was no capital reset.

| Measure | Result |
|---|---:|
| Starting / ending capital | $10,000 / **$2.61** |
| Return / maximum drawdown | **−99.9739% / 99.9783%** |
| Trades | 72 (46 long, 26 short) |
| Win rate | 43.06% |
| Profit factor | 0.3697 |
| Sharpe / trade t-statistic | −1.2124 / −2.0317 |
| Scheduled exits / stop exits | 61 / 11 |
| Agent errors | 0 |

All entries were 03:27 and all timed exits 08:27 local time. A fresh-capital final-120-day check also lost
86.2% over eight trades. The requested frequency is achieved; this test does **not** show a profitable
strategy. Minute history does not reconstruct the historical tick path or remote broker queue.

## Why the history starts in 2024

The test runs **from January 2024 through September 2026**. It did not end in 2024: the previous strict
rule happened to place all three trades in 2024 and none in 2025–2026.

The stored US500 minute tape begins **2024-01-01 23:01 UTC**. On 2026-10-15, authenticated read-only
Capital demo probes returned no minute bars for sampled trading windows in 2015, 2020, 2022, 2023 and
2023-12-29; the 2024-01-02 window returned 121 bars. A `to=2023-12-31,max=1` minute probe was empty,
whereas its January 2024 counterpart returned data. Older **hourly data in 2023** and **daily data in
2015** were available. The official [price API](https://open-api.capital.com/) documents these resolutions
but does not promise one universal start date.

Daily/hourly candles cannot reveal the 03:27 price, quarter-hour session path or whether a tight 1:200
stop hit before 08:27. A longer exact test needs verified overnight minute bid/ask data from another
source and earlier policy calendars. Another broker's CFD/futures tape must be labeled as a proxy,
with execution/spread differences disclosed. We do not fabricate minute prices from old bars.

## Version and demo admission

The user requested a special Capital demo slot. The roster scopes that exception to
`visar-night-trading:US500@200` at this hash, bypassing admission performance/maturity gates while
retaining safety, kill switches and subsequent demotion. It is labeled **user experiment**; after
demotion, ordinary re-entry evidence is required. Earlier source `98de49ace1c6` had three historical
trades (−48.18%) and no forward Capital trades before revision. Its versioned record is retained.

## Tick engine recheck (2026-10-16)

At unchanged source `56ac3bdfe7c1`, engine `2026-10-ticks-v2` produces 71 funded trades, final $2.21
(−99.9779%), Sharpe −1.2393, profit factor 0.3682, zero agent errors. This supersedes the candle-engine
result above for current comparisons. It uses generated historical tick paths (seed 1, 16 ticks/minute),
not captured tick history; 2024–September 2026 predates recording. Frequency calibration counts remain
72 opportunities. The November 8 independent audit below identifies the missing fill: no 03:27
candle on July 3, 2024; the request expired at 03:28. This was not capital exhaustion. No thresholds
were tuned for profit and the explicit Arena 09 demo experiment remains.

## Backtest audit — 2026-11-08

Requested after the unchanged forward experiment reached two wins from two trades (+96.96%).
Conclusion: the historical loss reproduces and follows the coded rule; two forward wins cannot
establish an edge. This audits the operational proxy for the user's manual pattern, not whether
the proxy captures every subjective feature of that pattern. No thresholds were retuned.

### Data, signals, clocks and accounting

- Source remains 56ac3bdfe7c1; current engine 2026-10-ticks-v2. The standard 973,384 minute rows
  exactly match a fresh PostgreSQL read, SHA-256
  `d46c624908259285b9e886a3211fb80cae159473101b43fb5602b219cc2d0285`; zero differing fields.
- A separate Python/ZoneInfo implementation, using its own feature math, reproduces 72 qualifying
  dates (25 /25 /22 by year) and every filled direction. All minute OHLC bounds are valid.
  The engine executes 71. July 3, 2024 has no 03:27 candle; the next arrives 03:28, exactly when
  the entry expires. The rejection log confirms this. The engine correctly avoids an invented fill.
- Every executed entry is 03:27 Tirana and every scheduled exit 08:27, across DST changes.
  Independent Decimal checks match all 71 lot-rounded 90%-margin sizes and all dollar P&L
  identities. Final unrounded cash is $2.205, displayed $2.21. Capital was not reset.
- Eleven stops lost 49.8–52.3% of then-current capital; rounding and first-available simulated
  quote slippage explain the distance from the 50% target. Funding is zero for every trade: the
  five-hour holding period does not cross the modeled rollover. Stops remain ordinary market stops.

### Frozen sensitivity diagnostics

Same original rules and January 2024–September 2026 window; starting capital $10,000. These are
isolated diagnostics, not new agents, promoted results or replacements of the primary history.

| Diagnostic | Trades | Ending capital | Total return |
|---|---:|---:|---:|
| 1:200, seed 1, 16 ticks/minute (primary reproduction) | 71 | $2.21 | −99.9779% |
| 1:200, seed 2, 16/minute | 71 | $2.17 | −99.9783% |
| 1:200, seed 3, 16/minute | 71 | $1.85 | −99.9815% |
| 1:200, seed 1, 64/minute | 71 | $2.36 | −99.9764% |
| 1:200, zero spread, stops/sizes replayed | 71 | $5.70 | −99.9430% |
| 1:20, normal spread | 71 | $6,614.25 | −33.8575% |
| 1:1, normal spread | 71 | $9,810.31 | −1.8969% |
| 1:1, zero spread | 71 | $9,869.76 | −1.3024% |

The margin setting means roughly 180×, 18× and 0.9× exposure respectively; the stop still targets
half of account capital, so its price distance changes with leverage. The loss persists without
spread, and funding contributes nothing. Leverage, large loss budgets and compounding magnify a
slightly negative historical price signal; a particular synthetic path is not creating the ruin.
Fresh-capital annual diagnostics also lose: 2024 −86.56% (24 fills), 2025 −82.45% (25),
January–September 2026 −99.13% (22). Full-period compounding remains the primary result.

### Forward replay and luck

- November 3, replaying only 122,785 archived quotes for November 2–3 with the actual $12,069.072
  entry capital, produces exactly 287.8 short units, 7,548.5 →7,522.0 and $7,626.70 profit.
  The simulated entry timestamp differs by 1 ms; prices, size, exit time and P&L agree. No
  synthetic quote is used. This validates that recorded winning trade through the replay engine.
- October 16 entered before tick recording began, so its entry/early risk cannot be exactly
  validated. Mixed replay generates its missing part, yielding +93.54% for the two-trade period
  versus actual +96.96%; approximately 0.9 index point of entry/exit differences on the first
  trade explains the gap. The second trade's changed dollar profit in that combined replay is
  its changed starting capital, not a changed price outcome.
- Historical wins: 31/71 =43.66%; two wins under a stationary independent version of that win rate
  occur about 19.06% of the time. Fifteen of 70 historical adjacent pairs were both winners.
  Four consecutive wins occurred within the losing history. Win counts alone are weak evidence.
- The *magnitude* is more unusual: actual +20.69% then +63.19% compounds to +96.96%, beyond the
  best historical adjacent pair (+87.28%). About 0.97% of all empirical two-trade draws with
  replacement reach the live gain. This is a descriptive, post-observation, stationarity-dependent
  comparison; it is not a calibrated probability of luck or proof of a new regime/edge.
- With two successes, the exact two-sided 95% binomial win-rate interval is about 15.81–100%,
  under independent identical trials. [NIST's exact-binomial method](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).
  Real trades need not be independent/stationary. The mirrored Capital wins are the same two
  signals, not two extra independent observations.
- One further −50% trade would reduce $19,695.77 to about $9,847.89, erasing both gains.
  Historical average percentage win was about +17.96% versus −26.16% average loss; win rate
  by itself does not measure profitability.

### Reporting defect fixed and remaining limits

The primary dataset reaches September 30 and the reproduced loss is unaffected. A requested
October 14–November 7 **synthetic-only** diagnostic, however, only has minute inputs through
October 21 01:34 UTC while the nightly ingest is held. Recorded quotes supply the later dates in
auto replay. The old `uncoveredMinutes=0` did not count absent source dates and could be mistaken
for verified complete coverage. New replays record requested/actual input bounds, leave calendar
coverage explicitly unchecked (`uncoveredMinutes=null`), and warn about a large missing tail in
the CLI. They do not fabricate missing history. A missing-market-minute total requires a verified
instrument/holiday calendar and is still unknown. Metadata correction does not change trading math
or invalidate the primary reproduced cashflows.

Historical fills still approximate intraminute order, spread, liquidity, gaps and historical dealing
rules from minute data/current rule snapshots. The recorded second-trade agreement is encouraging
engine evidence, not verification of every earlier simulated stop. The original aggressive strategy
and its special demo admission remain unchanged; exact forward inputs/ticks continue to accumulate.

Audit raw results and independent oracle are retained privately under
`apps/backend/data/night-audit-20261108/`. Baseline reproduction uses
`bun run backtest visar-night-trading --epic US500 --workers 1 --no-push --force`; sensitivities add
`--tick-seed 2`, `--tick-seed 3` or `--ticks-per-minute 64`. Jobs run inside trader.slice.
Calendar references: [Fed](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm),
[BOJ 2024](https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/index.htm),
[2025](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref240731a.pdf),
[2026](https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf).

## Breakdown of the 71 original trades — 2026-11-09

User-requested decision support for defining a consistently bullish/bearish session. Same frozen
source, January 2024–September 2026 tape and 71 primary tick-engine fills as the audit above.
No deployed agent, parameter, admission or forward record changed. These are descriptive groups of original
trades, not backtests of revised strategies. Returns below are arithmetic means of each original
trade's P&L divided by its entry equity; they are not compounded portfolio returns.

### Which daytime features separate outcomes?

| Day feature | Trades | Wins | Mean account return/trade | Mean full-five-hour price move |
|---|---:|---:|---:|---:|
| All qualifying trades | 71 | 31 | −6.90% | −2.99 bp |
| Largest adverse move <35% of session range | 22 | 12 | −0.12% | −0.73 bp |
| Largest adverse move 35% to <50% | 29 | 13 | −4.05% | +0.69 bp |
| Largest adverse move 50–75% | 20 | 6 | −18.47% | −10.82 bp |
| Only 13–15 of 26 quarter-hours agree | 25 | 8 | −14.45% | −8.76 bp |
| 16–18 quarter-hours agree | 42 | 20 | −3.38% | −0.03 bp |
| 19–26 quarter-hours agree | 4 | 3 | +3.44% | +1.96 bp |
| Path efficiency ≥60% | 3 | 2 | +3.80% | +2.11 bp |
| Long | 45 | 22 | −5.83% | −3.15 bp |
| Short | 26 | 9 | −8.74% | −2.72 bp |

The price column uses the same entries and the tier-1 diagnostic's scheduled 08:27 exits, including
bid/ask spread, without the tight 1:200 stop. All 71 entry times, prices and sides match the primary
replay; none of the tier-1 trades stopped. One basis point is 0.01% of price. It separates directional
price performance from the primary leverage/stop outcome; it is not an unlevered account return.

The large-reversal group loses in each year: mean account returns −25.03% (N=7) in 2024, −8.54%
(N=7) in 2025 and −22.40% (N=6) in January–September 2026. The <35% group averages +3.41% (N=9),
+1.82% (N=6), then −6.33% (N=7). Cleaner paths are a plausible next hypothesis, not an established
profitable rule. Thirteen agreeing steps are only half the session; that proxy is looser than a
strong everyday reading of "consistently bullish/bearish."

### Frequency cost of tighter definitions

Each row changes only the named filter and retains the other current conditions. Annual frequency
is the retained fill count divided by the original 2.75-year window, not a prediction. The 50%
reversal, 16-step and 80% body rows combine simple displayed bins after inspecting outcomes;
all comparisons are exploratory and share the same observations.

| Keep only | Trades | Trades/year | Mean return/trade | 2024 | 2025 | 2026 Jan–Sep |
|---|---:|---:|---:|---:|---:|---:|
| Current rule | 71 | 25.8 | −6.90% | −5.07% | −2.17% | −14.25% |
| Adverse move <50% of range | 51 | 18.6 | −2.36% | +3.14% | +0.30% | −11.19% |
| Adverse move ≤35% | 22 | 8.0 | −0.12% | +3.41% | +1.82% | −6.33% |
| At least 16/26 steps agree | 46 | 16.7 | −2.79% | −2.41% | +0.69% | −7.81% |
| Open-to-close body ≥80% of range | 18 | 6.5 | +1.99% | +5.83% | −3.28% | +4.47% |
| Efficiency ≥60% | 3 | 1.1 | +3.80% | +3.80% | No trades | No trades |
| Morning and afternoon both align | 61 | 22.2 | −6.84% | −4.34% | −4.13% | −13.59% |

The 80% body row is a possible separate hypothesis, but N=18 is small and 2025 still loses.
An ever-higher body threshold is not monotonically better: the three trades with body ≥90% average
−2.95%. A larger net day move alone does not rescue this sample either: all three move-size groups
(0.25–<0.5%, 0.5–<1%, ≥1%) have negative mean account returns. Eleven primary trades stopped; only
two would have finished positive at 08:27. Removing stops is not supported by that observation.

There is no validated replacement here. The strongest follow-up is a separately versioned,
prospectively frozen test excluding large reversals, with smaller independently declared risk;
it must accept fewer trades instead of relaxing filters to fill a 25–50/year quota. Do not silently
apply a winning-looking subgroup to the original run. The 2025/2026 slices have already been seen
and cannot serve as untouched validation for a newly selected threshold. Correlated features,
multiple comparisons and small groups prevent treating these descriptive gaps as proven effects.

### Per-trade inspection and retained artifacts

Private derived artifacts are in `data/night-breakdown-20261109/`: `spec.json` records the simple
group boundaries, `analyze.py` joins the independent oracle to both frozen ledgers, `breakdown.json`
and `trades.csv` contain every trade, and `71-trades.html` is the self-contained interactive view.
It provides feature-group outcomes and year counts, selectable candidate subsets, all 71 setups
on an efficiency/reversal scatterplot, and each previous NY session's 15-minute close path with a
minute-OHLC envelope, largest conservative adverse span, current threshold headroom, night pullback,
entry/exit, stop/deadline reason and actual spread drag. The clean first setup (January 8, 2024;
74.1% efficiency, 19 agreeing steps, only 13.5% reversal) still led to a −15.88% night trade on
January 9: a directional day does not by itself establish the overnight continuation hypothesis.

Validation checks all 71 unique date/side joins, complete bin partitions, recomputed checkpoint
efficiencies and agreement of all plotted adverse spans with the independent oracle. Input SHA-256
remains the audit's frozen hash. Work ran inside trader.slice with one CPU /1 GiB limits; ordinary
heavy-service holds were not changed. No raw ticks were copied. The earlier agent source without
body/range guards is not reproduced by filtering these current 71 trades with its three old path
cutoffs; that current-trade intersection has just one fill and must not be confused with its old
three-trade backtest.

### Leverage × per-trade loss-limit decision grid

The user clarified that "accuracy" means the win rate at each leverage and allowed **single-trade
loss**, such as −20% or −40%, with no configured target beyond −50%. It does not mean portfolio
peak-to-trough drawdown. The completed study replays all **324 combinations**: six day definitions,
all nine platform leverage tiers (1, 2, 3, 5, 10, 20, 50, 100, 200), and loss targets 5%, 10%, 20%,
30%, 40%, 50% of trade-start capital. Margin use is held at 90%. Every cell starts with fresh $10,000
and runs the full engine over the same generated tick tape, including rounded position sizes,
ordinary-stop rebasing, bid/ask spread, latency, deadline expiry and broker distance restrictions.
It is not an extrapolation from the original ledger or a promotion search.

Current day definition, percent of filled trades that win:

| Leverage | −5% stop | −10% | −20% | −30% | −40% | −50% |
|---|---:|---:|---:|---:|---:|---:|
| 1:1 | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% |
| 1:2 | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% |
| 1:3 | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% |
| 1:5 | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% |
| 1:10 | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% |
| 1:20 | 43.7% | 46.5% | 46.5% | 46.5% | 46.5% | 46.5% |
| 1:50 | 38.0% | 42.3% | 45.1% | 46.5% | 46.5% | 46.5% |
| 1:100 | 19.7% | 38.0% | 42.3% | 43.7% | 45.1% | 46.5% |
| 1:200 | 9.7%* | 19.7% | 38.0% | 42.3% | 42.3% | 43.7% |

All cells have 71 fills except *1:200/5%: six wins from 62, with nine stop-distance rejections plus
the original one expired entry. Every ledger reconciles independently to the engine's ending cash;
eligible nights equal fills plus logged entry rejections for every cell. Three current-policy/50%
controls at tiers 1, 20 and 200 exactly reproduce the prior audit's trades, ending cash and tick-level
maximum drawdown. A lower fill count is not mistaken for better signal selection.

All 54 current-definition combinations lose overall. At 1:50, widening the loss target from 5% to
50% raises win rate from 38.03% to 46.48%, yet worsens total return from −52.95% to −68.60%.
Win rate must be evaluated with payoff sizes, compounded return and worst actual loss. Original
1:200/50% average percentage win/loss is +17.96%/−26.16%, implying roughly 59.3% wins for a positive
arithmetic mean if those payoff sizes stayed fixed, above the observed 43.66%. That is a descriptive
break-even calculation, not a forecast or a guarantee of positive compound growth.

Tighter day definitions change the frequency/risk trade-off. With 50% loss targets:

| Definition | Fills/year | 1:20 win rate | 1:20 total return / max DD | 1:200 total return / max DD |
|---|---:|---:|---:|---:|
| Current | 25.8 | 46.48% (71) | −33.86% /34.91% | −99.9779% /99.9812% |
| Adverse reversal ≤50% | 18.6 | 52.94% (51) | −1.04% /18.90% | −96.85% /98.88% |
| Adverse reversal ≤35% | 8.0 | 54.55% (22) | −3.89% /14.11% | −64.31% /84.38% |
| At least 16 agreeing steps | 16.7 | 54.35% (46) | −0.36% /18.16% | −96.34% /97.35% |
| Body ≥80% | 6.5 | 61.11% (18) | +9.85% /14.87% | −43.00% /80.68% |
| Efficiency ≥60% | 1.1 | 66.67% (3) | +1.12% /3.36% | +8.63% /29.95% |

The body ≥80% subset's positive arithmetic average at 1:200 still compounds to a 43% loss: sizing
and volatility matter even after a cleaner-looking signal is selected. Its lower-exposure result
is worth further study, with only 18 trades. The efficiency subset still has only three, all in 2024.
None of the 324 cells provides new independent data or untouched validation. Do not select a live
replacement by ranking this grid's returns.

The interactive view now opens on the decision grid. Users can select the day definition, then a
leverage/loss cell, or switch the matrix between win rate, total return, worst trade and portfolio
drawdown. Details show actual N/eligible nights, frequency, win-rate Wilson interval, equity curve,
mean return, win/loss sizes, break-even rate at those sizes, longest loss streak, spread drag,
yearly outcomes and categorized broker rejections. The original day-group and all-71-path views
remain available. Portfolio maximum drawdown is measured on ticks; the plotted curve is daily close.
The loss target and pooled broker margin closeout are different calculations. Ordinary stops may
overshoot; [Capital's execution explanation](https://help.capital.com/hc/en-us/articles/360016573100-Why-did-Stop-Loss-trigger-incorrectly)
also states that they fill at the first available price. No guaranteed-stop fill or fee is assumed.

Seven representative current-policy risk cells were additionally replayed under seeds 2 and 3 at
16 ticks/minute and seed 1 at 64/minute (21 checks). The 1:200/50% controls retain 31/71 wins across
all four paths; ending cash ranges $1.85–$2.36. The very tight 1:200/5% case varies from 61 to 63
fills, 9.5–11.5% wins and −82.45% to −75.42% total return; it remains poor but exact historical
fills are not established. Selected tested cells show these ranges. Intraminute path, historical
spread and rule-snapshot limits matter especially for tight stops.

Artifacts: `risk-grid.ts`, `grid-spec.json`, six `grid-<policy>.json` files, `grid-summary.py`,
`grid-summary.json`, `risk-grid.csv`, `grid-sensitivity.ts` and its three result files, plus the
updated standalone `71-trades.html` and builder. Two bounded replay jobs each used one CPU /2 GiB
inside trader.slice; the bounded sensitivity job ran there as well. No production changes or
arena restart. The original eight-profile pilot (`risk-study.ts`, `risk-results.json`) is retained
as a diagnostic, superseded for the main comparison by this complete grid.

## Forward cohort requested 2026-11-09

The user explicitly requested ten US500 and ten US100 agents after the exploratory report, replacing
weak current runs. The original source and record stay unchanged. The nineteen new variants have
exact-source demo exceptions; all retain normal error/ruin and evidence-driven demotion. The stock
hold opportunity cost is a separate full-cash Nasdaq index-price proxy, zero funding, with entry/exit
spread, over the common January 2024–September 2026 window (+81.5057%). It omits dividends and direct
stock rebalance costs. Current stock-minimum estimates are snapshots, not a historical constituent
backtest. All inspected candidate returns remain below this passive benchmark in that window.

| Agent | Instrument | Tier | Trade loss target | BT N | BT return | BT max DD |
|---|---|---:|---:|---:|---:|---:|
| visar-night-trading | US500 | 1:200 | 50% | 71 | -99.98% | 99.98% |
| visar-night-lab/body-tight-100x | US500 | 1:100 | 10% | 18 | +18.77% | 40.23% |
| visar-night-lab/steps-10x | US500 | 1:10 | 10% | 46 | +0.21% | 9.42% |
| visar-night-lab/broad-5x | US500 | 1:5 | 20% | 51 | +0.07% | 4.97% |
| visar-night-lab/body-5x | US500 | 1:5 | 20% | 18 | +2.52% | 3.90% |
| visar-night-lab/body-20x | US500 | 1:20 | 20% | 18 | +9.85% | 14.87% |
| visar-night-lab/clean-50x | US500 | 1:50 | 40% | 3 | +2.69% | 8.24% |
| visar-night-lab/retrace-100x | US500 | 1:100 | 10% | 22 | +15.85% | 31.73% |
| visar-night-lab/steps-3x | US500 | 1:3 | 20% | 46 | +0.14% | 2.90% |
| visar-night-lab/broad-1x | US500 | 1:1 | 40% | 51 | +0.03% | 1.00% |
| visar-night-us100/broad-5x | US100 | 1:5 | 20% | 40 | -2.09% | 6.02% |
| visar-night-us100/baseline-1x | US100 | 1:1 | 40% | 60 | -2.96% | 3.06% |
| visar-night-us100/steps-20x | US100 | 1:20 | 20% | 35 | +9.11% | 24.86% |
| visar-night-us100/steps-tight-100x | US100 | 1:100 | 10% | 35 | +26.12% | 71.22% |
| visar-night-us100/body-5x | US100 | 1:5 | 20% | 19 | -7.33% | 8.83% |
| visar-night-us100/steps-3x | US100 | 1:3 | 20% | 35 | +1.73% | 4.13% |
| visar-night-us100/steps-10x | US100 | 1:10 | 10% | 35 | +5.29% | 13.21% |
| visar-night-us100/steps-tight-50x | US100 | 1:50 | 5% | 35 | +26.45% | 45.74% |
| visar-night-us100/steps-tight-20x | US100 | 1:20 | 5% | 35 | +4.06% | 26.26% |
| visar-night-us100/steps-1x | US100 | 1:1 | 20% | 35 | +0.59% | 1.39% |

All 19 source-specific backtests exactly reproduce their selected diagnostic trades and metrics.
US100 has 60 independent-oracle current-rule opportunities/fills (23/18/19 by year), with no extra
dates or side mismatches. Only step-consistency settings are positive in its grid; seven US100
variants explore that policy’s risk dimensions, with three lower-exposure classifier references.
The rare US500 clean endpoint has only three historical trades and an approximately annual cadence;
its zero-trade timeout is 365 days, five sparse body/retracement endpoints use 180, others retain60.
These are explicit observation windows, not immunity to losses/errors. No configuration target
exceeds50% of trade-start capital; actual ordinary-stop fills may exceed their targets.

The dedicated installable report is `/night-lab/index.html` on Trader: both complete risk grids,
all baseline session paths, stock-budget coverage and bounded current cohort results. Build source
is `ops/lab/build-night-lab.py`; derived published snapshots contain no credentials, account IDs
or raw captured ticks. The native client remains the main trading client.
