# Agent lifecycle and the babysitter runbook

How agents enter, move through and leave the arena, and what Claude does on each scheduled visit.
Repo-wide hard rules come first: [`../../../setup.md`](../../../setup.md). Writing an agent:
[`GUIDE.md`](GUIDE.md). What happened so far: [`JOURNAL.md`](JOURNAL.md).

## Stages

| Stage | What it means | How a run gets there |
|---|---|---|
| Backtest | 2024-01 → 2026-09 on the lab PC | every new agent; only clearly broken ideas stop here |
| Demo | paper trading on live demo prices, $10,000 per instrument | every agent that passed the backtest gate |
| Broker | the same trades as real demo orders on the "Arena" account of the run's leverage (0.2× size) | best demo equity first, 50 runs per account; when an account is full, a run of its leverage $200 ahead of the weakest mirrored one takes its slot once that one is flat (automatic, `src/arena/broker.ts`) |
| Retired | gone from the arena; its record stays on the dashboard (leaderboard → retired) | the verdicts below, applied by the babysitter |

Control agents (`random-baseline` monkeys, `buy-hold`, `leverage-ladder`) are never judged or retired: they
are the yardstick. There is no live-money stage, by design.

## Verdicts

Computed by `packages/shared/src/lifecycle.ts`, shown in the dashboard's Stage column and by `bun run review`.

| Verdict | Rule |
|---|---|
| early | fewer than 30 closed trades or fewer than 28 days live (slow agents: judged at 90 days with ≥ 10 trades) |
| retire | judged and trade t-statistic ≤ −1; or no trades in 60 days; or busted; or stopped on errors |
| leader | judged, t ≥ 2 and a higher t than every random monkey on the same instrument |
| keep | judged, anything else |

An agent with no edge pays the spread on every trade, so its t-statistic drifts below zero as trades
accumulate: −1 retires most no-edge runs within a few months while rarely retiring a real edge.
"Leader" is a strong claim with ~400 runs: about 2% of no-skill runs reach t ≥ 2 by luck. The review's
monkey sanity line shows how many random monkeys would pass the bar; if that is not ~0, distrust leaders.
Leaders are compared on t, not return, because the return grows with position size and runs trade at
different leverages; the t-statistic does not.

Do not change these thresholds casually. If the evidence says they are wrong (e.g. monkeys keep passing
the leader bar), change them in `lifecycle.ts` and explain why in the journal.

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

## Leverage

Each Arena account has one leverage (`accounts` in `agents/roster.json`); the arena sets it on the account
and mirrors only runs of that leverage there. Each agent runs at the tiers in `leverage.agents` (by agent
id or file slug), else those declared in its file, else `leverage.default`.

| Account | Arena 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 |
|---|---|---|---|---|---|---|---|---|---|
| Leverage | 1:1 | 1:2 | 1:3 | 1:5 | 1:10 | 1:20 | 1:50 | 1:100 | 1:200 |

Starting allocation (2026-10-07): agents sorted by how much leverage they used in backtests (90th
percentile of position ÷ equity), the least on 1:1 and the most on 1:200, about 50 runs per account; the
leverage ladder on all nine; buy-and-hold (with the share basket) on 1:1. Agents that size by risk rarely
use more than 5–10×, so on the 1:50–1:200 accounts they trade as they would at 1:20: only the ladder and
agents that size with `marginPct` use the high leverage.

- **New agents:** give each one a tier in `leverage.agents`: the lowest tier above what `check-agent`
  reports as its leverage use (90th percentile), or the tier its idea is about. Prefer accounts with free
  slots (`review` shows runs per tier).
- **Keep each tier near 50 runs**, the account's capacity; beyond that, promotion decides who is mirrored.
- **Moving an agent to another tier** retires its runs at the old tier and starts new ones; do it rarely and
  say why in the journal. Changing an account's tier moves every run on it.
- Never change an Arena account's leverage in Capital.com: the arena sets it back from the roster.
- Leverage questions worth answering over time: does any strategy do better unleveraged at 1:1 (no fees on
  crypto and shares) than on its usual tier? Which ladder rungs survive? Do high-leverage agents (tight
  stops, `marginPct` sizing) belong on 1:100–1:200? Record findings in the journal.

## Adding agents

- **When:** at most every 7 days (Monday visits), and only while live runs plus the new ones stay ≤ 600
  (arena memory on the shared server; `review` shows the room left).
- **How many:** 1–3 agents per addition, each with at most 3 variants that differ meaningfully.
- **What:** ideas with a reason to work that does not come from our backtest: documented market effects
  (time-series momentum, short-term reversal, volatility breakouts, opening-range and session effects,
  overnight and turn-of-month drift, volatility-regime filters, funding-aware holding), new mechanisms not
  yet on the leaderboard, and TimesFM used for volatility or uncertainty rather than direction (see the
  note in `GUIDE.md`). Prefer families that are under-represented. A leader may inspire a related but
  distinct idea (another timeframe or mechanism), never a parameter tweak of itself.
- **Before writing,** read the idea log at the end of `JOURNAL.md`. Do not repeat a retired or rejected idea
  unless the new version is substantially different and the journal says why.
- **Parameters** are chosen up front (round numbers, textbook defaults). No backtest-driven tuning.
- **Leverage** tier chosen as in [Leverage](#leverage) and written to `agents/roster.json`.
- **Instruments** are chosen up front, where the mechanism makes sense. Do not drop instruments because
  their backtest looked bad.
- **Gate:** `bun run check-agent agents/<file>.ts` passes; for forecast agents run `bun run forecasts` first;
  then `bun run backtest <agent>` (heavy jobs inside `trader.slice`, see `../WORKFLOW.md`). Reject only if
  clearly broken: median backtest Sharpe across its instruments below −0.5, fewer than 20 trades per run on
  average, or busted runs. Log rejected ideas too.

## Each visit (runbook)

1. Read `../../../setup.md` (hard rules), this file, and the three newest entries of `JOURNAL.md`.
2. `cd apps/backend && bun run review`. Also `systemctl --user list-units 'trader*'` and, if last night's
   backtests matter, `journalctl --user -u trader-lab -n 40`.
3. **Health.** Fix what is broken and within scope (services, agent bugs, platform bugs; follow
   `../WORKFLOW.md`). If only the user can fix it (a demo account deleted or unfundable, credentials
   changed), notify them (step 8) and record it.
4. **Retire** what the review lists, after a sanity check of each reason.
5. **Add agents** if due (above).
6. **Ship:** commit (`chore(agents): retire …`, `feat(agents): …`), `git push`, and run
   `ops/server/deploy-arena.sh` when anything under `agents/` changed (including `roster.json`). Then run
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
- Verdicts: early 344, keep 0, leader 0, retire 0; monkey sanity 0 of 36
- Retired: <agentId>:<EPIC>@<tier> (reason), …
- Added: <agent> — idea, instruments, variants, leverage tier; backtest median Sharpe
- Rejected: <idea> — why
- Next: what to watch
```

## Limits

- Broker: 9 accounts × 50 runs = 450 mirrored runs, 50 per leverage tier. Capital.com allows 10 demo
  accounts per login and the user keeps Visi. Beyond 50 runs on a tier, promotion/demotion decides who trades
  real demo orders.
- Paper: ≤ 600 live runs and arena memory under ~500 MB (the review shows both).
- Capital.com request budget is shared by everything on the login; more agents mean bigger top-of-hour
  bursts. Watch the broker queue and errors in the review.
