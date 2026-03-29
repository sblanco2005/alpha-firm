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

### Position Sizing
- Calculate: `order_amount = portfolio_cash * (allocation_pct / 100)`
- Calculate shares: `shares = floor(order_amount / current_price)`
- Actual cost: `shares * current_price`
- Typical range: 15-30% of available cash

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
