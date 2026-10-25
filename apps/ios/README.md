# Trader for iPhone

Native UIKit client for the existing Backtest → Virtual engine → Capital demo platform.
iOS 26, Swift 6 strict concurrency, NativeKit, no third-party app dependencies.

- Rankings, sort/search, independent virtual evidence, historical backtests and actual demo cashflows.
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
python3 apps/ios/scripts/deploy.py build
python3 apps/ios/scripts/deploy.py install
```

`all` builds and installs. Signing runs attached in the logged-in Mac GUI session under the shared
signing lock. The team and primary device come from the Mac's private `ios-tools.local.json`.
The signed artifact is `build/Release-iphoneos/Trader.app`, identity `com.visar.Trader.paid`.
The installer requires a real unlocked-device check, installs in place, seeds the dedicated connection
through the app's data container and launches it. Never uninstall for an update.

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
ssh mac 'cd ~/Developer/trader/apps/ios && swift test --scratch-path build/LogicTests'
ssh mac 'python3 ~/Developer/trader/apps/ios/scripts/check-simulator.py --device <booted-simulator-id>'
/home/visar/Documents/work/ios-tools/native/scripts/restore-check com.visar.Trader.paid
```

Simulator builds expose NativeKit test hooks at Mac loopback 8765. Extra actions choose a tab/screen,
set interface orientation, scroll to the top, refresh and simulate offline responses. They compile out
on the phone. Captures go to `/tmp/trader-native-qa`; verify live screens, portrait/landscape, exact old
source, offline reading and first-frame restoration. Run one simulator at a time and shut it down
after the batch. No video playback or demo mutations are part of these tests.

Native frame spans: `trader.cell`, `trader.list.apply`, `trader.chart`. Runtime files are under
`Library/Application Support/Trader/`; `diagnostic.json` identifies the launched source and loaded
screen without including credentials. NativeKit's `debug-state.json` records navigation/frame reports
on resign. Phone frame measurements are distinct from the slower Mac simulator's rendering.
