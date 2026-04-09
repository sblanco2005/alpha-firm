# Alpha Firm: Multi-Agent AI Investment Engine

## What Is Alpha Firm?

Alpha Firm is an autonomous investment research and decision-making system powered by five specialized AI analysts and a Portfolio Manager (PM) orchestrator. It runs on a VPS via scheduled cron jobs, performing 3 market checks per trading day. Each check spawns 5 independent AI agents that research markets in parallel, produce recommendations, stress-tests the top picks through an adversarial Bull/Bear debate, and feeds them to a PM layer that makes the final buy/sell/pass decision.

The system operates in **simulated mode** -- it tracks real market prices but does not execute real trades. This allows us to build a verifiable track record before deploying capital.

- **Starting Capital:** $10,000
- **Inception Date:** March 28, 2026
- **Current NAV:** $10,243.88 (+2.44%)
- **Open Positions:** META, INTU, GLD, ORCL, DAL, DUK, PINS
- **Total Trades:** 8 buys, 1 sell
- **Days Active:** 8
- **Infrastructure:** Claude Code (Anthropic) on a dedicated VPS

---

## The Five Analysts

Each analyst is a specialized AI agent with a distinct research methodology, coverage universe, and conviction framework. They operate independently -- no analyst sees what the others are recommending. This prevents groupthink and ensures diversity of signal.

### 1. Macro Strategist

Focuses on the big picture: Fed policy, Treasury yields, geopolitical risk, currency moves, and commodity cycles. Recommends broad instruments (SPY, QQQ, TLT, GLD, sector ETFs) based on macroeconomic regime shifts.

**Edge:** Identifies regime transitions (risk-on to risk-off, growth to stagflation) before they're consensus.

**Conviction calibration:**
- 9-10: Clear regime shift or policy pivot with asymmetric risk/reward
- 7-8: Strong macro setup with confirming data, reasonable risk
- 5-6: Interesting setup but conflicting signals or unclear timing

### 2. Crypto Analyst

Covers Bitcoin on-chain metrics, mining stocks, ETF flows, and regulatory catalysts. Monitors exchange reserves, MVRV Z-Score, hash rate trends, and institutional flow data. Can recommend crypto ETFs (IBIT), mining equities (MARA, RIOT, IREN), or direct crypto exposure.

**Edge:** On-chain data provides signals that traditional analysts miss entirely.

**Conviction calibration:**
- 9-10: Clear on-chain divergence (e.g., exchange outflows while price flat) + upcoming catalyst
- 7-8: Strong setup with one confirming signal (ETF flows, hash rate, regulatory clarity)
- 5-6: Interesting but volatility could go either way

### 3. Momentum Quant

Pure technical and quantitative approach. Scores opportunities using a weighted model: price momentum (3x), volume confirmation (2x), relative strength (2x), volatility (1x), and catalyst proximity (2x). Focuses on sector rotation, breakouts, and momentum factor exposure.

**Edge:** Systematic scoring removes emotional bias. Catches trend acceleration early.

**Conviction calibration:**
- 9-10: Multi-factor alignment -- momentum, volume, relative strength all confirm + near-term catalyst
- 7-8: Strong momentum with volume confirmation, one factor slightly off
- 5-6: Decent setup but missing volume or relative strength confirmation

### 4. Sentiment Scout

Tracks social buzz, insider buying clusters, unusual options flow, narrative momentum, and prediction market shifts. Ranks signals by historical reliability -- insider buying clusters are the strongest signal, followed by unusual options activity and narrative acceleration.

**Edge:** Captures information flow before it shows up in price. Insider buying clusters have the highest historical hit rate of any sentiment signal.

**Conviction calibration:**
- 9-10: Insider buying cluster + social buzz accelerating + narrative in early stage
- 7-8: Strong sentiment shift with at least 2 confirming signals
- 5-6: Interesting buzz but could be noise -- single signal only

### 5. Contrarian

Hunts for beaten-down names with improving fundamentals. Every thesis must answer five questions: Why does the market hate it? What's changing? Where's the asymmetry? What's the catalyst? Is this a falling knife or a real setup? Requires all three: cheap + improving + catalyst.

**Edge:** Captures the highest-magnitude moves when consensus is wrong. Naturally uncorrelated with the other four agents.

**Conviction calibration:**
- 9-10: Extreme pessimism + clear fundamental improvement + upcoming catalyst forcing re-rating
- 7-8: Significant pessimism with early signs of improvement, reasonable catalyst timeline
- 5-6: Interesting value setup but no clear catalyst or improvement signal yet

---

## How the PM Makes Decisions

The Portfolio Manager is not a sixth analyst -- it's a decision framework that evaluates the five recommendations and decides whether to act. The PM does not reward how well a thesis is explained. It rewards how well a thesis is supported, testable, and actionable.

### Pre-Filter (Hard Rejects)

Before scoring, any recommendation is rejected if it fails:
- Fewer than 2 concrete supporting facts
- No clear catalyst or trigger
- No falsification condition (what would prove this wrong?)
- Violates sector cap (would push sector >40% of NAV)
- Duplicate thesis exposure (>2 similar positions)

### Structured Evaluation

Instead of scoring the pitch, the PM extracts 7 structured answers from each recommendation:
1. Core claim in one sentence
2. Three supporting facts
3. The catalyst
4. Expected time horizon
5. What would disprove it
6. Why now instead of next week
7. What portfolio exposure this adds to

This levels the field between narrative-heavy agents (contrarian, sentiment) and data-heavy agents (quant, macro).

### Scoring Framework (6 Categories)

| Factor | Weight | What It Measures |
|--------|--------|------------------|
| Evidence Strength | 25% | Concrete, observable facts backing the thesis. Hard data, not interpretation. |
| Falsifiability | 20% | Clear invalidation condition, timeline, and exit trigger. |
| Risk/Reward Quality | 20% | Upside meaningfully larger than downside. Downside bounded. |
| Portfolio Impact | 15% | Diversification benefit. Sector/factor/thesis concentration. |
| Signal Confirmation | 10% | Multiple independent reasons (technical + macro, valuation + catalyst). |
| Execution Readiness | 10% | Actionable now vs. "interesting but early." |

**Minimum thresholds:** Evidence < 6 or Falsifiability < 5 = hard reject.

Agent conviction is used only as a tiebreaker between closely-scored candidates, not as a core scoring category. This prevents the PM from overweighting a synthetic confidence number.

### Narrative Penalty (Anti-LLM Bias)

Apply 0.85x modifier if 2+ of these are true:
- Catalyst is vague ("market will realize...")
- Timing is vague ("in the coming weeks")
- Downside case is generic
- Evidence is mostly interpretive, not factual
- Depends on sentiment reversal without a trigger
- Sounds strong but lacks measurable checkpoints

This penalty exists because LLMs naturally produce compelling narratives. Contrarian and sentiment theses are most likely to trigger it -- that's by design.

### Agent Track Record Modifier

| Agent Win Rate | Modifier |
|---|---|
| > 60% | 1.2x |
| 40-60% | 1.0x |
| < 40% | 0.8x |
| < 5 picks | 1.0x |

### Fundamental Overlay (Stocks Only)

Every stock recommendation goes through a Fundamental Overlay that fetches real financial data (P/E, revenue growth, margins, D/E, FCF yield) and computes a modifier from 0.7x to 1.3x. ETFs, crypto, commodities skip this (1.0x neutral). If yfinance returns incomplete data, modifier snaps to 1.0x.

### Capital Protection Gate (3-Stage Debate)

The debate layer is not a balanced discussion engine. It is a capital-protection gate. Unresolved uncertainty is treated as negative, not neutral.

**Stage 1 -- Bear Risk Manager (goes first):** Attacks the trade like a professional skeptic. Classifies risk as `fatal_flaw`, `serious_weakness`, or `manageable_risk`. Assigns risk flags from an 11-flag taxonomy (already_priced_in, timing_risk, weak_catalyst, narrative_overreach, factor_crowding, sector_overlap, macro_conflict, valuation_mismatch, evidence_quality_low, poor_asymmetry, thesis_not_falsifiable). Lists specific questions the bull must answer to save the trade.

**Stage 2 -- Bull Rebuttal (after bear finishes):** Responds ONLY to the bear's strongest objections with concrete evidence. Cannot restate the thesis or argue broadly. Must answer the bear's specific questions with data or concede.

**Stage 3 -- Risk Chair (PM decides):** Applies hard rules:

| Outcome | Condition | Action |
|---------|-----------|--------|
| **VETO** | Fatal flaw found | Trade rejected. Score zeroed. |
| **PASS** | 2+ serious weaknesses unrebutted | Trade rejected. Score zeroed. |
| **BUY_ELIGIBLE_REDUCED** | 1 unrebutted weakness | Approved at 75% size, 0.90x modifier |
| **BUY_ELIGIBLE** | All attacks rebutted | Approved, 1.05x modifier |

Before approving, the Risk Chair must answer: **"Would I still buy this if I removed the writeup and looked only at the facts?"**

### Final Score Calculation

```
final_score = raw_pm_score x track_record x fundamental x debate x narrative_penalty
```

Full chain:
1. Raw PM score (evidence 25% + falsifiability 20% + risk/reward 20% + portfolio impact 15% + signal confirmation 10% + execution readiness 10%)
2. x Track record modifier (0.8x to 1.2x)
3. x Fundamental modifier (0.7x to 1.3x, stocks only)
4. x Debate modifier (0.0x if VETO/PASS, 0.90x if reduced, 1.05x if eligible)
5. x Narrative penalty (0.85x if triggered, else 1.0x)
6. = Final score -- used for ranking and BUY/PASS decision

### Position Management

For each existing position, the PM asks at every check:
1. Has it hit the target return? -- Sell and take profit
2. Is the thesis broken? -- Sell regardless of P&L
3. Held 2+ weeks with no movement? -- Consider selling for opportunity cost
4. Down 10%+ from entry? -- Likely thesis broken, sell
5. Up but catalyst hasn't happened yet? -- Hold

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

At each checkpoint, we fetch the current price and calculate return vs. entry price. Outcome evaluation runs during the morning session only.

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

## Pipeline: Step by Step

Here is exactly what happens during each market check:

### Step 1: Pre-flight
1. Read `state/daily-state.json`
2. If date != today, reset: checks=0, bought=false
3. If checks >= 3, STOP (all checks done for today)
4. Increment check counter and save
5. Prune agent memory files older than 20 sessions

### Step 1.5: Outcome Evaluation (Morning Only)
1. Read `state/outcomes.json`
2. Evaluate any due checkpoints by fetching current prices via Brave Search
3. Update outcomes with checkpoint prices and verdicts
4. Regenerate all scorecards in `state/scorecards/*.json`

### Step 2: Dispatch 5 Analyst Subagents (IN PARALLEL)
Each subagent:
- Reads its agent prompt from `agents/{agent_id}.md`
- Reads its rolling memory from `memory/{agent_id}/`
- Reads its performance scorecard from `state/scorecards/{agent_id}.json`
- Uses Brave Search MCP for real-time market research
- Uses Fetch for current prices
- Writes recommendation to `memory/{agent_id}/{today}.json`
- Returns exactly ONE JSON recommendation

Subagents are independent -- they cannot see each other's work.

### Step 3: Fundamental Overlay (Stocks Only)
- Filter stock recommendations
- Fetch fundamentals via Price Fetch MCP (`get_batch_fundamentals`)
- Score on valuation, growth, profitability, balance sheet, cash flow
- Compute modifier (0.7x to 1.3x)

### Step 4: Bull/Bear Debate (Top 2-3 Picks)
- Rank by raw_score x fundamental_modifier
- Select top 2-3 with conviction >= 6
- For each, spawn bull + bear researcher subagents in parallel
- Calculate debate score and modifier (0.70x to 1.15x)
- Check for risk flags

### Step 5: PM Decision
- Apply full scoring chain: raw x fundamental x debate
- Decision tree: sell first, then evaluate buys, BUY or PASS
- Execute trade if decided -- update all state files
- Sync every BUY/SELL to PortClaude via MCP

### Step 6: Record Outcomes
- Append all 5 recommendations to `state/outcomes.json`
- Mark which one was executed

### Step 7: Write Summary
- Write day summary to `logs/{today}.md`
- Update daily-state with session completed

---

## Daily Schedule

Alpha Firm runs 3 market checks per trading day (Monday-Friday, excluding US holidays):

| Session | Time (ET) | Cron (UTC) | Purpose |
|---------|-----------|------------|---------|
| Pre-Market | 7:00 AM | 11:00 UTC | Morning research scan. Outcome evaluation runs here. |
| Midday | 12:30 PM | 16:30 UTC | Momentum check. Catches intraday developments. |
| Closing | 3:45 PM | 19:45 UTC | End-of-day review. Last chance to act before close. |

Each session spawns all 5 analysts in parallel, collects recommendations, runs the fundamental overlay, runs the bull/bear debate, and applies the PM decision framework. The morning session also evaluates any due outcome checkpoints.

**Price Refresh:** Before each Claude session, `scripts/refresh-prices.sh` fetches live prices from Yahoo Finance (stocks/ETFs) and CoinGecko (crypto), updating portfolio NAV. Falls back to entry price if a fetch fails.

**Cron Wrapper:** `scripts/cron-wrapper.sh` wraps `run-check.sh` to track execution status (start time, duration, exit code, errors) in `state/cron-status.json` for the dashboard.

---

## Risk Management

| Rule | Details |
|------|---------|
| Daily buy limit | 1 buy per day maximum |
| Position sizing | 15-30% of available cash |
| Max concentration | 30% of portfolio in any single name |
| Stop-loss review | Positions down >8% from entry are flagged |
| Hard stop | Positions down >10% from entry -- likely thesis broken, sell |
| Stale position review | Positions >14 days with <2% return are flagged |
| No leverage | Long-only, no margin, no shorting, no options |
| Prediction market cap | Max 10% of portfolio |
| Weekend/holiday skip | No trading on non-market days |
| Memory pruning | Agent memory capped at 20 most recent sessions |
| Atomic writes | All state JSON writes go to .tmp first, validated with jq, then mv into place |

### Soul -- Non-Negotiable Trading Principles

1. **Cut losses fast.** A small loss is a gift compared to a large one.
2. **Let winners run.** Don't panic-sell a working position to lock in a small gain.
3. **Never average down.** Adding to a losing position makes you more wrong with more money.
4. **Never trade on emotion.** If it can't be justified with data and a clear thesis, it doesn't get made.
5. **Sit on your hands more than you trade.** Most days, doing nothing is the best trade.
6. **The market is never wrong. Opinions are.** Price is truth.

---

## Reward System

20% of total firm profits are allocated as a reward pool to the top-performing analyst. This is winner-take-all based on realized P&L from executed trades.

```
reward_pool = max(0, firm_pnl) * 20%
leading_agent.reward = reward_pool
```

This incentivizes quality over quantity -- agents are better off making fewer, higher-conviction calls than flooding the PM with mediocre ideas.

---

## Backtesting

Run `./scripts/backtest.sh <start_date> <end_date> [session]` to replay the full pipeline against historical dates.

```bash
# Quick validation (1 week)
./scripts/backtest.sh 2026-03-01 2026-03-07

# Full month
./scripts/backtest.sh 2026-02-01 2026-02-28

# Full quarter (run overnight)
./scripts/backtest.sh 2026-01-02 2026-03-28
```

Key features:
- **Date fidelity** -- agents only see information available on the simulated date (Brave Search queries constrained with `before:{date}`)
- **Full pipeline replay** -- analysts -> fundamental overlay -> bull/bear debate -> PM decision -> trade execution
- **Complete scorecards** -- since outcomes are known, real win/loss data is available immediately
- **Debate impact analysis** -- measures whether debates improved or hurt returns
- **Isolated state** -- backtest results go to `backtest/results/{run_id}/`, never touch live state
- **Uses closing prices** on simulated dates as entry prices
- **Summary report** auto-generated after all days are processed

---

## Current Portfolio

*As of April 8, 2026*

| Metric | Value |
|--------|-------|
| **NAV** | $10,243.88 |
| **Cash** | $1,776.03 (17.3%) |
| **P&L** | +$243.88 (+2.44%) |
| **Positions** | 7 |
| **Total Trades** | 8 buys, 1 sell |
| **Days Active** | 8 |
| **High Water Mark** | $10,243.88 |

### Open Positions

| Ticker | Shares | Entry Price | Entry Date | Analyst |
|--------|--------|-------------|------------|---------|
| META | 4 | $520.07 | 2026-03-28 | Sentiment |
| INTU | 4 | $422.69 | 2026-03-31 | Contrarian |
| GLD | 3 | $430.29 | 2026-04-01 | Macro |
| ORCL | 6 | $149.90 | 2026-04-02 | Contrarian |
| DAL | 14 | $65.70 | 2026-04-06 | Contrarian |
| DUK | 5 | $127.92 | 2026-04-07 | Quant |
| PINS | 24 | $18.50 | 2026-04-08 | Contrarian |

### Agent Leaderboard

| Agent | Picks | Executed | Wins | Losses | P&L |
|-------|-------|----------|------|--------|-----|
| Contrarian | 12 | 4 | 0 | 0 | $0.00 |
| Sentiment | 11 | 2 | 0 | 1 | -$259.26 |
| Macro | 10 | 1 | 0 | 0 | $0.00 |
| Quant | 9 | 1 | 0 | 0 | $0.00 |
| Crypto | 8 | 0 | 0 | 0 | $0.00 |

Contrarian dominates execution (4 of 8 buys). Sentiment has the only realized loss (LOAR, sold at -13.3%). Crypto has never had a pick executed.

---

## Monitoring & Reporting

### Live Dashboard
A real-time web dashboard (Express.js + Vite React) at `localhost:5173` shows:
- Portfolio NAV with live P&L (prices via PortClaude API at localhost:8001)
- Open positions with unrealized gains/losses
- Agent recommendations and conviction scores
- Cron job status and execution history
- Full trade history and PM decision log

### Telegram Briefings (via OpenClaw Cron)
- **Daily Morning Briefing** (6:30 AM ET): BTC price, macro/AI news, Alpha Firm portfolio snapshot -- sent to Telegram
- **End of Day Briefing** (4:00 PM ET, Mon-Fri): Indices, bonds, BTC, top news, portfolio positions with live P&L -- sent to Telegram

### Automated Reports (via Cowork)
- **Weekly Review** (Sunday): Performance analysis, sector exposure, strategy observations
- **Stop-Loss Alerts** (every 2 hours during market): Flags positions at risk

---

## Architecture Summary

```
Cron (3x daily, Mon-Fri)
  |
  v
cron-wrapper.sh → tracks status in state/cron-status.json
  |
  v
run-check.sh
  ├─ refresh-prices.sh → Yahoo Finance / CoinGecko → updates NAV
  ├─ Prune memory (>20 sessions)
  └─ Claude Code Orchestrator (--dangerously-skip-permissions)
       |
       ├─ Step 1: Pre-flight (daily-state.json)
       ├─ Step 1.5: Outcome Evaluation (morning only)
       |
       ├─ Step 2: 5 Analyst Subagents (PARALLEL)
       │   ├── Macro Strategist ──────┐
       │   ├── Crypto Analyst ────────┤
       │   ├── Momentum Quant ────────┤→ 5 JSON recommendations
       │   ├── Sentiment Scout ───────┤
       │   └── Contrarian ────────────┘
       |
       ├─ Step 3: Fundamental Overlay (stocks only)
       │   └── Price Fetch MCP → yfinance fundamentals
       |
       ├─ Step 4: Bull/Bear Debate (top 2-3 picks)
       │   ├── Bull Researcher × 2-3 ─┐ (PARALLEL per pick)
       │   └── Bear Researcher × 2-3 ─┘
       |
       ├─ Step 5: PM Decision (buy/pass/sell)
       │   └── PortClaude MCP → sync trades
       |
       ├─ Step 6: Record outcomes
       └─ Step 7: Write logs/{today}.md
```

### Infrastructure

| Component | Details |
|-----------|---------|
| **Runtime** | Claude Code CLI on VPS (Claude Max subscription, $0 API spend) |
| **Price Data** | Price Fetch MCP server (yfinance + CoinGecko, `mcp/price_server.py`) |
| **Portfolio Sync** | PortClaude MCP (localhost:8001) for trade sync and price batch API |
| **Market Research** | Brave Search MCP for real-time news, analysis, and price lookups |
| **Dashboard** | Express.js API + Vite React frontend (localhost:5173) |
| **Notifications** | Telegram via OpenClaw cron jobs (morning briefing, EOD briefing) |
| **State Storage** | JSON files (portfolio, trades, outcomes, scorecards, leaderboard, daily-state) |
| **Scheduling** | System crontab (3 market checks) + OpenClaw cron (briefings, healthchecks) |
| **Backtesting** | `scripts/backtest.sh` -- replays full pipeline against historical dates |

### Directory Structure

```
alpha-firm/
├── agents/                    # Agent system prompts
│   ├── macro.md, crypto.md, quant.md, sentiment.md, contrarian.md
│   ├── bull-researcher.md     # Bull/Bear debate agents
│   └── bear-researcher.md
├── skills/                    # Shared skill docs
│   ├── trade-execution.md, debate.md, fundamental-overlay.md
│   ├── outcome-evaluation.md, backtesting.md
│   ├── market-research.md, price-fetch.md, sentiment-research.md
│   └── memory-management.md
├── memory/                    # Agent research memory (last 20 sessions)
│   └── {macro,crypto,quant,sentiment,contrarian}/{date}.json
├── state/                     # Persistent portfolio state
│   ├── portfolio.json, trade-log.json, leaderboard.json
│   ├── daily-state.json, outcomes.json, cron-status.json
│   └── scorecards/{agent_id}.json
├── backtest/results/          # Backtesting results (one dir per run)
├── dashboard/                 # React dashboard + Express API
├── mcp/price_server.py        # Price Fetch MCP server
├── scripts/
│   ├── backtest.sh            # Backtesting runner
│   ├── refresh-prices.sh      # Standalone price refresh
│   ├── cron-wrapper.sh        # Wraps run-check.sh with status tracking
│   ├── cron-status-api.sh     # Dashboard cron status endpoint
│   ├── setup.sh               # Initial deployment
│   └── status.sh              # CLI status dashboard
├── logs/                      # Daily execution logs ({date}.md)
├── reports/                   # Generated reports
├── alerts/                    # Generated alerts
├── run-check.sh               # Main cron entry point
├── orchestrator.md            # PM decision framework
└── CLAUDE.md                  # Full system architecture doc
```

---

## What Makes This Different

1. **Independent parallel research** -- Five analysts work simultaneously without seeing each other's work. No groupthink, maximum signal diversity.

2. **Capital protection gate, not a debate** -- The Bear Risk Manager attacks trades like a professional skeptic, classifying fatal flaws, serious weaknesses, and risk flags. The bull can only rebut with evidence. Unresolved uncertainty kills the trade.

3. **Evidence-based scoring** -- 6-category framework (evidence, falsifiability, risk/reward, portfolio impact, signal confirmation, execution readiness) + narrative penalty. Rewards testable ideas with hard data, penalizes compelling stories with vague support.

4. **Meritocratic weighting** -- Agents earn influence through track record. Bad analysts get discounted automatically.

5. **Full outcome tracking** -- Every recommendation is tracked at 5 checkpoints, not just executed trades. We can evaluate what we *didn't* buy, too.

6. **Structured PM discipline** -- The decision framework prevents emotional trading, enforces position limits, and requires explicit reasoning for every action.

7. **Self-improving system** -- Scorecards feed back into agent behavior. The system gets smarter with every market cycle.

8. **Backtesting** -- Full pipeline replay against historical dates with date-fidelity constraints. Validates the strategy before trusting it with live decisions.

9. **Zero marginal cost** -- Runs on Claude Max subscription. No per-trade API fees, no data vendor costs beyond Brave Search.

10. **Real-time monitoring** -- Live dashboard, Telegram briefings (morning + EOD), automated alerts, and PortClaude portfolio sync.
