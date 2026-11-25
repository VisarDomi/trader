---
id: sharpe-guide
name: How to Read Sharpe & Trust
group: guide
status: researched
verdict: Guide
verdictTone: 0
bestFit: All strategies
expectedEdge: Context
tldr: A high Sharpe ratio—even over a long stretch—is not a trust metric. It is a historical signal-to-noise ratio: a starting input to statistical inference, never the verdict itself.
---

## What Sharpe ratio actually measures

**Annualized Sharpe ratio:**

```
SR̂ = mean(r − r_f) / σ̂(r − r_f) × √F
```

where `r` is the strategy return per period, `r_f` is the risk-free rate (3-month US Treasury bills), and `F` is the number of return periods per year (252 trading days or ~261 weekdays).

Three properties explain most of the confusion around Sharpe:

- **Return efficiency, not probability of skill:** It tells you how smooth past excess returns were relative to their volatility, not whether the edge is real or repeatable. Over 1 year, the standard error of a Sharpe ratio is roughly ±1.0, so a zero-edge coin flip hits SR̂ ≥ 1.0 by luck about 16% of the time.
- **Roughly leverage-invariant:** Doubling leverage doubles both excess return and volatility, leaving Sharpe unchanged (modulo financing, margin calls, and rounding). That makes it useful for comparing strategies at different risk levels—and useless for spotting over-leveraged blowup risk on its own.
- **Evidence comes from calendar time, not trade count:** Sampling an equity curve hourly instead of daily multiplies `F` by 24, which multiplies `√F` by `√24` while shrinking per-bar `μ / σ` by `1 / √24`—they cancel out. More bars and more trades per day do not create statistical certainty; more years and more independent bets do.

**Statistical evidence (i.i.d. normal returns):**

```
t ≈ SR̂ × √T_years
```

## Six ways a high Sharpe lies — and the SOTA fixes

Modern quantitative finance splits Sharpe's failure modes into six buckets. The first four have formal statistical fixes; the last two cannot be solved by return statistics alone.

**Expected maximum Sharpe from N zero-edge trials:**

```
max SR̂ ∝ √(2 · ln N) / √T_years
```

- **1. Selection bias & multiple testing:** Test hundreds of agents or parameters and look at the top of the leaderboard, and pure noise easily prints Sharpe 3.0+ over a year. SOTA fixes: **Deflated Sharpe Ratio (DSR)** (Bailey & López de Prado 2014), the **Harvey–Liu–Zhu (2016)** `t > 3` hurdle, **e-BH false-discovery control** (Wang & Ramdas 2022), and **López de Prado, Lipton & Zoonekynd (2025)** (*How to Use the Sharpe Ratio*, adjusting for effective independent trials `M_eff`).
- **2. Non-normality (negative skew & fat tails):** Sharpe only uses variance (the 2nd moment). Martingales, grid bots, short-volatility, and tight-TP / wide-SL rules earn tiny steady gains for months or years (making `σ̂` look tiny → huge Sharpe) until one tail event wipes them out. SOTA fixes: **Probabilistic Sharpe Ratio (PSR)** and **Minimum Track Record Length (MinTRL)** (Bailey & López de Prado 2012), which inflate uncertainty whenever skewness `γ₃ < 0` or kurtosis `γ₄ > 3`.

**Non-normal Sharpe standard error (Bailey & López de Prado 2012):**

```
σ̂(SR̂) = √[ (1 − γ₃·SR̂ + ((γ₄ − 1)/4)·SR̂²) / (n − 1) ]
```

- **3. Serial correlation (autocorrelation):** Scaling by `√F` assumes independent period returns. Positive autocorrelation (stale marks, smooth trend filters, overlapping positions) artificially shrinks short-period `σ̂` and can inflate annualized Sharpe by 50–100%+. SOTA fixes: **Lo (2002)** HAC / Newey–West variance adjustment and **Ledoit & Wolf (2008)** block-bootstrap hypothesis tests for comparing two Sharpes.
- **4. Peeking / optional stopping:** Classical `t ≥ 2` assumes you picked one end date in advance and checked once. Checking a live leaderboard every day inflates false positives sharply—even a zero-edge strategy crosses `t ≥ 2` at some point 16% of the time within a year and 22% within five. SOTA fixes: **always-valid inference, e-values, and confidence sequences** (Johari et al.; Howard, Ramdas et al. 2021), which remain valid at any stopping time no matter how often you look.
- **5. Non-stationarity & regime shifts:** Every statistical test above assumes stationarity—that tomorrow's returns come from the same distribution as yesterday's. Markets don't. A genuinely significant 3-year Sharpe of 2.0 in one volatility or rate regime can collapse to −1.0 after a regime shift or crowding. No formula fixes this: it requires a real **economic mechanism** (why does the edge exist, and who is on the other side?), out-of-regime stress tests, and **CSCV / Probability of Backtest Overfitting (PBO)** (Bailey et al. 2015).
- **6. Beta & execution illusion:** A long-only Nasdaq bot in a bull market earns a high Sharpe simply for holding market beta. Backtests also hide real spreads, fill latency, overnight funding, and intraminute stop-path risk. SOTA fix: benchmark against **same-date buy-and-hold** and audit realized fills against archived bid/ask quotes and funding.

## How Trader actually handles Sharpe

Trader already implements most of the statistical SOTA above and deliberately does **not** confirm strategies on raw Sharpe.

- **How Sharpe is computed (`metrics.ts`):** Excess return above rolled 3-month US Treasury bills, annualized by `√(periods / years)`. Caveat: backtest curves are daily while live curves are hourly, and raw live Sharpe assumes zero intraday autocorrelation—making live Sharpe noisier than the judging clock.
- **Uniform daily clock (`judgedT` in `judging.ts`):** Every forward record is judged on weekday returns (flat days = 0) so a strategy trading ten times a day and one trading twice a month sit on the exact same scale.
- **Backtest volatility floor:** Live daily volatility is floored at `max(own_sd, backtest_sd)`. This defeats the short smooth-streak trap: for example, Trader's `martingale-monkey` control hit `t = 5.2` on its own calm 31-day live volatility, which collapsed to `t = 1.2` once floored by its backtest volatility.
- **Always-valid `eValue` + `e-BH` across all trials:** Accounts for daily peeking and every strategy record ever started (retired ones included), plus a `backtestZ` check requiring forward performance not to exceed its backtest by more than 2 standard errors. With 844 records tried, confirming one solo winner requires roughly Sharpe 3.2 for 2 years, or Sharpe 2.0 for 5 years.
- **Family pooling & Arena Portfolio:** Because proving one solo strategy takes years, Trader pools correlated variants into families using **Efron–Morris shrinkage** (pulling lucky outliers toward the family mean) and tracks one pre-registered **Arena Portfolio** (`backtest cashFreeSharpe ≥ 0.5`, inverse-vol weighted) judged as a single claim made in advance.
- **Same-date hold & cost audits (`hold.ts`):** Every run is compared against buying and holding the exact same market over the exact same dates (including dividends where applicable), and closed trades are decomposed into midpoint P&L, spread, overnight funding, and fill timing.

## What even Trader's statistics cannot cover

- **Gaussian i.i.d. `eValue`:** The `eValue` calculation in `judging.ts` does not yet apply a PSR skew/kurtosis penalty or Lo autocorrelation adjustment. The backtest volatility floor catches hidden blowup risk only if the 2024–2026 backtest window actually contained a representative tail event.
- **Single macro regime:** Both the 2024–2026 backtests and current forward runs share a narrow macro environment. Statistical confirmation proves an edge existed in that regime—not that it is permanent.

## Five-step practical framework

Instead of asking "Is Sharpe high?", evaluate any agent in five steps:

1. **Use Sharpe as a filter and sizing input, not proof:** It tells you whether returns justify volatility and how to weight uncorrelated strategies (inverse-volatility / equal-risk), not whether to trust a single agent.
2. **Read `clock` (`t`, `eValue`, verdict) and calendar time, not raw Sharpe:** A Sharpe of 3 over 60 days is noise; a Sharpe of 1.0 over 3 years is a candidate, still not proof if picked from hundreds of runs.
3. **Inspect return shape to rule out steamrollers:** Check `maxDrawdown`, `worstTrade` vs. `avgWin`, `winRate`, and `exposure`. High Sharpe + high win rate + tiny average win + huge worst trade is a classic negative-skew blowup profile.
4. **Separate alpha from beta and cost drag:** Check same-date `vs hold` and quote-supported cost coverage (midpoint P&L vs. spread, funding, and fill timing).
5. **Trust families, diversified portfolios, and mechanisms before solo stars:** Single realistic strategies (true Sharpe ~0.5–1.5) are almost impossible to confirm alone in under 5–10 years. Real confidence requires a clear economic reason the edge exists after costs, breadth across weakly correlated markets, and position sizing that assumes you can still be wrong when the regime changes.

**Portfolio diversification law:**

```
SR_portfolio ≈ SR_single × √N_independent
```

## Sources

- [Andrew Lo (2002) — The Statistics of Sharpe Ratios (FAJ)](https://alo.mit.edu/wp-content/uploads/2017/06/The-Statistics-of-Sharpe-Ratios.pdf)
- [Ledoit & Wolf (2008) — Robust Performance Hypothesis Testing with the Sharpe Ratio (JEF)](https://www.econ.uzh.ch/static/wp/econwp009.pdf)
- [Bailey & López de Prado (2012) — The Sharpe Ratio Efficient Frontier (PSR & MinTRL)](https://www.davidhbailey.com/dhbpapers/sharpe-ratio-ef.pdf)
- [Bailey & López de Prado (2014) — The Deflated Sharpe Ratio (DSR)](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- [Bailey, Borwein, López de Prado & Zhu (2015) — The Probability of Backtest Overfitting (CSCV / PBO)](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf)
- [Harvey, Liu & Zhu (2016) — ...and the Cross-Section of Expected Returns (RFS)](https://www.nber.org/papers/w20592)
- [Howard, Ramdas, McAuliffe & Sekhon (2021) — Time-Uniform, Nonparametric, Nonasymptotic Confidence Sequences](https://arxiv.org/abs/1810.08240)
- [Wang & Ramdas (2022) — False Discovery Rate Control with e-values (e-BH)](https://arxiv.org/abs/2009.02824)
- [López de Prado, Lipton & Zoonekynd (2025) — How to Use the Sharpe Ratio](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5520741)
