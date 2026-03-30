#!/bin/bash
# Refresh live prices via the dashboard API server
# Call this from cron to update portfolio NAV and outcome checkpoints
# Requires the dashboard API server to be running on port 3001

RESPONSE=$(curl -s -X POST http://localhost:3001/api/refresh-prices)
SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success','false'))" 2>/dev/null)

if [ "$SUCCESS" = "True" ]; then
  NAV=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['portfolio']['nav'])" 2>/dev/null)
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Prices refreshed. NAV: \$${NAV}"
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ERROR: Price refresh failed"
  echo "$RESPONSE"
  exit 1
fi
