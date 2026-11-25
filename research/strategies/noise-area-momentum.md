---
id: noise-area-momentum
name: Noise-Area Momentum
group: strategy
status: researched
verdict: Strong SOTA (intraday)
verdictTone: 1
bestFit: Intraday · 1:2 to 1:5
expectedEdge: SR ~0.8–1.3 (pre-crowding)
tldr: Trades US indices only when intraday price breaks out of its normal 14-day time-of-day range, trailing stops at the band or VWAP and closing flat before 16:00 NY. Strong recent evidence and zero overnight funding.
slugs: noise-area-momentum
---

## Bottom line

Concretum's noise-area intraday momentum is one of the strongest modern intraday strategies in the published literature—and an unusually good structural fit for this platform because it closes flat every day at 16:00 New York, paying **zero overnight CFD funding**.

Its main risk is **post-publication crowding**: because it was published in 2024 and became popular across quant blogs and retail bots, its ~4 bp/trade edge could compress faster than slower multi-month edges.

## How it works here

On every 30-minute close from 10:00 to 15:30 New York, `noise-area-momentum.ts` measures the average absolute move from the 09:30 open at that exact time of day over the past 14 sessions (the "noise area" $\sigma$):
- **Upper band:** `max(open, prevClose) × (1 + σ)`; **Lower band:** `min(open, prevClose) × (1 − σ)`.
- Goes **long** when price breaks above both the upper band and session VWAP; **short** below both the lower band and session VWAP.
- **Trailing exit:** Closes on any 30m bar back inside the band or across VWAP, with a 2% crash stop, and closes flat at 16:00 NY.
- **`base` variant:** Fixed 1× exposure (1:2 tier). **`voltarget` variant:** Scales to 2% daily volatility up to 4× exposure (1:5 tier). Runs on `US500`, `US100`, `US30`.

## What the SOTA says

- **Zarattini, Aziz & Barbon (2024, Swiss Finance Institute 24-97):** Over 2007–2024 on SPY (including realistic commissions and slippage), the rule earned **+19.6%/yr** and a **Sharpe ratio of 1.33** (~4 bp per trade), beating buy-and-hold on risk-adjusted terms and staying positive in post-publication tracking.
- **Why it may persist:** When an index breaks out of its normal intraday noise zone, structural forced flows—leveraged ETF end-of-day rebalancing and option dealer (especially 0DTE) gamma hedging—tend to push price further in the same direction into the close.
- **Contrast with older intraday momentum (Gao et al. 2018):** Naive "trade the last 30 minutes based on the first 30 minutes" rules decayed below transaction costs (~0.3 bp vs ~1 bp spread). Filtering for *unusual* moves outside the noise band and holding for hours is what keeps the edge above spread.

## Where it breaks

- **Choppy reversal days:** False breakouts just outside the noise band get stopped out back at VWAP/band repeatedly, bleeding spread and slippage.
- **Crowding & execution speed:** Because everyone checks the exact same 30-minute boundaries (`:00` and `:30` NY), liquidity can thin right at the bar close, widening realized slippage.
- **Index correlation:** `US500`, `US100`, and `US30` frequently break out at the same 30m bar, concentrating risk on one macro move.

## Our implementation vs SOTA

1. **Structural win — zero overnight funding:** Because `intradayOnly: true` closes flat by 16:00 NY, even `voltarget` at 1:5 avoids overnight CFD financing completely.
2. **Tick-volume VWAP proxy:** `noise-area-momentum.ts` computes session VWAP from Capital.com's 30m tick counts rather than exchange share volume. Usually close on liquid US indices, but can drift slightly around heavy-volume spikes.
3. **2% crash stop added:** Adds safety against flash crashes without hurting normal 30m trailing stops.

## Sources

- [Zarattini, Aziz & Barbon (2024) — Beat the Market: An Effective Intraday Momentum Strategy for SPY (SFI 24-97)](https://alexandria.unisg.ch/server/api/core/bitstreams/a99aba00-f967-49b3-aceb-f544dc386e0b/content)
- [Concretum Group — Research Papers & Post-Publication Updates](https://concretumgroup.com/papers/)
