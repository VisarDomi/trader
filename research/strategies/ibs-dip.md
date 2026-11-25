---
id: ibs-dip
name: IBS Dip
group: strategy
status: researched
verdict: Conditional SOTA
verdictTone: 1
bestFit: 1:1 fee-free · US indices
expectedEdge: SR ~0.6–1.0 (unlevered)
tldr: Buying US index closes near the day's low (IBS < 0.2) above the 200-day average is one of the few retail mean-reversion rules with multi-decade out-of-sample survival, though it carries sharp crash risk when trends break.
slugs: ibs-dip
---

## Bottom line

Internal Bar Strength (IBS) dip-buying on US stock indices is one of the rare simple, retail-accessible rules that has held up across decades and independent out-of-sample tests—mostly because it harvests short-term liquidity provision after intraday panic sells inside a rising market.

It is **not** a free lunch: its return distribution is **negatively skewed** (many small wins, occasional violent multi-day selloffs), and holding overnight on a leveraged CFD account bleeds funding on top of spread.

## How it works here

At the 16:00 New York cash close (built from 30m bars), `ibs-dip.ts` computes `IBS = (close − low) / (high − low)` across the 09:30–16:00 session and checks that price sits above its 200-day simple moving average:
- **`pagonidis` variant:** Buys 1× when `IBS < 0.2` above the 200-day SMA, and exits automatically at the very next 16:00 New York close. No stop-loss.
- **`composite` variant:** Buys 1× when any of three dip triggers fires (`IBS < 0.2`, `RSI(2) < 10`, or 3 lower closes in a row) above the 200-day SMA, exits on a close above the 5-session average (or after 10 sessions), with an 8% stop-loss.
- Runs on `US500`, `US100`, and `US30` at the **1:2** tier (`roster.json`).

## What the SOTA says

- **Pagonidis (2013, QUSMA / NAAIM):** Documented strong next-day mean reversion in equity ETFs: low-IBS closes ($\le 0.20$) averaged roughly **+0.35%** the next day vs. **−0.13%** after high-IBS closes ($\ge 0.80$).
- **International out-of-sample validation (Pandey & Joshi 2023):** Confirmed the IBS effect across global country ETFs outside the original US sample.
- **Independent hobbyist stress test (2026):** In a controlled test of 100+ retail strategies (~700 variants, realistic costs, delisted data, and random-entry baselines), trend-filtered index dip-buying (IBS / RSI(2) / 3 down days above SMA200) was one of the handful of rules that survived.
- **Why it may persist:** End-of-day institutional rebalancing, dealer hedging, and retail panic selling push cash closes temporarily below fair value; liquidity providers earn a small overnight bounce for taking the other side.

## Where it breaks

- **Negative skew & gap-down crashes:** Buying weakness works until a real crash begins (e.g., Feb–Mar 2020 or a sudden macro shock). Overnight gaps can blow straight past an 8% stop-loss.
- **Low time in market vs. T-bills:** Because it is flat most days, idle cash in a CFD account earns **0%** instead of T-bills—making its excess-over-T-bills Sharpe look weaker during high interest-rate periods.
- **Correlated bets:** `US500`, `US100`, and `US30` dip together on the same selloff days. Three open index longs on the same afternoon are mostly one bet, not three independent bets.

## Our implementation vs SOTA

Three concrete details in `apps/backend/agents/ibs-dip.ts`:
1. **Assigned to 1:2 instead of 1:1:** Both variants only ever use `exposure: 1` (1× equity), yet `roster.json` puts `ibs-dip` on the **1:2** tier (`Arena 02`), so it pays overnight CFD funding on every hold—even though running it at **1:1** (`Arena 01`) would give the exact same 1× sizing with **zero overnight funding**!
2. **Short RSI(2) warm-up window:** `s.closes` keeps only `exitAvg + 3` (8) closes, so Wilder smoothing in `rsi2()` is slightly noisier than a standard long-seeded Wilder RSI(2).
3. **No volatility scaling:** Size is fixed at 1× regardless of VIX / realized volatility, so high-volatility crash regimes dominate total P&L.

## Sources

- [Alexander Pagonidis (2013) — The IBS Effect: Mean Reversion in Equity ETFs](http://qusma.com/wp-content/uploads/2013/09/The-IBS-Effect-Mean-Reversion-in-Equity-ETFs.pdf)
- [NAAIM Wagner Award Research Library](https://naaim.org/programs/wagner-award/)
