#!/usr/bin/env bash
# Nightly lab job: fresh candles -> daily history for the arena -> forecasts for any new agent -> backtests for new/changed agents.
# Runs inside trader.slice (50% CPU/RAM cap). Safe to run by hand.
set -uo pipefail
cd "$(dirname "$0")/../../apps/backend"
echo "== ingest $(date -Is)"
bun run ingest || echo "ingest failed (continuing)"
echo "== daily history to the arena $(date -Is)"
bun run push-history || echo "history push failed (continuing)"
echo "== forecasts $(date -Is)"
bun run forecasts || echo "forecasts failed (continuing)"
echo "== backtest $(date -Is)"
bun run backtest || echo "backtest failed"
echo "== push cached results $(date -Is)"
bun run backtest --push-only || echo "push failed"
echo "== done $(date -Is)"
