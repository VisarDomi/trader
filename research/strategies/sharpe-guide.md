---
id: sharpe-guide
name: How to Read Sharpe & Trust
group: guide
status: researched
verdict: Guide
verdictTone: 0
bestFit: All strategies
expectedEdge: Context
tldr: High Sharpe is a past smoothness score, not proof an edge is real. Judge by calendar time, number of strategies searched, tail shape, and why the edge should exist.
---

## Why high Sharpe alone is not trust

Sharpe is return above T-bills divided by volatility, scaled to a year. It tells you how smooth the past curve was—not whether the strategy will keep working.

Over 1 year, a strategy's Sharpe has a standard error of about ±1.0. A zero-edge coin flip hits Sharpe ≥ 1.0 by luck about 16% of the time in a single year.

## The six ways a high Sharpe lies

- **Leaderboard luck (multiple testing):** Pick the winner out of 844 strategies and pure noise easily prints Sharpe 3.0+ over a year.
- **Steamroller payoffs (negative skew):** Martingales, grid bots, and wide stops win small every day until one crash wipes out the account. Sharpe only sees the calm variance before the crash.
- **Autocorrelation:** Smooth or stale returns make short-period volatility look artificially small, inflating annualized Sharpe.
- **Daily peeking:** Checking a live leaderboard every day makes a classic t ≥ 2 threshold fire by luck 16% of the time within a year.
- **Regime shifts:** Statistics assume tomorrow comes from the same distribution as yesterday. Markets change, and crowded signals decay.
- **Market beta & fake fills:** A long Nasdaq bot in a bull run gets a high Sharpe just for holding beta. Backtests also miss real spreads, funding, and slippage.

## How Trader actually judges trust

Trader does **not** confirm strategies on raw Sharpe. It uses a daily weekday clock with four stricter guards:

- **Volatility floor:** Live daily volatility cannot drop below the backtest's volatility, stopping short calm streaks from faking a huge t-stat.
- **Always-valid e-values:** Valid even when checked every single day.
- **Trial count bar (e-BH):** Accounts for every strategy ever started (retired ones included). Confirming one solo winner out of hundreds requires roughly Sharpe 3.2 for 2 years, or 2.0 for 5 years.
- **Same-date hold & cost audits:** Compares every run against simply buying and holding the asset over the same dates, and tracks spread, funding, and fill timing.

## Five-step phone checklist

1. **Use Sharpe as a filter, not proof.** It helps size positions, not prove skill.
2. **Look at time and verdict (`clock`), not trade count.** More trades per day do not shorten the calendar time needed for statistical proof.
3. **Check the tail shape.** High win rate + tiny average win + huge worst trade = hidden blowup risk.
4. **Check `vs hold` and costs.** Did it beat simply holding the asset after spreads and overnight funding?
5. **Trust families and mechanisms before solo stars.** A single real Sharpe-1 strategy takes 5–10+ years to confirm alone. Real confidence comes from a clear economic reason the edge exists plus diversification across uncorrelated markets.

## Sources

- [Andrew Lo (2002) — The Statistics of Sharpe Ratios](https://alo.mit.edu/wp-content/uploads/2017/06/The-Statistics-of-Sharpe-Ratios.pdf)
- [Bailey & López de Prado (2012) — The Sharpe Ratio Efficient Frontier (PSR & MinTRL)](https://www.davidhbailey.com/dhbpapers/sharpe-ratio-ef.pdf)
- [Bailey & López de Prado (2014) — The Deflated Sharpe Ratio](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- [Harvey, Liu & Zhu (2016) — ...and the Cross-Section of Expected Returns](https://www.nber.org/papers/w20592)
- [Wang & Ramdas (2022) — False Discovery Rate Control with e-values (e-BH)](https://arxiv.org/abs/2009.02824)
