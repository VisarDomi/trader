---
id: vol-managed-hold
name: Volatility-Managed Hold
group: strategy
status: researched
verdict: Conditional (risk-control)
verdictTone: 0
bestFit: 1:1 fee-free · high-vol assets
expectedEdge: Lower drawdown; weak OOS Sharpe lift
tldr: Scaling down exposure when recent volatility exceeds the 1-year average cuts crash drawdowns without overnight CFD funding at 1:1, but out-of-sample research (Cederburg et al. 2020) shows it rarely beats buy-and-hold on Sharpe in real time.
slugs: vol-managed-hold
---

## Bottom line

Volatility management is a **risk-control tool**, not a reliable alpha generator. Because volatility clusters while short-term expected returns do not rise proportionally, cutting size during stormy months reliably trims deep drawdowns.

However, rigorous out-of-sample testing (Cederburg et al. 2020) showed that in real time—without hindsight on scaling weights—volatility-managed portfolios do **not** systematically beat simple buy-and-hold on Sharpe ratio once turnover and estimation noise are included.

## How it works here

Every Monday close (`1d`), `vol-managed-hold.ts` compares the last 21 trading days' annualized volatility (`recent`) against the past 252 trading days (`normal`):
- Target exposure = `0.9 × min(1, normal / recent)` (capped at 0.9× equity on the **fee-free 1:1** account).
- Resizes only when target exposure moves by at least `0.15×` from the current position.
- Runs on the 8 mega-cap Nasdaq shares (`NVDA`, `MSFT`, `AAPL`, `AMZN`, `AVGO`, `META`, `GOOGL`, `TSLA`) plus `BTCUSD` and `ETHUSD` at **1:1** (zero overnight funding).

## What the SOTA says

- **Moreira & Muir (2017, *Journal of Finance*):** Found that scaling market and factor portfolios inversely to prior-month variance (`1 / σ²`) produced large historical Sharpe gains and alphas across equities, momentum, value, and carry, because cutting exposure during high-volatility recessions avoided the worst crashes.
- **Cederburg, O'Doherty, Wang & Yan (2020, *Journal of Financial Economics*):** Tested 103 equity strategies strictly out-of-sample and found that real-time volatility management **failed to systematically beat unmanaged buy-and-hold** on Sharpe or certainty-equivalent return due to structural instability and estimation error.
- **2023–2025 consensus:** Treat volatility scaling as a **drawdown and risk-budgeting discipline** (especially for crypto and high-beta single stocks), not a standalone source of excess Sharpe.

## Where it breaks

- **V-shaped crash rebounds:** Volatility stays elevated right after a market bottom. Scaling down *after* a drop causes the strategy to miss the sharpest early-recovery rebound days.
- **Idle cash earns 0% in CFDs:** When volatility doubles and exposure drops to 0.45×, the idle 55% of equity earns **0%** instead of T-bills, dragging excess-over-T-bills Sharpe.
- **Full close-and-reopen resize cost:** Without partial position resizing, every threshold cross pays a full round-trip spread on the entire holding (particularly expensive on BTC/ETH and shares).

## Our implementation vs SOTA

1. **Good fit on 1:1 fee-free account:** Running at 1:1 avoids overnight CFD funding completely on all 10 instruments (shares and crypto).
2. **Inverse-vol (`1/σ`) instead of inverse-variance (`1/σ²`):** `vol-managed-hold.ts` uses `normal / recent` (constant-vol scaling, gentler and lower-turnover than Moreira & Muir's `1/σ²`), which is actually closer to institutional practice.
3. **Full close + reopen on resize:** Line 34 calls `ctx.close('resize')` and immediately re-buys the full new size—paying spread on the *entire* position rather than only the delta.

## Sources

- [Moreira & Muir (2017) — Volatility-Managed Portfolios (Journal of Finance / SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2659431)
- [Cederburg, O'Doherty, Wang & Yan (2020) — On the Performance of Volatility-Managed Portfolios (JFE PDF)](https://www.lehigh.edu/~xuy219/research/COWY.pdf)
