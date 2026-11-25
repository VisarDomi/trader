---
id: visar-night
name: Visar Night
group: strategy
status: researched
verdict: Experimental (unproven)
verdictTone: 0
bestFit: 1:20 research cohort (1:200 high-ruin)
expectedEdge: Unproven; controls test direction vs drift
tldr: Follows a directional New York equity session after an overnight pullback, fixed strictly to New York clocks (16:00 close, 21:27 entry, 02:27 exit) so DST mismatches never shift it. Academic SOTA documents overnight drift (mostly long/reversal around the European open), not directional continuation from the US day—which is why our always-long and random controls run beside it.
slugs: visar-night, visar-night-control
---

## Bottom line

The **Visar Night** family tests whether a clean, directional New York cash session continues overnight after a brief counter-move—holding for exactly 5 hours across the late-Asian / pre-European window (`21:27 → 02:27` New York, avoiding the overnight funding rollover).

Academically, the strongest documented overnight effect in US equity futures is **unconditional positive overnight drift** (strongest after down days, peaking near the European open around 02:00–03:00 New York), *not* directional continuation following the prior US day. That is why Trader runs matched **always-long** and **random-direction** controls on the exact same nights—so forward data can separate true directional skill from simple overnight drift or luck.

## Exact schedule (New York clocks, DST-safe)

Every variant in `visar-night` and `visar-night-control` trades symmetrically on **US500 and US100**, pinned to **New York time (`America/New_York`)**:
- **US session classified:** `09:30–16:00 NY` (`full-day-200`, `full-day-20`) or `10:30–15:30 NY` (`midday-200`, `midday-20`, `no-pullback-20`, `loose-body-20`, `any-day-20`, `every-night-20`)
- **Reference price:** `16:00 NY` cash close (`22:00` Tirana normally; `21:00` Tirana in the ~3 weeks/year when US and European DST disagree)
- **Entry decision:** `21:27 NY`, Monday–Thursday evenings (`03:27` Tirana Tue–Fri normally; `02:27` Tirana in DST-mismatch weeks)
- **Scheduled exit:** `02:27 NY` (+5 hours; `08:27` Tirana normally; `07:27` Tirana in DST-mismatch weeks)
- **Exclusions:** Skips FOMC/BOJ decision days and neutral/choppy sessions (except `any-day-20` and `every-night-20`); stops out at a 50% entry-capital loss budget.

## What the SOTA says

- **Boyarchenko, Larsen & Whelan (2023, *Review of Financial Studies* / NY Fed):** Studying S&P 500 futures across the 24-hour clock, they found that nearly all long-run equity excess return accrues overnight—concentrated around the **European open (~02:00–03:00 NY)**—and is **asymmetric**: market makers lean against end-of-day selloffs, creating strong *positive reversals* after down US sessions rather than bearish continuation.
- **Lou, Polk & Skouras (2019, *Journal of Financial Economics*):** Documented a "tug of war" between daytime and overnight investor clienteles: overnight returns positively predict future overnight returns, while intraday and overnight returns tend to **reverse** each other rather than continue in the same direction.
- **Leverage & ruin math (Kelly / ergodicity):** At **1:200**, a 50% equity stop sits only ~0.28% away from entry—well inside normal overnight S&P 500 noise—so compounding at 1:200 suffers extreme ruin probability even if a tiny directional edge existed. At **1:20**, the 50% stop sits ~2.8% away, letting the strategy express its actual 5-hour price signal without constant stop-outs.

## Where it breaks

- **1:200 noise stop-outs:** On the 2024–2026 NY-clock backtest, the original 1:200 US500 rule made 70 trades and lost **−99.99%** because normal overnight swings repeatedly hit the tight 50% capital stop.
- **Bearish-day continuation vs. overnight drift:** Shorting after a red US day fights both the structural upward equity risk premium and the Boyarchenko et al. overnight dealer-reversal bounce.
- **Small sample illusion:** With ~25–50 trades per year, a 3-trade winning streak (+166% at 1:200) happens frequently by luck; confirming a real directional edge takes years of forward evidence across the family.

## Our implementation vs SOTA

1. **Zero overnight funding:** The `21:27 → 02:27` New York window sits entirely outside Capital.com's daily funding rollover, eliminating financing drag.
2. **Controlled experiment design:** Running `visar-night/*` alongside `visar-night-control/always-long` and `visar-night-control/random-direction` on identical `midday-20` nights directly answers the SOTA question: does following the day's direction beat simply being long overnight?
3. **1:200 vs. 1:20 divergence:** On 2024–2026 NY-clock backtests, dropping leverage to 1:20 or narrowing to the midday window flipped US100 strongly positive (`midday-20` +106.7%, `midday-200` +171.8%, `no-pullback-20` +214.7%) while `full-day-200` lost −100% on both indices—remember 2024–2026 was a strong equity bull market, so forward performance against `always-long` is the real test.

## Sources

- [Boyarchenko, Larsen & Whelan (2023) — The Overnight Drift (NY Fed / RFS)](https://www.newyorkfed.org/research/staff_reports/sr917)
- [Lou, Polk & Skouras (2019) — A Tug of War: Overnight Versus Intraday Expected Returns (JFE)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2653841)
