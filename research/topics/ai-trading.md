# AI and machine learning for trading

_First pass 2026-10-13._

Scope: live LLM trading arenas and benchmarks, LLM agent frameworks and the look-ahead problem,
time-series foundation models (TimesFM, Chronos, Moirai, Lag-Llama, TimeGPT, Kronos), reinforcement
learning, deep learning on order books, Kaggle trading competitions, and what this arena (live demo
forward testing, TimesFM 3 on a local GPU, one instrument per run) could add.

## In short

- **LLMs trading on their own lose money, mostly through leverage and overtrading.** In nof1's Alpha
  Arena Season 1 (real money, crypto perps, 17 days), 4 of 6 frontier models lost 31–63% while BTC was
  flat; all ran 4–8× notional exposure at 10–20× leverage, and every one suffered a 45–78% drawdown. In
  Season 1.5 (US stocks) only 6 of 32 model-by-mode runs made money [ai-trading-02, ai-trading-05].
  Confidence: high that this is mostly leverage × noise, not skill.
- **Published LLM-agent backtests are not evidence.** LLMs have memorised prices: GPT-4o recalls daily
  S&P 500 levels within 0.6% before its cutoff vs 17% error after. Agents' Sharpe falls 51–62% once the
  test period is after the cutoff, and FinMem/FinAgent lose to buy-and-hold over 2004–2024
  [ai-trading-18, ai-trading-19, ai-trading-20]. Only forward, live testing counts, which is what this
  arena already does.
- **Time-series foundation models do not predict direction; they are usable for volatility.** Zero-shot
  TSFMs give ~50% directional accuracy and negative out-of-sample R² on daily returns, and every
  long-short strategy turns negative at 20 bp costs [ai-trading-26]. For realized volatility only one
  small model beats a log-HAR baseline, narrowly; TimesFM 2.5 does not until it is recalibrated
  [ai-trading-27]. This matches our own TimesFM backtests.
- **The one positive LLM result is reading news, and it is decaying.** GPT-4 headline scores predicted
  next-day stock returns after its training cutoff. The long-short Sharpe was 6.5 in 2021Q4 but 1.2 by
  early 2024, and the strategy is unprofitable at 20 bp round trip. It is strongest in small caps and on
  negative news, which is the opposite of our mega-cap and index universe [ai-trading-22].
- **Kaggle winners' transferable lessons:** validate in time order, refit on the newest data (online
  learning was the largest single gain in Optiver 2023 and Jane Street 2024), predict relative to the
  market, and keep models simple. Real out-of-sample skill is tiny (correlation ≈ 0.02) and rankings below
  the top are mostly luck [ai-trading-32, ai-trading-33, ai-trading-34].
- **Cheap, well-supported uses for us:** forecast quantiles as a volatility input (stops, sizing, filters),
  regime filters that cut drawdowns (statistical jump model: S&P 500 Sharpe 0.48 → 0.68 and max drawdown
  55% → 27%, 1990–2023, after costs) [ai-trading-36], and choosing among agents by their recent live
  record (strategy momentum) [ai-trading-37].
- **The most original opportunity:** the arena is already an uncontaminated, cost-inclusive, forward
  benchmark. Use it to judge LLM-*written* strategies (one model, one file, fixed parameters) and later
  LLM-*in-the-loop* traders. The literature asks for exactly this and has very little of it
  [ai-trading-21].

## Findings

### Alpha Arena Season 1 (nof1, 2025-10-17 → 2025-11-03): LLMs as autonomous crypto traders

**What it was.** Six models (GPT-5, Gemini 2.5 Pro, Claude Sonnet 4.5, Grok 4, DeepSeek V3.1, Qwen3-Max)
each got $10,000 of real money on Hyperliquid perpetuals in BTC, ETH, SOL, BNB, DOGE and XRP. Every 2–3
minutes each model received the same prompt and chose long, short, hold or close, plus size, leverage, a
confidence score and an exit plan (target, stop, invalidation condition) [ai-trading-01].
- Inputs were numbers only: 3-minute and 4-hour price, EMA, MACD, RSI, ATR, open interest, funding, plus
  the account's own Sharpe ratio. There was no news.

**Results**, rebuilt from nof1's archived API [ai-trading-02]:
- **Returns:** Qwen3-Max +22%, DeepSeek +5%, Claude −31%, Grok −45%, Gemini −56%, GPT-5 −63%. A BTC
  buy-and-hold account was flat (≈0%).
- **Leverage and exposure:** mean leverage on open positions was 11–19×, and gross exposure averaged 4–8×
  equity. Qwen held one position at a time at about 20× (90th percentile exposure 15× equity).
- **Drawdowns:** every model had a 45–78% drawdown. Both "winners" had been up more than 100% at their
  peak on 2025-10-27 (DeepSeek +131%, Qwen +109%) and gave most of it back.
- **Win rates** were 21–30% for every model. Money was made on a few big leveraged winners.
- **Trading and fees:**
  - Gemini made 238 trades (14 a day, median hold 2.6 h) and paid $1,331 in fees, 13% of capital.
  - Qwen made only 43 trades but paid $1,654 (16.5%) because its positions were huge.
  - Claude was 100% long and DeepSeek 97% long. GPT-5, Gemini and Grok shorted about half the time and
    lost the most.
- **Common moves:** on big days all equity curves moved together. On 2025-10-21 and 2025-10-30 everyone
  fell. The ranking is mostly long bias × leverage on a handful of days.

**What nof1 said they learned** [ai-trading-01]:
- **Overtrading and fees:** "Overall PnL was dominated by trading costs in early runs as agents over-traded
  and took quick, tiny gains that fees erased." Their fix was explicit exit plans, "fewer but larger,
  higher-conviction positions", and leverage.
- **Prompt sensitivity:** models were "highly sensitive to seemingly trivial prompt changes".
  - They misread newest→oldest data even when told the order.
  - They gamed rules: Gemini Flash dodged a cap on consecutive holds.
  - They contradicted their own exit plans.
- **Confidence:** self-reported confidence was "decoupled from actual trading performance". Qwen was always
  the most confident and GPT-5 the least.
- **nof1's own verdict (2026 homepage):** current LLMs are "shockingly bad at navigating financial markets"
  and show "minimal signs of improvement between releases".

**Honesty check.**
- 17 days, one run, 6 models, a single regime and no control except BTC hold.
- An annualised Sharpe estimated from 17 days has a standard error of about √(365/17) ≈ 4.6. Nothing here
  separates skill from luck.
- HN commenters made the right points: the average model lost 35% in 96 model-days, "overbetting" that
  would be ruinous in the long run, and the experiment needed a constant-mix or random control
  [ai-trading-03].

### Alpha Arena Season 1.5 (US stocks, 2025-11-19 → 2025-12-03) and the 2026 picture

- **Setup:** eight models traded TSLA, NVDA, MSFT, AMZN, GOOGL, PLTR and NDX in four parallel
  competitions: a baseline with news and fundamentals, a stripped-down "Monk Mode", "Situational
  Awareness" (sees the leaderboard), and "Max Leverage" (up to 20×) [ai-trading-04].
- **Result:** the anonymous "Mystery Model", later confirmed as Grok 4.20, was the only one profitable in
  aggregate, at about +10–12%. Season 1's winner Qwen3-Max lost up to ~70%.
- **Bloomberg's round-up (2026-05)** [ai-trading-05]:
  - "Across 32 test results, a model finished in profit only six times"; the combined portfolio lost about
    a third.
  - The bots "trade too much" and decide very differently on identical instructions.
  - A blog that tracked 11 market arenas found at least one winner in each, but a profitable *median*
    model in only 2.
  - nof1's founder: "Giving an LLM money right now and just having it go — that's not a thing yet."
- **Season 2:** announced, adding web search, longer thinking and multi-step tools. Not found as of this
  pass.
- **Confidence:** medium on the headline, low on exact numbers. The secondary sources disagree, and
  nof1's Season 1.5 pages are not archived.

### Academic live and after-cutoff benchmarks (2025)

None of these four deducts trading costs.

- **AI-Trader (HKUDS)** [ai-trading-06]
  - Six LLMs searched the web for their own news, Oct–Nov 2025: Nasdaq-100 hourly, SSE-50 daily, and
    crypto daily.
  - US: MiniMax-M2 +9.6% and DeepSeek +8.4% vs QQQ +1.9%, but every agent had a deeper drawdown than QQQ.
  - A-shares: no agent beat the index. Crypto: only DeepSeek beat the index, by holding up to 41% cash in
    a −14% market.
  - The authors' conclusion: "Risk control capability is the key determinant of an AI agent's
    cross-market robustness."
  - Failure modes: Gemini's "hold-to-die" trajectory, GPT-5 rigidly hitting target weights, and acting on a
    single unverified news item.
  - The repo has since turned into a copy-trading platform (ai4trade.ai) [ai-trading-25].
- **LiveTradeBench** [ai-trading-07]
  - 21 LLMs allocated live across 15 US large caps and 10 Polymarket markets for 50 trading days
    (2025-08-18 → 10-24).
  - All 21 made money on stocks (+1.8% to +6.3%) in a rising market, with no buy-and-hold baseline
    reported.
  - LMArena score had essentially no relation to returns (correlation 0.05 on stocks, −0.38 on
    Polymarket).
  - Reasoning models over-adjusted, and agents overreacted to "attention-grabbing but non-decisive news".
- **StockBench** [ai-trading-08]
  - Backtest Mar–Jun 2025 on 20 Dow stocks, daily decisions, 3 seeds.
  - Equal-weight buy-and-hold made +0.4%; the best models made +1.9% to +2.5% with shallower drawdowns.
  - "All LLM agents underperform the passive baseline during the downturn but outperform it in the
    upturn."
  - Removing news and fundamentals cut the best model from +1.9% to +0.6%.
  - Some models' cutoffs may overlap the window.
- **Agent Market Arena** [ai-trading-09]
  - Live, Aug–Sep 2025: TSLA, BMRN, BTC and ETH; 4 agent designs × 5 models.
  - The agent design mattered more than the LLM inside it.
  - The headline "Sharpe 6.47 on TSLA, beating buy-and-hold" was a 40.8% return vs buy-and-hold's 46.9%.
  - The TradingAgents framework on GPT-4.1 lost 38.7% on TSLA. All agents misjudged the same short
    squeeze.

**Pattern across all four:** the winners are the ones that hold cash or cut exposure in drawdowns. More
reasoning and more trades do not help, and every window is 1–3 months.

### Older benchmarks inside the training window: InvestorBench, FinBen

- **InvestorBench:** 13 LLM backbones in a FinMem-style agent [ai-trading-10].
  - Test periods: stocks 2020-10 → 2021-05, crypto 2023-04 → 2023-11, ETFs 2020-01 → 2020-09.
  - All of these fall before GPT-4o's October 2023 cutoff, so the results are contaminated by
    construction.
- **FinBen:** 36 datasets across 24 tasks [ai-trading-11].
  - LLMs do well at information extraction and text classification and struggle at forecasting.
  - Its trading task uses historical windows, with the same problem.
- **Use them for:** text tasks such as sentiment and extraction, not trading claims.

### LLM agent frameworks: TradingAgents, FinMem, FinAgent, FinGPT, FinRobot

- **TradingAgents** [ai-trading-12]
  - A simulated trading firm: analyst agents, bull and bear researchers debating, a trader, and a risk
    team. Each decision costs 11 LLM calls and 20+ tool calls.
  - Reported Jan–Mar 2024 on AAPL, GOOGL and AMZN: +23–27% and Sharpe 5.6–8.2, vs buy-and-hold −5% to
    +17%. That is one run, three stocks, about 60 days and no costs.
  - The authors themselves note the Sharpe "exceeds our expected empirical range".
  - The paper's annualised returns equal its cumulative ones, which is internally inconsistent.
  - Independent checks:
    - A one-year 2025 reproduction with costs: Sharpe 0.43 gross → 0.22 net, below buy-and-hold on 4 of
      5 tickers [ai-trading-21].
    - A live test lost 38.7% on TSLA [ai-trading-09].
  - It has 111k GitHub stars. An HN reader found the code double-counts Yahoo News, has a sentiment
    prompt "primed to be bullish on Nvidia", and contains a memory bug [ai-trading-13].
- **FinMem and FinAgent** [ai-trading-14, ai-trading-15]: LLM agents with layered memory and reflection;
  FinAgent also reads charts. They claimed large gains (FinAgent "92.27% return" on one dataset).
- **FINSABER re-test of FinMem and FinAgent** [ai-trading-18]: 2004–2024, about 100 symbols including
  delisted ones, real commissions.
  - On broad universes FinMem's Sharpe is negative (−0.29 to +0.03) and FinAgent's is 0.09–0.24, vs
    buy-and-hold 0.32–0.70. Buy-and-hold wins with p ≤ 0.012, and neither agent shows significant alpha.
  - Extending FinMem's original test window by two months turned MSFT from +23% to −22%.
  - The agents are "too cautious when risk is rewarded and too aggressive when it is penalised": in bull
    years FinMem's Sharpe is −0.19 vs 0.61 for buy-and-hold.
  - A broad run cost about $200 in API fees.
- **FinGPT** [ai-trading-16]: LoRA-tuned open models for financial text, mainly sentiment. Cheap to run
  locally; no live trading evidence.
- **FinRobot** [ai-trading-17]: an agent platform for equity research and valuation reports, not a
  trader.

### The leakage problem: an LLM cannot be backtested on data it trained on

- **The Memorization Problem** [ai-trading-20], GPT-4o:
  - It recalls daily index levels before its cutoff with 0.5–1.8% average error and the right daily
    direction 69–81% of the time.
  - After the cutoff: 13–20% error and 44–49% direction, which is worse than always guessing "up" (53.6%).
  - Telling it "use nothing after 2010" does not work: it still calls post-2010 GDP direction 98% right.
  - Anonymising does not work: it identifies AAPL, META and MSFT from masked earnings calls 100% of the
    time.
  - The authors' rule: evaluate "exclusively on data beyond their training cutoff".
- **Profit Mirage** [ai-trading-19]:
  - Five published agents on GPT-4o were moved from a 2021 window to a late-2024 window with a similar
    market return. Sharpe fell 51–62% and total return 50–72%.
  - With perturbed news, prices or indicators, 69–82% of decisions did not change. The models were
    answering from memory, not reading the inputs.
- **The Alpha Illusion** [ai-trading-21]:
  - Of 40 system × cost-component cells across FinMem, TradingAgents, FinAgent, FinCon and QuantAgent, 35
    are unmodelled.
  - Over one year, a Sharpe's 95% confidence interval spans the whole agent-vs-buy-and-hold gap.
  - "Language confidence is not tradable probability."
  - Proposed fix: a modular design where LLMs extract information upstream of independent calibration,
    risk and execution modules, with six reporting protocols (P1 post-cutoff window … P5 full costs,
    P6 compare against a single agent).
- **Possible remedy:** point-in-time LLMs trained only on data up to each year. DatedGPT's twelve 1.3B
  models (cutoffs 2013–2024) measure a "lookahead premium" of 26 bp per standard deviation in news-return
  prediction [ai-trading-23]. They are small models, but this is the right idea.
- **Implication for us:** every frontier LLM has seen 2024–2026 prices, so any backtest of an LLM-driven
  agent over our 2024-01 → 2026-09 data is meaningless. Only demo-forward results count.
  - The same caution applies, more weakly, to TSFMs: Kronos was pre-trained on data up to June 2024, which
    overlaps our backtest.
  - TimesFM 3's corpus is not documented. We did not check it.

### LLMs reading news: real but decaying, and weakest for mega-caps and indices

- **Lopez-Lira and Tang** [ai-trading-22], after the cutoff (Oct 2021 – May 2024, about 4,100 US
  stocks):
  - GPT-4 headline scores predict the next one to two days of drift. A daily long-short on overnight
    news earned 34 bp/day before costs, Sharpe 2.97.
  - The short leg (negative news) carried most of it (Sharpe 2.01 vs 0.78 for the long leg).
  - The effect is strongest in small stocks.
  - The Sharpe decayed as LLM use spread: 6.54 (2021Q4) → 3.68 (2022) → 2.33 (2023) → 1.22 (Jan–May
    2024).
  - At 20 bp round trip "the strategy [is] unprofitable".
- **For us:** our 21 instruments are the most efficiently priced assets there are (mega-cap shares,
  indices, major FX, gold, oil, BTC). Expect little edge per headline.
- **Where it could still help:** as a risk switch (flatten before scheduled macro events, or after a large
  negative surprise) rather than as a forecaster.
- **Confidence:** medium that the edge is small on our instruments. It is untested on CFDs.

### Time-series foundation models: direction fails, volatility is usable after calibration

- **Daily returns, 94 countries, 1990–2023 (out-of-sample 2001–2023)** [ai-trading-26]:
  - Zero-shot TimesFM 2 had R² −2.8% and 49.8% directional accuracy; Chronos-L −1.37% and 51.0%.
    Fine-tuning "generally deteriorates performance".
  - Models pre-trained *from scratch* on financial data did better (51.7% accuracy, long-short Sharpe
    6.8 before costs).
  - At 20 bp per trade every long-short strategy, including CatBoost, goes negative.
- **Daily returns of 5 large US stocks, 2024-08 → 2026-02** [ai-trading-28]:
  - TimesFM-2.5 and Moirai-2.0 rank best among models, but often lose to "predict zero".
  - Only 2 of 10 tests beat a random walk. The authors: TSFMs "are not universal engines for
    statistically reliable alpha".
- **Realized volatility, 50 assets (stocks, FX, futures including gold, crude, natural gas, E-mini
  S&P)** [ai-trading-27]:
  - Against log-HAR, only the tiny TTM model (under 1M parameters) wins at every horizon, by 1–2%.
    TimesFM 2.5 is 9–33% worse.
  - After a rolling level-and-scale recalibration (Mincer–Zarnowitz), TimesFM 2.5 becomes the best
    one-day forecaster. Most of the raw short-horizon gap is miscalibration, not missing information.
  - Robust recipe: an equal-weight average of a TSFM and log-HAR, which is in the best-model set for
    98–100% of assets.
- **Not tested in the literature:** the 0.1–0.9 quantiles themselves (coverage, calibration). This matters
  because our agents use the band.
- **TimesFM 3.0 (Aug 2026)** [ai-trading-25]:
  - Adds native multivariate input and covariates, which could take other instruments, volume or realized
    volatility as inputs.
  - Its weights are "restricted to non-commercial, non-production use". That is fine for demo research,
    but not for a future real-money arena (2.5 is Apache-2.0).
- **This agrees with our own backtests** (GUIDE.md): trading the median's direction loses after spread.
  Width-as-volatility and slow, high-conviction signals are the right direction.
- **Confidence:** high on "no direction", medium on "volatility, after calibration".

### Kronos (2025): a foundation model for candlesticks

- **What it is** [ai-trading-24]:
  - Decoder-only, trained on more than 12 billion OHLCV bars from 45 exchanges (data to June 2024).
  - Each candle is one discrete token; it samples whole future candle paths (open, high, low, close,
    volume).
  - Open sizes: 4.1M parameters (2,048 context), 24.7M and 102.3M (512 context), MIT licence; the 499M
    model was not released.
- **Its authors' benchmark** (zero-shot, from July 2024; 1h and 4h bars only reported as averages across
  frequencies):
  - Price-path RankIC 0.027 vs 0.014 for the best TSFM baseline. Return IC 0.070 vs 0.050.
  - Volatility MAE 0.037 vs GARCH 0.041 (TimesFM 0.060).
  - A CSI300/800 long-only top-k backtest at 0.15% cost per trade: 20.8% annual excess return,
    information ratio 1.65.
- **Caveats:** the authors' own benchmark, and no Sharpe or after-cost result outside China A-shares.
  Kronos is useful to us for two reasons:
  - Unlike TimesFM, which sees only closes, it models highs and lows.
  - Its sampled paths give the probability of hitting a level, which suits stop and target placement.
- **Confidence:** low to medium until someone independent replicates it.

### Reinforcement learning (FinRL)

- **FinRL** [ai-trading-29]: a popular deep-RL library (16.6k stars) with gym-style environments and
  standard algorithms (PPO, SAC, DDPG …).
- **FinRL Contests 2023–2025** [ai-trading-30]:
  - In the 2023 stock task, the three winning teams beat the Dow on Sharpe and drawdown but not on return
    over the live test: +1.05% to +3.50% vs +5.42% for the Dow over 15 days, then −0.05% to +0.04% vs
    +0.80% over the next 6 days.
  - The organisers concede that "generalization to new, unseen market conditions remains a challenge".
  - Their in-house rolling backtest (PPO Sharpe 1.55 vs Dow 0.47, 2010–2023) is the kind of result the
    contests did not confirm live.
- **Lesson:** RL agents mostly learn to sit out. Their "risk control" looks good on short windows and costs
  return. RL needs a simulator that reacts to the agent's orders and a lot of fresh data. Low priority for
  us.

### Deep learning on limit order books

- **LOBCAST benchmark** [ai-trading-31]: 15 published deep-learning models re-run on the classic FI-2010
  dataset and on new 2021–2022 Nasdaq data.
  - The best model's F1 fell from 82.6 to about 60.
  - TransLOB's claimed 87.3 became 50.4 on new data.
  - A three-day trading test was profitable only on the two stocks that rose most, assuming zero fees.
- **For us:** not applicable. We have no order book, only CFD quotes. Recorded so we do not chase it.

### Kaggle trading competitions: what the winners did and what transfers

- **Optiver Trading at the Close (2023)** [ai-trading-32]:
  - The 1st-place solution blended CatBoost, GRU and Transformer on 300 features.
  - Online retraining every 12 days improved the test score from 5.4438 to 5.4030 (MAE). In that
    competition this was a big gap.
  - Predictions were made relative to the index by subtracting the index-weighted mean.
  - Every top solution used time-series validation and online retraining.
- **Jane Street Real-Time Market Data Forecasting (2024–25)** [ai-trading-33]:
  - 8th place: a small GRU updated with one gradient step each time new labels arrived. That gave +0.008
    R² on validation, about as large as the final leaderboard score itself (0.011).
  - The 2nd-place reproduction: frozen ensemble 0.0141 vs 0.0194 with online learning.
  - A top participant: "lags are not particularly effective as model inputs because past prices and
    returns often provide poor predictions".
- **G-Research Crypto (2021–22, 14 coins, 15-minute returns)** [ai-trading-34]:
  - Final top-10 correlations were about 0.02.
  - The public leaderboard was meaningless: the test period sat inside the training data, and one
    notebook scored 0.99.
  - 2nd place: a single LightGBM, walk-forward CV with a one-week gap, and two submissions in total.
  - 3rd place: only closes, with each coin's move minus the whole market's move as features.
- **Jane Street 2021 (1st place)** [ai-trading-35]: purged, gapped time-series CV. The public starter
  notebook it built on leaked labels.
- **What transfers to us:**
  - Refit on the newest data.
  - Strict time-ordered validation and few choices.
  - Relative (instrument minus market) features.
  - Small models.
  - Expect correlations of about 0.01–0.03, which only survive costs at low turnover.

### Regime classification

- **Statistical jump model** [ai-trading-36]: a 2-state clustering of daily features with a penalty on
  switching. The features are EWM downside deviation (half-life 10 days) and EWM Sortino ratios
  (half-lives 20 and 60 days).
- **Results** (0/1 index strategy, 1990–2023, 10 bp one-way cost, one-day delay):
  - S&P 500: Sharpe 0.48 → 0.68 and max drawdown 55% → 27%, with 44% turnover a year.
  - DAX: 0.30 → 0.44. Nikkei: 0.12 → 0.31.
  - It beats a hidden Markov model, which switches 3× more often.
- **Caveats:**
  - It needs a 12-year training window.
  - The jump penalty was tuned by rolling cross-validation. With a fixed penalty of 50–100, it switches
    less than once a year.
  - Its gains are mostly lower drawdowns, not higher returns. That is exactly what matters at 1:3–1:20.
- **Confidence:** medium to high as a drawdown filter for equity indices.

### Choosing which strategies to trust

- **Factor momentum** [ai-trading-37]: factor returns persist. The monthly autocorrelation averages 0.11
  across 65 equity factors, positive for 59, and "factor momentum" earns alpha beyond stock momentum.
- **Arena analogue:** agents with a good recent live record are slightly more likely to keep doing well.
- **The counter-force is multiple testing.** With about 480 runs, roughly 11 would reach t ≥ 2
  (one-sided) by luck alone if none had skill. This is why the lifecycle's "above every monkey" rule
  matters, and why any meta-agent should shrink toward equal weight.
- **LLMs should not do the weighting.** Self-confidence was uncorrelated with results in Alpha Arena
  [ai-trading-01], and "language confidence is not tradable probability" [ai-trading-21]. A numeric rule
  (Hedge-style multiplicative weights or trailing t-statistics) is the honest baseline.

## For the arena

Mapped to our instruments, the 1h/4h/1d timeframes, the nine leverage tiers and the SDK (`onBar`,
`ctx.forecast` quantiles, one instrument per run). Parameters are fixed up front, as LIFECYCLE.md
requires.

### Feasible now

1. **Forecast quantile audit (lab script, not an agent; do this first).**
   - For every instrument on 1h and 4h, measure how often the realized close at step *s* falls inside
     the TimesFM q0.1–q0.9 band (target 80%) and below q0.5 (target 50%), using the precomputed backtest
     tables.
   - Also compare band-implied volatility against realized volatility and against an EWMA/HAR baseline
     (QLIKE loss).
   - Rationale: the literature never checked TSFM quantiles [ai-trading-27], and ideas 2–3 depend on
     them. If the band is consistently too narrow or too wide, apply one per-instrument scale factor
     estimated on 2024 and frozen.
2. **`timesfm-stops` (twin experiment).**
   - Copy an existing 1h agent with ATR stops (e.g. `ema-cross/20-50`) and change only the stop: long
     stop = `quantile(0.1, 15)`, short stop = `quantile(0.9, 15)`, with `forecast: {horizon: 16,
     context: 512}` and `riskPct: 1`.
   - Same entries, so the difference between the twins measures whether the TimesFM band is a better
     volatility estimate than ATR(14).
   - Runs at the tiers the original runs at.
3. **`vol-target-blend`.**
   - A twin of `vol-target`: long US500/US100/US30 at 1:3, exposure = 15% ÷ σ̂, capped 0–2×, rebalanced
     monthly.
   - σ̂ = average of (a) TimesFM 1h band volatility with `forecast: {horizon: 24, context: 512}`,
     (q0.9 − q0.1 at step 23) ÷ (2.563 × price) × √252,
     and (b) a HAR-style realized volatility, the mean of 1-, 5- and 22-day realized volatility from
     `ctx.tf('1d')`.
   - Copies Brini's "average a TSFM with HAR" result [ai-trading-27]. Few trades, so the spread barely
     matters.
4. **`jump-regime` (index overlay).**
   - A 2-state jump model fitted inside the agent once per day on 1d bars of US500, US100 and US30, with
     the paper's three features (EWM downside deviation, half-life 10; EWM Sortino, half-lives 20 and
     60), a fixed jump penalty λ = 50, and a refit every 126 days.
   - Long at 1× exposure in the "bull" state, flat in "bear", acting one bar after the signal.
   - Run at 1:1, 1:3 and 1:10 to see whether the drawdown cut makes leverage survivable [ai-trading-36].
   - Limitation: our 1-minute history starts in 2024-01, about 700 daily bars against the paper's 3,000.
     The fit will be noisy until longer daily history exists (platform change below).
5. **`online-logit` (the Kaggle lesson).**
   - A logistic regression updated every closed bar with fixed learning rate 0.01 and L2 penalty 1e-3.
     The state is about 10 weights, well under 1 ms.
   - Features: returns over 1, 4 and 24 bars, RSI(14), z-score(20), Bollinger width, and hour-of-day
     sine/cosine.
   - Label: the sign of the next 4-bar return.
   - Trade 4h bars only when |p − 0.5| > 0.05, with a 2×ATR stop and `riskPct: 1`.
   - Expectation: likely to fail after spread, since real out-of-sample skill in Kaggle was tiny
     [ai-trading-33]. It tests the one lesson Kaggle repeats: refit on the newest data.
6. **An "LLM strategy-writer" arena (no code change, a process change).**
   - Each week, give 3–4 different frontier models the same brief (GUIDE.md, LIFECYCLE.md, the idea log)
     and have each write one agent file with fixed parameters and a stated reason.
   - Set `author` to the model name, deploy as usual, and compare authors by forward t-statistics after
     28 days.
   - Rationale: this uses LLMs as *strategy generators*, which Profit Mirage and the Alpha Illusion
     recommend over direct trading [ai-trading-19, ai-trading-21]. The demo forward test removes the
     memorisation problem.
   - The LLM may still have "remembered" that gold trended up in 2025. The backtest will flatter it, but
     the demo will not.

### Needs a platform change

7. **Kronos as a second forecaster (`ctx.forecast2` or `forecast: {model: 'kronos'}`).**
   - Serve Kronos-base or Kronos-small (MIT, 512 context) from the same GPU PC, sampling about 30 paths.
     Expose quantiles of close, high and low per step, plus P(high ≥ x) and P(low ≤ y) over the horizon.
   - First experiment: twin `timesfm-vol-breakout` → `kronos-vol-breakout`.
   - Second experiment: place the stop where the sampled probability of a touch within 16 bars is 20%.
   - Backtests from 2024-01 to 2024-06 overlap Kronos's training data; judge on 2024-07 onward and on demo
     [ai-trading-24].
8. **A forward-only external signal channel (`ctx.signals.<name>`).**
   - A timestamped store that agents read like the forecast, written by an outside job. It records what
     was known when, so demo runs can be replayed.
   - Backtests either see `null` or are flagged "signal-less".
   - This one primitive serves ideas 9–11 and any future data source (economic calendar, funding rates,
     COT reports).
9. **A daily LLM news/macro stance (needs a news feed and an LLM budget).**
   - At 12:30 UTC each weekday, one LLM call per instrument group reads the day's headlines and the
     economic calendar and returns stance −1/0/+1, a one-line reason, and a "risk event today" flag.
     That is about 10 calls a day, well under $1.
   - Candidate free feeds: an Alpaca or Finnhub free tier, GDELT, central-bank RSS. We did not test their
     quality or licences.
   - Agents to test (all forward-only):
     - (a) `news-riskoff`: flatten any open position before a flagged event, as an overlay on an
       existing trend agent.
     - (b) `news-drift`: one-day position in the stance direction on US500/GOLD/EURUSD at `riskPct: 0.5`
       with a 1.5×ATR stop, at 1:1 and 1:5.
     - (c) a random-stance control.
   - Evidence says (b) is weak on our instruments; (a) is the better bet [ai-trading-22].
10. **An LLM-in-the-loop trader (an nof1 replica done properly).**
    - A worker calls the LLM at each 4h bar close for one instrument (BTCUSD and US100) and returns
      {action, stop, target}. The prompt includes data ordered oldest→newest, fees and funding, and a
      required exit plan, following nof1's lessons [ai-trading-01].
    - Sizing is *not* set by the LLM: fixed `riskPct: 1` against its stop. The leverage tier is the
      experiment: 1:1 vs 1:20.
    - Control: a monkey with the same trade frequency and leverage.
    - Cost: 6 calls a day per run. Without fixed sizing, expect a replay of Alpha Arena.
11. **A meta-agent over the arena (needs read-only access to other runs).**
    - A run on US100 or GOLD that, each day, holds the net position of the top 5 runs on that instrument
      ranked by trailing 20-day trade t-statistic (shrunk: weight ∝ max(t, 0)), capped at 1× exposure.
    - Compare with (a) equal weight over all live runs, (b) the same picker done by an LLM reading the
      leaderboard once a day, and (c) the lifecycle's own leaders.
    - Tests strategy momentum [ai-trading-37] against multiple-testing luck.
12. **Multi-instrument context (`ctx.peer('US100')`).** Unlocks:
    - relative features (NVDA minus US100, ETH minus BTC; G-Research 3rd place [ai-trading-34]);
    - TimesFM 3's multivariate and covariate mode;
    - a news agent that ranks instruments instead of calling each in isolation.
13. **Longer daily history for indices, FX and gold** (import daily bars from 2000). Needed for regime
    models (idea 4) and for any volatility model that wants years of context. It also gives
    vol-targeting agents a longer backtest.

### Leverage, specifically

- **Alpha Arena's lesson maps onto our tiers.** Unconstrained agents at 10–20× leverage and 4–8× exposure
  lose half their capital in weeks, whoever the model is [ai-trading-02]. Our `leverage-ladder` control
  already shows the same at 1:50 and above.
- Any AI-driven agent here should size with `riskPct` against a stop, never with `marginPct` chosen by a
  model. The account tier should then be a ceiling, not a target.
- Regime and volatility forecasts are most valuable at higher tiers. Sitting out the ~20% of days the jump
  model calls "bear" halved the S&P 500's worst drawdown (55% → 27% at 1×). That is the kind of cut that
  lets a 1:3–1:10 index holder stay above the 50%-of-margin close-out.

## Open questions

- Alpha Arena Season 2: has it run, and do web search and tools change the picture? nof1's own Season 1.5
  data was not archived. Try the Wayback Machine again later, or ask for their API.
- Is TimesFM 3's pretraining corpus documented? If it includes 2024–2026 market prices, our TimesFM
  backtests are optimistic too.
- Our own quantile calibration (idea 1): is the 10–90 band per instrument and timeframe about 80%? How
  much does a one-number recalibration help (Brini's finding for TimesFM 2.5)?
- Does Kronos's volatility and path-probability edge survive an independent test on FX, indices and
  metals at 1h/4h? Nobody outside the authors has published one that we found.
- News-feed licensing and quality for a daily LLM stance: which free feed covers macro, FX and
  commodities well? Is a daily economic calendar alone (no LLM) enough for the "risk-off before events"
  overlay?
- Reddit (r/algotrading, r/quant) practitioner reports on LLM bots, TimesFM/Chronos and Kronos: Reddit
  blocked our requests this pass (HTTP 403), so community experience is missing.
- Kaggle Jane Street 2024–25: the 1st- and 2nd-place write-ups (video and slides only). What exactly did
  their online-learning schedule look like?
- Point-in-time LLMs (DatedGPT, PiT-Inference): is a small dated model good enough to score headlines?
  That would allow honest backtests of a news agent.
- How many arena runs reach t ≥ 2 versus the count expected from luck? A false-discovery check on the
  leaderboard would set the bar for any meta-agent.

## Sources

| id | title | authors / site | year | kind | link | local copy |
|---|---|---|---|---|---|---|
| ai-trading-01 | Exploring the Limits of LLMs as Quant Traders in Live Markets (Alpha Arena S1 tech post) + nof1 homepage | nof1.ai | 2025 | blog | http://web.archive.org/web/20251028041142/https://nof1.ai/blog/TechPost1 | files/ai-trading/nof1-alpha-arena-s1-techpost.md |
| ai-trading-02 | Alpha Arena Season 1 account totals and trades (archived API), rebuilt tables | nof1.ai (via Wayback Machine) | 2025 | doc | http://web.archive.org/web/20251104022344/https://nof1.ai/api/account-totals?lastHourlyMarker=407 | files/ai-trading/nof1-alpha-arena-s1-data.md (+ raw .json.gz next to it) |
| ai-trading-03 | HN: Exploring the limits of large language models as quant traders | Hacker News | 2025 | thread | https://news.ycombinator.com/item?id=45976832 | files/ai-trading/hn-llm-trading-threads.md |
| ai-trading-04 | Grok 4.20 wins Alpha Arena Season 1.5 (US stocks) | aihola.com / onedayadvisor.com / forklog.com | 2025 | blog | https://aihola.com/article/grok-wins-alpha-arena-trading | files/ai-trading/alpha-arena-s15-and-bloomberg.md |
| ai-trading-05 | AI Bots Auditioning for Wall Street Trading Are Mostly Losing | Bloomberg | 2026 | blog | https://www.bloomberg.com/news/articles/2026-05-06/ai-bots-auditioning-for-wall-street-trading-are-mostly-losing | files/ai-trading/alpha-arena-s15-and-bloomberg.md |
| ai-trading-06 | AI-Trader: Benchmarking Autonomous Agents in Real-Time Financial Markets | Fan, Yang, Jiang, Zhang et al. (HKUDS) | 2025 | paper | https://arxiv.org/abs/2512.10971 | files/ai-trading/fan-2025-ai-trader.pdf |
| ai-trading-07 | LiveTradeBench: Seeking Real-World Alpha with Large Language Models | Yu, Li, You | 2025 | paper | https://arxiv.org/abs/2511.03628 | files/ai-trading/yu-2025-livetradebench.pdf |
| ai-trading-08 | StockBench: Can LLM Agents Trade Stocks Profitably In Real-world Markets? | Chen, Yao, Liu, Xin et al. | 2025 | paper | https://arxiv.org/abs/2510.02209 | files/ai-trading/chen-2025-stockbench.pdf |
| ai-trading-09 | When Agents Trade: Live Multi-Market Trading Benchmark for LLM Agents (Agent Market Arena) | Qian, Peng, Wang, Zhang et al. | 2025 | paper | https://arxiv.org/abs/2510.11695 | files/ai-trading/qian-2025-agent-market-arena.pdf |
| ai-trading-10 | INVESTORBENCH: A Benchmark for Financial Decision-Making Tasks with LLM-based Agent | Li, Cao, Yu, Javaji et al. | 2024 | paper | https://arxiv.org/abs/2412.18174 | — |
| ai-trading-11 | FinBen: A Holistic Financial Benchmark for Large Language Models | Xie, Han, Chen, Xiang et al. | 2024 | paper | https://arxiv.org/abs/2402.12659 | — |
| ai-trading-12 | TradingAgents: Multi-Agents LLM Financial Trading Framework | Xiao, Sun, Luo, Wang | 2024 | paper | https://arxiv.org/abs/2412.20138 | files/ai-trading/xiao-2024-tradingagents.pdf |
| ai-trading-13 | HN: Multi-Agents LLM Financial Trading Framework (TradingAgents) | Hacker News | 2026 | thread | https://news.ycombinator.com/item?id=49605822 | files/ai-trading/hn-llm-trading-threads.md |
| ai-trading-14 | FinMem: A Performance-Enhanced LLM Trading Agent with Layered Memory and Character Design | Yu, Li, Chen, Jiang et al. | 2023 | paper | https://arxiv.org/abs/2311.13743 | — |
| ai-trading-15 | A Multimodal Foundation Agent for Financial Trading: Tool-Augmented, Diversified, and Generalist (FinAgent) | Zhang, Zhao, Xia, Sun et al. | 2024 | paper | https://arxiv.org/abs/2402.18485 | — |
| ai-trading-16 | FinGPT: Open-Source Financial Large Language Models | Yang, Liu, Wang | 2023 | paper | https://arxiv.org/abs/2306.06031 | — |
| ai-trading-17 | FinRobot: An Open-Source AI Agent Platform for Financial Applications using Large Language Models | Yang et al. | 2024 | paper | https://arxiv.org/abs/2405.14767 | — |
| ai-trading-18 | Can LLM-based Financial Investing Strategies Outperform the Market in Long Run? (FINSABER) | Li, Kim, Cucuringu, Ma | 2025 | paper | https://arxiv.org/abs/2505.07078 | files/ai-trading/li-2025-finsaber-llm-long-run.pdf |
| ai-trading-19 | Profit Mirage: Revisiting Information Leakage in LLM-based Financial Agents | Li, Zeng, Xing, Xu et al. | 2025 | paper | https://arxiv.org/abs/2510.07920 | files/ai-trading/li-2025-profit-mirage.pdf |
| ai-trading-20 | The Memorization Problem: Can We Trust LLMs' Economic Forecasts? | Lopez-Lira, Tang, Zhu | 2025 | paper | https://arxiv.org/abs/2504.14765 | files/ai-trading/lopez-lira-2025-memorization-problem.pdf |
| ai-trading-21 | The Alpha Illusion: Reported Alpha from LLM Trading Agents Should Not Be Treated as Deployment Evidence | Ye, Han, Hu, Bu et al. | 2026 | paper | https://arxiv.org/abs/2605.16895 | files/ai-trading/ye-2026-alpha-illusion.pdf |
| ai-trading-22 | Can ChatGPT Forecast Stock Price Movements? Return Predictability and Large Language Models | Lopez-Lira, Tang | 2023 | paper | https://arxiv.org/abs/2304.07619 | files/ai-trading/lopez-lira-2023-chatgpt-forecast-stock-prices.pdf |
| ai-trading-23 | DatedGPT: Preventing Lookahead Bias in Large Language Models with Time-Aware Pretraining | Yan, Tang, Gao, Jiang | 2026 | paper | https://arxiv.org/abs/2603.11838 | — |
| ai-trading-24 | Kronos: A Foundation Model for the Language of Financial Markets | Shi, Fu, Chen, Zhao et al. | 2025 | paper | https://arxiv.org/abs/2508.02739 | files/ai-trading/shi-2025-kronos.pdf |
| ai-trading-25 | GitHub repos: TimesFM (2.5/3.0 release notes, weights licence), Kronos, AI-Trader, TradingAgents and others | GitHub | 2026 | repo | https://github.com/google-research/timesfm | files/ai-trading/github-ai-trading-repos.md |
| ai-trading-26 | Re(Visiting) Time Series Foundation Models in Finance | Rahimikia, Ni, Wang | 2025 | paper | https://arxiv.org/abs/2511.18578 | files/ai-trading/rahimikia-2025-revisiting-tsfm-finance.pdf |
| ai-trading-27 | Forecasting Realized Volatility with Time Series Foundation Models: A Comparison with Econometric Benchmarks | Brini | 2026 | paper | https://arxiv.org/abs/2607.05291 | files/ai-trading/brini-2026-tsfm-realized-volatility.pdf |
| ai-trading-28 | Pretrained Time-Series Foundation Models for Financial Return Forecasting | Noguer i Alonso, Franklin | 2026 | paper | https://arxiv.org/abs/2606.27100 | — |
| ai-trading-29 | FinRL: A Deep Reinforcement Learning Library for Automated Stock Trading in Quantitative Finance | Liu, Yang, Chen, Zhang et al. | 2020 | paper | https://arxiv.org/abs/2011.09607 | — |
| ai-trading-30 | FinRL Contests: Benchmarking Data-driven Financial Reinforcement Learning Agents | Wang, Holzer, Xia, Cao et al. | 2025 | paper | https://arxiv.org/abs/2504.02281 | — |
| ai-trading-31 | LOB-Based Deep Learning Models for Stock Price Trend Prediction: A Benchmark Study (LOBCAST) | Prata, Masi, Berti, Arrigoni et al. | 2023 | paper | https://arxiv.org/abs/2308.01915 | files/ai-trading/prata-2023-lobcast-benchmark.pdf |
| ai-trading-32 | Optiver - Trading at the Close: 1st place solution | hyd (Kaggle) | 2024 | thread | https://www.kaggle.com/competitions/optiver-trading-at-the-close/discussion/487446 | files/ai-trading/kaggle-trading-competitions.md |
| ai-trading-33 | Jane Street Real-Time Market Data Forecasting: 8th place solution, lessons thread, 2nd place reproduction | Kaggle (Grigoreva, Shlepov, Weill) | 2025 | thread | https://www.kaggle.com/competitions/jane-street-real-time-market-data-forecasting/discussion/556542 | files/ai-trading/kaggle-trading-competitions.md |
| ai-trading-34 | G-Research Crypto Forecasting: wrap-up, 2nd and 3rd place solutions, leak thread | G-Research / Kaggle | 2022 | thread | https://www.kaggle.com/competitions/g-research-crypto-forecasting/discussion/323098 | files/ai-trading/kaggle-trading-competitions.md |
| ai-trading-35 | Jane Street Market Prediction: 1st place (supervised autoencoder + MLP) | Yirun Zhang (Kaggle) | 2021 | thread | https://www.kaggle.com/competitions/jane-street-market-prediction/discussion/224348 | files/ai-trading/kaggle-trading-competitions.md |
| ai-trading-36 | Downside Risk Reduction Using Regime-Switching Signals: A Statistical Jump Model Approach | Shu, Yu, Mulvey | 2024 | paper | https://arxiv.org/abs/2402.05272 | files/ai-trading/shu-2024-jump-model-regime-switching.pdf |
| ai-trading-37 | Factor Momentum Everywhere | Gupta, Kelly (AQR) | 2019 | paper | https://www.aqr.com/-/media/AQR/Documents/Insights/Journal-Article/Factor-Momentum-Everywhere-JPM-Quant-19.pdf | — |
