# Trader UI

SvelteKit dashboard for the trader-backend agent runner framework. Deployed at https://trader.veron3.space (Authelia-protected).

## Stack

- **SvelteKit** with adapter-node (SSR)
- **Svelte 5** runes (`$props`, `$state`, `$derived`)
- **lightweight-charts** v5 for equity curve charts
- **TypeScript** throughout
- Dark theme with CSS custom properties

## Architecture

```
SvelteKit server (port 3005)
  └─ proxies API calls server-side ─→ trader-backend (via tunnel, port 4100)
```

The trader-backend is never directly exposed to the internet. All API calls go through `$lib/server/api.ts` which reads `BACKEND_URL` from `$env/static/private`.

## Key Files

- `src/lib/types.ts` — Mirrored types from trader-backend
- `src/lib/server/api.ts` — Server-only API client (all backend calls)
- `src/lib/utils/format.ts` — Currency, percent, duration formatters
- `src/lib/components/` — EquityChart, MetricsGrid, FillsTable
- `src/app.css` — Global dark theme with CSS variables

## Routes

| Route | Page |
|-------|------|
| `/` | Leaderboard — sortable, filterable |
| `/agents` | Agent list with search |
| `/agents/[...id]` | Agent detail + runs (rest param for slashed IDs) |
| `/runs/new` | Run launcher form |
| `/runs/[id]` | Run detail — metrics, equity chart, fills |
| `/status` | System health + instruments |

## Environment Variables

### Build time (`.env` in repo root)
- `BACKEND_URL` — trader-backend URL (default: `http://localhost:3001`)

### Server (`.env` on Hetzner at `/home/erdal/trader-ui/`)
- `PORT=3005`
- `HOST=127.0.0.1`
- `ORIGIN=https://trader.veron3.space`
- `BACKEND_URL=http://localhost:4100` (tunnel to local PC)

## Development

```bash
npm install
npm run dev        # http://localhost:5173, proxies to localhost:3001
npm run build      # outputs to build/
node build         # production server
```

## Deployment

Push to `main` → auto-deployed by veron3 watcher within ~2 minutes.

- Systemd service: `trader-ui`
- Server path: `/home/erdal/trader-ui/`
- Caddy: `trader.veron3.space` → `localhost:3005` (Authelia-protected)

## Blocked

API calls will fail until VERON3CLOU-13 (FOSS tunnel) connects the Hetzner server to the local trader-backend.
