#!/usr/bin/env bash
# Nightly lab job: fresh candles -> forecasts for any new agent -> backtests for new/changed agents.
# Runs inside trader.slice (50% CPU/RAM cap). Safe to run by hand.
set -uo pipefail
cd "$(dirname "$0")/../../apps/backend"
echo "== ingest $(date -Is)"
bun run ingest || echo "ingest failed (continuing)"
echo "== forecasts $(date -Is)"
bun run forecasts || echo "forecasts failed (continuing)"
echo "== backtest $(date -Is)"
bun run backtest || echo "backtest failed"
echo "== push cached results $(date -Is)"
bun run backtest --push-only || echo "push failed"
echo "== done $(date -Is)"
