#!/bin/bash
###############################################################################
# scripts/deploy-vps.sh — production deploy on the VPS
#
# Run on the VPS as the nexus user (or via sudo -u nexus):
#   cd /opt/Nexus && bash deploy-vps.sh
#
# Pulls latest code, installs deps, rebuilds the client dashboard,
# and restarts the systemd service.
###############################################################################
set -euo pipefail

cd /opt/Nexus

echo "==> Pulling latest code"
git pull --ff-only origin main

echo "==> Installing server dependencies"
npm --prefix server install --omit=dev

echo "==> Installing client dependencies"
npm --prefix client install

echo "==> Building client dashboard"
npm --prefix client run build

echo "==> Restarting nexus-server service"
sudo systemctl restart nexus-server

echo "==> Waiting for health check"
for i in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "healthy"
    curl -s http://127.0.0.1:3000/api/health
    echo ""
    echo "==> Deploy completed successfully"
    exit 0
  fi
  sleep 2
done

echo "ERROR: server not healthy after 20s" >&2
sudo journalctl -u nexus-server -n 30 --no-pager >&2
exit 1
