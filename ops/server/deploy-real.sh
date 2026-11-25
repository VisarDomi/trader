#!/usr/bin/env bash
#
# Deploy the standalone Real USD executor (`trader-real.service`) directly to Hetzner.
# Real-money execution always runs on Hetzner (never on the PC), isolated from demo/paper work.
#
# Layout on Hetzner ($TRADER_SERVER_HOME/trader-real):
#   app/      apps/backend source + agents (replaced on every deploy)
#   data/     real.db (SQLite; never touched by deploys)
#   .env      live credentials, CAPITAL_REAL_ACCOUNT_ID, REAL_TOKEN (created once, chmod 600)
#   DEPLOYED  commit that is running
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
source "$REPO/ops/server/runtime.sh"
SERVER="$TRADER_SERVER_SSH"
REMOTE="$TRADER_SERVER_HOME/trader-real"
UNIT="trader-real"
[[ -n "$SERVER" ]] || { echo "TRADER_SERVER_SSH is not set (apps/backend/.env)" >&2; exit 1; }

cd "$REPO"
SHIPPED=(apps/backend/src apps/backend/agents apps/backend/package.json apps/backend/tsconfig.json packages/shared ops/server/trader-real.service)
if [[ -n "$(git status --porcelain -- "${SHIPPED[@]}")" ]]; then
  echo "uncommitted changes in shipped files; commit first so Hetzner runs a known version." >&2
  git status --short -- "${SHIPPED[@]}" >&2
  exit 1
fi
SHA="$(git rev-parse --short HEAD)"

echo "== typecheck + real executor tests"
(cd apps/backend && bunx tsc --noEmit -p . && bun test src/real/executor.test.ts src/capital/client.test.ts >/dev/null)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "${SHIPPED[@]}" | tar -x -C "$TMP"

echo "== upload $SHA to Hetzner ($SERVER:$REMOTE)"
ssh "$SERVER" "mkdir -p $REMOTE/app $REMOTE/data $REMOTE/app/node_modules/@trader/shared"
rsync -az --delete \
  --exclude '/data/' --exclude '/node_modules/' --exclude '/.env' \
  "$TMP/apps/backend/" "$SERVER:$REMOTE/app/"
rsync -az --delete "$TMP/packages/shared/" "$SERVER:$REMOTE/app/node_modules/@trader/shared/"
echo "$SHA $(date -Is)" | ssh "$SERVER" "cat > $REMOTE/DEPLOYED"

echo "== install systemd unit + restart on Hetzner"
sed -e "s|@SERVER_USER@|${SERVER%@*}|g" -e "s|@SERVER_HOME@|$TRADER_SERVER_HOME|g" \
  "$REPO/ops/server/trader-real.service" > "$TMP/trader-real.service"
scp -q "$TMP/trader-real.service" "$SERVER:/tmp/trader-real.service"
ssh "$SERVER" "sudo install -m 0644 /tmp/trader-real.service /etc/systemd/system/$UNIT.service && rm -f /tmp/trader-real.service && sudo systemctl daemon-reload && sudo systemctl enable $UNIT >/dev/null 2>&1 && sudo systemctl restart $UNIT"

echo "== waiting for trader-real health on Hetzner"
for _ in $(seq 1 30); do
  if ssh "$SERVER" "curl -sf -m 2 http://127.0.0.1:4125/api/health" | python3 -c 'import json,sys; d=sys.stdin.read(); sys.exit(0 if d and json.loads(d).get("ready") else 1)'; then
    ssh "$SERVER" "curl -sf -m 2 http://127.0.0.1:4125/api/health"
    echo ""
    echo "deployed trader-real $SHA on Hetzner"
    exit 0
  fi
  sleep 2
done
echo "trader-real did not become ready; recent logs:" >&2
ssh "$SERVER" "sudo journalctl -u $UNIT -n 40 --no-pager" >&2
exit 1
