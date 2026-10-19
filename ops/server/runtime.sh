#!/usr/bin/env bash
# Shared target discovery for the manual arena deploy and lab service installer.
TRADER_PC_STATE="$HOME/.local/share/hetzner-pc"
TRADER_PC_ACTIVE=false
TRADER_SERVER_ROOT="/home/erdal"
if [[ -f "$TRADER_PC_STATE/ACTIVE" ]]; then
  TRADER_PC_ACTIVE=true
  TRADER_SERVER_ROOT="$TRADER_PC_STATE/mirror/home/erdal"
fi
