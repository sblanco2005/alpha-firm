#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Model provider selector (sourced, not executed)
#
# Every script that invokes `claude` sources this. It picks the provider from
# MODEL_PROVIDER and exports exactly the env the Claude Code CLI needs:
#
#   MODEL_PROVIDER=glm      → GLM (glm-5.2) via z.ai's Anthropic-compatible endpoint
#   MODEL_PROVIDER=claude   → real Claude on the Max subscription login
#
# Provider values + the z.ai token live in .env.models (gitignored, chmod 600).
# These used to sit in ~/.claude/settings.json's `env` block, which hijacked EVERY
# claude call globally and made a per-run A/B impossible. Moving them here makes the
# provider a per-invocation choice.
#
# Set the default persistently:   ./scripts/model.sh glm|claude
# Override for one run:           MODEL_PROVIDER=claude ./run-check.sh closing
#
# NOTE: this file deliberately does NOT touch ANTHROPIC_API_KEY — run-check.sh saves
# it for the quota fallback and unsets it before calling claude.
# ═══════════════════════════════════════════════════════════════

_MODEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$_MODEL_ROOT/.env.models" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$_MODEL_ROOT/.env.models"
    set +a
fi

MODEL_PROVIDER="${MODEL_PROVIDER:-glm}"

case "$MODEL_PROVIDER" in
    glm)
        if [ -z "${ZAI_AUTH_TOKEN:-}" ] || [ -z "${ZAI_BASE_URL:-}" ]; then
            echo "model-env.sh: MODEL_PROVIDER=glm but .env.models is missing ZAI_BASE_URL/ZAI_AUTH_TOKEN" >&2
            return 1 2>/dev/null || exit 1
        fi
        export ANTHROPIC_BASE_URL="$ZAI_BASE_URL"
        export ANTHROPIC_AUTH_TOKEN="$ZAI_AUTH_TOKEN"
        export ANTHROPIC_DEFAULT_OPUS_MODEL="${GLM_OPUS_MODEL:-glm-5.2[1m]}"
        export ANTHROPIC_DEFAULT_SONNET_MODEL="${GLM_SONNET_MODEL:-glm-5.2[1m]}"
        export ANTHROPIC_DEFAULT_HAIKU_MODEL="${GLM_HAIKU_MODEL:-glm-4.7}"
        MODEL_LABEL="GLM (${GLM_SONNET_MODEL:-glm-5.2} via z.ai)"
        ;;
    claude)
        # Clear every GLM override so the CLI uses the claude.ai Max subscription login.
        unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN \
              ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL
        MODEL_LABEL="Claude (Max subscription)"
        ;;
    *)
        echo "model-env.sh: unknown MODEL_PROVIDER='$MODEL_PROVIDER' (use: glm | claude)" >&2
        return 1 2>/dev/null || exit 1
        ;;
esac

export MODEL_PROVIDER MODEL_LABEL

# ─── MCP config for every firm `claude` invocation ───────────────────────────
# Headless `claude -p` does NOT reliably inject project .mcp.json servers (even with
# enableAllProjectMcpServers), so the analysts silently ran with a partial toolset.
# Pass them explicitly. --strict-mcp-config also EXCLUDES the operator's personal
# claude.ai connectors (Gmail / Drive / Calendar / Era Context), which would otherwise
# be handed to autonomous agents running --dangerously-skip-permissions.
# Usage:  claude --dangerously-skip-permissions $CLAUDE_MCP_ARGS -p "$PROMPT"
CLAUDE_MCP_ARGS="--mcp-config $_MODEL_ROOT/.mcp.json --strict-mcp-config"
export CLAUDE_MCP_ARGS
