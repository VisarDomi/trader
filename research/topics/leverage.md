# Leverage: using it well or badly, and strategies where leverage is the point

_First pass 2026-10-13._

## In short

- **Growth-optimal (Kelly) leverage is L\* = (μ − funding) / σ² = Sharpe ÷ volatility.** Betting 2× Kelly gives zero
  growth; half Kelly keeps 75% of the growth, and the chance of ever losing half the account drops from 1/2 to 1/8
  [leverage-02]. Leverage multiplies your error in μ, and μ is the thing you cannot estimate: over our 2.75 years of
  data the standard error of an optimal-leverage estimate is ±3.7 on US500 and ±8.9 on EURUSD.
- **Our broker's funding decides most of it.** Long index and share CFDs pay about 8.1% a year on the whole notional,
  gold 5.9%, crypto 22.5% (from `instruments.ts`). The long-run index drift is about the same as that funding, so a
  *static* leveraged long has L\* ≈ 0–1. Ole Peters measured the S&P 500's optimal leverage at 1.1 ± 0.6 (1927–2020),
  and ≈1.0 once costs are included [leverage-06]. The 2024–26 bull market says ≈4, but that is one lucky sample.
- **Leverage only paid in the literature when it was timed or volatility-scaled**: the 200-day filter of "Leverage for
  the Long Run" (Sharpe 0.51 vs 0.30, 1928–2015, but with a flattering 1% financing cost) [leverage-09, leverage-10];
  volatility targeting raised the equity Sharpe ratio from 0.40 to about 0.5 [leverage-19], although in real time it
  did not systematically beat the unmanaged versions across 103 strategies [leverage-20]. Daily-reset leverage
  (leveraged ETFs) loses about L(L−1)σ²/2 a year to volatility drag [leverage-08]. TQQQ fell 82% in 2021–22 while QQQ
  fell 33% [leverage-11].
- **High retail leverage loses money. The evidence is consistent:** 74–89% of EU retail CFD accounts lose money
  [leverage-21]; 79.75% at Capital.com today [leverage-23]. FX traders in the top leverage quintile lost 44% a month
  against 3% for the bottom quintile, and the US 50:1 cap cut high-leverage traders' losses by 40% [leverage-24].
  Liquidated BitMEX traders averaged 60× [leverage-27]. When ESMA capped leverage, traders moved to riskier
  underlyings [leverage-25].
- **For our tiers:** fee-free holds and volatility harvesting belong at 1:1. Timed or vol-scaled index exposure of 1–3×
  belongs at 1:2–1:5. Intraday risk-sized agents (no funding) belong at 1:5–1:20. **Nothing in the arena rationally
  *uses* 1:50–1:200 overnight**: full Kelly would need a Sharpe ratio of 3 (EURUSD at 1:50) up to 40 (gold at 1:200).
  A full-margin 1:200 position was margin-called within one day on 35–65% of days in our 2024–26 data. The tier is
  rational only as headroom for tight-stop intraday agents, for "bold play" toward a fixed goal [leverage-30], and for
  ruin controls.
- **Leverage as the mechanism, feasible now:** a 200-day leverage-rotation agent, a constant-leverage (LETF) ladder next
  to the existing fixed-units ladder, Shannon's-demon rebalancing on fee-free crypto and shares at 1:1, a fractional-Kelly
  ladder, CPPI, and martingale and negative-skew monkeys as controls. All are possible with today's SDK. Resizing means
  close-and-reopen at a full spread, so a `resize`/partial-close primitive is the most useful platform change.
- **Capital.com pays no positive FX carry.** As of 2026-10-06, both sides of every FX pair pay or earn ≈0. Only shorts of
  gold and silver (+2.9%/yr) and BTC and ETH (+5.0%/yr) are paid. This settles the journal's "funding-aware FX carry"
  candidate.

## Findings

### Kelly criterion and fractional Kelly

- **What:** Kelly (1956) showed that a gambler who maximizes the expected log of wealth maximizes the long-run growth
  rate, and that this rate equals the information rate of his edge [leverage-01]. For an even-money bet with win
  probability p, bet f\* = 2p − 1. For a continuous asset, use leverage f\* = (μ − r)/σ² ([leverage-02], section 7). The
  maximum growth is g\* = r + SR²/2. At a fraction c of Kelly, growth is c(2 − c) of the maximum. Volatility is c times
  as large. The probability of ever falling to a fraction x of the start is x^(2/c − 1). So the chance of ever halving
  is 1/2 at full Kelly, 1/8 at half Kelly, and certain at 2× Kelly, where growth is zero ([leverage-02], eqs. 7.6, 7.13).
  Full Kelly doubles before halving 2/3 of the time; half Kelly does so 8/9 of the time.
- **Thorp's stock-market numbers** (rough 1990s estimates: m = 11%, s = 15%, r = 6%) give f\* = 2.2× on the S&P 500. If
  borrowing costs 8% rather than 6%, f\* falls to 1.33×. "Note how greatly f\* is reduced" [leverage-02]. He uses half
  Kelly or less in practice. Two reasons: estimated edges regress toward the mean, and overbetting with an overestimated
  edge is ruinous. With f = 1.5 × estimated Kelly and a true edge half the estimate, growth is negative.
- **Good and bad properties** [leverage-03]. Good: Kelly maximizes asymptotic growth, minimizes the time to large goals,
  and never risks ruin with infinitely divisible bets. Bad: the bets can be a large fraction of wealth, and short-run
  paths are rough. Even 700 bets with a 14% edge can turn $1,000 into $18. With n wins and n losses a fixed-fraction
  bettor is behind: W = W₀(1 − f²)ⁿ. This is the discrete form of volatility drag.
- **How people actually bet** [leverage-04]: 61 finance students and young professionals got $25 and a coin that landed
  heads 60% of the time (Kelly bet: 20% per flip). 28% went bust, only 21% reached the $250 cap, and the average payout
  was $91. 18 of the 61 bet everything on one flip. Several believed in martingale doubling. Only 5 had heard of Kelly.
- **Confidence:** high for the mathematics. Applying it needs μ and σ of the *strategy*, and μ is the hard part.

### Volatility drag: arithmetic vs geometric return

- For a constant leverage L on an asset with drift μ, volatility σ and funding f per unit of notional, the log
  growth is g(L) = L(μ − f) − L²σ²/2 (cash earns nothing in a CFD account). It is a parabola. Its peak is the Kelly
  leverage, and growth returns to zero at twice that.
- Arena numbers (US500, σ = 16.3%, f = 8.1%) [leverage-32]. With the long-run μ ≈ 8.5% (price plus dividends):
  g(1) = −0.9%, g(2) = −4.5%, g(3) = −10.8% a year. With the 2024–26 μ = 18.7%: g(1) = 9.3%, g(4) = 21.1% (the peak),
  g(8) ≈ 0. Same instrument, opposite conclusions; only the unknowable μ differs.
- The drag of a daily-rebalanced L× position relative to L × the unlevered log growth is L(L−1)σ²/2 a year. On US500
  that is 2.7% at 2×, 8% at 3×, 27% at 5× and 120% at 10×. On BTC it is 22% at 2× and 67% at 3× [leverage-32].

### Risk of ruin and the gambler's ruin

- With a fixed fraction and continuous prices, ruin is impossible, but deep drawdowns are not: P(ever reaching x) =
  x^(2/c − 1), as above. With margin rules, ruin is real. Our engine closes a position when equity falls below half its
  margin. At exposure x and tier T, the adverse move that triggers it is d = 1/x − 0.5/T. That is 0.61/T at full
  margin: 0.31% at 1:200, 0.61% at 1:100, 1.2% at 1:50, 3.1% at 1:20 and 12% at 1:5.
- Empirical hit rates from our data [leverage-32]: at 1:200 and full margin, a long was margin-called within one day
  on 56% of days (US500), 65% (US100), 62% (GOLD) and 35% (EURUSD). Within 21 days the rate was 84–93%. At 1:20 and full
  margin: 30% within 21 days on US500 and 74% on BTCUSD. The ladder's 10%-margin sizing (20× at 1:200, d = 4.75%) was hit
  within a year on 57% of start days (US500) and 68% (US100). These are in-sample rates from an up-market and understate
  the long-side risk.
- Classic gambler's ruin in a subfair game (the spread makes every trade subfair): with a fixed stake, the probability of
  ruin goes to 1. Doubling (martingale) only reshapes the path: many small wins, then one loss bigger than the account.
  The leverage cap acts as the casino's table limit. It is exactly what stops the doubling.

### Ergodicity economics: optimal leverage and "leverage efficiency"

- **Peters (2011)** [leverage-05]: wealth processes are multiplicative and non-ergodic. The ensemble-average (expected)
  return grows linearly with leverage and invites unlimited leverage. The time-average growth of one investor over time
  is g(L) above, which has a unique optimum: Kelly reached through the physics of time averages, with no utility function.
  "The Sharpe ratio is insensitive to leverage." For the arena: the dashboard's tier *averages* are ensemble averages. The
  *median* run and the log-growth rate are what one account actually experiences.
- **Peters & Adamou, "Leverage efficiency"** (2011, v3 2020) [leverage-06]: they hypothesize that markets push the
  optimal leverage of the market portfolio toward 1. If it stayed above 1, everyone would borrow until prices and
  volatility brought it back; below 1, the opposite. Data: S&P 500 against fed funds, 1927–2020: l_opt = 1.1 (standard
  error 0.6). Bitcoin 2010–2020: 1.5 (0.3). Both fall to ≈1.0 once trading and borrowing costs are included. Berkshire
  Hathaway (picked for its record): 3.0 (0.7). Madoff's fabricated returns: 100. Its only "volatility" was 3% a year, and
  at higher rebalancing frequency the estimate is 200–300. The one "asset" whose optimal leverage was 1:200 was a fraud.
  Caveats in the paper's own table: the S&P 500 *total return* index against fed funds (1988–2020) gives 2.7 (1.0), and
  against ten-year rates the price index gives 0.6 (1.0). The finite-sample standard error is 1/(σ√T) (eq. 15).
- **Confidence:** medium. The theory is clean. The "attracted to 1" claim is an equilibrium hypothesis with wide error
  bars. Elm Wealth reached a similar answer: 1.5× would have ended with the most money over 1927–2020, and a Merton
  investor with risk aversion 2.5 would hold about 85% equities [leverage-07].

### Our broker's funding changes the answer (arena data)

- Funding per year on the notional (`apps/backend/src/engine/instruments.ts`, checked 2026-10-06/07):
  - long indices and shares 8.1%, short ≈0;
  - gold and silver long 5.9%, short +2.9% (paid to you);
  - oil and natural gas 4.0% on either side;
  - EURUSD long 3.0%, short ≈0; GBPUSD 1.7% / 1.3%; AUDUSD 0.9% / 2.1%;
  - BTC and ETH long 22.5%, short +5.0%.
  At 1:1, shares and crypto pay nothing. The charge scales with the notional, so at 10× a long index pays 81% of equity
  a year.
- The ESMA-style 50% close-out rule [leverage-21] is what our engine applies, per position.
- Implications:
  1. The best "long beta" vehicle in the arena is the fee-free 1:1 share and crypto holding, not a levered index.
  2. Leverage held overnight must earn its funding *and* its drag. Intraday positions pay no funding, so high-leverage
     agents should be intraday.
  3. No FX carry trade exists on Capital.com at current rates.
  4. The in-sample "optimal" leverages of 2024–26 (US500 4.0, US100 3.3, GOLD 4.2, NVDA 2.5, BTC 0.55, ETH 0.1, EURUSD
     0) mostly reflect which assets went up [leverage-32].

### Leveraged ETFs: daily reset, decay, and when leverage helps

- **Avellaneda & Zhang (2010)** [leverage-08] give an exact formula: the log return of an L× daily-reset fund equals
  L × the index log return − (L² − L)/2 × the realized variance, minus costs. It held "in excellent agreement" for 56
  US LETFs (44 at 2×, 12 at 3×) from 2008 to 2009. Their conclusion: "LETFs as currently designed may be unsuitable for
  buy-and-hold investors". A dynamic rebalancing of about once a week makes them track a static multiple.
- **When daily-reset leverage helps:** in low-volatility streaks and trends. It then *beats* L× the index, because it
  compounds upward. **When it hurts:** in choppy, high-volatility markets, even with a flat index. Gayed & Bilello show
  that daily 3× on the S&P 500 1928–2015 would have grown $1 to $570,965 vs $1,969 unlevered. That is 15.3% a year vs
  9.1%, but with 56.7% volatility, a −99.9% maximum drawdown and a lower Sharpe ratio (0.21 vs 0.30) [leverage-09]. The
  financing assumption was only 1% a year.
- **Static vs constant leverage** [leverage-07]: not rebalancing avoids the drag, but risks a wipeout, because leverage
  rises as losses mount. Daily rebalancing caps that risk but sells after losses and buys after gains. In Elm Wealth's
  example the static position lost 44% and the daily-rebalanced one 35%. Our existing leverage ladder is the static
  (fixed-units) kind.
- **Recent out-of-sample evidence:** TQQQ, peak to trough Nov 2021 → Dec 2022: −81.7%, against QQQ −32.7% over the same
  window; it took about 486 sessions to recover [leverage-11]. Practitioners on HN call LETFs "covert short vol
  instruments" [leverage-12].

### Trend-filtered leverage: "Leverage for the Long Run" and the r/LETFs canon

- **Gayed & Bilello (2016, Dow Award)** [leverage-09]: above its moving average the S&P 500 has lower volatility, higher
  daily returns and longer up-streaks, which are the conditions where leverage compounds well. Below it, the opposite.
  Their Leverage Rotation Strategy: hold L× the index while it is above the 200-day SMA, else T-bills.
  - 1928–2015 results at 1.25×, 2× and 3×: annual return 12.5%, 19.1% and 26.8%; volatility 15.5%, 24.9% and 37.3%;
    Sharpe 0.53, 0.51 and 0.47; maximum drawdown −59%, −79% and −92%.
  - Buy-and-hold: 9.1%, Sharpe 0.30, −86%. About 5 switches a year.
  - CXO's review [leverage-10]: the 1% leverage cost "overstates realistic backtest performance"; switching costs were
    ignored; starting just before the Great Depression flatters any SMA rule. Our CFD financing is ≈8.1% of the full
    notional, not 1%.
- **The r/LETFs canon** (Reddit was blocked from this network; secondary sources only):
  - **HFEA** (Bogleheads, 2019): 55% UPRO / 45% TMF, rebalanced quarterly, for an effective 165% stocks and 135% long
    Treasuries. It was down about 53% by October 2022, when stocks and bonds fell together [leverage-11].
  - **TQQQ or UPRO with a 200-day SMA filter** on the S&P 500 or QQQ, often with ±1–5% buffer bands. This is
    Gayed–Bilello with daily-reset ETFs.
  - Later community consensus drifted toward 2× with gold and managed futures (an SSO/ZROZ/GLD mix).
- **Confidence:** medium-low that the 200-day effect is large after realistic financing. High that the filter cuts
  drawdowns: volatility clusters, and the SMA is a crude volatility-regime switch.

### Lifecycle investing (Ayres & Nalebuff)

- **What:** use up to 2:1 leverage on stocks when young and de-lever with age, so that equity exposure is spread evenly
  over a lifetime of *dollars* ("diversification across time") [leverage-13].
- **Evidence:** US data since 1871. The leveraged lifecycle matches the mean of a constant 75% stock allocation with a
  21% smaller standard deviation, and raises the certainty equivalent by 37% for risk aversion CRRA = 4. Monte Carlo
  results hold with equity premia well below the historical one.
- **For us:** the time horizon is decades, so it has no direct arena analogue. The transferable idea is to set exposure
  in *dollars over the run's life* rather than as a constant fraction. CPPI below is the trading-scale relative.

### Leverage aversion, risk parity, Betting Against Beta, return stacking

- **Leverage aversion** [leverage-14]: many investors cannot or will not borrow, so they reach for return with high-beta
  assets. This flattens the security market line, so safe assets earn higher risk-adjusted returns.
  - Risk parity (inverse-volatility weights, levered to market volatility), 1926–2010 on US stocks and bonds: Sharpe
    0.52–0.53 vs 0.25 for the value-weighted portfolio and 0.40 for 60/40.
  - 1973–2010 with global stocks, bonds, credit and commodities: 0.61–0.62 vs 0.43.
  - The levered version earned 7.99% excess a year at 15% volatility. It is bond-heavy, so the post-1981 bond bull
    inside the sample helped it (our reading, not the paper's).
- **Betting Against Beta** [leverage-15]: long levered low-beta, short high-beta assets. US Sharpe 0.75 (1926–2009); the
  pattern holds in 20 countries, Treasuries, credit and futures. Decay and critique [leverage-16]: the construction
  effectively equal-weights stocks, and each dollar of BAB puts about $1.05 into the bottom 1% of stocks by market cap.
  After costs, what remains is explained by profitability and investment tilts. Pelster [leverage-25] reads the
  ESMA-cap response (retail traders switched to riskier underlyings) as direct micro evidence of the leverage-aversion
  mechanism.
- **Return stacking / portable alpha** [leverage-17]: get $1 of core beta through futures and add $1 of an uncorrelated
  return (managed futures, carry) on the same capital. Leverage buys diversification instead of more of the same beta.
  Risks: losses stack, the financing cost must be beaten, and correlations jump in crises.
- **For us:** all of these need several instruments in one run, and HFEA or risk parity also need a bond. **Not feasible
  with today's SDK.**

### Volatility targeting and constant-volatility leverage

- **Moreira & Muir (2017)** [leverage-18]: scaling exposure by 1/(last month's realized variance) earned an alpha of 4.9%
  a year on the US market and raised the Sharpe ratio by 25%. It also worked on value, momentum, profitability,
  investment and FX carry factors. The weights had a median near 1, but the 90th and 99th percentiles were 2.6 and 6.4×.
  Capping them at 1 or 1.5 kept the Sharpe ratio while lowering the alpha.
- **Harvey et al. (2018, Man AHL)** [leverage-19]: over 60 assets with data back to 1926, volatility targeting raised the
  US-equity Sharpe ratio from 0.40 to 0.48–0.51 and thinned the left tail in every asset class. It improved Sharpe only
  for "risk assets" with a leverage effect (equities, credit). Bonds, FX and commodities did not improve.
- **Cederburg et al. (2020)** [leverage-20]: across 103 equity strategies, volatility-managed versions "do not
  systematically outperform". In direct comparisons 45 did better and 58 worse. The real-time mix of managed and original
  portfolio that the spanning regressions imply earned a lower certainty-equivalent return than the original in 72 of
  103 cases. The regression alphas need in-sample weights, so they are not implementable in real time.
- **For us:** `vol-target` (15% target, 0–2×, monthly, 1:3) is already live on US indices. It is the right place for this
  idea, and the demo is the test. Harvey et al. say not to expect a Sharpe gain on FX or gold, so do not add those.

### Retail high leverage: what the data says

- **Regulators:**
  - FCA 2016: 82% of a representative sample of clients lost money, and some firms offered over 200:1 [leverage-22].
  - ESMA 2018: 74–89% of retail accounts lose money, with average losses of €1,600–29,000 per client. The response was
    retail caps of 30:1 on major FX, 20:1 on gold and major indices, 10:1 on other commodities, 5:1 on shares and 2:1
    on crypto, plus a 50% close-out and negative-balance protection [leverage-21].
- **Capital.com:**
  - After cutting default leverage in June 2018, the share of users margin-called within 15 days fell from about 30% to
    5%, and the average loss fell by over 80% (internal, unaudited) [leverage-23].
  - Today's warning: 79.75% of retail accounts lose money (SCB entity).
- **Heimer & Simsek (JFE 2019)** [leverage-24]: the 2010 US CFTC cap (50:1 on major FX pairs, 20:1 on others) as a
  natural experiment, with European traders as the control group. Data from about 50 brokers via a social network; before
  the cap, 15–20% of trades used more than 50:1.
  - Before the cap, the US high-leverage quintile lost 44% a month and the low-leverage quintile 3%.
  - The cap cut trading volume by 23% and high-leverage traders' losses by 40%. The average US portfolio loss went from
    17% to 10% a month. Brokers' operating capital fell 25%, with no change in spreads.
- **Pelster (2024)** [leverage-25], on the 2018 ESMA cap at one CFD broker:
  - Treated traders' average leverage fell from 6.6 to 4.7.
  - Big losses (over 60%) became rarer, and so did big gains (20–50%). Profit rose about 1.2 percentage points.
  - But traders moved to more volatile stocks (+7% volatility) and to crypto. Leverage was partly substituted, not
    removed. Heimer & Imas (RFS 2022, cited there) find that access to leverage worsens the disposition effect.
- **Subrahmanyam, Tang, Wang & Yang (JF 2024)** [leverage-26]: thousands of Chinese futures traders. One more unit of
  leverage costs 5.3 bp a day, about 13% a year (working-paper figure). The cause is trading costs plus forced liquidations from margin calls,
  and margin calls account for most of the underperformance of unskilled traders. For skilled traders leverage supports
  liquidity provision and raises returns.
- **BitMEX perpetuals (Cheng et al. 2021)** [leverage-27]: daily forced liquidations were 3.51% (long) and 1.89% (short)
  of open interest, and liquidated traders averaged 60× leverage. Holding the daily margin-call probability to 1% would
  need 33% margin (3×) for longs and 20% (5×) for shorts. Normal-distribution margins are far too low.
- **Confidence:** high that high retail leverage goes with losses, and that much of the effect is causal (two natural
  experiments). The mechanisms are spread costs that scale with notional, forced liquidation at bad prices, and behaviour.

### Margin-call dynamics, margin spirals and leverage cycles

- **Single account:** see the hit rates above. A margin call realizes the loss at the worst point and removes the chance
  of a rebound. The 2024 futures study puts most of unskilled traders' leverage losses here [leverage-26].
- **Market level:** Geanakoplos's leverage cycle [leverage-28]. In calm times margins are low, leverage and prices rise
  together. A shock raises margins and lowers collateral values, forcing sales, which raises volatility and margins again.
  Equilibrium determines leverage as well as interest rates. Crypto liquidation cascades are the clearest live example
  [leverage-27].
- **For us:** volatility-scaled sizing (vol-target, the Kelly ladder) is the same pro-cyclical loop on one account. It
  de-levers after volatility spikes, which is usually right, but it sells after the fall.

### Martingale, anti-martingale, pyramiding and CPPI

- **Martingale** (double after a loss): many small wins and a rare loss larger than the account. Its trade distribution is
  strongly negatively skewed. Over short samples it looks like skill (the "peso problem"). In the coin-flip study, several
  subjects believed doubling was optimal [leverage-04]. The leverage cap and the minimum size act as the table limit that
  breaks the scheme.
- **Anti-martingale / pyramiding** (add after wins: Turtle units, Paroli): exposure follows the trend, giving a convex
  payoff with positive skew. Our SDK cannot add to a position. Closing and reopening bigger pays a full spread.
- **CPPI** (Black & Perold 1992) [leverage-31]: exposure = m × (equity − floor). It is constant leverage on the *cushion*:
  it buys leverage with profits and cuts it in losses. Losses stay above the floor except for one-day gaps larger than
  1/m. Typical multipliers are 3–6. With a fixed floor, CPPI is the trading-scale form of "lever up when the cushion
  allows".

### Bold play: when maximal leverage is rational

- Dubins & Savage: in a *subfair* game (every trade pays the spread), the strategy that maximizes the probability of
  reaching a fixed goal before ruin is **bold play**: stake min(fortune, goal − fortune) on each bet [leverage-30].
  Timid play (small bets, many trades) lets the house edge grind you down. When the stake per bet is capped, which is
  what a leverage cap does, plain bold play is no longer always optimal.
- **Implication:** if the objective is "turn $10k into $20k, or die trying" (a prop-firm challenge, a tournament where
  only first place counts, the user's 1:200 fascination), the highest leverage *is* rational. It is the opposite of
  growth-optimal behaviour, and the arena's lifecycle judges a different objective (trade t-statistic). This is the one
  coherent argument for actually using 1:200.

### Carry with leverage

- **Carry trades** (borrow the low-yield currency, lend the high-yield one, usually at 5–20×) earn steady returns with
  negative skew. They crash when risk appetite and funding liquidity fall and carry traders unwind together
  [leverage-29]. Volatility-managing carry helps [leverage-18].
- **On Capital.com today**, no FX side earns funding (see above), so the carry trade is unavailable. The only paid
  positions are shorts of gold, silver, BTC and ETH, which fight a positive drift.

### Compounding small edges at high leverage (edge ÷ variance)

- Kelly per trade is f\* = μ_trade / σ²_trade. A short-horizon trade with a small but reliable edge has a tiny variance,
  so f\* can be enormous. Example: EURUSD 15-minute trades have σ ≈ 0.044%. A *net-of-spread* edge of a tenth of σ (a 55%
  hit rate with symmetric payoff) gives f\* ≈ 230×. In annual terms, L\* = SR/σ: 1:200 on EURUSD needs a Sharpe ratio of
  about 12, and 1:50 about 3 [leverage-32]. That is the territory of market makers and HFT. Half Kelly halves the
  leverage.
- Our evidence so far: intraday-momentum had a gross edge of about +2% over 33 months against about 7% of spread, so
  leverage only multiplied the loss (−99% at 1:200; `JOURNAL.md`, 2026-10-12). The spread is about 0.008% of price on
  indices and 0.0055% on EURUSD, so a full-margin round trip costs 1.0–2.0% of equity at 1:200 [leverage-32].
- **Confidence:** high in the arithmetic. It is low that any bar-based agent here has the per-trade Sharpe ratio to
  justify more than about 1:20.

## For the arena

### Which tier fits which kind of strategy

| Tier | Rational use | Existing / proposed |
|---|---|---|
| 1:1 | Long holds that pay no funding (shares, crypto); volatility harvesting; anything with L\* < 1 | buy-hold (shares, crypto), proposed `shannon-demon`, `sma200-shares` |
| 1:2–1:3 | Timed or vol-scaled index exposure up to 2×; half Kelly on slow signals | `vol-target` (live), proposed `lrs-sma200/x2` |
| 1:5–1:10 | 3× timed exposure; CPPI; constant-leverage experiment rungs | proposed `lrs-sma200/x3`, `cppi`, `constant-leverage` |
| 1:20 | Intraday (funding-free) risk-sized agents whose stops need 5–15×; capped Kelly ladder | most intraday agents; proposed `kelly-ladder` |
| 1:50–1:200 | No overnight directional *use*. Headroom so a tight-stop intraday agent hits its stop before a margin call; bold play to a goal; ruin and skew controls | `leverage-ladder` (control), proposed `martingale-monkey`, `bold-play` |

Rule of thumb for any agent: realized Kelly ≈ mean(trade % return) ÷ variance(trade % return), with trade returns
expressed per unit of notional. If the exposure an agent actually uses is above twice that, it is overbetting: growth
is negative even when the edge is real.

### Agents feasible with today's SDK (fixed textbook parameters)

1. **`lrs-sma200`: Leverage Rotation Strategy** (Gayed & Bilello 2016) [leverage-09]
   - Instruments: US500, US100, US30. Timeframe 1d.
   - Rule: if close > SMA(200) and flat, `buy({ exposure: L })`. If close < SMA(200) and long, close. No stop (the
     margin-call distance at 3× on 1:5 is 23%).
   - Variants: `x2` (L = 2, tier 1:3) and `x3` (L = 3, tier 1:5).
   - Sibling `sma200-shares`: the same rule at exposure 0.9 on the 8 shares at 1:1 (fee-free). It tests the filter
     without funding or leverage.
   - Expect about 5 trades a year per instrument, so it needs the slow-agent judgement or a control label. Funding while
     invested is 16–24% of equity a year, so expect much less than the paper.
2. **`constant-leverage`: LETF emulator; Peters test** [leverage-05, leverage-06, leverage-08]
   - Instruments: US500, GOLD, EURUSD, BTCUSD. Timeframe 1d. Tiers [2, 3, 5, 10, 20].
   - Target exposure L = 0.5 × `ctx.leverage` (1, 1.5, 2.5, 5, 10×). At the daily close, if actual ÷ target leaves
     [0.9, 1.1], close and reopen at the target.
   - Control, never judged. Read it next to the fixed-units `leverage-ladder`.
   - Two questions: does the realized drag match L(L−1)σ²/2, and where does realized growth peak? Peters predicts about
     1; with funding, about 0–1 for indices. The curvature (the drag, set by σ²) will be measurable within months; the
     location of the peak (set by μ) will not be, for years.
3. **`shannon-demon`: constant-mix volatility harvesting** (Shannon via Luenberger and Poundstone)
   - Instruments: BTCUSD, ETHUSD, TSLA, NVDA. Tier 1:1, fee-free. Timeframe 1h.
   - Target exposure 0.5. When notional ÷ equity leaves [0.45, 0.55], close and reopen at 0.5. That happens after
     roughly ±20% price moves, or about 5–15 times a year.
   - Expected rebalancing bonus over the static mix: w(1−w)σ²/2 = σ²/8 a year. That is about 2.8% (BTC), 5.7% (ETH),
     4.4% (TSLA) and 3.0% (NVDA). Each rebalance costs about half the spread on equity (BTC ≈ 0.03%).
   - It loses to buy-and-hold in strong trends. Benchmark: buy-hold at 1:1.
4. **`kelly-ladder`: fractional Kelly on a trailing estimate** [leverage-02, leverage-03]
   - Instruments: US500, GOLD, EURUSD, BTCUSD. Timeframe 1d. Tier 1:20.
   - μ̂ = mean of the last 252 daily returns × 252. σ̂² = variance of the last 63 daily log returns × 252.
   - L_long = (μ̂ − f_long)/σ̂² and L_short = (−μ̂ − f_short)/σ̂², with the funding rates hard-coded from `instruments.ts`.
     Take the positive side, else flat. Exposure = c × L, capped at 10.
   - Rebalance on the first daily bar of each month, or when the target moves by more than 25%.
   - Variants: `half` (c = 0.5), `full` (1) and `double` (2). Thorp predicts double Kelly ≈ zero growth with the largest
     swings, and half Kelly about 75% of full's growth with far smaller drawdowns.
   - In effect this is vol-scaled time-series momentum with a funding hurdle. Treat it as an experiment (control).
5. **`cppi`: constant proportion portfolio insurance** [leverage-31]
   - Instruments: US500, US100, GOLD. Timeframe 1d. Tier 1:5.
   - Fixed floor $8,000 (80% of the start), multiplier m = 5. Exposure = 5 × (equity − 8,000)/equity, capped at 4.
     Rebalance at the daily close when actual ÷ target leaves [0.8, 1.2]. Flat when equity < $8,160.
   - Exposure is 1× at $10k, 1.7× at $12k, 2.3× at $15k and 0.56× at $9k. It is the anti-martingale with a floor.
6. **`skew-monkey`: negative-skew control**
   - Instruments: EURUSD, US500, GOLD. Timeframe 1h. Tier 1:5.
   - Random direction via `ctx.random()` when flat. Take-profit 0.5 × ATR(14), stop 3 × ATR(14), riskPct 1.
   - About 85% of trades win, with no edge. It measures how often a 30-trade sample of a negatively skewed no-edge agent
     reaches t ≥ 2, which calibrates the leader bar for agents with tight take-profits.
7. **`martingale-monkey`: ruin control**
   - Same entries as `skew-monkey`, with take-profit = stop = 1 × ATR(14).
   - riskPct starts at 0.5 and doubles after each loss (cap 64), and resets after a win. Tier 1:200.
   - It shows the doubling path, the moment the leverage cap binds (about 18% risk at a 0.1% stop on EURUSD) and the bust.
8. **`bold-play`: goal-seeking at 1:200** (Dubins & Savage) [leverage-30]. Optional, low priority.
   - Instruments: US500, US100, GOLD, EURUSD. Tier 1:200.
   - Goal: $20,000. Each bet: exposure 0.9 × 200, direction = sign of the 20-day return. Take-profit at the price move
     that reaches the goal; stop at 0.25% (about −45% of equity). After the goal is reached, stay flat forever.
   - Each run is one sample of "did 1:200 double the account before ruin?". In a fair game every strategy reaches
     $20k before $0 with probability 1/2 (optional stopping). The spread (about 1.5% of equity per bet at 180× on US500)
     makes it lower; bold play keeps it as close to 1/2 as possible by betting as few times as possible.

All eight use only `exposure`, `riskPct`, stops, `ctx.state`, `ctx.leverage` and close-and-reopen. Items 1, 3 and 5
can be lifecycle candidates, but they trade only about 5–15 times a year, so they need the slow-agent rule (90 days,
≥ 10 trades) or a longer window. Items 2 and 4 are experiments best run as controls. Items 6–8 are calibration and
ruin controls.

### Experiments with no new agent

- **Leverage curve from the ladder:** each month, for each instrument and rung: log growth rate, maximum drawdown and
  margin calls. Fit g(L) = aL − bL² to get the live l_opt with its standard error, 1/(σ√T). Show the median and log
  growth per tier next to the mean (the ensemble average).
- **Tier comparison in the spirit of Heimer & Simsek:** per tier, mean vs median run return and per-trade % returns.
  Is the high-tier underperformance (1:1 −0.1%, 1:20 −0.5%, 1:200 −1.9% after 5 days) only the ladder and the
  `marginPct` agents?
- **Ruin lab job:** block-bootstrap the 2024–26 daily (or 1-minute) returns to estimate P(margin call within 1, 21 and
  252 days) and P(bust within a year) for each ladder rung and the martingale rules. A single live path cannot estimate
  a ruin probability.
- **Realized-Kelly report:** for each demo run, mean ÷ variance of trade returns per unit of notional, against the
  exposure actually used. Flag runs above 2× realized Kelly (overbetting) and below 0.25× (wasted capacity).

### Needs a platform change

- **Position resize** (`ctx.resize({ exposure })` or partial close and add, paying spread only on the change). This would
  make constant leverage, CPPI, Kelly, Shannon's demon, vol targeting and Turtle pyramiding (add a unit every 0.5 N up to
  4 units) cheap and faithful. Today each rebalance pays a round trip on the whole position.
- **Multi-instrument runs** (portfolios) and a Treasury CFD, if Capital.com offers one. These would allow HFEA (55/45
  levered stocks and bonds), risk parity, return stacking and BAB-style pairs.
- **Lifecycle metrics that do not depend on leverage:**
  - a t-statistic on per-trade % returns (P&L ÷ equity at entry) rather than dollar P&L, which weights trades by
    whatever equity compounding left;
  - the log-growth rate (time average) per run;
  - flags for strong negative skew or a high win rate with a large worst trade, to catch martingale-like runs before
    the "leader" label.
- **Live funding rates**, refreshed from the API: they follow central-bank rates and are a first-order input for any
  overnight leverage. Also dividend adjustments on share and index CFDs (Capital.com credits both to longs).

## Open questions

- Index dividends: answered by the parallel `unlevered` topic. Capital.com credits index CFD longs with daily dividend
  adjustments (US500 ≈ 1.2%/yr, US100 ≈ 0.6–0.7%, US30 ≈ 1.6–1.9%; `research/files/unlevered/capital-help-dividends.md`).
  So a long index CFD's long-run excess over funding is about 7% price drift + 1.2% dividends − 8.1% funding ≈ 0. The
  engine ignores these credits, so it understates every long-index rung of the ladder by about the index yield.
- r/LETFs and r/HFEA (wiki, top posts on the 200-SMA TQQQ, "9sig", buffer bands, the post-2022 consensus) could not be
  fetched: Reddit, its mirrors and the Wayback Machine all blocked this network, and Bogleheads returned HTTP 403. A second
  pass should read them from the user's browser.
- Gayed & Bilello with realistic financing (T-bill + spread on the levered part, or 8.1% on the whole CFD notional): is
  there anything left? The paper's own appendix and later replications (Allocate Smartly, QuantConnect) were not read.
- SSRN items not retrieved: Eliner (2022) "Less can be more" (another ESMA-cap study); Barber, Huang, Ko & Odean
  "Leveraging overconfidence"; Heimer & Imas (2022); Leung & Santoli on admissible leverage for LETFs; the original
  return-stacking whitepaper (behind a form).
- Peters & Adamou: the S&P 500 total-return series gives l_opt 2.7 ± 1.0 (1988–2020). Is "efficiency at 1" a claim
  about prices net of all costs only? Read the 2023+ ergodicity-economics literature and its critics.
- Can any existing intraday agent show a per-trade Sharpe ratio high enough (annual SR ≥ 3 net of spread) to justify
  1:50+? Run the realized-Kelly report after the first judgements in November.
- Subrahmanyam et al. found that leverage helps skilled traders. Do our future leaders do better at higher tiers when
  their sizing is otherwise the same?
- Bold play vs the lifecycle: should the arena have a separate "goal" leaderboard (P(reach 2×) by tier), so that the
  1:200 fascination has a fair scoreboard?

## Sources

| id | title | authors / site | year | kind | link | local copy |
|---|---|---|---|---|---|---|
| leverage-01 | A New Interpretation of Information Rate | J. L. Kelly Jr. (Bell System Technical Journal) | 1956 | paper | https://www.princeton.edu/~wbialek/rome/refs/kelly_56.pdf | — |
| leverage-02 | The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market | E. O. Thorp (Handbook of Asset and Liability Management, ch. 9) | 2006 | paper | https://www.gwern.net/doc/statistics/decision/2006-thorp.pdf | files/leverage/thorp-2006-kelly-criterion-blackjack-sports-stock-market.pdf |
| leverage-03 | Good and bad properties of the Kelly criterion | L. MacLean, E. Thorp, W. Ziemba | 2010 | paper | https://www.stat.berkeley.edu/~aldous/157/Papers/Good_Bad_Kelly.pdf | — |
| leverage-04 | Rational Decision-Making Under Uncertainty: Observed Betting Patterns on a Biased Coin | V. Haghani, R. Dewey | 2016 | paper | https://arxiv.org/abs/1701.01427 | files/leverage/haghani-2016-betting-patterns-biased-coin.pdf |
| leverage-05 | Optimal leverage from non-ergodicity | O. Peters (Quantitative Finance) | 2011 | paper | https://arxiv.org/abs/0902.2965 | files/leverage/peters-2011-optimal-leverage-from-non-ergodicity.pdf |
| leverage-06 | Leverage efficiency | O. Peters, A. Adamou | 2020 | paper | https://arxiv.org/abs/1101.4548 | files/leverage/peters-2020-leverage-efficiency.pdf |
| leverage-07 | George Costanza at It Again: The Leveraged ETF Episode | V. Haghani, J. White (Elm Wealth) | 2020 | blog | https://elmwealth.com/george-costanza-at-it-again/ | files/leverage/elmwealth-2020-leveraged-etf-costanza.md |
| leverage-08 | Path-Dependence of Leveraged ETF Returns | M. Avellaneda, S. Zhang (SIAM J. Financial Math.) | 2010 | paper | https://math.nyu.edu/%7Eavellane/SIAMLETFS.pdf.pdf | files/leverage/avellaneda-2010-path-dependence-of-leveraged-etf-returns.pdf |
| leverage-09 | Leverage for the Long Run | M. Gayed, C. Bilello (Dow Award; SSRN 2741701) | 2016 | paper | https://docs.cmtassociation.org/dow-award/2016-gayed-bilello.pdf | files/leverage/gayed-2016-leverage-for-the-long-run.pdf |
| leverage-10 | Leveraging the U.S. Stock Market Based on SMA Rules (review) | CXO Advisory | 2016 | blog | https://www.cxoadvisory.com/volatility-effects/leveraging-the-u-s-stock-market-based-on-sma-rules/ | files/leverage/cxoadvisory-gayed-bilello-sma-leverage-review.md |
| leverage-11 | Hedgefundie's Excellent Adventure: 3x leveraged ETF portfolio (+ TQQQ 2022 drawdown) | T. Dong (ETF Central) | 2022 | blog | https://www.etfcentral.com/news/hedgefundies-excellent-adventure-3x-leveraged-etf-portfolio | files/leverage/etfcentral-2022-hfea.md |
| leverage-12 | HN threads: Kelly Criterion; 3x leveraged ETFs; Towards a new leveraged ETF | Hacker News | 2021 | thread | https://news.ycombinator.com/item?id=26834333 | files/leverage/hn-kelly-and-leveraged-etf-threads.md |
| leverage-13 | Diversification Across Time | I. Ayres, B. Nalebuff (Yale) | 2010 | paper | https://ianayres.yale.edu/sites/default/files/files/Diversification%20Across%20T%20ime(1).pdf | files/leverage/ayres-2010-diversification-across-time.pdf |
| leverage-14 | Leverage Aversion and Risk Parity | C. Asness, A. Frazzini, L. Pedersen (FAJ) | 2012 | paper | https://www.aqr.com/-/media/AQR/Documents/Insights/Journal-Article/Leverage-Aversion-and-Risk-Parity.pdf | files/leverage/asness-2012-leverage-aversion-and-risk-parity.pdf |
| leverage-15 | Betting Against Beta | A. Frazzini, L. Pedersen (JFE; NBER w16601) | 2014 | paper | https://www.nber.org/system/files/working_papers/w16601/w16601.pdf | — |
| leverage-16 | Betting against betting against beta | R. Novy-Marx, M. Velikov (JFE 143) | 2022 | paper | https://mysimon.rochester.edu/novy-marx/research/BABAB.pdf | — |
| leverage-17 | What is return stacking? / Return Stacking: Strategies for Overcoming a Low Return Environment | C. Hoffstein, R. Gordillo et al. (Return Stacked) | 2021 | doc | https://www.returnstacked.com/what-is-return-stacking/ | files/leverage/returnstacked-what-is-return-stacking.md |
| leverage-18 | Volatility-Managed Portfolios | A. Moreira, T. Muir (JF; NBER w22208) | 2017 | paper | https://www.nber.org/papers/w22208 | files/leverage/moreira-2017-volatility-managed-portfolios.pdf |
| leverage-19 | The Impact of Volatility Targeting | C. Harvey, E. Hoyle, R. Korgaonkar, S. Rattray, M. Sargaison, O. Van Hemert (JPM) | 2018 | paper | https://people.duke.edu/~charvey/Research/Published_Papers/P135_The_impact_of.pdf | files/leverage/harvey-2018-impact-of-volatility-targeting.pdf |
| leverage-20 | On the performance of volatility-managed portfolios | S. Cederburg, M. O'Doherty, F. Wang, X. Yan (JFE) | 2020 | paper | https://www.lehigh.edu/~xuy219/research/COWY.pdf | files/leverage/cederburg-2020-performance-of-volatility-managed-portfolios.pdf |
| leverage-21 | ESMA agrees to prohibit binary options and restrict CFDs to protect retail investors | ESMA | 2018 | doc | https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors | files/leverage/esma-2018-cfd-product-intervention.md |
| leverage-22 | FCA proposes stricter rules for contract for difference products (CP16/40) | FCA | 2016 | doc | https://www.fca.org.uk/news/press-releases/fca-proposes-stricter-rules-contract-difference-products | files/leverage/fca-2016-cfd-proposals.md |
| leverage-23 | Traders' performance will improve under new ESMA leverage limits, finds research from Capital.com (+ current risk warning) | Finance Magnates / Capital.com | 2018 | doc | https://directory.financemagnates.com/forex-brokers/capitalcom/traders-performance-will-improve-under-new-esma-leverage-limits-finds-research-from-capitalcom/ | files/leverage/financemagnates-2018-capitalcom-esma-leverage-research.md |
| leverage-24 | Should Retail Investors' Leverage Be Limited? | R. Heimer, A. Simsek (JFE; NBER w24176) | 2019 | paper | https://www.nber.org/papers/w24176 | files/leverage/heimer-2019-should-retail-investors-leverage-be-limited.pdf |
| leverage-25 | The leverage substitution | M. Pelster (TAF WP 65, rev. 2024) | 2024 | paper | https://en.wiwi.uni-paderborn.de/fileadmin-wiwi/cetar/TAF_Working_Paper_Series/TAF_WP_065_Pelster2024_rev.pdf | files/leverage/pelster-2024-leverage-substitution.pdf |
| leverage-26 | Leverage Is a Double-Edged Sword | A. Subrahmanyam, K. Tang, J. Wang, X. Yang (JF 79) | 2024 | paper | https://doi.org/10.1111/jofi.13316 | — |
| leverage-27 | Liquidation, Leverage and Optimal Margin in Bitcoin Futures Markets | Z. Cheng, J. Deng, T. Wang, M. Yu | 2021 | paper | https://arxiv.org/abs/2102.04591 | files/leverage/cheng-2021-liquidation-leverage-optimal-margin-bitcoin-futures.pdf |
| leverage-28 | The Leverage Cycle | J. Geanakoplos (NBER Macro Annual 2009; Cowles DP 1715R) | 2009 | paper | https://cowles.yale.edu/sites/default/files/2022-08/d1715-r.pdf | — |
| leverage-29 | Carry Trades and Currency Crashes | M. Brunnermeier, S. Nagel, L. Pedersen (NBER w14473) | 2008 | paper | https://www.nber.org/papers/w14473 | — |
| leverage-30 | Improving on bold play when the gambler is restricted (states Dubins & Savage's bold-play theorem) | J. Schweinsberg | 2004 | paper | https://arxiv.org/abs/math/0412362 | — |
| leverage-31 | Theory of constant proportion portfolio insurance | F. Black, A. Perold (JEDC 16) | 1992 | paper | https://doi.org/10.1016/0165-1889(92)90043-E | — |
| leverage-32 | Arena leverage statistics from our 1-minute candles, 2024-01 → 2026-09 | this project (computed 2026-10-13) | 2026 | doc | apps/backend/data/candles + src/engine/instruments.ts | files/leverage/arena-leverage-stats.md |
