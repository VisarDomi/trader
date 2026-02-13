# TODO — Trader Backend

## Current State (as of 2026-02-13)

| Asset | Status |
|-------|--------|
| **Tick recorder** | Running, capturing US100 + BTCUSD live (106k+ ticks so far) |
| **Candle data** | 6 years of 1m candles (2.1M candles, Feb 2020 → Feb 2026) |
| **Slippage** | Realistic bidirectional slippage implemented |
| **Tick generation** | Statistical generator built, pending recalibration with real data |
| **Framework validation** | Trade trace + Monte Carlo verified. See `VALIDATION.md` |

---

## 1. Fix Tick Recorder Reliability

**Priority: CRITICAL — blocks tasks 5, 6, and 9**

Recorder fixes shipped (reconnect, watchdog, stale-token re-auth). Now
running continuously since Feb 13, capturing both US100 and BTCUSD.

- [x] Diagnose why the recorder stops (WebSocket disconnect? crash? OOM?)
- [x] Fix reconnection logic so it survives disconnects reliably
- [x] Add proper logging/alerting so we know when recording drops
- [x] Keep `record-ticks.ts` running continuously (24/5 during market hours)
- [ ] Target: at least **5 full trading days** of tick data before moving to task 5
- [ ] Verify recorder survives a full weekend gap (Feb 14-16) without dying

---

## 2. Realistic Slippage on Close (Both Directions)

**Priority: HIGH**

Currently `SimulatedExecution` slippage is always adversarial (always hurts
the trader). Real slippage can be positive or negative — price can move in
your favor or against you during the 200–500ms execution delay.

### What to change

- [x] Add a new `SlippageMode`: `{ type: 'realistic'; minDelayMs: 200; maxDelayMs: 500 }`
- [x] When closing a position:
  1. Pick a random delay between 200ms and 500ms
  2. Use the tick generator (task 3) to simulate price movement during that delay
  3. Fill at whatever price the last generated tick lands on
  4. This naturally produces **both positive and negative slippage**
- [x] Keep existing slippage modes (`none`, `fixed`, `random`) working unchanged
- [x] Slippage on **triggered closes** (SL/TP/liquidation) should also use this model
- [x] Update tests in `SimulatedExecution.test.ts`

---

## 3. Synthetic Tick Data Generator

**Priority: HIGH — blocks task 2's realistic slippage**

Build a tick generator that produces random but realistic ticks at
**600 ticks/minute** (10/sec), matching real market microstructure.

### Phase A: Random Generator (statistical model)

- [x] Create `src/core/feed/TickGenerator.ts`
- [x] Input: current price (bid/ask), instrument info
- [x] Output: stream of ticks at ~10/sec rate (600/min)
- [x] Model tick-to-tick movement with:
  - Configurable volatility (σ per tick)
  - Mean-reversion tendency (not pure random walk)
  - Spread that varies slightly around the instrument's average spread
  - Occasional small jumps (fat tails)
- [ ] Used by `SimulatedExecution` for realistic slippage (task 2)
- [ ] Used by `BacktestFeed` to upgrade candle-only backtests to tick-level (task 4)

### Phase B: Learned Generator (trained on real data) — see task 5

---

## 4. Tick-Level Backtest from Candle Data

**Priority: MEDIUM**

Currently, candle-only backtests check SL/TP once per minute using
high/low. With the tick generator, we can **synthesize ticks within each
candle** to simulate a real trading session at 600 ticks/min.

- [x] Create a `SyntheticTickFeed` that:
  1. Takes minute candles as input
  2. For each candle, generates ~600 ticks that respect the candle's OHLC
     (open at start, close at end, touches high and low)
  3. Feeds ticks to `AgentRunner.processTick()` the same way `BacktestTickFeed` does
- [x] This gives candle backtests the same SL/TP precision as tick backtests
- [x] Realistic slippage (task 2) works automatically since ticks are available

---

## 5. Recalibrate Tick Generator with 1 Week of Real Data

**Priority: MEDIUM — blocked by task 1 (need 1 week of recorded data)**

The Phase A generator was calibrated on only ~46 minutes of data. Once we
have a full week (~5 trading days), re-run the calibration with much better
statistics. More data → better distribution fits → tick generation that
follows real market microstructure more closely.

- [ ] Wait for 1 week of recorded tick data (~5 trading days)
- [ ] Re-analyze tick data to extract:
  - Tick-to-tick return distribution (mean, std, skew, kurtosis)
  - Autocorrelation of returns (mean reversion vs momentum at tick level)
  - Spread distribution (mean, std, min, max)
  - Tick arrival rate distribution (not perfectly uniform)
  - Intraday volatility pattern (U-shape: high at open/close, low midday)
- [ ] Update `TickGenerator.fromInstrument()` defaults with new parameters
- [ ] Validate: generate synthetic ticks, compare statistical properties to real data
- [ ] Store learned parameters per instrument (initially US100)

---

## 6. Spin Up a Simple Agent and Test on Real Tick Data

**Priority: MEDIUM — blocked by task 1 (need more data)**

Once we have enough recorded tick data, run the existing EMA crossover
agent (or a trend-follower) against it using `BacktestTickFeed`.

- [x] Pick a simple agent (e.g., `agents/example/ema-crossover.ts`)
- [x] Run a tick-mode backtest against the real recorded tick data
- [x] Compare results to the same agent backtested on candle data for the same period
- [x] Document the differences — this validates whether tick-level precision matters

**Results (2026-02-03 → 2026-02-08, Trend 1m 0.25%):**
Tick-level precision changes when stops fire, which cascades through the
rest of the backtest:
- Candle-only: 61 trades, 34.4% win rate, 5263 candles processed
- Synthetic ticks: 36 trades, 25.0% win rate, 3276 candles processed
Synthetic ticks caught stops mid-candle (before candle close), leading to
different entry/exit sequences and ~40% fewer trades.
Real tick comparison not possible yet (only 46 min of data, too short for
any agent to produce signals).

---

## 7. Multi-Instrument Tick Recording (US100 + BTCUSD)

**Priority: MEDIUM**

Capital.com allows up to 40 instruments per WebSocket subscription (see
`DECISIONS.md`). We should record BTCUSD alongside US100 on the same
connection — no extra WebSocket needed, no rate limit impact.

- [x] Update `record-ticks.ts` to accept a configurable list of EPICs
- [x] Add BTCUSD instrument to `src/data/instruments.ts`
- [x] Verify single WebSocket subscription with multiple EPICs works
      (the `marketData.subscribe` payload already takes an `epics[]` array)
- [x] Create a config file or constant for which instruments to record
      (`RECORDED_EPICS` in `instruments.ts`, with 40-max guard)
- [x] Test that ticks for both instruments arrive and are stored correctly

---

## 8. Tick Data Disk Usage Monitor

**Priority: LOW**

As we record more instruments over longer periods, disk usage in PostgreSQL
will grow. Need a simple way to check how much space each instrument's
tick data is using.

- [x] Create a script or CLI command (`bun run tick-stats`) that shows:
  - Per-instrument: tick count, date range, days of data, estimated disk size
  - Total ticks table size (pg_total_relation_size)
  - Growth rate (ticks/day per instrument)
- [ ] Optionally add this to the health/status API endpoint

---

## 9. Paper Trading Validation with Real Tick Data

**Priority: HIGH — blocked by task 1 (need 1 week of recorded data)**

After collecting 1 week of real tick data (US100 + BTCUSD), re-run the
top 10 Donchian configs as paper trades against the real data. This is the
definitive framework validation — it tests the live execution path that
candle-based backtesting can't reach.

**Target date: ~2026-02-20** (1 week after recorder stabilized)

### What this validates

All four known limitations from `VALIDATION.md` disappear in this mode:
- Position monitor checks every real tick (not candle high/low)
- Fill timestamps are actual tick times (not candle bucket labels)
- Entry candle gap doesn't exist (ticks are continuous)
- Spreads come from the market (not a static constant)

### Steps

- [ ] Verify 5+ days of tick data exist for both US100 and BTCUSD
- [ ] Run top 10 Donchian configs against real tick data using `BacktestTickFeed`
- [ ] Compare results to candle-based backtests for the same period
- [ ] Document discrepancies — these reveal where candle-based backtesting was inaccurate
- [ ] If results diverge significantly, investigate whether the candle backtest was optimistic or pessimistic
- [ ] Run at least one config as a live paper trade on Capital.com demo account
- [ ] Compare paper trade fills to simulated fills — this validates `SimulatedExecution`

### Stretch: BTCUSD agents

- [ ] Run the top Donchian configs on BTCUSD candle data (need to ingest BTCUSD candles first)
- [ ] Compare US100 vs BTCUSD behavior — crypto trades 24/5 with no market close, different dynamics

---

## Dependency Graph

```
[1] Collect Tick Data ──────────────┬──→ [5] Train Generator on Real Data
                                    │
                                    ├──→ [6] Test Agent on Real Ticks
                                    │
                                    └──→ [9] Paper Trading Validation (top 10 Donchian)

[3A] Statistical Tick Generator ───┬──→ [2] Realistic Slippage (both directions)
                                   │
                                   └──→ [4] Tick-Level Backtest from Candles

[5] Train Generator ──────────────────→ [3B] Learned Tick Generator (replaces 3A params)
```

## Suggested Order of Execution

1. **Task 1** — Keep the recorder running (US100 + BTCUSD, currently live)
2. **Task 5** — Once we have 5+ days of ticks (~Feb 20), train the generator on real data
3. **Task 9** — Paper trading validation: top 10 Donchian configs on real tick data + live demo
4. **Task 6** — Compare tick-level vs candle-level backtest results
