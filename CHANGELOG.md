# Changelog

All notable changes to this project will be documented in this file.

## 2026-02-13

### Added
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
