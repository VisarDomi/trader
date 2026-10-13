# What practitioners and hobbyists actually run, and where they talk

_First pass 2026-10-13._

Scope: GitHub projects and strategy collections, Hacker News, practitioner blogs, newsletters and podcasts;
the ideas worth stealing and the platform features other projects have. Reddit threads: see the reddit
topic (`research/topics/reddit.md`); two r/algotrading threads read before the hand-over are kept here
because ideas below lean on them [community-29, community-30]. Overlaps with other topic notes are
marked (anomalies, leverage, portfolio, unlevered, ai-trading) instead of repeated.

## In short

- **What survives honest hobbyist testing is boring and has a named payer**: dip-buying index ETFs in an
  uptrend (IBS / RSI(2) / 3 down days, above the 200-day), month-end rebalancing flows, overnight holding,
  slow trend following, volatility targeting. In one 2026 test of 100+ retail ideas (~700 versions, costs,
  delisted stocks, random-entry controls) only those survived; chart patterns, SMC, opening-range breakouts,
  options flow and LLM-read news all died [community-29]. Confidence: medium (one tester, but careful method).
- **Costs decide more than signals.** Carver's rule: spend at most a third of the expected pre-cost Sharpe
  (≈0.13 SR a year) on costs; his own scalping bot went from SR 29 with ideal fills to −120 with realistic
  stop fills, and "didn't work" live [community-16]. An ML stock ranker lost 13.2%/yr → 2.4%/yr going from
  0 to 10 bp per side [community-29].
- **Selecting on past performance disappoints.** Quantopian's 888 algorithms: backtest Sharpe explained
  < 2.5% of out-of-sample Sharpe; more backtesting → bigger gap [community-17]. QuantConnect shut Alpha
  Streams v1 for "strong overfitting" [community-07]. Allocate Smartly: picking the recently best of 100+
  live-tracked strategies raised return (more risk) but never Sharpe [community-31]. This bears directly on
  the arena's "leader" label.
- **LLM traders have no good forward record.** The most-starred repos of 2024–2026 are LLM agent
  frameworks (TradingAgents 111k stars, ai-hedge-fund 64k) with no live results; the forward experiments
  that exist lost (Alpha Arena S1: 4 of 6 models −31% to −63% in 17 days at 4–8× exposure; ChatGPT
  micro-cap: −50% drawdown, profit factor 0.82) [community-25, community-14; details in ai-trading].
- **The tooling trend is significance testing against random entries** (Jesse's rule-significance test,
  qsx-strategy-score's random-timing test, Monte Carlo of trades) — the arena's monkeys, made per agent
  [community-03, community-15].
- **Two quick lab checks on our candles (2024-01 → 2026-09) agree in sign with community ideas**: low-IBS
  sessions on US500/US100/US30 were followed by +15–25 bp next day vs +5–10 bp average (t 1.5–2.4 with the
  200-day filter); BTC's Sunday 19:00 → Monday 19:00 New York window averaged +54 bp (t 2.2), the best of
  seven [community-44]. Small samples; not backtests.
- **Untapped data**: Capital.com publishes per-market client long/short percentages for free
  [community-43]; Kalshi macro markets beat Bloomberg consensus on headline CPI and called every FOMC
  decision the day before since 2022 [community-21]. Neither has history in our store yet.

## Findings

### A map of where practitioners talk

| Where | What it is | Why it is useful to us | Best entry points |
|---|---|---|---|
| freqtrade + strategies repo + NostalgiaForInfinity [community-01, community-02] | Largest open-source crypto bot (55k stars); 5,545-star strategy collection; NFI is the most-run community strategy | Guard tools (lookahead-analysis, recursive-analysis, protections), and blunt docs on why backtests lie | docs: strategy-101, backtesting "assumptions", lookahead-analysis, recursive-analysis, protections |
| Jesse [community-03] | Python crypto bot | Rule-significance test against bootstrapped random entries; Monte Carlo by trade shuffling and by candles | README "Rule Significance Testing", "Monte Carlo Analysis" |
| Hummingbot [community-04] | Market-making framework | "Position executor" with triple barrier: stop, take-profit, **time limit** | strategy_v2 executors |
| NautilusTrader [community-05] | Rust event-driven engine (30k stars) | Same deterministic code path for research and live — what our arena already does | HN 44810552 discussion |
| vectorbt, backtesting.py [community-06] | Vectorised parameter sweeps | Heatmaps and walk-forward splitting; useful to *show* a fixed parameter sits on a plateau, not to tune | vectorbt README "Robustness testing" |
| QuantConnect LEAN [community-07] | Open engine + cloud; strategy library (~80 strategies, many from Quantpedia); Alpha Streams marketplace 2018–2022 | "Reality models" (fees, fills, slippage, margin); the Alpha Streams shutdown post is a rare platform-level overfitting confession | forum 13441 "Alpha Streams Refactoring 2.0" |
| backtrader, Zipline [community-08] | The 2015–2020 generation; dormant | Zipline was Quantopian's engine; Quantopian's crowd data produced the best study of backtest-vs-live [community-17] | Wiecki et al. 2016 |
| awesome-quant, awesome-systematic-trading, awesome-ai-in-finance [community-09…11] | Curated lists | Fast way to find a library; awesome-systematic-trading adds 1,687 replicated paper strategies with Sharpe and t-stat | awesome-systematic-trading "What the replication record looks like" |
| Rob Carver: qoppac blog, pysystemtrade, TTU co-host [community-16] | Ex-AHL; five books; open futures system | Costs ("speed limit"), forecast combination, position sizing, honest live experiments | 2025-05 scalping-bot post; 2021-05 forecast-weights post |
| Hacker News [community-24…28] | Periodic "can individuals win?", "I built a bot", Alpha Arena, Polymarket threads | Experienced skeptics; post-mortems point at the same failure list | Ask HN 16922538 (2018); 27414677 (24.85% algo); 45976832 (Alpha Arena) |
| Reddit | r/algotrading, r/quant, r/LETFs … | Live-result threads and community canon | **see the reddit topic** |
| Allocate Smartly [community-31] | Tracks 90–100+ published tactical allocation strategies with backtests from 1973 and live tracking | Unique meta-research: what happens when you choose among many strategies | "Selecting TAA strategies…" series; "Wisdom of 100 strategies" |
| Concretum Group [community-32] | Zarattini et al.; papers on intraday momentum, ORB, trend on stocks/crypto, tranching; practitioner articles | Recent, cost-aware, often with code; a live "can humans beat a system?" lab | papers list; "Opportunity-set bias"; "10 lessons from production"; "Seasonality in Bitcoin intraday trend" |
| Robot Wealth [community-33] | Kris Longmore & Ben Lillie; retail quant education | The clearest writing on "an edge needs a why" and on LLM-driven data mining | "More of the disease, faster"; "To trend or not to trend (wrong question)" |
| Flirting with Models / Return Stacked [community-34, community-35] | Corey Hoffstein (Newfound; Return Stacked ETFs) | Rebalance timing luck, specification risk, return stacking | "15 ideas from 15 years"; "Rebalance timing luck" |
| Quantocracy [community-36] | Daily aggregator of ~100 quant blogs | The cheapest way to follow everything in this table | front page / daily e-mail |
| Quantpedia [community-37] | Database of 1,000+ academic strategies (~70 free), screener, blog | Paper finder with reported return/vol; free blog studies (e.g. Bitcoin overnight sessions) | screener; "How to profitably trade Bitcoin's overnight sessions" |
| Alpha Architect [community-38] | Wes Gray et al.; weekly academic research reviews | Trend-following and factor evidence with sober framing | "Avoiding the big drawdown with trend-following" |
| Quantified Strategies [community-39] | Hundreds of short backtests of simple rules (IBS, RSI, seasonals) | Exact rules to copy; in-sample, often without costs — idea list only | IBS, "classical mean reversion" posts |
| Ernie Chan [community-40] | QTS Capital, PredictNow; books *Quantitative Trading*, *Algorithmic Trading* | Mean reversion and regime-conditional parameters; now mostly ML/GenAI posts | blog 2025 posts; books |
| Kevin Davey [community-41] | Futures system trader, World Cup championship; *Building Winning Algorithmic Trading Systems* (2014) | Process: one-shot walk-forward, Monte Carlo of trades, **6–12 months incubation** before money | Algo Advantage podcast ep. 36 |
| Top Traders Unplugged "Systematic Investor" [community-42] | Weekly CTA/trend-following podcast (Niels Kaastrup-Larsen with Carver, Seibert, Dunne, Brennan, Baltas…) | Monthly read of how trend followers are doing; practitioners' war stories | 2026-09-12 "What happens when AI starts trading the markets" (Carver) |
| Kalshi / Polymarket data [community-21, community-23, community-26] | Prediction markets; Becker's 36 GiB public dataset; free order-book dumps | Macro expectations as features; behavioural evidence (longshot bias, takers pay makers) | Fed FEDS 2026-010; jbecker.dev microstructure |
| Capital.com client sentiment [community-43] | Broker API endpoint: % of clients long/short per market | Our own counterparties' positioning, free, no history | open-api.capital.com "Client Sentiment" |

Darwinex (third-party verified retail track records) and copy-trading persistence are covered in the
portfolio topic.

### GitHub: what the frameworks teach (ideas, not tools)

- **Backtests lie in known ways, and the mature projects ship detectors.** freqtrade's
  `lookahead-analysis` re-runs the backtest per signal on truncated data and flags any indicator or signal
  that changes; `recursive-analysis` computes indicators with different warm-up lengths, because EMA/RSI/ADX
  values depend on how much history seeded them and live runs see less history than backtests
  [community-01]. Its docs: "backtesting will **never** replace running a strategy in dry-run mode", and of
  public strategies: "Do not assume these results are achieveable or realistic."
- **Hyperopt is where the overfitting lives.** freqtrade's FAQ recommends "500-1000 epochs over and over
  until you hit at least 10000 epochs", with a loss function chosen by the user; the hyperopt doc limits
  decimals to 3 places because "every value more precise than this will usually result in overfitted
  results" [community-01]. The community strategy repo itself says its strategies "should serve as a
  starting point ... not as 'ready to use'", and "results will heavily depend on the pairs, timeframe and
  timerange" [community-02]. strat.ninja, the site that ranked freqtrade strategies and flagged lookahead
  bias, is now a parked domain. Which community strategies "hold up"? None has a public, audited live
  record that I could find; NostalgiaForInfinity survives by constant updating (an auto-updater checks
  GitHub daily), which is the opposite of fixed parameters.
- **Protections** (freqtrade): stop trading after N stop-losses in a window, pause after a drawdown, lock
  a pair with poor recent profit, cooldown after an exit [community-01].
- **Random-entry significance tests** (Jesse): "compares the rule against a bootstrap distribution of
  random entries on the same market history"; Monte Carlo "with trade-order shuffling and candles-based
  simulations to distinguish skill from luck" [community-03]. qsx-strategy-score (981 stars, 2026) packages
  the same: buy-and-hold comparison, random-timing test, Monte Carlo stress, "too good to be true" checks
  [community-15].
- **Triple barrier** (Hummingbot): every position has a stop, a target and a time limit [community-04].
- **Reality models** (LEAN): pluggable fee, fill, slippage, margin and settlement models; dividends
  matter for shares (our engine does not model them yet — see unlevered topic) [community-07].
- **The graveyard**: Gekko (10k stars, archived 2020), Zenbot (8k, archived 2022), Catalyst (archived 2022).
  Bots outlive their strategies; frameworks that survive are the ones that became infrastructure.
- **awesome-systematic-trading's replication record**: 4,843 papers coded; "median replication returns a
  Sharpe ratio of 0.37, and 48% clear a t-statistic of 1.96"; "A strategy needs roughly (1.96 / Sharpe)²
  years to prove itself, so a Sharpe of 0.4 needs about 24 of them"; median beta +0.17 to the S&P 500
  [community-10]. It also claims "no measurable decay after publication", which contradicts McLean &
  Pontiff (see anomalies). Its tables look auto-generated (a Bitcoin strategy "tested" over 23 years), so
  treat the numbers as low confidence; the (1.96/SR)² rule is the useful part.

### GitHub 2024–2026: the star chart is LLM agents without forward records

Top repos created since 2024 by stars [community-12…15; full table in `files/community/github-trading-repos-2026.md`]:
TradingAgents (111k; multi-agent "trading firm"; now with point-in-time data and a memory log that scores
past decisions), daily_stock_analysis (66k), ai-hedge-fund (64k; "educational purposes only … not
intended for real trading"), Vibe-Trading (35k), LLM-Trading-Lab (7.5k; ChatGPT ran $100 real money in
micro-caps, 2025-06 → 2025-12: max drawdown −50.3%, profit factor 0.82, "re-entry occurring despite
unfavorable prior outcomes" [community-14]), nof0 (open copy of Alpha Arena), Polymarket bots and
datasets. Almost none publish forward results. Robot Wealth's verdict on LLM-built strategies: "it
identified the disease, and then prescribed more of the disease. Faster." [community-33]. More in the
ai-trading topic.

### Hacker News: the recurring post-mortems

- "Ask HN: Anyone making money through algorithmic trading?" (2018, 389 points) [community-24]. Top
  comment: ask enough people about 100 coin flips and some truthfully report 60 heads. One commenter
  lost ~$100k: "algo trading is mostly psychological ... I didn't trust the algorithm, and would cut the
  trades short". Others: compare with buy-and-hold, especially with leverage in a bull run; "once you
  factor in the trading fees, slippage and the spread, you will almost always lose money"; prefer holding
  periods of hours or more.
- "I discovered a trading algorithm that returns ~24.85% annually" (2021) [community-27]: summed daily
  returns instead of compounding, no costs, no reason for the edge; "a commonly used signal that appears to
  print money all the time, until you take transaction costs into account."
- Philosophical Economics, "Financial Backtesting: A Cautionary Tale" [community-28]: buy after an up day,
  cash after a down day made ~18%/yr on US stocks 1928–1999 *after* 0.10% slippage, then lost 71% after
  1999. "The pattern that the strategy had been exploiting was significantly more fragile than
  anticipated." Relevant to any agent that relies on daily index autocorrelation.
- Alpha Arena threads [community-25]: "all six are overbetting and would be ruined in the long run";
  models misread newest→oldest data; "highly sensitive to seemingly trivial prompt changes"; and for a 2024
  three-LLM dashboard, "They should have added a pure random bot as a control. Or a monkey."
- Polymarket "Nothing Ever Happens" (always buy NO; 471 points, 2026) [community-26]: a meme with no
  returns, but the thread explains why it is not crazy (exciting outcomes are overpriced) and why public
  edges die ("if all of HN and Github start downloading and use my code it WILL cease to work").
- Renaissance/Medallion threads add little beyond "those who know don't talk"; Kelly threads are covered
  in the leverage topic.

### Blogs: the findings most relevant to us

- **Allocate Smartly** [community-31]: (1) ranking 100+ strategies by trailing return and holding the top
  Y beat the average strategy on return but not on Sharpe or Ulcer index; top 1–2 was "terrible" for
  drawdowns; "recent performance shouldn't be a factor in strategy selection". (2) Switching strategies
  on/off by their own equity-curve trend cut drawdowns but "all combinations still failed to outperform
  the average strategy" on Sharpe. (3) Buying "distressed" strategies: "limited evidence". (4) Trading
  monthly strategies weekly or daily was worse even before costs; "If a strategy was built to trade monthly
  it should be traded monthly"; tranching is reasonable. (5) The average allocation of all 100+ strategies,
  traded monthly with 0.1% friction and next-day execution, 2000–08/2026: 9.2%/yr, Sharpe 1.06, max DD
  −10.6% (SPY 8.3%, 0.42, −50.8%).
- **Concretum** [community-32]: intraday SPY momentum on a "noise area" (19.6%/yr, Sharpe 1.33 net,
  2007–2024 — authors' numbers; an independent TradingView replication was weaker); trend following on
  stocks (66,000 trades 1950–2024, < 7% of trades make the profit); crypto Donchian *ensembles*; "The
  Tranching Dilemma" (best vs worst rebalance day ≈ 350 bp/yr in US momentum 1991–2024); Bitcoin's
  "Monday Asia open effect" (Sunday ~19:00 New York into Monday, stronger since mid-2020, gross);
  "opportunity-set bias" (RSI(2) on S&P stocks: +45 bp/trade on paper, but 3.1% of days hold half the
  trades, so a capacity-limited trader cannot get the average); "10 lessons from production" (stale data
  that looks healthy, DST, reconcile with the broker, "Paper trading will not catch every production
  issue"). Intraday momentum and ORB details are in the anomalies topic.
- **Robot Wealth** [community-33]: "An edge requires a why"; "who's losing money on the other side of
  this trade, and why will they keep doing it?"; named payers: forced sellers (margin calls), leveraged-token
  rebalancing at fixed times, 60/40 month-end rebalancing. Trend is "harder to justify" and traded "with
  less conviction".
- **Rob Carver** [community-16]: the speed limit (≤ 1/3 of pre-cost SR, ≈0.13 SR units a year; rules above
  it get zero weight); the scalping experiment (above).
- **Flirting with Models** [community-34]: "diversify all uncompensated bets with extreme prejudice" —
  across *what*, *how* (parameters) and *when* (rebalance timing); "a backtest is just a single draw";
  "Ultimately, timing is a very low breadth exercise." Return Stacked [community-35] turns this into ETFs
  that hold 100% stocks/bonds plus ~100% managed futures via leverage (covered in leverage/portfolio).
- **Quantpedia** [community-37]: free blog study on BTC sessions (hourly Gemini data 2015-10 → 2024-10;
  out-of-sample from 2021-10 the "BTC at a 10-day high" overnight version "still has over 35% performance
  with a minimal -12% maximal drawdown"; costs not stated). The 21:00–23:00 UTC version is checked in the
  anomalies topic (t ≈ 2 on our data).
- **Alpha Architect** [community-38]: trend following as drawdown control, "nothing works ALL the time";
  2025 note on one of trend following's worst drawdowns (April 2025 tariff shock) and the recovery.
- **Quantified Strategies** [community-39]: exact IBS rules (buy close IBS < 0.2 or < 0.25 with RSI(21) <
  45, sell on IBS > 0.8 or first up close) — in-sample, mostly no costs.
- **Ernie Chan** [community-40]: recent posts are ML/GenAI (feature selection, transformers, "Have LLMs
  improved over the last year?"); his QTS uses 100+ features to switch between a tail-hedge strategy and
  E-mini futures and warns that using all features "can result in overfitting".
- **Kevin Davey** [community-41]: a one-shot walk-forward ("once defined, the strategy is evaluated
  without adjustments"), Monte Carlo of trade order for drawdown expectations, then 6–12 months of
  incubation without money; ~200 strategies in a library, ~20 live, swapped monthly. The arena *is* an
  incubator; what it lacks is Davey's pre-declared expectations to compare against.
- **TTU Systematic Investor** [community-42]: weekly; useful for the monthly CTA scoreboard and for
  episodes with Carver (2026-09-12 on AI trading), Andrew Beer (trend replication, 2026-10-10), Nick Baltas.

### Ideas the community converges on (evidence)

1. **IBS / close-near-the-low dip buying on equity indices.** Pagonidis (2013): ETF data to 2012, IBS <
   0.2 followed by +38 bp next day on average, IBS > 0.8 by −14 bp; "over 30% p.a. before transaction
   costs"; stronger in high volatility, bear markets, after high-range days and early in the week
   [community-18]. Pandey & Joshi (2023) confirm on country ETFs [community-19]. Rediscovered on
   r/algotrading in 2024 and 2026, and one of three survivors of the 100-strategy test (with a 200-day
   filter: SPY 1993–2026, 804 trades, ~70% winners, ~+0.25%/trade, beat 78 of 100 random-entry runs, 84%
   of the edge overnight) [community-29, community-30]. Weak points: does not beat buy-and-hold on return;
   buys falling knives without the trend filter (one re-test found a 925-day hold in 2008–2011). Our
   check: indices yes in sign, single shares no [community-44].
2. **Month-end rebalancing flows.** Harvey, Mazzoleni & Melone: when stocks are overweight, rebalancers
   sell, "leading to a decrease in equity returns of 17 basis points over the next day"; a front-running
   strategy had Sharpe > 1 over 1997–2023 [community-22]. Community version (SPY vs TLT month-to-date,
   ±2 pp, 4 days before month end): 2002–2026, 202 trades, 66% winners, ~+0.86%/trade [community-29].
   Robot Wealth names the payer [community-33]. Already proposed in anomalies as `month-end-rebalance`.
3. **Overnight vs intraday.** "84% of my dip-buying edge ... happened between the close and the next
   open"; SPY 10:30→close lost ~3.9%/yr in 2023–2026 while SPY rose ~22%/yr [community-29]. Covered in
   anomalies (overnight drift has been fading); our `overnight-drift` agent exists.
4. **Trend following, as ensembles.** Concretum's crypto Donchian ensemble and stock-trend papers,
   Hoffstein's specification risk, Carver's blended EWMAC rules: average several lookbacks instead of
   choosing one [community-32, community-34, community-16]. The arena runs single lookbacks (turtle-20/55,
   ema crosses, tsmom 5/20 days).
5. **Crypto session seasonality.** Concretum's Monday Asia open effect; Quantpedia's overnight/weekend
   BTC; our check: Sun 19:00 → Mon 19:00 NY +54 bp on BTC (t 2.2) and +56 bp on ETH (t 1.6), 2024–2026
   [community-32, community-37, community-44].
6. **Trend-filtered leverage** (r/LETFs canon; "Leverage for the Long Run"): see leverage topic
   (`lrs-sma200`). Community refinements: a hysteresis band (enter at 1.04 × SMA200, exit at 0.97 ×)
   against whipsaw. Our CFD funding (≈8%/yr of notional on index longs) makes 2–3× exposure roughly twice
   as expensive as a leveraged ETF.

### Costs, overfitting and selection: what the crowd-sourced platforms learned

- Quantopian (888 algorithms, ≥ 6 months live): Sharpe R² < 0.025; volatility, max drawdown and hedging
  *were* predictive; "the more backtesting a quant has done for a strategy, the larger the discrepancy";
  an ML model on backtest features beat picking the top backtest Sharpe [community-17].
- QuantConnect Alpha Streams v1 (2018–2022): "seeks strategies that perform well in all market
  regimes ... results in strong overfitting"; better: "small factors which apply sometimes" swapped as
  regimes change; asset information "always led to selection bias" [community-07].
- Allocate Smartly: recent-performance selection and equity-curve switching do not raise Sharpe
  [community-31].
- r/algotrading test: setups judged by win rate are fooled by stop/target placement — "random entries
  with the same stop and target got the same win rate" [community-29].
- Carver: costs ≤ 1/3 of gross SR; takers with stop orders filled at the next price cannot scalp
  [community-16]. Max Dama's free primer covers the same ground for HFT-adjacent ideas [community-20].

### Prediction markets as data

Becker's Kalshi study (72.1 million trades, $18.26 billion, 2021-06 → 2025-11): "Contracts trading at 5
cents win only 4.18% of the time"; takers −1.12% vs makers +1.12% average excess return; NO beats YES at
69 of 99 price levels [community-23]. The Fed paper: Kalshi's median/mode "have a perfect forecast record on
the day before the FOMC meeting", and beat Bloomberg consensus on headline CPI (not core CPI or
unemployment) [community-21]. For us these are features, not markets: shifts in rate-cut or CPI
probabilities could condition GOLD, EURUSD and US500 agents around releases. Forecast accuracy does not
by itself give a tradeable edge (the price already embeds expectations); the surprise vs the Kalshi
distribution is the candidate signal. Needs stored history first.

### Retail positioning: our broker's own crowd

Capital.com's API returns `longPositionPercentage` per market (example: SILVER 91.85% long) [community-43].
Brokers market it as contrarian at ≥ 60–70% one-sided; independent evidence is thin and partly negative.
The mechanism is real (retail cuts winners and holds losers: FXCM's 43-million-trade study, 62% winning
trades but EURUSD losers −127 pips vs winners +65), so it is worth recording now and testing later.

### Recurring lessons from people who ran bots live

1. **Costs and slippage** are the most common cause of death: sub-hour strategies rarely survive spread
   plus slippage; limit orders do not rescue them ("~20% of limit orders never filled, and the ones that
   didn't fill went on to make +1.95% on average") [community-29, community-16, community-24].
2. **Overfitting and selection**: the more variants tried, the bigger the live gap; count the tries and
   deflate (one hobbyist's best result had a deflated-Sharpe probability of 0.086 against ~320 tries)
   [community-17, community-29].
3. **Regime change**: daily index momentum flipped after 1999 [community-28]; Alpha Streams wanted
   all-regime strategies and got overfit ones [community-07]; a gold trend follower made all its profit in
   trending years (r/algotrading comment, PF 1.07 over 2015–2026).
4. **Position sizing and leverage**: the losers in Alpha Arena and the ChatGPT micro-cap run overbet and
   concentrated; "Returns will be great until the strategy blows up" [community-25, community-14,
   community-27]. Stops do not protect against gaps (small caps: worst trades −59% to −91% despite stops)
   [community-29].
5. **Short live windows mislead**: one live system's Sharpe was ~6 after 45 days and ~1.2 by year end
   (r/algotrading, 2026-01); our 28-day / 30-trade gate is a minimum, not proof.
6. **Psychology** (cutting winners, overriding the system) ruins many hobby bots; the arena removes it,
   which is one of its real advantages [community-24].
7. **Infrastructure fails quietly**: stale feeds, DST, conflicting orders on one account, missed fills
   after restarts [community-32, community-25].
8. **What lasted for years**: dip-buying index ETFs in uptrends (one r/algotrading commenter: it was his
   first firm's biggest strategy eight years ago, "I guarantee they're still running it"), long-horizon trend following (CTAs), vol targeting,
   month-end and overnight effects (weakening), and — for most — buy and hold. Track records that are
   *verified* are rare: Allocate Smartly's live tracking and Darwinex (portfolio topic) are exceptions.

## For the arena

### The 10 community ideas most worth trying (ranked)

Parameters are fixed up front from the sources; one instrument and one position per run unless noted.
Spread figures are the median of our 1-minute data [community-44].

1. **`ibs-dip`: IBS dip-buy on the US cash session, above the 200-day** — feasible now.
   - US500, US100, US30; 30m bars; session = 09:30–16:00 New York via `localTime`; tier 1:2, `exposure: 1`.
   - At the bar closing 16:00 NY: IBS = (close − session low) ÷ (session high − session low); SMA200 =
     mean of the last 200 session closes (kept in `ctx.state`).
   - Variant `pagonidis`: buy if IBS < 0.2 and close > SMA200; sell at the next 16:00 close.
   - Variant `composite` (100-strategy survivor): buy if close > SMA200 and (IBS < 0.2 or RSI(2) of
     session closes < 10 or three lower session closes in a row); sell at a 16:00 close above the 5-session
     SMA or after 10 sessions; stop 8% below entry; after a stop, wait for a close above the 5-session SMA.
   - Why: decades of evidence, a payer (end-of-day liquidity demand; overnight drift), survival against
     random entries; our data agree in sign. Costs: spread < 1 bp; funding ≈2.2 bp a night long.
     Expect ≈30–40 trades a year per run. Not for single shares (no effect in our data, spreads 3.5–7.6 bp).
2. **`crypto-sunday-asia`: long BTC and ETH from Sunday 19:00 to Monday 19:00 New York** — feasible now.
   - BTCUSD, ETHUSD; 1h bars; tier 1:1 (no funding), `exposure: 0.9`; buy at the bar closing Sunday 19:00
     NY, close at the bar closing Monday 19:00 NY. 52 trades a year per run.
   - Why: Concretum's "Monday Asia open effect" (gross, 2018–2025) and our check (+54 bp BTC, t 2.2;
     +56 bp ETH, t 1.6). Cost ≈7–9 bp per round trip. Risks: overlapping samples, best-of-seven window.
3. **`donchian-ensemble`: averaged turtle-style breakouts with volatility targeting** — feasible now
   (costly resizing; see platform change 6 below).
   - BTCUSD, ETHUSD at 1:1 (fee-free long-only); optionally the 8 shares at 1:1 (Concretum's stock-trend
     paper). 1d bars.
   - Five sub-systems (entry n-day high / exit m-day low): (10,5), (20,10), (55,20), (100,50), (200,100);
     signal = fraction of sub-systems long (0, 0.2 … 1).
   - Exposure = signal × min(0.9, 0.25 ÷ σ60), σ60 = annualised 60-day volatility of daily returns;
     re-size only when the target changes by ≥ 0.2 (buffer), since resizing means close and reopen.
   - Why: specification risk is diversified (Hoffstein, Carver), crypto trend is the community's most
     persistent trend evidence (Concretum 2025). Different from existing single-lookback agents.
4. **`month-end-rebalance` with a bond yardstick** — proxy feasible now (anomalies topic); full version
   needs a reference bond series.
   - US500, US100; 1d or 30m bars. Four trading days before month end: compare the index's month-to-date
     return with a bond yardstick (TLT or a 10-year Treasury total-return proxy). Index behind by ≥ 2 pp:
     long to the last close of the month. Index ahead by ≥ 2 pp: long from the last close of the month to
     the close of the 3rd trading day. Otherwise flat.
   - Why: Harvey–Mazzoleni–Melone (−17 bp next day when stocks are overweight; front-running Sharpe > 1,
     1997–2023) and the community rule (66% winners, +0.86%/trade, 2002–2026). ≈8 trades a year: needs
     pooled judging.
5. **`lrs-band`: 200-day trend filter with leverage and a hysteresis band** — feasible now; a variant of
   the leverage topic's `lrs-sma200`.
   - US500, US100; 1d bars; long `exposure: 2` (tier 1:3) and `exposure: 3` (tier 1:5) when the close
     rises above 1.04 × SMA200; flat when it falls below 0.97 × SMA200.
   - Why: the r/LETFs canon, adapted to CFDs. Funding is ≈16–24% a year of equity at 2–3× while long, so
     this tests whether the trend filter's drawdown cut survives our broker's financing.
6. **`noise-area`: Concretum intraday momentum** — feasible now; overlaps the anomalies topic.
   - US500, US100; 30m bars; `intradayOnly: true`. Bands: upper = max(09:30 open, previous 16:00 close) ×
     (1 + σ), lower = min(…) × (1 − σ), where σ = mean over the last 14 sessions of |price at this time of
     day ÷ that session's 09:30 open − 1|. At each 30m close from 10:00 to 15:30 NY: long above the upper
     band, short below the lower band; exit when the close is back inside the band; flat by 15:55.
     `exposure: 1`.
   - Why: the strongest recent intraday claim (net Sharpe 1.33, 2007–2024), different from the rejected
     Gao rule. Doubts: weaker independent replication, VWAP stop not available, ORB died in the
     100-strategy test. About one round trip a day ≈ 2%/yr of spread: within Carver's limit only if the
     gross Sharpe is above ≈0.5.
7. **Timing-luck tranches of monthly agents** — feasible now (variants only).
   - Run `vol-target` (and any new monthly agent, e.g. the anomalies/portfolio `tsmom-12m`) as 4 copies
     rebalancing on trading days 1, 6, 11 and 16 of the month. Judge the average; report the spread
     between copies as the agent's timing luck.
   - Why: Hoffstein; Concretum's 350 bp/yr best-vs-worst day; Allocate Smartly recommends tranching.
8. **`sentiment-fade`: trade against Capital.com's crowd** — needs a platform change (record and expose
   client sentiment).
   - All 20 epics; at 21:00 UTC daily: if ≥ 70% of clients are long and close < SMA20, sell; if ≤ 30% are
     long and close > SMA20, buy; exit when the long share crosses 50% or after 10 days; stop 2 × ATR(14).
   - Why: our own counterparties; free data; mechanism documented, evidence thin. Record for ≥ 6 months
     before building.
9. **`equity-lead-fx`: overnight US500 move → laggard USD pairs** — needs read-only access to another
   instrument's bars (portfolio topic P2).
   - AUDUSD, EURUSD, GBPUSD; at 07:00 UTC: if US500's 21:00→07:00 UTC return exceeds +1σ (60-day σ of that
     window) and AUDUSD has moved < 0.25σ in the same window, buy AUDUSD; mirror for a fall; hold 4 hours.
   - Why: a stated mechanism ("information hits one market before another", slower FX books catch up),
     but the source is a single AI-assisted Reddit post; low confidence. Test first with a descriptive check.
10. **`macro-odds` filter from Kalshi** — needs an external data feed.
    - Record Kalshi FOMC and CPI market distributions daily. First study: does the release-day surprise
      relative to the Kalshi median predict GOLD/EURUSD/US500 moves over the next 1–24 hours beyond the
      surprise vs consensus? Build an agent only if yes.
    - Why: the Fed paper shows Kalshi is the best real-time expectation we can get for free.

Not recommended from the community canon: SMC/order blocks, chart-pattern breakouts, candlestick
patterns, MA crosses on single stocks, options-flow following, LLM news reading for speed, martingale/grid
(all failed against random entries or are covered as controls in the leverage topic).

### Platform features other projects have that we should copy

1. **Matched monkeys**: for each agent, 100 random-entry twins in the lab with the same instrument, side
   mix, stop, target and holding-time distribution; report the agent's percentile (Jesse, qsx, the
   100-strategy test). Cheap; it answers "is the edge in the entry or in the stop/target?".
2. **Monte Carlo of trades**: bootstrap the trade list (backtest and live) for the distribution of max
   drawdown and time under water; use its 95th percentile to choose the leverage tier and to flag a live
   agent as broken when it is exceeded (Davey, Jesse, qsx).
3. **Paper-vs-demo slippage per agent**: mean and p90 of (demo fill − paper fill) in bp and as a share of
   the agent's mean gross trade; keep rejected and missed orders as signals (freqtrade's backtest-vs-dry-run
   check; Concretum; the "unfilled orders were the winners" lesson).
4. **Cost speed limit in `check-agent`**: from the backtest, annual spread + funding cost in Sharpe units;
   warn above 0.13 or above one third of the gross Sharpe (Carver). Would have caught `intraday-momentum`
   before it was coded.
5. **Pre-registered expectations and a tries counter**: each agent file declares expected trades per year,
   expected mean per trade and its kill rule; the journal counts every idea and variant ever tried, and
   leaders report a deflated Sharpe (Davey; Bailey & López de Prado in anomalies; the hobbyist DSR example).
6. **`ctx.resize({ exposure })` / partial close**: needed for ensembles and vol targeting without paying a
   full round trip (also in the unlevered topic).
7. **Lookahead and warm-up checks**: rerun with data truncated at each signal; compute indicators with 500
   vs 5,000 warm-up bars and report differences (freqtrade lookahead-analysis and recursive-analysis).
8. **Protections and time limits as SDK options**: `cooldownBars`, pause after N stop-losses, max-drawdown
   pause, and a `timeLimitBars` exit (freqtrade, Hummingbot). Off by default: Allocate Smartly found
   equity-curve switching does not raise Sharpe; use them as risk controls at 1:50–1:200.
9. **Tranching support**: run a monthly agent as N staggered copies and show the average (Hoffstein,
   Concretum).
10. **Reference data and read-only other instruments**: bond yardstick, VIX, Kalshi odds, client sentiment,
    other epics' bars (LEAN, Nautilus, vectorbt all have it; portfolio topic P2).
11. **Parameter-plateau report**: a small heatmap of the backtest around the fixed parameters (±25%), shown
    on the dashboard, never used to pick them (vectorbt, backtesting.py).
12. **Entry-reason × exit-reason table** per agent (freqtrade backtesting-analysis); the SDK already logs
    reasons.
13. **Consensus read-out**: the net long/short of all live agents per instrument as a signal (Allocate
    Smartly's "wisdom of 100"; see portfolio topic "crowd positioning").

## Open questions

- Reddit: live-result threads, r/LETFs live tests, r/quant and r/BitcoinMarkets — see the reddit topic.
- Does the IBS effect hold on Capital.com CFDs out of US cash hours (the CFD keeps trading to 17:00 NY), and
  does entering at 15:30 instead of 16:00 change it?
- Concretum's "Catching Crypto Trends" exact rules (lookbacks, trailing stop, vol target) — SSRN blocks
  download; get the PDF by hand and fix the `donchian-ensemble` parameters to the paper's before building.
- Is there a bond CFD or ETF price we can store daily as the month-end yardstick?
- Capital.com sentiment: how often does it update, and is the demo value the same as live?
- Which freqtrade community strategies have audited live records (if any)? strat.ninja is gone; check
  freqtrade Discord archives and NFI's issue tracker.
- TTU/Carver 2026-09-12 episode on AI trading: worth a transcript pass.
- Quantpedia's ~70 free strategies: list them and map each to our instruments (needs a logged-in browser).

## Sources

| id | title | authors / site | year | kind | link | local copy |
|---|---|---|---|---|---|---|
| community-01 | freqtrade: docs (strategy-101, backtesting, hyperopt, lookahead-analysis, recursive-analysis, protections) | freqtrade | 2026 | repo | https://github.com/freqtrade/freqtrade | files/community/freqtrade-docs-backtest-pitfalls.md |
| community-02 | freqtrade-strategies and NostalgiaForInfinity | freqtrade; iterativv | 2026 | repo | https://github.com/freqtrade/freqtrade-strategies | files/community/freqtrade-docs-backtest-pitfalls.md |
| community-03 | Jesse: rule significance testing and Monte Carlo analysis | jesse-ai | 2026 | repo | https://github.com/jesse-ai/jesse | files/community/github-trading-repos-2026.md |
| community-04 | Hummingbot (strategy_v2 position executor, triple barrier) | hummingbot | 2026 | repo | https://github.com/hummingbot/hummingbot | files/community/github-trading-repos-2026.md |
| community-05 | NautilusTrader | Nautech Systems | 2026 | repo | https://github.com/nautechsystems/nautilus_trader | files/community/github-trading-repos-2026.md |
| community-06 | vectorbt | polakowo | 2026 | repo | https://github.com/polakowo/vectorbt | files/community/github-trading-repos-2026.md |
| community-07 | Alpha Streams Refactoring 2.0 (and LEAN engine) | Jared Broad / QuantConnect | 2022 | doc | https://www.quantconnect.com/forum/discussion/13441/alpha-streams-refactoring-2-0/ | files/community/quantconnect-alpha-streams-shutdown.md |
| community-08 | backtrader and Zipline | mementum; Quantopian | 2024 | repo | https://github.com/quantopian/zipline | files/community/github-trading-repos-2026.md |
| community-09 | awesome-quant | wilsonfreitas | 2026 | repo | https://github.com/wilsonfreitas/awesome-quant | — |
| community-10 | awesome-systematic-trading (replication record) | paperswithbacktest | 2026 | repo | https://github.com/paperswithbacktest/awesome-systematic-trading | — |
| community-11 | awesome-ai-in-finance | georgezouq | 2026 | repo | https://github.com/georgezouq/awesome-ai-in-finance | — |
| community-12 | TradingAgents: multi-agent LLM financial trading framework | Tauric Research (Xiao et al.) | 2026 | repo | https://github.com/TauricResearch/TradingAgents | files/ai-trading/xiao-2024-tradingagents.pdf |
| community-13 | ai-hedge-fund | virattt | 2026 | repo | https://github.com/virattt/ai-hedge-fund | files/community/github-trading-repos-2026.md |
| community-14 | Evaluating ChatGPT as a Portfolio Decision-Maker in Micro-Cap Equities (LLM-Trading-Lab) | Nathan Smith | 2026 | repo | https://github.com/LuckyOne7777/LLM-Trading-Lab | files/community/github-llm-trading-lab-chatgpt-microcap.md |
| community-15 | QSX Strategy Score | jianweiweng05 | 2026 | repo | https://github.com/jianweiweng05/qsx-strategy-score | files/community/github-trading-repos-2026.md |
| community-16 | Can I build a scalping bot? / the cost speed limit | Rob Carver (qoppac blog) | 2025 | blog | https://qoppac.blogspot.com/2025/05/can-i-build-scalping-bot-blogpost-with.html | files/community/qoppac-scalping-bot-and-speed-limit.md |
| community-17 | All that glitters is not gold: backtest vs out-of-sample on 888 algorithms | Wiecki, Campbell, Lent, Stauth (Quantopian) | 2016 | paper | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2745220 | files/community/wiecki-2016-all-that-glitters-backtest-vs-oos.pdf |
| community-18 | The IBS Effect: Mean Reversion in Equity ETFs | Pagonidis (QUSMA) | 2013 | paper | http://qusma.com/wp-content/uploads/2013/09/The-IBS-Effect-Mean-Reversion-in-Equity-ETFs.pdf | files/community/pagonidis-2013-ibs-effect-equity-etfs.pdf |
| community-19 | Using Internal Bar Strength as a Key Indicator for Trading Country ETFs | Pandey & Joshi (NYU) | 2023 | paper | https://arxiv.org/abs/2306.12434 | files/community/pandey-2023-ibs-country-etfs.pdf |
| community-20 | Max Dama on Automated Trading | Max Dama | 2011 | book | http://isomorphisms.sdf.org/maxdama.pdf | files/community/dama-2011-on-automated-trading.pdf |
| community-21 | Kalshi and the Rise of Macro Markets (FEDS 2026-010) | Diercks, Katz, Wright | 2026 | paper | https://www.federalreserve.gov/econres/feds/files/2026010pap.pdf | files/community/diercks-2026-kalshi-rise-of-macro-markets.pdf |
| community-22 | The Unintended Consequences of Rebalancing | Harvey, Mazzoleni, Melone | 2026 | paper | https://www.nber.org/papers/w33554 | files/anomalies/harvey-2026-unintended-consequences-rebalancing.pdf |
| community-23 | Prediction market microstructure (Kalshi) and prediction-market-analysis dataset | Jon Becker | 2025 | blog | https://www.jbecker.dev/research/prediction-market-microstructure | files/community/prediction-markets-as-data.md |
| community-24 | Ask HN: Anyone making money through algorithmic trading? | Hacker News | 2018 | thread | https://news.ycombinator.com/item?id=16922538 | files/community/hn-ask-anyone-making-money-algo-trading.md |
| community-25 | Exploring the limits of LLMs as quant traders (Alpha Arena) + "Why Alpha Arena was a bad benchmark" | Nof1; HN; borisagain | 2025 | thread | https://news.ycombinator.com/item?id=45976832 | files/community/hn-alpha-arena-llm-traders.md |
| community-26 | Nothing Ever Happens: Polymarket bot that always buys No | sterlingcrispin; HN | 2026 | thread | https://news.ycombinator.com/item?id=47753472 | files/community/prediction-markets-as-data.md |
| community-27 | Show HN: I discovered a trading algorithm that returns ~24.85% annually | Hacker News | 2021 | thread | https://news.ycombinator.com/item?id=27414677 | files/community/hn-backtest-postmortems.md |
| community-28 | Financial Backtesting: A Cautionary Tale | Philosophical Economics | 2015 | blog | http://www.philosophicaleconomics.com/2015/12/backtesting/ | files/community/hn-backtest-postmortems.md |
| community-29 | I backtested 100+ retail trading strategies (~700 versions) … here is what survived | u/tanweer919, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1x2owmo/ | files/community/reddit-algotrading-100-strategies-what-survived.md |
| community-30 | Buy-the-dip / IBS mean reversion threads | u/Russ_CW, u/vaanam-dev, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1rjvxjy/ | files/community/reddit-algotrading-ibs-dip-buying.md |
| community-31 | Selecting TAA strategies on recent performance; Surfing the equity curve; Wisdom of 100 strategies | Allocate Smartly | 2026 | blog | https://allocatesmartly.com/selecting-taa-strategies-based-on-recent-performance-part-1/ | files/community/allocatesmartly-strategy-selection-lessons.md |
| community-32 | Papers and articles (intraday momentum, crypto trends, tranching, opportunity-set bias, production lessons, Bitcoin seasonality) | Concretum Group (Zarattini et al.) | 2026 | blog | https://concretumgroup.com/papers/ | files/community/concretum-research-and-lessons.md |
| community-33 | More of the Disease, Faster; To Trend or Not To Trend; Brave New Backtest | Kris Longmore (Robot Wealth) | 2026 | blog | https://robotwealth.com/more-of-the-disease-faster-what-happens-when-you-ask-an-llm-to-find-you-an-edge/ | files/community/robotwealth-edge-needs-a-why.md |
| community-34 | 15 Ideas, Frameworks, and Lessons from 15 Years | Corey Hoffstein (Flirting with Models) | 2023 | blog | https://blog.thinknewfound.com/2023/08/15-ideas-frameworks-and-lessons-from-15-years/ | files/community/thinknewfound-15-lessons.md |
| community-35 | Return Stacked research and primer | Return Stacked (Hoffstein, Gordillo) | 2026 | blog | https://www.returnstacked.com/ | — |
| community-36 | Quantocracy quant blog mashup | Quantocracy | 2026 | blog | https://quantocracy.com/ | — |
| community-37 | How To Profitably Trade Bitcoin's Overnight Sessions? (and the strategy screener) | Quantpedia | 2024 | blog | https://quantpedia.com/how-to-profitably-trade-bitcoins-overnight-sessions/ | files/anomalies/quantpedia-bitcoin-seasonality.md |
| community-38 | Avoiding the Big Drawdown with Trend-Following Investment Strategies | Gray & Vogel (Alpha Architect) | 2015 | blog | https://alphaarchitect.com/avoiding-the-big-drawdown-with-trend-following-investment-strategies/ | — |
| community-39 | The Internal Bar Strength (IBS) indicator; Classical mean reversion strategy | Quantified Strategies | 2024 | blog | https://quantifiedstrategies.substack.com/p/the-internal-bar-strength-ibs-indicator | — |
| community-40 | Quantitative Trading blog | Ernest P. Chan | 2025 | blog | https://epchan.blogspot.com/ | — |
| community-41 | Kevin Davey: It's All About Process in Algo Trading (Algo Advantage ep. 36) | Algo Advantage / Kevin Davey | 2025 | video | https://algoadvantage.substack.com/p/036-kevin-davey-part-i-its-all-about | — |
| community-42 | Top Traders Unplugged, Systematic Investor series | Niels Kaastrup-Larsen et al. | 2026 | video | https://www.toptradersunplugged.com/ | — |
| community-43 | Capital.com Open API: Client Sentiment | Capital.com | 2026 | doc | https://open-api.capital.com/ | files/community/capitalcom-client-sentiment-api.md |
| community-44 | Lab descriptive checks: IBS on US session; crypto 19:00 NY weekday windows (2024-01 → 2026-09) | this project | 2026 | doc | — | files/community/lab-descriptive-checks-ibs-and-crypto-weekday.md |
