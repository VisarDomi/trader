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

- **Donchian Channel Breakout agent** (`agents/donchian-breakout/factory.ts`) — configurable breakout agent with ATR-based stops, risk-reward targeting, and risk-based position sizing (2% equity per trade).
  - *Decision*: Factory pattern (not a static agent file) because the Monte Carlo sweep needs to create 108 variants with different parameters. Risk-based sizing (equity × riskPct / SL distance) chosen over fixed size so the agent adapts to volatility and account equity. ATR period fixed at 14 (standard Wilder's) — not worth sweeping since it's well-established.

- **Donchian Monte Carlo sweep** (`src/run/batch-donchian.ts`) — 108-combination parameter sweep across channel length (20/50/100), ATR stop multiple (1/2/3×), reward ratio (1.5/2/3×), timeframe (1m/5m), and leverage (20/200×). 3 years of US100 data, realistic slippage, no artificial drawdown cap — positions liquidate naturally and agents keep trading until capital depletion.
  - *Decision*: 1m runs use SyntheticTickFeed (600 ticks/candle) for sub-minute SL/TP precision. 5m runs use plain BacktestFeed because the 1m candles already provide 5 real SL/TP checks per 5m period. No `maxDrawdown` set — the natural lifecycle (position liquidation → new position → repeat until capital depleted) plays out fully. Results: all 1m runs depleted to zero. Best 5m run (ch100, ATR×3, RR×3, 20× leverage) nearly broke even at -$399 (-4%) over 3 years with profit factor 1.00 and Sharpe 0.58. Wider stops and longer channels survive longest. Donchian breakout on US100 has near-zero edge — not enough to overcome slippage and spread.

- **Market search CLI** (`src/data/search-markets.ts`, `bun run search-markets <query>`) — searches Capital.com's `GET /markets?searchTerm=` endpoint and prints matching instruments with epic, name, type, and current bid/ask. Use this to discover epic codes before adding them to `RECORDED_EPICS`.
  - *Decision*: Built as a thin CLI wrapper around `CapitalSession.get()` rather than a separate fetch, so it gets free auto-reauth on 401. No caching or local instrument DB — just a live search against the API, which is the simplest approach and always returns current data.

- **Synthetic tick generator** (`src/core/feed/TickGenerator.ts`) — generates realistic tick data at 600 ticks/minute using an Ornstein-Uhlenbeck process with jumps.
  - *Decision*: OU process chosen over pure random walk because real tick data shows slight mean-reversion (autocorrelation -0.023). Jumps added as a separate Bernoulli-triggered component because real US100 data has fat tails (P99 move=1.5 vs σ=0.47, and extremes up to 11pts — far beyond Gaussian). Calibrated from 5,291 real ticks: σ=0.47 at 115 ticks/min, scaled to 600/min via variance-time rule (σ_target = σ_observed × √(observed_rate/target_rate)). Factory method `fromInstrument()` chosen so callers don't need to know the calibration math — just pass instrument info and get sensible defaults. 15 tests.

- **Realistic bidirectional slippage** (`SimulatedExecution`, `type: 'realistic'`) — new slippage mode that simulates 200–500ms execution delay using the tick generator. Price moves naturally during the delay, producing both positive and negative slippage.
  - *Decision*: The existing slippage modes (`none`, `fixed`, `random`) are all adversarial — they always hurt the trader. Real slippage is bidirectional: price can move for or against you during the execution delay. Rather than adding a bias parameter to the existing random mode, we built on the tick generator to simulate actual price movement during a 200–500ms window. This is more physically realistic: the "slippage" isn't a number we add/subtract, it's the natural consequence of price moving while the order executes. 200–500ms delay range chosen to match real broker execution times for CFDs. Take-profit still fills at exact level because TPs are limit orders (broker-side), not market orders. 10 new tests.

- **Synthetic tick feed** (`src/core/feed/SyntheticTickFeed.ts`) — upgrades candle-only backtests to tick-level precision. For each minute candle, generates ~600 ticks using constrained Brownian bridges that respect the candle's OHLC.
  - *Decision*: Constrained Brownian bridge chosen over unconstrained TickGenerator because the ticks must respect known OHLC boundaries — we can't let synthetic ticks wander outside the candle's actual high/low. Algorithm: 4 waypoints (open, high, low, close) placed at index 0, two random interior indices, and N-1; Brownian bridges connect consecutive waypoints with realistic noise clamped to [low, high]. This is better than linear interpolation (which produces unrealistic triangular paths) and better than unconstrained generation (which can't guarantee OHLC). The feed implements `PriceFeed` so it's a drop-in replacement for `BacktestFeed` — same interface, but ticks flow through `onTick→processTick` before each candle, giving per-tick SL/TP precision. 17 tests.

- **Feed comparison script** (`src/run/compare-feeds.ts`) — runs the same agent across candle-only, real tick, and synthetic tick feeds for the same period, then prints side-by-side results. Validates that tick-level SL/TP precision produces meaningfully different outcomes vs candle-only backtesting.
  - *Decision*: Built as a standalone script (not a test) because it requires DB access and produces human-readable output for analysis. Uses the trend-follower 1m agent rather than EMA crossover because EMA needs 150 min warmup (30 × 5m candles) vs trend-follower's 1 candle. Includes a Part 2 with a full week of candle data to get statistically meaningful trade counts. Results confirmed: synthetic tick mode caught stops mid-candle, producing 36 trades vs 61 in candle-only mode — a ~40% reduction in trade count for the same period, validating that tick-level precision materially changes backtest outcomes.

- **Tick data disk usage monitor** (`src/data/tick-stats.ts`, `bun run tick-stats`) — shows per-instrument tick count, date range, days of data, ticks/day growth rate, total table size on disk, bytes per tick, and projected 1-year storage.
  - *Decision*: Built as a standalone CLI script rather than an API endpoint because it's a diagnostic tool for the operator, not something agents or the UI need. Uses `pg_total_relation_size('ticks')` which includes indexes, giving the true disk footprint. Projects 1-year storage using current ticks/day rate, which is useful for capacity planning as we add more instruments.

- **Multi-instrument tick recording** — tick recorder now subscribes to all instruments in `RECORDED_EPICS` (defined in `instruments.ts`) on a single WebSocket connection. Added BTCUSD alongside US100. Includes a 40-instrument guard matching Capital.com's WebSocket subscription limit.
  - *Decision*: The `RECORDED_EPICS` list in `instruments.ts` is the single source of truth for which instruments to record. A top-level guard throws at import time if the list exceeds 40 (Capital.com's per-subscription limit, see `DECISIONS.md`). The quote payload's `epic` field identifies which instrument each tick belongs to, so no separate connections or routing logic is needed — just one subscription with multiple epics. BTCUSD added first alongside US100 because it trades 24/7 (no market hours gaps), making it useful for validating the recorder runs continuously.

### Improved

- **Tick recorder: timestamped logging** — all log output now includes ISO timestamps for debugging outages.
- **Tick recorder: SIGTERM handling** — added `SIGTERM` handler alongside `SIGINT` for clean shutdown when killed by process managers.
- **Tick recorder: reconnect deduplication** — `scheduleReconnect()` guards against multiple concurrent reconnect attempts (e.g. watchdog + onclose firing at the same time).
  - *Decision*: Without dedup, the watchdog and `onclose` can both call `connect()` within the same tick, creating two parallel WebSocket connections competing for the same subscription. A simple boolean flag prevents this.
- **Tick recorder: exponential backoff for auth failures** — auth failures now back off exponentially (3s, 6s, 12s, ... up to 60s) instead of retrying every 3s. Resets on successful auth.
  - *Decision*: Capital.com's POST /session endpoint is limited to 1 req/sec per API key (see `DECISIONS.md`). The old 60-second reconnect loop was hammering auth and triggered a 429 rate limit after 2 days. Fixed 3-second retries could still loop too aggressively during sustained outages. Exponential backoff with a 60s cap balances recovery speed with API courtesy.
- **Added `DECISIONS.md`** — documents Capital.com API limits and their implications for the tick recorder, WebSocket subscriptions, and session management. Referenced from `CLAUDE.md`.
