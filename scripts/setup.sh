#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Setup Script (Subscription Model)
# Run once on your VPS to configure everything
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "═══════════════════════════════════════"
echo "  ⚡ Alpha Firm — Setup"
echo "  Mode: Claude Max Subscription"
echo "═══════════════════════════════════════"

# ─── 1. Check Claude Code CLI ───
echo ""
echo "Checking dependencies..."

command -v claude >/dev/null 2>&1 || {
    echo "❌ Claude Code CLI not found."
    echo "   Install with: npm install -g @anthropic-ai/claude-code"
    echo "   Then run: claude login"
    exit 1
}
echo "  ✅ Claude Code CLI: $(claude --version 2>/dev/null || echo 'installed')"

command -v node >/dev/null 2>&1 || {
    echo "❌ Node.js not found."
    echo "   Install: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
    exit 1
}
echo "  ✅ Node.js $(node -v)"

command -v jq >/dev/null 2>&1 || {
    echo "⚠️  jq not found. Installing..."
    sudo apt install -y jq 2>/dev/null || brew install jq 2>/dev/null || echo "Please install jq manually"
}
echo "  ✅ jq available"

# ─── 2. Verify subscription (NOT API key) ───
echo ""
echo "Checking billing mode..."

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo ""
    echo "⚠️  WARNING: ANTHROPIC_API_KEY is set in your environment!"
    echo "   Claude Code will bill to your API account, NOT your subscription."
    echo ""
    echo "   To use your Max subscription instead:"
    echo "     1. Run: unset ANTHROPIC_API_KEY"
    echo "     2. Add to ~/.bashrc: # unset ANTHROPIC_API_KEY"
    echo "     3. Run: claude logout && claude login"
    echo "        → Log in with your Max subscription credentials"
    echo ""
    read -p "   Unset ANTHROPIC_API_KEY now? (Y/n): " UNSET_KEY
    if [ "$UNSET_KEY" != "n" ] && [ "$UNSET_KEY" != "N" ]; then
        unset ANTHROPIC_API_KEY
        echo "  ✅ API key unset for this session"
        echo "     Add 'unset ANTHROPIC_API_KEY' to your ~/.bashrc to make permanent"
    fi
else
    echo "  ✅ No API key set — Claude Code will use subscription"
fi

# ─── 3. Check Brave Search API key ───
echo ""
echo "Checking MCP configuration..."

if grep -q "YOUR_BRAVE_API_KEY_HERE" .claude/settings.json 2>/dev/null; then
    echo "❌ Brave Search API key not configured"
    echo "   Get a free key at: https://brave.com/search/api/"
    read -p "   Enter your Brave API key (or Enter to skip): " BRAVE_KEY
    if [ -n "$BRAVE_KEY" ]; then
        sed -i '' "s/YOUR_BRAVE_API_KEY_HERE/$BRAVE_KEY/" .claude/settings.json
        echo "  ✅ Brave API key configured"
    else
        echo "  ⚠️  Skipped — agents won't be able to search live market data"
    fi
else
    echo "  ✅ Brave Search API key configured"
fi

# ─── 4. Execution Mode ───
echo ""
echo "  ✅ Running in SIMULATION mode"
echo "     Trades use real prices (via Brave Search) but no real orders are placed."
echo "     Portfolio tracks P&L as if trades were real."

# ─── 5. Set permissions & create directories ───
echo ""
echo "Setting up directories..."
mkdir -p logs reports alerts
for agent in macro crypto quant sentiment contrarian; do
    mkdir -p "memory/$agent"
done
chmod +x run-check.sh
chmod +x scripts/*.sh 2>/dev/null || true
echo "  ✅ All directories created and scripts executable"

# ─── 6. Verify state files ───
echo ""
echo "Verifying state files..."
for f in state/portfolio.json state/leaderboard.json state/trade-log.json state/daily-state.json; do
    if [ -f "$f" ]; then
        jq . "$f" >/dev/null 2>&1 && echo "  ✅ $f" || echo "  ❌ $f (invalid JSON!)"
    else
        echo "  ❌ $f (missing — will be created on first run)"
    fi
done

# ─── 7. Pre-cache MCP packages ───
echo ""
echo "Pre-caching MCP server packages (first install takes a minute)..."
npx -y @modelcontextprotocol/server-brave-search --version >/dev/null 2>&1 && echo "  ✅ brave-search-mcp" || echo "  ⏳ brave-search-mcp will install on first run"
npx -y @modelcontextprotocol/server-filesystem --version >/dev/null 2>&1 && echo "  ✅ mcp-filesystem" || echo "  ⏳ mcp-filesystem will install on first run"
# fetch MCP removed — Claude Code has a built-in Fetch tool

# ─── 8. Cron setup ───
echo ""
echo "═══════════════════════════════════════"
echo "  Cron Setup"
echo "═══════════════════════════════════════"
echo ""
echo "Recommended schedule (optimized for off-peak quota usage):"
echo ""
echo "  # Alpha Firm — Market Checks (M-F)"
echo "  # Times adjusted to avoid peak hours (5am-11am PT)"
echo "  00 7  * * 1-5 cd $SCRIPT_DIR && ./run-check.sh premarket >> logs/cron.log 2>&1"
echo "  30 12 * * 1-5 cd $SCRIPT_DIR && ./run-check.sh midday    >> logs/cron.log 2>&1"
echo "  45 15 * * 1-5 cd $SCRIPT_DIR && ./run-check.sh closing   >> logs/cron.log 2>&1"
echo ""
echo "Alternative (standard market hours — uses more peak quota):"
echo "  30 9  * * 1-5 cd $SCRIPT_DIR && ./run-check.sh morning   >> logs/cron.log 2>&1"
echo ""

read -p "Install cron jobs? (recommended/standard/skip) [r/s/N]: " CRON_CHOICE
if [ "$CRON_CHOICE" = "r" ] || [ "$CRON_CHOICE" = "R" ]; then
    crontab -l 2>/dev/null | grep -v "alpha-firm\|run-check.sh" > /tmp/cron_backup || true
    cat >> /tmp/cron_backup << EOF
# Alpha Firm — Off-Peak Market Checks
00 7  * * 1-5 cd $SCRIPT_DIR && ./run-check.sh premarket >> logs/cron.log 2>&1
30 12 * * 1-5 cd $SCRIPT_DIR && ./run-check.sh midday    >> logs/cron.log 2>&1
45 15 * * 1-5 cd $SCRIPT_DIR && ./run-check.sh closing   >> logs/cron.log 2>&1
EOF
    crontab /tmp/cron_backup && rm /tmp/cron_backup
    echo "  ✅ Off-peak cron jobs installed"
elif [ "$CRON_CHOICE" = "s" ] || [ "$CRON_CHOICE" = "S" ]; then
    crontab -l 2>/dev/null | grep -v "alpha-firm\|run-check.sh" > /tmp/cron_backup || true
    cat >> /tmp/cron_backup << EOF
# Alpha Firm — Standard Market Checks
30 9  * * 1-5 cd $SCRIPT_DIR && ./run-check.sh morning  >> logs/cron.log 2>&1
30 12 * * 1-5 cd $SCRIPT_DIR && ./run-check.sh midday   >> logs/cron.log 2>&1
45 15 * * 1-5 cd $SCRIPT_DIR && ./run-check.sh closing  >> logs/cron.log 2>&1
EOF
    crontab /tmp/cron_backup && rm /tmp/cron_backup
    echo "  ✅ Standard cron jobs installed"
else
    echo "  ⚠️  Skipped — install manually when ready"
fi

# ─── Done ───
echo ""
echo "═══════════════════════════════════════"
echo "  ⚡ Setup Complete!"
echo "═══════════════════════════════════════"
echo ""
echo "  Billing:   Claude Max subscription (\$0 per check)"
echo "  Execution: Claude Code subagents (parallel)"
echo "  Reporting: Cowork tasks (see cowork-tasks.md)"
echo ""
echo "  Test run:"
echo "    cd $SCRIPT_DIR && ./run-check.sh morning"
echo ""
echo "  Check status:"
echo "    ./scripts/status.sh"
echo ""
echo "  Cowork setup:"
echo "    Open Claude Desktop → Cowork → paste prompts from cowork-tasks.md"
echo ""
echo "  Monitor quota:"
echo "    Run 'claude /status' to check remaining weekly allocation"
echo ""
