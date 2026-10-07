# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- **Lifecycle stage column** on the demo leaderboard (early / keep / leader / retire, reason on hover), from the shared policy in `@trader/shared`.
- **Journal page** — the babysitter's visit log (`apps/backend/agents/JOURNAL.md`, bundled at build) and a summary of how agents move between stages.

### Changed
- **v2 dashboard** for the arena: Demo / Backtest / Overfit leaderboards with a luck band from the control agents, agent pages with versioned source, run pages with equity, trades, logs and broker deals, a status page, and tokens validated for light and dark mode. Data comes server-side from the arena API (`$lib/server/arena.ts`).
- **Broker page covers many demo accounts** — accounts with balance, allocation, mode (hedging/netting) and slots; coverage and capacity; per-run account and an Exclude/Allow action; deals show their account. The nav item is now "Broker".

## 2026-02-13

### Added
- Blueprint-first run launcher — select a blueprint, toggle dimension values (chip UI), see matching agent count, batch-submit
- Behavior grouping on leaderboard — agents grouped by algorithm family, click to expand dimensions
- Behavior cards on agents page — collapsed view with dimension count and feed types, expandable detail table
- Behavior breadcrumb on agent detail page with sibling count
- Initial project scaffolding with SvelteKit + adapter-node
- Dark-themed trading dashboard UI
- Leaderboard page with sortable metrics and instrument/mode filters
- Agents list page with search and agent detail view
- Run detail page with metrics grid, equity curve chart, and fills table
- Run launcher form for backtest/paper/live modes
- System status page showing backend health and instruments
- Equity curve chart using lightweight-charts v5
- Server-side API proxy (backend never directly exposed)
- Deploy configuration for veron3 auto-deploy system
- Caddy reverse proxy with Authelia SSO protection
- Umami analytics tracking
- Uptime Kuma monitoring with Telegram alerts

### Fixed
- API client now handles unreachable backend gracefully instead of crashing on non-JSON responses
- CSP headers allow SvelteKit inline scripts and Umami analytics
- Switched to dynamic env for BACKEND_URL (runtime instead of build-time)
- All formatters handle Infinity, null, and undefined values (e.g. profitFactor=∞ when no losses)
