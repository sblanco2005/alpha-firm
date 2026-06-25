#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Weekly Losing-Trade Post-Mortem Runner
# Runs entirely on Claude Max subscription (no API tokens).
#
# Pipeline:
#   1. python weekly_postmortem.py gather   → state/retrospectives/{weekStart}.json
#   2. claude (skills/weekly-postmortem.md) → assigns root causes, drafts candidate
#      rules, writes reports/week-{N}-postmortem.md + candidate_rules back into retro
#   3. python weekly_postmortem.py promote  → merges candidates into
#      state/lessons-learned.json (auto-promotes at corroboration threshold)
#
# Usage:
#   ./scripts/run-postmortem.sh                # this week (Mon-Fri of today's week)
#   ./scripts/run-postmortem.sh --since inception   # one-time historical backfill
#
# Cron (add alongside the market-check entries; server is UTC):
#   0 9 * * 6 /home/clawd/alpha-firm/scripts/run-postmortem.sh >> /home/clawd/alpha-firm/logs/postmortem-cron.log 2>&1
#   (Saturday 09:00 UTC = 05:00 ET; full week's data is in, off-peak, weekend quota)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# Ensure claude CLI is on PATH (npm global bin not in cron's default PATH)
export PATH="/home/clawd/.npm-global/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# ─── Load environment variables ───
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

TODAY=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/${TODAY}-postmortem.log"
GATHER_ARGS="${1:-}"   # e.g. "--since inception"

mkdir -p "$LOG_DIR" "$SCRIPT_DIR/reports" "$SCRIPT_DIR/state/retrospectives"

log() {
    echo "[$(date +%Y-%m-%dT%H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

# ─── Save API key for fallback, then run on subscription first ───
SAVED_API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -n "$SAVED_API_KEY" ]; then
    log "INFO: ANTHROPIC_API_KEY saved for quota fallback. Running subscription mode first."
    unset ANTHROPIC_API_KEY
fi

log "═══════════════════════════════════════"
log "WEEKLY POST-MORTEM  |  Date: $TODAY"
log "Mode: Subscription (Max plan)"
log "═══════════════════════════════════════"

# ─── Step 1: gather loss context ───
log "Step 1: gather loss context ($GATHER_ARGS)"
GATHER_OUT=$(python3 "$SCRIPT_DIR/scripts/weekly_postmortem.py" gather $GATHER_ARGS 2>&1) || {
    log "ERROR: gather failed"
    echo "$GATHER_OUT" | tee -a "$LOG_FILE"
    exit 1
}
echo "$GATHER_OUT" | tee -a "$LOG_FILE"

RETRO_PATH=$(echo "$GATHER_OUT" | grep '^WROTE ' | awk '{print $2}')
if [ -z "$RETRO_PATH" ] || [ ! -f "$RETRO_PATH" ]; then
    log "ERROR: could not locate retro output path. Aborting."
    exit 1
fi

LOSS_COUNT=$(jq -r '.loss_count_analyzed // 0' "$RETRO_PATH")
if [ "$LOSS_COUNT" -eq 0 ]; then
    log "No losses in window — skipping reasoning + promote. Done."
    log "═══════════════════════════════════════"
    exit 0
fi

WEEK_START=$(jq -r '.week_start' "$RETRO_PATH")
WEEK_END=$(jq -r '.week_end' "$RETRO_PATH")
log "Analyzing $LOSS_COUNT losses from $WEEK_START → $WEEK_END ($RETRO_PATH)"

# ─── Step 2: reasoning (root-cause + candidate rules + report) ───
CLAUDE_PROMPT="Run the weekly losing-trade post-mortem for the window $WEEK_START → $WEEK_END.

READ skills/weekly-postmortem.md FIRST — it defines the root-cause taxonomy, the rule schema, and the exact output contract. Follow it exactly.

INPUT: $RETRO_PATH (already populated with enriched loss context: theses, checkpoint trajectories, exit reasons, agent scorecards, and any active lessons that should have caught each loss).

DO:
1. For each loss in .losses[], assign ONE primary root cause (+ optional secondary) from the taxonomy, each with a 1-2 sentence evidence-based explanation grounded in that loss's actual checkpoints/thesis/exit_reason.
2. Draft ONE candidate preventive rule per distinct (agent + root_cause + enforcement) pattern, using the rule schema in the skill. Each rule MUST include source_losses listing the real loss_ids it is based on, and an enforcement spec using one of the canonical enforcement types.
3. Write the human-readable report to reports/$(date +%Y)-week-postmortem.md (see skill for format).
4. Write your candidate_rules back INTO $RETRO_PATH under the top-level \"candidate_rules\" key (and a short analysis_notes summary), using the atomic write pattern: write to a .tmp file, validate with jq, then mv.

CRITICAL: You only DRAFT candidate rules. Do NOT set any rule to status 'active' — the deterministic promote step runs next and decides promotion by a corroboration threshold. Only emit candidates.

When writing any state JSON, use: write .tmp → jq validate → mv."

set +e
claude --dangerously-skip-permissions -p "$CLAUDE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

# ─── Fallback to API if subscription quota is exhausted ───
if [ $EXIT_CODE -ne 0 ] && grep -qi "out of extra usage" "$LOG_FILE"; then
    if [ -n "$SAVED_API_KEY" ]; then
        log "═══ QUOTA EXHAUSTED: Falling back to claude-sonnet-4-6 via API ═══"
        export ANTHROPIC_API_KEY="$SAVED_API_KEY"
        set +e
        claude --dangerously-skip-permissions \
            --model claude-sonnet-4-6 \
            -p "$CLAUDE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
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
fi

# ─── Step 3: promote candidate rules into lessons-learned.json ───
log "Step 3: promote candidate rules (corroboration threshold = 3)"
python3 "$SCRIPT_DIR/scripts/weekly_postmortem.py" promote --retro "$RETRO_PATH" 2>&1 | tee -a "$LOG_FILE"

# ─── Status summary ───
if [ -f "$SCRIPT_DIR/state/lessons-learned.json" ]; then
    ACTIVE=$(jq '[.rules[]|select(.status=="active")]|length' "$SCRIPT_DIR/state/lessons-learned.json")
    CANDIDATE=$(jq '[.rules[]|select(.status=="candidate")]|length' "$SCRIPT_DIR/state/lessons-learned.json")
    RETIRED=$(jq '[.rules[]|select(.status=="retired")]|length' "$SCRIPT_DIR/state/lessons-learned.json")
    log "STATUS: losses_analyzed=$LOSS_COUNT | lessons active=$ACTIVE candidate=$CANDIDATE retired=$RETIRED"
fi
log "═══════════════════════════════════════"
log "WEEKLY POST-MORTEM COMPLETE"
log "═══════════════════════════"
