# visar-night-trading

User-requested experiment, 2026-10-15. Source version: `98de49ace1c6`.

## Frozen rule

- Instrument US500 only; leverage 1:200; one position and at most one entry attempt per night.
- Clock: **Europe/Tirane**, including DST, assumed from the user's local timezone. The US opening
  observation is separately **09:30 America/New_York**; the reference remains fixed at 22:00 Albania time
  even during the weeks when US and European DST dates differ.
- Day classification uses only **09:30–16:00 New York**, with 26 quarter-hour moves from the opening bid
  to the cash-session close. Bullish and bearish use the same symmetric conditions:
  - Net move at least **0.25%** in that direction.
  - At least **18 of the 26 quarter-hours** move in that direction (two-thirds, rounded up).
  - Net move is at least **60% of the sum of absolute quarter-hour moves**: high directional efficiency.
  - The largest adverse excursion from an earlier high/low is at most **35% of the entire session range**.
    This also considers minute highs/lows, so quiet quarter-hour endpoints cannot conceal large swings.
  - Opening and closing observations, all quarter-hour endpoints and at least **90% of session minutes**
    are present. Missing evidence does not become a trend.
  Otherwise the day is neutral. These thresholds were chosen from the user's clarification that the
  path should feel consistently directional, and frozen before testing this interpretation. No search
  for profitable thresholds was performed. The 22:00 reference is captured separately from this filter.
- At **03:27 on the next calendar day**, buy if the prior day was bullish and the current bid is strictly
  below its 22:00 bid; sell if bearish and the bid is strictly above it. No overnight crossing is required
  before that snapshot. Equal prices, neutral days, missing opening/reference/entry observations, weekends,
  and references older than the immediately previous date produce no entry.
- Size with **90% of this run's current capital as margin**, the engine's existing margin-use ceiling:
  approximately 180 times equity in notional exposure at 1:200, subject to size limits and rounding.
  This is an explicit sizing assumption because leverage alone does not specify the stake.
- Attach an ordinary protective stop targeting a loss of **50% of this trade's starting run capital**,
  rounded toward entry. Rebase its price after the actual virtual fill/rounded size. This is not Capital's
  pooled-account margin call. Spread, price gaps and actual broker slippage can change the realized loss;
  an ordinary stop is not a guaranteed fill at its price.
- Request the remaining position's exit at **08:27**, with no take-profit. The persisted deadline uses
  the arena's one-second clock and also requests the Capital close without needing a fresh quote/bar.
  A real fill follows market availability, API pacing, network and confirmation delays. Entries expire
  at 03:28, including delayed virtual commands and later Capital retries.

The virtual run starts with $10,000. The existing Capital mirror scales it to 0.2 times the position size,
corresponding initially to a $2,000 strategy allocation within the shared $100,000 Arena 09 demo account.
The 50% loss target applies to the strategy allocation, not half of the entire shared account.

## First backtest of the consistency rule

Standard window **2024-01-01 through 2026-09-30**, minute bid candles with ask-side buying/short exits,
spread, rounded sizes, pessimistic stops and the shared margin model. No funding rollover occurs in this
holding window. Rules were not tuned after reading the result.

| Measure | Result |
|---|---:|
| Starting / ending capital | $10,000 / **$5,181.87** |
| Return / maximum drawdown | **−48.1813% / 57.2877%** |
| Trades | **3** (2 long, 1 short) |
| Win rate | 33.33% |
| Profit factor | 0.0235 |
| Sharpe / trade t-statistic | −0.7545 / −1.6246 |
| Scheduled exits / stop exits | 3 / 0 |
| Agent errors | 0 |

The data audit found 705 sessions with closing observations, 676 with all required coverage, and only
**10 consistently trending sessions**. Three then met the next-night price/date/entry conditions. They
entered on 2024-01-09 (long), 2024-04-05 (short), and 2024-07-03 (long), all at 03:27 local time and all
closed at 08:27. The final 120-day sanity window had **zero trades**, not a profitable recent record.
This is a deliberately selective filter with too few trades to establish an edge. Minute history does
not reconstruct the historical tick path or Capital's remote queue; forward virtual and actual demo
execution will supply that comparison. Do not weaken the filter simply to populate the leaderboard.

The earlier net-change-only interpretation was superseded before deployment when the user clarified
that the route through the NY day mattered. Its 153-trade, $0.26 ending balance belongs to different code
and is not the backtest of this consistency rule.

## Special demo admission

The user explicitly requested a shoehorned Capital demo slot after the backtest. `roster.json` records
that exception for exactly `visar-night-trading:US500@200` at the source version above. It bypasses normal
promotion maturity and has slot priority, while preserving runtime safety, kill switches and subsequent
demotion rules. It is labeled **user experiment**. After demotion, normal re-entry evidence is required;
the exception is not a permanent exemption and does not automatically apply to edited source.
