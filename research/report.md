# Research report

_First pass, 2026-10-13. Six topics researched in parallel, plus 40 Reddit threads. Each topic has its own note with
the evidence, and the library has every source, most with a saved copy._

## The short version

- **Leverage pays only when it is timed or scaled to volatility, and almost never above about 3×
  overnight.** Growth-optimal (Kelly) leverage is Sharpe ÷ volatility. For a long index that pays about 8%
  a year of funding, roughly what the index earns, it comes out between 0 and 1. Nothing in the
  literature, or in our data, rationally *uses* 1:50–1:200 overnight. That tier is for intraday agents
  with tight stops, for ruin experiments, and for one honest "double or bust" game.
  [Leverage](topics/leverage.md)
- **The 1:1 account is better than we thought.** Capital.com charges no overnight fee on 1:1 positions on
  every market except natural gas, not just on shares and crypto. Arena 01's own transactions confirmed it,
  and the engine is fixed (below). Long holds of anything except gas belong at 1:1.
  [Trading at 1:1](topics/unlevered.md)
- **Most famous anomalies have decayed.** Published predictability falls about 58% after publication.
  Pre-holiday, Monday, the pre-FOMC drift and post-earnings drift in mega caps are gone. What survives
  tends to be slow (trend, volatility management) or driven by flows (end-of-day hedging, month-end
  rebalancing). [Anomalies](topics/anomalies.md)
- **What survives honest hobbyist testing is boring and has someone paying for it.** One careful 2026 test
  of 100+ retail ideas (about 700 versions, with costs and random-entry controls) kept only these: buying
  index dips in an uptrend (IBS, RSI(2), three down days above the 200-day average), month-end rebalancing,
  overnight holding, slow trend following and volatility targeting. Chart patterns, opening-range
  breakouts, options flow and LLM-read news all failed. Costs decide more than signals.
  [Communities](topics/community.md)
- **The best new agent candidate fixes the idea we rejected yesterday.** Concretum's intraday momentum
  enters only when the index leaves its normal range for that time of day. It holds for hours with a
  trailing stop and sizes to volatility. It earned about 4 bp per trade on SPY over 2007–2024 and kept
  working after publication. Our Gao-style rule earned 0.3 bp against a 1 bp spread.
  [Anomalies](topics/anomalies.md)
- **LLMs trading by themselves lose, mostly through leverage.** In nof1's Alpha Arena (real money, 17
  days), 4 of 6 frontier models lost 31–63% at 10–20× leverage. Published LLM-agent backtests are
  contaminated, because the models remember the prices. Our forward demo is exactly the uncontaminated
  test the literature asks for. [AI and LLM trading](topics/ai-trading.md)
- **The arena itself is the most interesting dataset.** With about 480 runs, choosing strategies by
  recent results, ensembles and "follow the crowd" can be tested on our own live record. The evidence
  says picking recent winners rarely beats equal weight; dropping strategies with a negative trailing
  year may. [Portfolios and meta-strategies](topics/portfolio.md)
- **Our "leader" bar is too low to claim skill.** With about 480 no-skill runs, the best is expected to
  show t ≈ 3, and about 10 would pass t ≥ 2 by luck. Keep t ≥ 2 for broker promotion, but call an edge
  "confirmed" only at t ≥ 3 (or a deflated Sharpe ratio). [Anomalies](topics/anomalies.md)

## Already fixed tonight: no overnight fee at 1:1 except on natural gas

The unlevered research found that Capital.com's fees page exempts 1:1 positions on "most markets", while
the engine (following the July 2024 announcement) exempted only shares and crypto. Arena 01's transactions
for 8–12 October settled it: funding was charged only on NATURALGAS, and not on its US100, US500, US30,
gold, silver, oil or FX positions. Arena 06 (1:20) paid funding on all of them. The engine now exempts
every 1:1 position except natural gas. The 1:1 backtests were re-run, and US100 buy-and-hold went from
+46% to +73% (2024-01 → 2026-09).

Two consequences:

- **The share basket is no longer the only fee-free way to hold the index.** US100 at 1:1 is fee-free too.
  The basket stays as "the eight biggest companies against the index".
- **The engine still ignores index dividends.** Arena 01 receives them (US500 longs credited, shorts
  charged). That is worth about 0.6–1.7% a year on index longs. It is next on the platform list.

## Leverage: where each tier makes sense

| Tier | Rational use (evidence) | In the arena now | Worth adding |
|---|---|---|---|
| 1:1 | Long holds: no funding except gas; volatility harvesting; anything whose Kelly leverage is below 1 | buy-hold, tsmom, overnight-drift, turn-of-month | Shannon's demon on crypto, vol-managed shares and crypto, trend-or-cash, 200-day timing on indices |
| 1:2–1:5 | Timed or volatility-scaled index exposure up to 2–3×; half Kelly on slow signals | vol-target (1:3) | Leverage for the Long Run (2× and 3× above the 200-day average), CPPI |
| 1:10–1:20 | Intraday agents sized by risk to a stop (no overnight funding); capped Kelly | most intraday agents | noise-area momentum with a volatility target up to 4× |
| 1:50–1:200 | No rational overnight *use*. Headroom for tight-stop intraday agents; ruin and skew controls; "bold play" to a goal | the ladder, high-leverage risk agents | martingale monkey, bold-play at 1:200, constant-leverage rungs |

The numbers behind it:

- **Kelly:** half Kelly keeps 75% of the growth and cuts the chance of ever halving the account from 1/2
  to 1/8. Double Kelly grows at zero.
- **Optimal leverage of the market:** Ole Peters measured the S&P 500's at 1.1 ± 0.6 over 1927–2020. Our
  2024–26 data says about 4 ± 3.7 on US500: three years cannot tell 4× from 1×.
- **What a full-margin 1:200 position does:** in our data it would have been margin-called within a day on
  35–65% of days. The ladder shows the same live: US100 held at 1:200 was −34% after five days.
- **Timed leverage, honestly measured:** Gayed's September 2026 revision of "Leverage for the Long Run",
  now with borrowing costs, finds the same Sharpe ratio as the S&P 500 and no significant alpha. What a
  200-day filter on 2× buys is more growth for a similar drawdown. A public real-money test on Reddit
  (March 2024 → September 2026): 2× S&P with the 200-day filter +68%, S&P 500 +54%, HFEA +31%. 2× is where
  that community settled. A simulated 3× Nasdaq from 1999 fell 99.9%, and still 95% with the filter.
  [Reddit](topics/reddit.md)
- **Retail evidence:** 74–89% of EU CFD accounts lose money (79.75% at Capital.com). FX traders in the
  most-leveraged fifth lost 44% a month. The US 50:1 cap cut their losses by 40%. Liquidated Bitcoin
  futures traders averaged 60×.
- **For 1:200 to be Kelly-optimal**, a strategy would need a Sharpe ratio of about 3 (EURUSD at 1:50) to
  40 (gold at 1:200). That is market-maker territory.
- **The one coherent case for maximum leverage is bold play** (Dubins & Savage): if the goal is to double
  the account before losing it, the best strategy is the fewest, largest bets. A `bold-play` agent at
  1:200 would test exactly the user's original 1:200 intuition.

## Ideas to build next, ranked

All of these work with today's SDK and use fixed textbook parameters. The rank weighs the evidence,
whether our costs allow it, and how much it would teach us.

| # | Agent | Idea and evidence | Fit | Note |
|---|---|---|---|---|
| 1 | `noise-area-momentum` | Concretum intraday momentum: trade only breaks out of the time-of-day noise band; VWAP or band trailing stop; flat by 16:00. About 4 bp per trade on SPY 2007–24, Sharpe 1.33 net, held after publication | US500/US100/US30, 5m. `base` 1× and `voltarget` up to 4× (1:5) | [anomalies](topics/anomalies.md), [community](topics/community.md) |
| 2 | `ibs-dip` | Buy the index when it closes near the day's low (IBS < 0.2) above its 200-day average; sell at the next close. Decades of evidence; survived the 100-strategy test against random entries; our 2024–26 data agrees in sign (+15–25 bp next day vs +5–10 average) | US500/US100/US30, 30m, 1:1 (now fee-free) or 1:2. `pagonidis` and `composite` variants | [community](topics/community.md) |
| 3 | `lrs-sma200` | Leverage for the Long Run (Gayed & Bilello): leveraged index above its 200-day average, cash below. Sharpe 0.51 vs 0.30 over 1928–2015, but the 2026 revision with borrowing costs finds no extra Sharpe, only more growth for a similar drawdown; beat shuffled-date controls (p ≈ 0.03). A hysteresis band (in at +4%, out at −3%) cuts whipsaws | US500/US100/US30, 1d. 1× at 1:1 (now fee-free), 2× at 1:3, 3× at 1:5 | [leverage](topics/leverage.md), [community](topics/community.md), [reddit](topics/reddit.md) |
| 4 | `crypto-demon` | Shannon's demon: hold 50% of equity, rebalance at 45/55%. The rebalancing bonus is about σ²/8 a year; +1.4% (BTC) and +7% (ETH) over a 50/50 hold in 2024–26 before costs | BTCUSD, ETHUSD (maybe TSLA, NVDA) at 1:1, fee-free | [unlevered](topics/unlevered.md), [leverage](topics/leverage.md) |
| 5 | `tsmom-12m` | Textbook time-series momentum (Moskowitz, Ooi & Pedersen): sign of the 12-month return, volatility-scaled, monthly. Sharpe 0.77 after fees over 67 markets since 1880; the managed-futures building block. Run monthly agents as 4 copies on staggered days to measure timing luck | All 20 instruments, 1d; FX at 1:10, the rest at 1:3; shares and crypto long-only at 1:1 | [anomalies](topics/anomalies.md), [portfolio](topics/portfolio.md) |
| 6 | `vol-managed-hold` | Moreira & Muir on the fee-free legs: full size when recent volatility is at or below its 1-year level, less when above | 8 shares, BTC, ETH at 1:1, 1d | [unlevered](topics/unlevered.md), [portfolio](topics/portfolio.md) |
| 7 | `donchian-ensemble` | Five turtle breakouts (10 to 200 days) averaged into one signal, volatility-targeted: spreads the risk of picking the wrong lookback. Crypto trend is the most persistent trend evidence | BTC, ETH (and the 8 shares) long-only at 1:1, 1d | [community](topics/community.md) |
| 8 | `bold-play` | Dubins & Savage: the best way to double before ruin is the fewest, largest bets. Each run is one sample of "does 1:200 double the account first?" | US500, US100, GOLD, EURUSD at 1:200 | [leverage](topics/leverage.md) |
| 9 | `martingale-monkey`, `skew-monkey` | Controls: a doubling-after-loss monkey (watch the ruin), and an 85%-win negative-skew monkey that calibrates how often no-edge agents look like leaders | EURUSD, US500, GOLD; 1:200 and 1:5 | [leverage](topics/leverage.md) |
| 10 | `constant-leverage` | Control: a daily-rebalanced leveraged-ETF emulator next to the fixed-units ladder. Measures volatility drag L(L−1)σ²/2 live | US500, GOLD, EURUSD, BTC at 1:2 … 1:20 | [leverage](topics/leverage.md) |
| 11 | `gold-session` | Gold rises in Asian hours and falls in London and New York hours: LBMA fixes 1968–2025, +13.8% a year from the afternoon fix to the next morning fix and −4.7% a year in between; our data agrees (+9.9 bp per night, −0.9 bp intraday) | GOLD, 30m, 1:1 (now fee-free) | [anomalies](topics/anomalies.md), [reddit](topics/reddit.md) |
| 12 | `crypto-sunday-asia` | Long BTC and ETH from Sunday 19:00 to Monday 19:00 New York (the Asian Monday open): Concretum 2018–25, our data +54 bp (t 2.2). Best of seven windows, so treat as a test | BTCUSD, ETHUSD at 1:1, 1h | [community](topics/community.md) |
| 13 | `timesfm-stops`, `vol-target-blend` | TimesFM can't predict direction but is usable for volatility. Twin agents swap ATR stops for forecast-band stops, and blend TimesFM with HAR volatility | Twins of existing agents | [ai-trading](topics/ai-trading.md) |
| 14 | `jump-regime` | Two-state jump model: S&P 500 Sharpe 0.48 → 0.68 and max drawdown 55% → 27% (1990–2023, after costs). Needs longer daily history to fit well | US indices at 1:1, 1:3, 1:10 | [ai-trading](topics/ai-trading.md) |
| 15 | LLM strategy writers | A process, not an agent: each week several frontier models write one agent from the same brief; authors are compared by demo t-statistics. Forward testing removes the memorisation problem | Any | [ai-trading](topics/ai-trading.md) |

**Kelly ladder** (half, full and double Kelly on a trailing estimate) and **CPPI** (leverage only out of
profits above a floor) are good experiments too, but slower to read.

## Studies that need no new agent

- **TimesFM quantile audit:** does the q0.1–q0.9 band hold 80% of outcomes? No paper has checked, and
  ideas 10 and 11 depend on it. One lab script.
- **Leverage curve from the ladder:** each month, fit growth against leverage per instrument and show the
  live optimal leverage with its error.
- **Realized Kelly per run:** mean ÷ variance of trade returns, against the leverage the run actually uses.
  It flags overbetting (above 2× Kelly) and wasted room.
- **Ruin lab:** bootstrap our 2024–26 returns to estimate the chance that each ladder rung is margin-called
  within a day, a month and a year. One live path cannot measure a ruin probability.
- **Meta study on our own runs** (from about January 2027, when there is enough history): does a run's
  past result predict its future? Compare equal weight, top-20 by t, "drop runs with a negative trailing
  90 days", Thompson sampling, inverse volatility and HRP, all deflated and with a monkey placebo.
- **Crowd positioning:** does the share of live runs that are long an instrument predict its next day or
  week?

## Platform changes, by value

| Change | What it enables | Size |
|---|---|---|
| Fairer judging: a "confirmed" verdict at t ≥ 3 or deflated Sharpe; t-statistics on % returns per trade; flags for strongly negative skew; pooled or daily-return judging for slow agents | honest leaders; calendar and monthly agents can be judged at all | 1–2 days |
| Checks other projects have: per-agent matched monkeys (100 random-entry twins with the same stops and holding times), Monte Carlo of trades, a cost "speed limit" in `check-agent` (it would have caught intraday-momentum), paper-vs-demo slippage per agent, lookahead and warm-up checks | "is the edge in the entry or in the stop?"; broken agents spotted early | about 1 day each |
| Controls for timing agents: the same average exposure on shuffled dates; a warning when many mirrored runs pile into one instrument; a check that the monkeys never use information from before their entry | tells timing skill from exposure; avoids an accidental one-bet book | ~1 day each |
| Start recording free data now: Capital.com client sentiment (% long per market), Kalshi FOMC and CPI odds | sentiment-fade and macro-surprise studies in 6 months | ~1 day |
| `ctx.resize({ exposure })` (partial close and add) | rebalancing agents (demon, vol-target, Kelly, CPPI, constant leverage) without paying a full spread each time | 2–3 days |
| Index dividends in the engine | correct long-index results (0.6–1.7% a year) | 1–2 days |
| Event calendar in `ctx` (FOMC, CPI, NFP, EIA, holidays, earnings, ex-dividend dates) | announcement-day effects, earnings ORB, blackouts, a holiday-aware turn of the month | 2–3 days + data |
| Portfolio view per agent (sum of its runs as one curve) | judging "trend across 20 instruments" or "basket of 8 shares" as one portfolio | ~1 day |
| Read-only access to other instruments (`ctx.market('US500')`) | breadth and relative-strength filters, the London 4 pm FX fix trade, lead–lag | 2–4 days |
| Rotation runs (one position in any of several instruments) | top-1 share rotation, dual momentum, BTC/ETH switch | ~1 week |
| Multi-leg portfolio runs | pairs, risk parity, return stacking | 2–3 weeks |
| Meta-allocator runs and correlation-aware broker allocation | the arena allocating to its own agents; a mirrored book that isn't just the most leveraged runs | ~1 week each |
| External signals channel; Kronos as a second forecaster; built-in session VWAP; longer daily history | news and macro overlays, touch-probability stops, regime models | days each |

## What not to build

- Standalone pre-holiday, Monday, OPEX-week and pre-FOMC agents: decayed, and our 2024–26 data shows nothing.
- The BTC 21:00–23:00 UTC effect: real out of sample, but the edge (about 6.6 bp) equals the spread.
- Dividend capture, post-earnings drift and earnings-month effects on our mega caps: gone since about 2004–2006, or smaller than one spread.
- Pairs on our list (gold/silver, oil/gas, US100/US500, ETH/BTC): they don't behave like pairs, and one leg pays funding.
- Textbook tactical allocation (GTAA, dual momentum, Keller's models) as published: it needs bonds, which we don't have.
- Overnight-only or intraday-only shares: shares cost 4–8 bp per trade (9–15 bp at night).
- Letting an LLM choose its own leverage: that is how Alpha Arena's models lost.

## Communities and sites worth knowing

The [Communities](topics/community.md) note has the full map. The ones most worth a bookmark:

- **Quantocracy**: a daily aggregator of about 100 quant blogs. The cheapest way to follow everything below.
- **Concretum Group** (Zarattini et al.): recent, cost-aware papers on intraday momentum, ORB, trend in
  stocks and crypto, and rebalance timing, often with code.
- **Allocate Smartly**: tracks 100+ published allocation strategies live. It is the best evidence on what
  happens when you choose among many strategies.
- **Rob Carver** (qoppac blog, pysystemtrade): costs ("speed limit"), forecast combination, position
  sizing, honest live experiments.
- **Robot Wealth**, **Alpha Architect**, **Flirting with Models** (Hoffstein): sober research writing on
  edges, trend following, timing luck and return stacking.
- **Quantpedia** (1,000+ academic strategies, about 70 free) and **Quantified Strategies** (hundreds of
  short rule tests; an idea list, not evidence).
- **GitHub:** freqtrade's guard tools (lookahead and recursive analysis), Jesse's significance test
  against random entries, NautilusTrader. The most-starred repos of 2024–26 are LLM trading frameworks
  with no live results.
- **Hacker News:** recurring "can individuals win?" and bot post-mortem threads, and the Alpha Arena
  discussion.
- **Free data nobody uses:** Capital.com's client sentiment endpoint (% of its clients long each market),
  and Kalshi macro markets, which beat the Bloomberg consensus on CPI and called every FOMC decision the
  day before since 2022.
- **Reddit:** r/LETFs has the best leverage material: public real-money tests and careful backtests of
  the 200-day filter. r/algotrading has post-mortems and random-baseline lessons. r/Forex is good on how
  high-leverage traders who last size their bets (1–2% per trade, about 8% across one theme).
  r/quant and r/quantfinance are career forums. See [Reddit](topics/reddit.md).

## For the second pass

- Read the Concretum papers in full and design the noise-area agent exactly; check our 5-minute tick volume
  is good enough for a VWAP.
- Find older daily history (before 2024) for regime models and slow strategies.
- Check whether Capital.com lists bond or Treasury CFDs (needed for risk parity and HFEA-style mixes).
- Confirm the dividend rules (withholding on share dividends; index dividend amounts) from Arena 01 as
  AAPL and MSFT go ex-dividend in November.
- Reddit topics not covered yet: r/Daytrading VWAP threads, r/CryptoCurrency strategy threads, r/thetagang statistics.

## The notes

- [Leverage](topics/leverage.md): Kelly, ergodicity, leveraged ETFs, volatility targeting, retail leverage evidence, ruin.
- [Trading at 1:1](topics/unlevered.md): the fee rule, dividends, mega-cap events, crypto seasonality, Shannon's demon.
- [Anomalies](topics/anomalies.md): calendar, session and flow effects, intraday momentum, decay and multiple testing.
- [AI and LLM trading](topics/ai-trading.md): live LLM arenas, LLM agents, foundation models, Kaggle lessons.
- [Portfolios and meta-strategies](topics/portfolio.md): cross-sectional momentum, pairs, risk parity, choosing among strategies.
- [Communities](topics/community.md): what practitioners run and where they talk.
- [Reddit](topics/reddit.md): threads from r/algotrading, r/LETFs, r/quant and others.
