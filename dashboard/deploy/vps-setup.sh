#!/usr/bin/env bash
# Phase 2 — deploy the Alpha Firm dashboard API on the VPS.
# Run as the SAME user cron uses for run-check.sh, from an interactive shell
# (so `claude` is on PATH and its Max login is available to manual runs):
#
#   cd /path/to/alpha-firm && git pull
#   bash dashboard/deploy/vps-setup.sh
#
# Idempotent: safe to re-run after a `git pull` to redeploy.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASH_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DASH_DIR/.." && pwd)"
cd "$DASH_DIR"

echo "▶ Alpha Firm dashboard deploy"
echo "  root:      $ROOT_DIR"
echo "  dashboard: $DASH_DIR"

# 1. Node 18+ -------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "✗ node not found. Install Node 18+ first (e.g. via nvm or your distro), then re-run." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ node $(node -v) is too old; need 18+." >&2
  exit 1
fi
echo "✓ node $(node -v)"

# 2. claude on PATH (needed for the manual-run trigger) -------------------------
if command -v claude >/dev/null 2>&1; then
  echo "✓ claude on PATH: $(command -v claude)"
else
  echo "⚠ 'claude' is NOT on this shell's PATH. The manual Run-check button will fail."
  echo "  Start this script (and pm2) from the user/shell that cron uses for run-check.sh."
fi

# 3. Dependencies ---------------------------------------------------------------
echo "▶ npm install"
npm install --no-audit --no-fund

# 4. .env.dashboard (token) -----------------------------------------------------
if [ ! -f .env.dashboard ]; then
  TOKEN="$(openssl rand -hex 32 2>/dev/null || node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  cp .env.dashboard.example .env.dashboard
  # set API_TOKEN
  if grep -q '^API_TOKEN=' .env.dashboard; then
    sed -i.bak "s|^API_TOKEN=.*|API_TOKEN=$TOKEN|" .env.dashboard && rm -f .env.dashboard.bak
  else
    echo "API_TOKEN=$TOKEN" >> .env.dashboard
  fi
  echo "✓ created .env.dashboard with a fresh API_TOKEN"
  echo "  ┌─────────────────────────────────────────────────────────────"
  echo "  │ API_TOKEN=$TOKEN"
  echo "  │ ^ SAVE THIS — paste it into the app build (EXPO_PUBLIC_API_TOKEN)"
  echo "  └─────────────────────────────────────────────────────────────"
else
  echo "✓ .env.dashboard already exists (leaving token unchanged)"
fi

# 5. pm2 ------------------------------------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  echo "▶ installing pm2 globally"
  npm install -g pm2 || { echo "✗ could not install pm2 globally (try: sudo npm i -g pm2)"; exit 1; }
fi

# 6. Start / restart under pm2 (load env first) ---------------------------------
set -a; source .env.dashboard; set +a
echo "▶ starting under pm2"
pm2 start "$DASH_DIR/deploy/ecosystem.config.cjs" --update-env
pm2 save
echo "  (for reboot persistence, run once: pm2 startup  — then the command it prints)"

# 7. Health check ---------------------------------------------------------------
sleep 2
PORT="${PORT:-3001}"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${API_TOKEN}" "http://localhost:${PORT}/api/portfolio" || true)"
echo "▶ health: GET /api/portfolio (with token) → HTTP ${CODE}"
if [ "$CODE" = "200" ]; then
  echo "✅ Dashboard API is live on :${PORT}."
  echo "   Tailscale should already serve it at your https://<host>.ts.net URL."
else
  echo "⚠ unexpected status ${CODE}. Check logs:  pm2 logs alpha-firm-dashboard --lines 40"
fi
