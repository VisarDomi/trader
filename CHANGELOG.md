# Changelog

## Unreleased

### Fixed

- **Tick recorder: dead on failed connect** — `ws.onclose` was set inside `ws.onopen`, so if the WebSocket failed to connect (DNS failure, server down, TLS error), `onopen` never fired, `onclose` had no handler, and the process went silent forever with no reconnect. Moved `onclose` outside `onopen`.
  - *Decision*: The WebSocket spec guarantees `onerror` is always followed by `onclose`, so placing the reconnect logic in `onclose` (outside `onopen`) handles both failed-connect and mid-session-disconnect cases in one place. No need for separate `onerror` reconnect logic.

- **Tick recorder: stale tokens on reconnect** — on reconnect, the old code reused cached session tokens that had expired hours ago. The WebSocket would connect but the subscription would silently fail. Now re-authenticates the REST session (`session.connect()`) before every WebSocket connection.
  - *Decision*: Considered refreshing tokens only after a failed subscription, but Capital.com gives no explicit error on stale-token subscriptions — it just silently ignores them. Pre-emptive re-auth on every reconnect is the only reliable approach. `CapitalSession.connect()` is idempotent (stops old keep-alive timer before starting new one), so calling it repeatedly is safe.

- **Tick recorder: no data watchdog** — if the subscription silently failed (server accepts WS but ignores subscribe), nothing detected the absence of ticks. Added a 30-second watchdog that forces reconnect if no ticks arrive.
  - *Decision*: 30 seconds chosen because US100 typically produces multiple ticks per second during market hours. During market closed hours (weekends), the watchdog would trigger repeatedly but that's harmless — it just re-authenticates and reconnects, which is cheap. Considered a market-hours-aware watchdog but the complexity wasn't worth it; reconnecting during closed hours costs nothing.

- **Tick recorder: unhandled rejections crash process** — any async throw (DB hiccup, network blip) would crash bun silently. Added `unhandledRejection` and `uncaughtException` handlers that log but keep the process alive.
  - *Decision*: For a long-running recorder, availability matters more than correctness on any single tick. A DB hiccup losing a few ticks is acceptable; the process dying and losing hours of data is not. The handlers log with timestamps so we can audit what went wrong.

### Added

- **Synthetic tick generator** (`src/core/feed/TickGenerator.ts`) — generates realistic tick data at 600 ticks/minute using an Ornstein-Uhlenbeck process with jumps.
  - *Decision*: OU process chosen over pure random walk because real tick data shows slight mean-reversion (autocorrelation -0.023). Jumps added as a separate Bernoulli-triggered component because real US100 data has fat tails (P99 move=1.5 vs σ=0.47, and extremes up to 11pts — far beyond Gaussian). Calibrated from 5,291 real ticks: σ=0.47 at 115 ticks/min, scaled to 600/min via variance-time rule (σ_target = σ_observed × √(observed_rate/target_rate)). Factory method `fromInstrument()` chosen so callers don't need to know the calibration math — just pass instrument info and get sensible defaults. 15 tests.

- **Realistic bidirectional slippage** (`SimulatedExecution`, `type: 'realistic'`) — new slippage mode that simulates 200–500ms execution delay using the tick generator. Price moves naturally during the delay, producing both positive and negative slippage.
  - *Decision*: The existing slippage modes (`none`, `fixed`, `random`) are all adversarial — they always hurt the trader. Real slippage is bidirectional: price can move for or against you during the execution delay. Rather than adding a bias parameter to the existing random mode, we built on the tick generator to simulate actual price movement during a 200–500ms window. This is more physically realistic: the "slippage" isn't a number we add/subtract, it's the natural consequence of price moving while the order executes. 200–500ms delay range chosen to match real broker execution times for CFDs. Take-profit still fills at exact level because TPs are limit orders (broker-side), not market orders. 10 new tests.

- **Synthetic tick feed** (`src/core/feed/SyntheticTickFeed.ts`) — upgrades candle-only backtests to tick-level precision. For each minute candle, generates ~600 ticks using constrained Brownian bridges that respect the candle's OHLC.
  - *Decision*: Constrained Brownian bridge chosen over unconstrained TickGenerator because the ticks must respect known OHLC boundaries — we can't let synthetic ticks wander outside the candle's actual high/low. Algorithm: 4 waypoints (open, high, low, close) placed at index 0, two random interior indices, and N-1; Brownian bridges connect consecutive waypoints with realistic noise clamped to [low, high]. This is better than linear interpolation (which produces unrealistic triangular paths) and better than unconstrained generation (which can't guarantee OHLC). The feed implements `PriceFeed` so it's a drop-in replacement for `BacktestFeed` — same interface, but ticks flow through `onTick→processTick` before each candle, giving per-tick SL/TP precision. 17 tests.

- **Feed comparison script** (`src/run/compare-feeds.ts`) — runs the same agent across candle-only, real tick, and synthetic tick feeds for the same period, then prints side-by-side results. Validates that tick-level SL/TP precision produces meaningfully different outcomes vs candle-only backtesting.
  - *Decision*: Built as a standalone script (not a test) because it requires DB access and produces human-readable output for analysis. Uses the trend-follower 1m agent rather than EMA crossover because EMA needs 150 min warmup (30 × 5m candles) vs trend-follower's 1 candle. Includes a Part 2 with a full week of candle data to get statistically meaningful trade counts. Results confirmed: synthetic tick mode caught stops mid-candle, producing 36 trades vs 61 in candle-only mode — a ~40% reduction in trade count for the same period, validating that tick-level precision materially changes backtest outcomes.

### Improved

- **Tick recorder: timestamped logging** — all log output now includes ISO timestamps for debugging outages.
- **Tick recorder: SIGTERM handling** — added `SIGTERM` handler alongside `SIGINT` for clean shutdown when killed by process managers.
- **Tick recorder: reconnect deduplication** — `scheduleReconnect()` guards against multiple concurrent reconnect attempts (e.g. watchdog + onclose firing at the same time).
  - *Decision*: Without dedup, the watchdog and `onclose` can both call `connect()` within the same tick, creating two parallel WebSocket connections competing for the same subscription. A simple boolean flag prevents this.
