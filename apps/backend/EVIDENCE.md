# Agent evaluation and execution evidence

This extends Backtest → Virtual → Capital demo without resetting source hashes, cash, trades, slots
or equity histories. Economic fill rules/tick engine version are unchanged; new fields are derived
diagnostics. Admission thresholds remain those in agents/LIFECYCLE.md.

## Common-date controls

Every record is compared with holding its instrument 1:1 over the same dates, so Return − hold = excess:

- **Virtual:** the current standard 1:1 buy-and-hold control for the same instrument, from the run's start (the first
  common stored hourly observation after both starts) to their latest common observation. The run's return is on
  its starting capital, like its lifetime Return; the control's on its equity at that first observation. A run that
  started before its control (a replaced control) is rebased at the first common observation. Until 2026-11-22 the
  window began at the tick-feed epoch (Oct 16), so rows showed a lifetime Return beside an excess over fewer dates.
- **Backtest:** the 1:1 buy-and-hold backtest over the same historical window. A backtest left on an earlier engine
  (its run retired, so never re-run) is still compared, with both engines named in the note: holding over fixed
  dates hardly depends on the engine.
- **Capital demo:** realized cash return on the run's allocation since its first deal, against the control's stored
  hourly equity over the same dates (`cash-vs-hold`). Open positions count once closed.

No interpolation or future prices; exact timestamps are returned. Sizes differ: the percentage-point difference is
excess return, not risk-adjusted alpha. Missing controls or fewer than two shared points return unavailable, never
zero. Virtual corporate-action/funding limits apply.

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
Sharpe stays the cash-free ratio the backtest gate (−0.5) was set on; it does not subtract T-bills.

Current virtual exposure is notional / liquidation equity. Stop downside starts at the current mark;
gaps/future costs can change it. Shared broker margin is never inferred by scaling virtual accounts.

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
crossed the level, stored with `limit`; the level's distance from that quote is part of the adjustment (since
2026-11-12; such exits from November 11–12 carry evidence only where the backfill finds both ends).
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
