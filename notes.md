# Trader Monorepo

npm workspace monorepo containing the trading agent framework and its dashboard.

## Structure

- `apps/ui/` — SvelteKit dashboard
- `apps/backend/` — Bun agent runner framework
- `packages/shared/` — shared types

## Read

- Shared deploy playbook (public edge, PC runtime):
  `~/Documents/archive/memory/hetzner-deploy.md`

## Routes

- UI:
  `~/Documents/work/trading/trader/apps/ui/`
- Backend:
  `~/Documents/work/trading/trader/apps/backend/`


## Commands

- `npm install`
- `npm run build -w apps/ui`
- `npm run dev -w apps/ui`
- `cd apps/backend && bun run arena` (the arena service; the live one is `pc-server-trader-arena`, so do not start a second one on the same login)
- `cd apps/backend && bun test`
