# Skill: Market Research via Brave Search

## Purpose
This skill defines how analyst agents should use the Brave Search MCP tool to research current market conditions, news, and data.

## Search Strategy

### For Each Agent Session, Run These Searches IN ORDER:

#### 1. Broad Market Context (all agents)
```
Query: "stock market today [date]"
Query: "S&P 500 nasdaq today"
```
This gives you the market backdrop. Every recommendation should be aware of whether the broad market is up/down and why.

#### 2. Agent-Specific Searches
Each agent should run 3-5 targeted searches based on their focus area. Examples:

**Macro Strategist:**
```
"federal reserve interest rate [month year]"
"treasury yields today"
"geopolitical risk [current events]"
"economic data releases this week"
```

**Crypto Analyst:**
```
"bitcoin price today"
"bitcoin etf flows this week"
"crypto mining stocks news"
"[specific ticker] news today"
```

**Momentum Quant:**
```
"stocks 52 week high today"
"unusual volume stocks today"
"sector performance this week"
"[specific ticker] technical analysis"
```

**Sentiment Scout:**
```
"wallstreetbets trending tickers"
"insider buying this week SEC"
"unusual options activity today"
"fear greed index current"
"polymarket trending markets"
```

**Contrarian:**
```
"most oversold stocks today"
"stocks biggest losers this week"
"[sector] sell-off analysis"
"short interest highest stocks"
```

#### 3. Ticker-Specific Deep Dive
Once you've identified a candidate ticker, search for:
```
"[TICKER] news today"
"[TICKER] analyst rating"
"[TICKER] earnings date"
```

## Search Best Practices

1. **Keep queries short** — 3-6 words get the best results
2. **Include dates** — add "today", "this week", or the actual date for recency
3. **Don't search for things you already know** from your memory — use searches to find NEW information
4. **If a search returns nothing useful**, reformulate with different keywords rather than giving up
5. **Max 8 searches per session** — be efficient, don't waste time on redundant queries
6. **Read the snippets carefully** — often the search snippet contains the key data point you need without needing to fetch the full page

## Handling Search Failures
- If Brave Search is down or returns errors, note it in your recommendation
- Set conviction to max 5 if you couldn't verify current prices/news
- Fall back to your memory and general market knowledge
- Flag the recommendation as "limited research" in your thesis
