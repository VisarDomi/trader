# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Ship the native UIKit Trader iPhone client with adaptive portrait/landscape screens, cached
  navigation/scroll restoration, all trading stages, run/account/history/research views and device-key
  provisioning. The dedicated API keeps actual demo evidence and correlated comparisons distinct.

- Provide an authenticated native-client API with dedicated device credentials, bounded record
  responses, separate actual/virtual evidence and allowlisted demo controls. Server trading credentials
  remain private; website sign-in stays unchanged.

- Add Graveyard: searchable archived versions and decommissioned agents, dates/reasons/results,
  preserved source and run links, and a platform history timeline. Keep active and comparison results
  distinct; source links open the exact archived hash. Run details show durable retirement reasons.

- Show recorded/synthetic/mixed tick provenance and replay assumptions, engine-version mismatches,
  recorder health, and whole-project two-year storage projections against the 100 GB budget.
- Keep the Status instrument table inside its scroll container on small screens.

- Label explicit user-requested demo admissions as “user experiment” on the leaderboard, including
  assigned runs that are still waiting for their first qualifying trade.
- Separate Backtest, Virtual engine and Capital demo results; add execution scenario filters, pagination and resource/parity measurements on Status.

### Added
- **Research tab** — the research report, one page per topic note and a searchable library of every source, from the repo's `research/` folder (bundled at build). Saved papers and page snapshots are served from the server's `research/files` (not in git; `ops/server/sync-research.sh`). Notes render with tables; citations like `[leverage-03]` link to the library.
- **Leverage page** — runs, mirroring and median return per leverage tier and account, the leverage ladder (return and drawdown per tier), and the 1:1 share basket against US100.
- **Leverage on every run** — a Lev. column and filter on the leaderboard (`?leverage=` works too), the tier on run pages and the broker page's accounts and runs.
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
