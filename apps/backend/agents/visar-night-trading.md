# visar-night-trading

User-requested special demo experiment. Source: `6ef6caeeb489`.

## Current rule

US500 only, 1:200, one position and at most one entry attempt per night. Every clock is **New York's**,
including DST: classify the **09:30–16:00** session, take the bid at its **16:00** close as the reference,
enter at **21:27** and exit at **02:27**. In Tirana that is 22:00, 03:27 and 08:27 outside the weeks when
Europe and the US change their clocks apart, when New York time keeps the trade at the same place in the US day.

| Day filter | Threshold |
|---|---:|
| Minimum absolute session move | 0.25% |
| Net move / total absolute quarter-hour movement | **15%** |
| Quarter-hours agreeing with the net direction | **13/26** |
| Largest adverse excursion / session range | **≤75%** |
| Absolute open-to-close move / session range | **≥60%** |
| Session high-to-low range / opening price | **≤2%** |
| Observed minute coverage | ≥90% |

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

At **21:27 New York on the session's own evening**, Monday to Thursday, buy a bullish session's dip below
its 16:00 bid, or sell a bearish session's bounce above it. Equal prices, missing observations and a
reference from another day skip. Entries expire at **21:28**, including virtual commands and Capital HTTP
pacing/retries.

Size with **90% of current strategy capital as margin**, the existing engine ceiling: approximately
180 times equity in notional exposure at 1:200, subject to size limits/rounding. Attach a stop targeting
**50% of this trade's starting strategy capital**, rounded toward entry and rebased after the virtual
fill/rounded size. This is separate from Capital's pooled-account margin call. Request the remaining
position's exit at **02:27 New York**, without a take-profit. The persisted one-second clock requests Capital
closes independently of candle/quote arrival. API/network delay, unavailable markets and ordinary
stop slippage can change the actual fill time and loss.

Virtual starting capital is $10,000; Capital uses 0.2 times the position size, corresponding initially to
a $2,000 strategy allocation within shared $100,000 Arena 09. The loss target applies to that allocation.

## Frequency calibration

The user requested **25–50 entries per year**. `bun run calibrate-night` extracts potential entries with
trading disabled, so account balance/profits cannot affect selection. It checks a declared 150-point grid
of efficiency/agreement/retracement thresholds against **2024 entry counts only**, with
neutral/reversal/volatility/calendar guards fixed. Among settings in the requested band it prefers proximity
to simple conservative reference thresholds; it never scores returns, wins, Sharpe or later-period counts.

| Period | Purpose | Opportunities | Actual full-backtest fills |
|---|---|---:|---:|
| 2024 | frequency calibration | **25** | **24** |
| 2025 | later-period check | **24** | **24** |
| January–September 2026 | later-period check | **22** (29.4/year annualized) | **22** |
| Total | | **71** | **70** |

Frequency is an average opportunity rate, not a quota or a promise of an entry every week.

## Backtest result

Standard window **2024-01-01 through 2026-09-30**, engine `2026-11-arrival-stall` on generated tick paths (seed 1,
16 ticks/minute; the window predates tick recording), ask-side buys/short exits, spread, rounded sizes,
ordinary market stops and the shared margin model. No funding rollover falls inside the 21:27–02:27 New York
holding period. 70 of the 71 qualifying dates fill: July 2, 2024 has no 21:27 candle and the entry expires at
21:28. There was no capital reset.

| Measure | Result |
|---|---:|
| Starting / ending capital | $10,000 / **$1.46** |
| Return | **−99.9854%** |
| Trades | 70 (11 stop exits) |
| Profit factor | 0.3257 |
| Sharpe | −1.3234 |
| Agent errors | 0 |

All entries are 21:27 and all timed exits 02:27 New York time. The requested frequency is achieved; this test
does **not** show a profitable strategy. Generated paths do not reconstruct the historical tick path or the
broker queue.

## Why the history starts in 2024

The test runs **from January 2024 through September 2026**. The stored US500 minute tape begins
**2024-01-01 23:01 UTC**; older Capital.com data is available only at hourly/daily resolution, which cannot
reveal the 21:27 price, quarter-hour session path or whether a tight 1:200 stop hit before 02:27. We do not
fabricate minute prices from old bars.

## Live cohort and Night Lab

The roster scopes the special Capital demo exception to `visar-night-trading:US500@200` and the other 19
members of the NY-clock cohort (`research/night-cohort-v5-20261125.json`; see [`LIFECYCLE.md`](LIFECYCLE.md)),
bypassing admission performance/maturity gates while retaining safety, kill switches and subsequent demotion.

The dedicated installable report is `/night-lab/index.html` on Trader: matched 1:1 hold benchmarks, all 20
forward experiments with live virtual and Capital demo updates, direction controls, and the nightly NY-clock
paper grid (`bun run night-grid`, 540 settings per index). Summary data is built by
`python3 ops/lab/build-night-lab.py`.
