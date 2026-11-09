# Trader UI

SvelteKit 5 (runes) dashboard for the arena. Deployed at `https://trader.veron3.space` behind
Authelia. Repo-wide map and hard rules: [`../../setup.md`](../../setup.md); what the arena does:
[`../backend/ARCHITECTURE.md`](../backend/ARCHITECTURE.md).

## Read on demand

- Frontend guide: `~/Documents/archive/memory/svelte5-pitfalls.md`
- Overflow rule: `~/Documents/archive/memory/overflow.md`
- Headless UI: `~/Documents/archive/memory/headless-ui.md`
- [`CHANGELOG.md`](CHANGELOG.md)

## Notes

- All data comes from the arena API, server-side through `$lib/server/arena.ts`. The browser never
  talks to the arena or to Capital.com. Mutations (broker mirror on/off, exclude a run) are form
  actions that send `ARENA_TOKEN`.
- Trade inspection reads use `$lib/server/inspection.ts` → loopback `trader-inspector:4140`,
  a separate bounded, read-only archive worker. Native and web share its stable trade keys, costs
  and coverage; missing quotes never become an exact intratrade risk claim.
- API types come from `@trader/shared` (`packages/shared/src/types.ts`); change them together with
  `apps/backend/src/arena/api.ts`.
- The leaderboard refreshes visible tabs every 30 seconds and retries failed loads after five seconds,
  without overlapping refreshes. Optional count/evidence outages preserve rows. A failed primary read
  may show an explicitly timestamped last-success summary for up to ten minutes. The server cache is
  memory-only, capped at six pages / 16 MiB serialized; it holds no orders, credentials or tick tape.
- Agent ids are `<file>` or `<file>/<variant>` (e.g. `ema-cross/fast`); demo run ids are
  `demo:<agentId>:<epic>:<codeHash>`.
- Pages: `/` leaderboard (Backtest, Virtual engine, Capital demo, Overfit views), `/agents`, `/agents/<id>` (versioned
  source), `/runs/<id>`, `/broker` (accounts, mirrored runs, deals), `/leverage`, `/journal`, `/research`
  (report, topic notes, library; files from `RESEARCH_DIR`, default `./research` on the server), `/status`,
  `/graveyard` (decommissioned agents, archived versions/runs, retirement reasons and platform history).
- Colors and chart styling come from the tokens in `src/app.css` (light and dark); use those rather
  than new hex values.

## Night Lab PWA

`/night-lab/` redirects to the standalone installable `/night-lab/index.html` report. It has its own
manifest and service-worker scope and uses the ordinary Trader hosting/authentication; it needs no
extra server. Both full/central-session risk matrices and trade paths are expanded for the selected gap. All
0/5/15/30bp gap summaries remain visible together; CSV/JSON exports contain all5,184settings. The historical
study is frozen to January 2024–September 2026; `/night-lab/forward.json` updates only the twenty
current cohort rows. Partial/outage responses preserve the bounded last complete snapshot offline.
Each historical strategy and dashed chart benchmark uses its own instrument's 1:1 hold:
US500 against US500, US100 against US100, on the same dates and with zero overnight funding.

Published assets are in `static/night-lab/`. Rebuild from the retained private study inputs with
`python3 ops/lab/build-night-lab.py` at the repo root, inside trader.slice. Source template/worker
are under `ops/lab/`; generated assets contain derived research and public market facts, never
credentials, account identifiers or captured raw ticks. Current constituent purchase estimates
are snapshots, not a reconstruction of historical index membership. Source URLs/as-of dates,
whole-share assumptions, CFD coverage gaps and benchmark limitations remain in the report.

Research source: `apps/backend/src/lab/night-study/`. `replay.ts EPIC SHARD` produces the central
window control grids (two shards per instrument); `ops/lab/night_study_data.py` independently joins
signals, features, context and ledgers. `gap-replay.ts EPIC full|central` evaluates all four gap
minimums and refuses results unless every zero-gap financial control exactly matches the full
strategy replay. Run the Python preparation again after gap replays, then publish with the builder.
Raw derived inputs stay in `apps/backend/data/night-session-study-20261109/`; existing full-window
inputs remain in `night-breakdown-20261109/`. All heavy work belongs inside trader.slice.

Major-event context lives in `research/night-lab-events.json`, with scheduled policy dates from the
SDK calendar. It is curated historical context, not a live/exhaustive news feed or trading filter.
Unknown timing stays unknown; source links and rarity counts are visible. Calendar updates must not
be chosen by trade P&L or mark every routine release as major. The generator caps flagged-session
share at15% and retains source/execution timing distinctions.

## Develop

```sh
npm install                 # once, at the repo root (workspaces)
npm run dev                 # needs .env: ARENA_URL=http://127.0.0.1:4120 (via trader-tunnel) and ARENA_TOKEN
npm run check               # svelte-check
npm run build               # adapter-node build in build/
```

## Deploy

Push `main`. The shared veron3 deploy watcher builds `apps/ui` from the committed source and publishes
to the PC runtime, restarting `pc-server-trader-ui.service`. The runtime/env now live under
`~/.local/share/hetzner-pc/mirror/home/erdal/trader-ui`; Hetzner hosts only the public edge.
