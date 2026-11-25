---
id: lrs-sma200
name: Leverage Rotation (200-day)
group: strategy
status: researched
verdict: Conditional SOTA
verdictTone: 0
bestFit: 1:1 (x1) or 2× (low borrow)
expectedEdge: Similar SR to index; higher growth at 2×
tldr: Holding leveraged US indices only above the 200-day SMA avoids the worst crash regimes, but realistic borrowing costs erase extra Sharpe—leaving higher growth at 2× for similar drawdown, while 3× stays dangerous.
slugs: lrs-sma200
---

## Bottom line

The 200-day moving average filter ("Leverage for the Long Run") does **not** magically create alpha or a higher Sharpe ratio once realistic financing costs are paid. What it actually does is **volatility-regime filtering**: equity markets tend to be calmer above their 200-day average and violent below it.

Used at **1× on our fee-free 1:1 account**, it is a clean drawdown-cutter. Used at **2×**, it trades financing drag for higher compound growth at roughly buy-and-hold drawdown. At **3×**, even the 200-day filter cannot prevent devastating crash drawdowns—and CFD overnight funding hits hard.

## How it works here

On each daily close (`1d`), `lrs-sma200.ts` checks `close` against its 200-day simple moving average on `US500` and `US100`:
- Close above SMA(200) → hold long; close below SMA(200) → close to cash.
- Three variants test leverage directly: **`x1`** (1× on fee-free 1:1), **`x2`** (2× on 1:3), and **`x3`** (3× on 1:5).

## What the SOTA says

- **Original paper (Gayed & Bilello 2016, Charles H. Dow Award):** Over 1928–2015 on the S&P 500 with a 1% borrowing assumption, leveraged rotation above the 200-day SMA reported Sharpe **0.51 vs. 0.30** for unlevered buy-and-hold because volatility below the 200-day average is far higher (crushing leveraged compounding via volatility drag L(L−1)σ²/2).
- **2026 revision with realistic borrowing costs:** When actual margin/borrowing rates are included, the Sharpe advantage disappears—net Sharpe sits roughly in line with the S&P 500 with **no statistically significant alpha**, and results show sensitivity to the exact lookback window and start date.
- **Practitioner consensus (r/LETFs & Faber GTAA updates):** Live real-money tracking (2024–2026) settled on **2×** as the sweet spot; simulated **3× Nasdaq** from 1999 still fell **−95%** even with the 200-day filter (vs −99.9% unfiltered).

## Where it breaks

- **Whipsaws around the 200-day line:** Sideways choppy markets cross the 200-day average repeatedly, selling low and buying back higher every few weeks.
- **Sudden crash gaps above SMA200:** Fast crashes (like Feb–Mar 2020 or Oct 1987) start *above* the 200-day average, so a 2× or 3× position takes a steep loss before the exit triggers.
- **High interest rates & CFD funding:** Borrowing costs scale with rates + broker markup, while sitting in cash inside a CFD account earns **0%** instead of T-bills.

## Our implementation vs SOTA

1. **No hysteresis buffer:** `lrs-sma200.ts` flips immediately on any single daily close across `sma(200)`. Practitioner SOTA commonly uses a buffer band (e.g., enter at +4% above, exit at −3% below) to reduce whipsaw churn.
2. **Double cash/funding drag on `x2` and `x3`:** `x1` runs on Capital's fee-free 1:1 account (clean!), whereas `x2` (1:3) and `x3` (1:5) pay overnight CFD funding on the **entire** position—not just the borrowed portion—and earn 0% when in cash.

## Sources

- [Gayed & Bilello (2016) — Leverage for the Long Run (CMT Dow Award PDF)](https://docs.cmtassociation.org/dow-award/2016-gayed-bilello.pdf)
- [r/LETFs Discussion — Gayed's 2026 Revision With Borrowing Costs](https://www.reddit.com/r/LETFs/comments/1wl0p0k/)
- [Concretum Group (2025) — Global Tactical Asset Allocation (200-day SMA Out-of-Sample)](https://concretumgroup.com/global-tactical-asset-allocation/)
