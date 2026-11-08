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
