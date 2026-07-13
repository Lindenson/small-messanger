#!/usr/bin/env bash
# =============================================================================
# Provision small-messanger's infrastructure footprint on the shared Hormiga
# host (coturn + edge nginx routes + front4mess systemd unit).
#
# This is the ONE-TIME / on-change infra installer. The routine SPA redeploy is
# the separate ../deploy.sh (atomic dist swap; run that on every UI change).
#
# Secrets are supplied via env or an untracked deploy/.env (see deploy/.env.example).
# NOTHING secret is committed. Requires ssh + sudo on the target.
#
# Usage:
#   DEPLOY_HOST=den@91.99.6.25 TURN_USER=... TURN_PASSWORD=... ./deploy/deploy-infra.sh
#
# Steps performed on the host:
#   1. coturn      — docker compose up (deploy/hormiga-coturn.compose.yml)
#   2. nginx       — install deploy/nginx/messenger-edge.conf as a snippet + reload
#   3. front4mess  — install the systemd unit + server.mjs, enable + start
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOY_HOST:?set DEPLOY_HOST=user@host}"
: "${TURN_USER:?set TURN_USER (coturn long-term credential user)}"
: "${TURN_PASSWORD:?set TURN_PASSWORD (coturn long-term credential password)}"
TURN_REALM="${TURN_REALM:-hormi.isolutions.io}"
TURN_EXTERNAL_IP="${TURN_EXTERNAL_IP:-91.99.6.25}"
REMOTE_DIR="${REMOTE_DIR:-/opt/small-messanger}"
SSH_OPTS="${SSH_OPTS:-}"

echo "== [1/3] ship infra files to $DEPLOY_HOST:$REMOTE_DIR =="
# shellcheck disable=SC2086
ssh $SSH_OPTS "$DEPLOY_HOST" "mkdir -p $REMOTE_DIR/deploy/nginx"
# shellcheck disable=SC2086
scp $SSH_OPTS deploy/hormiga-coturn.compose.yml "$DEPLOY_HOST:$REMOTE_DIR/deploy/"
# shellcheck disable=SC2086
scp $SSH_OPTS deploy/nginx/messenger-edge.conf "$DEPLOY_HOST:$REMOTE_DIR/deploy/nginx/"
# shellcheck disable=SC2086
scp $SSH_OPTS deploy/front4mess.service "$DEPLOY_HOST:$REMOTE_DIR/deploy/"
# shellcheck disable=SC2086
scp $SSH_OPTS front/server.mjs "$DEPLOY_HOST:$REMOTE_DIR/deploy/server.mjs"

echo "== [2/3] coturn + nginx + systemd on host =="
# shellcheck disable=SC2086
ssh $SSH_OPTS "$DEPLOY_HOST" \
  TURN_USER="$TURN_USER" TURN_PASSWORD="$TURN_PASSWORD" \
  TURN_REALM="$TURN_REALM" TURN_EXTERNAL_IP="$TURN_EXTERNAL_IP" \
  REMOTE_DIR="$REMOTE_DIR" bash -s <<'REMOTE'
set -euo pipefail

echo "  -> coturn"
sudo -E env TURN_USER="$TURN_USER" TURN_PASSWORD="$TURN_PASSWORD" \
  TURN_REALM="$TURN_REALM" TURN_EXTERNAL_IP="$TURN_EXTERNAL_IP" \
  docker compose -p hormiga-coturn \
  -f "$REMOTE_DIR/deploy/hormiga-coturn.compose.yml" up -d

echo "  -> nginx edge routes (snippet + include check)"
sudo cp "$REMOTE_DIR/deploy/nginx/messenger-edge.conf" /etc/nginx/snippets/messenger-edge.conf
if ! sudo grep -q "snippets/messenger-edge.conf" /etc/nginx/conf.d/hormi.isolutions.io.conf; then
  echo "  !! ACTION REQUIRED: add this line inside the 443 server block, before 'location /':"
  echo "         include /etc/nginx/snippets/messenger-edge.conf;"
else
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "  -> front4mess systemd unit"
sudo mkdir -p /opt/front4mess
sudo cp "$REMOTE_DIR/deploy/server.mjs" /opt/front4mess/server.mjs
sudo cp "$REMOTE_DIR/deploy/front4mess.service" /etc/systemd/system/front4mess.service
sudo systemctl daemon-reload
sudo systemctl enable --now front4mess
REMOTE

echo "== [3/3] done — now run ./deploy.sh to ship the SPA dist =="
