# Execution contract and evidence

Backtest → virtual broker → Capital.com demo. Demotion follows the reverse path.
`demo` remains the internal SQLite run kind for virtual records, preserving their existing IDs and history.
The dashboard labels the stages explicitly. Capital demo results come from Capital orders and cashflows,
never from virtual metrics. The default virtual view shows standard runs; the scenario selector exposes
paired latency experiments. Those experiments are correlated and excluded from strategy verdicts and
monkey counts.

## What was checked on Capital demo (2026-10-15)

`bun run audit-capital --orders` used only the already hedged Arena 01 account. Two rounds of minimum-size
EURUSD buys and sells, their closes, invalid requests, protection updates and position reads confirmed:

- A buy opens on ask and closes on bid; a sell does the opposite. Confirmed P&L agreed with price × size.
- EURUSD size 50 is refused below its 100-unit minimum. A 150-unit request was accepted despite the
  published 100-unit increment: the increment is treated as a conservative sizing convention, not an
  independently verified API rejection rule.
- Stops outside the allowed distance are rejected. Current size and stop-distance rules were captured
  for all 20 markets. The live engine refreshes them, including current funding rates, every minute.
- Fixed stop and profit levels can be attached or moved. Explicit `null` removes them; zero is refused.
- Native trailing stops were accepted even though market metadata said `NOT_AVAILABLE`. The mirror now
  sends them. A run may use one fixed or trailing stop in live mode, matching Capital's single stop.
- Position creation is acknowledged before its confirmation; an HTTP success is not a confirmed fill.
  The mirror verifies instrument, side, size and deal identity. An uncertain POST is not replayed.

Commands and captured public observations live in `src/lab/audit-capital.ts` and
`src/engine/fixtures/`. The default command is read-only. `--orders` performs explicit demo contract probes,
cleans up confirmed probe IDs, and never changes account preferences or uses Visi. Private working reports
stay in ignored `data/`; committed observations contain no account/deal IDs or credentials.

## Virtual execution

`src/engine/venue.ts` holds refreshed market rules. Every paper order is independent: it fills 500 ms after
its decision (the comparison cohorts use other fixed delays) on the first quote stamped at or after that
moment. Other runs' orders never delay or block it (user request 2026-11-10: a burst must not affect the
engine); until engine `2026-11-feed-time-v2` a synthetic gateway per scenario modelled the mirror's shared
request queue and a 600 opens/hour budget across all runs. What remains is a per-run runaway guard, 12 opens
an hour, the same rule the mirror applies to one run. Capital's request budget is the real mirror's queue:
one session per demo account, orders ahead of confirmations ahead of polling (since 2026-11-11 a new position
is checked by the account's next reconciliation, one request for all positions, not one per order), ≈6 requests/s in total
(Capital: 10 per second per user; orders at most 1 per 0.1 s; 1,000 demo orders an hour).

Orders persist while pending. New entries fail closed when market metadata is stale (>3 minutes), the
market is closed, quotes are stale (>30 seconds), price input is invalid, or size/stops/margin fail at
execution. A close can wait for a market to reopen. The engine freezes order size at submission and tests
margin again at fill rather than silently shrinking an in-flight order. Protective stops use tick prices;
candle prices cannot become live fills. A stop fills at the quote that crosses it (a stop becomes a market order;
Capital's stop fills: median 0.15 bp worse than the level, several bp at data releases). A take-profit is a limit:
since engine `2026-11-tp-level` it fills at its level while the instrument quotes continuously (quotes under a
minute apart), because Capital fills targets at the level or better (median +0.26 bp, 83 closes) and its quote
stream arrives in bursts with holes of seconds in fast markets, so our next quote can be far past a level the venue
traded through (ETHUSD 2026-11-10 13:30: level 2055.76, Capital 2055.28, our next quote 2038.36). After a pause
in quoting the reopening quote is the market, and a gap fills there. Over 14 days the twins had 25 targets where
paper filled better than demo beyond a spread (−356 bp in total) and 3 the other way; stops are the mirror image
(60 pairs where demo filled better, +514 bp; 6 the other way): paper stays conservative there. Quotes continue arriving while forecasts run; obsolete closed-bar
callbacks are skipped rather than run against future bar history.

Non-crypto weekend funding is charged three times on Friday, with no Saturday/Sunday charge. The 1:1
funding exemption, except natural gas, remains. Rates refresh live; historical funding remains approximate.
The execution model version and its change time are stored on existing records; old results are retained,
not rewritten as if they had always used the new model.

## Evidence, resource measurements and remaining differences

`/api/execution` and the Status page show pending/rejected/executed commands, observed command delay,
process CPU, event-loop p95, poll duration, HTTP latency, pacing wait, and HTTP/WebSocket payload bytes.
Payload counts exclude headers, TLS, TCP and retransmission overhead. CPU is a percentage of one core.
Request samples are bounded; network/resource counters restart with the process. Command counters persist.

Broker deals now store bar-close, decision, virtual-fill, actual HTTP-send, response and verified-confirmation timestamps. The parity report shows signed adverse
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
  a demo-only experiment. The old period includes the earlier instant-fill model.

Primary references: [Capital API](https://open-api.capital.com/),
[dynamic margin](https://capital.com/en-gb/ways-to-trade/margin-calls),
[funding](https://capital.com/en-gb/ways-to-trade/fees-and-charges),
[natural-gas basis adjustments](https://help.capital.com/hc/en-us/articles/13643723322770-Understanding-overnight-fees-and-adjustments-on-spot-commodities-Natural-Gas).

## Capacity

Update 2026-11-09: `bun run benchmark-arena --runs N` now replays one full recorded day (2026-11-05, 3.0M
quotes on 20 instruments) through the arena's live path: every quote, the one-second clock, bar dispatch,
orders on, the per-minute state save into a scratch database. Copies of the planned runs, warmed on 10 days
of candles. CPU for the whole day:

| Runs | Before | After (idle runs skip quotes; idle flat runs saved every 10 min) | State rows written |
|---|---|---|---|
| 5,000 | 219 s (0.25% of a core) | 99 s (0.11%) | 7.0M → 1.2M |
| 20,000 | 963 s (1.1%) | 386 s (0.45%) | 28.2M → 4.8M |
| 50,000 | — | 963 s (1.1%), 420 MB | 11.9M |

Identical opens and trades before and after. Those runs traded little: the benchmark refused orders after
3 minutes on stale venue rules until 2026-11-10. With that fixed, 2 lead-in days with orders on, and engine
`2026-11-feed-time-v2` (no modelled broker queue; quotes reach only positions they can change):

| Runs | Open positions at start | Trades in the day | CPU for the day | Memory |
|---|---|---|---|---|
| 5,000 | 2,092 | 2,874 | 176 s (0.2% of a core); 237 s delivering every quote | 247 MB |
| 20,000 | 8,358 | 11,535 | 722 s (0.84%) | 392 MB |

State saving is now the largest part (open positions are saved every minute so a restart replays ticks
exactly), then quote callbacks of agents that define one. Memory grows ~6 KB per run plus its trade history; most of
the arena's memory is the shared 120-day candle history. The live arena reports CPU by part in
`/api/execution` (`cpuParts`), which is where the remaining cost lives (metrics, API, broker candidates).
What remains per quote is runs that are never idle: open positions, pending orders and agents with an
`onTick` callback (they are processed on every quote even when the callback returns at once).

Live, after the 2026-11-09 deploy (4,644 runs, 2,820 of them holding a position): 5.3% of a core in total;
quotes 1.7% (0.34 ms per quote, ≈0.7 µs per open position for tick-precision stops, targets, margin and
drawdown), API 0.3–1%, state saves 0.2%, bar dispatch 0.2%, broker candidates 0.2%. Positions, not agents,
set the per-quote cost: a million runs with today's 60% in a position would need most of a core for
quotes alone. The next step there is a per-instrument index of trigger prices (stop, target, trailing,
margin call), so a quote touches only the positions whose trigger it crosses, with drawdown tracked by
the price extremes between evaluations; then sharing bar work between runs of the same agent and
parameters (leverage tiers and delay comparisons decide identically until their accounts differ).

Earlier (2026-10-15):

`bun run benchmark-arena 5000` inside `trader.slice` exercised actual agents on two days of cached bars:
138 MB RSS, 0.08 ms p95 per instrument-minute, 178 ms to persist all states. A separate offline replay of
all 120 days with a consistent production database copy started 5,000 runs in 22.3 seconds at 332 MB.
The server keeps its existing 500 MB soft / 700 MB hard memory and one-core CPU limits.

The initial expansion keeps the 550 existing standard records, plus complete, current-backtest-qualified
latency cohorts (170, 300, 500, 1,000, 2,000, 5,000, 10,000, 30,000, 60,000 and 120,000 ms). Each cohort has
its own fixed delay and freshly warmed records. Paired cohorts share warmed state and random stream, so their
execution assumptions are the experimental difference. Their strategy parameters are unchanged. The
5,000-run cap includes all cohorts; the initial target leaves room for new strategy ideas. This tests
execution robustness without claiming thousands of new independent strategies.

Backtest caches are versioned by `src/engine/version.ts`; all 550 historical runs were refreshed after
this accounting change. New admissions require both the current agent hash and engine version. A passing
backtest push triggers a debounced service reload to warm newly eligible records, while existing ones resume.

Production verification exposed the 100-row history cap and unlinked SWAP entries; those behaviors were
added to the regression suite. Restart replay also now activates restored runs only when their resume time
is reached, avoiding a scan of every dormant run for each of 120 days of candles.

## Feed time and decision-time orders (2026-11-09, engine `2026-11-feed-time`)

Capital's demo WebSocket delivers each quote 2–13 s after its own timestamp; the delay varies over days
(US100 median 4.5 s on Oct 16, 13 s on Nov 4, 2 s right after the Nov 9 restart). A REST snapshot shows
the same price, with the same timestamp, 5–7 s before the stream delivers it, and a second, fresh
connection was exactly as late as the arena's, so the delay is Capital's, not a backlog of ours.

Before this change the paper engine filled orders on the quote in hand (several seconds old), closed live
minutes by the clock before their last quotes arrived (so live candles lacked their final seconds), and
the broker mirror sent the demo order only after the paper fill. Paired demo deals agreed with their paper
trades within one spread only 63% of the time over October 10 – November 9, and Capital's own stops fired a
median 5.7 s before ours.

Now: (1) an order fills on the first quote stamped at or after the moment it reaches the venue
(decision + execution delay, receive clock); (2) the clock closes a quiet minute only after 1.5 × the
smoothed feed delay, and a minute otherwise closes on the first quote stamped in a later minute, so live
candles match Capital's and the backtests'; (3) the mirror sends the demo order when the order is decided
(`order` run event) and links the later paper fill to it. Generated quotes have no delay and replay as
before. The paper–demo twin report (`/api/twins`, Paper vs demo) measures the result daily.

## Tick execution update (2026-10-16)

The default backtest now uses the same tick execution path as the arena, with deterministic generated
paths where recorded data is unavailable. Intraminute ordering and cadence remain assumptions on those
synthetic paths. Capture, exact replay, single-copy storage, latest resource measurements and explicit
limits are documented in [TICKS.md](TICKS.md). Older forward histories and all Capital assignments remain.
