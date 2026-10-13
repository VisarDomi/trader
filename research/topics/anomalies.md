# Documented market anomalies for our instruments, and how much of the literature survives

_First pass 2026-10-13._

Scope: calendar, event and session effects, intraday momentum, commodity/FX effects and volatility regimes that
fit our CFDs (US indices, gold, silver, oil, gas, EUR/GBP/AUD vs USD, BTC/ETH, 8 mega-cap shares) on 1-minute to
1-day bars; then what post-publication decay, replication failures and multiple testing mean for the arena.
Alongside the literature I ran a small descriptive check on our own Capital.com candles (2024-01 → 2026-09,
no costs, not a backtest) and measured our real spreads: `files/anomalies/lab-descriptive-checks-2024-2026.md` [anomalies-48].

## In short

- **Most famous calendar effects are dead for large caps.** Pre-holiday (S&P 500 t = 0.93 for 1983–2019),
  day-of-week (Monday effect reversed after 1987) and the pre-FOMC drift (gone after 2015; nothing special in
  our 22 meetings 2024–2026) should not be built as standalone agents [anomalies-05, anomalies-07, anomalies-02, anomalies-48].
  Sell-in-May has held out of sample internationally, but it trades twice a year, so the arena can never judge it [anomalies-06].
- **Intraday momentum works when it is done the Concretum way, not the Gao way.** Zarattini, Aziz & Barbon
  enter only when price leaves a time-of-day "noise area", hold for hours with a VWAP/band trailing stop, and size
  for volatility. The result: about 4 bp per trade on SPY (2007–2024, Sharpe 1.33 net), and about +15% in the
  first 9 months after publication. Our rejected Gao rule earned about 0.3 bp per trade against about 1 bp of
  spread. The Concretum version clears our 0.4–0.8 bp index spreads [anomalies-22, anomalies-25, anomalies-26].
- **Flows are the most durable mechanism**: dealer gamma and leveraged-ETF hedging (end-of-day momentum),
  month-end cash needs, pension rebalancing and the London 4 pm FX fix. They are real and documented up to
  2020–2023, but most need data we lack (options gamma, bonds, a second instrument, an event calendar)
  [anomalies-09, anomalies-10, anomalies-12, anomalies-13, anomalies-14].
- **Overnight effects survive but are thin after our costs.** In our data, US500/US100 earned +4.4/+6.3 bp per
  weeknight against 2.2 bp of funding plus about 0.7 bp of spread. Gold earned +9.9 bp overnight and −0.9 bp
  intraday, which matches 1985–2012 COMEX evidence. The 2–3 a.m. E-mini "European open" drift has been about
  zero since 2021 [anomalies-15, anomalies-16, anomalies-17, anomalies-21, anomalies-48].
- **Our costs decide what survives.** Measured median spreads are 0.4–0.8 bp on indices, about 0.6 bp on
  EURUSD, 1.1 bp on gold, 4–8 bp on shares (9–15 bp at night), about 7 bp on BTC, 8 bp on ETH and 17 bp on
  natural gas. A few-bp edge is only viable on the indices, EURUSD and gold. Bitcoin's 21:00–23:00 UTC effect
  re-appeared out of sample (+6.6 bp a day, t = 3.1), but it equals the spread [anomalies-45, anomalies-48].
- **Expect about half.** Published predictability falls 26% out of sample and 58% after publication. With
  proper methods, 64–65% of 447–452 equity anomalies fail t ≥ 1.96 and 82–85% fail t ≥ 2.8–3 (McLean & Pontiff;
  Hou, Xue & Zhang). Harvey, Liu & Zhu argue for t > 3 [anomalies-39, anomalies-40, anomalies-41].
- **The arena's t ≥ 2 "leader" bar is too low as a claim of skill.** With about 480 runs, the expected best t
  among no-skill runs is about 3.0, and about 11 would pass t ≥ 2 if all were independent with zero mean. Keep
  t ≥ 2 for (demo-only) broker promotion, but call an edge "confirmed" only at a deflated threshold: t ≥ 3, or a
  Deflated Sharpe Ratio ≥ 0.95 that counts every agent × instrument ever tried. Also, a true annual Sharpe of 1
  needs about 4 years to reach an expected t of 2 [anomalies-41, anomalies-42, anomalies-43].

## Findings

### Pre-FOMC announcement drift — decayed after publication

- **What:** buy US equities in the 24 hours before scheduled FOMC announcements (14:00 → 14:00 ET).
- **Evidence:** S&P 500 +49 bp on average in that window, 1994–2011, t > 4.5. The window alone had an
  annualized Sharpe of about 1.14 and earned about 80% of the realized equity premium. It was 20 bp in
  1980–1993. Similar moves appeared in foreign indices. There was **no** such drift before other macro
  releases, and none in Treasuries or FX (Lucca & Moench, NY Fed SR 512 / JF 2015) [anomalies-01].
- **After publication:** Kurov, Wolfe & Gilbert extend the sample to December 2019. The drift "essentially
  disappeared after 2015", with or without a press conference; they suggest reduced uncertainty
  [anomalies-02]. Boguth, Grégoire & Martineau (JFQA 2019) tie the 2011–2017 drift to meetings with a press
  conference (secondary summaries) [anomalies-03].
- **Our data:** 22 meetings, 2024-01 → 2026-09. US500 14:00 → 14:00 averaged +6.0 bp (t 0.45), against +5.3 bp
  for every 24-hour window. Nothing special [anomalies-48].
- **Verdict:** dead as a standalone trade, and untestable anyway at 8 trades a year (see the statistics section).
  Confidence: high that the 49 bp is gone.

### Macro announcement days (CPI, PPI, NFP, FOMC) — unverified after 2009

- **What:** stocks earn more on days with scheduled inflation, employment and rate news.
- **Evidence:** 11.4 bp average excess return on announcement days against 1.1 bp on other days, 1958–2009.
  That is more than 60% of the equity premium, with a Sharpe ratio about 10 times higher; it held in 9 of 10
  five-year subsamples (Savor & Wilson, JFQA 2013) [anomalies-04]. Much of the high announcement-day Sharpe
  is the pre-FOMC drift, which has since faded.
- **Post-2009:** I found no clean update. Treat it as unknown.
- **For us:** to hold through an 08:30 ET release, a CFD must hold overnight: 2.2 bp of funding on indices, none
  on shares at 1:1. That leaves a cushion of about 7 bp if the premium survives. It needs an event calendar
  (CPI dates vary; NFP is usually, not always, the first Friday).

### Pre-holiday effect — gone for large caps

- **Evidence:** Ariel (1990): pre-holiday returns 9–14 times normal days, 1963–1982. Ko & Yang replicate it:
  CRSP value-weighted index 0.37% against 0.03% (t 7.03) in 1963–1982. In 1983–2019 the value-weighted
  pre-holiday return is 0.14% (difference t 1.92) and loses significance after controlling for weekend and
  turn-of-year effects; the S&P 500 t is 0.93 and the DJIA t 0.64. "The pre-holiday effect now exists only
  among small firms" [anomalies-05].
- **Verdict:** do not build. Confidence high.

### Halloween / Sell in May — survived out of sample, unusable for the arena

- **Evidence:** across 108 markets and 319 years, November–April returns beat May–October by 4.52% (t 9.69),
  and by 6.25% over the last 50 years. Out of sample (September 1998 – 2011) all 37 of Bouman & Jacobsen's
  countries had positive point estimates and 15 were significant. The average out-of-sample effect was 8.87%
  against 8.16% in-sample (Jacobsen & Zhang, SSRN 2012 / JIMF 2021) [anomalies-06].
- **Caveats:** summer returns are lower, not negative, in most samples, so "flat in summer" mostly gives up
  return. Results depend on avoiding 1987 and 2008 (HN discussion) [anomalies-47].
- **For us:** two trades a year can never be judged by a trade t-statistic, and the long half pays 8%/yr
  funding on indices. The only sensible form is a fee-free 1:1 share basket that skips May–October: a control,
  not a contender.

### Day-of-week — reversed or gone

- The Monday effect was strongly negative before 1987 and reversed (positive Mondays) in large-cap US indices
  afterwards. It weakened in most developed markets in the 1990s (Cho, Linton & Whang 2007; Mehdian & Perry 2001)
  [anomalies-07]. Concretum found intraday momentum works best on Wednesday–Friday, but that is a property of
  that strategy, not an index effect [anomalies-22].
- **Verdict:** do not build.

### Options expiration week, monthly OPEX, 0DTE and dealer gamma

- **OPEX week:** for 28 large stocks with active options, 1996–2008, the weekly return was 0.45% in the
  third-Friday week against 0.12% in other weeks. The week after averaged −0.03%, against 0.18% for other weeks.
  The proposed cause is market makers unwinding short-stock delta hedges (Stivers & Sun, JBF 2013)
  [anomalies-08]. **Our data:** US500 +32 bp in OPEX weeks (n 32, t 0.9), +47 bp the week after, +22 bp in
  other weeks. Nothing visible [anomalies-48].
- **Dealer gamma drives intraday momentum or reversal.** When hedgers are net short gamma (options dealers,
  leveraged-ETF sponsors), they must trade with the move. Across 60+ futures, 1974–2020, the return from the
  previous close to 15:30 predicts the last 30 minutes. The effect is strong in equity indices, bonds and
  commodities, weak in currencies (t 1.29), and reverses over the next days. It is stronger when gamma is
  negative (Baltussen, Da, Lammers & Martens, JFE 2021) [anomalies-09]. They report no costs; in S&P futures the
  result stays positive at a one-tick cost.
- **0DTE (since 2022)**: the evidence says 0DTEs *dampen* volatility, because dealers are net long gamma on
  those days. Index volatility is lower by about 60 annualized bp on 0DTE days; higher net gamma predicts
  lower volatility over the next 10 minutes and stronger reversal of E-mini order flow (Adams et al., SSRN
  5641974; Dim, Eraker & Vilkov 2024). Practitioner sources (SpotGamma etc.) claim the opposite on heavy-OI days
  [anomalies-11]. Concretum's intraday momentum still made +24%, +37% and +32% in 2022–2024, so 0DTE did not
  kill index trend days [anomalies-22].
- **For us:** we have no options data, so gamma cannot be computed. A proxy: dealers tend to be short gamma
  after declines and in high volatility. Concretum find their intraday momentum earns more after the market
  fell (a negative RSI coefficient) and when VIX is high [anomalies-22].

### Leveraged-ETF end-of-day rebalancing

- Leveraged/inverse ETFs must buy (sell) near the close an amount of about AUM × L(L−1) × the day's return.
  Barbon, Beckmeyer, Buraschi & Moerke find this produces end-of-day momentum. The LETF effect is economically
  larger than the option-gamma one, decreased over time, and reverts at the next open [anomalies-10].
- **For us:** this is the mechanism behind the Gao last-half-hour trade we rejected (spread larger than edge).
  The flow is proportional to the day's move, so if used at all, trade it only on large-move days (see the
  noise-area agent, which does that at its 15:30 checkpoint).

### Month-end and quarter-end flows (equities)

- **Dash for cash:** institutions sell from T−8 to T−4 (T = last trading day) to raise cash for month-start
  payments, and prices rebound from T−3 to T+3. In 2003–2013, T−3..T+3 earned a cumulative 103% excess return
  (73% of the market's excess return) while T−8..T−4 lost 31%; the two windows' returns correlate −0.54. Found
  in 20 of 23 countries; causality from settlement-rule changes and Friday month-ends (Etula, Rinne, Suominen &
  Vaittinen, RFS 2020) [anomalies-12]. The window was set by T+3 settlement; the US moved to T+2 in 2017 and
  **T+1 on 2024-05-28**, which should push the selling later. Our turn-of-month agent (enters at the close two
  weekdays before month end) already matches a T+1 world.
- **Pension rebalancing:** when stocks are overweight against bonds, funds sell stocks. A one-standard-deviation
  "calendar" signal predicts −17 bp of equity return the next day. The effect concentrates in the last four
  days of the month, is stronger near quarter-end, has been significant since the early 2000s, and reverts
  within two weeks. An S&P-vs-Treasury futures front-running portfolio had Sharpe > 1 over 1997–2023 (Harvey,
  Mazzoleni & Melone, WP 2025/2026) [anomalies-13].
- **For us:** the signal needs bond returns (we have none). A crude single-instrument proxy is the index's
  month-to-date return in the last 5 days: fade big up-months, buy big down-months. That is about 4–6 trades a
  year per instrument, so slow to judge.

### FX: the WM/Reuters 4 pm London fix and month-end USD flows

- International equity managers re-hedge currency exposure at the last 4 pm London fix of the month. A
  country's equity outperformance over the month predicts its currency **depreciates** in the hour before that
  fix: 14 bp for a 10% relative equity move, partly reverting the next day (Melvin & Prins, J. Financial
  Markets 2015) [anomalies-14].
- **For us:** EURUSD spread is about 0.6 bp, so a 3–5 bp expected move is tradable in principle. But a EURUSD
  run cannot read US500 (or European index) returns today: this **needs cross-instrument data**. It trades 12
  times a year.

### Overnight vs intraday ("A tug of war") and the overnight drift

- **Stocks:** 1993–2013, the CRSP value-weighted index earned 0.55%/month overnight (t 3.62) against
  0.38%/month intraday (t 1.87). Cross-sectionally, momentum profits accrue entirely overnight (0.98%/month)
  while size, value and most other anomalies accrue intraday; the authors explain this with different investor
  clienteles (Lou, Polk & Skouras, JFE 2019) [anomalies-15].
- **Futures:** the overnight drift concentrates in **02:00–03:00 ET** (European open). It earned about 3.7%/yr
  over 1998–2020 and is strongest after sell-offs, which points to dealers' inventory risk (Boyarchenko, Larsen
  & Whelan, RFS 2023) [anomalies-16]. **Since 2021 it has averaged about zero**, because closing
  order-imbalance dispersion fell from 6.5% to 2.9% (NY Fed, July 2026) [anomalies-17]. Our data: 02:00–03:00 ET
  on US500 +0.66 bp a day (t 1.4), no larger after down days. With about 0.8 bp of night spread, it is not tradable.
- **Our data (close-to-open, weeknights):** US500 +4.4 bp (t 1.9), US100 +6.3 bp (t 1.9), US30 +2.0 bp, against
  intraday +1.4/+0.9/+1.5 bp. Funding costs 2.2 bp a night and the spread about 0.7 bp, so the existing
  `overnight-drift` agent nets roughly +1.5 bp (US500) to +3 bp (US100) a night: positive but thin, and
  2024–2026 was a strong bull market. Shares at 1:1 pay no funding but cross a 4–8 bp spread; only NVDA (+30 bp)
  and AVGO (+27 bp) cleared it, which is hindsight [anomalies-48].
- **Caution:** daily OHLC "open" prices exaggerate overnight returns. GDX looked like +30%/yr overnight with
  daily opens but +8.6%/yr when sold at 09:31 using minute data [anomalies-20]. Our minute candles avoid this.
  Dividends also fall overnight (HN discussion) [anomalies-46].

### Sessions in FX and gold, and the London gold fix

- **FX local-hours depreciation:** 1997–2007, currencies tended to depreciate during their own trading hours.
  EURUSD fell in the European session (−8.4% annualized) and rose in the US session (+10.0%). A simple
  short-in-Europe / long-in-New-York EURUSD strategy was profitable after EBS bid-ask costs (Sharpe 1.3 and 0.9).
  Other pairs were not profitable after costs. The authors explain it as order flow: local participants are net
  buyers of foreign currency in their own hours (Breedon & Ranaldo, SNB WP 2011 / JMCB 2013) [anomalies-18].
- **Our data:** EURUSD 02:00–08:00 NY −0.65 bp (t −0.8), 08:00–16:00 NY +0.19 bp (t 0.2): the right signs, but
  about a fifth of the historical 3–4 bp a day. GBPUSD and AUDUSD show nothing. The effect looks largely
  arbitraged away [anomalies-48].
- **Gold overnight:** COMEX front gold, 1985–2012: overnight returns significantly higher than day returns
  (Blose & Gondhalekar 2014) [anomalies-21]. GLD's return is also mostly overnight [anomalies-20]. **Our data:**
  GOLD 16:00 → 09:30 +9.9 bp (t 2.2) against −0.9 bp intraday; Asian session 18:15 → 03:00 NY +5.5 bp (t 2.0)
  against +0.75 bp for 03:00 → 16:00. Gold doubled over the sample, and almost all of it accrued outside New York
  hours. Gold long funding is 1.6 bp a night and the spread 1.1 bp [anomalies-48].
- **London PM gold fix (until 2015):** volume and volatility jumped as the fix began. Informed traders earned
  about 10 bp in the 4 minutes after the start, and early trades predicted the fix direction up to 90% of the
  time (2007–2012) (Caminschi & Heaney, JFM 2014) [anomalies-19]. After the 2014 fines, the fix was replaced
  in March 2015 by the electronic LBMA Gold Price auction (10:30 and 15:00 London). Treat the leak as gone.

### Intraday momentum done better: Concretum (Zarattini, Aziz & Barbon 2024)

- **The rule:**
  - **Noise area.** For each time of day, the band around the 09:30 open is the average absolute move from the
    open to that time over the last 14 days. Upper bound = max(open, previous close) × (1 + σ); lower bound =
    min(open, previous close) × (1 − σ). This adjusts for the overnight gap.
  - **Entry.** Checked only at HH:00 and HH:30, first at 10:00: long above the band, short below.
  - **Exit.** A trailing stop at the current band or VWAP, whichever is tighter (max for longs). Reverse on
    the opposite band; flat at the 16:00 close.
  - **Sizing.** Target 2% daily volatility using 14-day realized volatility, capped at 4×.
- **Evidence:** SPY, May 2007 – April 2024, 1-minute IQFeed data, costs of $0.0035 commission plus $0.001
  slippage per share.
  - Opposite-band stop: Sharpe 0.61.
  - Band+VWAP stop: Sharpe 1.24.
  - With volatility sizing: 19.6%/yr, volatility 14.3%, Sharpe 1.33, max drawdown 25%, beta −0.07.
  - 7,668 trades (1.8 a day), 37% winners, about $0.09/share per trade (about 4 bp of the $247 average price;
    about $0.18 in the last 7 years).
  - Unconditional 12 bp a day, t 5.34. Positive in all 10 worst S&P quarters.
  - Robust to the lookback (5–90 days: Sharpe 1.23–1.50). With the Kissell I-Star impact model, Sharpe 1.17.
  - Losing years 2016 (−12.8%) and 2017 (−6.9%).
  - On 33 futures, 2007–2024: average Sharpe 0.60 (Nasdaq futures 1.23); only 2 were negative.
  - **After publication:** May 2024 – January 2025 about +15% (+32% for 2024) [anomalies-22, anomalies-25].
- **Why it differs from Gao et al. (2018), the rule we rejected:**
  - Gao used SPY 1993–2013: the first half-hour return (or overnight + first half-hour) predicts the last
    half-hour, with one 30-minute trade a day, every day [anomalies-26].
  - Rosa (2022) finds that predictability disappears in the out-of-sample period (after 2013, per Zarattini
    et al.'s summary); a version that trades only on strong signals beats an always-on one [anomalies-27].
  - Our backtest of Gao's rule (journal, 2026-10-12): about +2% gross over 33 months against about 7% of spread
    on US500: about 0.3 bp a trade against about 1 bp of spread.
  - Concretum differs in five ways:
    1. it trades only on days that leave a volatility-scaled, time-of-day band (a threshold);
    2. it enters as early as 10:00 and holds for hours, so the edge per trade (about 4 bp) is about ten times the
       spread on our indices;
    3. a trailing stop cuts reversals (skew went from −1.24 to +1.29);
    4. it trades both directions with reversals;
    5. it sizes for volatility, adding leverage in calm markets.
  - The last 30 minutes are part of its holding period, so it also harvests the gamma/LETF close flow.
- **Caveats:** this is the authors' own backtest, and Concretum sells research and services. The VIX and
  daily-pattern analyses are in-sample. Our CFDs need a tick-volume VWAP. Trades are decided on 30-minute closes,
  while our stops act every minute.

### Opening-range breakout on "stocks in play" (Zarattini, Barbon & Aziz 2024)

- **The rule:** a 5-minute ORB in the direction of the first 5-minute candle; stop at 10% of the 14-day ATR;
  exit at the close; risk 1% per trade, leverage capped at 4×. Trade only stocks whose first-5-minute volume is
  at least 100% of its 14-day average, and only the top 20 by that relative volume.
- **Evidence:**
  - About 7,000 US stocks, 2016–2023, $0.0035/share commission.
  - All stocks: Sharpe 0.48, 29% total.
  - Top-20 stocks in play: more than 1,600% total, Sharpe 2.81, alpha 36%/yr.
  - Profit per trade rises with relative volume: −0.02R below 100%, +0.08R above it, +0.38R above 3,000%
    [anomalies-23].
- **Replication:** QuantConnect, 2016 with a 1,000-stock universe: Sharpe 2.4. Commenters say other years look
  worse, it collapsed in the dot-com era, mega-caps "crashed in 2008", and costs eat the edge in small accounts
  [anomalies-24].
- **For us:** the edge comes from a cross-sectional pick among thousands of stocks; we have 8 mega-caps. Their
  median cash-session range is 2.2–3.4% (last 120 days), so a 10%-ATR stop is only about 22–35 bp. Our
  4–6 bp cash-hours share spread then costs 0.15–0.25R a trade, more than the 0.08R average edge at relative
  volume ≥ 1. Only extreme "in play" days (0.38R at ≥ 30× relative volume) clear it. Low confidence.

### Commodities and FX: carry, time-series momentum, seasonality, inventory reports

- **Time-series momentum:**
  - Moskowitz, Ooi & Pedersen (JFE 2012): the past 12-month return predicts the next month in all 58 futures,
    1985–2009 (the 1–12-month lookback is positive; it reverses partly after a year) [anomalies-28].
  - Hurst, Ooi & Pedersen: positive in every decade since 1880; net-of-fee Sharpe 0.77 over 1880–2013, but only
    0.62 over 2000–2013, with a weak 2010s [anomalies-29].
  - Sceptic: Huang, Li, Wang & Zhou (JFE 2020): asset-by-asset regressions show little predictability, the pooled
    t-statistic fails bootstrap critical values, and a rule using the historical mean does as well [anomalies-30].
  - For us: the textbook version (12-month lookback, monthly rebalance, volatility scaling) differs from our
    `tsmom` (5/20 days on 4h). CFD funding hurts the long side (indices 8%/yr, gold 5.9%, crypto 22%), while
    short gold/silver earns about +2.9%/yr and short crypto +5%/yr.
- **Carry:**
  - Carry predicts returns in every asset class. Average Sharpe about 0.75 per asset class, 1.1 diversified;
    crash-prone (Koijen, Moskowitz, Pedersen & Vrugt, JFE 2018) [anomalies-31].
  - **On Capital.com, carry is not harvestable as income.** Every FX side pays funding (EURUSD long −3.0%/yr,
    short about 0; GBPUSD −1.7/−1.3%; AUDUSD −0.9/−2.1%), so only the spot-drift part of carry remains.
    Short EURUSD is the only near-free FX position. This answers the "funding-aware FX carry check" in the
    journal's candidate list: no FX side earns funding.
- **Seasonality:** same-calendar-month returns predict across commodities (0.93%/month long-short, t 1.93,
  cross-sectional) and countries; it does not work in currencies (Keloharju, Linnainmaa & Nyberg, JF 2016)
  [anomalies-32]. That is weak and cross-sectional, so not usable on a single CFD without a hard-coded table.
- **EIA oil (Wednesday 10:30 ET) and natural gas storage (Thursday 10:30 ET):**
  - Prices react to the surprise (actual minus survey) within 5–7 minutes and do **not** drift afterwards
    (no relation over the next two days). Volatility spikes with the size of the surprise. Since 24-hour
    electronic trading began in 2006 the oil response is smaller and the gas response larger (Linn et al., EIA
    2017, 2003–2017) [anomalies-33].
  - Without the consensus forecast there is no direction to trade; the timing is useful only as a
    volatility filter or blackout.
- **Gold/silver ratio:** I found no peer-reviewed out-of-sample test. Practitioner material cites a long-run
  mean around 60 and rules like "buy silver above 80, gold below 40"; the ratio hit 123 in 2020. It needs two
  instruments (a pair), which the SDK cannot do. Unproven.

### Volatility regimes

- **VIX term structure:**
  - 2010–2017: when VIX futures are in backwardation, subsequent S&P 500 returns are higher (a contrarian
    signal). The coefficient grows from daily to quarterly horizons and is significant at 3 of 4. Contango
    (the normal state) carries no signal (Fassas & Hourvouliades, JRFM 2019) [anomalies-34].
  - We have no VIX feed. A proxy is short-term realized volatility well above long-term realized volatility.
- **Volatility of volatility:** VVIX risk is priced in index and VIX **options** (negative delta-hedged returns);
  there is little direct evidence it times the index (Huang, Schlag, Shaliastovich & Thimme, JFQA 2019)
  [anomalies-38]. Little use without options.
- **"Low volatility predicts high returns" at index level:**
  - Expected returns do not rise in proportion to volatility, so scaling exposure by 1/variance raised the
    market's Sharpe ratio about 25%, with 4.9% alpha (Moreira & Muir, JF 2017) [anomalies-35]. Our `vol-target`
    agent is this.
  - Out of sample, 72 of 103 volatility-managed strategies underperformed their unmanaged versions, because the
    in-sample combination weights are unstable (Cederburg, O'Doherty, Wang & Yan, JFE 2020) [anomalies-36].
  - Separately, a high variance risk premium (implied minus realized variance) predicts higher index returns at
    a quarterly horizon, 1990–2005 (Bollerslev, Tauchen & Zhou, RFS 2009) [anomalies-37].
  - Net: high *realized* volatility means lower risk-adjusted returns ahead, while a high *implied-over-realized*
    gap means higher returns ahead. Neither is strong out of sample.
- **Leverage effect:** falling prices raise volatility (Black 1976; standard). This is why down-trends come with
  volatility spikes, and why both dealer short-gamma momentum and Concretum's "better after declines" result
  cluster in sell-offs.

### The sobering part: decay, replication and multiple testing

- **Post-publication decay:** across 97 cross-sectional predictors, returns are 26% lower out of sample (the
  upper bound of data mining) and 58% lower after publication. The 32-point gap is attributed to investors
  trading on the papers. Decay is larger for anomalies that are cheap to arbitrage (McLean & Pontiff, JF 2016)
  [anomalies-39]. Calendar effects fit this pattern: pre-holiday, Monday, pre-FOMC, FX sessions, the overnight
  02–03 ET drift.
- **Replication:**
  - Hou, Xue & Zhang (NBER WP version): of 447 anomalies, with microcaps controlled, 286 (64%) are
    insignificant at 5%; 380 (85%) fail t ≥ 3. The published RFS 2020 version reports 65% of 452 failing
    t ≥ 1.96 and 82% failing t ≥ 2.78 [anomalies-40].
  - Counterpoint: Jensen, Kelly & Pedersen (JF 2023): most factors replicate, cluster into 13 themes and work
    out of sample in 93 countries, once you use a Bayesian view and accept smaller effects [anomalies-44]. Both
    concern cross-sectional stock factors, not our single-instrument timing rules, which have even fewer
    independent observations.
- **Multiple testing:** with hundreds of factors tried, a new one needs t > 3.0 (Harvey, Liu & Zhu, RFS 2016;
  Bonferroni/Holm thresholds 3.5+) [anomalies-41].
- **Deflated Sharpe Ratio (Bailey & López de Prado 2014):** after N independent trials, the expected maximum
  Sharpe of pure noise is about √V × [(1−γ)Φ⁻¹(1−1/N) + γΦ⁻¹(1−1/(Ne))], with γ ≈ 0.5772. The DSR is the
  probability that the observed Sharpe beats that benchmark, adjusted for skew and kurtosis [anomalies-42].
  **Probability of Backtest Overfitting** (CSCV) estimates how often the in-sample winner ranks below the
  median out of sample [anomalies-43].
- **What this means for our arena** (computed with the DSR formula, t-statistics ~ N(0,1) under no skill):

  | Runs judged together (independent) | Expected best t from noise | Bonferroni 5% one-sided | Expected count with t ≥ 2 |
  |---|---|---|---|
  | 50 | 2.28 | 3.09 | 1.1 |
  | 100 | 2.53 | 3.29 | 2.3 |
  | 200 | 2.77 | 3.48 | 4.6 |
  | 480 | 3.04 | 3.71 | 10.9 |

  - **Effective N is smaller than 480.** US100/US500/US30 runs of the same agent are highly correlated, and the
    t-statistic does not change with leverage. Our zero-edge runs also drift negative because of the spread,
    and the "above every monkey" rule removes some lucky runs. So the real false-leader count is lower than
    the table's, but not zero.
  - **Recommendation:** keep t ≥ 2 + monkeys for *promotion to the broker* (cheap, demo money). Add a
    "confirmed" label at **t ≥ 3.0** (≈ the expected noise maximum for our N, and the Harvey-Liu-Zhu bar), or
    DSR ≥ 0.95 with N counted cumulatively over every agent × instrument ever run, retired ones included.
    Optionally control the false-discovery rate with Benjamini–Hochberg at 10% over all judged runs.
  - **Power is the binding constraint.** The expected t is about Sharpe × √years: annual Sharpe 1.0 needs
    4 years for t = 2 and 9 years for t = 3; Sharpe 2 needs 1 and 2.2 years. After the first 28 days almost
    every t is noise. Only high-frequency, high-Sharpe agents (intraday, 300+ trades a year) can reach a
    deflated bar within a year.
  - **Minimum backtest length** (Bailey, Borwein, López de Prado & Zhu 2014): MinBTL < 2 ln N ÷ E[max SR]²
    years. With 5 years of data, at most 45 independent configurations may be tried before an in-sample Sharpe
    of 1 is expected from noise alone; with 2 years, only 7 [anomalies-49]. Our lab data covers about 2.75
    years, so roughly 10 configurations. This is why agents must not be tuned on the backtest.
  - **Calendar agents with 8–12 trades a year** (FOMC, OPEX, month-end FX fix, Halloween) can never pass any
    of this one run at a time. Either pool them (one t over all instruments and events) or do not run them.

## For the arena

Costs used below are our measured median spreads (cash hours, last 6 months) and the funding rates in
`apps/backend/src/engine/instruments.ts`. Parameters are textbook values from the papers, fixed up front.

### Feasible now (SDK as is)

1. **`noise-area-momentum`** (Concretum intraday momentum). **Best candidate.**
   - Instruments: US500, US100, US30.
   - Bars: 5m primary (to track the move from the open and a tick-volume VWAP); act only on bars closing at
     HH:00/HH:30 from 10:00 to 15:30 NY; flat at the 16:00 bar close.
   - Params: `lookbackDays 14`, `bandMult 1.0`. State holds a rolling 14-day table of |close(t)/open(09:30) − 1|
     per half-hour checkpoint.
   - Bounds use max/min(open, previous 16:00 close).
   - Exit when a half-hour close crosses max(band, VWAP) for longs (min for shorts); reverse on the opposite
     band. Add a far hard stop (2%) only for gaps.
   - Variants (2): `base` exposure 1×; `voltarget` exposure = min(4, 0.02 / σ14d of daily returns) → tier 1:5.
     This is a real use of the leverage dimension.
   - Expected: about 1.8 trades a day; about 4 bp gross per trade (2007–2024 SPY) against about 0.5–0.8 bp
     spread; no funding (flat by 16:00).
   - Distinct from the rejected Gao rule for the five reasons in Findings.
   - Confidence: medium. It is the authors' backtest, but it survived 9 months after publication, and the
     mechanism (gamma/LETF/under-reaction) is documented independently.
2. **`gold-overnight`** (session effect on gold).
   - Long GOLD from the 16:00 NY close to 09:30 NY, Monday–Thursday nights.
   - Exposure 1, crash stop 3% (same skeleton as `overnight-drift`); tier 1:1–1:2.
   - Evidence: COMEX 1985–2012, GLD; our 2024–2026 data +9.9 bp/night against 1.6 bp funding + 1.1 bp spread.
   - Confidence: low to medium. Our data was a strong gold bull market, and the descriptive check saw the data first.
3. **`fx-session-eurusd`** (Breedon–Ranaldo): short EURUSD 02:00 → 08:00 NY and long 08:00 → 16:00 NY.
   Neither leg crosses 17:00, so there is no funding. Spread about 0.6 bp a leg. Historical 3–4 bp a day; ours
   about 0.8 bp a day. **Run only as a cheap decay test;** expect about zero.
4. **`orb-in-play-shares`** (Concretum ORB, adapted).
   - The 8 shares, 5m bars.
   - Trade only when the 09:30–09:35 tick volume is ≥ 3× its 14-day average for that bar.
   - Direction of the first candle; stop 10% of 14-day ATR (paper); exit 16:00; risk 1%, cap 4× → tier 1:5.
   - Few trades (earnings and news days).
   - Confidence: low. The edge is cross-sectional, and the spread is 0.15–0.25R per trade. Run it only if the
     filter keeps it to the most unusual days; otherwise skip it.
5. **`month-end-rebalance`** (Harvey–Mazzoleni–Melone proxy plus Etula).
   - US500/US100/US30, 30m bars.
   - At the close of the 5th-last weekday: if the month-to-date return exceeds +1 × (20-day daily σ × √days
     elapsed), go short until the close of the last day; if below −1 ×, go long. Flat otherwise.
   - About 4–6 trades a year per run, so it **needs pooled judging**. It conflicts with `turn-of-month` in the
     last two days; that is acceptable as a separate run.
6. **`tsmom-12m`** (Moskowitz–Ooi–Pedersen textbook).
   - All indices, GOLD, SILVER, OIL_CRUDE, EURUSD, GBPUSD, AUDUSD, BTCUSD, ETHUSD; 1d bars.
   - Sign of the 12-month return; rebalance on the first trading day of each month.
   - Exposure = 0.40 / σ (EWMA of daily squared returns, 60-day center of mass, annualized), capped at the
     tier → tier 1:10 for FX (σ about 7% → about 5.7×).
   - Monthly rebalancing means about 12 trades a year, so it **needs pooled judging**.
   - Different from the fast `tsmom` (5/20 days).
7. **Event blackouts as an SDK-level helper**, not an agent: no new mean-reversion entries in OIL_CRUDE
   10:15–11:00 NY on Wednesdays or NATURALGAS 10:15–11:00 NY on Thursdays (EIA reports). It is a filter that
   can be applied to new agents.

Not recommended:
- Standalone pre-holiday, day-of-week, OPEX week and pre-FOMC agents (decayed; our data shows nothing).
- Halloween (two trades a year).
- BTC 21–23 UTC: real out of sample, but the edge equals the 6.6 bp spread, and funding falls inside the
  window except at 1:1. If anything, use it to time entries of existing BTC long agents.
- An overnight-shares agent (spread 4–8 bp in, 9–15 bp at night).

### Needs a platform change

- **Event calendar in `ctx`** (FOMC, CPI, NFP, EIA, US holidays, monthly OPEX, earnings dates for the 8 shares).
  This enables Savor–Wilson announcement-day longs (CPI/NFP/FOMC; hold the night before on shares at 1:1, or on
  indices for 2.2 bp of funding), a holiday-aware turn-of-month, earnings-day ORB, and blackouts. Hard-coding a
  year of dates in an agent is possible but fragile.
- **Cross-instrument reads** (`ctx.market('US500').bars` from a EURUSD run): needed for the 4 pm fix trade
  (EURUSD on the last business day, 15:00 → 16:00 London: buy EURUSD when US equities beat European equities
  month-to-date, because the USD should weaken into the fix; sell when they lag), and for any gold/silver ratio rule. **Pairs/two-leg positions** for the ratio itself.
- **External series:** VIX and VIX3M (term-structure filter), and a 10-year Treasury proxy (the real
  rebalancing signal). Capital.com may list a bond CFD; check.
- **Built-in session VWAP** (tick-volume, anchored at 09:30 NY), plus a time-of-day rolling statistic helper,
  so noise-area-style agents are short and fast.
- **Pooled judging for slow agents:** one t-statistic per agent family across instruments (and events), or a
  separate 12-month "slow track"; otherwise calendar agents are untestable.
- **Deflated "confirmed" verdict** in `packages/shared/src/lifecycle.ts`: t ≥ 3 (or DSR ≥ 0.95 with a
  cumulative trial count), shown next to "leader". Record N (agent × instrument trials ever run) in the review.

## Open questions

- Does the Concretum noise-area strategy survive on **CFD tick volume** (VWAP proxy) and our 23-hour index
  quotes? Check the 2024–2026 backtest as information only, with the parameters above unchanged.
- Did the Savor–Wilson announcement-day premium (CPI/NFP) persist after 2009? Find a post-2015 update.
- The overnight index premium after funding: is +1.5–3 bp a night robust outside the 2024–2026 bull market?
  A Monday–Thursday vs Friday split (Friday pays triple funding), and the effect of the T+1 settlement change
  on the month-end window.
- Gold: is the overnight/Asian-session premium documented after 2012 (Shanghai Gold Exchange hours, central-bank
  buying)? A proper source for the post-2015 LBMA auction.
- 0DTE era: has index intraday momentum weakened since 2022 on positive-gamma days, and can the realized-volatility
  regime stand in for dealer gamma?
- Halloween and turn-of-month post-2012 updates (Jacobsen's later work); quarter-end vs month-end strength in the
  rebalancing signal.
- Reddit (r/algotrading, r/options, r/Forex) practitioner replications of the noise-area and ORB papers: Reddit
  blocked automated access in this pass (HTTP 403).
- Natural gas and oil calendar seasonality on Capital.com's rolling CFDs: how are rolls and contango priced
  into the CFD, and does the funding charge cover it?

## Sources

| id | title | authors / site | year | kind | link | local copy |
|---|---|---|---|---|---|---|
| anomalies-01 | The Pre-FOMC Announcement Drift | Lucca & Moench (NY Fed SR 512; JF 2015) | 2015 | paper | https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr512.pdf | files/anomalies/lucca-2015-pre-fomc-drift.pdf |
| anomalies-02 | The Disappearing Pre-FOMC Announcement Drift | Kurov, Wolfe & Gilbert (Finance Research Letters 40) | 2021 | paper | https://ideas.repec.org/a/eee/finlet/v40y2021ics1544612320315956.html | — |
| anomalies-03 | Shaping Expectations and Coordinating Attention: The Unintended Consequences of FOMC Press Conferences | Boguth, Grégoire & Martineau (JFQA 54(6)) | 2019 | paper | https://ideas.repec.org/a/cup/jfinqa/v54y2019i6p2327-2353_2.html | — |
| anomalies-04 | How Much Do Investors Care About Macroeconomic Risk? Evidence from Scheduled Economic Announcements | Savor & Wilson (JFQA 48(2)) | 2013 | paper | https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Draft20111128p_edited.pdf | files/anomalies/savor-2013-macro-announcement-days.pdf |
| anomalies-05 | The Pre-Holiday Premium of Ariel (1990) Has Largely Become a Small-Firm Effect Out of Sample | Ko & Yang (Critical Finance Review) | 2021 | paper | https://cfr.ivo-welch.info/published/papers/ko2021pre.pdf | files/anomalies/ko-2021-pre-holiday.pdf |
| anomalies-06 | The Halloween Indicator: Everywhere and All the Time | Jacobsen & Zhang (SSRN 2154873; JIMF 2021) | 2012 | paper | https://www.bnains.org/backtest/periode/The_Halloween_Indicator_everywhere_and_all_the_time_-_Ben_Jacobsen_%26_Cherry_Y._Zhang.pdf | files/anomalies/jacobsen-2012-halloween-everywhere.pdf |
| anomalies-07 | Are There Monday Effects in Stock Returns: A Stochastic Dominance Approach (with Mehdian & Perry 2001) | Cho, Linton & Whang (LSE FMG DP568; J. Empirical Finance) | 2007 | paper | https://www.fmg.ac.uk/sites/default/files/publications/DP568.pdf | — |
| anomalies-08 | Returns and option activity over the option-expiration week for S&P 100 stocks (CXO summary) | Stivers & Sun (JBF 37(11)); CXO Advisory | 2013 | paper | https://cxoadvisory.com/calendar-effects/option-expiration-week-stock-return-drill-down | files/anomalies/cxo-option-expiration-week.md |
| anomalies-09 | Hedging Demand and Market Intraday Momentum | Baltussen, Da, Lammers & Martens (JFE 142) | 2021 | paper | https://www3.nd.edu/~zda/intramom.pdf | files/anomalies/baltussen-2021-hedging-demand-intraday-momentum.pdf |
| anomalies-10 | The Role of Leveraged ETFs and Option Market Imbalances on End-of-Day Price Dynamics | Barbon, Beckmeyer, Buraschi & Moerke (SFI 22-40) | 2021 | paper | https://abarbon.com/papers/liquidity-provision-to-leveraged-etfs-and-equity-options-rebalancing-flows | files/anomalies/barbon-2021-letf-options-end-of-day.pdf |
| anomalies-11 | Do S&P500 Options Increase Market Volatility? Evidence from 0DTEs (Quantpedia summary) | Adams et al. (SSRN 5641974); Quantpedia | 2026 | blog | https://quantpedia.com/do-sp500-0dtes-options-increase-market-volatility/ | files/anomalies/quantpedia-0dte-volatility.md |
| anomalies-12 | Dash for Cash: Monthly Market Impact of Institutional Liquidity Needs | Etula, Rinne, Suominen & Vaittinen (RFS 33(1)) | 2020 | paper | https://acris.aalto.fi/ws/portalfiles/portal/40965155/hhz054.pdf | files/anomalies/etula-2020-dash-for-cash.pdf |
| anomalies-13 | The Unintended Consequences of Rebalancing | Harvey, Mazzoleni & Melone (Fisher WP 2025-03-001) | 2026 | paper | https://www.edhec.edu/sites/default/files/2026-03/Scientific%20paper.%20ssrn-5122748.pdf | files/anomalies/harvey-2026-unintended-consequences-rebalancing.pdf |
| anomalies-14 | Equity Hedging and Exchange Rates at the London 4 p.m. Fix | Melvin & Prins (J. Financial Markets 22) | 2015 | paper | https://ideas.repec.org/a/eee/finmar/v22y2015icp50-72.html | files/anomalies/melvin-2015-equity-hedging-4pm-fix.pdf |
| anomalies-15 | A Tug of War: Overnight versus Intraday Expected Returns | Lou, Polk & Skouras (JFE 134) | 2019 | paper | https://personal.lse.ac.uk/polk/research/TugOfWar.pdf | files/anomalies/lou-2019-tug-of-war.pdf |
| anomalies-16 | The Overnight Drift | Boyarchenko, Larsen & Whelan (NY Fed SR 917; RFS 2023) | 2023 | paper | https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr917.pdf | files/anomalies/boyarchenko-2023-overnight-drift.pdf |
| anomalies-17 | The Disappearing Overnight Drift | Boyarchenko, Larsen & Whelan (Liberty Street Economics) | 2026 | blog | https://libertystreeteconomics.newyorkfed.org/2026/07/the-disappearing-overnight-drift/ | files/anomalies/libertystreet-disappearing-overnight-drift.md |
| anomalies-18 | Intraday Patterns in FX Returns and Order Flow | Breedon & Ranaldo (SNB WP 2011-04; JMCB 2013) | 2013 | paper | https://www.snb.ch/en/publications/research/working-papers/2011/working_paper_2011_04 | files/anomalies/breedon-2013-intraday-fx-patterns.pdf |
| anomalies-19 | Fixing a Leaky Fixing: Short-Term Market Reactions to the London PM Gold Price Fixing | Caminschi & Heaney (J. Futures Markets 34) | 2014 | paper | https://api.research-repository.uwa.edu.au/ws/files/4725264/A0205_use_this.pdf | files/anomalies/caminschi-2014-leaky-gold-fixing.pdf |
| anomalies-20 | Dangers of Relying on OHLC Prices – the Case of Overnight Drift in GDX ETF | Quantpedia | 2024 | blog | https://quantpedia.com/dangers-of-relying-on-ohlc-prices-the-case-of-overnight-drift-in-gdx-etf/ | files/anomalies/quantpedia-ohlc-overnight-gdx.md |
| anomalies-21 | A Gold Price Anomaly | Blose & Gondhalekar (GVSU) | 2014 | paper | https://scholarworks.gvsu.edu/fsdg/975 | files/anomalies/quantpedia-ohlc-overnight-gdx.md (summary) |
| anomalies-22 | Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY) | Zarattini, Aziz & Barbon (SFI 24-97) | 2024 | paper | https://alexandria.unisg.ch/server/api/core/bitstreams/a99aba00-f967-49b3-aceb-f544dc386e0b/content | files/anomalies/zarattini-2024-beat-the-market-spy.pdf |
| anomalies-23 | A Profitable Day Trading Strategy for the U.S. Equity Market | Zarattini, Barbon & Aziz (SFI 24-98) | 2024 | paper | https://www.alexandria.unisg.ch/server/api/core/bitstreams/3c2989c4-688d-4d78-8a71-f02690990d51/content | files/anomalies/zarattini-2024-orb-stocks-in-play.pdf |
| anomalies-24 | Opening Range Breakout for Stocks in Play (replication and forum) | QuantConnect (Melchin et al.) | 2025 | thread | https://www.quantconnect.com/forum/discussion/18444/opening-range-breakout-for-stocks-in-play/ | files/anomalies/quantconnect-orb-stocks-in-play.md |
| anomalies-25 | Concretum papers list and post-publication record | Concretum Group | 2026 | doc | https://concretumgroup.com/papers/ | files/anomalies/concretum-papers-list.md |
| anomalies-26 | Market Intraday Momentum (WP: The First Half-Hour Return Predicts the Last Half-Hour Return) | Gao, Han, Li & Zhou (JFE 129) | 2018 | paper | https://c.mql5.com/forextsd/forum/173/intraday_momentum_-_the_first_half-hour_return_predicts_the_last_half-hour_return.pdf | files/anomalies/gao-2015-market-intraday-momentum.pdf |
| anomalies-27 | Understanding Intraday Momentum Strategies | Rosa (J. Futures Markets 42(12)) | 2022 | paper | https://ideas.repec.org/a/wly/jfutmk/v42y2022i12p2218-2234.html | — |
| anomalies-28 | Time Series Momentum | Moskowitz, Ooi & Pedersen (JFE 104) | 2012 | paper | http://docs.lhpedersen.com/TimeSeriesMomentum.pdf | files/anomalies/moskowitz-2012-time-series-momentum.pdf |
| anomalies-29 | A Century of Evidence on Trend-Following Investing | Hurst, Ooi & Pedersen (AQR; JPM 2017) | 2017 | paper | https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing | files/anomalies/hurst-2014-century-trend-following.pdf |
| anomalies-30 | Time Series Momentum: Is It There? | Huang, Li, Wang & Zhou (JFE 135) | 2020 | paper | https://alphaarchitect.com/2020/03/an-empirical-challenge-for-trend-following/ | — |
| anomalies-31 | Carry | Koijen, Moskowitz, Pedersen & Vrugt (JFE 127; NBER w19325) | 2018 | paper | https://www.nber.org/system/files/working_papers/w19325/w19325.pdf | files/anomalies/koijen-2018-carry.pdf |
| anomalies-32 | Common Factors in Return Seasonalities (Return Seasonalities, JF 2016) | Keloharju, Linnainmaa & Nyberg (NBER w20815) | 2016 | paper | https://www.nber.org/papers/w20815.pdf | files/anomalies/keloharju-2014-return-seasonalities.pdf |
| anomalies-33 | Information, Price Levels and Price Volatility of Petroleum Product Futures Prices (EIA presentation) | Linn, Ederington, Fernando & Guernsey (EIA) | 2017 | doc | https://www.eia.gov/finance/markets/reports_presentations/2017/linn.pdf | files/anomalies/linn-2017-eia-inventory-announcements.pdf |
| anomalies-34 | VIX Futures as a Market Timing Indicator | Fassas & Hourvouliades (JRFM 12(3)) | 2019 | paper | https://mdpi-res.com/d_attachment/jrfm/jrfm-12-00113/article_deploy/jrfm-12-00113-v2.pdf | files/anomalies/fassas-2019-vix-futures-market-timing.pdf |
| anomalies-35 | Volatility-Managed Portfolios | Moreira & Muir (JF 72(4); NBER w22208) | 2017 | paper | https://www.nber.org/papers/w22208.pdf | files/anomalies/moreira-2017-volatility-managed-portfolios.pdf |
| anomalies-36 | On the Performance of Volatility-Managed Portfolios | Cederburg, O'Doherty, Wang & Yan (JFE 138) | 2020 | paper | https://www.lehigh.edu/~xuy219/research/COWY.pdf | files/anomalies/cederburg-2020-volatility-managed-portfolios.pdf |
| anomalies-37 | Expected Stock Returns and Variance Risk Premia | Bollerslev, Tauchen & Zhou (RFS 22(11)) | 2009 | paper | https://repec.econ.au.dk/repec/creates/rp/08/rp08_48.pdf | files/anomalies/bollerslev-2009-variance-risk-premia.pdf |
| anomalies-38 | Volatility-of-Volatility Risk | Huang, Schlag, Shaliastovich & Thimme (JFQA 54(6)) | 2019 | paper | https://ideas.repec.org/a/cup/jfinqa/v54y2019i6p2423-2452_5.html | — |
| anomalies-39 | Does Academic Research Destroy Stock Return Predictability? | McLean & Pontiff (JF 71(1)) | 2016 | paper | https://www.gwern.net/doc/economics/2016-mclean.pdf | files/anomalies/mclean-2016-academic-research-destroy-predictability.pdf |
| anomalies-40 | Replicating Anomalies | Hou, Xue & Zhang (RFS 33(5); NBER w23394) | 2020 | paper | https://www.nber.org/system/files/working_papers/w23394/w23394.pdf | files/anomalies/hou-2020-replicating-anomalies.pdf |
| anomalies-41 | ... and the Cross-Section of Expected Returns | Harvey, Liu & Zhu (RFS 29(1)) | 2016 | paper | https://people.duke.edu/~charvey/Research/Published_Papers/P118_and_the_cross.PDF | files/anomalies/harvey-2016-cross-section.pdf |
| anomalies-42 | The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality | Bailey & López de Prado (JPM 40(5)) | 2014 | paper | https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf | files/anomalies/bailey-2014-deflated-sharpe-ratio.pdf |
| anomalies-43 | The Probability of Backtest Overfitting | Bailey, Borwein, López de Prado & Zhu (J. Computational Finance) | 2017 | paper | https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf | files/anomalies/bailey-2017-probability-backtest-overfitting.pdf |
| anomalies-44 | Is There a Replication Crisis in Finance? | Jensen, Kelly & Pedersen (JF 78(5); NBER w28432) | 2023 | paper | https://www.nber.org/system/files/working_papers/w28432/w28432.pdf | files/anomalies/jensen-2023-replication-crisis.pdf |
| anomalies-45 | The Seasonality of Bitcoin / Are There Seasonal Intraday or Overnight Anomalies in Bitcoin? | Quantpedia | 2023 | blog | https://quantpedia.com/the-seasonality-of-bitcoin/ | files/anomalies/quantpedia-bitcoin-seasonality.md |
| anomalies-46 | All positive returns to major market indices over 3 decades occurred overnight (HN thread) | Hacker News | 2020 | thread | https://news.ycombinator.com/item?id=24899577 | files/anomalies/hn-overnight-returns.md |
| anomalies-47 | Sell in May, and go away? (HN thread) | Hacker News | 2015 | thread | https://news.ycombinator.com/item?id=9350841 | files/anomalies/hn-sell-in-may.md |
| anomalies-48 | Lab descriptive checks of documented anomalies, 2024-01 → 2026-09 (spreads, window returns) | this project (Claude) | 2026 | doc | apps/backend/data/candles (lab PC) | files/anomalies/lab-descriptive-checks-2024-2026.md |
| anomalies-49 | Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on Out-of-Sample Performance | Bailey, Borwein, López de Prado & Zhu (Notices of the AMS 61(5)) | 2014 | paper | https://carmamaths.org/jon/backtest.pdf | files/anomalies/bailey-2014-pseudo-mathematics-charlatanism.pdf |
