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

`src/engine/venue.ts` holds refreshed market rules and a synthetic API gateway per scenario. Each gateway
models the arena's 170 ms request pacing, account-switch/verification request cost, order/confirmation/position-verification
requests and 600 opens/hour / 12 opens/run/hour safeguards. It does not make extra Capital requests per run.
A standard command adds 500 ms assumed transport/processing delay, then fills on a fresh quote. The fixed
latencies are experiments, not a claim that Capital always takes that long. The gateway approximates its
queue as FIFO; the real mirror groups jobs by account.

Orders persist while pending. New entries fail closed when market metadata is stale (>3 minutes), the
market is closed, quotes are stale (>30 seconds), price input is invalid, or size/stops/margin fail at
execution. A close can wait for a market to reopen. The engine freezes order size at submission and tests
margin again at fill rather than silently shrinking an in-flight order. Protective stops use tick prices;
candle prices cannot become live fills. Quotes are refreshed again after waiting for a forecast.

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
reconciled by exact account/deal IDs and stored idempotently, recovering stopped deals' P&L, funding and
other adjustments. Unattributable transactions are not guessed. The Capital demo table uses realized net
cashflows and excludes open P&L; its drawdown/Sharpe describe realized cash, not a tick equity curve.

There is still no claim of exact equivalence:

- Capital shares cash and cross-margin across up to 50 scaled runs per account; virtual runs own independent
  $10,000 accounts. Shared-account liquidation can differ materially, especially at high leverage.
- Dividends, commodity basis adjustments and corporate actions are recorded when Capital reports them,
  but are not forecast/simulated. Current funding rates cannot reproduce historical rate changes.
- Network outages and ambiguous confirmations are observed and reconciled; the simulator does not invent
  future outages. FIFO pacing and fixed transport delays approximate an unobservable broker queue.
- A stop during a disconnected stream or downtime cannot be reproduced exactly without the missed tick tape.
- Scaling to 0.2× and conservative lot rounding change very small positions. Live market impact is outside
  a demo-only experiment. The old period includes the earlier instant-fill model.

Primary references: [Capital API](https://open-api.capital.com/),
[dynamic margin](https://capital.com/en-gb/ways-to-trade/margin-calls),
[funding](https://capital.com/en-gb/ways-to-trade/fees-and-charges),
[natural-gas basis adjustments](https://help.capital.com/hc/en-us/articles/13643723322770-Understanding-overnight-fees-and-adjustments-on-spot-commodities-Natural-Gas).

## Capacity

`bun run benchmark-arena 5000` inside `trader.slice` exercised actual agents on two days of cached bars:
138 MB RSS, 0.08 ms p95 per instrument-minute, 178 ms to persist all states. A separate offline replay of
all 120 days with a consistent production database copy started 5,000 runs in 22.3 seconds at 332 MB.
The server keeps its existing 500 MB soft / 700 MB hard memory and one-core CPU limits.

The initial expansion keeps the 550 existing standard records, plus complete, current-backtest-qualified
latency cohorts (170, 300, 500, 1,000, 2,000, 5,000, 10,000, 30,000, 60,000 and 120,000 ms). Each cohort has
its own gateway and freshly warmed records. Paired cohorts share warmed state and random stream, so their
execution assumptions are the experimental difference. Their strategy parameters are unchanged. The
5,000-run cap includes all cohorts; the initial target leaves room for new strategy ideas. This tests
execution robustness without claiming thousands of new independent strategies.

Backtest caches are versioned by `src/engine/version.ts`; all 550 historical runs were refreshed after
this accounting change. New admissions require both the current agent hash and engine version. A passing
backtest push triggers a debounced service reload to warm newly eligible records, while existing ones resume.
