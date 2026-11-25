---
id: tsmom-12m
name: Time-Series Momentum (12M)
group: strategy
status: researched
verdict: Strong SOTA (portfolio)
verdictTone: 1
bestFit: 1:1 fee-free · multi-market
expectedEdge: SR 0.5–0.8 (portfolio)
tldr: One of the best-documented anomalies across 140+ years and 60+ markets, but weak on a single asset and heavily hurt by CFD overnight funding at leverage.
slugs: tsmom-12m
---

## Bottom line

Time-series momentum (trend following across asset classes) is one of the strongest, longest-surviving edges in quantitative finance—not because any single market has a huge Sharpe, but because combining slow trends across 20–60 uncorrelated markets produces steady returns and tends to win during major market crises.

On its own in a single market, expected Sharpe is modest (~0.2–0.4). On a leveraged CFD account paying overnight funding, financing costs can easily erase the entire edge.

## How it works here

On the first daily bar of each UTC month, `tsmom-12m.ts` looks back 365 calendar days:
- If the 12-month price return is positive, go **long**; if negative, go **short**.
- Position size targets **15% annualized volatility** using the past 63 daily bars' realized volatility, capped at **3× exposure**.
- Runs on 10 markets (`US500`, `US100`, `GOLD`, `SILVER`, `OIL_CRUDE`, `EURUSD`, `GBPUSD`, `AUDUSD`, `BTCUSD`, `ETHUSD`) on the **1:5** tier.

## What the SOTA says

- **Foundational evidence (Moskowitz, Ooi & Pedersen 2012):** Across 58 liquid futures (equities, bonds, FX, commodities) from 1985–2009, 12-month excess return predicted next-month returns in every asset class with strong positive t-stats and crisis outperformance.
- **Century-long confirmation (Hurst, Ooi & Pedersen 2017):** Blending 1-, 3-, and 12-month trends across 67 markets back to 1880 delivered an annualized Sharpe around **0.77 net of fees**, performing best during deep equity drawdowns ("crisis alpha").
- **Why it may persist:** Investors underreact slowly to macro shifts (inflation, central bank cycles, commodity supply shocks), then chase trends late; commercial hedgers also pay a risk premium to trend followers who absorb directional risk.
- **Major academic critique (Huang et al. 2020):** Showed that in individual assets, much of raw TSMOM's historical profit came from assets' average upward drift (being long risky assets most of the time) rather than pure timing skill—especially without subtracting the risk-free rate or controlling for static beta.
- **2023–2025 update:** As CTA/managed-futures AUM grew, naive static 12-month signals saw alpha compression and sharper whipsaws during rapid rate-pivot regimes (2022–2023). Modern institutional systems blend multiple lookback speeds, smooth turnover, and dynamically scale volatility.

## Where it breaks

- **Choppy, sideways, V-shaped reversals:** A 12-month signal turns slowly. Rapid macro whipsaws cause repeated buy-high / sell-low drawdowns.
- **Overnight funding on CFDs:** Academic TSMOM runs on futures (where margin earns T-bills). Holding multi-month positions on a leveraged CFD account pays daily financing (~5–8%/yr on indices, much higher on crypto), directly attacking a ~0.3–0.5 single-market Sharpe.
- **Low single-asset signal-to-noise:** Judging one market's run in isolation takes 10–25+ years to statistically confirm. The edge lives in the **cross-asset family**, not a single instrument.

## Our implementation vs SOTA

Four concrete gaps between `apps/backend/agents/tsmom-12m.ts` and institutional SOTA:
1. **CFD funding mismatch:** Assigned to the **1:5** tier (`roster.json`), so every holding pays overnight funding. At **1:1** on Capital.com, all supported markets except natural gas have zero overnight funding (though 1:1 caps exposure at 1× instead of 3×).
2. **Raw return instead of excess return:** Checks `close / past - 1 > 0` instead of return above T-bills. In a 4–5% rate regime, an asset up +2% goes long despite trailing cash.
3. **Full close and reopen every month:** Calls `ctx.close()` and immediately re-enters even when direction stays the same, paying an unnecessary round-trip spread 12 times a year.
4. **Single fixed 12-month speed:** Institutional SOTA blends short, medium, and long trend horizons (e.g., 1M / 3M / 12M) to cut timing luck and whipsaw lag.

## Sources

- [Moskowitz, Ooi & Pedersen (2012) — Time Series Momentum (JFE / AQR)](https://www.aqr.com/Insights/Datasets/Time-Series-Momentum-Original-Paper-Data)
- [Hurst, Ooi & Pedersen (2017) — A Century of Evidence on Trend-Following Investing](https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing)
- [Huang, Li, Wang & Zhou (2020) — Time Series Momentum: Is It There? (JFE)](https://ink.library.smu.edu.sg/lkcsb_research/6163/)
- [Baltas & Kosowski (2020) — Demystifying Time-Series Momentum Strategies](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2140091)
