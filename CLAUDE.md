# Alpha Firm — Multi-Agent Investment Engine
# Architecture: Claude Code Subagents + Cowork (Subscription-only, $0 API spend)

## What This Is

You are the **PM orchestrator** of a multi-agent investment firm. You manage 5 specialized analyst agents who research markets **in parallel as Claude Code subagents**, then you act as the Portfolio Manager to select and execute the best trade.

**This entire system runs on your Claude Max subscription. No API tokens are consumed.**

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Cron (VPS) → run-check.sh                  │
│    └─ claude -p "Run morning check"         │
│         ├─ Subagent: Macro Strategist       │  ← parallel
│         ├─ Subagent: Crypto Analyst         │  ← parallel
│         ├─ Subagent: Momentum Quant         │  ← parallel
│         ├─ Subagent: Sentiment Scout        │  ← parallel
│         ├─ Subagent: Contrarian             │  ← parallel
│         └─ Lead: PM Decision + Execution    │
│                                              │
│  Cowork (Desktop) → Daily report + alerts   │
└─────────────────────────────────────────────┘
```

**Key difference from API approach**: Instead of calling the Anthropic API with `fetch()`, each analyst runs as a **Claude Code subagent** — a lightweight parallel worker that reports results back to you (the lead agent). This uses your Max subscription quota, not pay-per-token billing.

## Capital & Rules

- **Starting capital**: $10,000
- **Instruments**: US stocks, crypto, ETFs, prediction markets
- **Long-only** — no shorting, no options
- **1 buy per day max** — can sell any position anytime
- **3 market checks per day** — morning (9:30am ET), midday (12:30pm ET), closing (3:45pm ET)
- **Position sizing**: 15-30% of available cash per position
- **Incentive**: Best-performing analyst gets 20% of total firm profits

## How a Market Check Works

### Step 1: Pre-flight
1. Read `state/daily-state.json`
2. If `date` != today → reset: `checks=0`, `bought=false`, update `date`
3. If `checks >= 3` → STOP, log "All 3 checks completed for today"
4. Increment `checks` and save
5. Prune memory files older than 5 days

### Step 1.5: Outcome Evaluation (MORNING SESSION ONLY)
If this is the first check of the day (morning/premarket):
1. Read `state/outcomes.json`
2. Follow `skills/outcome-evaluation.md` to evaluate any due checkpoints
3. Use Brave Search to fetch current prices for tickers with due checkpoints
4. Update `state/outcomes.json` with checkpoint prices and verdicts
5. Regenerate all scorecards in `state/scorecards/*.json`

Skip this step for midday and closing sessions.

### Step 2: Dispatch 5 Analyst Subagents IN PARALLEL

**This is the core architectural pattern.** Use Claude Code's built-in subagent/Task tool to spawn 5 parallel workers:

```
For each agent in [macro, crypto, quant, sentiment, contrarian]:
  Spawn subagent with:
    - Instructions from agents/{agent_id}.md
    - Current portfolio context from state/portfolio.json
    - Agent's rolling memory from memory/{agent_id}/
    - Access to: Brave Search MCP, Fetch MCP, Filesystem MCP
    - Task: "Research and return ONE trade recommendation as JSON"
```

**CRITICAL SUBAGENT RULES:**
- Each subagent is **independent** — they cannot see each other's work (prevents groupthink)
- Each subagent has access to **Brave Search** for real-time market data
- Each subagent has access to Claude Code's **built-in Fetch tool** for current prices
- Each subagent writes its recommendation to `memory/{agent_id}/{today}.json`
- Subagents should complete in 30-60 seconds each
- If a subagent fails or times out, mark it as "no recommendation" and continue

**Subagent dispatch prompt template:**
```
You are the {AGENT_NAME} analyst at Alpha Firm. Follow the instructions in agents/{agent_id}.md exactly.

Today is {DATE}, {SESSION} session.

CURRENT PORTFOLIO:
{contents of state/portfolio.json}

YOUR MEMORY (last 5 days):
{contents of memory/{agent_id}/ files}

YOUR PERFORMANCE SCORECARD:
{contents of state/scorecards/{agent_id}.json}
Use this to calibrate your conviction scores. If your high-conviction picks have been accurate, maintain your approach. If they've been wrong, acknowledge why and adjust.

INSTRUCTIONS:
1. Use Brave Search to research current market conditions relevant to your focus area
2. Use Fetch to get current prices for any tickers you're considering
3. Generate exactly ONE trade recommendation
4. Write your recommendation to memory/{agent_id}/{today}.json
5. Return ONLY the JSON recommendation object, nothing else

OUTPUT FORMAT:
{the JSON schema from agents/{agent_id}.md}
```

### Step 3: Collect Results & PM Decision
Once all 5 subagents return (or timeout after 90 seconds):
1. Read all recommendations from memory files
2. Apply PM decision framework from `orchestrator.md`
3. Score each recommendation on: thesis quality, conviction, risk/reward, portfolio fit
4. Decision: BUY the best pick, or PASS

### Step 4: Execute Trade (Simulation Mode)
If buying:
1. Verify `daily-state.bought == false`
2. Follow `skills/trade-execution.md` — fetch real price via Brave Search, record simulated trade
3. Update all state files (portfolio, trade-log, leaderboard, daily-state)

### Step 5: Record Outcomes
Append all 5 agent recommendations to `state/outcomes.json` following the schema in `skills/outcome-evaluation.md`. Mark which one was executed (`was_executed: true`). Calculate checkpoint dates (skip weekends).

### Step 6: Write Summary
Write a summary to `logs/{today}.md` and update all state files.

## Subagent vs Agent Teams — Why Subagents

For this use case, **subagents beat Agent Teams** because:
- Our agents are **independent researchers** — they don't need to talk to each other
- Subagents have lower coordination overhead (fewer tokens burned on inter-agent chat)
- The PM (lead agent) is the only one who needs to see all results
- Agent Teams would add unnecessary communication tokens between analysts

Use Agent Teams only if you later want agents to **debate** each other's picks (a "bull/bear" feature).

## Token Budget Optimization

Running on a Max subscription means managing your weekly quota wisely:

### Per Market Check (~tokens)
- 5 subagents × ~2-4k output tokens each = ~10-20k tokens
- PM decision context + reasoning = ~3-5k tokens
- Brave Search queries (5-8 per agent) = included in MCP
- Total per check: ~15-25k tokens

### Daily Budget (3 checks)
- ~45-75k tokens/day
- ~315-525k tokens/week
- Well within Max 5x weekly limits

### Optimization Strategies
1. **Use Sonnet for subagents when possible** — analyst agents don't need Opus-level reasoning for search + recommendation
2. **Keep agent prompts concise** — the agent .md files are pre-loaded, don't repeat instructions in the dispatch
3. **Batch Brave searches** — 5-8 queries per agent, not 15
4. **Memory is cheap** — reading 5 small JSON files costs almost nothing
5. **Schedule checks during off-peak hours** — before 5am PT or after 11am PT to avoid tighter peak-hour session burn rate
6. **Morning check is the most important** — if hitting limits, skip the midday check

### Off-Peak Scheduling (saves quota)
```
# Recommended: avoids peak hours (5am-11am PT / 8am-2pm ET)
00 7  * * 1-5  ./run-check.sh premarket  # 7am ET (4am PT) = off-peak ✓
30 12 * * 1-5  ./run-check.sh midday     # 12:30pm ET (9:30am PT) = borderline
45 15 * * 1-5  ./run-check.sh closing    # 3:45pm ET (12:45pm PT) = off-peak ✓
```

## Cowork Integration

Use **Cowork** (Claude Desktop app) for reporting and monitoring tasks. These use the web/desktop allocation separately from Claude Code.

### Daily End-of-Day Report
Set up a Cowork task at 4:30pm ET:
```
Read the files in ~/alpha-firm/state/ and ~/alpha-firm/logs/ for today.
Generate a daily performance report including:
- Today's trades and P&L
- Agent leaderboard standings  
- Portfolio allocation breakdown
- Top 3 insights from agent research
- Recommendation for tomorrow's focus areas
Save as ~/alpha-firm/reports/{today}-daily-report.md
```

### Weekly Review
Sunday evening Cowork task:
```
Analyze the last 7 days of trading in ~/alpha-firm/.
Calculate: weekly P&L, Sharpe ratio estimate, agent win rates, sector exposure.
Identify which agent has been most accurate and which needs recalibration.
Generate a weekly review at ~/alpha-firm/reports/week-{week_number}.md
```

### Portfolio Alert Monitor
Cowork task every 2 hours during market hours:
```
Check ~/alpha-firm/state/portfolio.json for any position down >8% from entry.
If found, create ~/alpha-firm/alerts/{today}-stop-loss.md with the alert details.
Also check if any position has hit its target return from the trade log.
```

## Directory Structure

```
alpha-firm/
├── .claude/
│   └── settings.json          # MCP servers + permissions
├── agents/                    # Agent system prompts
│   ├── macro.md
│   ├── crypto.md
│   ├── quant.md
│   ├── sentiment.md
│   └── contrarian.md
├── skills/                    # Shared skill docs
│   ├── market-research.md
│   ├── price-fetch.md
│   ├── trade-execution.md
│   └── memory-management.md
├── memory/                    # Agent research memory (JSON per day)
│   ├── macro/
│   ├── crypto/
│   ├── quant/
│   ├── sentiment/
│   └── contrarian/
├── state/                     # Persistent portfolio state
│   ├── portfolio.json
│   ├── leaderboard.json
│   ├── trade-log.json
│   └── daily-state.json
├── reports/                   # Cowork-generated reports
├── alerts/                    # Cowork-generated alerts
├── logs/                      # Execution logs
├── orchestrator.md            # PM decision prompt
├── run-check.sh               # Cron entry point
├── scripts/
│   ├── setup.sh               # Initial deployment
│   └── status.sh              # CLI status dashboard
└── CLAUDE.md                  # This file
```

## Quick Reference: Cost Comparison

| Approach | Monthly Cost | Per Check | Notes |
|----------|-------------|-----------|-------|
| API (Sonnet) | $150-450 | $0.50-1.50 | Scales with usage |
| API (Haiku via OpenClaw) | $30-90 | $0.10-0.30 | Lower quality |
| **Max 5x subscription** | **$100 flat** | **$0.00** | **Recommended** |
| Max 20x subscription | $200 flat | $0.00 | If hitting limits |
| Pro subscription | $20 flat | $0.00 | May hit limits at 3x/day |

## Important Notes

- **Remove `ANTHROPIC_API_KEY` from env** — if set, Claude Code bills to API instead of subscription. Run `unset ANTHROPIC_API_KEY` before starting.
- **Simulation mode** — all trades use real prices but no real orders are placed
- **Agents don't see each other** — subagents are isolated by design
- **Log everything** — every search, price fetch, and decision
- **If you hit rate limits** — drop to 2 checks/day, skip midday
- **Cowork and Claude Code share limits** — but Cowork tasks are typically much lighter than Code sessions
