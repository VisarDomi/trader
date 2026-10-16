# Tick execution, recording and storage

The same `MarketEngine` drives live, recorded and synthetic quote ticks. `onTick(ctx)` receives current
bid/ask and broker/delivery timestamps; `onBar(ctx)` remains available for deliberate closed-bar signals.
Every agent's protections, trailing stops, margin and fills use ticks. Existing strategy files, forward
records, nine Capital accounts, leverage tiers and promotion/demotion rules are retained.

## Recording and the one permanent copy

Capture began **2026-10-16 04:09:38 UTC** on the existing Capital demo quote stream, for all 20 instruments.
Capture occurs before trading filters, preserving repeated prices, equal timestamps, late source quotes,
arrival order, broker and receipt times, and timestamp-fallback flags. This is Capital's delivered quote
feed, not an exchange trade tape or a promise to observe ticks during an outage.

- Server: a separate WAL SQLite transfer spool beside `arena.db`, batches flushed every 250 ms and on
  graceful shutdown. Connection/session boundaries expose outages; a crash leaves an interrupted session.
- Lab: **one permanent PostgreSQL copy** in `tick_chunks`. Per-instrument columnar deltas are gzipped;
  scaled prices are used only when exact round-trip is possible, otherwise IEEE doubles are retained.
  Bid/ask, times, sequence gaps and duplicate ticks are lossless. Checksums and full read-back equality
  are verified before acknowledging transfer. Small metadata tables index blocks and capture sessions.
- Archive timer runs every minute in `trader.slice`. It commits up to 50,000 quotes at a time, or flushes
  a smaller batch after 15 minutes. `bun run sync-ticks --flush` transfers the tail immediately.
- After acknowledgement, server rows older than ten minutes can expire. Unacknowledged rows remain
  while the PC is off. The spool has a 4 GiB SQLite page cap, bounded retry memory and visible errors.
  Recording failures pause new virtual entries; existing protections and closes continue.
- There is no second permanent raw table, JSON/gzip file archive, remote backup or stored synthetic tape.
  Conversion to this layout verified all 46,277 existing quotes before removing the redundant copies
  created during development. This single-copy policy is the user's explicit storage choice.

## Replay and decisions

Default `bun run backtest` uses recorded updates wherever available, and lazily generates a path for a
minute that has only OHLC. It never adds generated ticks inside a recorded minute. A partial recorded
minute stays partial and is counted; `--ticks recorded` uses only captured input, with no fallback.

```sh
bun run backtest my-agent --from 2026-10-16 --to 2026-10-17 --ticks recorded
bun run backtest my-agent --ticks synthetic --tick-seed 2 --ticks-per-minute 64
```

Every job freezes recording watermarks and replays by journal sequence. Memory holds one block and a
bounded quote window, not two years of decoded ticks. Different synthetic seeds/densities and custom
windows have separate result IDs. Only the standard shared window is used for new-stage admission.

Synthetic paths preserve bid OHLC, visit both extremes in seeded order, interpolate bounded movement,
and use the candle's close spread or the instrument fallback. Defaults: **16 ticks/minute, seed 1**.
Those paths, spreads and cadence are assumptions; no actual historical tick ordering can be recovered
from four candle prices. Results and dashboard badges expose recorded/generated counts, partial minutes,
generator/seed/density and engine version. The standard 2024–September 2026 test is wholly synthetic:
recording started afterward.

Orders share durable pending commands, per-run simulated API pacing and 500 ms baseline latency in
backtests; they need an executable quote after the delay. Live scenario gateways still model shared
queues. Backtests use the captured October 15 dealing-rule snapshot; they do not invent historical rule,
funding-rate, network or market-impact observations. End-of-data liquidation marks the last known quote.

Closed bars contain only observed ticks. Clock boundaries close quiet partial bars without inventing
empty minutes. Forecast waits do not block quote processing; a callback whose bar context has advanced
is skipped. An old precomputed forecast is reused only if the exact input-close hash matches, including
for recorded bars. Restarts retain tick-built bars, agent state, pending commands and tick watermarks;
recovery does not send historical broker events again. Brief deployment/socket gaps remain declared.

## The 100 GB / two-year budget

`bun run storage --refresh` includes the lab repository, dependencies and caches, the actual TimesFM
model blobs, the trader's server folders, and the PostgreSQL database. It also reserves 10 GB for
non-tick growth. The canonical tick archive has a **70 GB on-disk quota**, leaving a 30 GB project
allowance for other data and transfer storage. Reaching the quota does not delete or acknowledge quotes;
it raises an error while data stays in the transfer spool. The watchdog and dashboard expose storage
pressure and projections so operations can address growth before either limit is reached.

The first measured sample compressed to about **6.1 bytes/quote at 26 quotes/second**, a quiet-session
sample. The whole project was about 13 GB including model weights and verification artifacts. Its
estimated two-year total was around 38 GB, with a **four-times-rate stress projection around 84 GB**,
including measured storage overhead and growth reserve. These are estimates, not a guarantee about
future quote volume. Reports update as full sessions accumulate; adding instruments changes the budget.
RAM is separate: the live service retains its 500 MB soft / 700 MB hard cap; heavy lab work stays inside
`trader.slice` at at most half this PC's CPU/RAM.

## Validation

- Unit cases cover intrabar decisions before the first bar, current bid/ask fills, protection ordering,
  delayed orders, repeated timestamps, invalid/stale/future quotes, quiet closes, clock deadlines and
  exact codec round-trips/corruption detection.
- Actual recorded US500 replay: 602 captured quotes over 15 minutes, zero generated ticks, zero errors;
  two runs produced identical trades, including actual delivered entry/exit prices and times.
- All **551** standard agent/instrument/leverage backtests refreshed at engine `2026-10-ticks-v2`, with
  zero agent errors, across 20 instruments and 275,432,080 generated quote events (not stored).
- Offline production-state replay retained all **4,561** runs (551 standard / 4,010 comparisons), no load
  errors. A three-minute, 5,946-quote workload with actual agents and restored positions used 385 MB RSS;
  quote processing p50 0.137 ms, p95 0.493 ms; 340 ms to persist all states. GPU/network delay and shared
  server scheduling remain separate from this offline CPU measurement.
