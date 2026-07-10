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
# The firm's trading day is US Eastern (market time), not the VPS clock (UTC) — otherwise
# the date/holiday/weekend flips at 8pm ET when UTC rolls to the next day.
TODAY=$(TZ="America/New_York" date +%Y-%m-%d)
TIMESTAMP=$(TZ="America/New_York" date +%Y-%m-%dT%H:%M:%S)
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/${TODAY}.log"

mkdir -p "$LOG_DIR" "$SCRIPT_DIR/reports" "$SCRIPT_DIR/alerts"

log() {
    echo "[$(TZ="America/New_York" date +%Y-%m-%dT%H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

# ─── Save API key for fallback, then unset so we don't bill the API ───
SAVED_API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -n "$SAVED_API_KEY" ]; then
    unset ANTHROPIC_API_KEY
fi

# ─── Select the model provider (glm | claude). See scripts/model-env.sh. ───
# Toggle the default with ./scripts/model.sh glm|claude, or override for one run:
#   MODEL_PROVIDER=claude ./run-check.sh closing
# shellcheck disable=SC1091
source "$SCRIPT_DIR/scripts/model-env.sh"

# ─── Skip weekends (stocks closed, crypto could run separately) ───
DAY_OF_WEEK=$(TZ="America/New_York" date +%u)
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
log "Pruning memory files older than 20 sessions..."
for agent in macro crypto quant sentiment contrarian; do
    MEMORY_DIR="$SCRIPT_DIR/memory/$agent"
    if [ -d "$MEMORY_DIR" ]; then
        FILE_COUNT=$(ls -1 "$MEMORY_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ' || true)
        if [ "$FILE_COUNT" -gt 20 ]; then
            ls -1t "$MEMORY_DIR"/*.json | tail -n +21 | while read f; do
                log "  Pruned: $f"
                rm -f "$f"
            done
        fi
    fi
done

log "═══════════════════════════════════════"
log "MARKET CHECK: $SESSION"
log "Date: $TODAY | Time: $TIMESTAMP"
log "Model: $MODEL_LABEL (MODEL_PROVIDER=$MODEL_PROVIDER)$([ -n "$SAVED_API_KEY" ] && echo " | API fallback: configured (claude-sonnet-4-6)" || echo " | API fallback: not configured")"
log "═══════════════════════════════════════"

# ─── Refresh portfolio prices before Claude starts ───
log "Refreshing portfolio prices..."
if bash "$SCRIPT_DIR/scripts/refresh-prices.sh" 2>&1 | tee -a "$LOG_FILE"; then
    log "Price refresh complete"
else
    log "WARNING: Price refresh failed — Claude will use stale NAV"
fi

# ─── Build prompt once so it can be reused in the API fallback ───
CLAUDE_PROMPT="Run a $SESSION market check for $TODAY.

READ CLAUDE.md FIRST for complete instructions.

Execute these steps:
1. Pre-flight: Read and update state/daily-state.json
1.5. OUTCOME EVALUATION (morning/premarket only): Read state/outcomes.json, evaluate any due checkpoints by fetching current prices via Brave Search, update outcomes and regenerate state/scorecards/*.json. Follow skills/outcome-evaluation.md. Skip for midday/closing.
2. Read each agent prompt from agents/*.md
3. Read current portfolio from state/portfolio.json
4. Spawn 6 PARALLEL subagents — one for each analyst (macro, crypto, quant, sentiment, contrarian, catalyst):
   - Each subagent reads its own agent prompt + its own memory files
   - Each subagent uses Brave Search for real-time market research
   - Each subagent uses Fetch to get current prices
   - Each subagent writes recommendation to memory/{agent_id}/${TODAY}.json
   - NOTE: Sentiment Scout owns current psychology/positioning. Catalyst Agent owns future event probability. Do not mix their mandates.
5. After all subagents complete, read all 6 recommendations
5.1. Pre-filter: reject picks with <2 concrete facts, no catalyst, no falsification condition, or sector/sizing violations.
5.2. Agent dominance check: read last 2 buys from state/trade-log.json. If both are from the same agent as the top candidate, deprioritize per orchestrator.md.
5.25. LIVE LESSONS ENFORCEMENT: read state/lessons-learned.json. For each rule with status=active and effective_date<=today<review_date, apply its enforcement spec as a hard gate/modifier during pre-filter and scoring, per orchestrator.md Step 1.6. Log every rule that fires (rule id, candidate, action).
5.3. Score using 6-CATEGORY FRAMEWORK from orchestrator.md: Evidence Strength (25%), Falsifiability (20%), Risk/Reward (20%), Portfolio Impact (15%), Signal Confirmation (10%), Execution Readiness (10%). Hard reject if Evidence < 6 or Falsifiability < 5.
5.4. Apply narrative penalty (0.85x) if >=2 narrative-bias triggers are present. See orchestrator.md.
5.5. Run 3-STAGE CAPITAL PROTECTION GATE (skills/debate.md) on top 2-3 picks:
   - Stage 1: Bear Risk Manager goes FIRST — classifies fatal_flaw/serious_weakness/manageable_risk, assigns risk flags
   - Stage 2: Bull Rebuttal — answers ONLY bear's specific attacks with evidence (bear must finish before bull starts)
   - Stage 3: Risk Chair (PM) — VETO if fatal flaw, PASS if 2+ unrebutted weaknesses, REDUCED if 1, ELIGIBLE if all rebutted
   - Unresolved uncertainty = negative. Inconclusive debate = trade does NOT proceed.
6. Apply PM decision logic from orchestrator.md (final = raw × track_record × fundamental × debate × narrative_penalty)
6.5. Pre-trade gates (if buying):
   - Fetch VIX level. Apply VIX-adjusted sizing: VIX<=25 → 15-30%, VIX 25-35 → max 15%, VIX>35 → max 10%.
   - Sector concentration check: verify no GICS sector exceeds 40% of NAV after the buy. If blocked, try next-best pick or PASS.
7. Execute any trades (update portfolio.json, leaderboard.json, trade-log.json)
7.5. Sync every BUY/SELL to Portclaude via mcp__portclaude__create_transaction (see skills/trade-execution.md)
8. Record ALL 6 recommendations to state/outcomes.json (follow skills/outcome-evaluation.md for schema)
9. Write a summary to logs/${TODAY}.md — include SPY benchmark return and alpha (SPY inception price: 634.09 — corrected 2026-07-02, close of 2026-03-27)

IMPORTANT: When updating any state JSON file, write to a .tmp file first, validate with jq, then mv into place.
Example: write to state/portfolio.json.tmp → validate → mv state/portfolio.json.tmp state/portfolio.json

IMPORTANT: The firm's clock is US Eastern (market time). EVERY timestamp you write to a state file — daily-state session objects, trade-log, portfolio, outcomes, scorecards, memory — MUST be US Eastern. Generate it with \`TZ=\"America/New_York\" date +%Y-%m-%dT%H:%M:%S\` (or reuse the Timestamp below). Never write a UTC timestamp.

IMPORTANT: This run executes on model provider \"$MODEL_PROVIDER\" ($MODEL_LABEL). In the decision object you append to state/trade-log.json decisions[], also record \"model_provider\": \"$MODEL_PROVIDER\" and \"model_label\": \"$MODEL_LABEL\" so sessions can be compared across models. Do not let this influence your analysis.

Session: $SESSION
Timestamp: $TIMESTAMP"

# ─── Run Claude Code on subscription ───
# --dangerously-skip-permissions: allows autonomous execution
# No --model flag: uses subscription default model
# MCP servers configured in .claude/settings.json
set +e
claude --dangerously-skip-permissions $CLAUDE_MCP_ARGS -p "$CLAUDE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

# ─── Fallback to API if subscription quota is exhausted ───
if [ $EXIT_CODE -ne 0 ] && grep -qi "out of extra usage" "$LOG_FILE"; then
    if [ -n "$SAVED_API_KEY" ]; then
        log "═══ QUOTA EXHAUSTED: Falling back to claude-sonnet-4-6 via API ═══"
        export ANTHROPIC_API_KEY="$SAVED_API_KEY"

        set +e
        claude --dangerously-skip-permissions $CLAUDE_MCP_ARGS \
            --model claude-sonnet-4-6 \
            -p "$CLAUDE_PROMPT" \
            2>&1 | tee -a "$LOG_FILE"
        FALLBACK_EXIT=${PIPESTATUS[0]}
        set -e

        unset ANTHROPIC_API_KEY

        if [ $FALLBACK_EXIT -ne 0 ]; then
            log "ERROR: API fallback also failed (code $FALLBACK_EXIT)"
        else
            log "API fallback completed successfully"
            EXIT_CODE=0
        fi
    else
        log "ERROR: Subscription quota exhausted and no ANTHROPIC_API_KEY in .env for fallback."
    fi
elif [ $EXIT_CODE -ne 0 ]; then
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
    log "STATUS: NAV=\$${NAV} | Cash=\$${CASH} | Positions=${POSITIONS}"
fi
