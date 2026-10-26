#!/usr/bin/env bash
set -euo pipefail
NATIVE_DIR="$(cd "$(dirname "$0")" && pwd)"
cargo build --manifest-path "$NATIVE_DIR/Cargo.toml" --release --locked -j 2
case "$(uname -s)" in
  Linux) LIBRARY=libtrader_risk.so ;;
  Darwin) LIBRARY=libtrader_risk.dylib ;;
  *) echo 'Unsupported native risk build platform' >&2; exit 1 ;;
esac
TARGET_DIR="${CARGO_TARGET_DIR:-$NATIVE_DIR/target}"
cp "$TARGET_DIR/release/$LIBRARY" "$NATIVE_DIR/trader-risk.node"
# Check the actual runtime bridge as well as the C ABI; catches copied buffer views.
TRADER_RISK_BACKEND=native bun -e "await import('$NATIVE_DIR/../src/engine/risk-native.ts')"
