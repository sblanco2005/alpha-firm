#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Market Check Entry Point
# Runs entirely on Claude Max subscription (no API tokens)
# Usage: ./run-check.sh [morning|midday|closing|premarket]
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Load environment variables ───
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

SESSION="${1:-morning}"
TODAY=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/${TODAY}.log"

mkdir -p "$LOG_DIR" "$SCRIPT_DIR/reports" "$SCRIPT_DIR/alerts"

log() {
    echo "[$(date +%Y-%m-%dT%H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

# ─── CRITICAL: Ensure we're on subscription, not API billing ───
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    log "WARNING: ANTHROPIC_API_KEY is set! Claude Code will bill to API instead of subscription."
    log "Run: unset ANTHROPIC_API_KEY"
    log "Unsetting for this session..."
    unset ANTHROPIC_API_KEY
fi

# ─── Skip weekends (stocks closed, crypto could run separately) ───
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -gt 5 ]; then
    log "SKIP: Weekend (day $DAY_OF_WEEK)"
    # To enable crypto-only weekend checks, uncomment:
    # SESSION="crypto-weekend"
    exit 0
fi

# ─── Skip US market holidays ───
HOLIDAYS="2026-01-01 2026-01-19 2026-02-16 2026-04-03 2026-05-25 2026-07-03 2026-09-07 2026-11-26 2026-12-25"
for holiday in $HOLIDAYS; do
    if [ "$TODAY" = "$holiday" ]; then
        log "SKIP: US market holiday ($TODAY)"
        exit 0
    fi
done

# ─── Reset daily-state.json if date changed ───
DAILY_STATE="$SCRIPT_DIR/state/daily-state.json"
if [ -f "$DAILY_STATE" ] && command -v jq &>/dev/null; then
    STATE_DATE=$(jq -r '.date' "$DAILY_STATE" 2>/dev/null || echo "")
    if [ "$STATE_DATE" != "$TODAY" ]; then
        log "Resetting daily state (was $STATE_DATE, now $TODAY)"
        TMP_STATE=$(mktemp)
        jq --arg d "$TODAY" '.date = $d | .checks = 0 | .bought = false | .sessions_completed = []' "$DAILY_STATE" > "$TMP_STATE" && mv "$TMP_STATE" "$DAILY_STATE"
    fi
    # Check if all 3 checks already done
    CHECKS_DONE=$(jq -r '.checks' "$DAILY_STATE" 2>/dev/null || echo 0)
    if [ "$CHECKS_DONE" -ge 3 ]; then
        log "SKIP: All 3 market checks completed for today"
        exit 0
    fi
fi

# ─── Market hours check (stocks: 9:30am-4pm ET) ───
if [ "$SESSION" != "premarket" ]; then
    CURRENT_ET=$(TZ="America/New_York" date +%H%M)
    if [ "$CURRENT_ET" -lt 0930 ] || [ "$CURRENT_ET" -ge 1600 ]; then
        log "WARNING: US stock market is closed (ET: $CURRENT_ET). Crypto-only trades may still work."
    fi
fi

# ─── Prune old memory files ───
log "Pruning memory files older than 5 days..."
for agent in macro crypto quant sentiment contrarian; do
    MEMORY_DIR="$SCRIPT_DIR/memory/$agent"
    if [ -d "$MEMORY_DIR" ]; then
        FILE_COUNT=$(ls -1 "$MEMORY_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
        if [ "$FILE_COUNT" -gt 5 ]; then
            ls -1t "$MEMORY_DIR"/*.json | tail -n +6 | while read f; do
                log "  Pruned: $f"
                rm -f "$f"
            done
        fi
    fi
done

log "═══════════════════════════════════════"
log "MARKET CHECK: $SESSION"
log "Date: $TODAY | Time: $TIMESTAMP"
log "Mode: Subscription (Max plan)"
log "═══════════════════════════════════════"

# ─── Run Claude Code on subscription ───
# --dangerously-skip-permissions: allows autonomous execution
# No --model flag: uses your subscription's default model
# MCP servers configured in .claude/settings.json
#
# The prompt tells Claude Code to:
# 1. Read CLAUDE.md for full instructions
# 2. Spawn 5 subagents in parallel (one per analyst)
# 3. Collect recommendations
# 4. Run PM decision logic
# 5. Execute trade if decided
# 6. Update all state files

claude --dangerously-skip-permissions \
    -p "Run a $SESSION market check for $TODAY.

READ CLAUDE.md FIRST for complete instructions.

Execute these steps:
1. Pre-flight: Read and update state/daily-state.json
1.5. OUTCOME EVALUATION (morning/premarket only): Read state/outcomes.json, evaluate any due checkpoints by fetching current prices via Brave Search, update outcomes and regenerate state/scorecards/*.json. Follow skills/outcome-evaluation.md. Skip for midday/closing.
2. Read each agent prompt from agents/*.md
3. Read current portfolio from state/portfolio.json
4. Spawn 5 PARALLEL subagents — one for each analyst (macro, crypto, quant, sentiment, contrarian):
   - Each subagent reads its own agent prompt + its own memory files
   - Each subagent uses Brave Search for real-time market research
   - Each subagent uses Fetch to get current prices
   - Each subagent writes recommendation to memory/{agent_id}/${TODAY}.json
5. After all subagents complete, read all 5 recommendations
6. Apply PM decision logic from orchestrator.md
7. Execute any trades (update portfolio.json, leaderboard.json, trade-log.json)
8. Record ALL 5 recommendations to state/outcomes.json (follow skills/outcome-evaluation.md for schema)
9. Write a summary to logs/${TODAY}.md

IMPORTANT: When updating any state JSON file, write to a .tmp file first, validate with jq, then mv into place.
Example: write to state/portfolio.json.tmp → validate → mv state/portfolio.json.tmp state/portfolio.json

Session: $SESSION
Timestamp: $TIMESTAMP" \
    2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -ne 0 ]; then
    log "ERROR: Claude Code exited with code $EXIT_CODE"
    # Don't fail hard — next cron run will try again
fi

log "═══════════════════════════════════════"
log "MARKET CHECK COMPLETE: $SESSION"
log "═══════════════════════════════════════"

# ─── Quick status after check ───
if [ -f state/portfolio.json ] && command -v jq &>/dev/null; then
    NAV=$(jq -r '.nav // .cash' state/portfolio.json 2>/dev/null || echo "?")
    CASH=$(jq -r '.cash' state/portfolio.json 2>/dev/null || echo "?")
    POSITIONS=$(jq '.positions | length' state/portfolio.json 2>/dev/null || echo "?")
    log "STATUS: NAV=$${NAV} | Cash=$${CASH} | Positions=${POSITIONS}"
fi
