#!/bin/bash
# Alpha Firm daily report — live prices from today's log + real-time market data
# Run: bash /home/clawd/alpha-firm/scripts/alphareport.sh

TODAY=$(date +%Y-%m-%d)
LOG_FILE="/home/clawd/alpha-firm/logs/${TODAY}.log"
PORTFOLIO="/home/clawd/alpha-firm/state/portfolio.json"
LEADERBOARD="/home/clawd/alpha-firm/state/leaderboard.json"

# Fallback to yesterday if today's log missing
if [ ! -f "$LOG_FILE" ]; then
    YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
    LOG_FILE="/home/clawd/alpha-firm/logs/${YESTERDAY}.log"
fi

python3 /home/clawd/alpha-firm/scripts/alphareport.py "$LOG_FILE" "$PORTFOLIO" "$LEADERBOARD"
