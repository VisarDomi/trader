#!/usr/bin/env bash
#
# Deploy the arena to its active runtime (PC after migration, otherwise Hetzner).
#
#   ops/server/deploy-arena.sh            deploy HEAD (refuses if shipped files have uncommitted changes)
#   ops/server/deploy-arena.sh --seed DB  also upload a pre-seeded arena database (first install only)
#
# Layout on the server (all under /home/erdal/trader-arena):
#   app/      apps/backend source + agents (replaced on every deploy)
#   data/     arena.db (SQLite; never touched by deploys)
#   .env      credentials and settings (created once, by hand; keys: apps/backend/.env.template)
#   DEPLOYED  commit that is running
set -euo pipefail

SERVER="erdal@157.90.28.14"
REMOTE="/home/erdal/trader-arena"
UNIT="trader-arena"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
source "$REPO/ops/server/runtime.sh"
if "$TRADER_PC_ACTIVE"; then
  REMOTE="$TRADER_SERVER_ROOT/trader-arena"
  UNIT="pc-server-trader-arena"
  [[ -d "$REMOTE/app" ]] || { echo "migrated trader runtime missing: $REMOTE" >&2; exit 1; }
fi
SEED=""
if [[ "${1:-}" == "--seed" ]]; then SEED="${2:?--seed needs a path}"; fi

cd "$REPO"
SHIPPED=(apps/backend/src apps/backend/agents apps/backend/package.json apps/backend/tsconfig.json packages/shared)
if [[ -n "$(git status --porcelain -- "${SHIPPED[@]}")" ]]; then
  echo "uncommitted changes in shipped files; commit first so the server runs a known version." >&2
  git status --short -- "${SHIPPED[@]}" >&2
  exit 1
fi
SHA="$(git rev-parse --short HEAD)"

echo "== typecheck + tests"
(cd apps/backend && bunx tsc --noEmit -p . && bun test >/dev/null)

# Export the committed tree (not the working tree) to a temp dir, then rsync it.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "${SHIPPED[@]}" | tar -x -C "$TMP"
echo "== validate packaged imports"
mkdir -p "$TMP/apps/backend/node_modules/@trader"
ln -s "$TMP/packages/shared" "$TMP/apps/backend/node_modules/@trader/shared"
(cd "$TMP/apps/backend" && bun -e "await import('./src/arena/api.ts')")
echo "== upload $SHA"
if ! "$TRADER_PC_ACTIVE"; then ssh "$SERVER" "mkdir -p $REMOTE/app $REMOTE/data"; fi
DESTINATION="$SERVER:$REMOTE/app/"
SHARED_DESTINATION="$SERVER:$REMOTE/app/node_modules/@trader/shared/"
if "$TRADER_PC_ACTIVE"; then
  DESTINATION="$REMOTE/app/"
  SHARED_DESTINATION="$REMOTE/app/node_modules/@trader/shared/"
  mkdir -p "$SHARED_DESTINATION"
else
  ssh "$SERVER" "mkdir -p $REMOTE/app/node_modules/@trader/shared"
fi
rsync -az --delete \
  --exclude '/data/' --exclude '/node_modules/' --exclude '/.env' \
  "$TMP/apps/backend/" "$DESTINATION"
rsync -az --delete "$TMP/packages/shared/" "$SHARED_DESTINATION"
if "$TRADER_PC_ACTIVE"; then
  echo "$SHA $(date -Is)" > "$REMOTE/DEPLOYED"
else
  echo "$SHA $(date -Is)" | ssh "$SERVER" "cat > $REMOTE/DEPLOYED"
fi

if [[ -n "$SEED" ]]; then
  echo "== upload seed database"
  if "$TRADER_PC_ACTIVE"; then
    [[ ! -e "$REMOTE/data/arena.db" ]] || { echo "refusing to overwrite an existing arena.db" >&2; exit 1; }
    rsync -az "$SEED" "$REMOTE/data/arena.db"
  else
    ssh "$SERVER" "test ! -e $REMOTE/data/arena.db" || { echo "refusing to overwrite an existing arena.db" >&2; exit 1; }
    rsync -az "$SEED" "$SERVER:$REMOTE/data/arena.db"
  fi
fi

echo "== install unit + restart"
if "$TRADER_PC_ACTIVE"; then
  systemctl --user restart "$UNIT"
else
  scp -q "$REPO/ops/server/trader-arena.service" "$SERVER:/tmp/trader-arena.service"
  ssh "$SERVER" "sudo install -m 0644 /tmp/trader-arena.service /etc/systemd/system/$UNIT.service && sudo systemctl daemon-reload && sudo systemctl enable $UNIT >/dev/null 2>&1; sudo systemctl restart $UNIT"
fi

api_get() {
  if "$TRADER_PC_ACTIVE"; then curl -sf -m 2 "http://127.0.0.1:4120$1";
  else ssh "$SERVER" "curl -sf -m 2 http://127.0.0.1:4120$1"; fi
}

echo "== waiting for the API"
for _ in $(seq 1 60); do
  if api_get /api/health | python3 -c 'import json,sys; data=sys.stdin.read(); sys.exit(0 if data and json.loads(data).get("ready") else 1)'; then
    api_get /api/status | python3 -c 'import json,sys; s=json.load(sys.stdin); print(json.dumps({k:s[k] for k in ["agents","demoRuns","loadErrors","memoryMb"]}))'
    echo "deployed $SHA"
    exit 0
  fi
  sleep 2
done
echo "arena did not come up; recent logs:" >&2
if "$TRADER_PC_ACTIVE"; then journalctl --user -u "$UNIT" -n 40 --no-pager >&2;
else ssh "$SERVER" "sudo journalctl -u $UNIT -n 40 --no-pager" >&2; fi
exit 1
