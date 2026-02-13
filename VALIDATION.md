# Framework Validation

How we verified that the backtesting framework produces correct results.

---

## 1. Leverage Bug & Fix (2026-02-13)

### Problem

20x and 200x leverage produced identical backtest results. Root cause: no position-level margin liquidation. The only liquidation check was account-level (`equity <= 0`), which meant leverage had no effect — positions were never force-closed by margin depletion.

### Fix

Added margin liquidation to `PositionMonitor`. At position open, the framework computes a liquidation price:

- **BUY**: `entryPrice * (1 - 0.5 / leverage)`
- **SELL**: `entryPrice * (1 + 0.5 / leverage)`

This represents the price at which the position's unrealized loss equals 50% of its margin. At 200x, that's a 0.25% adverse move. At 20x, 2.5%.

Margin liquidation is checked with highest priority on every minute candle (`PositionMonitor.checkCandle`) and every tick (`PositionMonitor.check`), before SL/TP checks.

### Verification

Re-ran full 108-combo Donchian sweep. Results now show clear divergence between leverage levels (see `results/2026-02-13 11:48 donchian-108-sweep.csv`).

---

## 2. Trade Trace Verification (2026-02-13)

### Method

Script: `src/run/trace-donchian.ts`

Ran the best-performing config (ch100/ATR2/RR3/200x/1h) across 6 years of US100 data. Selected 5 representative trades (1 TP hit, 1 SL hit, 2 liquidations, 1 market close) and verified each against actual 1-minute candle data from the database.

For each trade, verified:
1. PnL computation: `(exit - entry) * size * lotSize` matches reported PnL
2. Exit price vs trigger level: liquidation exits should be at or near the computed liq price
3. Candle-level consistency: the exit trigger should be justified by actual candle data

### Results

All 5 trades pass verification:

| Trade | Side | Entry | Exit | Reason | PnL | Match | Notes |
|-------|------|-------|------|--------|-----|-------|-------|
| TP_HIT | SELL | 9251.1 | 8967.1 | TAKE_PROFIT | +$578.51 | YES | See timing note below |
| SL_HIT | BUY | 16917.9 | 16885.9 | STOP_LOSS | -$396.58 | YES | SL at 32 pts, liq at 42 pts — SL fires first |
| EARLY_LIQ | BUY | 9705.9 | 9681.9 | LIQUIDATION | -$170.81 | YES | Exit 0.3 pts from liq price |
| MID_LIQ | BUY | 11099.5 | 11072.4 | LIQUIDATION | -$37.75 | YES | Exit 0.6 pts from liq price |
| MKT_CLOSE | SELL | 10741.7 | 10759.1 | MARKET_CLOSE | -$54.88 | YES | |

### Candle Timing Nuance

The TP_HIT trade initially appeared suspicious: the fill timestamp was `2020-02-24T07:00` and 1-minute candles at 07:01-07:08 showed `HIGH+SPREAD >= liq price`. At first glance, this looks like the trade should have been liquidated immediately.

Investigation revealed this is correct behavior due to how candle aggregation works:

1. **The "07:00 hourly candle" doesn't complete until the 08:00 minute candle arrives.** The `CandleBuilder` uses bucketed timestamps — all minutes from 07:00-07:59 belong to the 07:00 bucket. The candle only emits when the next bucket starts (08:00).

2. **The position is created after the hourly candle completes.** The processing order inside `processMinuteCandleInner` is: (a) check position monitor, (b) aggregate candles, (c) if candle completes, call agent, (d) if agent returns order, create position. So the position doesn't exist during minutes 07:00-07:59.

3. **The fill timestamp is the candle's label, not the actual creation time.** The fill says `07:00` because that's the hourly candle's bucket start time. The position actually materializes during the processing of the 08:00 minute candle. The fill price (9251.1) is the close of the 07:00-07:59 hourly candle — which matches the 07:59 minute candle's close, not the 07:00 minute candle.

4. **Once the position existed (08:00+), no candle breached the liquidation price.** The highest `HIGH+SPREAD` after 08:00 was 9258.9, well below the liq price of 9274.2.

**Implication:** Fill timestamps for multi-timeframe agents are up to `timeframe - 1 minute` earlier than reality. A 1h agent's fill at `07:00` actually opens at `~08:00`. A 4h agent's fill at `04:00` actually opens at `~08:00`. This doesn't affect correctness (position monitor checks happen on every minute candle regardless), but affects hold time calculations.

---

## 3. Monte Carlo Survival Analysis (2026-02-13)

### Method

Script: `src/run/monte-carlo-survival.ts`

Ran 10,000 simulations of 5,000 trades each, using the observed outcome distribution from the ch100/ATR2/RR3/200x/1h backtest:
- 75.1% liquidation
- 7.9% TP hit
- 0.9% SL hit
- 16.1% market close

Compared two sizing strategies:
- **Full-margin**: all available equity as margin each trade
- **2%-risk**: risks 2% of equity per trade (what the Donchian agent uses)

### Results

Both strategies bust 100% of the time when outcomes are drawn randomly:
- Full-margin: median bust at trade 23
- 2%-risk: median bust at trade 2,455

### Interpretation

The backtest produces +$21,613 profit over 1,381 trades with the same outcome distribution. Monte Carlo says random ordering of those outcomes leads to certain ruin. This means the agent's entry timing provides positive edge — it doesn't just randomly collect TP/SL/liquidation outcomes. The Donchian channel entries cluster winning trades in favorable market regimes.

This doesn't prove the edge will persist out of sample, but it confirms the backtest PnL isn't a statistical accident of outcome ordering.

---

## 4. Known Limitations

### Entry candle not checked

When a position opens on a completed candle, the minute candle that triggers the candle completion is not checked against the position (because the position doesn't exist yet when the monitor runs). This creates a 1-minute gap. At 200x leverage where 0.25% moves liquidate, a gap candle could theoretically breach the liq price undetected. In practice, the entry price is the close of the completed candle, so the gap candle's close IS the entry price — the only risk is an extreme high/low within that single minute that reverts by close.

### Candle-level vs tick-level precision

Backtest checks liquidation against minute candle high/low, not individual ticks. Within a single minute, the actual sequence of price movements is unknown. The framework assumes worst-case ordering (stop before TP if both could trigger), but for liquidation, the actual intra-minute path could differ. This is inherent to candle-based backtesting.

### Fill timestamps lag actual position creation

As documented in section 2, fill timestamps use the aggregated candle's start time. For a 1h agent, this means fills appear up to 59 minutes earlier than when the position actually started being monitored. Hold times are overstated by the same margin.

### Spread is static

The spread is a fixed constant from instrument config. Real spreads widen during high volatility, low liquidity, and around market open/close. This makes the backtest optimistic on spread costs during volatile periods — exactly when 200x leverage positions are most likely to get liquidated.

### Resolution

All four limitations are artifacts of candle-based backtesting. They disappear in live/paper trading where `PositionMonitor.check(bid, ask)` runs on every real tick, fills use actual timestamps, and spreads come from the market.

**Next step:** Collect 1 week of real tick data (US100 + BTCUSD, recording since 2026-02-13), then run the top 10 Donchian configs as paper trades against real market data. This validates the framework end-to-end and exposes any bugs in the live execution path that candle-based backtesting can't catch.
