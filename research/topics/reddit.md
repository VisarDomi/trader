# Reddit: what retail quants report works, fails, and what leverage did to them

_First pass 2026-10-13._

Scope: r/algotrading, r/LETFs, r/Forex, r/Daytrading, r/options, r/thetagang, r/BitcoinMarkets, r/quant and
r/quantfinance. 40 threads read, 21 snapshots in `files/reddit/` (several snapshots group 2–5 threads on one
theme). How it was read: the browser route failed in this session, so thread lists come from Reddit's RSS feeds
(top of all time, top of the year, and in-subreddit searches, 100 posts each, one request a minute) and thread
contents, comment trees and scores from the arctic-shift Reddit archive API. Scores are as the archive last
saw them and can be lower than on Reddit today.

## In short

- **The best leverage evidence on Reddit is a 200-day filter on the unleveraged index, used to switch a 2× position
  on and off.** A real-money test that has been public for 2.5 years (2024-03-15 → 2026-09-30) shows the 2× S&P
  200-day rotation +68% against +54% for the S&P 500, HFEA (3× stocks + 3× bonds) +31%, and 9Sig (a TQQQ/bond
  rebalancer) +134% [reddit-01]. A careful 27-year backtest found the filter beat 97% of the same exposure on
  shuffled dates (p ≈ 0.03), while every tuned variant failed out of sample [reddit-07]. Gayed's September 2026
  revision of "Leverage for the Long Run", with borrowing costs included, finds the **same Sharpe ratio as the
  S&P 500 and no significant alpha**. What timed leverage buys is more growth for a similar drawdown, not a
  better ratio [reddit-04].
- **2× is the level the community settled on; 3× needs a timing rule; 5× suits only very short holds.** TQQQ only
  beats QQQ if QQQ makes more than about 11% a year, and loses money below about 7% [reddit-02]. Simulated 3× Nasdaq
  from 1999 made 4.5% a year with a −99.9% drawdown against 10.9% for QQQ. With the 200-day filter it made 12.7%
  but still fell 95% [reddit-20]. A simulated 2× S&P from 1950 to 2026 with real costs had a Sharpe of 0.46,
  below the 0.52 of holding at 1× [reddit-06]. Our long-index funding (≈ 8% a year on the whole notional) is
  worse than an ETF's borrowing cost.
- **Costs and random baselines decide most retail results.** Random entries on EURUSD with spread land near zero
  (0.01 R a trade) [reddit-21]. A reinforcement-learning 0DTE agent went from +0.15% a day on OHLC bars to −0.13% a
  day on real quotes [reddit-36]. Commissions took 12–17% of a live equity algo's yearly edge [reddit-23]. One
  author's random baseline was itself biased: it drew days *before* each signal [reddit-20].
- **Verified live records are rare and modest.** The one third-party-audited record (Darwinex) made 39% in 2025
  with a 6.7% drawdown from 2:1 reward:risk breakouts on gold and USDJPY [reddit-14]. A population of evolved
  agents kept only half its backtest edge live (profit factor 1.30 → 1.15; losing streak 5 → 18), and it ended
  up all in one coin without anyone deciding that [reddit-15]. Early live Sharpe ratios of 3–6 fell to about 1
  within months [reddit-24].
- **New ideas that fit our instruments:** gold's session split (LBMA fixes 1968–2025: +13.8% a year from the PM fix
  to the next AM fix, −4.7% a year from AM to PM) [reddit-16], already partly confirmed on our own data in the
  anomalies note. Also a 5-minute opening range, which beat 15 and 30 minutes in a 0DTE backtest [reddit-35]; a
  range-dip + IBS daily rule with ~70% winners on SPY, QQQ and AAPL [reddit-17]; and a volatility-normalised
  z-score trend filter on BTC [reddit-26].
- **High-leverage traders who last risk 1–2% per trade and cap correlated "theme" risk at about 8%** [reddit-29].
  Prop-firm rules (daily loss limit, maximum drawdown, profit caps) work as an outside risk manager that makes
  1:100+ accounts survivable [reddit-30, reddit-31]. The blow-up stories are all the same story: adding size and
  leverage to a winning position until one move liquidates it [reddit-27].
- **Features people wish they had,** and which our arena can offer: a public, fixed-rule, real-money track record
  with a benchmark [reddit-01, reddit-14]; a "same average exposure, wrong dates" control for every timing agent
  [reddit-07]; parameter-jitter checks [reddit-33]; warnings when many runs pile into one instrument
  [reddit-15]; logging of each signal and its fill [reddit-20].
- **Confidence:** medium on the leverage findings (several independent analyses agree with the papers); low on
  any single strategy claim. Many 2026 posts are written with LLM help or sell something. r/quant and
  r/quantfinance are career forums with almost no strategy content.

## Findings

### Timed leverage: the 200-day rule on 2× index exposure

- **What:** hold a 2× (or 3×) index position while the *unleveraged* index closes above its 200-day simple moving
  average; otherwise hold cash or bonds. Gayed and Bilello (2016) made it popular [leverage-09]. It is the most
  discussed strategy on r/LETFs.
- **Live evidence:** u/Gehrman_JoinsTheHunt put $10,000 of real money into each of three plans on 2024-03-15 and
  has posted every quarter since. To 2026-09-30: S&P 2× 200-day (SSO or T-bills) +68.4%, 9Sig (TQQQ + bonds,
  quarterly 9% growth target) +134.4%, HFEA (55% UPRO / 45% TMF, quarterly rebalance) +31.0%, S&P 500 +54.3%.
  Plain TQQQ made about +168% over the same period. The 200-day plan has not yet faced a long bear market. "All of
  the dips so far have been very short-lived and followed by a V-shaped recovery." [reddit-01]
- **Backtest evidence with honesty checks:** u/mongopark98: 60% SSO / 40% QLD when the S&P is 3% above its 200-day,
  0.5× S&P when 3% below, hold inside the band. Over 1999–2026 this gave CAGR 16.2%, Sharpe 0.58, max drawdown −56%,
  against SPY 8.7% / 0.45 / −55% and always-on 2× 11.7% / 0.27 / −94%. The filter beat 97% of 2,000 date-rotated
  copies (p = 0.031). Walk-forward re-tuning did worse than the fixed rule (5.06× vs 5.58× growth). A 1999–2006
  out-of-sample check reversed the ranking of the "improved" variants. Volatility targeting
  (35% ÷ 60-day vol, cap 1) cut the drawdown from 56% to 45% but helped only in slow bear markets [reddit-07].
- **Bigger search:** 426 configurations over 1986–2026 with pre-set gates (deflated Sharpe, PBO, walk-forward). The
  200-day on QQQ trading QLD (2×) beat TQQQ (3×) on a risk-adjusted basis. Always-on HFEA stacking lost to
  rotation. Cross-sectional momentum among leveraged ETFs and volatility-targeted sizing were both rejected.
  The winner adds a 4-signal vote (SMA250, SMA100, 21-day vol < 40%, 30-day AR(1) > 0), which is the most fitted
  part [reddit-03].
- **Bands:** an asymmetric band (enter 4% above, exit 3% below the S&P 200-day) cut TQQQ round trips from 49 to 7
  over 2010–2025. The exact numbers are tuned [reddit-05]. Commenters prefer wider bands or a month-end
  10-month SMA check ("less friction or more tail risk protection") [reddit-07].
- **The correction:** Gayed's 2026 revision includes borrowing costs. It shows the same Sharpe as the S&P 500, no
  significant alpha (p < 0.05), a start in 1988 because 1928 could not be replicated, and sensitivity to the
  lookback [reddit-04]. Commenters: "it was never an edge ... a smoother path to roughly the same endpoint."
- **Why it might work:** it is time-series momentum on one index. Trend clusters, and big drawdowns come in
  slow bear markets. The filter "does best with slowish crashes and recoveries" and is concentrated in one
  country's index [reddit-11].
- **Survived out of sample?** The filter: yes, modestly (pre-2006 checks, permutation test, the live test so
  far). Tuned variants: no. Confidence: medium.

### How much leverage: volatility drag, costs and behaviour

- A daily-reset 3× product's long-run return is set by the index return, its daily volatility, financing and fees.
  Low index returns come with high volatility, so the break-even is high. If QQQ makes 8% a year over a decade,
  TQQQ makes about 1%. EEM made 7.4% a year while its 3× version EDC made 0.5% [reddit-02].
- SSO simulated 1950 – Oct 2026: 14.5% CAGR, −88.7% max drawdown, Sharpe 0.46. The S&P 500 made 11.7%, −55.1%,
  Sharpe 0.52. Daily reset alone costs about 1.5% a year compared with "2× the annual return". Today's total cost
  is ≈ fed funds + 2.5% a year [reddit-06].
- 3× Nasdaq from 1999: −99.9% buy-and-hold, −95% even with the 200-day filter [reddit-20]. A −20% day ends a 5×
  daily product, and NVDA, TSLA and MSTR all fell more than 15% in a day in 2025 [reddit-08].
- Behaviour: people holding 3× cut exposure after a 25–30% fall and buy back higher. "The best leverage level
  isn't necessarily the one with the highest backtested return it's the one you can actually hold" [reddit-09,
  reddit-10]. Agents do not flinch, but our margin rule (a position closes when equity falls below 50% of its
  margin) is a built-in flinch at the high tiers.

### Live records: what exists and how it decays

- **Darwinex-verified breakout portfolio** (u/criptolibertari0): XAUUSD and USDJPY only, "breakout strategies with a 2:1
  RR". Scalps, reversals and grids were all dropped. Result: 39% in 2025, 6.65% max drawdown, 2,379 trades with an
  average hold of 4h14m, +104% since January 2022. The strategies come from a strategy generator (StrategyQuant X)
  with in-sample/out-of-sample filtering; the rules are not disclosed [reddit-14]. Credible as a track record.
  The method behind it is heavily selected.
- **Evolutionary agent population, live 48 days, 2,729 trades** (crypto): profit factor 1.15 against a 1.30 target,
  win rate 33.6% against 45%, worst losing streak 18 against 5. "At points, 100% of live positions sat in one coin
  (ADA), and I never decided that" [reddit-15].
- **A small live system** (u/MormonMoron): live August–December 2025, +4.5%, which was 4.5 points *behind* buy-and-hold.
  Two "accidental" sells cost the most; one came from a backtest branch left checked out in git. Sharpe was about 6
  after 45 days and about 1.2 by year end [reddit-24].
- **Survey thread** "is anyone actually successful live?": the top answer is "I'm successful at backtesting". The
  credible-sounding answers describe simple systems kept for years, small size, slower timeframes, and regime
  dependence ("almost 70% of my profit came from that 6 week sell off"). One quoted target is Sharpe 1.0–1.8,
  12–18% a year, drawdown 8–15% [reddit-12]. A similar thread's best advice: once a system is validated, "DONT
  FUCKING TOUCH IT" [reddit-25]. The top post of the year is a one-month P&L screenshot with no
  capital given [reddit-13].
- **Take:** survivorship is extreme. Still, every honest report shows live results at roughly half the backtest, so
  our 30-trade, 28-day verdicts should be read as a minimum, not a final judgement.

### Recurring warnings: costs, random baselines, overfitting

- **Costs:** "Without slippage and fees, I have 30+ winning strats. With slippage and fees, 2" [reddit-22]. Real 0DTE
  spreads average 3.0–4.3% of the option price at 15–30 delta [reddit-36]. An ML ranking model's edge fell
  from 13.2% a year to 2.4% between 0 and 10 bp per side [reddit-19].
- **Random entries:** random 4h EURUSD entries with a 3-ATR stop and 1R target score ≈ 0 R after spread [reddit-21].
  S/R "bounce" statistics on NQ and gold (111,129 touches, 15m–1d) looked the same on randomized markets
  [reddit-18]. SMC setups did *worse* than random entries with the same stop and target, and the win rate came from
  stop/target placement [reddit-19]. A random baseline must draw from the same days as the signal, or from days
  after it. Days *before* a dip signal are always followed by the dip, so such a baseline is set up to lose
  [reddit-20].
- **Overfitting checklist** the sub uses against viral backtests: report only out of sample; block-bootstrap Monte
  Carlo with P5/P50/P95; jitter every parameter and reject if results collapse; full costs and taxes [reddit-33].
  Every author who combined "best" parameters got worse results than the simple version [reddit-35, reddit-07].

### Gold: up in Asian hours, down in London/New York hours

- LBMA fix prices split into PM fix → next AM fix ("overnight", Asian and early European hours) and AM → PM
  (London/New York): gold since 1968 +13.83% a year overnight vs −4.73% intraday. Platinum since 1990 +20.86% vs
  −14.36%; palladium similar. Code and data are public [reddit-16].
- This agrees with Blose and Gondhalekar (COMEX 1985–2012) [anomalies-21]. The anomalies note found the same
  on our own 2024–26 data: GOLD 16:00 → 09:30 New York +9.9 bp a night (t 2.2) vs −0.9 bp intraday, against
  1.6 bp of funding and 1.1 bp of spread.
- Caveats: fixes are auction prints, not tradable quotes; the fix moved to an electronic auction in 2015; there was
  a long losing stretch in 2012–18. Confidence: medium. Two independent long samples plus our own data.

### Daily dip-buying on indices (IBS family)

- Rule: buy when close < 10-day high − 2.5 × (25-day average of high − low) and IBS = (close − low)/(high − low)
  < 0.3; sell when close > yesterday's high. Results: SPY 2006–2026 CAGR 7.75%, max drawdown 15.3%, 75% winners,
  in the market 21% of the time, 240 trades. QQQ 9.2% and 71% winners. AAPL 11.8% and 70%; it failed on ABNB
  [reddit-17].
- The SPY "close near the low" rule has kept a 70–72% win rate in every era since 1993. Its worst drawdown was
  −12.7%, but it once took 3.5 years to make a new high [reddit-20]. Comments: it trails buy-and-hold in total
  return, and the signal needs an entry at the close [reddit-17]. Already a candidate in the community note
  (community-30). Confidence: medium (well documented since about 2000; backtests only).

### Opening-range breakouts: shorter range, pullback entry

- SPY 0DTE ORB, Feb 2024 – Mar 2026, 303 trades: 5-minute range, first break only, buy an ATM call or put,
  +100% target, −50% stop, out by 15:30. +59% on $25k, profit factor 1.40, 41% winners, max drawdown 7.6%. Longs
  and shorts were equally profitable. By range length: 5 min +$13.8k, 10 min +$9.4k, 15 min +$7.3k,
  30 min +$4.2k. No spreads modelled; the Monday/Wednesday/Friday filter is fitted [reddit-35].
- Discretionary ORB + Fibonacci (unverified, "10–15k a month"): wait for the 30-minute range to break, then enter
  on a 50–61.8% pullback with MACD confirmation, stop below 78.6%, target a new session extreme [reddit-34].
- Our orb-ny agent uses 15- and 30-minute ranges. The Zarattini ORB papers are in the anomalies note.

### Crypto: trend filters cut drawdowns, leverage causes ruin

- BTC daily z-score trend: z = (close − EMA65) / 65-day standard deviation; long above a bull threshold, cash below
  a bear threshold (thresholds not disclosed). May 2014 – Jan 2026: 65.9% CAGR vs 56.2% for holding, max drawdown
  26.8% vs ~75%, 53 trades. One trade made 28% of the gains. Filters, Kelly and volatility scaling all made it
  worse. Live since 2023 by the author's claim [reddit-26]. The drawdown cut is the robust part.
- "How I Lost Nearly 200 BTC": he went from 3 BTC to ~200 BTC with margin longs in 2017, then added leverage to a
  winning position. "This entire position was liquidated on the drop back to 12k, because my entry had moved up so
  much." Three more liquidations in one month took him to zero [reddit-27]. "The best way to day trade
  cryptocurrencies is – DON'T!" [reddit-28].

### High leverage and prop firms (r/Forex)

- An ex-bank FX trader: risk ≤ 2% per trade and ≤ 8% per theme. "It is extremely common for retail accounts to
  blow-up by making only 4-5 losing trades because they are leveraged at 50:1." Kelly with 30% winners at 3:1 gives
  6.6% per trade, "the rational maximum limit" [reddit-29].
- A trader who reached "$800k in funded capital" risks 1% per trade with 1.5–3R targets, aims for 2–6% a month and
  stays under 10% a month, because some prop firms will not pay out above that [reddit-31]. Another argues a 1:500
  personal account is "your own prop firm": the same fixed loss budget as a challenge fee [reddit-30]. A
  post-mortem lists what he lacked: small size, no revenge trading, accepting 1–2% months [reddit-32].

### Premium selling and negative skew (r/options, r/thetagang)

- Steady small premiums, rare huge losses: a covered-call writer of 25 years says the big premium "is the price of
  risk" [reddit-37]. Wheel + LEAPS claims of 10% a month come from a bull market [reddit-38]. One naked-call
  seller lost ~$600k on AMC in minutes [reddit-39]. What decides a premium sale is implied vs realized volatility,
  not the size of the premium. Not tradable on our platform; relevant as payoff shapes for controls.

### Sub quality

- r/LETFs had the best evidence per thread for the leverage question. r/algotrading has a few excellent posts in a
  lot of noise, and its members complain about LLM-written posts and bot replies ("Dead Internet Theory in
  r/algotrading", 2026). r/Forex, r/Daytrading and r/options top lists are mostly memes, P&L screenshots and
  courses. r/quant and r/quantfinance are about jobs; a senior quant calls r/quant "the blind leading the blind"
  [reddit-40]. r/BitcoinMarkets' top threads are from 2017–18.

## For the arena

Feasible now unless marked. Parameters are fixed up front, taken from the threads or the papers behind them.

1. **`gold-session`: long GOLD in Asian hours, flat in London/New York** (feasible now).
   - GOLD, 15m bars. Buy at the first bar closing at or after 15:00 London (LBMA PM fix). Close at the first bar
     closing at or after 10:30 London (AM fix). Variant `gold-session-ls` also shorts from 10:30 to 15:00. Size by
     `exposure: 1`. Tiers 1:1, 1:2 and 1:5 (one night of funding ≈ 1.6 bp). Friday-to-Monday holds pay three
     nights: one variant skips Friday entries. Run SILVER as a check with the same hours.
   - Why: 57 years of LBMA data [reddit-16], COMEX 1985–2012 [anomalies-21] and our own 2024–26 check (+9.9 bp
     overnight, −0.9 bp intraday) all point the same way. It is close to the existing overnight-drift agent,
     moved to gold's own sessions.
2. **`lev-rotation-200d`: the 200-day leverage switch on US500 or US100** (feasible now; resizing means
   close-and-reopen).
   - Daily bars, signal from US500's close vs its 200-day SMA with a ±3% band (hold the current state inside it).
     Above: 2× notional (`exposure: 2`) on US500 (variant: US100). Below: 0.5× (variant: flat). Change only on a
     regime switch, at the next daily bar. Tiers 1:3 and 1:5 (2× at 1:2 would put all equity up as margin). Pair it
     with two controls: a constant exposure equal to the agent's average, and the same regime sequence shifted by
     a random number of months (the permutation control) [reddit-07].
   - Why: the most-tested leverage rule on Reddit, with a live record [reddit-01] and a permutation test
     [reddit-07]. Expect "similar Sharpe, smaller crashes" [reddit-04]. It is the leverage note's 200-day agent
     with Reddit's controls added.
3. **`orb-ny-5m`: 5-minute opening range on US500 and US100** (feasible now).
   - 1m bars (or 5m). Range = 09:30–09:35 New York. First 1m close beyond the range enters in that direction. Stop
     at the other side of the range, target 2× the range, exit at 15:30 New York; one trade a day; risk 1% to the
     stop. Tiers 1:20 and 1:50 (intraday, no funding).
   - Why: the 5-minute range beat 15 and 30 minutes in [reddit-35]; longs and shorts made the same. It is a cheap
     variant of our existing orb-ny.
4. **`orb-pullback`: break of the 30-minute range, enter on the retrace** (feasible now).
   - US100, 1m bars. After the first 1m close beyond the 09:30–10:00 range, record the swing from the opposite end of
     the range to the extreme reached since. Enter when price retraces 50% of that swing, stop at the 78.6%
     retrace, target the session extreme plus one range width. Flat by 15:55. One trade a day.
   - Why: a much-upvoted ORB post on r/Daytrading (score ≈ 1,000) [reddit-34]; it tests whether waiting for a pullback beats
     buying the break. Low prior; it costs little to run.
5. **`range-dip`: the range-dip + IBS daily rule** (feasible now).
   - US500, US100 and the eight share CFDs at 1:1 (shares pay no funding at 1:1). 30m bars. At the last bar before
     the New York close, compute today's high/low/close so far plus the 10-day high and 25-day average range. Buy if
     close < 10-day high − 2.5 × average range and IBS < 0.3. Sell at the close on the first day the close is above
     the previous day's high. No stop (as published); variant with a 3-ATR stop.
   - Why: 70–75% winners on SPY, QQQ and AAPL without re-tuning [reddit-17], and the same family has held 70%+
     since 1993 [reddit-20]. It overlaps rsi2-reversion; run it as the published rule.
6. **`gold-breakout-2r`: intraday breakouts with a fixed 2:1 reward:risk** (feasible now).
   - GOLD, 1h bars. Buy on a close above the 20-bar high, sell on a close below the 20-bar low. Stop 1.5 × ATR(14),
     target 3 × ATR(14), close at 21:00 London if still open (no funding). Risk 1% per trade. Tiers 1:20 and 1:50.
   - Why: the one third-party-verified Reddit record traded this shape on gold [reddit-14]. Our donchian agent
     trades 4h trends without fixed targets; this tests the positive-skew intraday version.
7. **`btc-zscore`: volatility-normalised trend on crypto** (feasible now).
   - BTCUSD and ETHUSD, 1d bars, at 1:1 (no funding). z = (close − EMA(65)) / stdev(close, 65). Go long when z > 1,
     go flat when z < 0. Long or flat only.
   - Why: [reddit-26]. The published thresholds are hidden, so these are round textbook values chosen before
     testing. Expected value: drawdown control at 1:1, not alpha.
8. **Controls that make leverage lessons visible** (feasible now).
   - `pyramid-control`: on US100 and BTCUSD at 1:10/1:20, add to a winning trend position by re-opening it 1.5×
     larger each time it gains 5% (close-and-reopen), with no stop except the margin rule. It reproduces the
     "200 BTC to 0" path [reddit-27].
   - `prop-challenge`: any leader's rules, run with prop-firm limits: stop the run for the day at −5% and
     permanently at −10% from the start; mark it passed at +10%. Report the pass rate by tier [reddit-30, reddit-31].
9. **Fix to check in the monkeys:** make sure random entries are drawn from the same windows the agent trades,
   never from periods that systematically come before its signals [reddit-20].

Platform changes worth considering:

- **Exposure by instrument across the mirrored runs.** Leaders can all be long US100 at once, as the evolved crypto
  agents all ended up in one coin [reddit-15]. A dashboard view of net demo exposure per instrument, and an
  optional cap per account.
- **A "same exposure, wrong dates" control generated per timing agent** (permutation test), and a constant-exposure
  control, so a leverage-timing agent is judged against de-levering in general [reddit-07].
- **Parameter jitter in the new-agent backtest:** run ±20% on every parameter and reject agents whose median Sharpe
  collapses [reddit-33].
- **A public, quarterly "leaders" record** in the style of the r/LETFs live test and Darwinex: fixed start date,
  fixed rules, a benchmark next to it [reddit-01, reddit-14].
- **Signal-to-fill logging:** time of signal, fill, gap and slippage per trade on the demo accounts, which is the
  live-vs-backtest gap everyone on r/algotrading reports [reddit-20, reddit-23].
- **A resize primitive** (already proposed in the leverage note) would make the 200-day 2×/0.5× switch and a 9Sig-style
  quarterly rebalance cheap.

## Open questions

- Get current Reddit scores and full comment trees through the browser. The archive scores are stale for some
  posts (for example, "Randomness beats 85% of Retail Traders" shows a score of 1 although it is in the all-time
  top 100).
- Gold session effect: does it survive on our 1-minute data using bid/ask, the exact 15:00 and 10:30 London
  times, and Friday funding? Does it also hold for SILVER, where the LBMA has only a noon fix? Clone
  `Robin-Haupt-1/lbma-east-west-divergence` and split the result at the 2015 change to an electronic auction.
- Read Gayed's revised paper (SSRN 2741701, September 2026 version) and the Philosophical Economics "growth-trend
  timing" posts that r/LETFs rates higher. The leverage note cites the 2016 version.
- 9Sig (Jason Kelly, "The 3% Signal"): get the exact quarterly rules and decide whether a single-instrument version
  (US100 sleeve plus cash) is honest enough for the arena.
- Not covered in this pass: r/Daytrading VWAP threads with evidence, r/CryptoCurrency and r/BitcoinMarkets
  funding-rate or weekend strategies, r/SecurityAnalysis, r/thetagang statistics threads (e.g. 45-DTE short
  put studies).
- The letf-lab repository (github.com/victornoleto/letf-lab) has the 426-config study and daily signals. Its
  gate design (pre-set Sortino margin, PBO, DSR) is worth comparing with our lifecycle rules.

## Sources

| id | title | authors / site | year | kind | link | local copy |
|---|---|---|---|---|---|---|
| reddit-01 | Update Q4 2026: Gehrman's ongoing test of 3 leveraged ETF strategies (HFEA, 9Sig, Leverage for the Long Run) | u/Gehrman_JoinsTheHunt, r/LETFs | 2026 | thread | https://www.reddit.com/r/LETFs/comments/1wuyzr0/ | files/reddit/letfs-gehrman-real-money-test.md |
| reddit-02 | On the relationship between QQQ and TQQQ returns | u/modern_football, r/LETFs | 2022 | thread | https://www.reddit.com/r/LETFs/comments/snc5a1/ | files/reddit/letfs-qqq-vs-tqqq-relationship.md |
| reddit-03 | 40-year LETF rotation backtest — 5 strategy families, 426 configs | u/noletovictor, r/LETFs | 2026 | thread | https://www.reddit.com/r/LETFs/comments/1t7q8or/ | files/reddit/letfs-40-year-rotation-426-configs.md |
| reddit-04 | Gayed revises his 2016 paper "Leverage for the Long Run" | u/CraaazyPizza, r/LETFs | 2026 | thread | https://www.reddit.com/r/LETFs/comments/1wl0p0k/ | files/reddit/letfs-gayed-revises-leverage-for-the-long-run.md |
| reddit-05 | SPY 200SMA (+4%/-3%) TQQQ/QQQ Long Term Investment Strategy | u/XXXMrHOLLYWOOD, r/LETFs | 2025 | thread | https://www.reddit.com/r/LETFs/comments/1nhye66/ | files/reddit/letfs-spy-200sma-buffer-tqqq.md |
| reddit-06 | Understanding the True Cost of Index LETFs like SSO, QLD, UPRO and TQQQ | u/SpookyDaScary925, r/LETFs | 2026 | thread | https://www.reddit.com/r/LETFs/comments/1wxfhmc/ | files/reddit/letfs-true-cost-of-2x-index.md |
| reddit-07 | I ran 250+ backtests trying to improve my SSO/QLD strategy. None of the improvements survived Monte Carlo | u/mongopark98, r/LETFs | 2026 | thread | https://www.reddit.com/r/LETFs/comments/1vpohm7/ | files/reddit/letfs-250-backtests-none-survived.md |
| reddit-08 | anyone else excited for 5x leverage? | u/chopsui101, r/LETFs | 2025 | thread | https://www.reddit.com/r/LETFs/comments/1on2s56/ | files/reddit/letfs-leverage-level-debates.md |
| reddit-09 | I think 3x leverage is making me sell at exactly the wrong times | u/DampSperm, r/LETFs | 2026 | thread | https://www.reddit.com/r/LETFs/comments/1wboq6l/ | files/reddit/letfs-leverage-level-debates.md |
| reddit-10 | 4 years of going nearly all in on TQQQ. Survived an 80% drawdown | u/Difficult_Minute_102, r/LETFs | 2026 | thread | https://www.reddit.com/r/LETFs/comments/1tpu8id/ | files/reddit/letfs-leverage-level-debates.md |
| reddit-11 | Why the 200 moving average strategy works and why it might stop working | u/Conclusion-Every, r/LETFs | 2025 | thread | https://www.reddit.com/r/LETFs/comments/1ir9eis/ | files/reddit/letfs-leverage-level-debates.md |
| reddit-12 | Genuine question: Is anyone here actually successful at this in live real money trading? | u/DigestingGandhi, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1u9ongr/ | files/reddit/algotrading-is-anyone-profitable-live.md |
| reddit-13 | August P&L Fully Automated | u/Same_Definition5233, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1w7zz3g/ | files/reddit/algotrading-is-anyone-profitable-live.md |
| reddit-14 | 2025 was my best year — and here's what I did differently | u/criptolibertari0, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1q25jpe/ | files/reddit/algotrading-2025-best-year-breakouts-gold-usdjpy.md |
| reddit-15 | I ran an evolutionary system live for 60 days (2,729 trades) — post-mortem | u/piratastuertos, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1tyc4nb/ | files/reddit/algotrading-evolutionary-system-live-postmortem.md |
| reddit-16 | Found persistent, systematic divergence of returns in precious metals tied to trading sessions (LBMA) | u/robinhaupt, r/algotrading | 2025 | thread | https://www.reddit.com/r/algotrading/comments/1oaueck/ | files/reddit/algotrading-precious-metals-session-divergence.md |
| reddit-17 | Found a simple mean reversion setup with 70% win rate but only invested 20% of the time | u/vaanam-dev, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1rjvxjy/ | files/reddit/algotrading-range-dip-ibs-mean-reversion.md |
| reddit-18 | Do support and resistance zones really weaken with every touch? 111,129 touches over 18 years | u/Obside_AI, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1vtkunw/ | files/reddit/algotrading-support-resistance-touches-vs-random.md |
| reddit-19 | I backtested 100+ retail trading strategies (~700 versions) with real costs and dead companies included | u/tanweer919, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1x2owmo/ | files/community/reddit-algotrading-100-strategies-what-survived.md |
| reddit-20 | Follow-up: Tested the stuff from your comments on my 100+ strategies post (and found a mistake in my own test) | u/tanweer919, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1x46igq/ | files/reddit/algotrading-100-strategies-follow-up.md |
| reddit-21 | Randomness beats 85% of Retail Traders | u/NormalIncome6941, r/algotrading | 2025 | thread | https://www.reddit.com/r/algotrading/comments/1ltww0d/ | files/reddit/algotrading-costs-randomness-and-live-reality.md |
| reddit-22 | This is what happens when you DO NOT include Fees in your backtests | u/Money_Horror_2899, r/algotrading | 2025 | thread | https://www.reddit.com/r/algotrading/comments/1kmfpx5/ | files/reddit/algotrading-costs-randomness-and-live-reality.md |
| reddit-23 | On switching to a commission-free broker for algo trading | u/MormonMoron, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1v4rzv2/ | files/reddit/algotrading-costs-randomness-and-live-reality.md |
| reddit-24 | After about 4 years of exploration and 1.5 year of persistent effort, I think we finally have a "system" | u/MormonMoron, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1qklj4o/ | files/reddit/algotrading-costs-randomness-and-live-reality.md |
| reddit-25 | Are you a profitable algo trader? Share your wisdom | u/ikarumba123, r/algotrading | 2025 | thread | https://www.reddit.com/r/algotrading/comments/1pehzuh/ | files/reddit/algotrading-costs-randomness-and-live-reality.md |
| reddit-26 | Sharing my Bitcoin systematic strategy: 65.92% CAGR since 2014 | u/virtuexru, r/algotrading | 2026 | thread | https://www.reddit.com/r/algotrading/comments/1qgcq2h/ | files/reddit/crypto-trend-zscore-and-leverage-blowups.md |
| reddit-27 | How I Lost Nearly 200 BTC trading this past month | deleted user, r/BitcoinMarkets | 2018 | thread | https://www.reddit.com/r/BitcoinMarkets/comments/7s8umm/ | files/reddit/crypto-trend-zscore-and-leverage-blowups.md |
| reddit-28 | 50 Crypto Trading & Investing Lessons Learned Over The Past 5 Years | Chris Dunn, r/BitcoinMarkets | 2018 | thread | https://www.reddit.com/r/BitcoinMarkets/comments/7o8vxq/ | files/reddit/crypto-trend-zscore-and-leverage-blowups.md |
| reddit-29 | Former investment bank FX trader: some thoughts | u/getmrmarket, r/Forex | 2020 | thread | https://www.reddit.com/r/Forex/comments/ia5f37/ | files/reddit/forex-leverage-prop-firms-and-risk.md |
| reddit-30 | Why buy prop challenges when you can use a 1:500 account and be your own prop firm | u/Dallydaybird, r/Forex | 2023 | thread | https://www.reddit.com/r/Forex/comments/13fy9dr/ | files/reddit/forex-leverage-prop-firms-and-risk.md |
| reddit-31 | I have achieved a milestone of $800k in funded capital after 6 years of trading. AMA | u/200415Ke, r/Forex | 2026 | thread | https://www.reddit.com/r/Forex/comments/1rapwi1/ | files/reddit/forex-leverage-prop-firms-and-risk.md |
| reddit-32 | Im done -30k - 3 years wasted | u/ednis4, r/Forex | 2026 | thread | https://www.reddit.com/r/Forex/comments/1u3z8oh/ | files/reddit/forex-leverage-prop-firms-and-risk.md |
| reddit-33 | I spent 7 months coding an algorithmic system for NAS100 + Gold. 9+ year backtest results | u/Ok_Maybe_5885, r/Daytrading | 2026 | thread | https://www.reddit.com/r/Daytrading/comments/1vyzl0q/ | files/reddit/daytrading-nas100-gold-system-overfit-checklist.md |
| reddit-34 | Been trading this ORB + Fib strategy for 3 years, consistently profitable | u/Current-Green6525, r/Daytrading | 2025 | thread | https://www.reddit.com/r/Daytrading/comments/1oaa8t9/ | files/reddit/daytrading-options-orb-variants.md |
| reddit-35 | 0DTE Opening Range Breakout Strategy on SPY — Full Backtest Results (303 Trades) | u/spicermatthews, r/options | 2026 | thread | https://www.reddit.com/r/options/comments/1rkx5vr/ | files/reddit/daytrading-options-orb-variants.md |
| reddit-36 | I analyzed 1.5M quotes to quantify the real bid-ask spread cost for 0DTE SPX Iron Condors | u/mystic12321, r/options | 2025 | thread | https://www.reddit.com/r/options/comments/1n461td/ | files/reddit/options-premium-selling-costs-and-tails.md |
| reddit-37 | The big premium is the market warning you, not paying you | u/sashazaliz, r/options | 2026 | thread | https://www.reddit.com/r/options/comments/1voez8q/ | files/reddit/options-premium-selling-costs-and-tails.md |
| reddit-38 | After Few Years Wheeling + LEAPS Beats All | u/breakyourteethnow, r/options | 2026 | thread | https://www.reddit.com/r/options/comments/1qo1jmn/ | files/reddit/options-premium-selling-costs-and-tails.md |
| reddit-39 | Never SELL NAKED CALLS. My 100k loss turned into over 600K in minutes with AMC | u/Substantial-Voice-48, r/thetagang | 2021 | thread | https://www.reddit.com/r/thetagang/comments/nqy5nk/ | files/reddit/options-premium-selling-costs-and-tails.md |
| reddit-40 | Reflections from a senior quant | u/BirthDeath, r/quant | 2022 | thread | https://www.reddit.com/r/quant/comments/xhya4d/ | — |
