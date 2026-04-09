# Skill: Trade Execution (Simulation Mode)

## Purpose
This skill defines how the PM orchestrator executes simulated trades. All trades use **real market prices** fetched via Brave Search, but no real orders are placed. The portfolio tracks P&L as if trades were real.

## How It Works

1. Agent recommends a ticker with conviction score
2. PM decides to buy (or pass)
3. PM fetches the **current real price** using Brave Search or Fetch
4. Trade is recorded in state files at that real price
5. On sell, PM fetches the **current real price** again and calculates actual P&L

This gives you a realistic track record without risking capital.

## Price Fetching

### Stocks & ETFs
Search: `"[TICKER] stock price today"` via Brave Search
- Extract the current price from search snippets
- Verify with a second source if the price seems off
- Use the **last traded price** (not bid/ask)

### Crypto
Search: `"[SYMBOL] price USD today"` via Brave Search
- For major coins (BTC, ETH, SOL), prices are widely available in snippets
- For mining stocks (MARA, RIOT, IREN), use stock price search

### Prediction Markets
Search: `"polymarket [topic] odds"` or `"kalshi [topic] price"` via Brave Search
- Record the YES price as a decimal (e.g., 60 cents = $0.60 entry price)
- Record the market question and resolution date
- On "sell", search for updated odds
- On resolution, search for the outcome (YES = $1.00, NO = $0.00)

## Execution Rules

### Pre-Trade Checklist (PM must verify ALL before executing)
1. `daily-state.bought == false` (haven't bought today)
2. Portfolio has sufficient cash for the allocation
3. Position doesn't exceed 30% of total portfolio value
4. Not duplicating an existing position (same ticker)
5. A real current price was successfully fetched
6. **Sector concentration check (40% hard cap)** — see below
7. **Agent dominance check** — see below

### Sector Concentration Gate (40% Hard Cap)

Before executing any buy, verify the trade won't push any single GICS sector above 40% of NAV. This is a **HARD constraint** — no override, no exception.

**Steps:**
1. Determine the GICS sector for the ticker being bought. Use this mapping for common tickers, or look up via Brave Search if not listed:
   ```
   Technology: META, AAPL, MSFT, NVDA, AVGO, ORCL, INTU, PINS, CRM, ADBE, PLTR, CRWD, U, TEAM
   Financials: JPM, GS, BAC, V, MA, BRK.B, MSTR
   Healthcare: UNH, JNJ, PFE, LLY, ABBV, MRK
   Energy: XOM, CVX, XLE, OXY, COP
   Consumer Discretionary: AMZN, TSLA, NKE, HD, LOW, NCLH
   Consumer Staples: PG, KO, PEP, WMT, COST
   Industrials: DAL, UAL, BA, CAT, DE, GE, LOAR, LMT, RTX, FLY
   Utilities: DUK, NEE, SO, D
   Real Estate: AMT, PLD, SPG
   Materials: XLB, NEM, FCX
   Communication Services: GOOG, GOOGL, DIS, NFLX, T, VZ
   ETFs: GLD, TLT, IBIT, SPY, QQQ (sector = "ETF-Diversified")
   Crypto: BTC, ETH, SOL (sector = "Crypto")
   Prediction: POLY:* (sector = "Prediction")
   ```
2. Calculate current sector exposure: for each open position, sum `shares * entry_price` by sector. Divide each sector total by current NAV.
3. Calculate what the new sector exposure would be after this buy.
4. If any sector would exceed 40% of NAV after the buy: **BLOCK the trade. Do NOT execute.** Log as a PASS with reason: "Sector concentration cap: [Sector] would be X% of NAV (max 40%)". Move to the next-best recommendation.
5. This cap applies to **new buys only**. Existing positions that exceed 40% due to price appreciation are noted but not force-sold.

### Agent Dominance Guard Rail (Max 2 Consecutive Buys)

Before executing any buy, check if this would create 3 consecutive buys from the same agent.

**Steps:**
1. Read `state/trade-log.json`, filter for `action: "buy"`, get the last 2 entries.
2. If both of the last 2 buys were from the **same agent** as the current recommendation: **deprioritize** that agent's pick. It cannot be selected unless no other recommendation has conviction >= 6.
3. If deprioritized, move to the next-best recommendation from a different agent.
4. If no alternative with conviction >= 6 exists, the deprioritized agent may proceed — log: "Dominance guard rail overridden — no alternative with conviction >= 6."
5. Sells do NOT count — only `action: "buy"` entries.

### VIX-Adjusted Position Sizing

Before calculating position size, fetch current VIX level via Brave Search ("VIX index level today").

| VIX Level | Max Allocation (% of cash) | Rationale |
|-----------|---------------------------|-----------|
| VIX <= 25 | 15-30% (normal) | Low volatility, standard sizing |
| 25 < VIX <= 35 | max 15% | Elevated volatility, reduce exposure |
| VIX > 35 | max 10% | High volatility, minimal new risk |

If VIX cannot be fetched, assume VIX > 25 (conservative default).

Log the VIX level and resulting size cap in the trade record.

### Position Sizing
- Fetch VIX and determine max allocation tier (see above)
- Calculate: `order_amount = portfolio_cash * (allocation_pct / 100)`
- Calculate shares: `shares = floor(order_amount / current_price)`
- Actual cost: `shares * current_price`
- Allocation capped by VIX tier

### SPY Benchmark Tracking

After every trade or PASS decision, fetch SPY current price and calculate benchmark return:
```
spy_return_pct = (current_spy_price / portfolio.spy_inception_price - 1) * 100
alpha = portfolio_pnl_pct - spy_return_pct
```
Include SPY return and alpha in the daily log summary.

### Buying

1. Fetch current price via Brave Search
2. Calculate position size and shares
3. Write to `state/portfolio.json.tmp`:
   ```json
   {
     "cash": "<previous cash - actual cost>",
     "positions": [
       ...existing,
       {
         "ticker": "AAPL",
         "asset_type": "stock",
         "shares": 10,
         "entry_price": 245.50,
         "entry_date": "2026-03-28",
         "agent": "quant",
         "mode": "simulated"
       }
     ],
     "nav": "<recalculate>",
     "last_updated": "<timestamp>"
   }
   ```
4. Validate JSON with `jq`, then `mv` into place
5. Update `state/daily-state.json`: set `bought = true`, add session to `sessions_completed`
6. Update `state/trade-log.json`: append to `trades` array and `decisions` array
7. Update `state/leaderboard.json`: increment `picks` and `picks_executed` for the recommending agent
8. **Sync to Portclaude**: Call `mcp__portclaude__create_transaction` with:
   ```
   symbol: ticker
   action: "buy"
   quantity: shares
   price: entry_price
   date: today (YYYY-MM-DD)
   asset_type: "stock"|"etf"|"crypto" (map from position asset_type)
   portfolio: "AlphaFirm"
   notes: "Alpha Firm | Agent: {agent_id} | Conviction: {conviction} | Session: {session}"
   ```

### Selling

1. Fetch current price for the position via Brave Search
2. Calculate realized P&L:
   ```
   sale_value = shares * current_price
   pnl = sale_value - (shares * entry_price)
   pnl_pct = (pnl / (shares * entry_price)) * 100
   ```
3. Update `state/portfolio.json`:
   - Add `sale_value` back to `cash`
   - Remove position from `positions` array
   - Recalculate `nav`
4. Update `state/trade-log.json`: append sell record with P&L
5. Update `state/leaderboard.json` for the recommending agent:
   - Add `pnl` to agent's `total_pnl`
   - Increment `wins` (if pnl > 0) or `losses` (if pnl <= 0)
   - Update `best_trade` / `worst_trade` if applicable
   - Recalculate `reward_earned` (see orchestrator.md for formula)
6. **Selling does NOT count as the daily buy** — you can sell anytime
7. **Sync to Portclaude**: Call `mcp__portclaude__create_transaction` with:
   ```
   symbol: ticker
   action: "sell"
   quantity: shares
   price: current_price (the sell price)
   date: today (YYYY-MM-DD)
   asset_type: "stock"|"etf"|"crypto"
   portfolio: "AlphaFirm"
   notes: "Alpha Firm | Agent: {agent_id} | P&L: {pnl_pct}% | Reason: {sell_reason}"
   ```

### Prediction Market Positions
Track prediction markets the same way, but with extra fields:
```json
{
  "ticker": "POLY:BTC-100K-2026",
  "asset_type": "prediction",
  "market_question": "Will Bitcoin reach $100k by Dec 2026?",
  "shares": 100,
  "entry_price": 0.60,
  "resolution_date": "2026-12-31",
  "agent": "crypto",
  "mode": "simulated"
}
```
- Max 10% of portfolio in prediction markets (high-risk)
- On resolution: price becomes $1.00 (YES) or $0.00 (NO)
- Before resolution: search for updated odds to get current price

### Passing (No Trade)
1. Record the decision in `state/trade-log.json` decisions array:
   ```json
   {
     "date": "2026-03-28",
     "session": "morning",
     "decision": "pass",
     "reasoning": "No recommendation exceeded conviction 7",
     "agents_reviewed": { ... }
   }
   ```
2. Do NOT set `bought = true` — the PM can still buy in a later session today

## Portclaude Integration

Every BUY and SELL must be synced to Portclaude via MCP so positions are tracked externally.

### Asset Type Mapping
| Alpha Firm type | Portclaude asset_type |
|---|---|
| `stock` | `stock` |
| `etf` | `etf` |
| `crypto` | `crypto` |
| `prediction` | `stock` (closest match — add "Prediction Market" in notes) |

### On BUY
```
mcp__portclaude__create_transaction(
  symbol: "AAPL",
  action: "buy",
  quantity: 10,
  price: 245.50,
  date: "2026-03-28",
  asset_type: "stock",
  portfolio: "AlphaFirm",
  notes: "Alpha Firm | Agent: quant | Conviction: 8 | Session: morning"
)
```

### On SELL
```
mcp__portclaude__create_transaction(
  symbol: "AAPL",
  action: "sell",
  quantity: 10,
  price: 260.00,
  date: "2026-04-07",
  asset_type: "stock",
  portfolio: "AlphaFirm",
  notes: "Alpha Firm | Agent: quant | P&L: +5.9% | Reason: hit target"
)
```

### Rules
- Call Portclaude AFTER successfully updating local state files (portfolio.json, trade-log.json)
- If the Portclaude call fails, log the error but do NOT roll back the local trade — retry next session
- Portclaude handles deduplication automatically, so retries are safe
- Do NOT sync backtest trades to Portclaude — only live trades

## NAV Calculation
When updating NAV, recalculate from current state:
```
nav = cash + sum(position.shares * position.entry_price for each position)
```
Note: Since we don't have live streaming prices, NAV between checks uses entry prices. The real P&L is only calculated at sell time when we fetch the current price.

## State File Atomicity
**CRITICAL**: Always write state changes safely:
1. Write to `{filename}.tmp`
2. Validate with `jq . {filename}.tmp`
3. If valid: `mv {filename}.tmp {filename}`
4. If invalid: log error, do NOT overwrite the original

## Market Hours Reference
- Stocks/ETFs: 9:30 AM - 4:00 PM ET (Mon-Fri)
- Crypto: 24/7
- Prediction markets: 24/7
- Only fetch stock prices during market hours for accuracy
- Crypto and prediction market prices can be fetched anytime
