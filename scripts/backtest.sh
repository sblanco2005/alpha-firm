#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Backtesting Runner
# Replays the full market check pipeline against historical dates
# Usage: ./scripts/backtest.sh <start_date> <end_date> [session]
# Example: ./scripts/backtest.sh 2026-01-02 2026-03-28 morning
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# ─── Load environment ───
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

# ─── Select model provider (glm | claude) — see scripts/model-env.sh ───
# shellcheck disable=SC1091
source "$SCRIPT_DIR/scripts/model-env.sh"

# ─── Unset API key to stay on subscription ───
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo "WARNING: Unsetting ANTHROPIC_API_KEY to use subscription billing"
    unset ANTHROPIC_API_KEY
fi

# ─── Arguments ───
START_DATE="${1:?Usage: ./scripts/backtest.sh <start_date> <end_date> [session]}"
END_DATE="${2:?Usage: ./scripts/backtest.sh <start_date> <end_date> [session]}"
SESSION="${3:-morning}"

# ─── Validate dates ───
if ! date -d "$START_DATE" +%Y-%m-%d &>/dev/null; then
    echo "ERROR: Invalid start date: $START_DATE (use YYYY-MM-DD)"
    exit 1
fi
if ! date -d "$END_DATE" +%Y-%m-%d &>/dev/null; then
    echo "ERROR: Invalid end date: $END_DATE (use YYYY-MM-DD)"
    exit 1
fi

# ─── Generate run ID ───
RUN_ID="bt-$(echo $START_DATE | tr -d '-')-$(echo $END_DATE | tr -d '-')-$(date +%Y%m%d%H%M%S)"
RESULTS_DIR="$SCRIPT_DIR/backtest/results/$RUN_ID"
LOG_FILE="$RESULTS_DIR/backtest.log"

log() {
    echo "[$(date +%Y-%m-%dT%H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

# ─── Create directory structure ───
mkdir -p "$RESULTS_DIR"/{memory/{macro,crypto,quant,sentiment,contrarian},scorecards,daily}

# ─── Initialize backtest state files ───
cat > "$RESULTS_DIR/portfolio.json" << 'EOF'
{
  "cash": 10000.00,
  "positions": [],
  "nav": 10000.00,
  "inception_date": "BACKTEST",
  "last_updated": null,
  "high_water_mark": 10000
}
EOF

cat > "$RESULTS_DIR/daily-state.json" << 'EOF'
{
  "date": null,
  "checks": 0,
  "bought": false,
  "sessions_completed": []
}
EOF

cat > "$RESULTS_DIR/trade-log.json" << 'EOF'
{
  "trades": [],
  "decisions": []
}
EOF

cat > "$RESULTS_DIR/outcomes.json" << 'EOF'
[]
EOF

cat > "$RESULTS_DIR/leaderboard.json" << 'EOF'
{
  "agents": {
    "macro": { "total_pnl": 0, "wins": 0, "losses": 0, "picks": 0, "picks_executed": 0, "reward_earned": 0 },
    "crypto": { "total_pnl": 0, "wins": 0, "losses": 0, "picks": 0, "picks_executed": 0, "reward_earned": 0 },
    "quant": { "total_pnl": 0, "wins": 0, "losses": 0, "picks": 0, "picks_executed": 0, "reward_earned": 0 },
    "sentiment": { "total_pnl": 0, "wins": 0, "losses": 0, "picks": 0, "picks_executed": 0, "reward_earned": 0 },
    "contrarian": { "total_pnl": 0, "wins": 0, "losses": 0, "picks": 0, "picks_executed": 0, "reward_earned": 0 }
  },
  "last_updated": null
}
EOF

cat > "$RESULTS_DIR/debate-log.json" << 'EOF'
[]
EOF

# ─── Count trading days ───
TRADING_DAYS=0
CURRENT="$START_DATE"
while [[ "$(date -d "$CURRENT" +%Y-%m-%d)" < "$(date -d "$END_DATE + 1 day" +%Y-%m-%d)" ]]; do
    DOW=$(date -d "$CURRENT" +%u)
    if [ "$DOW" -le 5 ]; then
        TRADING_DAYS=$((TRADING_DAYS + 1))
    fi
    CURRENT=$(date -d "$CURRENT + 1 day" +%Y-%m-%d)
done

# ─── Write config ───
cat > "$RESULTS_DIR/config.json" << EOF
{
  "run_id": "$RUN_ID",
  "start_date": "$START_DATE",
  "end_date": "$END_DATE",
  "session": "$SESSION",
  "starting_capital": 10000,
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "running",
  "trading_days_total": $TRADING_DAYS,
  "trading_days_completed": 0
}
EOF

log "═══════════════════════════════════════════════════════"
log "BACKTEST STARTING"
log "Run ID: $RUN_ID"
log "Period: $START_DATE → $END_DATE"
log "Session: $SESSION"
log "Trading days: $TRADING_DAYS"
log "Results: $RESULTS_DIR"
log "═══════════════════════════════════════════════════════"

# ─── Iterate through trading days ───
CURRENT="$START_DATE"
DAYS_COMPLETED=0

while [[ "$(date -d "$CURRENT" +%Y-%m-%d)" < "$(date -d "$END_DATE + 1 day" +%Y-%m-%d)" ]]; do
    DOW=$(date -d "$CURRENT" +%u)

    # Skip weekends
    if [ "$DOW" -gt 5 ]; then
        CURRENT=$(date -d "$CURRENT + 1 day" +%Y-%m-%d)
        continue
    fi

    DAYS_COMPLETED=$((DAYS_COMPLETED + 1))
    log "───────────────────────────────────────"
    log "Day $DAYS_COMPLETED/$TRADING_DAYS: $CURRENT ($SESSION)"
    log "───────────────────────────────────────"

    # Reset daily state for this simulated day
    TMP_DS=$(mktemp)
    jq --arg d "$CURRENT" '.date = $d | .checks = 0 | .bought = false | .sessions_completed = []' \
        "$RESULTS_DIR/daily-state.json" > "$TMP_DS" && mv "$TMP_DS" "$RESULTS_DIR/daily-state.json"

    # Run Claude Code for this simulated day
    claude --dangerously-skip-permissions \
        -p "You are running Alpha Firm in BACKTEST MODE.

READ CLAUDE.md FIRST for the full system architecture, then READ skills/backtesting.md for backtest-specific rules.

SIMULATED DATE: $CURRENT
SESSION: $SESSION
BACKTEST RUN: $RUN_ID
RESULTS DIRECTORY: $RESULTS_DIR

CRITICAL DATE-FIDELITY RULES:
1. Pretend today is $CURRENT. You MUST NOT use any information from after this date.
2. When using Brave Search, constrain queries: add 'before:$CURRENT' or 'as of $CURRENT'
3. Use CLOSING PRICE on $CURRENT as entry price (search: '{TICKER} stock price $CURRENT closing')
4. Agent memories and state are scoped to $RESULTS_DIR — do NOT read or write live state/ or memory/ directories.

EXECUTE THE FULL PIPELINE:
1. Read state from $RESULTS_DIR/daily-state.json, $RESULTS_DIR/portfolio.json
2. Read agent prompts from agents/*.md
3. Spawn 5 PARALLEL analyst subagents:
   - Each uses Brave Search with date constraints (before:$CURRENT)
   - Each writes recommendation to $RESULTS_DIR/memory/{agent_id}/$CURRENT.json
4. Collect all 5 recommendations
5. Run Bull/Bear Debate (skills/debate.md) on top 2-3 picks
   - Append debate results to $RESULTS_DIR/debate-log.json
6. Apply PM decision logic from orchestrator.md (including fundamental overlay + debate modifier)
7. Execute trade if decided — update $RESULTS_DIR/portfolio.json, trade-log.json, leaderboard.json
8. Record all 5 recommendations to $RESULTS_DIR/outcomes.json
9. Write day summary to $RESULTS_DIR/daily/$CURRENT.json

STATE FILE SAFETY: Write to .tmp first, validate with jq, then mv into place.
All reads/writes go to $RESULTS_DIR — never touch state/ or memory/ directories." \
        2>&1 | tee -a "$LOG_FILE"

    BT_EXIT=${PIPESTATUS[0]}

    if [ $BT_EXIT -ne 0 ]; then
        log "WARNING: Claude exited with code $BT_EXIT for $CURRENT — continuing"
    fi

    # Update config with progress
    TMP_CFG=$(mktemp)
    jq --argjson c "$DAYS_COMPLETED" '.trading_days_completed = $c' "$RESULTS_DIR/config.json" > "$TMP_CFG" && mv "$TMP_CFG" "$RESULTS_DIR/config.json"

    log "Day $DAYS_COMPLETED complete. Portfolio NAV: $(jq -r '.nav' "$RESULTS_DIR/portfolio.json" 2>/dev/null || echo '?')"

    CURRENT=$(date -d "$CURRENT + 1 day" +%Y-%m-%d)
done

# ─── Mark backtest complete ───
TMP_CFG=$(mktemp)
jq '.status = "completed"' "$RESULTS_DIR/config.json" > "$TMP_CFG" && mv "$TMP_CFG" "$RESULTS_DIR/config.json"

# ─── Generate summary report ───
log "Generating summary report..."

claude --dangerously-skip-permissions \
    -p "Generate a backtest summary report for run $RUN_ID.

READ skills/backtesting.md for the report format.

Read all files in $RESULTS_DIR:
- config.json (run parameters)
- portfolio.json (final state)
- trade-log.json (all trades)
- leaderboard.json (agent performance)
- outcomes.json (all recommendations)
- debate-log.json (all debate results)

Calculate all metrics described in skills/backtesting.md under 'Summary Report Generation'.
Write the report to $RESULTS_DIR/summary-report.md" \
    2>&1 | tee -a "$LOG_FILE"

log "═══════════════════════════════════════════════════════"
log "BACKTEST COMPLETE"
log "Run ID: $RUN_ID"
log "Trading days: $DAYS_COMPLETED"
log "Final NAV: $(jq -r '.nav' "$RESULTS_DIR/portfolio.json" 2>/dev/null || echo '?')"
log "Report: $RESULTS_DIR/summary-report.md"
log "═══════════════════════════════════════════════════════"
