# Arena journal

Newest entry first. Written by Claude on each babysitter visit; the rules it follows are in
[LIFECYCLE.md](LIFECYCLE.md). The idea log at the bottom lists every agent idea tried.

## 2026-10-15 (Thu) — demo day 8.6

- Health: green; 0 errors in 3 days. The nightly job pushed daily history (868–1,018 bars per instrument)
  as planned. Two fixes, both deployed:
  - Broker confirmations: Capital.com's `GET /confirms/{reference}` answers with the account's latest
    confirmation whenever the reference is not the latest (verified: a dozen old references all returned the
    same US500 close). A EURUSD close whose broker stop had just filled was stored with an AUDUSD price:
    −$5,019 recorded, −$26.64 real (record corrected). 1 of 1,756 deals; no open was affected and no deal id
    is shared. Confirmations must now match the deal's epic, direction, size and id.
  - Restored runs are priced at start: after each restart, a run holding a position saved its cash balance
    as equity until its first live candle, so equity curves show a false dip at 22:00 on Oct 14 and 07:00 on
    Oct 15 (left in place).
- Broker: bold-play and martingale-monkey (7 runs) excluded from mirroring. They are built to go bust, and
  the martingale was already trading on Arena 09, draining the account the other 1:200 runs share. They stay
  on paper.
- Verdicts: control 144, early 406, keep 0, leader 0, retire 0; monkey sanity 0 of 36.
- Retired: none (nothing judged yet). Added: none (Thursday).
- Accounts: 1:200 −9.4% (mostly the ladder's US100 rungs margin-called at the broker, −$1,845 each), 1:100
  −4.1%, 1:50 −2.1%, 1:20 −1.6%, 1:1 −1.5%; 1:2 to 1:10 within 0.5%.
- New agents, first 1.5 days: the daily-bar agents opened at the first 00:00 UTC close as designed (seeded
  history works). Bold-play: 3 of 4 runs already down 85–99%. Noise-area momentum and gold-session are
  trading; ibs-dip and the weekly or monthly ones have not had a signal yet.
- Next: Monday 2026-10-19 — add agents if due (candidates: the TimesFM quantile audit, then timesfm-stops;
  kelly-ladder; cppi). First judgements start in early November.

## 2026-10-14 (Wed) — 13 agents from the research

- Why: the user asked to implement most of the research report's ideas at once, to watch them over the
  coming weeks. That overrides the usual 1–3 agents a week for this batch; capacity allowed it (480 → 550
  runs, room for 50 more).
- Platform: the arena now seeds every 1d series with the lab's daily bars from 2024-01 (`push-history`,
  nightly), so 200-day and 12-month rules trade from the first live day instead of after months of warm-up
  (it keeps only 120 days of 1-minute candles). 14,397 daily bars seeded at the 22:58 UTC start.
- Gate: agents built to trade a few times a year now need 5 trades per backtest run instead of 20
  (LIFECYCLE.md); controls are not gated.
- Added (backtest 2024-01 → 2026-09, Sharpe per run; parameters fixed from the sources):
  - noise-area-momentum (base 1× at 1:2, voltarget up to 4× at 1:5) — Concretum intraday momentum on US
    indices. US100 +0.91, US500 −0.34, US30 −0.50 (base); about 600 trades per run. Positive only on US100.
  - ibs-dip (pagonidis, composite; 1:2) — buy a close near the session low above the 200-day average. All six
    runs positive: 0.23 to 1.43; 53–71 trades.
  - lrs-sma200 (x1 at 1:1, x2 at 1:3, x3 at 1:5; US500, US100) — leveraged index above its 200-day average.
    0.41 to 0.91; 6–8 trades (slow).
  - shannon-demon (1:1; BTC, ETH, TSLA, NVDA) — 50% of equity, rebalanced at 45/55%. 0.41 to 1.42; 13–26 trades.
  - tsmom-12m (1:5; 10 markets) — sign of the 12-month return, 15% volatility target, monthly. Median 0.1:
    GOLD 1.20, SILVER 1.09, ETH −0.81; 22 trades each (no trades in the first year: it needs 12 months).
  - donchian-ensemble (1:1; BTC, ETH) — five breakout systems averaged, long-only. 0.37, 0.26.
  - gold-session (overnight, both; 1:1) — long from the London afternoon fix to the next morning fix. 1.00
    (overnight), 0.49 (both); the last 120 days alone were negative.
  - crypto-sunday-asia (1:1; BTC, ETH) — long Sunday 19:00 to Monday 19:00 New York. 1.12, 0.78; 143 trades.
  - vol-managed-hold (1:1; 8 shares, BTC, ETH) — full size unless last month is more volatile than the last
    year. Median about 0.4; 5–17 trades (slow).
  - Controls: bold-play (1:200; ruined on all four backtest runs, −99%), martingale-monkey (1:200; ruined),
    skew-monkey (1:5; wins 85% of trades, loses 11–17%), constant-leverage (1:2, 1:5, 1:20: gold +77%, +197%,
    −96%; US500 +30%, +63%, −88% — the volatility-drag curve).
- Tiers now: 1:1 88 runs, 1:2 67, 1:3 57, 1:5 71, 1:10 50, 1:20 56, 1:50 51, 1:100 54, 1:200 56. Every account
  holds 50 mirrored runs; new runs reach the demo accounts by promotion ($200 ahead).
- Not built yet from the report: timesfm-stops and vol-target-blend (need the TimesFM quantile audit first),
  jump-regime (needs longer daily history), LLM strategy writers, kelly-ladder, cppi.
- Next: Thursday visit — check the long-lookback agents traded at their first daily closes, and that the
  nightly job pushes daily history.

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
- bold-play — control: the fewest, largest bets at 1:200 until the account doubles or is ruined, 1h — control (2026-10-14)
- bollinger-fade — fade closes outside Bollinger bands, 15m — live (2026-10-06)
- buy-hold — passive benchmark, funding included; on 1:1 with the 8-share Nasdaq basket (fee-free) — control
- constant-leverage — control: half the account leverage as a constant multiple of equity, rebalanced daily (volatility drag) — control (2026-10-14)
- crypto-sunday-asia — long BTC and ETH Sunday 19:00 → Monday 19:00 New York, 1:1 — live (2026-10-14)
- donchian-breakout (turtle-20, turtle-55) — channel breakouts, 4h — live (2026-10-06)
- donchian-ensemble — five breakout systems (10–200 days) averaged, volatility-scaled, long-only BTC/ETH at 1:1 — live (2026-10-14)
- ema-cross (9-21, 20-50) — moving-average crossover, 1h — live (2026-10-06)
- gold-session (overnight, both) — long gold from the London afternoon fix to the next morning fix, 1:1 — live (2026-10-14)
- hma-slope — Hull MA slope turns, 1h — live (2026-10-06)
- ibs-dip (pagonidis, composite) — buy US indices closing near the session low above the 200-day average, 30m — live (2026-10-14)
- inside-bar — inside-bar breakouts, 4h — live (2026-10-06)
- intraday-momentum — last half hour follows the first (Gao et al. 2018), marginPct at 1:5/1:50/1:200, 30m — rejected (2026-10-12): backtest median Sharpe −0.55, spread larger than the edge
- keltner-trend — Keltner channel trend entries, 4h — live (2026-10-06)
- leverage-ladder (hold, trend) — one signal at every leverage tier, 10% of equity as margin — control (2026-10-07)
- london-breakout — Asian-range breakout at the London open, 15m — live (2026-10-06)
- lrs-sma200 (x1, x2, x3) — 1×/2×/3× index above the 200-day average, cash below (Gayed & Bilello) — live (2026-10-14)
- macd-trend (ema50, ema200) — MACD with a trend filter, 1h — live (2026-10-06)
- martingale-monkey — control: random entries, risk doubling after losses, 1:200 — control (2026-10-14)
- mtf-pullback — 1h pullbacks within a 4h trend — live (2026-10-06)
- noise-area-momentum (base, voltarget) — Concretum intraday momentum: outside the 14-day noise band, VWAP stop, 30m — live (2026-10-14)
- orb-ny (15min, 30min) — New York opening-range breakout, 5m — live (2026-10-06)
- overnight-drift — hold indices overnight, 30m — live (2026-10-06)
- random-baseline (monkey-a/b/c) — random entries with stops — control
- rsi2-reversion (both, long-only) — Connors RSI(2) dips in a trend, 1h — live (2026-10-06)
- shannon-demon — 50% of equity in BTC/ETH/TSLA/NVDA, rebalanced at 45/55%, 1:1 — live (2026-10-14)
- skew-monkey — control: random entries, 0.5 ATR target and 3 ATR stop (85% winners, no edge) — control (2026-10-14)
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
- tsmom-12m — sign of the 12-month return, 15% volatility target, monthly, 10 markets — live (2026-10-14)
- turn-of-month — long from 2 weekdays before month end to the 3rd trading day, indices + 8 shares at 1:1, 30m — live (2026-10-12)
- vol-managed-hold — 8 shares, BTC, ETH at 1:1, scaled down when last month is more volatile than the last year — live (2026-10-14)
- vol-target — long US indices at 15% ÷ realized volatility (0–2×), monthly rebalance, 1d, 1:3 — live (2026-10-12)
- volatility-breakout (k05, k08) — open ± k × previous range, 15m — live (2026-10-06); best backtest
- zscore-fade — z-score mean reversion, 1h — live (2026-10-06)

Candidates (not built yet): see the ranked list in `research/report.md` (the Research tab). Settled by the
research: FX carry is not available on Capital.com (no FX side earns funding); standalone calendar
effects (pre-holiday, Monday, pre-FOMC) and BTC's 21:00–23:00 UTC window are not worth building.
