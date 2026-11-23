#!/usr/bin/env bash
#
# Copy the research reference files (papers, page snapshots) to the server,
# where the dashboard's Research tab serves them behind the login.
#
#   ops/server/sync-research.sh
#
# research/files/ is not in git (third-party material in a public repo); the
# notes and the report are, and reach the dashboard with every push. The files
# live in $TRADER_SERVER_ROOT/trader-ui/research/files (ops/server/runtime.sh),
# which UI deploys keep (they copy the folder before swapping in a new build).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
source "$REPO/ops/server/runtime.sh"
SERVER="$TRADER_SERVER_SSH"
REMOTE="$TRADER_SERVER_ROOT/trader-ui/research/files"
if ! "$TRADER_PC_ACTIVE" && [[ -z "$SERVER" ]]; then echo "TRADER_SERVER_SSH is not set (apps/backend/.env)" >&2; exit 1; fi

DESTINATION="$SERVER:$REMOTE/"
if "$TRADER_PC_ACTIVE"; then
  mkdir -p "$REMOTE"
  DESTINATION="$REMOTE/"
else
  ssh "$SERVER" "mkdir -p $REMOTE"
fi
rsync -az --delete --exclude '.*' "$REPO/research/files/" "$DESTINATION"
echo "synced $(find "$REPO/research/files" -type f | wc -l) files ($(du -sh "$REPO/research/files" | cut -f1)) to $DESTINATION"
