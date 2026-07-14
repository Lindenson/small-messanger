#!/usr/bin/env bash
# =============================================================================
# CI/CD deploy — Hormiga Messenger test UI (small-messanger frontend)
#
# The UI now runs as a CONTAINER (front/Dockerfile) on 127.0.0.1:5555 with
# auto-restart, defined in deploy/front4mess.compose.yml — replacing the old
# "ship dist/ + node server.mjs under the front4mess systemd unit" model. The
# edge (nginx https://hormi.isolutions.io/messenger-ui/ -> 127.0.0.1:5555) is
# unchanged. This script ships the build context and builds+runs the container
# on the host (Docker does the Vite build in a multi-stage image).
#
# Usage:
#   DEPLOY_HOST=den@91.99.6.25 ./deploy.sh
#
# Configuration (env vars; defaults in []):
#   DEPLOY_HOST   (required)                        ssh target, e.g. den@91.99.6.25
#   BASE          [/messenger-ui/]                  Vite base (the edge subpath; build arg)
#   EDGE          [https://hormi.isolutions.io]     public edge, for the health check
#   REMOTE_DIR    [/tmp/front4mess-src]             build context dir on the host
#   DOCKER        [sudo docker]                     docker command on the host
#   SSH_OPTS      []                                extra ssh/rsync options (identity, port…)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

: "${DEPLOY_HOST:?set DEPLOY_HOST=user@host}"
BASE="${BASE:-/messenger-ui/}"
EDGE="${EDGE:-https://hormi.isolutions.io}"
REMOTE_DIR="${REMOTE_DIR:-/tmp/front4mess-src}"
DOCKER="${DOCKER:-sudo docker}"
SSH_OPTS="${SSH_OPTS:-}"

echo "== [1/3] ship build context (front/ + deploy/) to $DEPLOY_HOST:$REMOTE_DIR =="
# shellcheck disable=SC2086
rsync -az --delete -e "ssh $SSH_OPTS" \
  --exclude node_modules --exclude dist --exclude 'front/dist*' \
  ./front ./deploy "$DEPLOY_HOST:$REMOTE_DIR/"

echo "== [2/3] build + (re)start the container on the host =="
# shellcheck disable=SC2086
ssh $SSH_OPTS "$DEPLOY_HOST" \
  "cd '$REMOTE_DIR' && BASE='$BASE' $DOCKER compose -f deploy/front4mess.compose.yml up -d --build"

echo "== [3/3] verify via edge ($EDGE$BASE) =="
code=$(curl -s -o /dev/null -w '%{http_code}' "$EDGE$BASE")
if [ "$code" = "200" ]; then
  echo "OK: $EDGE$BASE -> HTTP 200"
else
  echo "WARN: $EDGE$BASE -> HTTP $code (expected 200)"; exit 1
fi
