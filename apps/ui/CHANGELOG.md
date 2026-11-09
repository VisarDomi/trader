# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Show all four capital-profit exits alongside every existing Night Lab dimension, with exit-mix bars, target-hit counts,192charts and quote-path ranges. Reduce embedded data without rounding. Pin live/offline schema3 responses to exact source versions.

- Expand every Night Lab dimension without a selector: all5,184risk cases,48equity plots and the new source-specific forward cohort with window/filter/gap columns. Key offline cash snapshots to cohort identity.

- Keep manual and automatic UI builds inside the configured lab's `trader.slice` resource budget.
- Add full09:30–16:00 versus central10:30–15:30 NY recognition and minimum counter-moves of
  0/5/15/30bp. Show all gap summaries together, paired risk grids/curves, per-year evidence and
  ignored-edge trade paths; keep all5,184research settings in exports. Live cohort remains frozen.
- Annotate rare major policy/tariff/geopolitical/market dates with sources and honest timing.
  Keep retrospective/date-only labels separate from verified entry-time knowledge. Persist the
  selected gap in the URL and restore its report offline with one canonical cached asset.

- Match Night Lab comparisons by instrument: US500 strategies versus US500 1:1 hold and
  US100 strategies versus US100 1:1 hold. Update every excess value, curve and legend;
  show both hold summaries equally and retain zero-funding assumptions.

- Correct Night Lab Capital cash reads to use the arena’s actual-demo stage; pin exact cohort
  source/instrument/tier, retain archived members, and invalidate the earlier forward cache.
  A regression verifies distinct virtual and actual returns rather than accepting duplicated values.

- Add the standalone installable Night Lab report with both instruments, 648 visible risk cells,
  131 original-rule trade paths, the 20-agent forward cohort and a fee-free full-cash Nasdaq hold
  proxy. Show purchase-budget assumptions, matched broker minimums and missing listings explicitly;
  cache only bounded report assets and the last complete forward cohort for offline use.
- Preserve cohort search, filters, sorting and page across back/forward/reload and stage links.
  The `visar` alias finds the original and both new night families, keeping the older risk twin
  separately searchable. Native search dismissal cannot erase the saved query during navigation.

- Remove presentation clutter from native and web: methodology paragraphs, introduction cards,
  repeated headings, positive verification badges and refresh instructions. Keep charts, facts,
  numeric thresholds/deltas, recorded reasons and compact data-gap labels.

- Add strategy-specific context charts and filter gauges to the native inspector and PWA: previous NY
  session/overnight reference for night trading, trend/crossovers, oscillators/bands, breakout ranges,
  calendar windows, volatility allocation and retained forecasts. Show observed value, exact rule and
  headroom; label historical reconstruction and missing state/model inputs.

- Put results, charts and trades first; move methodology, extended filters and source/logs behind
  details. Add per-trade bid/ask, open/close markers, executable P&L, drawdown, spread, cost bars
  and recorded reasons. Native iPhone adds inline trade charts and a dedicated inspection screen;
  Capital cash and virtual risk remain separate, with incomplete history explicitly labeled.

- Recover leaderboard pages automatically after backend/deployment timeouts. Refresh visible tabs at
  30-second intervals, retry failures after five seconds, and serialize requests. Supporting endpoint
  failures no longer erase successful rows; a bounded ten-minute last-success summary is clearly
  timestamped during an outage. Missing scenario counts stay unknown. No trading mutations are retried.

- Add common-window excess-over-hold, actual virtual exposure, evidence/admission filters and family
  grouping. Run pages separate closed cash, quote-supported cost subsets, unknown legacy costs and
  frozen-trade stress diagnostics. Label dependency pauses, closed trades and realized-only cash DD.
  The native app presents the same evidence and supports excess-return sorting without changing its
  saved route identities. Keep actual broker cash and virtual diagnostics distinct.

- Refresh compatible dashboard dependencies: SvelteKit 2.70.3, Svelte 5.57.2, Vite 7.3.7 and patched
  serializers/build dependencies. Audit now has no moderate/high/critical findings. Four low-severity
  package entries remain (Kit/adapters/cookie); the Kit advisories concern enhanced catch-all form
  actions and untrusted prerender cache headers, neither used here. No forced Kit 3 migration.

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
