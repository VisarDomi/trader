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
