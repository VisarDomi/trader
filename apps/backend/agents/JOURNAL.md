# Arena journal

Newest entry first. Written by Claude on each babysitter visit; the rules it follows are in
[LIFECYCLE.md](LIFECYCLE.md). The idea log at the bottom lists every agent idea tried.

## 2026-10-13 (Tue, evening) — research pass; no overnight fee at 1:1

- Why: the user asked for research to get inspired (general strategies, the 1:1 account, leverage). First
  pass: six topics plus Reddit, 233 sources, about 170 saved papers and page snapshots. It is on the
  dashboard's Research tab (`research/report.md` ranks what to build next).
- Fix: Capital.com charges no overnight fee on 1:1 positions on every market except natural gas, not only
  on shares and crypto. Arena 01's transactions (8–12 October) showed funding only on NATURALGAS, while
  Arena 06 (1:20) paid it on everything. The engine now matches. 1:1 backtests were re-run: US100
  buy-and-hold is +73% instead of +46%. The 1:1 demo runs keep the fees charged in their first 6 days.
  The arena was deployed at 21:41 UTC.
- Also seen on Arena 01: index dividend adjustments (longs credited, shorts charged), which the engine
  does not model yet; worth 0.6–1.7% a year on index longs.
- buy-hold's description still says "crypto and shares hold fee-free, the rest pay CFD funding". Left
  as is: editing the file would restart the control's record. Fix it when buy-hold next changes.
- Next: candidates for Monday from the report: noise-area-momentum, ibs-dip, lrs-sma200, crypto-demon;
  platform: a "confirmed" verdict at t ≥ 3, `ctx.resize`, index dividends.

## 2026-10-12 (Mon) — demo day 5

- Health: green after one broker fix. Capital.com's price stream dropped on Saturday 05:00–07:00 UTC (it
  reconnected every minute; candles kept arriving over REST, so only live quotes were missing). The watchdog
  raised 2 alerts and cleared them by itself; if this repeats next Saturday, it is weekly maintenance and the
  watchdog should stay quiet then. Broker fix: at Friday's 21:00 close the paper engine still traded, and the
  three opens it sent were refused ("market closed") and used up all 4 retries in 25 minutes, so monkey-b US500
  stayed unmirrored all weekend. Now an open refused by a closed market waits for `GET /markets/{epic}` to say
  the market trades again, without using up its retries (monkey-b US500 opened at 07:39). Also, two GBPUSD
  closes at Sunday's reopen were rejected but recorded as closed, and the next reconcile re-attached and closed
  them; a rejected close now stays open and is retried. Seen once since: a stoch-range GBPUSD deal hit its
  broker stop and Capital.com still listed it for ~4 minutes, so it was re-attached twice before a 404 settled
  it (harmless; watch for more). Nightly lab job fine. Arena 144 MB, 448/480 runs mirrored, 0 errors in 3 days.
- Verdicts: control 122, early 358, keep 0, leader 0, retire 0; monkey sanity 0 of 36.
- Retired: none (nothing can be judged before early November).
- Added: turn-of-month — the turn-of-the-month effect (Ariel 1987, Lakonishok & Smidt 1988, McConnell & Xu
  2008): long from the 16:00 New York close two weekdays before month end to the close of the third trading
  day of the next month; US500, US100, US30 and the 8 shares; 1:1 (shares fee-free); no variants. Backtest
  median Sharpe 0.42, 31–33 trades per run (META +59%, TSLA −32%).
- Added: vol-target — volatility targeting (Moreira & Muir 2017): long US500, US100, US30 at 15% ÷ last
  month's realized volatility, 0–2× equity, rebalanced monthly; 1:3 (uses up to 2×). Backtest median Sharpe
  0.40, 34 trades per run (US100 +31%, US30 −0.3%).
- Rejected: intraday-momentum — market intraday momentum (Gao, Han, Li & Zhou 2018): trade 15:30–16:00 New
  York in the direction of the previous close → 10:00 return, sized with marginPct 20 at 1:5, 1:50 and 1:200.
  Backtest median Sharpe −0.55 (gate −0.5): 704 trades, 47% won; on US500 at 1× the gross edge was about +2%
  over 33 months against about 7% of spread, so leverage only multiplied the loss (−99% at 1:200).
- Leverage after 5 days: tier averages fall with leverage (1:1 −0.1%, 1:20 −0.5%, 1:200 −1.9%). The ladder
  scales almost exactly with leverage so far, with no margin calls: GOLD hold +32.6% at 1:200, US100 hold
  −34.3%. The share basket (−0.6% average) is ahead of US100 (−1.6%) at 1:1.
- Tiers: 1:1 now has 66 runs for 50 slots, 1:3 has 55; promotion decides who is mirrored.
- Next: Thursday visit; Monday 2026-10-19 may add 1–3 agents (candidates in the idea log).

## 2026-10-08 (Thu) — demo day 0.6

- Health: green after one broker fix. An open Capital.com rejected was never retried, so buy-hold AVGO
  (1:1, rejected without a reason at 00:00 UTC) had no demo deal; and 3 closes that hit the 21:00–21:05 UTC
  break were retried every minute and went through at 21:05, but logged 18 errors. Now rejected opens are
  tried again up to 4 times, 5 minutes apart, while the paper position lasts, and closed-market closes are
  logged once. AVGO opened on Arena 01 at 07:33 UTC (373.28, paper 377.05). Nightly lab job fine (share
  backtests pushed). Arena 101 MB, 448/466 runs mirrored.
- Verdicts: control 122, early 344, keep 0, leader 0, retire 0; monkey sanity 0 of 36.
- Retired: none. Added: none (Thursday).
- Leverage: the 1:200 account is down 0.9% after 15 hours, mostly the ladder's 20× positions; too early to read.
- Share basket backtest (1:1, no fees): +123% on average (NVDA +340%, MSFT +35%) against US100 +46% after
  $2,697 of fees. Most of the gap is hindsight: these are today's eight largest companies because they rose.
  The fees are about 27 points of it. The demo is the fair comparison.
- Next: Monday 2026-10-12, first new agents (candidate: a strategy on the shares at 1:1).

## 2026-10-07 (Wed, evening) — leverage tiers

- Why: the user asked for leverage as another dimension, with all nine Arena accounts on different
  leverages, 1:1 and 1:200 the most interesting.
- Accounts: Arena 01 … 09 = 1:1, 1:2, 1:3, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200 (crypto and shares stop at
  1:20). At 1:1, crypto and shares pay no overnight fee.
- Allocation: agents sorted by backtest leverage use (90th percentile of position ÷ equity), least on 1:1
  (buy-hold, tsmom, overnight-drift) and most on 1:200 (bollinger-fade, mtf-pullback, london-breakout,
  stoch-range); one monkey each on 1:50, 1:100 and 1:200; 49–55 runs per account, 466 in all.
- Added: leverage-ladder (control) — hold and 20-day trend on US100, GOLD, EURUSD, BTCUSD at every tier
  with 10% of equity as margin (0.1× at 1:1 … 20× at 1:200). Backtest 2024-01 → 2026-09: US100 hold
  +4.6% at 1:1, +93% at 1:20, +232% at 1:50 (93% drawdown), −80% at 1:100, wiped out at 1:200; BTC hold
  +11.5% at 1:1 (no fee) but −2.4% at 1:2 and −88% at 1:20 (the fee grows with the position).
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
- intraday-momentum — last half hour follows the first (Gao et al. 2018), marginPct at 1:5/1:50/1:200, 30m — rejected (2026-10-12): backtest median Sharpe −0.55, spread larger than the edge
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
- turn-of-month — long from 2 weekdays before month end to the 3rd trading day, indices + 8 shares at 1:1, 30m — live (2026-10-12)
- vol-target — long US indices at 15% ÷ realized volatility (0–2×), monthly rebalance, 1d, 1:3 — live (2026-10-12)
- volatility-breakout (k05, k08) — open ± k × previous range, 15m — live (2026-10-06); best backtest
- zscore-fade — z-score mean reversion, 1h — live (2026-10-06)

Candidates (not built yet): see the ranked list in `research/report.md` (the Research tab). Settled by the
research: FX carry is not available on Capital.com (no FX side earns funding); standalone calendar
effects (pre-holiday, Monday, pre-FOMC) and BTC's 21:00–23:00 UTC window are not worth building.
