#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Toggle which model the firm runs on.
#
#   ./scripts/model.sh              # show current provider
#   ./scripts/model.sh glm          # GLM 5.2 via z.ai (default)
#   ./scripts/model.sh claude       # real Claude on the Max subscription
#   ./scripts/model.sh test         # probe BOTH providers with a 1-token prompt
#
# Writes MODEL_PROVIDER into .env; every claude-invoking script sources
# scripts/model-env.sh and honours it. Takes effect on the NEXT run (cron or manual).
# For a one-off without changing the default:  MODEL_PROVIDER=claude ./run-check.sh closing
# ═══════════════════════════════════════════════════════════════

set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$DIR/.env"

current() {
    local v
    v=$(grep -E '^MODEL_PROVIDER=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)
    echo "${v:-glm}"
}

set_provider() {
    local p="$1"
    touch "$ENV_FILE"
    if grep -qE '^MODEL_PROVIDER=' "$ENV_FILE" 2>/dev/null; then
        sed -i -E "s|^MODEL_PROVIDER=.*|MODEL_PROVIDER=${p}|" "$ENV_FILE"
    else
        printf '\n# Which model the firm runs on: glm | claude\nMODEL_PROVIDER=%s\n' "$p" >> "$ENV_FILE"
    fi
}

# Fire a trivial prompt at one provider and report which model answered.
probe() {
    local p="$1" out
    out=$(cd "$DIR" && MODEL_PROVIDER="$p" bash -c '
        set -a; [ -f .env ] && . ./.env; set +a
        unset ANTHROPIC_API_KEY
        . ./scripts/model-env.sh
        export PATH="$HOME/.npm-global/bin:$PATH"
        timeout 120 claude -p "Reply with exactly: PONG" 2>&1 | tail -3
    ' 2>&1) || true
    printf '  %-7s → %s\n' "$p" "$(echo "$out" | tr '\n' ' ' | cut -c1-120)"
}

case "${1:-status}" in
    glm|claude)
        set_provider "$1"
        echo "MODEL_PROVIDER=$1  (takes effect on the next run)"
        ;;
    status)
        c=$(current)
        echo "MODEL_PROVIDER=$c"
        [ -f "$DIR/.env.models" ] || echo "  ⚠ .env.models missing — glm mode will fail"
        ;;
    test)
        echo "Probing both providers with a 1-token prompt…"
        probe glm
        probe claude
        echo "(current default: $(current))"
        ;;
    *)
        echo "usage: $0 [glm|claude|status|test]" >&2
        exit 1
        ;;
esac
