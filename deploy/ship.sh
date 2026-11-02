#!/usr/bin/env bash
# Builds Interim on this computer and sends it to the server, then restarts it. Run from the repo root:
#   deploy/ship.sh user@server
# The server needs deploy/setup-server.sh run once and /etc/interim/env in place. Nothing here touches the
# database; run migrations separately (see docs/deployment.md).
set -euo pipefail

TARGET="${1:?Usage: deploy/ship.sh user@server}"
cd "$(dirname "$0")/.."

echo "==> Build here (the web server needs to know where the API is when it is built)"
pnpm install --frozen-lockfile
API_ORIGIN=http://127.0.0.1:4000 pnpm build

echo "==> Send the code and the build"
SSH="ssh -o BatchMode=yes"
# root needs no sudo; any other user does
REMOTE_SUDO='S=""; [ "$(id -u)" -ne 0 ] && S=sudo'
$SSH "$TARGET" "$REMOTE_SUDO; \$S mkdir -p /opt/interim && \$S chown \"\$(id -un)\": /opt/interim"
rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude .git --exclude '.env*' --exclude .turbo --exclude .spike \
  --exclude 'apps/web/.next/cache' --exclude coverage --exclude .pnpm-store --exclude 'docs' \
  ./ "$TARGET:/opt/interim/"

echo "==> Install only what runs in production, and restart"
$SSH "$TARGET" "$REMOTE_SUDO; cd /opt/interim && corepack enable && CI=true pnpm install --prod --frozen-lockfile && \$S chown -R interim:interim /opt/interim && \$S systemctl restart interim-api interim-worker interim-web"
echo "Done. Check: ssh $TARGET 'systemctl is-active interim-api interim-worker interim-web'"
