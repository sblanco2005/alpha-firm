# Skill: Price Fetching

## Purpose
This skill defines how to fetch current market prices for stocks, crypto, and ETFs.

## HARD RULES (added 2026-07-02 — see REMEDIATION-PLAN.md)

1. **Single source of truth**: all numeric prices (fills, checkpoints, NAV marks, SPY benchmark, VIX) come from the price-fetch MCP (`mcp/price_server.py` — Yahoo Finance / CoinGecko) or a direct Yahoo Finance chart-API fetch. **Brave Search is BANNED for price data.** It may be used for news/qualitative research only. The 2026-07-02 audit found search-mediated prices stale by 1-3 trading days (SPY's "Jun 26 close" was the Jun 23 close; CAT's Apr 28 entry was the Apr 27 close).
2. **OHLC sanity check on every fill**: before recording a buy or sell, fetch the ticker's OHLC for the trade date and verify the fill price lies within [low, high]. Out of range → re-fetch; never record an unverified number.
3. **No fabricated fallbacks**: if a price cannot be fetched, record `price_unavailable` and skip/defer the action. Never estimate, recall from memory, or copy from a search snippet.
4. **Benchmark**: SPY inception baseline is **$634.09** (close 2026-03-27). Fetch current SPY via the MCP each session.

## Price Sources

### Stocks & ETFs — Yahoo Finance API (no auth required)
```
URL: https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?range=5d&interval=1d
```
Parse the response JSON:
- `chart.result[0].meta.regularMarketPrice` → current price
- `chart.result[0].meta.previousClose` → yesterday's close
- `chart.result[0].meta.fiftyTwoWeekHigh` → 52-week high
- `chart.result[0].meta.fiftyTwoWeekLow` → 52-week low

Example tickers: `AAPL`, `SPY`, `MARA`, `TQQQ`, `GLD`

### Crypto — CoinGecko API (no auth required)
```
URL: https://api.coingecko.com/api/v3/simple/price?ids={ID}&vs_currencies=usd&include_24hr_change=true
```
Common IDs: `bitcoin`, `ethereum`, `solana`, `cardano`, `chainlink`, `avalanche-2`

For multiple coins:
```
URL: https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true
```

### Prediction Markets — Polymarket
```
URL: https://clob.polymarket.com/markets
```
Note: Polymarket API may require specific endpoints for individual markets. Search Brave for the specific market URL and fetch that.

## Fetch Strategy

1. **Batch when possible** — fetch multiple tickers in one request where the API supports it
2. **Always get the current price** before making a recommendation — never recommend a ticker without knowing its current price
3. **Compare to previous close** — the day's move matters for timing
4. **Note the 52-week range** — where is the stock relative to its range? This informs conviction.

## Error Handling

If a fetch fails:
1. Try once more with the same URL
2. If still failing, record `price_unavailable` — do NOT fall back to Brave Search (see HARD RULES above)
3. Note "price unverified" in your recommendation and set conviction -= 2

## Price Data to Include in Recommendation

Always populate `current_price` in your JSON output with the ACTUAL fetched price, not a guess. If you couldn't fetch the price, set it to `0.00` and note this in your thesis.

## Rate Limits
- Yahoo Finance: ~2000 requests/hour (generous, don't worry)
- CoinGecko free tier: 10-30 calls/minute (sufficient for our use)
- Fetch MCP: No inherent rate limit, but be efficient

## Important Notes
- Prices are delayed ~15 minutes for stocks (real-time requires paid API)
- Crypto prices are real-time from CoinGecko
- Pre-market / after-hours: Yahoo Finance shows extended hours prices in `meta.regularMarketPrice` during those sessions
- Weekend: Stock prices will show Friday's close. Crypto trades 24/7.
