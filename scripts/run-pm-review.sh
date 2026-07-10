#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Weekly PM Decision Review Runner
# The PM audits its own passes, debate kills, and buys vs the SPY
# counterfactual, then converts repeated error patterns into BOUNDED
# self-adjustments. Protocol: skills/pm-review.md.
#
# Pipeline:
#   1. python pm_review.py gather     → state/pm-reviews/{weekStart}.json
#   2. claude (skills/pm-review.md)   → root causes + candidate_adjustments
#      written back into the review file + reports/{week}-pm-review.md
#   3. python pm_review.py promote    → bounded merge into state/pm-lessons.json
#   4. python pm_review.py scorecard  → state/scorecards/pm.json (PM reads at every check)
#
# Usage:
#   ./scripts/run-pm-review.sh              # last completed week
#   ./scripts/run-pm-review.sh --monthly    # adds monthly threshold/penalty calibration
#
# Cron (UTC; AFTER the 09:00 agent post-mortem):
#   0 10 * * 6   /home/clawd/alpha-firm/scripts/run-pm-review.sh >> /home/clawd/alpha-firm/logs/pm-review-cron.log 2>&1
#   0 11 1-7 * 6 /home/clawd/alpha-firm/scripts/run-pm-review.sh --monthly >> /home/clawd/alpha-firm/logs/pm-review-cron.log 2>&1
#   (second line fires only on the first Saturday of the month)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail
export PATH="/home/clawd/.npm-global/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# ─── Select model provider (glm | claude) — see scripts/model-env.sh ───
# shellcheck disable=SC1091
source "$SCRIPT_DIR/scripts/model-env.sh"

TODAY=$(date +%Y-%m-%d)
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/${TODAY}-pm-review.log"
MODE="${1:-}"
mkdir -p "$LOG_DIR" "$SCRIPT_DIR/reports" "$SCRIPT_DIR/state/pm-reviews"

log() { echo "[$(date +%Y-%m-%dT%H:%M:%S)] $1" | tee -a "$LOG_FILE"; }

# Subscription mode (no API billing)
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then unset ANTHROPIC_API_KEY; fi

log "═══ PM DECISION REVIEW | $TODAY ${MODE} ═══"

# ─── Step 1: gather ───
GATHER_OUT=$(python3 "$SCRIPT_DIR/scripts/pm_review.py" gather 2>&1) || {
    log "ERROR: gather failed"; echo "$GATHER_OUT" | tee -a "$LOG_FILE"; exit 1; }
echo "$GATHER_OUT" | tee -a "$LOG_FILE"

REVIEW_PATH=$(echo "$GATHER_OUT" | grep '^-> ' | awk '{print $2}')
if [ -z "$REVIEW_PATH" ] || [ ! -f "$REVIEW_PATH" ]; then
    log "ERROR: review file not found"; exit 1
fi

MEASURED=$(jq -r '.reviewed_decisions | length' "$REVIEW_PATH")
if [ "$MEASURED" -eq 0 ] && [ "$MODE" != "--monthly" ]; then
    log "No measurable decisions this week — refreshing scorecard only."
    python3 "$SCRIPT_DIR/scripts/pm_review.py" scorecard | tee -a "$LOG_FILE"
    exit 0
fi

WEEK=$(jq -r '.week_start' "$REVIEW_PATH")

# ─── Step 2: reasoning ───
MONTHLY_NOTE=""
if [ "$MODE" == "--monthly" ]; then
    MONTHLY_NOTE="ALSO run the MONTHLY RECALIBRATION section of skills/pm-review.md: threshold curve, penalty audit, and debate-gate value across ALL files in state/pm-reviews/. Include it in the report."
fi

CLAUDE_PROMPT="Run the weekly PM decision review for the week starting $WEEK.

READ skills/pm-review.md FIRST — it defines the counterfactual rule, root-cause taxonomy, adjustment bounds, and output contract. Follow it exactly.

INPUT: $REVIEW_PATH (reviewed_decisions + the PM's own decision log for the week).

DO:
1. Assign ONE root cause to every bad_pass / bad_kill / bad_buy. Be honest: 'process_correct_outcome_bad' is the right label for noise — do not manufacture lessons.
2. Draft candidate_adjustments ONLY for repeated patterns, with machine-enforceable specs inside the documented bounds.
3. Write both arrays (root_causes, candidate_adjustments) back into $REVIEW_PATH.
4. Write reports/${WEEK}-pm-review.md: scoreboard, each error + root cause, candidates, and one honest self-assessment paragraph.
$MONTHLY_NOTE"

log "Step 2: PM self-review via claude"
claude -p "$CLAUDE_PROMPT" --dangerously-skip-permissions 2>&1 | tee -a "$LOG_FILE" || {
    log "WARN: claude step failed — promoting with existing candidates only"; }

# ─── Steps 3+4: promote (bounded) + scorecard ───
python3 "$SCRIPT_DIR/scripts/pm_review.py" promote   | tee -a "$LOG_FILE"
python3 "$SCRIPT_DIR/scripts/pm_review.py" scorecard | tee -a "$LOG_FILE"

log "Done."
