#!/bin/bash
# Quick script to generate cron status JSON for the dashboard
# Can be called by the JSX via fetch or read directly

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUS_FILE="$SCRIPT_DIR/state/cron-status.json"
TODAY=$(date +%Y-%m-%d)

# Get next scheduled runs from crontab
NEXT_PREMARKET=$(date -d "$(date -d 'next monday' +%Y-%m-%d) 11:00 UTC" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "next weekday 11:00 UTC")
NEXT_MIDDAY=$(date -d "$(date -d 'next monday' +%Y-%m-%d) 16:30 UTC" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "next weekday 16:30 UTC")
NEXT_CLOSING=$(date -d "$(date -d 'next monday' +%Y-%m-%d) 19:45 UTC" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "next weekday 19:45 UTC")

if [ -f "$STATUS_FILE" ]; then
    cat "$STATUS_FILE"
else
    echo '{"date":"'"$TODAY"'","runs":[]}'
fi
