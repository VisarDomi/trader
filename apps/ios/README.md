# Trader for iPhone

Native UIKit client for the existing Backtest → Virtual engine → Capital demo platform.
iOS 26, Swift 6 strict concurrency, NativeKit, no third-party app dependencies.

- Rankings, sort/search, independent virtual evidence, historical backtests and actual demo cashflows.
- Common-date benchmark excess, exposure/stop downside, quote-supported cost breakdowns and paused
  dependencies. Realized cash drawdown is labeled separately from virtual position risk.
- Inline trade charts and a native inspector: bid/ask, open/close, recorded decisions, executable
  P&L, price drawdown, quoted spread, cost waterfall and order timing. Capture gaps stay visible;
  unknown legacy costs stay unknown. Charts support horizontal scrubbing and both orientations.
- Strategy context: prior sessions, indicator/band/range/forecast charts, actual filter values,
  exact cutoffs and headroom gauges; retained inputs distinguished from historical reconstruction.
- Agent parameters/source, exact archived versions, run equity curves, trades and broker deals.
- Nine Arena accounts, explicit demo mirror/exclusion confirmations, execution comparisons.
- Platform status, resource hold, tick/storage health, Graveyard, journal and research.
- Portrait/landscape, Dynamic Type, cached first-frame navigation/scroll restoration and foreground refresh.

The app displays the phone's saved copy immediately. Networking, JSON parsing, sorting, formatting and
cache encoding run on an actor/background writer. Refreshes wait while a list is dragged or decelerates.
Cached data is bounded; backgrounding saves state and stops polling. External research links open the
system browser; platform screens are native views.

## Build and delivery

Start with [shared Mac access](/home/visar/Documents/environment/mac-access.md),
[NativeKit](/home/visar/Documents/work/ios-tools/native/README.md) and
[renewal](/home/visar/Documents/work/ios-tools/renewal/README.md). Linux is canonical; the one-way
Mac mirror is `~/Developer/trader/apps/ios`. Use trusted `ssh mac`, not a fixed network address.

```sh
python3 apps/ios/scripts/deploy.py sync
python3 apps/ios/scripts/deploy.py simulator
ios-push trader --source /home/visar/Documents/work/trading/trader
ios-push status JOB
```

Use the durable shared `ios-push` queue for ordinary phone updates; only an `installed` job is
verified delivery. It retains renewal dates and resumes after reboot/network recovery. The older
`deploy.py` helper remains available for initial provisioning. Signing runs attached in the logged-in Mac GUI session under the shared
signing lock. The team and primary device come from the Mac's private `ios-tools.local.json`.
The signed artifact is `build/Release-iphoneos/Trader.app`, identity `com.visar.Trader.paid`.
The queue installs in place without launching or driving the phone UI. Pairing is already stored
in the phone Keychain. Never uninstall for an update.

`scripts/renewal.py` registers the app with the shared paid monthly renewal runner. A successful
delivery approves its exact build inputs; installation enables only `com.visar.renewal.trader`.
Generated products/private inputs stay ignored. Source revision is embedded in the app's Info.plist
and written to its small runtime diagnostic, so a launched phone build can be verified.

## Native access

The website keeps its Authelia login. Exact `/api/native/v1/…` paths use their own dedicated device-key
authentication in the Trader UI service. The credential is limited to the native read resources and
the existing demo mirror/exclude actions. NativeAPI handlers validate requests and do not forward
arbitrary paths. Actual demo evidence and virtual curves have separate labels.

```sh
python3 ops/server/native-access.py prepare
# Publish/restart trader-ui through its normal committed-source deployment.
python3 ops/server/native-access.py edge
```

Preparation creates `Private/primary-phone.json` (mode 600) and stores only its SHA-256 credential
hash in the private runtime UI environment. The edge operation first checks the authenticated API,
patches only Trader's current live block, validates it, detects concurrent edits and hot-reloads it;
other routes retain their sign-in policy. Anonymous native access returns 401.

No API key is compiled into the app. Delivery copies the bootstrap into `Documents/TraderPairing.json`
through the paired developer connection. On the phone, first launch moves it to the device-only
Keychain and removes the bootstrap. The unsigned simulator uses a protected test-only credential
file; that branch is absent from phone builds. Capital credentials and `ARENA_TOKEN` stay on the server.
Pairing/signing data, app products, raw test captures and live-device records must never enter Git.

## Checks

```sh
bun test apps/ui/src/lib/server/native-contract.test.ts
# Run native compilation/domain checks through mac-workload in the logged-in GUI session.
# In a guarded session on the explicit shared guest, with a private derived-response fixture:
python3 scripts/check-simulator.py --device UUID --fixture /tmp/trader-fixture.json --strategy
```

The simulator uses the isolated `com.visar.Trader.qa` bundle and x86_64-only compilation.
Simulator builds expose NativeKit test hooks at Mac loopback 8765. Extra actions choose a tab/screen,
set interface orientation, scroll to the top, refresh and simulate offline responses. They compile out
on the phone. Captures go to `/tmp/trader-native-qa`; verify live screens, portrait/landscape, exact old
source, offline reading and first-frame restoration. Run one simulator at a time and shut it down
after the batch. No video playback or demo mutations are part of these tests.

Builds self-enter the shared mac-workload guard; signing locks and two compiler jobs remain in place.
Follow the current MAC-WORKLOADS.md before QA: build with all guests shut down, use a separate
trader-validation mirror for simulator tests, run only the exact owned guest under a guarded visible
session, and use apple-tool instead of launcher stubs. Never substitute physical-phone automation
for a simulator failure. Explicit in-place delivery to an unlocked phone remains a separate operation.

Native frame spans: `trader.cell`, `trader.list.apply`, `trader.chart`. Runtime files are under
`Library/Application Support/Trader/`; `diagnostic.json` identifies the launched source and loaded
screen without including credentials. NativeKit's `debug-state.json` records navigation/frame reports
on resign. Phone frame measurements are distinct from the slower Mac simulator's rendering.

## Delivery — November 8, 2026 · strategy context

- Native setup charts and threshold gauges installed in place through job
  `20261108T112706Z-7fa16ca4ba`, source `b64db55`, input hash `e441595469a833f4`.
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

## Delivery — November 8, 2026

- Native trade charts/inspector delivered through durable job `20261108T100131Z-e357947495`,
  source commit `2314d79`, input hash `d959f4df4632319b`. Signed paid app installed in place on the
  first attempt and approved for renewal. The queue did not launch or drive the phone UI.
- Ten Swift domain tests and simulator/device builds pass. Native price, cost, decision and
  partial-history screens visually checked in portrait/landscape with bounded derived fixtures.
  Exact cold restoration from the first sampled frame through eight seconds and warm return pass;
  fixed saved-screen offline loading and persisted the connection notice. QA bundle uninstalled,
  shared guest/owned GUI shut down, temporary fixture removed; no new panic/GPU reset reported.
- Public authenticated run data includes inline inspections; anonymous native access remains 401.
  Native run pages preserve per-strategy demo exclusion, same-code backtest links and agent identity.
  Chart capture gaps, read limits and unrecorded costs/fill prices remain explicit.

## Delivery — October 29, 2026

- Signed ARM64 and unsigned simulator builds pass; six Swift domain tests pass. Source `55c99bbd1d99b77a`.
- Installed wirelessly in place on the unlocked primary phone. Its diagnostic confirms this source,
  live responses and 501 actual-demo history rows. Pairing bootstrap removed; November 25 renewal retained.
- New simulator screen/restoration QA is incomplete: the existing guest reported Data Migration Failed
  before app checks. Stopped the guarded session, verified guest/GUI cleanup and no new panic/GPU-reset
  report. No fresh boot, device erase or physical-phone UI test was substituted. Mobile web evidence
  views were checked at portrait and landscape widths; the earlier native baseline below remains historical.

## Verified delivery — October 25, 2026

- Unsigned simulator and paid ARM64 device builds pass; signed source revision `925c0a25fbd99af3`.
- All native screens, portrait/landscape interface geometry, archived source and offline reading pass.
- Cold restore is exact from the first recorded frame through eight seconds; warm return is exact.
- Four Swift domain tests and three API authorization/validation tests pass; Svelte diagnostics clear.
- Installed wirelessly in place on the unlocked primary iPhone and launched. The actual phone's
  diagnostic reports the matching revision, live network data and 501 actual-demo history records.
- The temporary pairing file was removed after successful device Keychain import. API access without
  the device key returns 401; ordinary website requests retain their Authelia redirect.
- First monthly renewal completed successfully, with the next due date November 25. Simulator shut down.

The signed IPA is generated locally at `build/Trader.ipa` and is not committed. Test captures and
device credentials remain private. The 501 demo records include past assignments; the broker still
has 450 active assignments. Correlated virtual cohorts have no independent strategy verdicts.
