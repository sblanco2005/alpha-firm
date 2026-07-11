#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — End-to-end health check
#
#   ./scripts/healthcheck.sh          # fast checks (no model calls, ~5s)
#   ./scripts/healthcheck.sh --deep   # + live model/tool probes (costs quota, ~2-4 min)
#
# Exits non-zero if any check FAILs. Every check here corresponds to a real outage
# we have actually hit:
#   • run-check.sh lost its +x bit  → cron died silently with exit 126
#   • MCP servers declared in .claude/settings.json → never loaded (v2 reads .mcp.json)
#   • WebSearch unavailable on the z.ai endpoint → agents can't verify → forced PASS
#   • UTC vs ET date skew → sessions looked "not run" after 8pm ET
# ═══════════════════════════════════════════════════════════════

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
export PATH="$HOME/.npm-global/bin:$PATH"

DEEP=0
[ "${1:-}" = "--deep" ] && DEEP=1

PASS=0; FAIL=0; WARN=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ─────────────────────────── 1. Executables ───────────────────────────
hdr "1. Scripts & permissions"
[ -x run-check.sh ]              && ok "run-check.sh is executable"        || bad "run-check.sh NOT executable (cron will die with exit 126: chmod +x run-check.sh)"
[ -x scripts/cron-wrapper.sh ]   && ok "cron-wrapper.sh is executable"     || bad "cron-wrapper.sh NOT executable"
[ -f scripts/model-env.sh ]      && ok "scripts/model-env.sh present"      || bad "scripts/model-env.sh MISSING"
[ -x scripts/model.sh ]          && ok "scripts/model.sh is executable"    || warn "scripts/model.sh not executable"
command -v claude >/dev/null     && ok "claude CLI on PATH ($(claude --version 2>/dev/null | head -1))" || bad "claude CLI not on PATH"
command -v jq     >/dev/null     && ok "jq present"                        || bad "jq missing (run-check.sh state writes need it)"

# ─────────────────────────── 2. Config / secrets ──────────────────────
hdr "2. Config & credentials (values never printed)"
[ -f .env ] && ok ".env present" || bad ".env MISSING"
for k in BRAVE_API_KEY FINNHUB_API_KEY; do
    grep -qE "^${k}=.+" .env 2>/dev/null && ok ".env has $k" || bad ".env missing $k (\${$k} expansion in .mcp.json will fail)"
done
if [ -f .env.models ]; then
    ok ".env.models present"
    [ "$(stat -c %a .env.models 2>/dev/null)" = "600" ] && ok ".env.models is chmod 600" || warn ".env.models is not 600"
    for k in ZAI_BASE_URL ZAI_AUTH_TOKEN; do
        grep -qE "^${k}=.+" .env.models && ok ".env.models has $k" || bad ".env.models missing $k (glm mode will fail)"
    done
else
    bad ".env.models MISSING (glm mode will fail)"
fi
[ -f "$HOME/.claude/.credentials.json" ] && ok "Claude Max subscription login present" || warn "no ~/.claude/.credentials.json (claude mode will fail)"

# ─────────────────────────── 3. Model provider ────────────────────────
hdr "3. Model provider selection"
for p in glm claude; do
    out=$( set -a; . ./.env 2>/dev/null; set +a
           unset ANTHROPIC_API_KEY
           MODEL_PROVIDER=$p . ./scripts/model-env.sh >/dev/null 2>&1 \
             && echo "${MODEL_LABEL}|${ANTHROPIC_BASE_URL:-<unset>}" )
    if [ -n "$out" ]; then
        label="${out%%|*}"; url="${out##*|}"
        case "$p" in
            glm)    [ "$url" != "<unset>" ] && ok "glm    → $label ($url)"     || bad "glm resolved but ANTHROPIC_BASE_URL unset" ;;
            claude) [ "$url"  = "<unset>" ] && ok "claude → $label (no base_url override)" || bad "claude mode still has ANTHROPIC_BASE_URL=$url" ;;
        esac
    else
        bad "$p profile failed to resolve"
    fi
done
CUR=$(grep -E '^MODEL_PROVIDER_DEFAULT=' .env.models 2>/dev/null | tail -1 | cut -d= -f2)
ok "current default: MODEL_PROVIDER=${CUR:-glm (implicit)}"

# ─────────────────────────── 4. MCP servers ───────────────────────────
hdr "4. MCP servers (must be in .mcp.json — settings.json mcpServers is IGNORED by v2)"
[ -f .mcp.json ] && ok ".mcp.json present" || bad ".mcp.json MISSING — firm MCP servers will not load"
python3 -c "import json;json.load(open('.mcp.json'))" 2>/dev/null && ok ".mcp.json is valid JSON" || bad ".mcp.json invalid JSON"
if command -v claude >/dev/null; then
    MCP_OUT=$(timeout 90 claude mcp list 2>&1)
    for s in brave-search filesystem price-fetch finnhub portclaude; do
        if echo "$MCP_OUT" | grep -qE "^${s}:.*Connected"; then ok "MCP $s connected"
        else bad "MCP $s NOT connected"; fi
    done
fi

# ─────────────────────────── 5. State files ───────────────────────────
hdr "5. State files"
for f in state/portfolio.json state/trade-log.json state/daily-state.json; do
    if [ -f "$f" ]; then
        jq -e . "$f" >/dev/null 2>&1 && ok "$f valid JSON" || bad "$f INVALID JSON"
    else
        warn "$f missing"
    fi
done
if [ -f state/daily-state.json ]; then
    DS=$(jq -r '.date' state/daily-state.json 2>/dev/null)
    ET=$(TZ="America/New_York" date +%Y-%m-%d)
    UTC=$(date -u +%Y-%m-%d)
    ok "daily-state.date=$DS | ET today=$ET | UTC today=$UTC"
    [ "$ET" != "$UTC" ] && warn "ET and UTC differ right now — firm date logic must use ET (it does)"
fi

# ─────────────────────────── 6. Cron ──────────────────────────────────
hdr "6. Cron schedule"
CR=$(crontab -l 2>/dev/null)
for s in premarket midday closing; do
    echo "$CR" | grep -q "cron-wrapper.sh $s" && ok "cron entry for $s" || bad "no cron entry for $s"
done

# ─────────────────────────── 7. Dashboard API ─────────────────────────
hdr "7. Dashboard API + pm2"
if command -v pm2 >/dev/null; then
    for proc in alpha-firm-dashboard alpha-firm-metro; do
        pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(1)
sys.exit(0 if any(p['name']=='$proc' and p['pm2_env']['status']=='online' for p in d) else 1)
" && ok "pm2 $proc online" || bad "pm2 $proc NOT online"
    done
fi
TOKEN=""
[ -f dashboard/.env.dashboard ] && TOKEN=$(grep -E '^API_TOKEN=' dashboard/.env.dashboard 2>/dev/null | cut -d= -f2-)
AUTH=(); [ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")
for ep in /api/portfolio /api/sessions; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${AUTH[@]}" "http://localhost:3001$ep" 2>/dev/null)
    [ "$CODE" = "200" ] && ok "GET $ep → 200" || bad "GET $ep → ${CODE:-no response}"
done

# ─────────────────────────── 8. Deep probes ───────────────────────────
if [ "$DEEP" = "1" ]; then
    hdr "8. Live model + tool probes (uses quota)"
    # Probes use the EXACT invocation the firm uses ($CLAUDE_MCP_ARGS), otherwise they'd
    # test a toolset the analysts never actually get.
    probe() {  # $1=provider  $2=prompt  $3=needle
        local out
        out=$( set -a; . ./.env 2>/dev/null; set +a
               unset ANTHROPIC_API_KEY
               export MODEL_PROVIDER="$1"
               . ./scripts/model-env.sh
               timeout 300 claude --dangerously-skip-permissions $CLAUDE_MCP_ARGS -p "$2" 2>&1 | grep -viE "connectors are disabled" )
        echo "$out" | grep -q "$3"
    }
    probe glm    "Reply with exactly: PONG" "PONG" && ok "glm responds"    || bad "glm did NOT respond"
    probe claude "Reply with exactly: PONG" "PONG" && ok "claude responds" || bad "claude did NOT respond"

    probe "${CUR:-glm}" "Use the brave-search MCP tool to web-search 'SPY ETF'. Last line EXACTLY: SEARCH=WORKED or SEARCH=FAILED" "SEARCH=WORKED" \
        && ok "brave-search usable by the model (${CUR:-glm})" || bad "brave-search NOT usable (${CUR:-glm})"
    probe "${CUR:-glm}" "Use a finnhub MCP tool to quote AAPL. Last line EXACTLY: FINNHUB=WORKED or FINNHUB=FAILED" "FINNHUB=WORKED" \
        && ok "finnhub usable by the model (${CUR:-glm})" || bad "finnhub NOT usable (${CUR:-glm})"

    # WebSearch is an Anthropic server-side tool — expected to fail on z.ai. Informational.
    if probe claude "Use WebSearch for 'SPY ETF price'. Last line EXACTLY: WS=WORKED or WS=FAILED" "WS=WORKED"; then
        ok "WebSearch works on claude"
    else
        warn "WebSearch failed on claude (usually a real quota issue)"
    fi
    probe glm "Use WebSearch for 'SPY ETF price'. Last line EXACTLY: WS=WORKED or WS=FAILED" "WS=WORKED" \
        && warn "WebSearch unexpectedly works on glm" || ok "WebSearch unavailable on glm (expected — use brave-search MCP)"
fi

# ─────────────────────────── Summary ──────────────────────────────────
printf '\n\033[1mSummary:\033[0m \033[32m%d passed\033[0m, \033[31m%d failed\033[0m, \033[33m%d warnings\033[0m\n' "$PASS" "$FAIL" "$WARN"
[ "$DEEP" = "1" ] || printf '(run with --deep to also probe the models and their tools)\n'
[ "$FAIL" -eq 0 ] || exit 1
