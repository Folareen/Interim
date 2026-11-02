#!/usr/bin/env bash
# Prepares a fresh Debian or Ubuntu VPS for Interim, with no Docker: Node 22, Redis on localhost, Caddy for
# HTTPS, a service user and the three systemd services. Safe to run again. Run it as root on the server:
#   bash setup-server.sh HOST
# where HOST is the name people will type, such as 203-0-113-7.sslip.io (a name that points at the server's IP).
set -euo pipefail

HOST="${1:?Usage: setup-server.sh HOST   (for example 203-0-113-7.sslip.io)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Run as root (or with sudo)."; exit 1; }
command -v apt-get >/dev/null || { echo "This script needs a Debian or Ubuntu server (apt)."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> Base packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg rsync ufw debian-keyring debian-archive-keyring apt-transport-https

echo "==> Swap, so a small server can build and run without running out of memory"
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 2500 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Node 22 and pnpm"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable

echo "==> Redis, on this machine only, with a small memory cap (queues, locks and rate limits need nothing more)"
apt-get install -y redis-server
sed -i 's/^# *bind .*/bind 127.0.0.1 -::1/; s/^bind .*/bind 127.0.0.1 -::1/' /etc/redis/redis.conf
grep -q '^maxmemory ' /etc/redis/redis.conf || printf '\nmaxmemory 64mb\nmaxmemory-policy noeviction\nsave ""\n' >> /etc/redis/redis.conf
systemctl enable --now redis-server
systemctl restart redis-server

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
sed "s/SITE_ADDRESS/${HOST}/" "$HERE/Caddyfile.template" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo "==> Service user and folders"
id interim >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/interim --shell /usr/sbin/nologin interim
mkdir -p /opt/interim /etc/interim
chown -R interim:interim /opt/interim
chmod 755 /etc/interim

echo "==> systemd services"
for unit in interim-api interim-worker interim-web; do
  install -m 644 "$HERE/$unit.service" "/etc/systemd/system/$unit.service"
done
systemctl daemon-reload
systemctl enable interim-api interim-worker interim-web

echo "==> Firewall: SSH, HTTP and HTTPS only"
ssh_port=$(sshd -T 2>/dev/null | awk '/^port / {print $2; exit}')
ufw allow "${ssh_port:-22}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Server ready for ${HOST}."
echo "Next: put the production settings in /etc/interim/env (mode 600), then run deploy/ship.sh from your computer."
