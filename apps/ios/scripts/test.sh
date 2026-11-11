#!/bin/bash
# The app's logic tests (TraderLogic: rankings, routes, inspection and strategy logic) with SwiftPM. They run on the PC with Swift
# for Linux (ios-tools native/README.md, "Logic tests on the PC"); the Mac works too. ios-push runs
# this before queuing a push.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=../Kit/Linux/swift-env.sh
source Kit/Linux/swift-env.sh
"${SWIFT[@]}" test -j "$JOBS" --scratch-path build/LogicTests "$@"
