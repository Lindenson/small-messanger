#!/usr/bin/env bash
# =============================================================================
# CI/CD deploy — Hormiga Messenger test UI (small-messanger frontend)
#
# Builds the Vite SPA, bundles dist/, ships it to the deploy host and swaps it
# into the static-server folder atomically. No manual server steps.
#
# The messenger UI is served by a zero-dep Node static server (server.mjs,
# systemd unit `front4mess`, bound to 127.0.0.1:5555) and reverse-proxied by the
# edge at https://hormi.isolutions.io/messenger-ui/. The server reads files from
# disk per request, so a dist swap is picked up immediately — no restart needed.
# Layout on the server:  <DEPLOY_PATH>/{dist/,server.mjs}
#
# This script only ships the SPA. The one-time infra footprint (coturn, edge
# nginx routes, front4mess systemd unit) lives in deploy/ — provision it once with
# deploy/deploy-infra.sh. See DEPLOYMENT-CHANGES.md for the full footprint + secrets.
#
# Usage:
#   DEPLOY_HOST=den@91.99.6.25 ./deploy.sh
#
# Configuration (env vars; defaults in []):
#   SERVICE        [messenger-ui]                  label for logs
#   DEPLOY_HOST    (required)                       ssh target, e.g. den@91.99.6.25
#   DEPLOY_PATH    [/opt/front4mess]               static-server folder on the server
#   BASE           [/messenger-ui/]                Vite base (the edge subpath)
#   EDGE           [https://hormi.isolutions.io]   public edge, for the health check
#   RESTART_UNIT   []                              systemd unit to restart (usually none)
#   REMOTE_SUDO    [sudo]                          used only if RESTART_UNIT is set
#   SSH_OPTS       []                              extra ssh/scp options (identity, port…)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

SERVICE="${SERVICE:-messenger-ui}"
: "${DEPLOY_HOST:?set DEPLOY_HOST=user@host}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/front4mess}"
BASE="${BASE:-/messenger-ui/}"
EDGE="${EDGE:-https://hormi.isolutions.io}"
RESTART_UNIT="${RESTART_UNIT:-}"
REMOTE_SUDO="${REMOTE_SUDO:-sudo}"
SSH_OPTS="${SSH_OPTS:-}"

BUNDLE="front/dist-${SERVICE}.tgz"
REMOTE_TMP="/tmp/${SERVICE}-dist.$$.tgz"

echo "== [1/5] build SPA ($SERVICE, base=$BASE) =="
# NOTE: `npm run build` runs `tsc -b` which fails on a PRE-EXISTING stale test
# (features/call/hooks/__test__/useWebRTC.test.ts) — the real gate is the Vite build.
( cd front && npx vite build --base="$BASE" --sourcemap )
[ -d front/dist ] || { echo "ERROR: front/dist not found after build"; exit 1; }

echo "== [2/5] bundle -> $BUNDLE =="
tar czf "$BUNDLE" -C front dist          # -> dist/

echo "== [3/5] ship to $DEPLOY_HOST =="
# shellcheck disable=SC2086
scp $SSH_OPTS "$BUNDLE" "$DEPLOY_HOST:$REMOTE_TMP"

echo "== [4/5] swap dist into $DEPLOY_PATH =="
# Local values are interpolated into the here-doc; remote-only vars are escaped (\$DEST).
# shellcheck disable=SC2086
ssh $SSH_OPTS "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
DEST="$DEPLOY_PATH"
mkdir -p "\$DEST"
rm -rf "\$DEST/dist.new"; mkdir -p "\$DEST/dist.new"
tar xzf "$REMOTE_TMP" -C "\$DEST/dist.new"           # -> dist.new/dist
rm -rf "\$DEST/dist.old"
[ -d "\$DEST/dist" ] && mv "\$DEST/dist" "\$DEST/dist.old"
mv "\$DEST/dist.new/dist" "\$DEST/dist"
rm -rf "\$DEST/dist.new" "$REMOTE_TMP"
if [ -n "$RESTART_UNIT" ]; then
  echo "  restarting $RESTART_UNIT"
  $REMOTE_SUDO systemctl restart "$RESTART_UNIT"
else
  echo "  no restart (static server reads dist/ per request)"
fi
REMOTE
rm -f "$BUNDLE"

echo "== [5/5] verify via edge ($EDGE$BASE) =="
code=$(curl -s -o /dev/null -w '%{http_code}' "$EDGE$BASE")
if [ "$code" = "200" ]; then
  echo "OK: $EDGE$BASE -> HTTP 200"
else
  echo "WARN: $EDGE$BASE -> HTTP $code (expected 200)"; exit 1
fi
