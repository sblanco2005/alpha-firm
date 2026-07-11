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
# The persisted default lives in .env.models as MODEL_PROVIDER_DEFAULT — NOT in .env.
# Runner scripts source .env BEFORE model-env.sh, so a MODEL_PROVIDER in .env would clobber
# a one-off `MODEL_PROVIDER=claude ./run-check.sh` override. .env.models is sourced inside
# model-env.sh (after .env), so the override survives.
ENV_FILE="$DIR/.env.models"

current() {
    local v
    v=$(grep -E '^MODEL_PROVIDER_DEFAULT=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)
    echo "${v:-glm}"
}

set_provider() {
    local p="$1"
    touch "$ENV_FILE"
    if grep -qE '^MODEL_PROVIDER_DEFAULT=' "$ENV_FILE" 2>/dev/null; then
        sed -i -E "s|^MODEL_PROVIDER_DEFAULT=.*|MODEL_PROVIDER_DEFAULT=${p}|" "$ENV_FILE"
    else
        printf '\n# Persisted default model provider (glm | claude); overridable per-run via MODEL_PROVIDER=...\nMODEL_PROVIDER_DEFAULT=%s\n' "$p" >> "$ENV_FILE"
    fi
    # Migrate away from a stale MODEL_PROVIDER in .env if present (it would clobber overrides).
    [ -f "$DIR/.env" ] && sed -i -E '/^MODEL_PROVIDER=/d' "$DIR/.env" 2>/dev/null || true
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
    glm|claude|fable)
        set_provider "$1"
        echo "MODEL_PROVIDER=$1  (takes effect on the next run)"
        ;;
    status)
        c=$(current)
        echo "MODEL_PROVIDER=$c"
        [ -f "$DIR/.env.models" ] || echo "  ⚠ .env.models missing — glm mode will fail"
        ;;
    test)
        echo "Probing providers with a 1-token prompt…"
        probe glm
        probe claude
        probe fable
        echo "(current default: $(current))"
        ;;
    *)
        echo "usage: $0 [glm|claude|fable|status|test]" >&2
        exit 1
        ;;
esac
