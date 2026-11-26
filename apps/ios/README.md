# Trader for iPhone

Native UIKit client for the existing Backtest → Virtual engine → Capital demo → Real USD platform.

Content only: charts, trade facts/reasons, values, dates, thresholds and necessary controls.
Generic guidance, repeated success badges and methodology prose stay out of the app.
iOS 26, Swift 6 strict concurrency, NativeKit, no third-party app dependencies.

- Rankings, sort/search, independent virtual evidence, historical backtests and actual demo cashflows.
- An agent shows every live record and every trade at once: paper P&L beside its Capital demo twin, the share of
  equity, the recorded reasons and a mini price path per trade. A record shows paper and demo together.
- A trade shows the strategy's setup charts (for the night rule: the NY session, then 16:00 → 21:27 New York) followed by the
  trade's own price chart with both fills, the stop and the −50% / −100% equity lines (listed as numbers when far).
- Every forward row's verdict on the daily clock (early, keep, candidate, confirmed, retire) with its t-statistic; the
  record's screen shows the bars it needs and whether it agrees with its backtest.
- The arena portfolio pinned above the Capital demo and Virtual rankings: every record picked by its backtest, judged
  as one record. Its screen shows its verdict and bar, when to expect the answer, its return and the records it holds.
- A Family section on the record's and the agent's screens: where the record ranks in its family, its t with the luck
  taken out, and the family judged as one record. It changes nothing in the record's own lines.
- How often a record's own backtest did as well or as badly over the same number of days, on every forward row; the
  record's screen draws every backtest period with the record's return across them.
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

Screens are built on the server (`apps/ui/src/lib/server/native`, API `/api/native/v2/<screen>`) and arrive ready
to draw: rows, numbers, charts as packed binary series. The phone keeps each screen as one row of
`Library/Application Support/Trader/trader.sqlite` (the server's bytes, their ETag and when they were confirmed),
shows that copy at once and revalidates it with If-None-Match: an unchanged screen is a 304 with no body, no decoding
and no redraw. A changed screen rewrites only its row. Decoding, sorting and search filtering run on the store's actor.
Refreshes wait while a list is dragged or decelerates. Up to 400 screens are kept; backgrounding stops polling.
Changing what a screen shows is a server change (push `main`); the app needs a build only when the wire format changes.
On launch the store deletes leftover `responses.json` and `app-state.json` files from older builds. External research
links open the system browser; platform screens are native views.

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
`deploy.py` helper is for initial provisioning. Signing runs attached in the logged-in Mac GUI session under the shared
signing lock. The team and primary device come from the Mac's private `ios-tools.local.json`.
The signed artifact is `build/Release-iphoneos/Trader.app`, identity `com.visar.Trader.paid`.
The queue installs in place without launching or driving the phone UI. Pairing is already stored
in the phone Keychain. Never uninstall for an update.

`scripts/renewal.py` registers the app with the shared paid monthly renewal runner. A successful
delivery approves its exact build inputs; installation enables only `com.visar.renewal.trader`.
Generated products/private inputs stay ignored. Source revision is embedded in the app's Info.plist
and written to its small runtime diagnostic, so a launched phone build can be verified.

## Native access

The website keeps its Authelia login. Exact `/api/native/v2/…` paths use their own dedicated device-key
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
bash apps/ios/scripts/test.sh   # TraderLogic tests on this PC (Swift for Linux); ios-push runs them first
# Run native compilation/domain checks through mac-workload in the logged-in GUI session.
# In a guarded session on the explicit shared guest, with a private derived-response fixture:
python3 apps/ios/scripts/screen-fixture.py /tmp/trader-v2-fixture.json      # on the PC: live v2 screens, private, outside git
python3 scripts/check-simulator.py --device UUID --fixture /tmp/trader-v2-fixture.json
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

Delivery records (jobs, source revisions, QA results) are in [`CHANGELOG.md`](CHANGELOG.md).

The signed IPA is generated locally at `build/Trader.ipa` and is not committed. Test captures and
device credentials remain private. The demo history includes past assignments; the broker has at most
450 active assignments. Correlated virtual cohorts have no independent strategy verdicts.
