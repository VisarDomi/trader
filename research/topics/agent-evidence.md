# Agent health: costs, fair comparisons and the October 29 research batch

_Implementation/research update, October 29, 2026. Existing trading histories and sources are retained._

## What the new evaluation separates

An operationally healthy agent is not automatically a profitable strategy. A positive lifetime return
can reflect its market, entry date, sizing or luck. The leaderboard now shows same-instrument,
common-observation-window excess over the 1:1 buy-and-hold control, actual virtual exposure and cost
coverage. Excess is not risk-adjusted alpha. All admission/maturity gates still apply.

In the frozen development snapshot, the TSLA volatility-managed holder and its control returned about
6.625% and 6.622% over their common current-tick-epoch window: roughly 0.003 percentage points apart.
Their visibly different lifetime returns were not a fair head-to-head comparison. Held positions can
show gains with zero closed trades; neither that nor a short annualized Sharpe establishes an edge.

## First quote-supported cost audit

The development-copy audit found 2,408 eligible historical standard-run trades and matched archived
quote-side prices for 2,349; 59 remained unmatched. Old pre-recording entries cannot be reconstructed.
Quotes are read from the sole compressed PostgreSQL archive and the raw tick tape is never copied.
These are archived-quote **reconstructions**, not proof of the exact quote identity used historically.
Decision timing is unknown for those old trades. New fills capture the references directly.

The live deployment exposed an archive timer that had stopped scheduling after the PC reboot.
Captured quotes remained in the protected spool. After repairing the timer and draining it, the two
live audits attached 2,438 archived-quote matches (2,349 initially, then 89). The initial unmatched
development cases were resolved by archive catch-up; pre-recording entries still remain unknown.
The monetary example below remains the original frozen subset, not the expanded live total.

For the non-control strategy subset in that snapshot, 1,799 trades had quote-supported evidence:

| Component | Virtual USD |
|---|---:|
| Fill-time midpoint price P&L | −17,583.98 |
| Quoted spread cost | −7,458.78 |
| Funding | −1,027.98 |
| Net P&L, including rounding/protection | −26,070.74 |

These are virtual dollars over a selected historical subset, not actual account returns or an
investable portfolio. Price-move P&L was already negative at the observed fill times before quoted
spread, so funding alone cannot explain that subset. Execution timing, selection, market exposure
and signal quality still need distinct tests. Some individual runs had positive midpoint P&L erased
by costs; that is why the report is per run instead of one blanket judgement.

Actual Capital cashflows remain separate. Unlinked funding/corporate actions are explicitly at account
level, not invented per-run allocations. Realized cash drawdown excludes intratrade/open-position risk.

## Frozen controlled batch

The [predeclared brief](../../apps/backend/agents/RESEARCH-2026-10-29.md) fixes instruments and parameters.
No tuning followed these results. Primary window January 2024–September 2026; intraminute paths in
that window are synthetic and cannot validate real intraminute spread dynamics.

| Study | Market | Return | Max DD | Sharpe | Closed trades |
|---|---|---:|---:|---:|---:|
| Quote breakout, immediate | US500 | −3.1% | 15.3% | −0.13 | 478 |
| Quote breakout, spread gate | US500 | +2.5% | 8.5% | 0.20 | 324 |
| Quote breakout, immediate | US100 | +22.9% | 12.6% | 1.03 | 471 |
| Quote breakout, spread gate | US100 | +20.8% | 10.8% | 1.06 | 418 |
| Night signal, 0.5% planned risk twin | US500 | −4.9% | 5.0% | −1.25 | 71 |

Both breakout variants pass the existing per-market guardrail gate. They qualify for virtual
observation, not Capital demo or a claim of skill. The small-risk night twin fails the normal
performance gate and stays in backtesting; it inherits no special demo permission. The original
night experiment is unchanged. Smaller risk reduces damage, but this test did not create an edge.

Alternate synthetic seed 7 produced similar breakout outcomes: US100 +22.4%/+20.1%, US500 −2.3%/+2.7%
(immediate/gated). A separate recorded-only October 16–28 replay had just four closed US100 trades
and five US500 trades: useful as a compatibility check, far too small to establish an execution edge.
Those sensitivity records are research diagnostics, not replacements for the primary admission window.

## What to judge next

- Compare each frozen breakout pair's missed opportunities, actual spread, sizing, common-date
  control and realized/virtual divergence. Preserve failures as well as successes.
- Keep all current candidates in the normal forward evidence process. Do not repeatedly tweak
  parameters to make a chart green or count correlated latency records as independent tests.
- Forecast-dependent records are explicitly paused while TimesFM is held. Known downtime is excluded
  from virtual maturity; safety checks and exits still run. Passive holdings are not retired merely
  for having zero closed trades while a position is open.
- Formal selection-adjusted confidence needs a reliable trial history and enough observations; no
  probability of skill is fabricated from a few weeks. The variant count is context, not independent N.

Primary context: [time-series momentum](https://www.aqr.com/Insights/Datasets/Time-Series-Momentum-Original-Paper-Data),
[volatility-management out-of-sample evidence](https://www.lehigh.edu/~xuy219/research/COWY.pdf),
[selection bias and deflated Sharpe](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf),
and [Capital fees](https://capital.com/en-gb/ways-to-trade/fees-and-charges).
