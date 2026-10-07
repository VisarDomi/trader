# Arena journal

Newest entry first. Written by Claude on each babysitter visit; the rules it follows are in
[LIFECYCLE.md](LIFECYCLE.md). The idea log at the bottom lists every agent idea tried.

## 2026-10-07 (Wed, evening) — leverage tiers

- Why: the user asked for leverage as another dimension, with all nine Arena accounts on different
  leverages, 1:1 and 1:200 the most interesting.
- Accounts: Arena 01 … 09 = 1:1, 1:2, 1:3, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200 (crypto and shares stop at
  1:20). At 1:1, crypto and shares pay no overnight fee.
- Allocation: agents sorted by backtest leverage use (90th percentile of position ÷ equity), least on 1:1
  (buy-hold, tsmom, overnight-drift) and most on 1:200 (bollinger-fade, mtf-pullback, london-breakout,
  stoch-range); one monkey each on 1:50, 1:100 and 1:200; 49–55 runs per account, 466 in all.
- Added: leverage-ladder (control) — hold and 20-day trend on US100, GOLD, EURUSD, BTCUSD at every tier
  with 10% of equity as margin (0.1× at 1:1 … 20× at 1:200). 120-day check: US100 hold was wiped out at
  1:100 and 1:200 and gained a little at 1:50 and below; BTC hold returns scaled with leverage up to its 1:20 cap.
- Added: the eight largest Nasdaq-100 shares to buy-hold, all on 1:1, as a fee-free stand-in for US100.
- All demo runs restarted (run ids now include the leverage; they were 1.5 days old).
- Next: watch the ladder and 1:1 vs other tiers; strategies on shares at 1:1 are a candidate for Monday.

## 2026-10-07 (Wed) — demo day 0.6: lifecycle starts

- Health: all green. 40 agents, 392 demo runs, all 392 mirrored on Arena 01–09 (hedging mode, 0.2× size,
  capacity 450). Stream connected, forecaster reachable, arena 116 MB.
- Verdicts: early 344, control 48; nothing can be judged yet (judgement starts at 30 trades and 28 days).
- Set up: lifecycle verdicts on the dashboard (Stage column), `bun run review`, `agents/roster.json` for
  retiring single runs, broker promotion/demotion once the 450 slots are full, a watchdog every 10 minutes
  with desktop notifications, and babysitter visits on Mondays and Thursdays at 09:30.
- Next: no retirements possible before early November; first new agents on Monday 2026-10-12.

## Idea log

One line per idea: agent — mechanism — status (date).

- adx-dmi — ADX trend strength with DI direction, 1h — live (2026-10-06)
- bollinger-fade — fade closes outside Bollinger bands, 15m — live (2026-10-06)
- buy-hold — passive benchmark, funding included; on 1:1 with the 8-share Nasdaq basket (fee-free) — control
- donchian-breakout (turtle-20, turtle-55) — channel breakouts, 4h — live (2026-10-06)
- ema-cross (9-21, 20-50) — moving-average crossover, 1h — live (2026-10-06)
- hma-slope — Hull MA slope turns, 1h — live (2026-10-06)
- inside-bar — inside-bar breakouts, 4h — live (2026-10-06)
- keltner-trend — Keltner channel trend entries, 4h — live (2026-10-06)
- leverage-ladder (hold, trend) — one signal at every leverage tier, 10% of equity as margin — control (2026-10-07)
- london-breakout — Asian-range breakout at the London open, 15m — live (2026-10-06)
- macd-trend (ema50, ema200) — MACD with a trend filter, 1h — live (2026-10-06)
- mtf-pullback — 1h pullbacks within a 4h trend — live (2026-10-06)
- orb-ny (15min, 30min) — New York opening-range breakout, 5m — live (2026-10-06)
- overnight-drift — hold indices overnight, 30m — live (2026-10-06)
- random-baseline (monkey-a/b/c) — random entries with stops — control
- rsi2-reversion (both, long-only) — Connors RSI(2) dips in a trend, 1h — live (2026-10-06)
- squeeze-breakout — Bollinger-inside-Keltner squeeze release, 1h — live (2026-10-06)
- stoch-range — stochastic reversals in ranges, 30m — live (2026-10-06)
- supertrend (10x3, 20x5) — SuperTrend flips, 1h — live (2026-10-06)
- swing-reversal (p05, p10) — swing high/low reversals, 15m — live (2026-10-06)
- timesfm-band — fade moves outside the TimesFM band, 1h — live (2026-10-06); backtest −2.75 median Sharpe
- timesfm-drift (h4, h8, h16) — trade the TimesFM median's direction, 1h — live (2026-10-06); backtests negative
- timesfm-swing — 4h, TimesFM inner band entirely on one side of the price — live (2026-10-07)
- timesfm-trend — TimesFM direction as a trend confirmation, 1h — live (2026-10-06)
- timesfm-vol-breakout — channel breakouts when TimesFM forecasts wide ranges, 1h — live (2026-10-07)
- tsmom (5d, 20d) — time-series momentum, 4h — live (2026-10-06)
- volatility-breakout (k05, k08) — open ± k × previous range, 15m — live (2026-10-06); best backtest
- zscore-fade — z-score mean reversion, 1h — live (2026-10-06)
