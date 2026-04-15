# Trader Monorepo

npm workspace monorepo containing the trading agent framework and its dashboard.

## Structure

- `apps/ui/` — SvelteKit dashboard
- `apps/backend/` — Bun agent runner framework
- `packages/shared/` — shared types

## Read

- Hetzner deploy playbook:
  `~/Documents/memory/hetzner-deploy.md`

## Routes

- UI:
  `~/Documents/work/trading/trader/apps/ui/`
- Backend:
  `~/Documents/work/trading/trader/apps/backend/`


## Commands

- `npm install`
- `npm run build -w apps/ui`
- `npm run dev -w apps/ui`
- `cd apps/backend && bun run dev`
- `cd apps/backend && bun test`
