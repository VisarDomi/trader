# Agent evaluation and execution evidence

Evidence fields on Backtest → Virtual → Capital demo records are derived diagnostics: they never change
source hashes, cash, trades, slots, equity histories or fills. Admission thresholds are those in
agents/LIFECYCLE.md.

## Common-date controls

Every record is compared with holding its instrument 1:1 over the same dates, so Return − hold = excess:

- **Virtual:** from the run's start to its latest stored hourly equity, on its starting capital (like its Return).
- **Backtest:** the backtest's historical window.
- **Capital demo:** realized cash return on the run's allocation since its first deal, to now (`cash-vs-hold`).
  Open positions count once closed.

The hold (`src/arena/hold.ts`) is the instrument bought outright with the same money, never sold,
paying no CFD fees: an index can be owned through its shares, a share or coin directly, a metal as metal, a currency
as a deposit. Return = (1 + price change) × (1 + what owning it paid) − 1:

- indices: the tracker's dividends (US500 SPY, US100 QQQ, US30 DIA); shares: their own dividends (Yahoo Finance, each
  as a fraction of the previous close on its ex-date);
- currencies: the foreign deposit rate (EURUSD €STR, GBPUSD SONIA, AUDUSD the 3-month interbank rate; FRED);
- gold, silver, crypto: price only;
- oil and natural gas: price only, an upper bound, since nobody owns barrels or gas outright (storage, futures roll).

Prices are the arena's own: the close of the last minute candle finished by the moment (within four days), else the
lab's daily bars. The Buy & Hold control agent is not the hold: it is a CFD at 0.9× exposure with overnight
funding and no dividends, so over 2024-01 → 2026-10 it trailed the outright price before dividends on every
instrument (US500 +56.8% vs +61.0%, gold +91.2% vs +101.2%), and it fell less in a drop.

No future prices; exact dates are returned. Sizes differ: the percentage-point difference is excess return, not
risk-adjusted alpha. Missing prices, dividend history or deposit rates return unavailable, never zero.

Current virtual exposure is notional / liquidation equity. Stop downside starts at the current mark;
gaps/future costs can change it. Shared broker margin is never inferred by scaling virtual accounts.

## Cash and inflation

Every matched comparison also carries what the same dates paid elsewhere (`hurdles`, `src/arena/rates.ts`):

- **T-bills, the opportunity cost.** Rolling 3-month US Treasury bills: money that stays available earns this with no
  price risk. FRED `DTB3` (secondary market, bank-discount basis) is converted to the bond-equivalent yield the bill
  pays and accrued every calendar day at the latest published rate. Longer Treasuries are not the floor: their prices
  move with interest rates, so holding one is another play.
- **Inflation, what idle dollars lose.** US CPI-U, all items, not seasonally adjusted (FRED `CPIAUCNS`, the index
  TIPS pay on); the accounts are in US dollars. PPI measures producers' prices and core CPI leaves out food and
  energy, so neither is what money buys. A month's index sits mid-month, days between interpolate geometrically, and
  days after the latest release continue its trailing 12-month pace (`estimated`).
- **After inflation** = (1 + return) / (1 + inflation) − 1. Inflation divides every alternative alike, so it never
  changes which one wins or the excess over hold; it moves the line between gaining and losing purchasing power.

The series are stored in the arena database (`macro_series`), refreshed every six hours (bills fall back to
treasury.gov) and kept when a refresh fails. Dates before the stored history (2000) return no hurdles, never zeros.

**Sharpe and Sortino** measure each period's return above what T-bills paid over that period (`riskFree: 'tbills'`),
on live runs, Capital cash and backtests alike, measured from each record's stored equity curve. The backtest admission gate (−0.5) keeps checking the
Sharpe of the returns themselves (`cashFreeSharpe`): it filters strategies that lose on their own. On the Sharpe above
T-bills it would also reject 127 of 637 backtests, mostly low-leverage variants rarely in the market, whose idle cash
earns nothing in a CFD account. Promotion does not use Sharpe (trade t-statistics and the monkeys).

## How often the backtest did this

Every forward record with a closed trade carries `frequency` (`src/arena/frequency.ts`): how often the backtest of the
same agent version, instrument and leverage returned what the record did over as many days.

- The backtest's stored daily equity is cut into every period as long as the record has lived (whole days, at least
  one), one per stored day a period can start on. A period that starts with no money left is skipped.
- **Virtual:** the run's Return over its life. **Capital demo:** its cash return since the first deal. Backtests have
  none: they are the history.
- The count is of periods that returned at least as much (`atLeast`) and at most as much (`atMost`). A record is
  described on the side it sits on: "did this well in 1.3% of 48-day periods", "never did this badly in 40 days".
- It reads no future prices, draws no samples and uses no random numbers; the same inputs always give the same count.

Periods overlap (neighbours share all but one day), so 12 of 956 is usually one or two episodes, not twelve;
`independent` is how many fit end to end, and the record's screen draws every period. A backtest that holds fewer than
four periods end to end, or fewer than 30 in all, gives no frequency, as does a backtest of another code version.
A Capital record mirrored after its paper run had grown or shrunk trades larger or smaller than a fresh account,
which this comparison does not correct.

`wins` is the other reading: the chance of at least the record's number of winning trades at the backtest's win rate
(a binomial tail, trades taken as independent). It ignores the size of each trade, so it can call ordinary what the
periods call unseen. `visar-night-trading` US500 1:200 on Capital demo (2026-11-25): three wins of three at a 43.7%
win rate happen 8.3% of the time, while the +166% they made in 40 days is above every 40-day period of that backtest
(best +114.6%).

The number says how the record compares with its own history, not whether it has an edge. A result its backtest
rarely reached is luck, a different market or a backtest that understates the strategy; the rankings show the best
of several hundred records, so some rare results are expected among them. Sharpe answers another question: return
per unit of its swings, annualized, above T-bills.

`GET /api/runs/<backtest id>/periods?days=N` returns every period by its end date with the median: the chart on
the record's screen. Each current backtest's curve is read once and again only after it is re-run.

## Costs and coverage

New fills store small derived midpoint/spread/provenance references, decision midpoints when known,
and recording sequences when available. This is per-fill evidence, not a second tick tape. It uses the
existing quote path and makes no additional Capital subscriptions/orders.

```
fill-time midpoint P&L − quoted spread + funding + rounding/protection/target-level adjustment = net P&L
decision-midpoint signal P&L − signed timing cost = fill-time midpoint P&L
```

Timing is positive adverse, negative favorable. The second identity requires both decision quotes.
A take-profit filled at its level between quotes (engine `2026-11-tp-level`) is supported by the quote that
crossed the level, stored with `limit`; the level's distance from that quote is part of the adjustment. Exits
recorded before that field existed carry evidence only where the backfill finds both ends.
The double-spread diagnostic subtracts another spread from the same observed trades; it does not
re-size positions or re-run signals/stops/liquidations, and is not an independent counterfactual backtest.
Totals distinguish at-fill references, reconstructed matches, unknown trades and truncated histories.
Diagnoses apply only to their supported subset. Before-funding P&L still contains spread/timing; open
funding/P&L is separate. Synthetic backtest references remain simulated, not recorded broker costs.

`bun run audit-costs` reads the one compressed PostgreSQL archive and reports possible matches.
`--backfill --limit 5000` attaches derived metadata through the private API. It checks each block's
SHA-256, chooses the latest preceding delivered quote within 250 ms, and requires its executable side
price to match the stored fill (a take-profit exit at its level: the side at or beyond the level). It never
searches older quotes for a convenient price, so entries under engine `2026-11-arrival-price`, filled at the
quote before the one that released them, mostly stay unknown when their at-fill evidence is missing. Exact historical
quote identity is still inferred and decision timing unknown: method `archived-quote-match` is distinct
from an at-fill capture. Unmatched/pre-recording trades remain unknown. Only missing evidence is filled;
a fingerprint protects trade identity. Original prices/P&L/source/tick history are never rewritten.

Private token-authenticated lab routes: `/api/evidence/cost-candidates` and `/api/evidence/costs`.
Neither is on the public native-device allowlist. `/api/evidence` supplies aggregate coverage/cashflows;
existing run/leaderboard endpoints add optional typed evidence. List queries omit recovery snapshots;
recovery/run details retain complete state. Forward read caches refresh every 30 seconds, not every
tick. Historical cost aggregates load only on historical reads and are cached for 30 minutes;
backtest pushes and evidence ingestion invalidate them immediately.

Capital demo remains actual realized cash plus linked adjustments. Open P&L, unallocated funding and
intratrade drawdown are different quantities. Actual rows never borrow virtual costs, exposure or
benchmarks. Unlinked costs remain explicitly at account level, not guessed into strategy allocations.

## Availability and maturity

Forecaster intervals persist only on transitions. The existing resource marker's explicit paused_at
can seed the current intentional hold; older unrecorded outages remain unknown. Known unavailable
time is excluded from virtual observation days in shared verdicts and the engine. Promotion requires
the dependency available. Silence requires a flat account: an open holding with zero closed trades is
not inactivity. Bust/errors, stops and broker reconciliation remain active while forecasting is paused.

Calendar age/lifetime results remain intact. Availability is evaluation metadata, not a source change.
Backtest-qualified means admission evidence, not skill; retained failing records are calibration and
failed new backtests stay visible. Variant counts are context, not independent-trial counts or formal
adjusted probabilities. agents/RESEARCH-2026-10-29.md freezes the small controlled research batch.
