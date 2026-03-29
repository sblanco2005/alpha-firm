#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Status Dashboard (CLI)
# Usage: ./scripts/status.sh
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "⚡ ALPHA FIRM — STATUS"
echo "═══════════════════════════════════════"
echo ""

# Portfolio
if [ -f state/portfolio.json ]; then
    CASH=$(jq -r '.cash' state/portfolio.json)
    NAV=$(jq -r '.nav' state/portfolio.json)
    POS_COUNT=$(jq '.positions | length' state/portfolio.json)
    LAST_UPDATE=$(jq -r '.last_updated' state/portfolio.json)
    PNL=$(echo "$NAV - 10000" | bc 2>/dev/null || echo "N/A")

    echo "💼 PORTFOLIO"
    echo "   NAV:        \$$NAV"
    echo "   Cash:       \$$CASH"
    echo "   Positions:  $POS_COUNT"
    echo "   P&L:        \$$PNL"
    echo "   Updated:    $LAST_UPDATE"

    if [ "$POS_COUNT" -gt 0 ]; then
        echo ""
        echo "   Open Positions:"
        jq -r '.positions[] | "   · \(.ticker) — \(.shares) shares @ $\(.entry_price) (via \(.agent))"' state/portfolio.json
    fi
else
    echo "❌ portfolio.json not found"
fi

echo ""

# Daily State
if [ -f state/daily-state.json ]; then
    DATE=$(jq -r '.date' state/daily-state.json)
    CHECKS=$(jq -r '.checks' state/daily-state.json)
    BOUGHT=$(jq -r '.bought' state/daily-state.json)

    echo "📅 TODAY ($DATE)"
    echo "   Checks:     $CHECKS/3"
    echo "   Bought:     $BOUGHT"
fi

echo ""

# Leaderboard
if [ -f state/leaderboard.json ]; then
    echo "🏆 LEADERBOARD"
    for agent in macro crypto quant sentiment contrarian; do
        PICKS=$(jq -r ".$agent.picks_executed" state/leaderboard.json)
        PNL=$(jq -r ".$agent.total_pnl" state/leaderboard.json)
        WINS=$(jq -r ".$agent.wins" state/leaderboard.json)
        LOSSES=$(jq -r ".$agent.losses" state/leaderboard.json)
        REWARD=$(jq -r ".$agent.reward_earned" state/leaderboard.json)

        case $agent in
            macro) ICON="🌍" ;;
            crypto) ICON="₿ " ;;
            quant) ICON="📊" ;;
            sentiment) ICON="📡" ;;
            contrarian) ICON="🔄" ;;
        esac

        printf "   %s %-12s  Picks: %s  W/L: %s/%s  P&L: \$%s  Reward: \$%s\n" \
            "$ICON" "$agent" "$PICKS" "$WINS" "$LOSSES" "$PNL" "$REWARD"
    done
fi

echo ""

# Recent memory
echo "🧠 LATEST RECOMMENDATIONS"
for agent in macro crypto quant sentiment contrarian; do
    LATEST=$(ls -1 memory/$agent/*.json 2>/dev/null | sort | tail -1)
    if [ -n "$LATEST" ]; then
        TICKER=$(jq -r '.sessions[-1].recommendation.ticker // "none"' "$LATEST" 2>/dev/null)
        CONV=$(jq -r '.sessions[-1].recommendation.conviction // "?"' "$LATEST" 2>/dev/null)
        case $agent in
            macro) ICON="🌍" ;;
            crypto) ICON="₿ " ;;
            quant) ICON="📊" ;;
            sentiment) ICON="📡" ;;
            contrarian) ICON="🔄" ;;
        esac
        printf "   %s %-12s → %s (conviction %s)\n" "$ICON" "$agent" "$TICKER" "$CONV"
    fi
done

echo ""

# Recent trades
if [ -f state/trade-log.json ]; then
    TOTAL=$(jq '.total_trades' state/trade-log.json)
    if [ "$TOTAL" -gt 0 ]; then
        echo "📋 LAST 5 TRADES"
        jq -r '.trades[-5:][] | "   [\(.date)] \(.action) \(.ticker) — $\(.amount // .entry_price) via \(.agent)"' state/trade-log.json 2>/dev/null
    else
        echo "📋 No trades yet"
    fi
fi

echo ""
echo "═══════════════════════════════════════"
