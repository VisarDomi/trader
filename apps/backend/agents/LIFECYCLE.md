# Agent lifecycle and the babysitter runbook

How agents enter, move through and leave the arena, and what the coding agent does on each scheduled visit.
Repo-wide hard rules come first: [`../../../setup.md`](../../../setup.md). Writing an agent:
[`GUIDE.md`](GUIDE.md). What happened so far: [`JOURNAL.md`](JOURNAL.md).

## Stages

| Stage | Meaning | Promotion / demotion |
|---|---|---|
| Backtest | historical simulation on the lab PC | current-code result passes the gate below before a new virtual record starts |
| Virtual engine | forward execution on live quotes, $10,000 per run, independent cash | candidates on the daily clock (≥10 trades and 42 days observed, daily t ≥2, above the instrument's standard monkeys) can compete for Capital slots |
| Capital demo | actual demo orders on Arena accounts at 0.2× size | new candidates compete within a leverage tier, with a daily-t advantage ≥0.25; swaps wait for the incumbent to be flat |

Demotion goes **Capital demo → virtual → backtest**. Losing actual cash on the daily clock (realized cash per
weekday since the first deal: t ≤−1 after 30 deals and 42 days, or 10 deals and 90 days) removes a Capital slot.
That run continues virtually, waits 28 days, and returns only as a candidate on the weekdays and trades since its
demotion. A mature virtual loser, silent run, busted
account or agent error is archived back to backtest automatically. If still on Capital, it first loses that
slot and gets the virtual observation window. Historical records remain available. A changed idea needs
new source/version and a new passing backtest; same-code archived runs never silently restart.

The Capital assignments made before the evidence gate existed are a **calibration cohort**, not
candidates or confirmed records. They keep their records so execution drift can be compared. New assignments
require the evidence gate. Backtest gates apply to new admissions; forward records are retained even if
their backtest would fail the current gate. Engine model changes are annotated; history is never rewritten.

An explicit user request can admit a **special demo experiment** through `roster.json` → `demoAdmissions`.
Each exception names one `agent:EPIC@tier`, its exact source hash, date and reason. It requires a current
source/current-engine backtest without an error status, but may bypass historical performance and virtual
maturity gates. It has slot priority (only flat incumbents can be displaced) and is labeled **user experiment**;
it is not a control, a candidate or a confirmed record. Normal runtime safety, kill switches and subsequent demotion apply.
After its first demotion the exception no longer grants re-entry. Changed source needs a new explicit review
of the exception. `visar-night-trading:US500@200` is one; `roster.json` lists them all.

Control agents (`random-baseline`, `buy-hold`, `leverage-ladder`, `constant-leverage`, `skew-monkey`,
`martingale-monkey`, `bold-play`, and the night cohort's direction controls `visar-night-v3-control-us100` /
`-us500`) are never judged or retired. The direction controls trade exactly their
`base` agent's eligible nights with identical settings, always long or with a random side, and hold
user-requested demo admissions so the comparison also runs on Capital.

The night cohort (`research/night-cohort-v4-20261122.json`, 20 members) studies the user's night rule on
both indices. Its v3 part is a base per index plus one change each: overnight gap, leverage 1:200, or side
(direction controls). The original `visar-night-trading` keeps its record as the US500 full-day 1:200 point;
US100 has the same settings (`visar-night-v3-us100/full-day-200`). Its v4 part is five looser variants per
index at 1:20 (`visar-night-v4-us500/us100`: `loose-body`, `no-pullback`, `any-day`, `every-night`,
`full-day`). Looser variants trade more nights where the 50% loss limit (about 2.8% away at 1:20) is out of
the night's reach; a stricter subset of the base could trade only on the base's nights and so would add no
observations. The v4 source is the v3 rule plus two switches (`direction`, `pullback`); with its defaults it
trades exactly like the v3 base, and the paper grid runs every cell on it. Exits that never trigger at 1:20
are not explored. The ruin controls `bold-play` and `martingale-monkey` are automatically paper-only by slug,
including future code versions. There is no live-money stage.

Execution comparisons have separate records and labels, but are correlated copies of a strategy under
frozen latency assumptions. They never take Capital slots and never multiply strategy/monkey verdicts.
Existing comparison histories continue independently when a standard run is retired for performance,
including across restarts. This does not admit new comparisons or revive the retired standard record;
explicit roster, source-version and comparison retirements still apply.
See [`../EXECUTION.md`](../EXECUTION.md) for the empirical contract and limits.

## Verdicts

Computed by `packages/shared/src/lifecycle.ts`, shown in the dashboard's Stage column and by `bun run review`.

| Verdict | Rule |
|---|---|
| early | fewer than 10 closed trades or fewer than 42 days observed |
| retire | daily t ≤ −1 after 30 closed trades and 42 days (slow agents: 10 trades and 90 days); or zero closed trades while flat after 60 observed days; or busted; or stopped on errors |
| candidate | past the floor, daily t ≥ 2 and higher than every random monkey's on the same instrument |
| confirmed | past the floor, agreeing with its same-code backtest, and clearing the bar for every strategy record ever started (false discovery rate 10%) |
| keep | past the floor, anything else |

Every record is judged on the daily clock ([EVIDENCE.md](../EVIDENCE.md), "The daily clock"): its return on each
weekday, flat days included, so a strategy that trades ten times a day and one that trades twice a month are
measured in the same unit. t = mean ÷ volatility × √weekdays, the volatility never below the same-code backtest's.

A **candidate** may compete for Capital demo slots and may still be luck: checked every day, about one no-edge
record in six shows t ≥ 2 at some point within a year. That is acceptable for demo slots and for nothing else.
**Confirmed** is the claim of an edge. It stays valid however often the record is checked and counts every
strategy record ever started, retired ones included, so at most about one confirmed record in ten is expected to
be luck. With 844 records tried and none confirmed (2026-11-25) the first needs a daily t near 4.6 over a year: a
Sharpe ratio of 3.2 for two years, or 2 for five. Slow strategies need years; no rule shortens that honestly.
Candidates are compared on t, not return, because the return grows with position size and runs trade at
different leverages; the t-statistic does not.

Every record is also judged with its **family** as one record: the average of its members' weekday returns at
equal risk, retired members included on the days they ran. A family is an agent file with its variants,
instruments and tiers, or several files joined under `families` in `roster.json` (the night rule's files are
`visar-night`). Its verdicts are early, keep, candidate and confirmed; confirmed families are counted over every
family ever started (39 on 2026-11-25: the first needs a t of 3.8 after a year, against 4.6 for one record). This
is how slow strategies can be judged sooner. A family verdict is information: slots, demotion and retirement stay
per record. When a new file continues an existing idea, add its slug to that family in the same commit; keep the
slugs of retired files listed.

An agent with no edge pays the spread on every trade, so its t-statistic drifts below zero as days
accumulate: −1 retires most no-edge runs within a few months while rarely retiring a real edge.
The review's monkey sanity line shows how many random monkeys pass the candidate bar.

Do not change these thresholds casually. If the evidence says they are wrong (e.g. a no-edge control is
confirmed), change them in `src/engine/policy.ts` and explain why in the journal.

Known forecast-dependency outages, including the resource hold, are removed from virtual observation
time. Calendar age/P&L remain intact; an open holding with zero closed trades is not silent. Newly
recorded dependency intervals survive restarts, while earlier unknown availability is not invented.
Paused dependencies cannot earn new Capital promotion. See [evidence](../EVIDENCE.md).

Some night variants are built to trade rarely. Their no-trade timeout is 365 days for
`visar-night-lab/clean-50x` (about one trade a year) and 180 days for the sparse body/retracement and
day-filter variants listed in `silentDaysFor` (`src/engine/policy.ts`, shared by the runtime and the
review/UI); every other run, the v4 variants included, has 60 days. This extends only the opportunity to
observe a rare entry: error/ruin exits, maturity, losing-evidence demotion and source-specific admission
rules are unchanged. The normal timeout would otherwise end a deliberate frequency experiment before its
declared cadence could produce an observation.

## Retiring

- **One run:** add `"<agentId>:<EPIC>@<tier>": { "date": "YYYY-MM-DD", "reason": "<review reason>" }` to
  `retired` in `agents/roster.json` (the review prints the key). `"<agentId>:<EPIC>"` retires every leverage
  of that instrument, `"<agentId>@<tier>"` one leverage of every instrument. Never edit the agent file for
  this: that changes its code hash and restarts the records of all its other runs.
- **A whole agent** (the review lists it under "Retire: agents"): `git mv agents/<file>.ts agents/_retired/`
  (or the folder), and drop its roster entries. The loader ignores `_retired/`.
- **Stopped on errors:** read the run log first. If an agent bug never let the idea be tested, fix it (a
  new code hash, judged from zero) instead of retiring it. If the platform is at fault, fix the platform.
- Never retire on backtest results, and never "rescue" a losing run by editing its parameters. A changed
  idea is a new agent (new file, new record).

Decommissioned agents and versions belong in the dashboard's **Graveyard** (`/graveyard`). Keep their
source, forward runs, broker history and results. The arena records retirement reasons durably and
archives a backtest when its agent source or simulation engine changes. A same-version repeated upload
updates that result without making duplicate archives. Never delete old records to tidy the leaderboard.
When replacing a platform generation, add its dated milestone to `apps/ui/src/lib/platform-history.ts`
(the Graveyard's platform history) and the journal. Platform migrations and replaced versions must not be labeled losing strategies.

## Leverage

Each Arena account has one leverage (`accounts` in `agents/roster.json`); the arena sets it on the account
and mirrors only runs of that leverage there. Each agent runs at the tiers in `leverage.agents` (by agent
id or file slug), else those declared in its file, else `leverage.default`.

| Account | Arena 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 |
|---|---|---|---|---|---|---|---|---|---|
| Leverage | 1:1 | 1:2 | 1:3 | 1:5 | 1:10 | 1:20 | 1:50 | 1:100 | 1:200 |

Initial allocation: agents sorted by how much leverage they used in backtests (90th
percentile of position ÷ equity), the least on 1:1 and the most on 1:200, about 50 runs per account; the
leverage ladder on all nine; buy-and-hold (with the share basket) on 1:1. Agents that size by risk rarely
use more than 5–10×, so on the 1:50–1:200 accounts they trade as they would at 1:20: only the ladder and
agents that size with `marginPct` use the high leverage.

- **New agents:** give each one a tier in `leverage.agents`: the lowest tier above what `check-agent`
  reports as its leverage use (90th percentile), or the tier its idea is about. Prefer accounts with free
  slots (`review` shows runs per tier).
- **Capital capacity remains 50 runs per tier**. Virtual experiments may exceed that; evidence decides who reaches Capital.
- **Moving an agent to another tier** retires its runs at the old tier and starts new ones; do it rarely and
  say why in the journal. Changing an account's tier moves every run on it.
- Never change an Arena account's leverage in Capital.com: the arena sets it back from the roster.
- Leverage questions worth answering over time: does any strategy do better unleveraged at 1:1 (no overnight
  fees, natural gas aside) than on its usual tier? Which ladder rungs survive? Do high-leverage agents (tight
  stops, `marginPct` sizing) belong on 1:100–1:200? Record findings in the journal.

## Adding agents

- **When:** at most every 7 days (`ADD_AGENTS_EVERY_DAYS`), and only while total virtual runs plus new ones stay ≤5,000
  (measured capacity; `review` shows standard and comparison counts). New strategies take priority over
  replaceable execution comparisons at the next deploy.
- **How many:** 1–3 agents per addition, each with at most 3 variants that differ meaningfully.
- **What:** ideas with a reason to work that does not come from our backtest: documented market effects
  (time-series momentum, short-term reversal, volatility breakouts, opening-range and session effects,
  overnight and turn-of-month drift, volatility-regime filters, funding-aware holding), new mechanisms not
  yet on the leaderboard, and TimesFM used for volatility or uncertainty rather than direction (see the
  note in `GUIDE.md`). Prefer families that are under-represented. A candidate or a confirmed record may inspire a related but
  distinct idea (another timeframe or mechanism), never a parameter tweak of itself.
- **Before writing,** read the idea log at the end of `JOURNAL.md`. Do not repeat a retired or rejected idea
  unless the new version is substantially different and the journal says why.
- **Parameters** are chosen up front (round numbers, textbook defaults). No backtest-driven tuning.
- **Leverage** tier chosen as in [Leverage](#leverage) and written to `agents/roster.json`.
- **Instruments** are chosen up front, where the mechanism makes sense. Do not drop instruments because
  their backtest looked bad.
- **Gate:** `bun run check-agent agents/<file>.ts` passes; for forecast agents run `bun run forecasts` first;
  then `bun run backtest <agent>` (heavy jobs inside `trader.slice`, see `../WORKFLOW.md`). For new admissions the engine checks each instrument/tier: reject a current-code backtest
  with Sharpe below −0.5 (on the returns themselves, not above T-bills), fewer than 20 trades, an error or
  a busted account; the check is per row, so one broken instrument cannot ride on a good average. Agents built to trade a few times a year (200-day filters, monthly rebalancers,
  rebalancing holders) need at least 5 trades per run instead of 20; they are judged by the slow-agent rule.
  Controls are not gated. Log rejected ideas too.

## Paper–demo twins

Every run that trades on a Capital.com demo account also runs as paper in our engine, from the same
decisions (the demo deal is 0.2 × the paper size). Each closed demo deal is paired with its paper trade and
compared per unit of notional; a pair **agrees** when the two returns differ by at most one typical spread.
Pairs that keep agreeing are the evidence that paper results stand for demo results, which is what lets
paper carry the agents that never get one of the 450 demo slots. A divergence is an engine or mirror bug
until shown otherwise. The dashboard shows it under More → Paper vs demo (`/api/twins`); `bun run twins`
prints the daily check. Agent verdicts over a window: converged (≥90% agree, mean gap within half a
spread), diverged (<75% agree or mean gap beyond a spread), watch in between, too few under 5 pairs.

`CHECK` on agents fires only for diverged agents whose demo earns less than paper by two standard errors or more
(paper optimistic: it would overrate them). Diverged agents with the demo ahead (paper conservative) are listed with
their standard error but raise no CHECK. On the US indices a pair's two fills lie about half a second apart (paper
assumes 500 ms, the demo is accepted in ~200–300 ms) in a market that moves about one spread in that time, so their
pairs often miss by noise alone: in the 2026-11-21 check, 28 of 32 US index runs with 5+ pairs were "diverged",
22 of them with the demo ahead and none with the demo significantly behind; on other instruments 1 of 43.

The checks judge the current engine: `bun run twins` and the page's default view use only trades decided
since the running engine version started (the arena records it as `engine.since`; a version bump restarts the
window). The all-trades lines are context; old-engine divergence does not raise a CHECK.

Known sources of gaps (measurements and the bugs they exposed are in the journal and `CHANGELOG.md`):

- **Capital's quote delay.** Capital's demo stream arrives 0.1–13 s after each quote's timestamp, in regimes
  (REST shows the price earlier), so Capital's own stops can fire before ours. In busy hours (08:00–21:00 UTC)
  the delay is 5–13 s on every instrument at once, with holes of 1.5–3.5 s. The delay is Capital's, not one
  connection's: fresh sessions (`bun run stream-probe`) ran as far behind with the same holes, on the host the
  session names. Splitting or reconnecting the stream cannot help; paper's stamp rules account for it.
- **Fill price.** Paper fills at the price in effect when the order reaches Capital, the last quote stamped at
  or before then (engine `2026-11-arrival-price`), and a stall in the stream does not make that price stale
  (`2026-11-arrival-stall`); Capital's demo fills follow the same rule. Minutes close only once their late
  quotes arrive.
- **Order timing.** Demo orders leave at the decision and are accepted ~0.15–0.3 s after it, longer when one
  account has several orders in the same burst: each waits for the previous one's confirmation, at the arena's
  ~6 requests/s shared by all accounts, about 0.35 s per order at top-of-hour bursts (bursts of 16–26 orders
  put the last order 5–8 s after the decision). Agents that enter only at bar closes on the US indices
  (noise-area-momentum) trade inside the stream's holes and the burst queue, so they diverge in fast markets.
- **Refusals.** Capital refuses about 2% of orders without a reason at busy moments; the order goes out again
  a second later.
- **Funding.** Capital books overnight swaps per account without a deal id, so the twins cannot compare
  funding per trade; at paper size its 14-day swaps (−$3.5k) exceeded the paper funding on paired trades
  (−$1.8k, closed trades only).
- **Stops and targets in fast markets.** The stream arrives in bursts with holes of seconds. Capital's targets
  fill at their level, and so do paper's (engine `2026-11-tp-level`); Capital's stops fill near the level and
  paper's at the next quote we receive, so broker-closed stops agree less and favour demo (conservative
  paper; 60 of 845 pairs over 14 days).
- **Trailing stops.** Capital's trailing stops follow paper's rule (anchored and triggered on the closing
  side) but on Capital's full price path, of which our stream is a sample. When the price turns within about
  a spread of the trail level, Capital closes and paper stays in (8 of 85 trailing pairs, Capital first by
  70 s to 8.7 h, gaps of either sign, −87 bp at worst).

A deal the lifecycle closes (a demotion to virtual, a run leaving the mirror) is not a twin: the paper trade goes on.

## Each visit (runbook)

Visits run from the T3 Code scheduled task "Trader". The owner sets the schedule from the results: up to
once a day when the last visit found bugs, down to once a week after a quiet period. Each visit covers the
time since the last one: twins over the current engine's window, health since the last visit (reboots, the
lab's nights, watchdog alerts in `journalctl --user -u trader-watchdog`), retirements and additions (when due),
and one journal entry.

1. Read `../../../setup.md` (hard rules), this file, and the three newest entries of `JOURNAL.md`.
2. `cd apps/backend && bun run review`. Also `systemctl --user list-units 'trader*' 'pc-server-trader*'` and, if last night's
   backtests matter, `journalctl --user -u trader-lab -n 40`.
3. **Twins.** `bun run twins`. Every `CHECK` line gets a look: open the diverged agents on Paper vs demo,
   compare the largest gaps' fills with the recorded quotes (the tick archive has both quote and arrival
   times), and fix the engine or the mirror when the cause is ours. Record what you found, including
   "unexplained", in the journal; never tune an agent to the demo results.
   **Health.** Inspect the Status execution panel (or `/api/execution`): pacing/HTTP latency, slippage,
   pending commands, missing close values, CPU (`cpuParts` splits it by part: quotes, bars, persist, api …),
   Capital's quote delay (`feed`), poll duration and memory. Contract probe: `bun run audit-capital`
   is read-only; use `--orders` only for a concrete broker behavior investigation on Arena 01.
    Inspect tick capture/archive health and the Status storage projection (or `bun run storage --refresh`).
   Confirm `trader-tick-archive.timer` has a future trigger and that verified acknowledgements advance;
   an active-but-elapsed timer with an inactive service is not a healthy schedule.
   Cost evidence: after archival, `bun run audit-costs --backfill --limit 5000` attaches missing,
   quote-supported metadata from the canonical archive. Run this bounded CPU job in trader.slice;
   no prices/P&L are rewritten and unmatched old costs remain unknown.
   Keep the user's one-copy, 100 GB/two-year budget: compressed PostgreSQL is canonical; do not create
   another raw archive. Never delete captured history to make room; act on growth forecasts early.
   The arena and UI run on this PC; `~/.local/share/hetzner-pc/ACTIVE` selects the PC runtime in the
   storage/deploy tooling and `trader-tunnel` stays disabled. Confirm both `pc-server-trader-*` units share
   `trader.slice`. Never start the arena on Hetzner: its copy there holds stale data.
   Respect the user's `~/.local/share/heavy-resources/user-pause.json` hold: an intentionally stopped
   forecaster/nightly lab is expected. Keep trading/recording healthy; defer heavy additions/backtests
   until the user runs `heavy-resources-start`. Never clear the hold or restart these jobs autonomously.
   A model-only resume removes the forecaster from the marker's services list; remaining lab holds
   still defer additions/backtests. Check the relevant service entry rather than only file existence.
   The video pipeline's hold is not ours. `ops/lab/lab-control.py check` exits 0 when the lab may run.
   The nightly job ends with the Visar night paper grid (540 settings per index, Night Lab → Paper grid). Check its
   "Built" time; a stale grid means `night grid failed` in `journalctl --user -u trader-lab`. The grid is
   a map of shape on shared nights, not a selector: do not promote cells to demo from it.
   Fix what is broken and within scope (services, agent bugs, platform bugs; follow
   `../WORKFLOW.md`). If only the user can fix it (a demo account deleted or unfundable, credentials
   changed), notify them (step 8) and record it.
   For agents using `src/sdk/policy-calendar.ts`, check the linked official Fed/BOJ schedules for changes
   and ensure calendar coverage extends at least 90 days ahead. Refresh future decision dates and record
   the check; uncovered dates deliberately block new night entries. Calendar coverage currently ends 2027-12-31.
4. **Demotions/retirements:** the engine applies per-run stage demotions automatically. Sanity-check
   the review and events, fix platform/agent bugs, and apply any remaining whole-agent retirements.
   Judge standard runs once; do not count latency comparisons as independent evidence.
5. **Add agents** if due (above).
6. **Ship:** commit (`chore(agents): retire …`, `feat(agents): …`), `git push`, and run
   `ops/server/deploy-arena.sh` when strategy source, `roster.json` or arena runtime code changed. Journal
   and documentation-only updates publish through the dashboard push without restarting trading/recording. Then run
   `bun run review` again and check the live run count moved as expected and nothing failed to load.
7. **Journal:** add an entry at the top of `JOURNAL.md` (format below) and update the idea log; commit and
   push. The dashboard's Journal page updates with the push.
8. **Notify the user only when they must act:**
   `notify-send -a Trader -u critical "Trader: <what happened>" "<what they need to do>"`.
   The watchdog (`src/lab/watchdog.ts`, every 10 minutes) already covers outages between visits.

## Journal entry format

```
## 2026-10-12 (Mon) — demo day 5
- Health: all green / what broke and what was done
- Verdicts: early 241, keep 166, candidate 1, confirmed 0, retire 0; monkey sanity 0 of 36
- Retired: <agentId>:<EPIC>@<tier> (reason), …
- Added: <agent> — idea, instruments, variants, leverage tier; backtest median Sharpe
- Rejected: <idea> — why
- Next: what to watch
```

## Limits

- Broker: 9 accounts × 50 runs = 450 mirrored runs, 50 per leverage tier. Capital.com allows 10 demo
  accounts per login and the user keeps Visi. Beyond 50 runs on a tier, promotion/demotion decides who trades
  real demo orders.
- Virtual: ≤5,000 live runs including execution comparisons and arena memory under ~500 MB (the review shows both).
- Capital.com request budget is shared by everything on the login; more agents mean bigger top-of-hour
  bursts. Watch the broker queue and errors in the review.
