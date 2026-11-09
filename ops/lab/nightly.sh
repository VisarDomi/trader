#!/usr/bin/env bash
# Nightly lab job: fresh candles -> daily history for the arena -> forecasts for any new agent -> backtests for new/changed agents -> Visar night paper grid.
# Runs inside trader.slice (50% CPU/RAM cap). Safe to run by hand.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
source "$REPO/ops/server/runtime.sh"
cd "$REPO/apps/backend"
echo "== ingest $(date -Is)"
bun run ingest || echo "ingest failed (continuing)"
echo "== daily history to the arena $(date -Is)"
bun run push-history || echo "history push failed (continuing)"
echo "== tick archive $(date -Is)"
bun run sync-ticks --flush || echo "tick archive failed (continuing)"
echo "== storage budget $(date -Is)"
bun run storage --refresh || echo "storage report failed (continuing)"
echo "== forecasts $(date -Is)"
bun run forecasts || echo "forecasts failed (continuing)"
echo "== backtest $(date -Is)"
bun run backtest || echo "backtest failed"
echo "== push cached results $(date -Is)"
bun run backtest --push-only || echo "push failed"
echo "== night paper grid $(date -Is)"
# Every meaningful Visar night setting (336 per index) replayed on data after the study window; paper only.
if bun run night-grid; then
  if "$TRADER_PC_ACTIVE"; then
    # The dashboard serves trader-ui/night-grid; PC deploys copy that folder forward.
    dest="$TRADER_SERVER_ROOT/trader-ui/night-grid"
    mkdir -p "$dest"
    for f in data/night-grid/US500.json data/night-grid/US100.json; do
      cp "$f" "$dest/.$(basename "$f").partial" && mv "$dest/.$(basename "$f").partial" "$dest/$(basename "$f")"
    done
  fi
else
  echo "night grid failed (continuing)"
fi
echo "== done $(date -Is)"
