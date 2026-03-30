#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Cron Wrapper
# Wraps run-check.sh to track execution status for the dashboard
# Usage: ./scripts/cron-wrapper.sh [morning|midday|closing|premarket]
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

# Ensure claude CLI is on PATH (npm global bin not in cron's default PATH)
export PATH="/home/clawd/.npm-global/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="${1:-morning}"
CRON_LOG="$SCRIPT_DIR/state/cron-status.json"
TODAY=$(date +%Y-%m-%d)
START_TIME=$(date +%Y-%m-%dT%H:%M:%S%z)

# Initialize cron-status.json if missing or stale
if [ ! -f "$CRON_LOG" ] || [ "$(jq -r '.date' "$CRON_LOG" 2>/dev/null)" != "$TODAY" ]; then
    cat > "$CRON_LOG" <<EOF
{
  "date": "$TODAY",
  "runs": []
}
EOF
fi

# Mark session as started
TMP=$(mktemp)
jq --arg s "$SESSION" --arg t "$START_TIME" \
  '.runs += [{"session": $s, "started_at": $t, "status": "running", "finished_at": null, "exit_code": null, "error": null}]' \
  "$CRON_LOG" > "$TMP" && mv "$TMP" "$CRON_LOG"

# Run the actual check
cd "$SCRIPT_DIR"
./run-check.sh "$SESSION" 2>&1
EXIT_CODE=$?

FINISH_TIME=$(date +%Y-%m-%dT%H:%M:%S%z)

# Update status
TMP=$(mktemp)
if [ $EXIT_CODE -eq 0 ]; then
    STATUS="success"
    ERROR="null"
else
    STATUS="failed"
    # Grab last 3 lines of today's log for error context
    LOG_FILE="$SCRIPT_DIR/logs/${TODAY}.log"
    if [ -f "$LOG_FILE" ]; then
        ERROR=$(tail -3 "$LOG_FILE" | tr '\n"\\' ' ' | head -c 200)
    else
        ERROR="exit code $EXIT_CODE"
    fi
fi

jq --arg s "$SESSION" --arg st "$STATUS" --arg ft "$FINISH_TIME" --arg ec "$EXIT_CODE" --arg err "$ERROR" \
  '(.runs | to_entries | map(select(.value.session == $s and .value.status == "running")) | last .key) as $idx |
  if $idx then
    .runs[$idx].status = $st |
    .runs[$idx].finished_at = $ft |
    .runs[$idx].exit_code = ($ec | tonumber) |
    .runs[$idx].error = (if $err == "null" then null else $err end)
  else . end' "$CRON_LOG" > "$TMP" && mv "$TMP" "$CRON_LOG"
