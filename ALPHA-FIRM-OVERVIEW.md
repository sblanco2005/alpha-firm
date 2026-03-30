# Alpha Firm: Multi-Agent AI Investment Engine

## What Is Alpha Firm?

Alpha Firm is an autonomous investment research and decision-making system powered by five specialized AI analysts and a Portfolio Manager (PM) orchestrator. It runs on a VPS via scheduled cron jobs, performing 3 market checks per trading day. Each check spawns 5 independent AI agents that research markets in parallel, produce recommendations, and feed them to a PM layer that makes the final buy/sell/pass decision.

The system operates in **simulated mode** -- it tracks real market prices but does not execute real trades. This allows us to build a verifiable track record before deploying capital.

- **Starting Capital:** $10,000
- **Inception Date:** March 28, 2026
- **Current NAV:** $9,745.02 (-2.55%)
- **Open Positions:** META, LOAR
- **Infrastructure:** Claude Code (Anthropic) on a dedicated VPS

---

## The Five Analysts

Each analyst is a specialized AI agent with a distinct research methodology, coverage universe, and conviction framework. They operate independently -- no analyst sees what the others are recommending. This prevents groupthink and ensures diversity of signal.

### 1. Macro Strategist

Focuses on the big picture: Fed policy, Treasury yields, geopolitical risk, currency moves, and commodity cycles. Recommends broad instruments (SPY, QQQ, TLT, GLD, sector ETFs) based on macroeconomic regime shifts.

**Edge:** Identifies regime transitions (risk-on to risk-off, growth to stagflation) before they're consensus.

### 2. Crypto Analyst

Covers Bitcoin on-chain metrics, mining stocks, ETF flows, and regulatory catalysts. Monitors exchange reserves, MVRV Z-Score, hash rate trends, and institutional flow data. Can recommend crypto ETFs (IBIT), mining equities (MARA, RIOT, IREN), or direct crypto exposure.

**Edge:** On-chain data provides signals that traditional analysts miss entirely.

### 3. Momentum Quant

Pure technical and quantitative approach. Scores opportunities using a weighted model: price momentum (3x), volume confirmation (2x), relative strength (2x), volatility (1x), and catalyst proximity (2x). Focuses on sector rotation, breakouts, and momentum factor exposure.

**Edge:** Systematic scoring removes emotional bias. Catches trend acceleration early.

### 4. Sentiment Scout

Tracks social buzz, insider buying clusters, unusual options flow, narrative momentum, and prediction market shifts. Ranks signals by historical reliability -- insider buying clusters are the strongest signal, followed by unusual options activity and narrative acceleration.

**Edge:** Captures information flow before it shows up in price. Insider buying clusters have the highest historical hit rate of any sentiment signal.

### 5. Contrarian

Hunts for beaten-down names with improving fundamentals. Every thesis must answer five questions: Why does the market hate it? What's changing? Where's the asymmetry? What's the catalyst? Is this a falling knife or a real setup? Requires all three: cheap + improving + catalyst.

**Edge:** Captures the highest-magnitude moves when consensus is wrong. Naturally uncorrelated with the other four agents.

---

## How the PM Makes Decisions

The Portfolio Manager is not a sixth analyst -- it's a decision framework that evaluates the five recommendations and decides whether to act.

### Scoring Framework

| Factor | Weight | What It Measures |
|--------|--------|------------------|
| Thesis Quality | 40% | Is it specific, falsifiable, data-backed, with clear timing? |
| Conviction Score | 20% | How confident is the analyst? Adjusted by their recent track record. |
| Risk/Reward | 25% | Is the target realistic? Is the downside bounded? |
| Portfolio Fit | 15% | Does it diversify or concentrate existing exposure? |

### Decision Rules

- If one recommendation scores 2+ points above the rest, buy it
- If the top 2-3 are close, compare portfolio fit and risk/reward as tiebreakers
- **PASS is always valid** -- no trade is better than a bad trade
- Maximum 1 buy per day (can sell anytime)
- Position sizing: 15-30% of available cash per position
- Maximum single position: 30% of total portfolio value

### Agent Track Record Adjustment

As agents build history, the PM adjusts their conviction scores:
- Win rate >60%: 1.2x multiplier (trust them more)
- Win rate 40-60%: neutral
- Win rate <40%: 0.8x discount (trust them less)

This creates a meritocratic system where proven analysts get more influence.

---

## The Feedback Loop

Every recommendation from every agent is tracked in an outcomes ledger, whether or not it was executed. This is the core learning mechanism.

### Checkpoint Evaluation

Each recommendation is evaluated at 5 intervals:

| Checkpoint | When |
|------------|------|
| Day 1 | Next trading day |
| Day 5 | 1 week later |
| Day 10 | 2 weeks later |
| Day 20 | 1 month later |
| Horizon | Agent's specified timeframe |

At each checkpoint, we fetch the current price and calculate return vs. entry price.

### Final Verdict (at Horizon)

| Outcome | Criteria |
|---------|----------|
| **Win** | Peak return at any point reached the target return |
| **Partial** | Positive at horizon but never hit the target |
| **Loss** | Negative at horizon |

### Agent Scorecards

Each agent receives a scorecard showing:
- Overall win rate and average returns
- Conviction calibration (do high-conviction picks actually perform better?)
- Performance by asset type (stocks vs ETFs vs crypto)
- Recent pick history with returns
- Identified strengths, weaknesses, and recommended adjustments

Agents see their own scorecards and adjust their approach accordingly. This creates a system that improves over time.

---

## Daily Schedule

Alpha Firm runs 3 market checks per trading day (Monday-Friday, excluding US holidays):

| Session | Time (ET) | Purpose |
|---------|-----------|---------|
| Pre-Market | 7:00 AM | Morning research scan. Outcome evaluation runs here. |
| Midday | 12:30 PM | Momentum check. Catches intraday developments. |
| Closing | 3:45 PM | End-of-day review. Last chance to act before close. |

Each session spawns all 5 analysts in parallel, collects recommendations, and runs the PM decision framework. The morning session also evaluates any due outcome checkpoints.

**Price Refresh:** Live prices are fetched 3x daily via the PortClaude API service, updating portfolio NAV and filling outcome checkpoints automatically.

---

## Risk Management

| Rule | Details |
|------|---------|
| Daily buy limit | 1 buy per day maximum |
| Position sizing | 15-30% of available cash |
| Max concentration | 30% of portfolio in any single name |
| Stop-loss review | Positions down >8% from entry are flagged |
| Stale position review | Positions >14 days with <2% return are flagged |
| No leverage | Long-only, no margin |
| Prediction market cap | Max 10% of portfolio |
| Weekend/holiday skip | No trading on non-market days |

---

## Reward System

20% of total firm profits are allocated as a reward pool to the top-performing analyst. This is winner-take-all based on realized P&L from executed trades.

```
reward_pool = max(0, firm_pnl) * 20%
leading_agent.reward = reward_pool
```

This incentivizes quality over quantity -- agents are better off making fewer, higher-conviction calls than flooding the PM with mediocre ideas.

---

## Current Portfolio

*As of March 30, 2026*

| Metric | Value |
|--------|-------|
| **NAV** | $9,745.02 |
| **Cash** | $5,972.66 (61.3%) |
| **P&L** | -$254.98 (-2.55%) |
| **Positions** | 2 |
| **Total Trades** | 2 buys, 0 sells |
| **Days Active** | 2 |

### Open Positions

| Ticker | Shares | Entry Price | Entry Date | Current Price | Unrealized P&L | Analyst |
|--------|--------|-------------|------------|---------------|-----------------|---------|
| META | 4 | $520.07 | 2026-03-28 | $532.89 | +$51.26 (+2.5%) | Sentiment Scout |
| LOAR | 29 | $67.14 | 2026-03-30 | $56.58 | -$306.24 (-15.7%) | Sentiment Scout |

### Why These Positions

**META:** Extreme Fear & Greed reading (14), unusual call options volume 68% above average, 42 analyst Buy ratings with average target of $838. Mean-reversion setup ahead of Q1 earnings.

**LOAR:** Triple signal confluence -- $6.46M insider cluster buying in March, Goldman Sachs conviction list add with $98 price target, aerospace/defense narrative accelerating under $1T defense budget. Q1 earnings catalyst on April 6.

---

## Monitoring & Reporting

### Live Dashboard
A real-time web dashboard at `localhost:5173` shows:
- Portfolio NAV with live P&L (prices via PortClaude API)
- Open positions with unrealized gains/losses
- Agent recommendations and conviction scores
- Cron job status and execution history
- Full trade history and PM decision log

### Automated Reports (via Cowork)
- **Daily EOD Report** (4:30 PM ET): Portfolio snapshot, activity summary, agent leaderboard
- **Weekly Review** (Sunday 8 PM ET): Performance analysis, sector exposure, strategy observations
- **Stop-Loss Alerts** (every 2 hours during market): Flags positions at risk
- **Monthly Recalibration** (1st Sunday): Agent accuracy analysis, style drift detection

---

## Architecture Summary

```
Cron (3x daily)
  |
  v
run-check.sh
  |
  v
Claude Code Orchestrator
  |
  +---> [Macro Agent]      --\
  +---> [Crypto Agent]      --\
  +---> [Quant Agent]        --> PM Decision Framework --> Trade Execution
  +---> [Sentiment Agent]   --/                              |
  +---> [Contrarian Agent] --/                               v
                                                     State Files (JSON)
                                                          |
                                                          v
                                                   Dashboard (React)
                                                   PortClaude (prices)
                                                   Outcome Evaluation
                                                   Agent Scorecards
```

**Infrastructure:**
- VPS with Claude Code CLI (Claude Max subscription, no API billing)
- PortClaude API for live price data (yfinance + CoinGecko)
- Express.js API server + Vite React dashboard
- Brave Search MCP for real-time market research
- All state stored as JSON files (portfolio, trades, outcomes, scorecards)

---

## What Makes This Different

1. **Independent parallel research** -- Five analysts work simultaneously without seeing each other's work. No groupthink, maximum signal diversity.

2. **Meritocratic weighting** -- Agents earn influence through track record. Bad analysts get discounted automatically.

3. **Full outcome tracking** -- Every recommendation is tracked at 5 checkpoints, not just executed trades. We can evaluate what we *didn't* buy, too.

4. **Structured PM discipline** -- The decision framework prevents emotional trading, enforces position limits, and requires explicit reasoning for every action.

5. **Self-improving system** -- Scorecards feed back into agent behavior. The system gets smarter with every market cycle.

6. **Zero marginal cost** -- Runs on Claude Max subscription. No per-trade API fees, no data vendor costs beyond Brave Search.
