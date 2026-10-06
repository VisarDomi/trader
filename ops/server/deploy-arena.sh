#!/usr/bin/env bash
#
# Deploy the arena to the Hetzner server.
#
#   ops/server/deploy-arena.sh            deploy HEAD (refuses if shipped files have uncommitted changes)
#   ops/server/deploy-arena.sh --seed DB  also upload a pre-seeded arena database (first install only)
#
# Layout on the server (all under /home/erdal/trader-arena):
#   app/      apps/backend source + agents (replaced on every deploy)
#   data/     arena.db (SQLite; never touched by deploys)
#   .env      credentials and settings (created once, by hand; see .env.example)
#   DEPLOYED  commit that is running
set -euo pipefail

SERVER="erdal@157.90.28.14"
REMOTE="/home/erdal/trader-arena"
UNIT="trader-arena"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SEED=""
if [[ "${1:-}" == "--seed" ]]; then SEED="${2:?--seed needs a path}"; fi

cd "$REPO"
SHIPPED=(apps/backend/src apps/backend/agents apps/backend/package.json apps/backend/tsconfig.json)
if [[ -n "$(git status --porcelain -- "${SHIPPED[@]}")" ]]; then
  echo "uncommitted changes in shipped files; commit first so the server runs a known version." >&2
  git status --short -- "${SHIPPED[@]}" >&2
  exit 1
fi
SHA="$(git rev-parse --short HEAD)"

echo "== typecheck + tests"
(cd apps/backend && bunx tsc --noEmit -p . && bun test >/dev/null)

echo "== upload $SHA"
ssh "$SERVER" "mkdir -p $REMOTE/app $REMOTE/data"
# Export the committed tree (not the working tree) to a temp dir, then rsync it.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive HEAD apps/backend/src apps/backend/agents apps/backend/package.json apps/backend/tsconfig.json | tar -x -C "$TMP"
rsync -az --delete \
  --exclude '/data/' --exclude '/node_modules/' --exclude '/.env' \
  "$TMP/apps/backend/" "$SERVER:$REMOTE/app/"
echo "$SHA $(date -Is)" | ssh "$SERVER" "cat > $REMOTE/DEPLOYED"

if [[ -n "$SEED" ]]; then
  echo "== upload seed database"
  ssh "$SERVER" "test ! -e $REMOTE/data/arena.db" || { echo "refusing to overwrite an existing arena.db" >&2; exit 1; }
  rsync -az "$SEED" "$SERVER:$REMOTE/data/arena.db"
fi

echo "== install unit + restart"
scp -q "$REPO/ops/server/trader-arena.service" "$SERVER:/tmp/trader-arena.service"
ssh "$SERVER" "sudo install -m 0644 /tmp/trader-arena.service /etc/systemd/system/$UNIT.service && sudo systemctl daemon-reload && sudo systemctl enable $UNIT >/dev/null 2>&1; sudo systemctl restart $UNIT"

echo "== waiting for the API"
for _ in $(seq 1 60); do
  if ssh "$SERVER" "curl -sf -m 2 http://127.0.0.1:4120/api/health >/dev/null"; then
    ssh "$SERVER" "curl -s http://127.0.0.1:4120/api/status" | head -c 400; echo
    echo "deployed $SHA"
    exit 0
  fi
  sleep 2
done
echo "arena did not come up; recent logs:" >&2
ssh "$SERVER" "sudo journalctl -u $UNIT -n 40 --no-pager" >&2
exit 1
