# Trader for iPhone — delivery log

Newest first. Each entry records what was delivered, how it was checked and how it reached the phone.

## November 25, 2026 · Manual Paper ↔ Demo & confirmed Demo ↔ Real stage controls

- Wired `POST /api/native/v2/stage` in `Store.swift` and `ScreenController.swift` so live run screens expose manual stage controls: immediate `Paper ↔ Capital demo` and one-way `Paper → Backtest` transitions (no confirmation prompt), and `UIAlertController`-confirmed `Capital demo ↔ Real (tracked)` transitions in both directions.
- Eight Linux Swift logic tests, 256 backend tests (plus native Rust checks), and 37 UI tests (`svelte-check` 0 errors) pass; `/api/native/v2/stage` exposed on Caddy via `ops/server/native-access.py edge`.
- Job `20261125T171605Z-e1b65ee3dd`, frozen source `6fd5fcc`: **installed** in place on the phone and approved for renewal.

## November 25, 2026 · 4-tab layout restored, SOTA briefs in Agents & Sharpe & Trust

- Restored the four-tab bar (`Rankings | Agents | Accounts | Explore`) and keyed saved navigation stacks by screen name (`navigation-<screen>.json`) instead of tab index, clearing legacy `navigation-0..4.json` files on startup so existing phones never shift tabs.
- Folded SOTA strategy briefs directly into **Agents** (Guides, SOTA strategy briefs, and verdict badges on active variants) and into each researched agent's detail screen; added a dedicated **Sharpe & Trust** entry point in both **Explore** and **Agents** with a native confirmation-years bar chart and clean plain-text cards (zero raw Markdown or LaTeX).
- Eight Linux Swift logic tests and 36 UI tests (`svelte-check` 0 errors) pass; `/api/native/v2/strategies` removed from Caddy via `ops/server/native-access.py edge`.
- Job `20261125T163322Z-022862c6ab`, frozen source `7eaa6d7`: **installed** in place on the phone and approved for renewal.

## November 25, 2026 · Strategies SOTA hub tab

- Added a dedicated **Strategies** tab (`Rankings | Strategies | Agents | Accounts | Explore`) backed by `/api/native/v2/strategies` and server-built strategy briefs (`document?id=strategy-<id>`). Each brief shows the SOTA verdict, best fit, expected edge, plain-English breakdown, implementation audit, tappable links to active Trader variants, and Safari source links.
- Future strategy briefs publish from `research/strategies/*.md` on push to `main` with no further iOS rebuild required.
- Seven Linux logic tests (including `.strategies` and `strategy-*` document routes) and 44 UI tests pass; `/api/native/v2/strategies` exposed on Caddy via `ops/server/native-access.py edge`.
- Job `20261125T132632Z-65761e325f`, frozen source `8bce3fc`: **installed** in place on the phone and approved for renewal.

## November 22, 2026 · server-built screens (API v2) and the SQLite store

- Screens come built from `/api/native/v2`; the phone stores each as one row of `trader.sqlite` and revalidates it by
  ETag. `responses.json` and `app-state.json` are deleted on first launch. Agents show every trade with paper and
  demo P&L and a mini price path; the trade screen shows the strategy's setup charts and the trade's price chart with
  the stop and the −50% / −100% equity lines.
- Seven Linux logic tests (wire decoding of a live trade screen, packed arrays, sort/search, routes, saved routes) and
  guarded simulator QA (`scripts/check-simulator.py` with a `screen-fixture.py` fixture) pass: all screens offline,
  `visar` search, portrait/landscape, the 787-trade agent list, exact cold/warm first-frame restoration. A one-sample
  blank of the bottom rows 0.5 s after relaunch was fixed (the header re-anchored the list without changing height).
- Job `20261122T024256Z-ef4d105254`, frozen source `13cc590`: signed and published as **awaiting_ota** (the Mac at the
  office could not reach the phone at home). The owner installed it from https://ios-apps.veron3.space/ the same
  night; the queue confirms the in-place install when the phone is next to the Mac again. API v1 was removed after.

## November 9, 2026 · Visar cohort navigation

- `visar` searches the 20-member US500/US100 cohort, including the unchanged original. The older
  small-risk twin remains separately searchable. Filtered counts show the actual matching rows.
- Saved query/sort survive detail, back, forward, rotation, foreground refresh and relaunch. Search
  dismissal during navigation cannot clear the stored filter. Header/notice layout and programmatic
  scroll restoration preserve the same focal row/fraction; intentional search edits reset to top.
- Twelve domain checks and guarded simulator compilation pass. The focused offline 21-row fixture
  (twenty cohort plus the older twin) verifies the twenty matches, sort, detail/back/forward, exact
  focal anchor, portrait/landscape and cold/warm return. QA bundle is uninstalled and the shared
  guest/owned GUI shut down. No physical-phone UI automation.
- Paid job `20261109T014034Z-3148a2ba42`, frozen source `a336937`, is **installed** in place and
  approved for renewal. The queue verified the artifact/device inventory and retained the renewal
  schedule; it did not launch or drive the phone UI.

## November 8, 2026 · content-only cleanup

- Removed generated introductions/methodology, repeated headings and positive verification badges;
  charts lead, numeric comparisons/deltas replace verbose filter tiles. Only essential data-gap labels
  remain. Native/web module AGENTS.md files persist this presentation rule.
- Eleven domain checks, simulator/paid builds, portrait/landscape, offline and exact cold/warm
  restoration pass. PWA 184be46 is live; no trading service restart or financial-data change.
- Job `20261108T123547Z-5688e0b951` is **awaiting_ota**, not installed: the Mac cannot reach the phone.
  Signed build is available at the existing tailnet installer; turn on Tailscale on the iPhone and
  open `https://mac.tailf47c4e.ts.net:8443/`, then Install Trader. Direct delivery retries automatically.

## November 8, 2026 · strategy context

- Native setup charts and threshold gauges installed in place through job
  `20261108T112706Z-7fa16ca4ba`, source `75dd9bb`, input hash `e441595469a833f4`.
  First delivery attempt succeeded; exact inputs approved for renewal. Phone UI was not launched.
- All 46 current strategy families / 66 variants have reviewed source-pinned adapters. Night trading
  shows the previous NY path, qualifying limits and overnight reference; other families show their
  relevant signals. Future standard entries retain bounded compressed context; old reconstructions,
  missing state/forecasts and unsupported source versions remain explicit.
- Eleven committed domain tests, simulator/device builds and native context/gauge visuals pass.
  Portrait/landscape and offline views checked. Fixed automatic-row text rounding; exact cold first
  frame through eight seconds and warm restoration pass with the larger strategy screens.
- Queue flagged unchanged NativeKit modules recompiling (178 seconds); delivery remained valid.
  Simulator/owned GUI shut down, QA app uninstalled and temporary fixture removed.

## November 8, 2026

- Native trade charts/inspector delivered through durable job `20261108T100131Z-e357947495`,
  source commit `cc3249d`, input hash `d959f4df4632319b`. Signed paid app installed in place on the
  first attempt and approved for renewal. The queue did not launch or drive the phone UI.
- Ten Swift domain tests and simulator/device builds pass. Native price, cost, decision and
  partial-history screens visually checked in portrait/landscape with bounded derived fixtures.
  Exact cold restoration from the first sampled frame through eight seconds and warm return pass;
  fixed saved-screen offline loading and persisted the connection notice. QA bundle uninstalled,
  shared guest/owned GUI shut down, temporary fixture removed; no new panic/GPU reset reported.
- Public authenticated run data includes inline inspections; anonymous native access remains 401.
  Native run pages preserve per-strategy demo exclusion, same-code backtest links and agent identity.
  Chart capture gaps, read limits and unrecorded costs/fill prices remain explicit.

## October 29, 2026

- Signed ARM64 and unsigned simulator builds pass; six Swift domain tests pass. Source `55c99bbd1d99b77a`.
- Installed wirelessly in place on the unlocked primary phone. Its diagnostic confirms this source,
  live responses and 501 actual-demo history rows. Pairing bootstrap removed; November 25 renewal retained.
- New simulator screen/restoration QA is incomplete: the existing guest reported Data Migration Failed
  before app checks. Stopped the guarded session, verified guest/GUI cleanup and no new panic/GPU-reset
  report. No fresh boot, device erase or physical-phone UI test was substituted. Mobile web evidence
  views were checked at portrait and landscape widths; the earlier native baseline below remains historical.

## October 25, 2026

- Unsigned simulator and paid ARM64 device builds pass; signed source revision `925c0a25fbd99af3`.
- All native screens, portrait/landscape interface geometry, archived source and offline reading pass.
- Cold restore is exact from the first recorded frame through eight seconds; warm return is exact.
- Four Swift domain tests and three API authorization/validation tests pass; Svelte diagnostics clear.
- Installed wirelessly in place on the unlocked primary iPhone and launched. The actual phone's
  diagnostic reports the matching revision, live network data and 501 actual-demo history records.
- The temporary pairing file was removed after successful device Keychain import. API access without
  the device key returns 401; ordinary website requests retain their Authelia redirect.
- First monthly renewal completed successfully, with the next due date November 25. Simulator shut down.
