# Execution contract and evidence

Backtest → virtual broker → Capital.com demo. Demotion follows the reverse path.
`demo` is the internal SQLite run kind for virtual records (it is part of every stored run id).
The dashboard labels the stages explicitly. Capital demo results come from Capital orders and cashflows,
never from virtual metrics. The default virtual view shows standard runs; the scenario selector exposes
paired latency experiments. Those experiments are correlated and excluded from strategy verdicts and
monkey counts.

## What was checked on Capital demo

The 2026-10-15 contract probe (`bun run audit-capital --orders`) used only the hedged Arena 01 account. Two rounds of minimum-size
EURUSD buys and sells, their closes, invalid requests, protection updates and position reads confirmed:

- A buy opens on ask and closes on bid; a sell does the opposite. Confirmed P&L agreed with price × size.
- EURUSD size 50 is refused below its 100-unit minimum. A 150-unit request was accepted despite the
  published 100-unit increment: the increment is treated as a conservative sizing convention, not an
  independently verified API rejection rule.
- Stops outside the allowed distance are rejected. Current size and stop-distance rules were captured
  for all 20 markets. The live engine refreshes them, including current funding rates, every minute.
- Fixed stop and profit levels can be attached or moved. Explicit `null` removes them; zero is refused.
- Native trailing stops were accepted even though market metadata said `NOT_AVAILABLE`. The mirror
  sends them. A run may use one fixed or trailing stop in live mode, matching Capital's single stop.
- Position creation is acknowledged before its confirmation; an HTTP success is not a confirmed fill.
  The mirror verifies instrument, side, size and deal identity. An uncertain POST is not replayed.

Commands and captured public observations live in `src/lab/audit-capital.ts` and
`src/engine/fixtures/`. The default command is read-only. `--orders` performs explicit demo contract probes,
cleans up confirmed probe IDs, and never changes account preferences or uses Visi. Private working reports
stay in ignored `data/`; committed observations contain no account/deal IDs or credentials.

## Virtual execution

`src/engine/venue.ts` holds refreshed market rules. Every paper order is independent: it reaches the venue
500 ms after its decision (the comparison cohorts use other fixed delays) and fills at the price in effect then,
the last quote stamped at or before that moment, once a quote stamped after it shows that none is still in flight
(engine `2026-11-arrival-price`). Capital fills demo orders the same way: of 246 orders (2026-11-10 to 12), 189
filled at the last quote stamped at or before Capital accepted them and 13 at the next one. Replayed on those
orders, this rule gives a paper–demo entry gap of a mean 0.40 bp (median 0.15 bp) with no bias either way; taking
the first quote after the moment instead (0.55 / 0.24 bp) picks prices from after holes in our stream (US100
2026-11-11 23:00: 5 s). After a pause in quoting (over a minute) the reopening quote is the fill. The 30-second
freshness limit applies to the quote that releases the order, not to the earlier price it fills at (engine
`2026-11-arrival-stall`): when Capital's stream stalls and its backlog arrives late, that price can be stamped
over 30 s before the backlog (GOLD 2026-11-12 15:00: 35 s), and Capital still traded at it.

Other runs' orders never delay or block a paper order (user request: a burst must not affect the engine). What
remains is a per-run runaway guard, 12 opens an hour, the same rule the mirror applies to one run. Capital's
request budget is the real mirror's queue: one session per demo account, orders ahead of confirmations ahead of
polling, a new position checked by the account's next reconciliation (one request for all positions, not one
per order), ≈6 requests/s in total (Capital: 10 per second per user; orders at most 1 per 0.1 s; 1,000 demo
orders an hour). The mirror sends the demo order when the order is decided (`order` run event) and links the
later paper fill to it.

Orders persist while pending. New entries fail closed when market metadata is stale (>3 minutes), the
market is closed, quotes are stale (>30 seconds), price input is invalid, or size/stops/margin fail at
execution. A close can wait for a market to reopen. The engine freezes order size at submission and tests
margin again at fill rather than silently shrinking an in-flight order. Protective stops use tick prices;
candle prices cannot become live fills. A stop fills at the quote that crosses it (a stop becomes a market order;
Capital's stop fills: median 0.15 bp worse than the level, several bp at data releases). A take-profit is a limit:
it fills at its level (engine `2026-11-tp-level`) while the instrument quotes continuously (quotes under a
minute apart), because Capital fills targets at the level or better (median +0.26 bp, 83 closes) and its quote
stream arrives in bursts with holes of seconds in fast markets, so our next quote can be far past a level the venue
traded through (ETHUSD 2026-11-10 13:30: level 2055.76, Capital 2055.28, our next quote 2038.36). After a pause
in quoting the reopening quote is the market, and a gap fills there. Over 14 days the twins had 25 targets where
paper filled better than demo beyond a spread (−356 bp in total) and 3 the other way; stops are the mirror image
(60 pairs where demo filled better, +514 bp; 6 the other way): paper stays conservative there. Quotes continue arriving while forecasts run; obsolete closed-bar
callbacks are skipped rather than run against future bar history.

Non-crypto weekend funding is charged three times on Friday, with no Saturday/Sunday charge. The 1:1
funding exemption, except natural gas, remains. Rates refresh live; historical funding remains approximate.
Each record stores the execution model version it ran under and when that version started; a model change
never rewrites results as if they had always used the new model.

## Evidence, resource measurements and remaining differences

`/api/execution` and the Status page show pending/rejected/executed commands, observed command delay,
process CPU, event-loop p95, poll duration, HTTP latency, pacing wait, and HTTP/WebSocket payload bytes.
Payload counts exclude headers, TLS, TCP and retransmission overhead. CPU is a percentage of one core.
Request samples are bounded; network/resource counters restart with the process. Command counters persist.

Broker deals store bar-close, decision, virtual-fill, actual HTTP-send, response and verified-confirmation timestamps. The parity report shows signed adverse
fill slippage and timing distributions, failed orders, and missing close prices. Transaction history is
reconciled by exact account/deal IDs and stored idempotently, recovering stopped deals' P&L and all available account funding/adjustments. Unattributable transactions are not guessed. Capital silently caps history at 100 rows, so time windows are bisected to recover every row.
Funding and corporate adjustments without a deal ID remain visible at account level and are never
arbitrarily assigned to a strategy. The Capital demo table uses realized trade P&L plus explicitly linked
adjustments and excludes open P&L and unallocated costs; its drawdown/Sharpe describe realized cash, not a tick equity curve.

There is still no claim of exact equivalence:

- Capital shares cash and cross-margin across up to 50 scaled runs per account; virtual runs own independent
  $10,000 accounts. Shared-account liquidation can differ materially, especially at high leverage.
- Dividends, commodity basis adjustments and corporate actions are recorded when Capital reports them,
  but are not forecast/simulated. Current funding rates cannot reproduce historical rate changes.
- Network outages and ambiguous confirmations are observed and reconciled; the simulator does not invent
  future outages. Paper orders assume a fixed delay; the real mirror queues behind Capital's request budget
  in bursts, which the twin report measures (decision → order accepted).
- A stop during a disconnected stream or downtime cannot be reproduced exactly without the missed tick tape.
- Scaling to 0.2× and conservative lot rounding change very small positions. Live market impact is outside
  the demo mirror's scope. Records from before the current execution model keep the model they ran under
  (see their engine version and `CHANGELOG.md`).

Primary references: [Capital API](https://open-api.capital.com/),
[dynamic margin](https://capital.com/en-gb/ways-to-trade/margin-calls),
[funding](https://capital.com/en-gb/ways-to-trade/fees-and-charges),
[natural-gas basis adjustments](https://help.capital.com/hc/en-us/articles/13643723322770-Understanding-overnight-fees-and-adjustments-on-spot-commodities-Natural-Gas).

## Live clock and feed time

Capital's demo WebSocket delivers each quote 2–13 s after its own timestamp; the delay varies over days. A REST
snapshot shows the same price, with the same timestamp, 5–7 s before the stream delivers it, and a second, fresh
connection is exactly as late as the arena's, so the delay is Capital's, not a backlog of ours. So:

- orders fill by the quotes' own timestamps (decision + execution delay, see [Virtual execution](#virtual-execution));
- the clock closes a quiet minute only after 1.5 × the smoothed feed delay, and a minute otherwise closes on the
  first quote stamped in a later minute, so live candles match Capital's and the backtests';
- generated quotes have no delay.

The paper–demo twin report (`/api/twins`, Paper vs demo) measures the result daily; see `agents/LIFECYCLE.md`.

The default backtest uses the same tick execution path as the arena, with deterministic generated paths where
recorded data is unavailable. Intraminute ordering and cadence remain assumptions on those synthetic paths.
Capture, exact replay, single-copy storage and their limits: [TICKS.md](TICKS.md).

## Capacity

The virtual cap is 5,000 runs (`PAPER_RUN_SOFT_CAP`), comparison cohorts included. The standard runs are
joined by complete, current-backtest-qualified latency cohorts (170, 300, 500, 1,000, 2,000, 5,000, 10,000,
30,000, 60,000 and 120,000 ms). Each cohort has its own fixed delay and freshly warmed records. Paired cohorts
share warmed state and random stream, so their execution assumptions are the only experimental difference;
their strategy parameters are unchanged. The cap leaves room for new strategy ideas. This tests execution
robustness without claiming thousands of new independent strategies.

`bun run benchmark-arena --runs N` replays one full recorded day (2026-11-05, 3.0M quotes on 20 instruments)
through the arena's live path: every quote, the one-second clock, bar dispatch, orders on, the per-minute state
save into a scratch database, with 2 lead-in days and copies of the planned runs warmed on 10 days of candles.
Engine `2026-11-feed-time-v2`, CPU for the whole day:

| Runs | Open positions at start | Trades in the day | CPU for the day | Memory |
|---|---|---|---|---|
| 5,000 | 2,092 | 2,874 | 176 s (0.2% of a core); 237 s delivering every quote | 247 MB |
| 20,000 | 8,358 | 11,535 | 722 s (0.84%) | 392 MB |

Idle runs skip quotes and idle flat runs are saved every 10 minutes; that cut the same day's CPU by more than
half (5,000 runs: 219 s → 99 s, state rows 7.0M → 1.2M) with identical opens and trades. State saving is the
largest part (open positions are saved every minute so a restart replays ticks exactly), then quote callbacks of
agents that define one. Memory grows ~6 KB per run plus its trade history; most of the arena's memory is the
shared 120-day candle history. The live arena reports CPU by part in `/api/execution` (`cpuParts`), which is
where the remaining cost lives (metrics, API, broker candidates). Every event-loop stall of 5 s or more is a
warn event (`src/arena/stall-monitor.ts`) that splits it into the parts that ran, the process's CPU time and the
time its cgroup waited for CPU or memory, so it names our code, contention from other workloads or swapping;
`/api/execution` carries the count, the longest and the last one (`stalls`) and `eventLoopMaxMs`. What remains per quote is runs that are never
idle: open positions, pending orders and agents with an `onTick` callback (they are processed on every quote
even when the callback returns at once).

Live, measured on 2026-11-09 (4,644 runs, 2,820 of them holding a position): 5.3% of a core in total; quotes
1.7% (0.34 ms per quote, ≈0.7 µs per open position for tick-precision stops, targets, margin and drawdown), API
0.3–1%, state saves 0.2%, bar dispatch 0.2%, broker candidates 0.2%. Positions, not agents, set the per-quote
cost: a million runs with 60% in a position would need most of a core for quotes alone. The next step there is a
per-instrument index of trigger prices (stop, target, trailing, margin call), so a quote touches only the
positions whose trigger it crosses, with drawdown tracked by the price extremes between evaluations; then
sharing bar work between runs of the same agent and parameters (leverage tiers and delay comparisons decide
identically until their accounts differ).

Backtest caches are versioned by `src/engine/version.ts`. New admissions require both the current agent hash
and engine version. A passing backtest push triggers a debounced service reload to warm newly eligible
records, while existing ones resume. Restart replay activates restored runs only when their resume time is
reached, so it does not scan every dormant run for each of 120 days of candles. Capital's 100-row history cap
and unlinked SWAP entries are covered by the regression suite.
