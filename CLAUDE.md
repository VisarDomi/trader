# Trader Monorepo

npm workspace monorepo containing the trading agent framework and its dashboard.

## Structure

```
apps/ui/       — SvelteKit dashboard (adapter-node)
apps/backend/  — Bun agent runner framework
packages/shared/ — Shared types (@trader/shared)
```

## Workspaces

- `@trader/ui` — SvelteKit frontend, see `apps/ui/CLAUDE.md`
- `@trader/backend` — Bun backend, see `apps/backend/CLAUDE.md`
- `@trader/shared` — Shared TypeScript types (API contract)

## Commands

```bash
npm install              # install all workspaces
npm run build -w apps/ui # build the UI
npm run dev -w apps/ui   # dev server for UI

cd apps/backend
bun run dev              # dev server for backend
bun test                 # run backend tests
```

## Deploy

Push to `main` — the deploy script builds `apps/ui` and deploys to Hetzner.
