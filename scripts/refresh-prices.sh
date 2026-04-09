#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Standalone Price Refresh
# Fetches current prices for all portfolio positions via Yahoo Finance
# and CoinGecko, then updates NAV in portfolio.json.
# No dashboard server required.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTFOLIO="$SCRIPT_DIR/../state/portfolio.json"

if [ ! -f "$PORTFOLIO" ]; then
    echo "ERROR: portfolio.json not found"
    exit 1
fi

POSITIONS=$(jq -r '.positions | length' "$PORTFOLIO")
if [ "$POSITIONS" -eq 0 ]; then
    echo "No positions to refresh"
    exit 0
fi

CASH=$(jq -r '.cash' "$PORTFOLIO")
TOTAL_MKT_VAL="0"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FETCH_FAILED=0

echo "Refreshing prices for $POSITIONS positions..."

for i in $(seq 0 $((POSITIONS - 1))); do
    TICKER=$(jq -r ".positions[$i].ticker" "$PORTFOLIO")
    ASSET_TYPE=$(jq -r ".positions[$i].asset_type" "$PORTFOLIO")
    SHARES=$(jq -r ".positions[$i].shares" "$PORTFOLIO")
    ENTRY=$(jq -r ".positions[$i].entry_price" "$PORTFOLIO")

    PRICE=""

    if [ "$ASSET_TYPE" = "crypto" ]; then
        # Map common tickers to CoinGecko IDs
        case "$TICKER" in
            BTC|BITCOIN) CGID="bitcoin" ;;
            ETH|ETHEREUM) CGID="ethereum" ;;
            SOL|SOLANA) CGID="solana" ;;
            ADA|CARDANO) CGID="cardano" ;;
            LINK|CHAINLINK) CGID="chainlink" ;;
            AVAX) CGID="avalanche-2" ;;
            *) CGID=$(echo "$TICKER" | tr '[:upper:]' '[:lower:]') ;;
        esac
        RESP=$(curl -sf --max-time 10 \
            "https://api.coingecko.com/api/v3/simple/price?ids=${CGID}&vs_currencies=usd" 2>/dev/null || true)
        if [ -n "$RESP" ]; then
            PRICE=$(echo "$RESP" | jq -r ".\"${CGID}\".usd // empty" 2>/dev/null || true)
        fi
    else
        # Stocks and ETFs via Yahoo Finance
        RESP=$(curl -sf --max-time 10 \
            -H "User-Agent: Mozilla/5.0" \
            "https://query1.finance.yahoo.com/v8/finance/chart/${TICKER}?range=1d&interval=1d" 2>/dev/null || true)
        if [ -n "$RESP" ]; then
            PRICE=$(echo "$RESP" | jq -r '.chart.result[0].meta.regularMarketPrice // empty' 2>/dev/null || true)
        fi
    fi

    if [ -n "$PRICE" ] && [ "$PRICE" != "null" ]; then
        MKT_VAL=$(echo "$SHARES * $PRICE" | bc -l)
        TOTAL_MKT_VAL=$(echo "$TOTAL_MKT_VAL + $MKT_VAL" | bc -l)
        CHANGE_PCT=$(echo "scale=2; ($PRICE - $ENTRY) / $ENTRY * 100" | bc -l)
        echo "  $TICKER: \$$PRICE (${CHANGE_PCT}% from entry) — ${SHARES} shares = \$$(printf '%.2f' "$MKT_VAL")"
    else
        # Fallback: use entry price so NAV isn't zeroed out
        MKT_VAL=$(echo "$SHARES * $ENTRY" | bc -l)
        TOTAL_MKT_VAL=$(echo "$TOTAL_MKT_VAL + $MKT_VAL" | bc -l)
        FETCH_FAILED=$((FETCH_FAILED + 1))
        echo "  $TICKER: FETCH FAILED — using entry price \$$ENTRY"
    fi
done

# Fetch SPY for benchmark tracking
SPY_RESP=$(curl -sf --max-time 10 -H "User-Agent: Mozilla/5.0" \
    "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d" 2>/dev/null || true)
SPY_PRICE=$(echo "$SPY_RESP" | jq -r '.chart.result[0].meta.regularMarketPrice // empty' 2>/dev/null || true)
SPY_INCEPTION=$(jq -r '.spy_inception_price // empty' "$PORTFOLIO")
if [ -n "$SPY_PRICE" ] && [ -n "$SPY_INCEPTION" ] && [ "$SPY_INCEPTION" != "null" ]; then
    SPY_RET=$(printf '%.2f' "$(echo "scale=4; ($SPY_PRICE - $SPY_INCEPTION) / $SPY_INCEPTION * 100" | bc -l)")
    echo "  SPY Benchmark: \$$SPY_PRICE (${SPY_RET}% from inception)"
else
    echo "  SPY Benchmark: FETCH FAILED"
fi

NAV=$(printf '%.2f' "$(echo "$CASH + $TOTAL_MKT_VAL" | bc -l)")
OLD_NAV=$(jq -r '.nav' "$PORTFOLIO")
HWM=$(jq -r '.high_water_mark // 0' "$PORTFOLIO")

# Update high water mark if NAV exceeds it
NEW_HWM="$HWM"
if [ "$(echo "$NAV > $HWM" | bc -l)" -eq 1 ]; then
    NEW_HWM="$NAV"
fi

# Atomic write: tmp → validate → mv
TMP_OUT=$(mktemp)
jq --arg nav "$NAV" --arg ts "$TIMESTAMP" --arg hwm "$NEW_HWM" \
    '.nav = ($nav | tonumber) | .last_updated = $ts | .high_water_mark = ($hwm | tonumber)' \
    "$PORTFOLIO" > "$TMP_OUT"

if jq empty "$TMP_OUT" 2>/dev/null; then
    mv "$TMP_OUT" "$PORTFOLIO"
    echo "  NAV: \$$OLD_NAV → \$$NAV (updated $TIMESTAMP)"
    if [ "$NEW_HWM" != "$HWM" ]; then
        echo "  New high water mark: \$$NEW_HWM"
    fi
else
    echo "  ERROR: Invalid JSON produced, skipping update"
    rm -f "$TMP_OUT"
    exit 1
fi

if [ "$FETCH_FAILED" -gt 0 ]; then
    echo "  WARNING: $FETCH_FAILED of $POSITIONS price fetches failed (used entry price as fallback)"
fi
