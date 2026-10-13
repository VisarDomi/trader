# Trading at 1:1: no overnight fees, dividends, and cost-aware holding

_First pass 2026-10-13._

> **Verified 2026-10-13 on the demo accounts.** From 8 to 12 October, Arena 01 (1:1) was charged overnight fees
> only on NATURALGAS (5 charges, −$1.39). Its US100, US500, US30, GOLD, SILVER, OIL_CRUDE, EURUSD, GBPUSD and AUDUSD
> buy-and-hold positions paid none. Arena 06 (1:20) paid fees on all of those (US100 −$8.78, BTCUSD −$19.37, …). So
> the wider rule holds: at 1:1 only natural gas (and cocoa, VIX, TRY pairs, which we do not trade) pays funding, and
> the engine overcharges every 1:1 run on indices, metals, oil and FX. Arena 01 also received index dividend
> adjustments on 8 and 12 October (US500 +$0.03 to +$0.20 per position; a short US30 position paid −$0.13), which the
> engine does not model. Source: `GET /history/transactions` on both accounts.

## In short

- **The 1:1 exemption may be wider than the engine assumes.** Capital.com's current fees page, in every region
  checked (int, gb, au, ae), says 1:1 CFD positions on "most markets" pay no overnight funding. The exceptions listed
  are Natural Gas, US Cocoa, VIX and Turkish-lira pairs. The July 2024 press release covered only shares and crypto,
  and that older rule is what `engine/leverage.ts` implements. If the wider rule applies to our login, US100, US500,
  US30, GOLD, SILVER, OIL_CRUDE and FX are also free at 1:1, and only NATURALGAS still pays. Verify this from the
  SWAP entries on Arena 01 before changing anything. This is the most valuable finding here [unlevered-01][unlevered-02].
- **Funding is about as large as the equity premium.** A long index or share position costs SOFR + 4% ≈ 8.1% a year of
  notional. A long crypto position costs ≈ 22.5% a year. At that cost, the growth-optimal (Kelly) exposure to US100 is only
  0.4–0.9× if US100 returns 10–12% a year. A fee-free 0.9× share holder beats the best financed index position unless the
  index is expected to return more than about 15% a year. Leverage on index buy-and-hold has only paid off in
  2024–26 because US100 rose about 25% a year.
- **Dividends hardly matter for our shares.** Share and index CFDs get a cash adjustment on the ex-date: longs are
  credited (possibly less withholding tax) and shorts are debited in full [unlevered-03][unlevered-05][unlevered-07].
  Six of our eight shares pay 0.02–0.8% a year, which averages about 0.3% for the basket. Dividend capture on them is
  worthless: the gap between the price drop and the credit is at most about 3 bp per quarter, while the spread is 5–10 bp. The
  engine does ignore index dividends, which understates index longs by roughly 0.6% (US100), 1.2% (US500) and 1.7%
  (US30) a year.
- **The classic mega-cap event effects have faded.**
  - Post-earnings drift has been absent in large stocks since 2006 [unlevered-15].
  - The US earnings-announcement premium has been gone since 2004 [unlevered-14].
  - The S&P 500 inclusion effect fell from 7.6% in the 1990s to 0.3–0.8% in the 2010s [unlevered-17].
  - The dividend-month premium [unlevered-11] is the most plausible survivor. It is small for value-weighted large caps
    (0.24–0.32% a month over 1927–2009) and gives only 4 trades a year per share.
- **The crypto calendar effects we can see do not survive costs.**
  - BTC and ETH again earn the most between 21:00 and 23:00 UTC in our 2024–26 data, but Capital.com's spread is as
    large as the edge.
  - Weekends show half the volatility and no extra return.
  - Volatility clusters.
  - The 1–4 week momentum found for 2011–18 [unlevered-29] is not visible in 2024–26.
- **Rebalancing between crypto and cash ("Shannon's demon") suits a fee-free 1:1 account best.** In theory the bonus is
  ½·w(1−w)·σ² ≈ 3% a year for BTC/cash 50/50. Before costs in 2024–26, it added +1.4% a year on BTC and +7% a year on
  ETH over a 50/50 buy-and-hold. To run it cheaply, the SDK needs a partial-resize call
  [unlevered-31][unlevered-32].
- **Closing just before the daily rollover does not avoid funding in practice.** You could close at 16:54 New York and
  reopen after the break to skip the night's charge. But US index prices drift up across the break by almost exactly the
  funding saved: +2.05 bp against 2.22 bp on US100, t = 2.7. Skipping the Friday triple charge saves about 6 bp a
  weekend at 1× exposure, but that evidence is weak.

## Findings

### 1. How CFD overnight funding works at four brokers

Every CFD broker finances a long position as if it lent you the full notional. A short position earns or pays the
benchmark rate minus the broker's fee. Charges are applied once a day at the rollover.

| broker | formula (USD underlyings) | when | weekend | unleveraged exemption |
|---|---|---|---|---|
| Capital.com | benchmark (SOFR) ± 4%/360 a day ("our daily fee is 4% per year"); US100 long −0.02218%/night, short −0.00004% (table 2026-10-13); crypto long −0.06164%, short +0.01370% | 22:00 UK (= 17:00 New York) | three nights on Friday for non-crypto; crypto charged every night | 2024: 1:1 shares and crypto; current page: most markets except NATURALGAS, cocoa, VIX, TRY [unlevered-01][unlevered-02] |
| IG | contracts × price × (3% ± SOFR) ÷ 360 (AU/AE pages say 2.5%) | 22:00 UK | Friday is charged three days | none for CFDs (it sells real shares in a separate account) [unlevered-05] |
| eToro | stocks long: 6.4% + benchmark, ÷ 365; easy-to-borrow shorts free | 21:00 GMT (22:00 DST) | ×3 on Friday (stocks, indices, oil), Wednesday (most commodities and FX) | non-leveraged buys of stocks are real shares, with no fee [unlevered-06] |
| Plus500 | daily % shown under "Details" for each instrument; futures-based CFDs roll instead | "Overnight Funding Time" per instrument | per instrument | none found [unlevered-07] |

The engine's numbers match Capital.com within rounding. Index and share longs pay 0.0222%/night, about 8.1% a year;
crypto longs pay 0.0616%/night, about 22.5% a year. The implied SOFR is about 4.0% (`engine/instruments.ts`).
Capital.com's worked example: a 1:1 Tesla long of $9,750 would normally pay $2.31 a night, $64.68 over 28 days
[unlevered-02]. The July 2024 press release says 89% of all non-leveraged overnight positions in Q2 2024 were in
stocks and crypto. Average holding periods were up to 7 days for stocks and about 4 days for crypto.

### 2. The 1:1 rule as Capital.com states it today

The fees page says "1:1 leverage (unleveraged) CFD positions are not subject to overnight funding, except on a limited
number of markets". It also says "For most markets, a 1:1 leverage (unleveraged) CFD position will not incur an
overnight funding fee. The following instruments are exceptions … Natural Gas, US Cocoa, VIX, TRY pairs." The UK page
adds "Overnight fees do not apply to unleveraged 1X CFD accounts" [unlevered-01].

The economics support the wider rule: at 1:1 you post the whole notional, so nobody lends you anything. It is not clear
whether shorts at 1:1 also stop receiving their small credit.

**Confidence:** medium that the wider rule applies to us. The page is undated, the per-instrument table still shows
funding rates (those apply to leveraged positions), and the AU and AE pages list only cocoa as an exception.

**Why it matters:** if the rule holds, these runs are currently charged about 8% a year that the real demo accounts do
not pay: buy-hold, turn-of-month and overnight-drift on indices, and tsmom on all its instruments at 1:1.

### 3. Dividend adjustments on share and index CFDs

What Capital.com says [unlevered-03]:

- **Timing.** "Dividends on CFDs are paid on the ex-dividend date." The adjustment applies to "any open positions held
  through the ex-dividend date".
- **Long positions.** The amount is size × dividend, credited, "adjusted, if necessary, for taxation".
- **Short positions.** The same amount is debited, with no tax adjustment.
- **Indices.** "Dividends are paid on indices and all dividend-paying shares only." Index adjustments are in index points.
  Capital.com posts a weekly "Projected Dividends" table, at 21:00 UK for US indices [unlevered-04]. For the week of
  12–16 Oct 2026: US500 0.183 / 0.112 / 0.544 / 0.073 / 0.1 points per day, US100 0.216 points on 13 Oct, and US30
  9.688 points on 16 Oct. "If you hold a short position, you are charged the projected amount. If you hold a long
  position, you receive the projected amount."

Other brokers:

- IG: "To be eligible, you would need to hold your position into the market open of the ex-date" [unlevered-05].
- Plus500 does the same for equity and ETF CFDs, and adjusts for splits [unlevered-07].

The economic effect is that a CFD long earns roughly the total return less funding, the same as an owner but minus the
financing. A short pays the dividend in full.

**What the engine misses:**

- Index longs: the price series drops by the dividend but no credit is paid. That understates them by about the index
  yield, roughly 0.6% a year on US100, 1.2% on US500 and 1.7% on US30, and overstates index shorts by the same amount.
- Shares: longs are understated by at most 0.8% a year (MSFT), and shorts held across ex-dates are overstated.

Withholding tax is unknown. US-source dividends for non-US clients are usually taxed at 15% with a W-8BEN form or 30%
without one, and Capital.com's help centre has a W-8BEN article.

### 4. Weekend triple charges

Capital.com, IG and eToro charge three nights on Friday for shares and indices (eToro charges most FX and commodities
on Wednesday). Crypto is charged every night, including weekends [unlevered-01][unlevered-05][unlevered-06]. So a
position open at Friday 17:00 New York pays for Friday, Saturday and Sunday nights. A position closed at 16:54 and
reopened at the Sunday 18:00 reopen pays nothing for them. See §20 for whether that is worth doing.

### 5. What leverage costs: Kelly arithmetic for financed index longs vs a fee-free 1:1 holder

**Financed long.** Take an expected arithmetic return μ, volatility σ and CFD financing c ≈ 8.1% a year on notional. The
account's cash earns nothing at Capital.com. Log growth at exposure k is then g(k) = k(μ − c) − ½k²σ², which peaks at
k* = (μ − c)/σ². Index dividend credits lower c by the yield q, but the engine ignores them.

US100 had σ ≈ 21% in 2024–26 (own check [unlevered-37]):

| expected US100 return μ | k* (growth-optimal exposure) | best growth g* |
|---|---|---|
| 10% | 0.43× | +0.4%/yr |
| 12% | 0.88× | +1.7%/yr |
| 25% (realized 2024–26) | 3.8× | +32%/yr |

**Fee-free 1:1 holder.** At 0.9× (the most 1:1 allows): g = 0.9μ − 0.405σ².

- At μ = 10%, a fee-free US100 position grows 7.2% a year. A 30%-volatility share grows 5.4% a year.
- If indices are not exempt at 1:1, 0.9× US100 pays 7.3% a year and grows about 0%.
- Break-even: the 1:1 share (μ 10%, σ 30%) beats any leverage on a financed US100 (σ 21%) unless US100 is expected to
  return more than about 15% a year.

**Crypto at leverage** pays about 22.5% a year. With σ ≈ 45%, a financed BTC long has positive growth only if BTC is
expected to return more than about 22.5% + ½kσ². This matches the leverage-ladder backtest: BTC hold made +11.5% at
1:1 and lost 88% at 1:20 (JOURNAL 2026-10-07).

This is arithmetic, not evidence, but it explains the leverage tiers: buy-and-hold at high leverage is a bet that
returns stay far above the financing rate.

### 6. Dividend capture and the ex-dividend price drop

**The tax theory.** Elton & Gruber (1970) studied NYSE stocks from April 1966 to March 1967. Prices fell by less than the
dividend on ex-days (a ratio of about 0.78, as widely cited). The shortfall was largest for low-yield stocks, whose
holders face high taxes, and smallest for high-yield stocks. They read this as a tax clientele effect: the drop reveals
the marginal holder's tax rate on dividends versus capital gains [unlevered-08]. Our mega caps are all low-yield, so
this theory predicts drops well short of the dividend.

**Tests since then.**

- Kalay (1982) and the microstructure school argued that bid–ask bounce and short-term arbitrage drive the ratio.
- Elton, Gruber & Blake (2002/2005) used taxable and non-taxable closed-end funds as a natural experiment. They found ex-day
  behaviour that "changes, as theory would suggest, with changes in the tax law" [unlevered-09].
- Ainsworth et al. (2018, Australia) find buying pressure before the ex-day that lifts prices, which then reverse
  after it. They reject the bid–ask explanation [unlevered-10].

**For a CFD the economics differ.** The adjustment pays the full dividend (less withholding for longs), whatever the
price does. A long held across the ex-date nets about D·(1 − w − ratio), where w is the withholding rate:

- With w = 15% and ratio 0.7–1.0, that is −0.15 D to +0.15 D.
- MSFT's next dividend is $0.98 on a share near $500, so D ≈ 0.2%. At most 0.15 D ≈ 0.03% against a spread of
  0.05–0.1%.
- Shorts lose (1 − ratio)·D.

**Verdict:** dividend capture on our shares is not worth testing. Avoiding shorts across ex-dates and modelling the
adjustment correctly is the only practical point.

### 7. Dividend month premium and the pre-ex-dividend run-up

Hartzmark & Solomon (2013, JFE) studied US stocks from 1927 to 2009 [unlevered-11]:

- **Returns.** Stocks expected to pay a dividend this month earned 1.38% a month, against 1.01% for other payers and for
  non-payers.
- **Four-factor alpha** of long dividend-month stocks against all others: 0.53% a month equal-weighted, 0.32%
  value-weighted. Long-only value-weighted: 0.24%.
- **Predictability.** A firm that paid 3, 6, 9 or 12 months ago pays this month with 83–88% probability.
- **Timing.** Returns rise toward the ex-day, the equal-weighted daily return peaks at +0.30% on the ex-day, and returns
  turn negative after it.
- **Where it is strongest.** In higher-yield and less liquid stocks. It persists across subperiods and is attributed to
  price pressure from dividend-seeking investors, not to risk.

Replications: Germany and the Nordic markets confirm it, Japan does not. CXO notes that the figures are gross and
turnover is high.

**Applied to our shares:** the payers' ex-dividend months are regular.

- AAPL and MSFT: Feb, May, Aug, Nov (AAPL ex-date 10 Aug 2026; MSFT 20 Aug 2026 and about 19 Nov 2026 at
  $0.98).
- AVGO, META, GOOGL, NVDA: Mar, Jun, Sep, Dec (GOOGL $0.22, ex-date 8 Jun 2026).

**Confidence:** low that the premium shows up in 0.3%-yield mega caps. Each run would make only 4 trades a year.

### 8. Our eight shares and dividends (approximate, October 2026)

| share | quarterly dividend | yield | ex-dividend months | note |
|---|---|---|---|---|
| MSFT | $0.91 → $0.98 (declared 2026-09-15) | ~0.8% | Feb May Aug Nov | |
| AVGO | ~$0.65 | ~0.7% | Mar Jun Sep Dec | |
| AAPL | $0.27 | ~0.3–0.4% | Feb May Aug Nov | |
| GOOGL | $0.22 | ~0.3% | Mar Jun Sep Dec | |
| META | ~$0.53 (2025 figure; 2026 not verified) | ~0.3% | Mar Jun Sep Dec | |
| NVDA | $0.01 historically | 0.02% | Mar Jun Sep Dec | one 2026 source says $0.25/quarter: unverified |
| AMZN, TSLA | none | 0 | — | |

The figures are from search results and aggregators, so confidence is medium. The basket's yield is about 0.3%, roughly
1/25 of the 8.1% funding that 1:1 saves.

### 9. Earnings: post-earnings drift, the announcement premium and the pre-earnings run-up

- **The announcement premium.** Frazzini & Lamont (2007) show stocks earn more in months with a scheduled earnings
  announcement: a long/short of 61 bp a month (about 7% a year, t > 5) from 1927, "strong in large capitalization
  stocks". Of that, about 25 bp comes in the 10 days before, 21 bp in the 3 days around, and 30 bp after
  [unlevered-12]. Barber et al. (2013) find the premium in 46 countries, over 11% a year, smaller for the largest stocks
  [unlevered-13].
- **It has disappeared in the US.** Heitz, Narayanamoorthy & Zekhnini (2020) find the US premium has been gone since the
  2004 8-K disclosure rule: the weekly return is 23.9 bp lower after 2004. It survives in other countries
  [unlevered-14].
- **Post-earnings drift is gone in large caps.** Martineau (2022) shows "for large stocks, PEAD have been non-existent
  since 2006"; prices fully reflect the surprise on the announcement day [unlevered-15]. Later papers dispute this for
  smaller stocks (2025 UCLA Anderson brief).
- **A run-up for past winners.** Aboody, Lehavy & Trueman (2010) studied 1971–2005. The top past-12-month winners earned
  +1.58% market-adjusted in the 5 trading days before earnings and −1.86% in the 5 days after, significant after costs.
  They attribute it to retail attention [unlevered-16]. It fits our shares (habitual winners) but predates the post-2004
  decay.

Earnings schedules:

- AAPL, MSFT, AMZN, META, GOOGL, TSLA: last weeks of Jan, Apr, Jul, Oct.
- NVDA: late Feb, May, Aug, Nov.
- AVGO: 2nd week of Mar, Jun, Sep, Dec.

Exact dates vary by a week or two, so a pre-announcement window needs a calendar.

### 10. Index rebalancing and inclusion effects

Greenwood & Sammon (2022; Journal of Finance 2025) report that the S&P 500 addition effect fell from 3.4% (1980s) and
7.6% (1990s) to 0.8% over 2010–2020 (0.3% in the published version), and deletions to −0.6% [unlevered-17]. Tesla
(Dec 2020, the largest addition ever at over 2% of the index) earned +5.2% at announcement and +4.5% at implementation.
Without Tesla, the 2020 average was −3 bp.

The Nasdaq-100 schedule matters more for our shares [unlevered-18]:

- Quarterly reweighting after the third Friday of March, June, September and December.
- Annual reconstitution in December.
- A special rebalance when companies above 4.5% exceed 48% of the index combined. This happened on 24 Jul 2023: weights
  were cut to 40%, with an estimated $19bn of passive selling of MSFT and $18bn of AAPL (Ortex estimates). Announced on
  7 Jul; six of the capped names fell on the next trading day (10 Jul) while QQQ was flat.

The dates are known in advance, so no data feed is needed. The literature says the effect is now small: low
confidence of an edge.

### 11. Overnight vs intraday returns for single stocks

- **Momentum is earned overnight.** Lou, Polk & Skouras (2019) find momentum and most other strategy profits are earned
  entirely overnight, while reversal-type profits come intraday. They also find firm-level overnight and intraday
  returns each persist for years: a hedge on the past month's overnight return earns 3.47% a month overnight and −3.24%
  intraday [unlevered-19].
- **News explains much of the split.** Glasserman et al. (2025) note that "nearly all the gains in the US stock market
  have been earned overnight" for 30 years, and that news topics explain a large part of it [unlevered-20].
- **The window is around the European open.** Bondarenko & Muravyev (2023) use E-mini S&P futures and find the whole
  average return comes in the 4 hours around the European open (23:30–03:30 ET): 7.6% a year, Sharpe 1.67, positive
  in every year [unlevered-21].
- **A contested reading.** Knuteson (2020) argues the split is too regular to be benign and blames it on large trading
  firms. This is a contested view [unlevered-22].

**Own check** [unlevered-37] (Capital.com 24-hour share CFDs, 2024-01 to 2026-09):

- The 16:00→09:30 return was +61% a year on NVDA (t = 3.3) vs −4% intraday, +19% on US100 (t = 2.4) vs +3% intraday.
- AAPL (−11% overnight, +32% intraday) and GOOGL (+6% vs +28%) were intraday names.

**Cost check:**

- A daily round trip on a share CFD costs 15–27% a year (spread 4–7 bp at 16:00, 7–16 bp at 09:30).
- On US100 and US500 it costs about 2% a year.

So at 1:1, where holding is free, holding a share overnight only is strictly worse than holding it around the clock
unless the intraday return is below about −20% a year. None of our shares qualifies.

### 12. Momentum within mega caps and the concentration debate

- **Momentum does not depend on size.** Israel & Moskowitz (2013) find momentum profits "exhibit no reliable relation
  with size" (unlike value) [unlevered-23]. Cross-sectional momentum among the eight needs a portfolio agent. A
  time-series version (hold or flat by each share's own trend) fits the SDK.
- **Concentration is at a record.**
  - The top 10 companies are about 39% of the S&P 500 (Aug 2025, Goldman data) against about 27% in 2000.
  - The Magnificent Seven made over 62% of the Russell 1000's 2023 gain.
  - Goldman's decade forecast is 3% a year, versus about 7% if the market were not so concentrated [unlevered-24].
- **No academic test found** of concentration predicting returns. Bessembinder (2018) shows that 4% of US stocks created
  all net wealth from 1926 to 2016, so a few dominant winners are normal [unlevered-25].
- **Own check** [unlevered-37]: an equal-weight basket of our 8 shares returned +39% a year against +25% for US100 in 2024–26. Its beta
  was 1.2, correlation 0.92 and tracking error 11–12% a year. It is a high-beta tilt, not a stand-in for US100.

### 13. Crypto: weekends and day of week

- **Studies disagree.** Early studies found a Monday premium in BTC. Baur et al. (more than 15 million observations,
  seven exchanges) find "time-varying effects but no consistent or persistent patterns" [unlevered-27]. Hansen et al.
  find volatility and volume clearly lower on weekends, most of all on Saturdays [unlevered-28].
- **Own check, 2024–26 (UTC days) [unlevered-37]:**
  - BTC returned +0.48% a day on Mondays (t = 2.0), with weekday signs alternating (Tue −, Wed +, Thu −), which looks
    like noise.
  - Weekend days averaged ≈ 0 (BTC +0.04%, ETH +0.08%).
  - Average absolute moves on weekends were 56% (BTC) and 65% (ETH) of weekday moves.
- **For a 1:1 account:** no weekend return premium. The low weekend volatility could feed volatility sizing.

### 14. Crypto: hour of day and sessions

- **The published effect.** Padyšák & Vojtko (Quantpedia, Gemini data 2015–2022) find 22:00 and 23:00 UTC the best
  hours. Buying at 21:00 and selling at 23:00 UTC returned 33% a year with 21% volatility, and 40.6% a year to mid-2023,
  but "had a rough period" in 2022–23. No costs were included [unlevered-26].
- **Activity patterns.** Hansen et al. find hour-of-day volatility patterns that are growing stronger, partly tied to
  perpetual-futures funding times (Binance 00:00, 08:00 and 16:00 UTC) [unlevered-28].
- **Own check (mid prices) [unlevered-37]:**
  - The 21:00–23:00 UTC hours are again the best: BTC +3.5 and +3.1 bp (t = 2.3, 2.0), ETH +7.3 bp (t = 3.2); 23:00 is
    negative.
  - Gross per trade, BTC made +6.6 bp and ETH +10.8 bp. After buying the ask and selling the bid, BTC lost 3.1 bp
    (−11% a year) and ETH 0.7 bp.
  - 2025 was positive net; 2024 and 2026 negative.
- **Why only 1:1 could ever work:** the window spans Capital.com's 17:00 New York rollover (22:00 UTC in winter). At any
  leverage above 1:1 each trade would also pay a night's crypto funding (6.2 bp).

**Verdict:** real but untradable at Capital.com's crypto spread. High confidence.

### 15. Crypto: halving cycles

Halvings happened in 2012, 2016, 2020 and April 2024; the next is due around 2028 (block 1,050,000). Virtonen (2025)
uses synthetic control and finds a positive effect of the 2024 halving 3 months later, worth about a fifth of BTC's
April 2023 to July 2024 rise. The 2020 halving shows no robust effect [unlevered-30].

With four events, cycle timing cannot be tested or judged in the arena (one trade per four years). At most it is
context for regime filters.

### 16. Crypto: momentum vs reversal, and volatility clustering

**Momentum.** Liu & Tsyvinski (NBER 2018, published in RFS 2021) studied 2011–2018:

- One standard deviation of today's BTC return predicts +0.33% tomorrow.
- Weekly returns predict the next 1–4 weeks: the top weekly quintile returns 11.22% the next week.
- Momentum holds out of sample within their period and is weaker for ETH [unlevered-29].

Later work finds weekly momentum only in large liquid coins and reversal in small, illiquid ones (Prague FFA working
paper 2023, "Impact of size and volume on cryptocurrency momentum and reversal"). Others find 1–6 month momentum
insignificant and 1-month reversal significant (Dong et al. 2022). Not added as sources: these are search abstracts only.

**Own check, 2024–26 [unlevered-37]:**

- Daily return autocorrelation was −0.05 (BTC) and −0.01 (ETH); weekly −0.07 and −0.02. The short-horizon momentum
  has decayed.
- A 28-day trend sign still separated ETH's next week (+1.35% after up, −0.99% after down) but barely separated BTC's
  (+0.65% vs +0.26%).
- Volatility clusters strongly: the absolute daily return autocorrelation for BTC was +0.15 at lag 1 and +0.10 at lag 5.

**Volatility management.** Moreira & Muir (2017) scale exposure by inverse recent variance [unlevered-35]. Cederburg et
al. (2020) find that across 103 strategies, real-time volatility-managed versions do not beat the originals out of sample
[unlevered-36]. So volatility scaling is a risk-control idea, not an expected-return one. The existing vol-target agent
tests it on indices.

### 17. Crypto: the rebalancing premium (Shannon's demon)

**Theory.** Keep a fixed fraction w of equity in a volatile asset and the rest in cash, and rebalance. Each time, you sell
some after rises and buy after falls. The growth bonus over buy-and-hold of the same start mix is about ½·w(1−w)·σ²
when the asset is a random walk. Witte (2015) shows the profit grows with σ², shrinks with correlation, and is zero at
ρ = 1 [unlevered-31].

**Is it real?** The HN debate is useful [unlevered-32]. It is not free money: it converts an asset's arithmetic return
into geometric growth, and it loses against a strongly trending asset.

**For BTC/cash 50/50 at σ ≈ 45–55%:** about 2.5–3.8% a year.

**Own check, daily closes, no costs, 2024-01 to 2026-09 [unlevered-37]:**

| pair | daily rebalance | 10-point band | turnover (daily / band) |
|---|---|---|---|
| BTC/cash 50/50 | +3.9 pts (≈ +1.4%/yr) | +5.6 pts | 4.4× / 0.3× equity |
| ETH/cash 50/50 | +18 pts | +21 pts | 6.2× / 0.8× |
| BTC/ETH 50/50 | +3.3 pts | +6.1 pts | — |

Points are gains over 50/50 buy-and-hold across the whole period. BTC alone went ×1.89 and ETH alone ×1.14.

The arXiv crypto-rebalancing work found is engineering rather than evidence. Kashyap's waterfall mechanism (arXiv
2407.12150) claims "daily rebalancing will benefit from volatility" with no out-of-sample test. Vendor backtests
(Shrimpy) are mostly altcoins in bull markets.

**Fit for us:** good. It is fee-free at 1:1, long-only, and needs no forecast. Its cost is giving up some trend.

### 18. Perpetual funding rates as a sentiment signal

- **What funding measures.** He, Manela, Ross & von Wachter (2022) explain the mechanism: longs pay shorts in
  proportion to the perpetual–spot gap. The gaps are larger than in FX, move together across coins and shrink over time
  [unlevered-33]. So funding measures leveraged long demand.
- **Contrarian evidence is thin.** K33 Research found that after BTC's 30-day average funding turned negative (7
  episodes since 2018), the average 90-day return was +79% and the median +55% [unlevered-34]. That sample is tiny and
  untested out of sample.
- **Not usable yet.** Funding is not tradable on Capital.com and not in our data. Agents would need an external feed to
  use it as a slow regime filter.

### 19. Buy-and-hold costs and owning the components instead of the index

From §5:

- A financed index long costs SOFR + 4% (about 8.1% a year) minus the index dividend yield. A 1:1 share costs nothing
  but the spread.
- If Capital.com's wider rule holds, a 1:1 index position is also free. The "own the components" argument for fee
  savings then disappears, and only the 0.9× cap remains.
- If the rule does not hold, holding the eight largest components at 1:1 saves about 8% a year. The price is a 1.2-beta
  basket with 11–12% annual tracking error [unlevered-37] and one run per share.

Direct indexing (owning the components) is mainly sold for tax-loss harvesting, which is irrelevant here. Its real cost
for us is the tracking error. A top-N basket only tracks well with cap weights and periodic rebalancing, which the SDK
cannot do: one instrument per run.

### 20. Cost-aware holding: dodging the rollover and the weekend

**Daily rollover.** Close at 16:54 New York and reopen at 18:05 after the break, to avoid the night's funding. Own check
on Mon–Thu nights, 2024–26 [unlevered-37]:

| instrument | funding saved | mid drift across the break | spread paid | net |
|---|---|---|---|---|
| US100 | 2.22 bp | +2.05 bp (t = 2.7) | 0.83 bp | about −0.7 bp |
| US500 | 2.22 bp | +1.69 bp (t = 2.8) | 0.96 bp | about −0.4 bp |
| US30 | 2.22 bp | +1.23 bp (t = 2.6) | 0.48 bp | about +0.5 bp |
| GOLD | 1.62 bp | +3.45 bp (t = 5.7) | 1.28 bp | clearly negative |
| shares, silver, oil | — | — | 5–10 bp | clearly negative |

One possible reason, not verified: the futures carry may be rolled into the cash CFD price at the break, which would make
the funding largely an accounting transfer. **Verdict:** do not build it.

**Weekend.** On US100, Friday 16:54 → Sunday reopen averaged −2.6 bp (t = −0.4). Three nights of funding cost 6.7 bp
and the spread 0.8 bp. A leveraged index holder that sits out the weekend would save about 6 bp a weekend at 1× (about
3% a year), times the exposure, if the weekend gap really averages zero. The Sunday-reopen → Monday 09:30 move
(+18 bp, consistent with the European-open finding) is kept. **Evidence:** weak, because the gap estimate is noisy.
The idea is testable.

## For the arena

The 1:1 account (Arena 01) holds the shares and crypto fee-free. Its edge is not paying carry and never being
margin-called: at 0.9× exposure and 1:1 margin, a stop-out would need a fall of more than 100%. Strategies for it
should hold a lot and trade little. Daily round trips cost 15–27% a year on shares.

### Feasible now (fixed parameters, one instrument per run)

1. **`vol-managed-hold`** (Moreira & Muir [unlevered-35], risk control rather than alpha [unlevered-36]).
   - Instruments: the 8 shares, BTCUSD, ETHUSD. Timeframe `1d`. `leverage: [1]`.
   - Exposure = 0.9 × min(1, σ₂₅₂ / σ₂₁), using realized daily volatility over 252 and 21 bars (calendar-time scaling
     for crypto, as vol-target does). Full size when recent volatility is at or below its 1-year level, smaller when it
     is higher.
   - Re-evaluate every Monday. Resize (close and reopen) only if the target differs from the current exposure by at
     least 0.15.
   - Expected 10–20 trades a year. Compare against buy-hold on the same run: the test is Sharpe and drawdown, not
     return. Prior: modest. This is the journal's "volatility-managed shares at 1:1" candidate.
2. **`crypto-demon`** (Shannon's demon [unlevered-31][unlevered-32]).
   - Instruments: BTCUSD and ETHUSD, separate runs. Timeframe `1d`. `leverage: [1]`.
   - Hold 50% of equity long. At each daily close, if the position's value is outside 45–55% of equity, close and
     reopen at `exposure: 0.5`.
   - Expected 4 rebalances a year on BTC and about 10 on ETH (2024–26 turnover). Each costs half a spread on 0.5×
     equity.
   - Prior: +1–3% a year over a 50/50 hold in choppy markets, worse in strong trends.
   - Problem: too few trades for the 30-trade judgement. Judge it against a paired 50% buy-hold control, or see
     platform change 4.
3. **`weekend-flat`** (cost-aware index hold, §4 and §20).
   - Instruments: US100, US500, US30. Timeframe `5m`. `leverage: [1, 3]`.
   - Long at `exposure: 1` (0.9 at 1:1). Close on the bar closing at 16:55 New York on Friday; reopen on the first bar
     at or after Sunday 18:05 New York.
   - 52 trades a year, so it is judged in about 7 months. Compare with buy-hold at the same tier.
   - Prior: about +3% a year at 1× from funding saved, ± the weekend gap.
   - The 1:1 run doubles as a test of the funding rule, read from the demo account's own P&L rather than the paper
     engine. If indices are fee-free at 1:1, it should trail buy-hold at 1:1 by about the spread; if they are not, it
     should beat buy-hold at 1:1 by about as much as the 1:3 run beats its own buy-hold.
4. **`trend-or-cash`** (long-only time-series momentum at 1:1, [unlevered-29]; within-stock version of
   [unlevered-23]).
   - Instruments: the 8 shares, BTCUSD, ETHUSD. Timeframe `1d`. `leverage: [1]`.
   - Long at 0.9× when the 20-bar return is above 0, otherwise flat. No shorts, so no dividend debits and no short
     funding.
   - Expected 8–20 trades a year.
   - Differs from `tsmom`, which is long/short with 1% risk and a 4-ATR stop: this one takes full fee-free exposure or
     cash.
   - Prior: low to modest on the shares; best on ETH in 2024–26 [unlevered-37].
5. **`dividend-month`** (Hartzmark & Solomon [unlevered-11]). Low priority.
   - Instruments: AAPL and MSFT (months 2, 5, 8, 11); AVGO, META, GOOGL, NVDA (months 3, 6, 9, 12). Timeframe `30m`.
     `leverage: [1]`.
   - Buy 0.9× at the 16:00 close on the last trading day before the ex-dividend month; sell at the 16:00 close on the
     last trading day of that month.
   - 4 trades a year per run, so it needs pooled judging (platform change 4). Prior: low, given yields of 0.3–0.8%.

### Not worth building (by arithmetic or decay)

- **BTC/ETH 21:00–23:00 UTC window:** the gross edge (6.6 / 10.8 bp) is about the spread (6.6 / 8.6 bp). It lost net in
  2024 and 2026.
- **Overnight-only or intraday-only shares:** spread 15–27% a year vs at most a 20% a year intraday drag. Holding
  around the clock at 1:1 dominates.
- **Daily rollover dodge on indices:** the price drift across the break ≈ the funding saved (§20).
- **Dividend capture or ex-day shorts on our shares:** D ≈ 0.07–0.2% per quarter; the edge is at most about 3 bp,
  less than one spread (5–10 bp).
- **Earnings-month or post-earnings drift on mega caps:** gone in US large caps since 2004–2006
  [unlevered-14][unlevered-15].
- **Halving-cycle timing:** 4 events, 1 trade per 4 years.

### Needs a platform change

- **`pre-earnings-winners`** (Aboody et al. [unlevered-16]). On the 8 shares at 1:1: if the share's 12-month return is
  above US100's, buy 5 trading days before the scheduled announcement and sell at the last close before it. Needs an
  earnings calendar. 4 trades a year per run. Prior: low to medium, as the paper predates the post-2004 decay.
- **`pre-ex-dividend-runup`** (Hartzmark & Solomon daily pattern, Ainsworth et al. [unlevered-10]). Buy 10 trading
  days before the ex-date and sell at the close before it, avoiding the ex-day. Needs ex-dates.
- **BTC/ETH 50/50 rebalancing, cap-weighted top-8 basket, cross-sectional momentum among the 8.** These need
  multi-instrument (portfolio) agents.
- **Funding-rate regime filter for crypto** (e.g. flat when 30-day average perp funding is in its top decile of
  history). Needs an external perpetual-funding feed [unlevered-33][unlevered-34].
- **BTC's weekend move as a signal for Monday's US100 open.** Needs read access to another instrument's bars.

### Platform changes worth considering (in order of value)

1. **Verify the 1:1 funding rule, then fix `FUNDING_FREE_UNLEVERAGED` in `apps/backend/src/engine/leverage.ts`.**
   - Read Arena 01's transaction history (Capital.com `GET /history/transactions`, SWAP type) for the US100, US500,
     GOLD and EURUSD buy-hold deals open since 2026-10-07. Or ask Capital.com support.
   - If those positions show no charges, exempt everything except NATURALGAS at 1:1. Then recheck the shorts.
   - This changes buy-hold, turn-of-month, overnight-drift and tsmom at 1:1 by up to about 8% a year.
2. **Dividend adjustments in the engine.**
   - A `dividends` table (epic, exDate, amount): shares from company investor-relations pages, US100/US500/US30 points
     from Capital.com's weekly "Projected Dividends" article (posted 21:00 UK) [unlevered-04].
   - Apply at the ex-date: long += size × D × (1 − w), short −= size × D.
   - Calibrate w on the demo itself: AAPL (ex-date about 10 Nov 2026) and MSFT (about 19 Nov 2026) are held by
     buy-hold on Arena 01.
3. **An event calendar in `ctx`.** Next ex-dividend date and amount, next earnings date and time (before or after market),
   and Nasdaq-100 rebalance dates. Each event should appear only once it was publicly announced, to avoid lookahead.
4. **Lifecycle for low-frequency agents.** Allow judging pooled across an agent's runs (instruments), or by paired daily
   returns against a control run. Strategies that trade 4–10 times a year otherwise can never be judged.
5. **`ctx.resize({ exposure })` or a partial close.** Currently resizing means closing and reopening, which pays the
   spread on the whole position. This matters for rebalancing and volatility sizing.
6. **Portfolio agents.** Several instruments in one run: baskets, pairs, BTC/ETH rebalancing.
7. **Slow external data.** Perpetual funding rates from public exchange APIs, for regime filters.

## Open questions

- Does the wider 1:1 exemption apply to our login and to indices, gold and FX, and to shorts? The demo transaction
  history settles it.
- What withholding does Capital.com apply to dividend credits on US-share CFD longs (0%, 15% with W-8BEN, or 30%)? Are
  index dividend credits for longs reduced?
- Is the +1.2 to +3.5 bp drift across the 17:00–18:00 New York break a pricing convention, with carry rolled into the
  cash CFD price? If so, does the engine's funding double-count it? Compare Capital.com cash index prices with the CME
  futures basis around the break.
- Do Capital.com crypto spreads change at 21:00–23:00 UTC on live (not demo) prices? Is the hour effect tied to the US
  close or to the rollover?
- The 2026 dividends of NVDA and META, and whether NVDA really raised to $0.25 a quarter.
- PEAD and the earnings premium in the 2020s: the 2025 papers disputing Martineau (Subrahmanyam's design-choice
  argument) deserve a read.
- Rebalancing premium out of sample: 2024–26 had a strong BTC trend and a choppy ETH. Run the own-check over BTC
  2018–2023 from a free daily source.
- Reddit (r/algotrading, r/BitcoinMarkets, r/Bogleheads, r/CFD) was unreachable from scripts (HTTP 403/429). A second
  pass through a browser could add practitioner threads on dividend capture, Capital.com 1:1 accounts and crypto
  weekend effects.

## Sources

| id | title | authors / site | year | kind | link | local copy |
|---|---|---|---|---|---|---|
| unlevered-01 | Fees and charges (overnight funding, 1:1 exemption, instrument table) | Capital.com | 2026 | doc | https://capital.com/en-int/ways-to-trade/fees-and-charges | files/unlevered/capital-fees-and-charges.md |
| unlevered-02 | Capital.com introduces 0% overnight funding to support investment-style trading; overnight fee adjustment page | Capital.com | 2024 | doc | https://capital.com/en-gb/press/capital-com-introduces-0-overnight-funding-to-support-investment-style-trading | files/unlevered/capital-zero-overnight-funding-2024.md |
| unlevered-03 | Help Centre: Dividends (calculation, timing, markets, adjustments) | Capital.com | 2026 | doc | https://help.capital.com/hc/en-us/sections/360004645800-Dividends | files/unlevered/capital-help-dividends.md |
| unlevered-04 | Projected Dividends for 12–18.10.2026 (index dividend points) | Capital.com | 2026 | doc | https://help.capital.com/hc/en-us/articles/14647990762130 | files/unlevered/capital-projected-index-dividends-2026-10-12.png |
| unlevered-05 | Overnight funding calculation; how dividend payments affect CFD positions | IG | 2026 | doc | https://www.ig.com/uk/help-and-support/spread-betting-and-cfds/fees-and-charges/why-is-overnight-funding-charged-and-how-is-it-calculated- | files/unlevered/ig-overnight-funding-and-dividends.md |
| unlevered-06 | CFD overnight fees | eToro | 2026 | doc | https://www.etoro.com/trading/fees/cfd-overnight-fees | files/unlevered/etoro-cfd-overnight-fees.md |
| unlevered-07 | FAQ: dividends, corporate events, overnight funding | Plus500 | 2026 | doc | https://www.plus500.com/en/tradingacademy/faq/financialinstruments | files/unlevered/plus500-dividends-and-funding.md |
| unlevered-08 | Marginal stockholder tax rates and the clientele effect (REStat 52(1)) | Elton & Gruber | 1970 | paper | https://ideas.repec.org/a/tpr/restat/v52y1970i1p68-74.html | — |
| unlevered-09 | Marginal stockholder tax effects and ex-dividend-day price behavior: taxable vs non-taxable closed-end funds | Elton, Gruber & Blake | 2002 | paper | https://pages.stern.nyu.edu/~eelton/working_papers/tax_effects.pdf | files/unlevered/elton-2002-marginal-stockholder-tax-ex-dividend.pdf |
| unlevered-10 | Taxes, order imbalance and abnormal returns around the ex-dividend day (IRF 18(3)) | Ainsworth, Fong, Gallagher & Partington | 2018 | paper | https://research.bond.edu.au/en/publications/taxes-order-imbalance-and-abnormal-returns-around-the-ex-dividend/ | — |
| unlevered-11 | The dividend month premium (JFE 109(3)) | Hartzmark & Solomon | 2013 | paper | https://doi.org/10.1016/j.jfineco.2013.02.015 | files/unlevered/cxo-dividend-month-premium.md |
| unlevered-12 | The earnings announcement premium and trading volume (NBER w13090) | Frazzini & Lamont | 2007 | paper | https://www.nber.org/papers/w13090 | files/unlevered/frazzini-2007-earnings-announcement-premium.pdf |
| unlevered-13 | The earnings announcement premium around the globe (JFE) | Barber, De George, Lehavy & Trueman | 2013 | paper | https://doi.org/10.1016/j.jfineco.2012.10.006 | — |
| unlevered-14 | The disappearing earnings announcement premium | Heitz, Narayanamoorthy & Zekhnini | 2020 | paper | https://www.iimb.ac.in/ARC2020/Papers/The_Disappearing_Earnings_Announcement_Premium.pdf | files/unlevered/heitz-2020-disappearing-earnings-announcement-premium.pdf |
| unlevered-15 | Rest in peace post-earnings announcement drift (Critical Finance Review 11) | Martineau | 2022 | paper | https://cfr.ivo-welch.info/published/papers/martineau2021rest.pdf | files/unlevered/martineau-2022-rest-in-peace-pead.pdf |
| unlevered-16 | Limited attention and the earnings announcement returns of past stock market winners (RAST 15) | Aboody, Lehavy & Trueman | 2010 | paper | https://doi.org/10.1007/s11142-009-9104-9 | — |
| unlevered-17 | The disappearing index effect (NBER w30748; JF 2025) | Greenwood & Sammon | 2022 | paper | https://www.nber.org/papers/w30748 | files/unlevered/greenwood-2022-disappearing-index-effect.pdf |
| unlevered-18 | Nasdaq-100 special rebalance (July 2023) and NDX methodology | CNBC / Saxo / Ortex / Nasdaq | 2023 | blog | https://indexes.nasdaqomx.com/docs/Methodology_NDX.pdf | files/unlevered/news-nasdaq100-special-rebalance-2023.md |
| unlevered-19 | A tug of war: overnight versus intraday expected returns (JFE 134) | Lou, Polk & Skouras | 2019 | paper | https://personal.lse.ac.uk/polk/research/TugOfWar.pdf | files/unlevered/lou-2019-tug-of-war-overnight-intraday.pdf |
| unlevered-20 | Does overnight news explain overnight returns? (arXiv 2507.04481) | Glasserman, Krstovski, Laliberte & Mamaysky | 2025 | paper | https://arxiv.org/abs/2507.04481 | files/unlevered/glasserman-2025-overnight-news-overnight-returns.pdf |
| unlevered-21 | Market return around the clock: a puzzle (JFQA 58(3)) | Bondarenko & Muravyev | 2023 | paper | https://ideas.repec.org/a/cup/jfinqa/v58y2023i3p939-967_1.html | — |
| unlevered-22 | Strikingly suspicious overnight and intraday returns (arXiv 2010.01727) | Knuteson | 2020 | paper | https://arxiv.org/abs/2010.01727 | — |
| unlevered-23 | The role of shorting, firm size, and time on market anomalies (JFE) | Israel & Moskowitz | 2013 | paper | https://www.aqr.com/Insights/Research/Journal-Article/The-Role-of-Shorting-Firm-Size-and-Time-on-Market-Anomalies | — |
| unlevered-24 | Market concentration and the Magnificent Seven (Russell, Goldman via Quartz, Columbia Threadneedle, Schroders) | various | 2024 | blog | https://russellinvestments.com/uk/blog/market-concentration-magnificent-seven | files/unlevered/blog-market-concentration-mag7.md |
| unlevered-25 | Do stocks outperform Treasury bills? (JFE 129(3)) | Bessembinder | 2018 | paper | https://doi.org/10.1016/j.jfineco.2018.06.004 | — |
| unlevered-26 | Are there seasonal intraday or overnight anomalies in Bitcoin? / The seasonality of Bitcoin | Padyšák & Vojtko (Quantpedia) | 2022 | blog | https://quantpedia.com/are-there-seasonal-intraday-or-overnight-anomalies-in-bitcoin/ | files/unlevered/quantpedia-bitcoin-intraday-seasonality.md |
| unlevered-27 | Bitcoin time-of-day, day-of-week and month-of-year effects in returns and trading volume | Baur, Cahill, Godfrey & Liu | 2019 | paper | https://research-repository.uwa.edu.au/en/publications/bitcoin-time-of-day-day-of-week-and-month-of-year-effects-in-retu/ | files/unlevered/quantpedia-bitcoin-intraday-seasonality.md |
| unlevered-28 | Periodicity in cryptocurrency volatility and liquidity (arXiv 2109.12142) | Hansen, Kim & Kimbrough | 2021 | paper | https://arxiv.org/abs/2109.12142 | files/unlevered/hansen-2021-periodicity-crypto-volatility-liquidity.pdf |
| unlevered-29 | Risks and returns of cryptocurrency (NBER w24877; RFS 2021) | Liu & Tsyvinski | 2018 | paper | https://www.nber.org/papers/w24877 | files/unlevered/liu-2021-risks-and-returns-of-cryptocurrency.pdf |
| unlevered-30 | Estimating the impact of the Bitcoin halving on its price using synthetic control (arXiv 2511.05512) | Virtonen | 2025 | paper | https://arxiv.org/abs/2511.05512 | files/unlevered/virtonen-2025-bitcoin-halving-synthetic-control.pdf |
| unlevered-31 | Volatility harvesting: extracting return from randomness (arXiv 1508.05241) | Witte | 2015 | paper | https://arxiv.org/abs/1508.05241 | files/unlevered/witte-2015-volatility-harvesting.pdf |
| unlevered-32 | Shannon's Demon and how returns can be created out of thin air (HN thread) | Hacker News / Richmond Quant | 2022 | thread | https://news.ycombinator.com/item?id=32143953 | files/unlevered/hn-shannons-demon.md |
| unlevered-33 | Fundamentals of perpetual futures (arXiv 2212.06888) | He, Manela, Ross & von Wachter | 2022 | paper | https://arxiv.org/abs/2212.06888 | files/unlevered/he-2022-fundamentals-of-perpetual-futures.pdf |
| unlevered-34 | Perp funding rates as a bottom signal (K33 Research, via The Block) | K33 Research / The Block | 2024 | blog | https://www.theblock.co/post/315831/perp-signal-bitcoin-bottom-bullish-year-end-k33 | files/unlevered/blog-k33-funding-rates-signal.md |
| unlevered-35 | Volatility-managed portfolios (JF 72(4)) | Moreira & Muir | 2017 | paper | https://doi.org/10.1111/jofi.12513 | — |
| unlevered-36 | On the performance of volatility-managed portfolios (JFE 138(1)) | Cederburg, O'Doherty, Wang & Yan | 2020 | paper | https://www.lehigh.edu/~xuy219/research/COWY.pdf | — |
| unlevered-37 | Own check on the lab candles: hour of day, weekends, overnight vs intraday, rebalancing, rollover, basket tracking | this project | 2026 | doc | apps/backend/data/candles (lab) | files/unlevered/own-check-candle-stats.md |
