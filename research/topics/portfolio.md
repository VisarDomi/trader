# Beyond one instrument: portfolio, cross-sectional, relative-value and meta-strategies

_First pass 2026-10-13._

Scope: what the arena could do if an agent could see and trade several instruments at once (today: one
instrument, one position per run), and what could be done one level up, over the ~480 runs themselves.
Local numbers below come from our own candles (2024-01 → 2026-09), see
`files/portfolio/local-instrument-correlations.md`.

## In short

- **Small universes can carry cross-sectional momentum, but ours are very small.** Momentum across 18 country
  index futures earned Sharpe 0.73 and across 27 commodities 0.53 (1972–2011, before costs) [portfolio-08].
  Our 8 shares behave like ≈ 4 independent bets (mean pairwise correlation 0.38) and our 3 US indices like
  ≈ 1 (US100–US500 correlation 0.95). Expect weak signals that need years to prove. The cheapest test is a
  top-1/top-2 rotation of the 8 shares at 1:1 against the existing buy-and-hold basket.
- **Textbook TAA needs assets we do not have.** GTAA, dual momentum, PAA/VAA/DAA/BAA and KDA all use bonds as
  the defensive asset and usually international equities [portfolio-10..15]. Out of sample, GTAA earned about
  6%/yr with Sharpe 0.68 (2006–2025) [portfolio-12]. In 2022 the average TAA strategy had a max drawdown of
  −12% because long Treasuries failed as a hedge [portfolio-15]. Allocate Smartly flags Keller's newest model
  (BAA) as likely overfit [portfolio-15].
- **Pairs trading has decayed, and our candidate spreads are weak.** Top-20 stock pairs earned 0.86%/month in
  1962–88 but only 0.24%/month in 2003–09, and are mostly unprofitable after costs [portfolio-01..03].
  Our candidates do not look like pairs. Gold/silver passed a cointegration test in only 20% of monthly
  windows since 1996 [portfolio-06]. Oil and gas returns correlate 0.15. The ETH/BTC ratio fell from 0.06 to
  0.018 in our window. Capital.com charges funding on the long leg (≈ 8%/yr on indices and shares) and
  ≈ 0 on the short, so a slow pair pays one leg's funding.
- **Risk parity's historical edge needed bonds and cheap leverage.** Levered risk parity had Sharpe 0.53 vs 0.25
  for the market portfolio (US stocks and bonds, 1926–2010) [portfolio-18]. We have no bonds, and leverage
  costs ≈ 8%/yr on index notional. A public 3× stock/bond portfolio (HFEA) fell ≈ 71% from peak to trough
  in 2022–23 [portfolio-21]. Inverse-volatility weighting is still the right way to combine runs. HRP's
  evidence is Monte Carlo only [portfolio-19], and plain 1/N is hard to beat [portfolio-20].
- **Trend across many instruments is the best-documented multi-instrument idea.** Over 67 markets
  (1880–2013), trend following earned Sharpe 0.77 after 2-and-20 fees [portfolio-16]. Carver's rule of
  thumb: Sharpe 0.35 for one instrument, 0.61 for eight in different asset classes [portfolio-17]. Our 20
  instruments behave like ≈ 6 independent bets. The arena already runs one-instrument trend agents, and
  their sum is a trend portfolio. Measuring it as one only needs a portfolio view.
- **Choosing strategies by recent performance mostly fails.** Among 100+ TAA strategies (1973–2026), the recent
  winners by return or Sharpe never beat the equal-weighted average on Sharpe [portfolio-15]. On eToro,
  traders' performance shows no persistence beyond noise, and copied trades lost 61 bp each vs 7 bp for
  own trades [portfolio-27]. Copy trading raises risk taking: in an experiment, 88% of copiers picked the
  riskiest leader [portfolio-28]. The one rule with support is time-series: equity factors with a positive
  past year earned 52 bp/month next vs ≈ 1 bp after a negative year [portfolio-22]. So "switch off runs
  with negative trailing P&L" is worth testing; "pick the top 10" is not.
- **Selection over 480 runs needs deflating.** With 450–480 no-skill runs, the best one is expected to show a
  t-statistic of about 3.0, and about 10 of them pass t ≥ 2 [portfolio-31]. Our broker promotion ("best
  demo equity first") is itself performance chasing by equity. Darwinex ranks only after normalising
  every strategy to the same risk, against 10,000 random strategies, with a minimum track record
  [portfolio-30].
- **Platform path, cheapest first:**
  - P0: an offline meta study on the arena DB (no change).
  - P1: a portfolio view per agent (≈ 1 day).
  - P2: read-only data of other instruments (≈ 2–4 days).
  - P3: a single-slot rotation run, one position in any of several instruments (≈ 1 week).
  - P4: multi-leg portfolio accounts for pairs, risk parity and stacking (≈ 2–3 weeks).
  - P5: meta-allocator runs (≈ 1 week).
  - P6: correlation-aware broker allocation (≈ 2–3 days).
  - Also needed: a judge for slow and portfolio agents based on daily returns, since 30 trades never come.

## Findings

### Our instruments seen together (local data, 2024-01 → 2026-09)

These are descriptive figures from 691 common weekdays (closes at 20:00 UTC), computed from the lab candle
cache. They are not a test of any strategy. Script and full output:
`files/portfolio/local-instrument-correlations.md`.

- Annualised volatility: EURUSD/GBPUSD 6.6%, AUDUSD 8.8%, US30 13.9%, US500 15.1%, US100 20.7%, GOLD 21.4%,
  MSFT/AAPL ≈ 27%, OIL 38%, SILVER 44%, NVDA 47%, BTC 48%, AVGO 50%, TSLA 58%, NATGAS 63%, ETH 68%.
  The range is about 10×, so equal-capital portfolios are risk-dominated by crypto, gas and a few shares.
- Correlations of daily returns:
  - US100–US500 0.95, US30–US500 0.88.
  - GOLD–SILVER 0.77, BTC–ETH 0.82, EURUSD–GBPUSD 0.80.
  - OIL–NATGAS 0.15, GOLD–US500 0.18, OIL–US500 −0.04, BTC–US100 0.42.
  - The 8 shares: mean pairwise 0.38 (range 0.26–0.62). Each share's correlation with US100 is 0.53–0.74.
- Effective number of independent bets (eigenvalue participation ratio): ≈ 6.1 for all 20 instruments and
  ≈ 3.9 for the 8 shares.
- Median spreads as % of price:
  - Indices and FX: 0.005–0.01%.
  - GOLD: 0.011%.
  - Shares: 0.05–0.10%.
  - BTC 0.07%, ETH 0.09%, SILVER 0.08%, NATGAS 0.16%.
- Spreads between related instruments (daily volatility of the log spread; AR(1) half-life):
  - US100/US500: 0.49%; β-hedged, half-life ≈ 34 days.
  - US30/US500: 0.46%; ≈ 69 days.
  - GOLD/SILVER: 1.95%; ≈ 100 days. The ratio ranged 46–105.
  - ETH/BTC: 2.48%; ≈ 125 days. The ratio fell from 0.06 to 0.018.
  - OIL/GAS: 4.31%.
  - Half-lives estimated on 2.7 years are biased short and not significant. Read them as "months, not days".

### Cross-sectional momentum and reversal in a small universe

- **What it is.** Rank a set of instruments by past return. Hold the winners, and optionally short the losers.
- **Evidence across asset classes (before costs) [portfolio-08].** Asness, Moskowitz & Pedersen used tercile
  portfolios (P3 minus P1):
  - 18 country index futures: 8.7%/yr, Sharpe 0.73 (1978–2011).
  - 27 commodities: 12.4%/yr, Sharpe 0.53 (1972–2011).
  - Currencies: 3.5%/yr, Sharpe 0.34.
  - So 18–27 instruments are enough for a usable cross-sectional premium, with futures-level costs.
  - Value and momentum are negatively correlated (−0.4 to −0.6), so a 50/50 mix has a much higher Sharpe.
- **Industry and sector rotation.** Faber ranked 10 US sectors (1928–2009) by trailing 1–12-month return and
  held the top 1–3. This beat buy-and-hold in about 70% of years, by an estimated 3–6%/yr, before costs.
  Turnover was 100–400%/yr. The same held for 5 global asset classes (1973–2009). A 10-month SMA filter cut
  drawdowns [portfolio-10]. A sell filter (buy the top 3, sell when a name leaves the top 5) brings turnover
  under 100%.
- **Short-term reversal vs short-term momentum.** For broad universes, one-month reversal profits mostly vanish
  after costs. Among the highest-turnover, largest stocks the sign flips. Last month's winners keep winning,
  about as strongly as 12-month momentum, and the effect survives costs [portfolio-09]. Our 8 mega-caps are
  exactly such stocks, so a one-month rank among them should be read as momentum, not reversal.
  Confidence: medium. The paper sorts thousands of stocks, not 8.
- **With only 8 names.** Breadth is tiny (≈ 4 independent bets). A top-2 portfolio from 8 names differs from
  the basket mainly by its exposure to 2 stocks. Expect a gross information ratio around 0.2–0.4 at best
  (my estimate, low confidence). At monthly rebalancing, 30 "trades" take 2–3 years. The 3 US indices are
  effectively one asset: US100 vs US500 is a growth/tech-vs-broad bet. Commodities (4 names: gold,
  silver, oil, gas) are too few for a cross-section. Time-series momentum on each fits better.
- **No public backtest found** of momentum among the "Magnificent 7" or the 8 largest Nasdaq names. Results
  would be dominated by NVDA in 2023–25.

### Dual momentum (Antonacci)

- **What it is.** Absolute momentum (is the asset's 12-month return above T-bills?) combined with relative
  momentum (which of two assets has the higher 12-month return?). Global Equity Momentum (GEM) works like
  this: if the S&P 500's 12-month excess return is positive, hold the stronger of the S&P 500 and non-US
  stocks; otherwise hold aggregate bonds. Rebalance monthly.
- **Evidence.** The original backtest covers 1974–2011 [portfolio-13]. Antonacci later extended it to
  1950–2018, treating 2012–2018 as out of sample, and a ReSolve replication found it attractive in and out of
  sample up to 2018 [portfolio-34]. No clean independent post-2018 record was found in this pass.
- **Instruments needed.** 2–3 (one risky pair and one safe asset). That is the smallest TAA. But we have no
  non-US equity index and no bonds. "Cash" (flat) is our only safe asset.

### Tactical asset allocation: GTAA, Keller's PAA/VAA/DAA/BAA, Kipnis' KDA, Allocate Smartly

- **Faber's GTAA [portfolio-11].** Hold each of 5 asset classes (US stocks, foreign stocks, bonds, REITs,
  commodities) when its price is above its 10-month SMA, else T-bills. Rebalance monthly.
  - In sample (1973–2012): 10.5%/yr at 7.0% volatility, vs 9.9% at 10.3% for buy-and-hold. Max drawdown
    under 10% vs 46%.
  - Out of sample: Concretum's extension through March 2025 (200-day SMA version) gives 6.05%/yr,
    Sharpe 0.68, max drawdown 11.7% [portfolio-12]. That is still decent risk-adjusted, but returns roughly
    halved.
- **Keller & Keuning [portfolio-14].** All four models trade ETFs monthly.
  - **PAA (2016):** 12 risky ETFs + IEF. The bond share is set by "breadth", the number of risky assets
    with negative SMA(12) momentum.
  - **VAA (2017):** a fast "13612W" momentum (12×r1m + 4×r3m + 2×r6m + r12m). The portfolio goes fully
    defensive if any asset in the offensive universe is negative.
  - **DAA (2018):** a separate "canary" universe (EEM, AGG) decides the switch.
  - **BAA (2022):** slow SMA(12) relative momentum plus the fast 13612W canary (SPY, VWO, VEA, BND; switch
    when any is negative). It is defensive about 60% of the time. Claimed ≥ 20%/yr with max drawdown
    ≤ 15% (1970–2022).
  - Allocate Smartly treats BAA as likely overfit and penalises it [portfolio-15]. Keller's own papers tune
    parameters such as B, TO and TD in sample. Confidence in the headline numbers: low.
- **Kipnis' KDA [portfolio-15].** 10 assets and canaries EEM/AGG, with the same 1-3-6-12 weighted momentum.
  Hold the top 5 with positive scores at minimum-variance weights; IEF or cash otherwise. Turnover is about
  7×/yr, and costs drag about 1.4%/yr. It is among the best risk-adjusted strategies on Allocate Smartly
  (1989–2019 backtest, no separate out-of-sample test).
- **Allocate Smartly's live tracking [portfolio-15].**
  - The site tracks 100+ strategies, net of 0.1% per trade. The median cost drag is 0.43%/yr.
  - In 2022 the average of 72 strategies had a max drawdown of −12.1%, vs −2.8% in 2000–02 and −7.1% in
    2007–08. Strategies that went to cash, or required momentum in the defensive asset, lost −8.0%. Those
    holding long bonds lost −17.3%.
  - Their conclusion: TAA timing worked, but the bond hedge failed.
- **Decay in general.** Across published equity anomalies, post-publication Sharpe is about 55% of in-sample
  (median ratio 0.55). The haircut grows by about 5 percentage points per year of publication date
  [portfolio-25]. Expect TAA backtests to halve.
- **Instruments needed.** 4–16, with at least one low-volatility defensive asset with positive carry (bonds).
  We have none. GOLD (21% volatility, ≈ 6%/yr long funding) and flat cash are poor substitutes.

### Pairs trading and cointegration in stocks

- **Gatev, Goetzmann & Rouwenhorst (GGR) [portfolio-01].** Pairs are matched by minimum distance between
  normalised prices over 12 months. Positions open when the spread passes 2 historical standard deviations
  and close at the next crossing. The test runs 6 months.
  - The top-20 pairs earned 1.44%/month on employed capital (0.81% on committed capital) over 1962–2002.
  - Waiting one day to trade cut this to 0.90%/month, which is an estimate of bid-ask costs.
  - Raw returns fell from 118 bp/month before 1989 to 38 bp/month after.
- **Do & Faff [portfolio-02].** Top-20 pairs earned 0.86%/month (1962–88), 0.37% (1989–2002) and 0.24%
  (2003–09). The main cause was more pairs that never converge. With full trading costs the baseline GGR
  rule is largely unprofitable. Industry-matched pairs with many zero-crossings stay slightly profitable,
  but 29 variants were tried [portfolio-03]. Pairs still did well in turbulent markets (2008).
- **Krauss review [portfolio-03].** Covers more than 90 papers. Cointegration and stochastic-control
  approaches do best out of sample. Commodity-futures pairs (Bianchi et al., 1990–2008) and spreads with a
  physical link (crack, crush, spark spreads) work. The gold–silver spread (Wahab & Cohn 1994) did not.
- **Practitioners.** A 2023 replication of the Avellaneda–Lee residual method (JPM vs XLF and SPY) lost money.
  The ETH vs BTC hourly version was slightly positive, mostly from long bias [portfolio-05]. HN
  practitioners: simple single-pair stat-arb "does not work anymore". What survives is broad and
  cross-sectional, and cost-sharing across many models matters.

### Our candidate spreads: index pairs, gold/silver, ETH/BTC, oil/gas

- **US100 vs US500 (and US30).**
  - For: correlation 0.95, spreads of 0.008% (a round trip on two legs costs ≈ 0.03%), and spread
    volatility ≈ 0.4–0.5%/day.
  - Against: the spread is a growth-vs-broad factor bet that trended for years. Month-long half-lives mean
    long holding periods. Both legs pay ≈ 8%/yr when long (0.03%/day on the long leg). No rigorous
    after-cost study was found; vendor blogs report mean reversion after extreme Nasdaq outperformance.
  - The cross-sectional momentum evidence for country indices [portfolio-08] argues for trading the ratio's
    *trend* rather than fading it. Confidence: low either way.
- **Gold/silver.**
  - BofA: cointegrated in only 20% of monthly windows since 1996, mostly in crises. The relationship broke
    in 2020 [portfolio-06].
  - Spread trading was unsuccessful in the 1990s literature [portfolio-03].
  - Locally the ratio swung from 105 to 46 in 2.7 years. Silver costs 0.075% to trade and gold pays ≈ 6%/yr
    long.
  - Verdict: do not run a ratio-fade agent as an edge. At most a control.
- **ETH/BTC.**
  - Correlation 0.82, but the ratio fell from 0.06 to 0.018 in our window: a trend, not mean reversion.
  - Crypto pairs papers find profits only in some sub-periods [portfolio-04].
  - At 1:1 both legs are fee-free long. Short crypto funding is not stated in the brief; check.
  - If anything, trade relative momentum: hold the stronger of the two.
- **Oil vs natural gas.**
  - Correlation of daily returns 0.15. The literature finds cointegration until about 2006–09 and a
    decoupling after the shale boom [portfolio-07].
  - Not a pair.
- **FX.** EURUSD–GBPUSD correlate 0.80 (an EUR/GBP cross in disguise). Spreads are tiny, but it was not
  researched here.

### Risk parity, inverse volatility, HRP, 1/N

- **Risk parity [portfolio-18].**
  - Weights inverse to volatility, levered to market risk. With US stocks and bonds (1926–2010): excess
    return 7.99%/yr, Sharpe 0.53, vs 3.84% and 0.25 for the value-weighted market and 0.40 for 60/40.
  - Broad sample (global stocks, bonds, credit, commodities, 1973–2010): Sharpe 0.61 vs 0.43.
  - The theory: leverage-averse investors overprice risky assets, so safe assets earn more per unit of
    risk.
  - The edge depends on a safe, positive-carry asset (bonds) and on borrowing near the T-bill rate.
- **HRP [portfolio-19].**
  - Clusters assets by correlation, then splits weights top-down by inverse variance. It needs no matrix
    inversion.
  - Monte Carlo test (10 assets, 1-year estimation window, monthly rebalance, 10,000 runs): out-of-sample
    variance 0.067 for HRP vs 0.093 for inverse-variance and 0.116 for minimum-variance (CLA).
  - The evidence is synthetic. Real-data comparisons are mixed (not collected in this pass).
- **1/N [portfolio-20].** None of 14 optimisers beat equal weights consistently on 7 datasets. Mean-variance
  needs about 3,000 months of data to beat 1/N with 25 assets. The same "forecast-combination puzzle" applies
  to weighting strategies: estimated weights rarely beat equal ones.
- **For us.**
  - Inverse-volatility weighting of runs or instruments is cheap and robust, and it is what our runs
    already do implicitly when they size by risk to an ATR stop.
  - Covariance-based methods (ERC, HRP) need a multi-instrument account.
  - Levered risk parity looks unattractive here: no bonds, and index funding of about 8%/yr.

### Leverage in portfolios: levered risk parity, return stacking, HFEA

- **Return stacking [portfolio-21].** Use futures so that $1 holds $2 of exposure, for example a 60/40 core
  plus a managed-futures overlay. "A diversifying strategy has to clear its financing cost." Their backtests
  assume T-bills + 0.5%.
  - The ETFs (RSST, RSSB) have existed since late 2023. Third-party pages show strong 2024–25 returns, but
    the record is short and was not verified here.
- **HFEA [portfolio-21].** 55/45 UPRO/TMF (3× stocks / 3× long bonds). A 60/40 version tracked from
  October 2018 fell from a peak of about $297k to a trough of $85k (roughly −71%) by September 2023. TMF
  alone fell about 90%. The stock–bond hedge failed when correlations turned positive in 2022.
- **On Capital.com.**
  - A stack (long US500 plus a trend overlay) pays about 8%/yr on long index notional. Return Stacked's
    funding is about 4.5–5% at today's T-bill rates. The overlay must clear roughly double the hurdle
    (my estimate from the brief's funding figures).
  - Shorts pay about 0. Shares and crypto at 1:1 pay nothing, but 1:1 cannot stack: notional is capped at
    0.9 × equity.
  - Stacking therefore only makes sense for overlays expected to earn well above 8%/yr on their notional.
    The evidence for that is thin.

### Trend-following portfolios with few instruments

- **A century of trend [portfolio-16].** 67 markets (commodities, equity indices, bonds, currencies), with
  1-, 3- and 12-month time-series momentum, each market sized to equal risk.
  - 1880–2013: 14.9%/yr gross, 11.2% after simulated 2-and-20 fees, 9.7% volatility, net Sharpe 0.77.
  - Correlation 0.00 with the S&P 500. Positive in every decade.
- **How many instruments [portfolio-17].**
  - Carver's rule-of-thumb Sharpe: 0.35 (1 instrument), 0.45 (2), 0.50 (3), 0.57 (5), 0.61 (8, one per
    asset class), 0.70 (37).
  - The diversification multiplier rises from 1.0 to about 2.0 with the first 8 instruments.
  - Most of the gain comes from the first 4–8 instruments in different asset classes.
- **Replication with few instruments.** The SG Trend Indicator uses about 10 liquid futures and reached a
  0.75 lifetime correlation with the SG Trend Index of real CTAs (SG note, not saved).
- **For us.** About 6 effective bets, with no bonds or rates. That puts us near Carver's 6-instrument line
  (≈ 0.58 gross, if the single-instrument rules are as good as his).
  - Funding hurts the long side: ≈ 8%/yr on index and share notional above 1:1, gold 6%, crypto 22%.
    Short positions pay ≈ 0.
  - So a trend portfolio sized to 10% volatility per instrument (about 0.5–0.7× notional on indices) loses
    roughly 2–3%/yr of long-side funding on indices while long. That is my arithmetic, not a measured
    figure.

### Meta-strategies 1: choosing strategies by recent performance

- **Allocate Smartly's tests on 100+ TAA strategies, 1973–2026 [portfolio-15].** None of these charged the
  cost of switching between strategies, so real results would be worse.
  - **Top-Y by trailing return:** higher return, but no combination beat the equal-weighted average on
    Sharpe or drawdown. 3–6-month lookbacks were the worst.
  - **Top-Y by trailing Sharpe:** no significant improvement either. Lookbacks of 12 months or more were
    better than shorter ones. The small edge has been "ineffective since 2011".
  - **Equity-curve trend filters on each strategy:** drawdown improved (cash has none), but return and
    Sharpe never beat always-on.
  - **Buying "distressed" strategies near their max drawdown:** small benefit only. The next-month rebound
    was market-wide, not specific to the distressed strategy.
  - **Their rule:** hold a broad, diverse set selected on multi-decade evidence. Drop only strategies far
    below their own history (more than 1.5 IQR under the first quartile of rolling 12–36-month returns).
- **Factor momentum [portfolio-22, portfolio-23].** In contrast to TAA strategies, equity factors are
  autocorrelated.
  - Ehsani & Linnainmaa: across 20 factors (1964–2015), the average factor earned 52–53 bp/month after a
    positive year vs 1–2 bp after a negative year. Time-series factor momentum (long winners, short losers)
    earned 4.2%/yr (t = 7.0). The cross-sectional version earned 2.8%/yr (t = 5.7).
  - Gupta & Kelly: 59 of 65 factors had positive time-series momentum. The effect held outside the US too.
  - Lesson: the *time-series* rule ("hold a strategy only while its trailing 12-month return is positive")
    is the one with evidence. Ranking strategies against each other adds less.
- **Timing the factor zoo [portfolio-24].** Covers more than 300 factors and 39 timing signals. Past factor
  returns and volatility were the strongest single predictors. The median timed factor beat its untimed
  version by about 2%/yr. The working paper's versions differ on the multifactor gain (8.6% vs 20%).
- **Why the results differ.** Factors are long-short risk premia with a positive mean and slow-moving
  crowding. Many arena runs probably have a mean of about zero minus costs. For them, past performance is
  mostly noise, and selecting on it selects variance (and leverage).

### Meta-strategies 2: bandits, Bayesian averaging, ensembles

- **Thompson sampling across strategies [portfolio-26].** Zhu et al. (IJCAI 2019) treat classic portfolio
  strategies as arms (Beta posteriors updated on a reward tied to risk preference). They report better
  Sharpe and drawdown than each strategy on standard datasets. The test is a backtest, few arms, and no
  regime-shift stress.
  - Later work adds discounting for non-stationarity: adaptive discounted Thompson sampling (arXiv
    2410.04217) and budgeted Thompson sampling on industry ETFs (arXiv 2101.06592). Neither was
    downloaded.
  - No live or after-cost evidence of bandit allocation across trading strategies was found.
- **Equal-weight ensembles are the hard baseline [portfolio-20, portfolio-15].** Allocate Smartly's
  "average strategy" beat every performance-chasing selector on Sharpe. The aggregate of 100 strategies'
  allocations, traded monthly (2000–2026), earned 9.2%/yr, Sharpe 1.06 and max drawdown −10.6%, vs 60/40
  at 7.0%, 0.56 and −29.5% [portfolio-15].
  - Caveats: there is no hold-out, and many of the strategies were published during the test window.
- **Bayesian model averaging.** Not researched in depth. The practical version is shrinkage: weights
  proportional to the posterior mean of each run's return, with a prior centred at zero. That is close to
  1/N when evidence is weak, which matches the 1/N finding.

### Meta-strategies 3: copy trading and the persistence of top traders

- **eToro [portfolio-27].** Data: 164,634 traders, mostly FX, April–October 2013.
  - The average trader lost 7.7 bp per trade. Non-copiers earned +1.2 bp. Mirrored trades lost 61 bp.
  - The autocorrelation of a trader's 30-day rolling performance "closely matches the null model". Past
    performance did not predict future performance.
  - Copiers chose leaders by popularity, which is weakly linked to performance. "Explorers" who revised
    their choices often did better.
- **Lab experiment [portfolio-28].** Showing others' success raised risk taking, and the option to copy
  raised it more. Of those who copied, 88% copied someone who had chosen the riskiest portfolio. Rankings
  by return select risk takers.
- **wikifolio [portfolio-29].** Across 1,084 certificates (2012–13), there was no outperformance on average.
  The best did earn short-term excess returns. Under-performing signal providers then gambled on
  lottery-like stocks (a later paper by the same group).
- **ZuluTrade.** Only forum anecdotes were found: top-ranked providers often blow up after attracting
  followers. No academic study was found.
- **Lesson for the arena.** Ranking runs by equity or return (as our broker promotion does) will favour the
  most leveraged and most volatile runs. Rank on risk-normalised statistics instead (t-statistic, return
  per unit of volatility), and compare against random strategies at the same risk.

### Meta-strategies 4: Darwinex DARWIN methodology

- **Risk normalisation [portfolio-30].** Every strategy is rescaled to a monthly VaR target of 6.5% (95%),
  measured over the last 45 days with exposure. The target floats between 3.25% and 6.5% with the
  strategy's own VaR history (6-month look-back). The VaR ratio is updated hourly. Leverage is capped while
  positions are open (16.25 under 15 min, 9.75 over 60 min).
- **Scoring.** Twelve attributes are scored 0–10.
  - Performance (Pf) ranks the risk-adjusted return against 10,000 random strategies at the same risk, over
    the last 12 "D-Periods" (about trading months).
  - Experience (Ex) needs 12 D-Periods for the full score.
  - Other attributes include risk stability and market correlation.
- **DarwinIA allocations.**
  - SILVER: a monthly rating from this month's return, the prior 5 months' return and the 6-month max
    drawdown. A rating of 75 or more earns about €25k–€375k for 3 months.
  - GOLD: more than 8 months of history and, for example, a 1-year return above 20% with return/drawdown
    above 2.5. Allocation for 6 months.
  - A third-party page mentions a 0.95 correlation cap between allocated DARWINs.
- **Evidence.** No independent study of whether DarwinIA allocations made money was found. The design is
  still a ready-made template for us: risk-normalise, compare with random strategies at the same risk,
  require experience, and allocate for fixed terms.

### Selection bias: deflated Sharpe ratio and probability of backtest overfitting

- **Deflated Sharpe ratio [portfolio-31].** With N independent trials, the expected maximum standardised
  Sharpe (here, t-statistic) is ≈ (1−γ)·Φ⁻¹(1−1/N) + γ·Φ⁻¹(1−1/(N·e)), where γ ≈ 0.577.
  - For N = 50 it is 2.3. For N = 450–480 it is 3.0 (computed for this note).
  - At t ≥ 2, about 2.3% of no-skill runs pass, about 10 of 450. That matches LIFECYCLE.md's "about 2%".
  - The deflated Sharpe ratio also corrects for skewness, kurtosis and track length.
- **Probability of backtest overfitting [portfolio-32].** Combinatorially symmetric cross-validation (CSCV)
  splits the history into S blocks. On each half it checks whether the in-sample best configuration is
  below the median out of sample. That gives a direct test of whether "pick the leader" works on the
  arena's own data.

## For the arena

### Platform changes, smallest first

| id | change | what it enables | size |
|---|---|---|---|
| P0 | **Offline meta study** on the arena DB (`equity` table: hourly for 30 days then daily; `trades`) | test strategy-selection rules on our own runs before building anything | script, 1–2 days, no platform change |
| P1 | **Portfolio view**: aggregate runs (per agent, per family, or a chosen set) into one equal-capital curve; Sharpe, drawdown, run correlation matrix, effective number of bets | judge "trend across 20 instruments" or "basket of 8 shares" as one portfolio | ≈ 1 day (review script + dashboard panel) |
| P2 | **Read-only other instruments**: `extraInstruments: ['US500']`, `ctx.market('US500') → { bars, ta }`, aligned on closed bars ≤ `ctx.time` (watch session differences: crypto 7 days, shares 24h weekdays) | canary/breadth filters, relative-strength filters, lead–lag signals; still one position | ≈ 2–4 days (the arena has one `MarketEngine` per epic; expose its series) |
| P3 | **Single-slot rotation run**: `instruments` is a universe; the run holds at most one position, in any of them (`ctx.buy({ epic })`) | dual momentum, top-1 rotation of the 8 shares, BTC↔ETH switch; rank-k variants approximate top-k; trade t-stat unchanged | ≈ 1 week (position keyed by epic, quotes for all, broker mirror per trade epic) |
| P4 | **Multi-position portfolio account**: positions keyed by epic, shared equity and margin, `ctx.setWeights({...})` with rebalancing bands, per-leg stops, pair-trade accounting | pairs, top-3 rotation, risk parity/HRP, return stacking, TAA analogues | ≈ 2–3 weeks; touches run.ts (736 lines, single `position`), broker.ts, metrics, lifecycle |
| P5 | **Meta-allocator run**: paper capital over other runs; reads their closed daily returns with a 1-day lag; weekly weights; equity = Σ wᵢ·rᵢ − switching cost; no broker orders | bandits, strategy momentum, inverse-vol and HRP across runs, live | ≈ 1 week after P0 |
| P6 | **Correlation-aware broker allocation**: replace "best demo equity first" with risk-normalised rank (t-stat or return/vol) plus diversity limits (max k runs per instrument per account; greedy add of the lowest-average-correlation run), with minimum slot terms | mirrored book that is not just the most leveraged runs; Darwinex-like | ≈ 2–3 days in `broker.ts` / `slots.ts` |
| P7 | **Judge for slow and portfolio agents**: daily-return Sharpe (or t of daily excess return vs a benchmark such as equal-weight basket or 1/N of runs), judged after 6–12 months; "portfolio monkeys" with random weights | monthly-rebalanced agents never reach 30 trades in 28 days; the current t-stat-per-trade judge does not fit | ≈ 1–2 days in `lifecycle.ts` |

### Feasible now (no platform change, or P1 for the read-out)

1. **12-month time-series momentum on all 20 instruments** (Moskowitz–Ooi–Pedersen / Hurst textbook)
   - Timeframe `1d`, rebalance on the last trading day of the month.
   - Direction: the sign of the 252-day return.
   - Size: exposure = 10% annual ÷ 60-day realised volatility, capped at 2× (1:3 tier). Shares and crypto
     run long-only at 1:1, because shorts there would pay dividends or funding we do not model.
   - Why: this is the managed-futures building block. Its sum over instruments is the trend portfolio.
     The arena's `tsmom` is 5–20-day on 4h, so this is distinct.
   - Needs P1 to read as a portfolio and P7 to be judged (about 1–3 trades per instrument per year).
     Confidence that the portfolio has positive expectancy over 5+ years: medium. Over months: unknowable.
2. **Inverse-volatility fee-free basket**: the 8 shares + BTCUSD + ETHUSD at 1:1, long-only.
   - Exposure = min(0.9, 15% ÷ 60-day realised volatility), rebalanced monthly.
   - The sum of the runs is naive risk parity among risk assets. The benchmark is the existing buy-hold
     basket at 1:1.
   - This is the journal's candidate "volatility-managed shares at 1:1" extended to crypto.
3. **Faber timing on fee-free legs**: same instruments and tier.
   - Long when the month-end close is above the 200-day SMA (≈ 10 months), else flat.
   - It is GTAA's building block without bonds. The sum of the runs is a "GTAA-lite" portfolio.
4. **P0 study: does past performance of arena runs predict future performance?** Pool: non-control runs
   live ≥ 28 days; daily returns from the `equity` table. Allocators, with parameters fixed now:
   - (a) 1/N of the pool, the baseline.
   - (b) top 20 by trailing 60-day trade t-statistic, rebalanced weekly.
   - (c) time-series strategy momentum: hold a run only if its trailing 90-day return > 0. This is
     Ehsani–Linnainmaa's rule shortened to our history.
   - (d) discounted Thompson sampling. Normal posterior on each run's mean daily return, prior N(0, σ²),
     discount 0.98/day. Each week, sample, pick the top 20 samples, equal weight.
   - (e) inverse-volatility over all runs (60-day volatility), Darwinex-style risk normalisation.
   - (f) HRP over runs (60-day correlations).
   - Score each by Sharpe vs (a), deflated for 6 trials [portfolio-31], and by PBO/CSCV [portfolio-32].
     Add a placebo: the same allocators run on the monkeys only.
   - Prediction from the evidence: (b) ≈ (a) on Sharpe with higher volatility; (c) and (e) slightly
     better; (f) lowest volatility.
   - Run it once there are 3+ months of history (from about January 2027). Earlier results are noise.
5. **P0 study: crowd positioning**. For each instrument, take the net fraction of live runs long minus short
   at each daily close, and test whether it predicts the next day's or week's return (sign and size). Allocate
   Smartly's "wisdom of 100 strategies" is the analogue [portfolio-15]. Our crowd is mostly trend and
   mean-reversion agents, so its vote is an ensemble signal. A contrarian reading is also plausible. Report
   both without picking one in advance.

### Needs P2 (read-only other instruments)

6. **Breadth/canary filter for long-only agents** (Keller's DAA/BAA idea [portfolio-14]).
   - Allow new longs on US indices and shares only when the canaries have positive 13612W momentum on
     daily closes (12×r21 + 4×r63 + 2×r126 + r252 > 0).
   - The textbook canaries (EEM, AGG, VWO, BND) are not on our list. An adaptation would use US500 and
     BTCUSD as risk-on canaries. Mark it as an adaptation: low confidence.
7. **Relative-strength filter on index pairs**: trade US100 trend entries only when the US100/US500 ratio
   is above its own 126-day SMA, else trade nothing. This follows cross-sectional momentum among indices
   [portfolio-08].

### Needs P3 (single-slot rotation)

8. **Mega-cap rotation.**
   - Universe: the 8 shares, 1:1 (fee-free), `1d` bars, month-end rebalance.
   - Rank by 12-1-month return (252-day return skipping the last 21 days).
   - Variant `rank1` holds the top name. Variant `rank2` holds the second, so rank1 + rank2 together form
     a top-2 portfolio.
   - Variant `st1m` ranks by last month's return instead (short-term momentum in high-turnover large caps
     [portfolio-09]).
   - Absolute filter: hold only if that name's 252-day return > 0, else flat.
   - Benchmark: the buy-hold 8-share basket.
   - Expect a low information ratio (≈ 4 independent bets). Judge with P7 after 12 months.
9. **Dual-momentum switch on what we have**: universe US500, GOLD, BTCUSD.
   - Each month hold the one with the highest 252-day return if that return > 0, else flat.
   - Antonacci's relative + absolute momentum [portfolio-13], adapted: no bonds or non-US stocks.
   - Tier 1:1 (BTC fee-free; US500 and GOLD pay funding).
10. **BTC↔ETH relative momentum**: hold the coin with the higher 63-day return if it is > 0, else flat.
    1:1, weekly rebalance, 7 days a week. This fits the trending ETH/BTC ratio, not a fade.

### Needs P4 (multi-leg portfolio accounts)

11. **GGR distance pairs among the 8 shares** [portfolio-01].
    - Form on 252 days of normalised prices. Trade the 4 pairs with the smallest distance for 126 days.
    - Open when the spread passes 2σ, close at the crossing, force-close after 126 days.
    - Run at 1:1, where longs are fee-free and shorts ≈ 0 (dividends on shorts not modelled).
    - Evidence says this has decayed to about zero after costs [portfolio-02]. Run it as a documented test.
      Only 28 possible pairs.
12. **β-hedged US100/US500 z-score pair.**
    - Hedge ratio β from 120-day OLS of log prices. Enter at |z| > 2 of the 60-day spread, exit at 0, stop
      at |z| > 4, time stop 40 days. Tier 1:3.
    - Costs about 0.03% per round trip plus ≈ 8%/yr on the long leg.
    - Low confidence. The literature's index-pair evidence is vendor anecdotes.
13. **Inverse-volatility or HRP multi-asset portfolio**: US500, GOLD, OIL_CRUDE, EURUSD (short or long by
    trend), BTCUSD. HRP on 252-day correlations, monthly rebalance, 10% portfolio volatility target. Tier 1:3.
14. **Return-stacking test**: the fee-free core (8 shares at 1:1) cannot be levered, so the test runs on
    the 1:3 tier.
    - Core: long US500 at 1× equity.
    - Overlay: item 1's trend portfolio at 1× notional.
    - The question: does the overlay clear the ≈ 8%/yr long-funding hurdle [portfolio-21]? Expect no unless
      trend is strong.

### Needs P5 / P6 (meta level)

15. **Live meta-allocators**: promote whichever P0 allocators survive to P5 runs, with parameters frozen.
16. **Broker allocation (P6)**.
    - Rank runs within a tier by trade t-statistic (risk-normalised), not equity.
    - At most 3 mirrored runs per (agent family, instrument) per account. Fill the rest greedily by lowest
      average correlation of daily returns with the runs already mirrored.
    - A promoted run keeps its slot for at least 2 weeks.
    - This follows Darwinex's practice and the copy-trading evidence that return rankings select risk
      [portfolio-28, portfolio-30].

### Cost notes specific to Capital.com

- **Spreads are not the problem for monthly portfolios.** Indices and FX cost under 0.01% per side, shares
  and crypto 0.05–0.1%. A top-1 monthly rotation of shares costs about 12 × 0.08% ≈ 1%/yr. A monthly
  rebalance of an inverse-volatility basket costs a few bp per month.
- **Funding decides where portfolios can live.**
  - Long index notional costs ≈ 8%/yr, gold ≈ 6%, crypto ≈ 22%. Shorts pay ≈ 0.
  - At 1:1, shares and crypto pay nothing. Long-only portfolios of shares and crypto belong on 1:1.
  - Long index or gold exposure held for months is expensive at any tier.
  - Pairs pay funding on one leg. Levered risk parity and return stacking pay it on all the extra notional.
- **Dividends on share CFDs are not modelled.** Long receives, short pays. Mega-cap yields are under about
  1%/yr, but a long-short share pair is biased slightly until they are.

## Open questions

- Do arena runs show any persistence? This is the P0 study. It needs about 3 months of live history and
  must use deflated statistics. It is the single most useful question for the meta level.
- Real-data comparisons of HRP vs inverse-volatility vs 1/N (e.g. Raffinot; Jain & Jain). This pass only has
  the original Monte Carlo [portfolio-19].
- Post-2018 live records of GEM/dual momentum and of the Keller models (Allocate Smartly members-only pages,
  Alpha Architect replications).
- Index-pair (US100/US500, US30/US500) evidence after costs from a serious source. Check Quantpedia and
  Kakushadze & Serur's "151 Trading Strategies".
- Capital.com details for P4 designs: the funding rate on short crypto and short shares at each tier, and
  whether the demo applies dividend adjustments.
- SG Trend Indicator rules (10 futures) as a fixed recipe for a small trend portfolio, and how many of its
  markets have a CFD on our list.
- Bandit allocation with switching costs and non-stationarity: is there any live evidence? (arXiv
  2410.04217 and 2101.06592 were not downloaded.)
- Whether the crowd's net positioning (P0 item 5) is contrarian or confirming, and whether Capital.com's own
  client-sentiment feed (percent of clients long) is available through the API as an external crowd
  signal.
- Faber's 2013 GTAA update PDF, Antonacci's paper, Do & Faff, and Medhat & Schmeling were not downloaded
  (SSRN, paywalls or failed links).

## Sources

| id | title | authors / site | year | kind | link | local copy |
|---|---|---|---|---|---|---|
| portfolio-01 | Pairs Trading: Performance of a Relative-Value Arbitrage Rule | Gatev, Goetzmann, Rouwenhorst | 2006 | paper | https://ssrn.com/abstract=141615 | files/portfolio/gatev-2006-pairs-trading.pdf |
| portfolio-02 | Does Simple Pairs Trading Still Work? | Do, Faff (FAJ) | 2010 | paper | https://ideas.repec.org/a/taf/ufajxx/v66y2010i4p83-95.html | — |
| portfolio-03 | Statistical Arbitrage Pairs Trading Strategies: Review and Outlook | Krauss | 2017 | paper | https://www.iwf.rw.fau.de/files/2016/03/09-2015.pdf | files/portfolio/krauss-2017-stat-arb-pairs-review.pdf |
| portfolio-04 | Pairs Trading in Cryptocurrency Markets | Fil, Kristoufek (IEEE Access) | 2020 | paper | https://ieeexplore.ieee.org/document/9200323/ | — |
| portfolio-05 | Statistical Arbitrage – An Easy Walkthrough (+ HN thread) | Markwick / Hacker News | 2023 | blog | https://dm13450.github.io/2023/07/15/Stat-Arb-Walkthrough.html | files/portfolio/hn-stat-arb-walkthrough.md |
| portfolio-06 | Gold/silver ratio near two-year high; BofA cointegration test | Kitco (Bank of America) | 2025 | blog | https://www.kitco.com/news/article/2025-04-02/goldsilver-ratio-trading-near-two-year-high-dont-expect-it-fall-anytime | files/portfolio/kitco-gold-silver-cointegration.md |
| portfolio-07 | The Weak Tie Between Natural Gas and Oil Prices | Ramberg, Parsons (MIT CEEPR) | 2010 | paper | https://dspace.mit.edu/handle/1721.1/61777 | — |
| portfolio-08 | Value and Momentum Everywhere | Asness, Moskowitz, Pedersen | 2013 | paper | https://pages.stern.nyu.edu/~lpederse/papers/ValMomEverywhere.pdf | files/portfolio/asness-2013-value-momentum-everywhere.pdf |
| portfolio-09 | Short-term Momentum | Medhat, Schmeling (RFS) | 2022 | paper | https://repec.cepr.org/repec/cpr/ceprdp/DP15857.pdf | — |
| portfolio-10 | Relative Strength Strategies for Investing | Faber (Cambria) | 2010 | paper | https://ssrn.com/abstract=1585517 | files/portfolio/faber-2010-relative-strength-strategies.pdf |
| portfolio-11 | A Quantitative Approach to Tactical Asset Allocation | Faber | 2007/2013 | paper | https://ssrn.com/abstract=962461 | — |
| portfolio-12 | Global Tactical Asset Allocation (out-of-sample extension to 2025) | Concretum Group | 2025 | blog | https://concretumgroup.com/global-tactical-asset-allocation/ | — |
| portfolio-13 | Risk Premia Harvesting Through Dual Momentum | Antonacci | 2012 | paper | https://ssrn.com/abstract=2042750 | — |
| portfolio-14 | Relative and Absolute Momentum in Times of Rising/Low Yields: Bold Asset Allocation (covers PAA, VAA, DAA) | Keller | 2022 | paper | https://ssrn.com/abstract=4166845 | files/portfolio/keller-2022-bold-asset-allocation.pdf |
| portfolio-15 | Allocate Smartly: selecting strategies by recent performance, equity-curve trend, distressed strategies, wisdom of 100 strategies, costs, 2022, KDA | Allocate Smartly | 2016–2026 | blog | https://allocatesmartly.com/selecting-taa-strategies-based-on-recent-performance-part-1/ | files/portfolio/allocatesmartly-strategy-selection.md |
| portfolio-16 | A Century of Evidence on Trend-Following Investing | Hurst, Ooi, Pedersen (AQR) | 2014/2017 | paper | https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing | files/portfolio/hurst-2017-century-trend-following.pdf |
| portfolio-17 | Diversification and small account size | Carver (qoppac) | 2016 | blog | https://qoppac.blogspot.com/2016/03/diversification-and-small-account-size.html | files/portfolio/qoppac-diversification-small-account.md |
| portfolio-18 | Leverage Aversion and Risk Parity | Asness, Frazzini, Pedersen (FAJ) | 2012 | paper | https://www.aqr.com/-/media/AQR/Documents/Insights/Journal-Article/Leverage-Aversion-and-Risk-Parity.pdf | files/portfolio/asness-2012-leverage-aversion-risk-parity.pdf |
| portfolio-19 | Building Diversified Portfolios that Outperform Out-of-Sample (HRP) | López de Prado | 2016 | paper | https://ssrn.com/abstract=2708678 | files/portfolio/lopezdeprado-2016-hierarchical-risk-parity.pdf |
| portfolio-20 | Optimal Versus Naive Diversification: How Inefficient is the 1/N Portfolio Strategy? | DeMiguel, Garlappi, Uppal (RFS) | 2009 | paper | https://ideas.repec.org/a/oup/rfinst/v22y2009i5p1915-1953.html | — |
| portfolio-21 | What is return stacking; HFEA leveraged risk-parity case | Return Stacked (Hoffstein et al.); InvestmentMoats | 2021–2025 | blog | https://www.returnstacked.com/what-is-return-stacking/ | files/portfolio/returnstacked-and-hfea-leveraged-portfolios.md |
| portfolio-22 | Factor Momentum and the Momentum Factor | Ehsani, Linnainmaa (NBER w25551; JF 2022) | 2019 | paper | https://www.nber.org/papers/w25551 | files/portfolio/ehsani-2019-factor-momentum.pdf |
| portfolio-23 | Factor Momentum Everywhere | Gupta, Kelly (JPM) | 2019 | paper | https://ssrn.com/abstract=3300728 | — |
| portfolio-24 | Timing the Factor Zoo | Neuhierl, Randl, Reschenhofer, Zechner | 2023 | paper | https://ssrn.com/abstract=4376898 | — |
| portfolio-25 | Why and How Systematic Strategies Decay | Falck, Rej, Thesmar (CFM) | 2021 | paper | https://arxiv.org/abs/2105.01380 | files/portfolio/falck-2021-why-strategies-decay.pdf |
| portfolio-26 | Adaptive Portfolio by Solving Multi-armed Bandit via Thompson Sampling | Zhu, Zheng, Wang, Li, Liang | 2019 | paper | https://arxiv.org/abs/1911.05309 | files/portfolio/zhu-2019-thompson-sampling-adaptive-portfolio.pdf |
| portfolio-27 | When Influence Misleads: Limits of Social Learning in Trading Networks (eToro data) | Joseph, Riedl, Pentland, Moro | 2025 | paper | https://arxiv.org/abs/2507.01817 | files/portfolio/joseph-2025-social-learning-trading-networks.pdf |
| portfolio-28 | Copy Trading | Apesteguia, Oechssler, Weidenholzer (Mgmt Sci) | 2020 | paper | https://econ-papers.upf.edu/en/onepaper.php?id=1615 | files/portfolio/apesteguia-2020-copy-trading.pdf |
| portfolio-29 | Benefits from social trading? Empirical evidence for certificates on wikifolios | Oehler, Horn, Wendt (IRFA) | 2016 | paper | https://ideas.repec.org/a/eee/finana/v46y2016icp202-210.html | — |
| portfolio-30 | Darwinex risk engine, investable attributes (Pf, Ex), DarwinIA | Darwinex | 2026 | doc | https://help.darwinex.com/risk-manager | files/portfolio/darwinex-risk-engine-and-ranking.md |
| portfolio-31 | The Deflated Sharpe Ratio | Bailey, López de Prado | 2014 | paper | https://ssrn.com/abstract=2460551 | files/portfolio/bailey-2014-deflated-sharpe-ratio.pdf |
| portfolio-32 | The Probability of Backtest Overfitting | Bailey, Borwein, López de Prado, Zhu | 2015 | paper | https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf | files/portfolio/bailey-2016-probability-backtest-overfitting.pdf |
| portfolio-33 | Our instruments together: vols, correlations, spreads (2024-01 → 2026-09) | this project (lab candles) | 2026 | doc | apps/backend/data/candles | files/portfolio/local-instrument-correlations.md |
| portfolio-34 | Global Equity Momentum: A Craftsman's Perspective | Antonacci (Advisor Perspectives) | 2019 | blog | https://www.advisorperspectives.com/articles/2019/05/06/global-equity-momentum-a-craftsmans-perspective | — |
