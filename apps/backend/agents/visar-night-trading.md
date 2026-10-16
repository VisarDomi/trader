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
72 opportunities; available capital and the revised fill/stop path affect executed trades. No thresholds
were tuned for profit and the explicit Arena 09 demo experiment remains.
