# Agent evaluation and execution evidence

This extends Backtest → Virtual → Capital demo without resetting source hashes, cash, trades, slots
or equity histories. Economic fill rules/tick engine version are unchanged; new fields are derived
diagnostics. Admission thresholds remain those in agents/LIFECYCLE.md.

## Common-date controls

Virtual comparisons use the current standard 1:1 buy-and-hold control for the same instrument. Start
at the first common stored hourly equity observation after both starts and the current tick-feed
epoch; end at their latest common observation. No interpolation or future prices. Each return is
rebased to its own starting equity and the exact stored timestamps are returned.

This window can be shorter than lifetime Return. Sizes differ: the percentage-point difference is
excess return, not risk-adjusted alpha. Missing controls/two shared points return unavailable, never
zero. Backtests require the same dates/window/current engine. Actual realized cash is not compared
with held virtual equity as though the bases matched. Virtual corporate-action/funding limits apply.

Current virtual exposure is notional / liquidation equity. Stop downside starts at the current mark;
gaps/future costs can change it. Shared broker margin is never inferred by scaling virtual accounts.

## Costs and coverage

New fills store small derived midpoint/spread/provenance references, decision midpoints when known,
and recording sequences when available. This is per-fill evidence, not a second tick tape. It uses the
existing quote path and makes no additional Capital subscriptions/orders.

```
fill-time midpoint P&L − quoted spread + funding + rounding/protection adjustment = net P&L
decision-midpoint signal P&L − signed timing cost = fill-time midpoint P&L
```

Timing is positive adverse, negative favorable. The second identity requires both decision quotes.
The double-spread diagnostic subtracts another spread from the same observed trades; it does not
re-size positions or re-run signals/stops/liquidations, and is not an independent counterfactual backtest.
Totals distinguish at-fill references, reconstructed matches, unknown trades and truncated histories.
Diagnoses apply only to their supported subset. Before-funding P&L still contains spread/timing; open
funding/P&L is separate. Synthetic backtest references remain simulated, not recorded broker costs.

`bun run audit-costs` reads the one compressed PostgreSQL archive and reports possible matches.
`--backfill --limit 5000` attaches derived metadata through the private API. It checks each block's
SHA-256, chooses the latest preceding delivered quote within 250 ms, and requires its executable side
price to match the stored fill. It never searches older quotes for a convenient price. Exact historical
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
