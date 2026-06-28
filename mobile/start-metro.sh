#!/usr/bin/env bash
# Run the Expo/Metro dev server on the VPS so Expo Go on the iPhone loads the app
# over Tailscale. The app reads EXPO_PUBLIC_API_BASE / EXPO_PUBLIC_API_TOKEN from
# mobile/.env (create it from .env.example).
#
#   First time (to see the QR):   bash start-metro.sh
#   Persistent (after it works):  pm2 start start-metro.sh --name alpha-firm-metro && pm2 save
set -e
cd "$(dirname "$0")"

# Advertise the VPS's Tailscale IP so Expo Go reaches the JS bundle over the tailnet.
HOST_IP="$(tailscale ip -4 2>/dev/null | head -1)"
if [ -z "$HOST_IP" ]; then
  echo "✗ Could not get the Tailscale IP (is 'tailscale up' done on this VPS?)." >&2
  exit 1
fi
export REACT_NATIVE_PACKAGER_HOSTNAME="$HOST_IP"

# Free port 8081 if a previous Metro is squatting on it, so expo never falls into
# the interactive "Use port 8082 instead?" prompt (which hangs under pm2).
( fuser -k 8081/tcp || lsof -ti:8081 | xargs -r kill -9 ) >/dev/null 2>&1 || true
sleep 1

echo "▶ Metro advertising exp://$HOST_IP:8081"
echo "  iPhone (Tailscale ON): scan the QR below with the Camera app → Open in Expo Go."
exec npx expo start --host lan --port 8081
