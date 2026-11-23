#!/usr/bin/env bash
# Shared target discovery for the arena deploy, research sync, lab installer, nightly job and lab units.
# The shared server's SSH target and its user's home stay out of git: TRADER_SERVER_SSH and
# TRADER_SERVER_HOME come from the environment or the untracked apps/backend/.env.
_trader_env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/apps/backend/.env"
_trader_env_value() { [[ -f "$_trader_env_file" ]] || return 0; sed -n "s/^$1=//p" "$_trader_env_file" | tail -n 1 | tr -d "\r\"'"; }
TRADER_SERVER_SSH="${TRADER_SERVER_SSH:-$(_trader_env_value TRADER_SERVER_SSH)}"
TRADER_SERVER_HOME="${TRADER_SERVER_HOME:-$(_trader_env_value TRADER_SERVER_HOME)}"
TRADER_PC_STATE="$HOME/.local/share/hetzner-pc"
TRADER_PC_ACTIVE=false
TRADER_SERVER_ROOT=""
if [[ -z "$TRADER_SERVER_HOME" ]]; then
  echo "TRADER_SERVER_HOME is not set (apps/backend/.env, see .env.template)" >&2
  return 1 2>/dev/null || exit 1
fi
TRADER_SERVER_ROOT="$TRADER_SERVER_HOME"
if [[ -f "$TRADER_PC_STATE/ACTIVE" ]]; then
  # The PC runtime mirrors the server user's home.
  TRADER_PC_ACTIVE=true
  TRADER_SERVER_ROOT="$TRADER_PC_STATE/mirror$TRADER_SERVER_HOME"
fi
