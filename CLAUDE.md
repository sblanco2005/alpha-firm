# Alpha Firm — Multi-Agent Investment Engine
# Architecture: Claude Code Subagents + Cowork (Subscription-only, $0 API spend)

## What This Is

You are the **PM orchestrator** of a multi-agent investment firm. You manage 5 specialized analyst agents who research markets **in parallel as Claude Code subagents**, then you act as the Portfolio Manager to select and execute the best trade.

**This entire system runs on your Claude Max subscription. No API tokens are consumed.**

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Cron (VPS) → run-check.sh                           │
│    └─ claude -p "Run morning check"                  │
│         ├─ Subagent: Macro Strategist                │  ← parallel
│         ├─ Subagent: Crypto Analyst                  │  ← parallel
│         ├─ Subagent: Momentum Quant                  │  ← parallel
│         ├─ Subagent: Sentiment Scout                 │  ← parallel
│         ├─ Subagent: Contrarian                      │  ← parallel
│         ├─ Subagent: Catalyst Agent                  │  ← parallel
│         │                                             │
│         ├─ Bull/Bear Debate (top 2-3 picks)          │
│         │   ├─ Bull Researcher × 2-3                 │  ← parallel
│         │   └─ Bear Researcher × 2-3                 │  ← parallel
│         │                                             │
│         └─ Lead: PM Decision + Execution             │
│                                                       │
│  Backtest → scripts/backtest.sh                       │
│    └─ Replays pipeline against historical dates       │
│                                                       │
│  Cowork (Desktop) → Daily report + alerts            │
└──────────────────────────────────────────────────────┘
```

**Key difference from API approach**: Instead of calling the Anthropic API with `fetch()`, each analyst runs as a **Claude Code subagent** — a lightweight parallel worker that reports results back to you (the lead agent). This uses your Max subscription quota, not pay-per-token billing.

## Agent Roles & Communication Flow

```
                           ┌─────────────────────────────┐
                           │     PM (Lead Orchestrator)   │
                           │  Scores picks, manages risk, │
                           │  executes trades, logs state │
                           └──────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │     Step 2: Dispatch 6 analysts (parallel, isolated)  │
          ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ Macro Strategist │       │  Crypto Analyst  │       │  Momentum Quant  │
│                  │       │                  │       │                  │
│ Regime shifts,   │       │ BTC on-chain,    │       │ Moving averages, │
│ central bank     │       │ mining stocks,   │       │ RSI, volume      │
│ policy, FX &     │       │ crypto ETFs,     │       │ breakouts, 52-wk │
│ commodity trends │       │ regulatory news  │       │ highs, rotation  │
│                  │       │                  │       │                  │
│ SPY, QQQ, TLT,  │       │ BTC, ETH, MARA,  │       │ Technicals,      │
│ GLD, DXY        │       │ IBIT, CLSK, etc. │       │ price & volume   │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                           │
         │      ┌───────────────────┴────────────────────┐     │
         │      │           Sentiment Scout               │     │
         │      │                                         │     │
         │      │ CURRENT PSYCHOLOGY & POSITIONING ONLY  │     │
         │      │ Options flow, put/call ratios, retail   │     │
         │      │ crowding, insider buying (Form 4),      │     │
         │      │ fear/greed regime, analyst upgrade      │     │
         │      │ cycles, meme dynamics                   │     │
         │      │                                         │     │
         │      │ "What does the market FEEL right now?"  │     │
         │      └───────────────────┬────────────────────┘     │
         │                          │                           │
         │      ┌───────────────────┴────────────────────┐     │
         │      │              Contrarian                 │     │
         │      │                                         │     │
         │      │ Beaten-down stocks w/ improving         │     │
         │      │ fundamentals, mean reversion,           │     │
         │      │ oversold sectors, high short interest   │     │
         │      └───────────────────┬────────────────────┘     │
         │                          │                           │
         │      ┌───────────────────┴────────────────────┐     │
         │      │            Catalyst Agent               │     │
         │      │                                         │     │
         │      │ FORWARD-LOOKING EVENT PROBABILITY ONLY  │     │
         │      │ Upcoming earnings, FDA PDUFA dates,     │     │
         │      │ regulatory rulings (FTC/DOJ/SEC),       │     │
         │      │ product launches, FOMC/CPI/NFP,         │     │
         │      │ probability-weighted outcome modeling   │     │
         │      │                                         │     │
         │      │ "What's ABOUT TO change the narrative?" │     │
         │      └───────────────────┬────────────────────┘     │
         │                          │                           │
         ▼                          ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PM collects 6 JSON picks                        │
│              Scores with 6-category framework                       │
│            Selects top 2-3 (conviction >= 6)                        │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                    Step 2.5: Capital Protection Gate
                              │
               ┌──────────────┴──────────────┐
               ▼                              ▼
   ┌─────────────────────┐      ┌─────────────────────┐
   │   Bear Risk Mgr     │      │   Bull Researcher   │
   │   (goes FIRST)      │      │   (rebuts bear)     │
   │                     │      │                     │
   │ Attacks weakest     │ ───► │ Answers ONLY the    │
   │ assumptions, checks │      │ bear's specific     │
   │ if thesis priced    │      │ objections with     │
   │ in, finds failure   │      │ data & precedents   │
   │ precedents          │      │                     │
   │ Classifies:         │      │ Sources: analyst    │
   │ • fatal_flaw        │      │ upgrades, insider   │
   │ • serious_weakness  │      │ activity, catalysts │
   │ • manageable_risk   │      │                     │
   └─────────────────────┘      └─────────────────────┘
               │                              │
               └──────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                PM as Risk Chair (final decision)                    │
│                                                                     │
│  Fatal flaw found         → VETO (no trade)                        │
│  2+ unrebutted weaknesses → PASS (no trade)                        │
│  1 unrebutted weakness    → BUY at reduced size                    │
│  All attacks rebutted     → BUY                                    │
│  Inconclusive debate      → NO TRADE                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Sentiment Scout vs. Catalyst — mandate split:**

| Question | Agent |
|---|---|
| "What does the market feel right now?" | Sentiment Scout |
| "What's about to change the narrative?" | Catalyst Agent |
| Options flow, put/call, retail crowding | Sentiment Scout |
| Upcoming earnings, FDA dates, FOMC | Catalyst Agent |
| Insider buying clusters (Form 4) | Sentiment Scout |
| Probability of a known future outcome | Catalyst Agent |

These two agents are complementary, not overlapping. Sentiment Scout finds *current* mispricings from positioning. Catalyst Agent finds *future* mispricings from event probability. Both write to `memory/{agent_id}/{today}.json` independently.

**Communication model**: All agents are **isolated subagents** — they cannot see each other's work. The PM is the sole hub: it dispatches agents, collects results, orchestrates the debate, and makes the final call. No agent-to-agent communication occurs at any point.

## Capital & Rules

- **Starting capital**: $10,000
- **Instruments**: US stocks, crypto, ETFs, prediction markets
- **Long-only** — no shorting, no options
- **1 buy per day max** — can sell any position anytime; sell proceeds may fund a same-day buy (added 2026-07-02)
- **SPY sweep (default = beta, not cash)**: at each closing session, cash above a 5% operational buffer is swept into SPY (agent: "index"). Stock buys fund from the sweep. Sweep is exempt from sector cap, VIX caps, 1-buy/day, and leaderboard. See skills/trade-execution.md. (Phase 2.1, 2026-07-02)
- **3 market checks per day** — morning (9:30am ET), midday (12:30pm ET), closing (3:45pm ET)
- **Position sizing**: VIX-adjusted — 15-30% of cash (VIX<=25), max 15% (VIX 25-35), max 10% (VIX>35)
- **Sector concentration cap**: No single GICS sector may exceed 40% of portfolio NAV (hard constraint, new buys blocked)
- **Agent dominance cap**: No more than 2 consecutive buys from the same agent
- **SPY benchmark**: Track SPY return from inception ($634.09, actual close of 2026-03-27, the last trading day before inception — corrected 2026-07-02; prior $555.66 figure was fabricated) in every log. Calculate alpha = portfolio return - SPY return.
- **Incentive**: Best-performing analyst gets 20% of total firm profits

## How a Market Check Works

### Step 1: Pre-flight
1. Read `state/daily-state.json`
2. If `date` != today → reset: `checks=0`, `bought=false`, update `date`
3. If `checks >= 3` → STOP, log "All 3 checks completed for today"
4. Increment `checks` and save
5. Prune memory files older than 20 sessions

### Step 1.5: Outcome Evaluation (MORNING SESSION ONLY)
If this is the first check of the day (morning/premarket):
1. Read `state/outcomes.json`
2. Follow `skills/outcome-evaluation.md` to evaluate any due checkpoints
3. Use Brave Search to fetch current prices for tickers with due checkpoints
4. Update `state/outcomes.json` with checkpoint prices and verdicts
5. Regenerate all scorecards in `state/scorecards/*.json`

Skip this step for midday and closing sessions.

### Step 2: Dispatch 6 Analyst Subagents IN PARALLEL

**This is the core architectural pattern.** Use Claude Code's built-in subagent/Task tool to spawn 6 parallel workers:

```
For each agent in [macro, crypto, quant, sentiment, contrarian, catalyst]:
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
- **Sentiment Scout and Catalyst Agent have non-overlapping mandates** — Sentiment owns current psychology/positioning; Catalyst owns future event probability. Do not ask them to do each other's job in the dispatch prompt

**Subagent dispatch prompt template:**
```
You are the {AGENT_NAME} analyst at Alpha Firm. Follow the instructions in agents/{agent_id}.md exactly.

Today is {DATE}, {SESSION} session.

CURRENT PORTFOLIO:
{contents of state/portfolio.json}

YOUR MEMORY (last 20 sessions):
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

### Step 2.5: Capital Protection Gate (3-Stage Debate)
After collecting all 5 recommendations, run the trade through the capital-protection gate:
1. Score all 5 recommendations with the 6-category evidence-based framework (see `orchestrator.md`)
2. Select top 2-3 with conviction >= 6
3. **Stage 1 — Bear Risk Manager goes FIRST**: Spawn Bear subagent (`agents/bear-researcher.md`) for each candidate. Bear classifies risk (fatal_flaw / serious_weakness / manageable_risk), assigns flags, lists questions for bull. **Wait for bear to finish.**
4. **Stage 2 — Bull Rebuttal**: Spawn Bull subagent (`agents/bull-researcher.md` Phase 2) for each candidate. Bull answers ONLY the bear's specific attacks — no restating the thesis.
5. **Stage 3 — Risk Chair (PM decides)**: VETO if fatal flaw. PASS if 2+ unrebutted serious weaknesses. BUY_ELIGIBLE_REDUCED_SIZE if 1 unrebutted weakness. BUY_ELIGIBLE if all attacks rebutted.
6. **Unresolved uncertainty = negative.** Inconclusive debate = trade does NOT proceed.
7. See `skills/debate.md` for full details.

### Step 3: Collect Results & PM Decision
Once all 6 subagents return (or timeout after 90 seconds):
1. Read all recommendations from memory files
2. **Pre-filter**: Reject any recommendation with <2 concrete facts, no catalyst, no falsification condition, or that violates sector/sizing rules (see `orchestrator.md` Step 1)
3. **Agent dominance check**: Read last 2 buys from `state/trade-log.json`. If both are from the same agent as the top candidate, deprioritize that agent.
4. **Score using 6-category framework** (see `orchestrator.md` Step 3): Evidence Strength (25%), Falsifiability (20%), Risk/Reward (20%), Portfolio Impact (15%), Signal Confirmation (10%), Execution Readiness (10%). Hard reject if Evidence < 6 or Falsifiability < 5.
5. **Narrative penalty**: Apply 0.85x if >=2 narrative-bias triggers (vague catalyst, interpretive evidence, etc.)
6. For **stock** recommendations only, fetch fundamentals via MCP → compute Fundamental Modifier (0.7x-1.3x)
7. Run 3-Stage Capital Protection Gate from `skills/debate.md` on top 2-3 picks (conviction >= 7.5):
   - Bear Risk Manager classifies (fatal_flaw / serious_weakness / manageable_risk)
   - Bull rebuts specific attacks only
   - PM as Risk Chair: VETO (0.0x), PASS (0.0x), REDUCED (0.90x), ELIGIBLE (1.05x)
8. Final score = raw_pm_score × track_record × fundamental × debate × narrative_penalty × SPY_baseline_penalty
9. Decision: BUY the best pick if final_score >= 7.5 (or >= 8.0 in bull market mode), or PASS
   - **Agent-specific restrictions: NONE for Run 2** (cleared 2026-07-02 — the old macro/quant/contrarian/crypto/catalyst restrictions were tuned on the deprecated win metric and corrupted prices; see orchestrator.md Step 1.5). New restrictions come only from the automated lessons pipeline (Step 1.6) with reconciled evidence.
   - **Exits**: falsification condition is the PRIMARY sell trigger; -20% disaster stop as backstop; 10-12% stops only on justified pre-binary-event positions; NO stale-position rule (Phase 2.2, 2026-07-02)

### Step 4: Execute Trade (Simulation Mode)
If buying:
1. Verify `daily-state.bought == false`
2. Fetch current VIX level — apply VIX-adjusted sizing caps (see `skills/trade-execution.md`)
3. **Sector concentration gate**: Verify the buy won't push any GICS sector above 40% of NAV. If it would, BLOCK and try next-best pick or PASS (see `skills/trade-execution.md`).
4. Follow `skills/trade-execution.md` — fetch real price via Brave Search, record simulated trade
5. Update all state files (portfolio, trade-log, leaderboard, daily-state)

### Step 5: Record Outcomes
Append all 6 agent recommendations to `state/outcomes.json` following the schema in `skills/outcome-evaluation.md`. Mark which one was executed (`was_executed: true`). Calculate checkpoint dates (skip weekends).

### Step 6: Write Summary
Write a summary to `logs/{today}.md` and update all state files. Include:
- **SPY benchmark**: Fetch SPY price via the price MCP (never Brave Search), calculate `spy_return = (spy_price / 634.09 - 1) * 100`, calculate `alpha = portfolio_pnl_pct - spy_return`. Log both in the summary.

## Subagent vs Agent Teams — Why Subagents

For this use case, **subagents beat Agent Teams** because:
- Our agents are **independent researchers** — they don't need to talk to each other
- Subagents have lower coordination overhead (fewer tokens burned on inter-agent chat)
- The PM (lead agent) is the only one who needs to see all results
- Agent Teams would add unnecessary communication tokens between analysts

The **Bull/Bear Debate** step (Step 2.5) uses subagents too — bull and bear researchers run in parallel for each candidate pick, then report back to the PM. This is adversarial stress-testing, not agent-to-agent conversation.

## Token Budget Optimization

Running on a Max subscription means managing your weekly quota wisely:

### Per Market Check (~tokens)
- 6 analyst subagents × ~2-4k output tokens each = ~12-24k tokens
- Bull/Bear debate (4-6 subagents) × ~1-2k each = ~6-12k tokens
- PM decision context + reasoning = ~3-5k tokens
- Brave Search queries (5-8 per agent) = included in MCP
- Total per check: ~23-41k tokens

### Daily Budget (3 checks)
- ~69-123k tokens/day
- ~483-861k tokens/week
- Within Max 5x weekly limits (Catalyst Agent adds ~10% overhead vs. prior 5-agent setup)

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

## PM Decision Review (the PM audits itself)

Agents aren't the only ones who get graded. Every Saturday (10:00 UTC, after the agent post-mortem) `scripts/run-pm-review.sh` audits the **PM's own decisions** — every PASS, debate kill, and buy — against the exact counterfactual: the SPY sweep. A passed pick that beat SPY was a **bad pass** and its foregone alpha is priced; a passed pick that lost to SPY was good discipline.

- Weekly: root causes assigned per error (`skills/pm-review.md` taxonomy), PM scorecard regenerated (`state/scorecards/pm.json` — read at every market check via orchestrator Step 1.7), report to `reports/{week}-pm-review.md`
- Monthly (first Saturday): threshold curve, penalty audit, and debate-gate value (alpha saved by kills minus alpha lost to bad kills)
- Repeated error patterns (≥3 decisions, ≥2 weeks) auto-promote into `state/pm-lessons.json` as **bounded** self-adjustments: threshold moves max ±0.5 within [7.0, 8.5], debate kills downgradeable to reduced-size only (never fatal-flaw vetoes), penalties can be disabled but never inverted. Max 3 active adjustments; each auto-retires after 45 days.

This closes the last open loop: agents learn from losing trades, the PM learns from wrong decisions, and neither requires manual monitoring.

## Weekly Post-Mortem & Learning Loop

Every losing trade feeds a **fully-automated weekly review** that converts losses into enforced trading rules — closing the learning loop with zero manual editing of `orchestrator.md`. This is how mistakes become permanent guardrails.

```
Saturday 09:00 UTC (cron) → scripts/run-postmortem.sh
  1. weekly_postmortem.py gather   → state/retrospectives/{weekStart}.json
     (realized losses from trade-log + portfolio; notable paper losses conviction≥7
      from outcomes; each enriched with thesis, checkpoint trajectory, exit reason,
      agent scorecard, and any active lesson it violated)
  2. claude (skills/weekly-postmortem.md) → assigns a root cause to each loss,
     drafts candidate preventive rules with machine-enforceable specs,
     writes reports/{year}-week-postmortem.md + candidate_rules back into the retro file
  3. weekly_postmortem.py promote  → merges candidates into state/lessons-learned.json,
     auto-promotes to ACTIVE at a corroboration threshold, retires rules whose leak closed
```

**The over-fit guardrail (no human review = safe by construction):** a candidate rule enters as `status: candidate` (documented, NOT enforced). It only becomes `status: active` (enforced on every market check via `orchestrator.md` Step 1.6) once **≥3 independent losses** across one or more weeks share the same `(agent + root_cause + enforcement)` pattern. `external_shock` losses are logged but never promote. Active rules carry a 45-day `review_date`; when the agent's win rate for that pattern recovers ≥15pt, the rule auto-retires. So one noisy week cannot harden a bad rule, and stale rules lift themselves.

**Enforcement:** `orchestrator.md` Step 1.6 (and `run-check.sh` step 5.25) read `state/lessons-learned.json` at the start of every market check and apply every active rule's `enforcement` spec as a hard gate or score modifier — same authority as the hand-maintained Step 1.5 agent restrictions.

**Running it:**
```bash
# This week (automated, via cron)
./scripts/run-postmortem.sh

# One-time historical backfill to seed confirmed rules from inception
./scripts/run-postmortem.sh --since inception

# Inspect current rules
python3 scripts/weekly_postmortem.py list
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
│   ├── contrarian.md
│   ├── bull-researcher.md     # Bull/Bear debate agents
│   └── bear-researcher.md
├── skills/                    # Shared skill docs
│   ├── market-research.md
│   ├── price-fetch.md
│   ├── trade-execution.md
│   ├── memory-management.md
│   ├── debate.md              # Bull/Bear debate protocol
│   ├── backtesting.md         # Historical backtesting system
│   ├── fundamental-overlay.md
│   ├── outcome-evaluation.md
│   ├── sentiment-research.md
│   └── weekly-postmortem.md   # Weekly losing-trade post-mortem protocol
├── memory/                    # Agent research memory (last 20 sessions)
│   ├── macro/
│   ├── crypto/
│   ├── quant/
│   ├── sentiment/
│   └── contrarian/
├── state/                     # Persistent portfolio state
│   ├── portfolio.json
│   ├── leaderboard.json
│   ├── trade-log.json
│   ├── daily-state.json
│   ├── outcomes.json
│   ├── lessons-learned.json   # Auto-generated enforced rules (weekly post-mortem)
│   ├── scorecards/            # Agent performance scorecards
│   └── retrospectives/        # Weekly loss-context + candidate rules (one file per week)
├── backtest/                  # Backtesting results
│   └── results/{run_id}/      # One directory per backtest run
├── reports/                   # Cowork-generated reports
├── alerts/                    # Cowork-generated alerts
├── logs/                      # Execution logs
├── orchestrator.md            # PM decision prompt
├── run-check.sh               # Cron entry point
├── scripts/
│   ├── setup.sh               # Initial deployment
│   ├── status.sh              # CLI status dashboard
│   ├── backtest.sh            # Backtesting runner
│   ├── run-postmortem.sh      # Weekly post-mortem runner (cron entry point)
│   └── weekly_postmortem.py   # gather/promote engine for the learning loop
└── CLAUDE.md                  # This file
```

## Backtesting

Run `./scripts/backtest.sh <start_date> <end_date> [session]` to replay the full pipeline against historical dates. See `skills/backtesting.md` for complete documentation.

Key features:
- **Date fidelity** — agents only see information available on the simulated date
- **Full pipeline replay** — analysts → debate → PM decision → trade execution
- **Complete scorecards** — since outcomes are known, you get real win/loss data immediately
- **Debate impact analysis** — measures whether debates improved or hurt returns
- **Isolated state** — backtest results go to `backtest/results/{run_id}/`, never touch live state

```bash
# Quick validation (1 week)
./scripts/backtest.sh 2026-03-01 2026-03-07

# Full month
./scripts/backtest.sh 2026-02-01 2026-02-28

# Full quarter (run overnight)
./scripts/backtest.sh 2026-01-02 2026-03-28
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
