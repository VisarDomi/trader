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
- Agent ids are `<file>` or `<file>/<variant>` (e.g. `ema-cross/fast`); demo run ids are
  `demo:<agentId>:<epic>:<codeHash>`.
- Pages: `/` leaderboard (Demo, Backtest, Overfit views), `/agents`, `/agents/<id>` (versioned
  source), `/runs/<id>`, `/broker` (accounts, mirrored runs, deals), `/status`.
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

Push `main`. The veron3 deploy watcher on the server builds `apps/ui` and restarts
`trader-ui.service` (`node apps/ui/build/index.js`, env in `/home/erdal/trader-ui/.env`).
