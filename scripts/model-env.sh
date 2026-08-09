#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Model provider selector (sourced, not executed)
#
# Every script that invokes `claude` sources this. It picks the provider from
# MODEL_PROVIDER and exports exactly the env the Claude Code CLI needs:
#
#   MODEL_PROVIDER=kimi     → Kimi K3 (kimi-k3[1m]) via Moonshot's Anthropic-compatible
#                             endpoint (PRIMARY since 2026-08-09; pay-per-token API key)
#   MODEL_PROVIDER=claude   → real Claude on the subscription login (Pro tier since
#                             2026-08-09 — quota too small for primary use)
#   MODEL_PROVIDER=fable    → Fable 5 for every model tier on the subscription login
#   MODEL_PROVIDER=glm      → GLM (glm-5.2) via z.ai — DORMANT, account cancelled 2026-08-09
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

# Precedence: an explicit `MODEL_PROVIDER=... ./run-check.sh` override wins; else the
# persisted default MODEL_PROVIDER_DEFAULT (set by scripts/model.sh, stored in .env.models
# — NOT .env, because callers source .env before this and it would clobber the override);
# else glm. .env.models is sourced just above, so MODEL_PROVIDER_DEFAULT is in scope.
MODEL_PROVIDER="${MODEL_PROVIDER:-${MODEL_PROVIDER_DEFAULT:-kimi}}"

case "$MODEL_PROVIDER" in
    kimi)
        if [ -z "${KIMI_AUTH_TOKEN:-}" ]; then
            echo "model-env.sh: MODEL_PROVIDER=kimi but .env.models is missing KIMI_AUTH_TOKEN" >&2
            return 1 2>/dev/null || exit 1
        fi
        # Per Moonshot's Claude Code integration guide, EVERY model tier plus the
        # subagent model must point at a Kimi model — a tier left unset requests a
        # Claude model name the Kimi endpoint can't recognize and fails silently
        # (background summarization on haiku tier, subagents, etc.).
        KIMI_MODEL="${KIMI_MODEL:-kimi-k3[1m]}"
        export ANTHROPIC_BASE_URL="${KIMI_BASE_URL:-https://api.moonshot.ai/anthropic}"
        export ANTHROPIC_AUTH_TOKEN="$KIMI_AUTH_TOKEN"
        export ANTHROPIC_MODEL="$KIMI_MODEL"
        export ANTHROPIC_DEFAULT_OPUS_MODEL="$KIMI_MODEL"
        export ANTHROPIC_DEFAULT_SONNET_MODEL="$KIMI_MODEL"
        export ANTHROPIC_DEFAULT_HAIKU_MODEL="$KIMI_MODEL"
        export ANTHROPIC_DEFAULT_FABLE_MODEL="$KIMI_MODEL"
        export CLAUDE_CODE_SUBAGENT_MODEL="$KIMI_MODEL"
        export CLAUDE_CODE_AUTO_COMPACT_WINDOW="${KIMI_COMPACT_WINDOW:-1048576}"
        export CLAUDE_CODE_EFFORT_LEVEL="${KIMI_EFFORT_LEVEL:-max}"
        MODEL_LABEL="Kimi K3 ($KIMI_MODEL via ${KIMI_BASE_URL:-https://api.moonshot.ai/anthropic})"
        ;;
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
        # Clear every third-party override so the CLI uses the claude.ai subscription login.
        unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL \
              ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL ANTHROPIC_DEFAULT_FABLE_MODEL \
              CLAUDE_CODE_SUBAGENT_MODEL CLAUDE_CODE_AUTO_COMPACT_WINDOW CLAUDE_CODE_EFFORT_LEVEL
        MODEL_LABEL="Claude (Pro subscription)"
        ;;
    fable)
        # Subscription login (no third-party endpoint), but route every model tier to
        # Fable 5 — so the PM AND all subagents run on Fable.
        unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL \
              CLAUDE_CODE_SUBAGENT_MODEL CLAUDE_CODE_AUTO_COMPACT_WINDOW CLAUDE_CODE_EFFORT_LEVEL
        export ANTHROPIC_DEFAULT_OPUS_MODEL="${FABLE_MODEL:-claude-fable-5}"
        export ANTHROPIC_DEFAULT_SONNET_MODEL="${FABLE_MODEL:-claude-fable-5}"
        export ANTHROPIC_DEFAULT_HAIKU_MODEL="${FABLE_MODEL:-claude-fable-5}"
        MODEL_LABEL="Fable 5 (subscription)"
        ;;
    *)
        echo "model-env.sh: unknown MODEL_PROVIDER='$MODEL_PROVIDER' (use: kimi | claude | fable | glm)" >&2
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
