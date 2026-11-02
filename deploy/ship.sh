#!/usr/bin/env bash
# Builds Interim on this computer, sends it to the server and (re)starts it under PM2. Run from the repo root:
#   SSH_PORT=22022 deploy/ship.sh deploy@104.207.90.150
# The server needs Node 22, PM2 and redis-server, and ~/interim/.env.production in place (docs/deployment.md).
# Nothing here touches the database; run migrations separately.
set -euo pipefail

TARGET="${1:?Usage: SSH_PORT=22 deploy/ship.sh user@server}"
SSH_PORT="${SSH_PORT:-22}"
API_PORT=4100
cd "$(dirname "$0")/.."
SSH=(ssh -p "$SSH_PORT" -o BatchMode=yes)

echo "==> Build here (the web app bakes in where the API is, so it is told now)"
pnpm install --frozen-lockfile
API_ORIGIN="http://127.0.0.1:${API_PORT}" pnpm build

echo "==> Send the code and the build"
rsync -az --delete -e "ssh -p $SSH_PORT -o BatchMode=yes" \
  --exclude node_modules --exclude .git --exclude '.env*' --exclude .turbo --exclude .spike \
  --exclude 'apps/web/.next/cache' --exclude coverage --exclude .pnpm-store --exclude docs \
  ./ "$TARGET:interim/"

echo "==> Install what runs in production, then start or reload only Interim's own processes"
"${SSH[@]}" "$TARGET" 'set -e
  cd ~/interim
  test -f .env.production || { echo "Missing ~/interim/.env.production"; exit 1; }
  CI=true corepack pnpm install --prod --frozen-lockfile
  pm2 describe interim-redis >/dev/null 2>&1 || pm2 start deploy/ecosystem.config.cjs --only interim-redis
  pm2 startOrReload deploy/ecosystem.config.cjs --only interim-api,interim-worker,interim-web --update-env
  pm2 save
  pm2 list'
