# Skill: Sentiment & Alternative Data Research

## Purpose
This skill defines how the Sentiment Scout agent gathers alternative data signals using Brave Search. These searches go beyond standard market research to find social buzz, insider activity, options flow, and prediction market shifts.

## Search Playbook (run in order)

### 1. Fear/Greed & Broad Sentiment
```
"CNN fear greed index today"
"VIX level today"
"AAII sentiment survey this week"
"put call ratio today"
```
Establishes the macro sentiment backdrop. Extreme fear (VIX > 25, F&G < 20) = contrarian buy opportunity for broad market.

### 2. Social & Retail Buzz
```
"wallstreetbets trending tickers today"
"reddit stocks popular this week"
"robinhood most popular stocks"
"trending tickers twitter finance today"
```
Look for: tickers being mentioned repeatedly, early-stage buzz (not yet viral), and the *why* behind the buzz.

### 3. Insider Activity
```
"insider buying this week SEC filings"
"insider buying cluster stocks"
"form 4 filings notable buys this week"
```
Insider buying clusters (3+ insiders buying within a week) are the strongest predictive signal. Ignore insider selling — insiders sell for many reasons.

### 4. Unusual Options Flow
```
"unusual options activity today"
"large call purchases today stocks"
"options flow unusual volume"
```
Look for: large block call purchases (especially short-dated), big put selling (bullish), or massive call open interest building. These often indicate informed money positioning.

### 5. Narrative & News Sentiment
```
"[sector] narrative momentum 2026"
"[topic] stocks news today"
"analyst upgrades this week"
```
Track which narratives are accelerating (AI, energy, defense, crypto, biotech). Early-to-mid stage narrative = opportunity. Late-stage (front page WSJ) = crowded.

### 6. Prediction Market Signals
```
"polymarket trending markets today"
"polymarket biggest movers"
"kalshi popular markets"
```
Rapid odds shifts (>10% in 24h) often lead traditional news. Check if the probability move has a tradeable equity/crypto angle.

### 7. Ticker Deep Dive (after identifying candidate)
```
"[TICKER] reddit sentiment"
"[TICKER] insider buying 2026"
"[TICKER] analyst rating upgrade"
"[TICKER] short interest"
"[TICKER] options unusual activity"
```

## How to Read Sentiment Signals

### Social Buzz Stages
| Stage | Sign | Action |
|-------|------|--------|
| **Early** (day 1-2) | Small Reddit thread, a few tweets, no price move yet | Best entry — high conviction |
| **Building** (day 3-5) | Multiple threads, growing mentions, price starting to move | Still tradeable if thesis is solid |
| **Viral** (day 5+) | Front page WSJ, CNBC mentions, everyone talking about it | Too late — skip or sell existing |
| **Fading** | Mentions declining, new narratives emerging | Exit if holding |

### Insider Buying Strength
| Pattern | Signal Strength |
|---------|----------------|
| Single insider, small buy | Weak — could be routine |
| CEO or CFO buying | Moderate — they know the numbers |
| 3+ insiders buying same week | Strong — cluster = conviction |
| Insider buying after price drop | Very strong — buying the dip with their own money |

### Prediction Market Odds Translation
| Odds Change | Meaning |
|-------------|---------|
| +5% in 24h | Modest shift, worth monitoring |
| +10-15% in 24h | Significant new information — search for the catalyst |
| +20%+ in 24h | Major development — likely already in the news, verify |
| Stable at 80%+ | Market highly confident — limited upside, skip |
| 40-60% range | Maximum uncertainty = maximum opportunity if you have an edge |

## Data Source Notes

### What Brave Search CAN find
- Reddit post titles and upvote counts from search snippets
- SEC filing summaries (insider buys/sells)
- Options flow summaries from financial sites
- Prediction market odds from Polymarket/Kalshi
- News sentiment and analyst rating changes
- Fear/Greed index values

### What Brave Search CANNOT find
- Real-time Reddit comment counts or live threads
- Live options chain data
- Institutional 13F filings (quarterly, delayed)
- Private Discord channel activity

When search can't find a specific data point, note it in your recommendation and lower conviction accordingly.

## Max Searches Per Session
- **8 searches total** — be efficient
- Allocate roughly: 2 broad sentiment + 3 signal-specific + 3 ticker deep dive
- If first broad search reveals extreme fear/greed, pivot all remaining searches to capitalize on that signal
