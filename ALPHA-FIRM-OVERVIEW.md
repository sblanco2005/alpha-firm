# Alpha Firm: Multi-Agent AI Investment Engine

## What Is Alpha Firm?

Alpha Firm is an autonomous investment research and decision-making system powered by six specialized AI analysts and a Portfolio Manager (PM) orchestrator. It runs on a VPS via scheduled cron jobs, performing 3 market checks per trading day. Each check spawns 6 independent AI agents that research markets in parallel, produce recommendations, stress-tests the top picks through an adversarial Bull/Bear debate, and feeds them to a PM layer that makes the final buy/sell/pass decision.

The system operates in **simulated mode** -- it tracks real market prices but does not execute real trades. This allows us to build a verifiable track record before deploying capital.

- **Current run:** Run 2, started July 2, 2026 with a fresh $10,000 (Run 1 archived in `runs/`)
- **Infrastructure:** Claude Code (Anthropic) on a dedicated VPS

---

## The July 2026 Overhaul (Run 1 → Run 2)

Run 1 (Mar 28 – Jul 2, 2026) ended at NAV $10,901 (+9.01% after reconciliation) vs SPY +14.97% — real alpha ≈ **-6%**. A full audit found the reported "-27% alpha" was mostly measurement error, but the true gap had identifiable structural causes. Everything below was fixed before Run 2 launched.

### What the audit found

1. **Fabricated SPY baseline.** The benchmark inception price ($555.66) never traded — the real Mar 27 close was $634.09. Reported SPY return was +32%, actual +15%.
2. **Systemically corrupted prices.** 33 of 145 fills (23%) failed OHLC validation. Many were prior-day closes recorded as fills; some were phantom (EYE "entered" at $21.91 on a day it never traded above $17.75 — its infamous -21.4% "worst trade" was really ≈ -2%; the UNH stop "triggered at $371.99" on a day UNH traded $389–401 — actually a winning trade). Root cause: prices came from Brave Search snippets and LLM recall instead of a market-data API.
3. **Broken win metric.** "Win = peak return touched target at any point" counted spike-then-stop-out losers as wins, inflating win rates that then drove the track-record modifiers — the meritocracy was rewarding noise.
4. **Structural sell bias.** Tight stops (8-15%), 3x/day sell evaluation vs 1 buy/day, a stale-position rule, and "sell first" ordering produced 31 buys/30 sells in 61 trading days and gave back $1,100+ from the high-water mark in whipsaw.
5. **Cash drag.** ~40% cash during a +15% SPY run explained most of the honest alpha gap.

### What changed (Run 2 rules)

| Fix | Mechanism |
|-----|-----------|
| **Single price source** | All prices from the price MCP (yfinance/Yahoo). Brave Search banned for numeric data. Every fill validated against the day's OHLC range; stops only fire on prices that actually printed. |
| **SPY sweep — default is beta, not cash** | At every closing session, cash above a 5% buffer sweeps into SPY (agent: "index"). Stock buys fund from the sweep, making every pick an explicit bet against the index. Worst case ≈ market performance. |
| **Falsification-first exits** | Each position's falsification condition (required at entry) is the primary sell trigger. -20% disaster stop as backstop only. Stale-position rule deleted. Trailing stops only after +15%. |
| **Sell symmetry** | Sells need an affirmative, price-verified trigger — no "sell first" reflex, no selling winners for discipline. Sell proceeds may fund a same-day buy. |
| **Honest win metric** | Verdicts from realized/horizon returns + R-multiples (realized % ÷ stop distance %). Peak return is diagnostic only. |
| **Modifiers frozen at 1.0x** | Track-record modifiers disabled for all agents until 30+ executed trades under the corrected metric. Sample sizes of 1-17 trades are coin flips. |
| **Fresh state, kept learnings** | Run 2 started at $10,000 with a live-fetched SPY baseline. Agent memory kept; lessons-learned rules demoted to candidate (must re-earn promotion). Run 1 fully archived for attribution analysis. |

Tooling added: `scripts/reconcile_prices.py` (OHLC audit/correction of the ledger), `scripts/reset_fresh_start.py` (archive + reset), REMEDIATION-PLAN.md (full phased plan; Phase 3 attribution pending).

---

## Model Providers, Tooling & Operational State (as of 2026-07-11)

*This section is the operational hand-off — read it before touching anything. It captures a
multi-day investigation into "why do the agents never pick with conviction ≥ 6?" The headline:
**it was almost entirely a tooling problem, not the model.***

### The model can be toggled: Kimi (default, since 2026-08-09) ↔ Claude ↔ Fable ↔ GLM (dormant)

The firm runs Claude Code (`claude` CLI) but the model behind it is swappable:
- **`kimi`** (default since 2026-08-09) — Kimi K3 (`kimi-k3`, 1M context) via an Anthropic-compatible endpoint. Pay-per-token API key (`KIMI_AUTH_TOKEN` in `.env.models`). Endpoint depends on where the key was created: Kimi platform keys (`sk-kimi-...`, ours) use `KIMI_BASE_URL=https://api.kimi.com/coding` and plain model id `kimi-k3` (the `[1m]` suffix is rejected there); Open Platform keys use `https://api.moonshot.ai/anthropic` with `kimi-k3[1m]`. Became primary when GLM was cancelled and the Claude plan was downgraded to Pro: Pro quota can't cover 6 agents × 3 sessions/day, and per-token K3 pricing (~$0.30/MTok cache-hit input) is ~an order of magnitude below the Anthropic API fallback rate.
- **`claude`** — real Claude on the operator's subscription login (**Pro tier since 2026-08-09** — too little quota for primary use; kept for A/B probes).
- **`fable`** — subscription login with every model tier routed to Fable 5.
- **`glm`** (dormant) — GLM 5.2 via z.ai's Anthropic-compatible endpoint. Account cancelled 2026-08-09; config kept inert in case it is ever reactivated.

Historically GLM was pinned globally in `~/.claude/settings.json`'s `env` block, which hijacked **every** `claude` call and made `run-check.sh` log a false *"Mode: Subscription (Max plan)"* while actually running GLM. That was refactored (commit `b74c0fb`):
- The provider keys (base URL, auth token, model aliases) now live in **`.env.models`** (gitignored, chmod 600).
- **`scripts/model-env.sh`** (sourced by run-check.sh, run-postmortem.sh, run-pm-review.sh, backtest.sh) reads `MODEL_PROVIDER` and exports the right env, defaulting to `kimi`.
- **`scripts/model.sh [kimi|claude|fable|glm|status|test]`** flips the default in `.env.models`; `test` probes the providers.
- One-off override without changing the default: `MODEL_PROVIDER=claude ./run-check.sh closing`.
- Each decision records `model_provider`/`model_label` in `trade-log.decisions[]`; **`scripts/model-compare.sh [date]`** reports conviction stats grouped by model.

### The agents were running with almost no research tools

Two independent defects, both fixed, both the real reason conviction stayed low:

1. **`WebSearch` does not exist on the z.ai/GLM endpoint.** It is an Anthropic *server-side* tool. Probed directly: GLM → WebSearch FAILED; Claude → WORKED. The agents' logged *"WebSearch 429 until 7/25"* was a misread of an unavailable tool, not a rate limit.
2. **None of the firm's MCP servers were actually loading.** They were declared under `mcpServers` in `.claude/settings.json` — a location **Claude Code v2 ignores**. Fixed by moving them to a project-scope **`.mcp.json`** (commit `8da8ece`). A second, subtler bug: headless `claude -p` does **not** auto-inject even project `.mcp.json` servers, so every firm invocation must pass **`--mcp-config <root>/.mcp.json --strict-mcp-config`** (exported as `$CLAUDE_MCP_ARGS` from model-env.sh; commit `f4cf429`). `--strict-mcp-config` also *excludes the operator's personal claude.ai connectors* (Gmail/Drive/Calendar) so autonomous `--dangerously-skip-permissions` agents can't reach personal email/files.

The firm's 5 MCP servers (in `.mcp.json`): **brave-search** (news/web), **finnhub** (real-time quotes), **price-fetch** (Yahoo prices + fundamentals, `mcp/price_server.py`), **filesystem**, **portclaude** (trade sync). API keys are referenced as `${BRAVE_API_KEY}`/`${FINNHUB_API_KEY}` from the gitignored `.env` — they used to sit in plaintext in the tracked `settings.json` (removed; both keys were rotated).

**Consequence:** before the fix the agents could only reach the web via `curl`. Unable to verify facts, they sometimes **fabricated** them — a fake "June CPI prints today" premise contaminated the 2026-07-09 closing and 2026-07-10 07:00 premarket decisions (real June CPI is 7/14). Those two decisions are now flagged `data_integrity.exclude_from_review` in `trade-log.json` and quarantined from the PM learning loop by `pm_review.py` so the PM doesn't learn from a false premise. **Do not trust an agent's self-report about which tools it used** — one claimed live `mcp__finnhub__*` data when no finnhub MCP was even loaded.

### The A/B result: model was NOT the constraint

With tooling fixed and held equal, on the identical 2026-07-10 closing session:

| model | decision | max conviction | notes |
|---|---|---|---|
| GLM 5.2 | PASS | 6 | same reasoning, same numbers |
| Claude (Max) | PASS | 5 | *lower*, if anything |

Both produced disciplined, *sourced* PASSes with near-identical per-agent conviction. **GLM ≈ Claude on this task** — swapping models buys nothing here. The residual all-PASS behavior is the genuinely quiet VIX-15 market meeting a deliberately strict gate (bull-regime execution threshold 8.0, every stock pick must clearly beat SPY's ~+18% since inception, agent confirmation mandates like quant's ≥1.2× volume). That is a **strategy** setting, not a model or tooling limitation — and loosening it re-introduces the Run-1 over-trading failure mode.

### Backtesting is now date-faithful (no lookahead)

The backtester previously fetched **today's** price for simulated past days (price-fetch was hardcoded to Yahoo `range=5d`, finnhub is real-time, and the prompt told agents to Brave-search for prices), so any historical P&L was fiction. Fixed at the tool level (commit `b5ce140`):
- **`mcp/price_server.py` → `get_historical_price(symbol, as_of)` / `get_batch_historical_prices`** query Yahoo's chart with `period1/period2` around `as_of` and compute, from bars on/before `as_of` only: close, 52-week high/low, SMA50/200, volume + volume-vs-avg20. Crypto via CoinGecko's historical endpoint. (Verified: SPY on 2026-01-05 → $687.72, not today's ~$755.)
- **`scripts/backtest.sh`** now instructs agents to use it with `as_of=<sim date>` and passes **`--disallowedTools`** to hard-block the real-time leak tools (finnhub, current-price fetchers, WebSearch) so lookahead is impossible even if an agent ignores the prompt.
- Remaining caveat: yfinance *fundamentals* are still current (Finnhub free tier has no point-in-time financials). Prices/technicals are the dominant lookahead source and are now faithful.

**Early backtest signal (Jan 5–9 2026, GLM, faithful prices):** on real January data agents reached conviction **7–8** (vs the live July ceiling of 6) — but all six agents high simultaneously is being scrutinized as possibly an artifact of the disabled real-time tools (fewer ways to falsify → inflated confidence), not necessarily a richer market. The execution pipeline works (the SPY sweep executed at the correct historical price); whether a *single-name* pick clears the gate on faithful data is the open question a fuller backtest is answering.

### Verify everything: `scripts/healthcheck.sh`

`./scripts/healthcheck.sh` (fast, ~5s) checks the things that have actually broken: the `run-check.sh` executable bit (a lost `+x` caused every cron run to die with exit 126), `.env`/`.env.models` keys, both model profiles resolving, all 5 MCP servers `Connected`, state JSON validity, ET-vs-UTC date skew, the 3 market-check cron entries, and pm2 + dashboard endpoints. `--deep` additionally probes both providers live and asserts brave-search + finnhub are callable and WebSearch is (expectedly) absent on GLM. **Latest run: all checks green.**

### Two operational traps worth internalizing

1. **The VPS is UTC; the firm's trading day is US Eastern.** UTC rolls over at 8pm ET, which was flipping the date/holiday/weekend and breaking evening manual runs. All firm date logic (`run-check.sh`, the dashboard) now computes "today" in `America/New_York`.
2. **`pm2` and `claude` are not on the non-interactive SSH PATH**, and `pm2 restart --update-env` inherits the *current shell's* env (a stale exported key can silently override the file). Always `export PATH="$HOME/.npm-global/bin:$PATH"` and source the env file before restarting.

---

## The Six Analysts

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

### 6. Catalyst Agent

Identifies trades by reasoning about known future events before the market has fully priced in the outcome. Scans a rolling event calendar, estimates probability-weighted outcomes, and finds asymmetric setups where the expected outcome diverges from market consensus. Covers earnings dates, FDA PDUFA dates, regulatory rulings (FTC/DOJ/SEC), FOMC/CPI/NFP releases, product launches, and clinical trial readouts.

**Edge:** Forward-looking specificity -- trades events with known dates and quantifiable outcomes, not vibes. Models both outcomes and only recommends when the market is mispricing the probability.

**Key rules:** No date = no trade. Asymmetry required (pass if market already pricing 85%+ of base case). Binary events (FDA, regulatory) get smaller sizing (15-20% max). Macro events favor ETFs over single stocks.

**Conviction calibration:**
- 9-10: Known event date + specific asymmetry (market pricing ~50%, you assess 75%+) + bounded downside
- 7-8: Clear catalyst with probable outcome, some uncertainty on timing or scope
- 5-6: Event identified but market may already be pricing the likely outcome

### Sentiment Scout vs. Catalyst — Mandate Split

These two agents are complementary, not overlapping. Dispatching them with crossed mandates produces duplicate signals and wastes quota.

| Question | Agent |
|---|---|
| "What does the market feel right now?" | Sentiment Scout |
| "What's about to change the narrative?" | Catalyst Agent |
| Options flow, put/call ratios, retail crowding | Sentiment Scout |
| Upcoming earnings, FDA dates, FOMC | Catalyst Agent |
| Insider buying clusters (Form 4) | Sentiment Scout |
| Probability of a known future outcome | Catalyst Agent |

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

**FROZEN at 1.0x for all agents** (2026-07-02) until an agent reaches 30+ executed trades under the corrected realized-R metric. Historical win rates were computed on the deprecated peak-touched-target metric with partially corrupted prices. When unfrozen:

| Agent Win Rate | Modifier |
|---|---|
| > 60% | 1.2x |
| 40-60% | 1.0x |
| < 40% | 0.8x |
| < 30 executed trades | 1.0x (frozen) |

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
2. x Track record modifier (frozen at 1.0x until 30+ executed trades per agent)
3. x Fundamental modifier (0.7x to 1.3x, stocks only)
4. x Debate modifier (0.0x if VETO/PASS, 0.90x if reduced, 1.05x if eligible)
5. x Narrative penalty (0.85x if triggered, else 1.0x)
6. = Final score -- used for ranking and BUY/PASS decision

### Position Management (Falsification-First — rewritten 2026-07-02)

For each existing position, the PM asks at every check, in order:
1. Is the falsification condition met? -- Sell regardless of P&L (trigger verified via price MCP)
2. Has it hit the target return? -- Sell, or switch to a trailing stop per the agent's entry plan
3. Down 20%+ from entry? -- Disaster stop: sell and file a lesson candidate
4. Pre-binary-event position with weakening thesis? -- Exit BEFORE the event (justified 10-12% stops allowed on these only)
5. Otherwise -- HOLD. No stale-position sells; the SPY sweep handles opportunity cost.

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

### Step 2: Dispatch 6 Analyst Subagents (IN PARALLEL)
Each subagent:
- Reads its agent prompt from `agents/{agent_id}.md`
- Reads its rolling memory from `memory/{agent_id}/`
- Reads its performance scorecard from `state/scorecards/{agent_id}.json`
- Uses Brave Search MCP for real-time market research
- Uses Fetch for current prices
- Writes recommendation to `memory/{agent_id}/{today}.json`
- Returns exactly ONE JSON recommendation

Subagents are independent -- they cannot see each other's work. Sentiment Scout and Catalyst Agent have non-overlapping mandates (see above) and must not be dispatched with overlapping instructions.

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
- Execute trade if decided -- update all state files (the `state/` JSON ledger is authoritative)

### Step 6: Record Outcomes
- Append all 6 recommendations to `state/outcomes.json`
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

Each session spawns all 6 analysts in parallel, collects recommendations, runs the fundamental overlay, runs the bull/bear debate, and applies the PM decision framework. The morning session also evaluates any due outcome checkpoints.

**Price Refresh:** Before each Claude session, `scripts/refresh-prices.sh` fetches live prices from Yahoo Finance (stocks/ETFs) and CoinGecko (crypto), updating portfolio NAV. Falls back to entry price if a fetch fails.

**Cron Wrapper:** `scripts/cron-wrapper.sh` wraps `run-check.sh` to track execution status (start time, duration, exit code, errors) in `state/cron-status.json` for the dashboard.

---

## Risk Management

| Rule | Details |
|------|---------|
| Daily buy limit | 1 buy per day maximum |
| Position sizing (VIX-adjusted) | VIX ≤ 25: 15-30% of cash · VIX 25-35: max 15% · VIX > 35: max 10% |
| Sector concentration cap | No single GICS sector may exceed 40% of NAV (hard block on new buys) |
| Max single-name concentration | 30% of portfolio in any single name |
| Agent dominance cap | No more than 2 consecutive buys from the same agent |
| Stop-loss review | Positions down >8% from entry are flagged |
| Hard stop | Positions down >10% from entry -- likely thesis broken, sell |
| Stale position review | Positions >14 days with <2% return are flagged |
| No leverage | Long-only, no margin, no shorting, no options |
| Prediction market cap | Max 10% of portfolio |
| Weekend/holiday skip | No trading on non-market days |
| SPY benchmark | Track SPY return from inception ($634.09, close of 2026-03-27 — corrected 2026-07-02). Log alpha = portfolio return - SPY return every session. |
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

## Current Portfolio (Run 2 — live)

*Run 2 inception 2026-07-02 at $10,000; SPY baseline $744.78. Snapshot from the last recorded
session, 2026-07-10 closing.*

| Metric | Value |
|--------|-------|
| **NAV** | ~$10,122 |
| **Cash** | ~$1,063 (~10.5%) |
| **Positions** | 1 — **SPY x12** (the benchmark sweep; entry $744.78) |
| **Single-name trades in Run 2** | **0** — every session so far has been a disciplined unanimous PASS (13+ consecutive) |
| **Alpha vs SPY** | ~ -0.04% (the book *is* the SPY sweep, so it tracks the index) |

**Why the book is just SPY:** in a low-VIX bull tape with the 8.0 execution threshold and the "must clearly beat SPY" hurdle, no agent has produced a single-name pick that survives the gate — so idle cash sweeps into SPY at each close and the firm holds beta. This is the designed-correct behavior when there is no confirmed edge (see "Model Providers, Tooling & Operational State" above — with the tooling fixed, the PASSes are now *informed*, not blind). Run 1's final book (8 positions, NAV ~$10,479) is archived for attribution; the table below is that **archived Run-1** book, not the live one.

### Open Positions — ARCHIVED Run-1 book (NOT live; Run 2 holds only SPY x12)

| Ticker | Shares | Entry Price | Latest Price | Return | Agent | Stop |
|--------|--------|-------------|--------------|--------|-------|------|
| CAT | 1 | $828.79 | $1,000.53 | +20.7% | Catalyst | $940 |
| TGLS | 13 | $38.61 | $44.72 | +15.8% | Sentiment | — |
| SYK | 1 | $294.50 | $331.29 | +12.5% | Contrarian | — |
| MU | 1 | $1,055.89 | $1,149.76 | +8.9% | Quant | $985 |
| NCLH | 40 | $20.22 | $21.31 | +5.4% | Sentiment | $19 |
| FCN | 4 | $153.18 | $150.36 | -1.8% | Sentiment | — |
| FDX | 3 | $331.82 | $318.11 | -4.1% | Quant | $315 |
| CLSK | 43 | $17.36 | $16.14 | -7.0% | Crypto | $14 |

### Agent Leaderboard — ARCHIVED Run-1 (unreliable metrics; see note below)

*Run 2 realized P&L is ~$0 (fresh start, 0 single-name trades); track-record modifiers are frozen at 1.0x for all agents until 30+ trades under the corrected win metric. The figures below are Run-1 archived data computed on the deprecated peak-touched-target metric with unreconciled prices — treat as noise, not signal.*

| Agent | Picks | Executed | Wins | Losses | Realized P&L | Win Rate |
|-------|-------|----------|------|--------|------|----------|
| Sentiment | 37 | 17 | 5 | 7 | **+$211.70** | 58.3% |
| Contrarian | 32 | 14 | 5 | 6 | +$90.69 | 33.3% |
| Catalyst | 15 | 3 | 1 | 0 | +$17.32 | 23.3% |
| Macro | 25 | 1 | 0 | 1 | -$2.16 | 10.0% |
| Crypto | 30 | 8 | 2 | 2 | -$51.55 | 62.0% |
| Quant | 30 | 15 | 3 | 6 | **-$106.98** | 42.6% |

**Key issue:** Portfolio +4.79% vs SPY +14.97% (corrected 2026-07-02). The alpha gap (-10.18%) is driven by over-trading individual stocks in a bull market and tight stop-losses generating realized losses. NOTE (2026-07-02): per-agent win rates are unreliable — computed on the deprecated peak-touched-target metric, unreconciled prices, and samples of 1-17 executed trades. Track-record modifiers frozen at 1.0x pending scorecard rebuild (REMEDIATION-PLAN.md).

**Changes implemented 2026-06-25** (superseded): agent restrictions (macro silenced, quant suspended, conviction floors, crypto ETF ban), threshold raised to 7.5/8.0, stops widened to 12-15%, P&L-based modifiers, SPY Baseline Test.

**Superseded 2026-07-02 (Run 2):** all agent-specific restrictions CLEARED — they were tuned on the deprecated win metric and corrupted prices. Modifiers frozen at 1.0x. Stops replaced by falsification-first exits + -20% disaster stop. SPY Baseline Test kept and made mechanical via the SPY sweep. New restrictions may only come from the automated lessons pipeline with reconciled-price evidence. See "The July 2026 Overhaul" section at the top.

---

## Monitoring & Reporting

### Native iOS App + Dashboard API
An **Express API** (`dashboard/server.js`, port 3001) serves live portfolio, analyst,
market-check and markets data. It's consumed by two clients:
- **Native iOS app (primary)** — an Expo / React Native app (`mobile/`) running on the
  phone via Expo Go, reaching the API over **Tailscale** (private, no public exposure,
  bearer-token auth). Tabs: **Portfolio** (NAV chart, positions, alpha-vs-SPY),
  **Markets** (12+ customizable benchmarks with live quotes/charts/news + a macro-regime
  read), **Analysts** (roster, scorecards, executed-trade ledgers), **Live** (session
  summaries + manual "run check" trigger). An **Account/Profile** page sets a personal
  capital base and can reset the tracked strategy — a non-destructive overlay that
  rescales the displayed book without touching the firm's real $10k simulation.
- **PWA (earlier build)** — the original browser dashboard, still available.

**Live prices for the dashboard/app** come from **Finnhub REST** (`/quote`, 15-min cached
to stay within the free tier); **price history** for all charts comes from **Yahoo Finance**
(`v8/finance/chart`, keyless). The firm's cron price refresh (`refresh-prices.sh`) uses
Yahoo Finance + CoinGecko to update NAV before each session.

The dashboard/app surface shows:
- Portfolio NAV with live P&L, an interactive multi-period NAV chart vs SPY
- Open positions with unrealized gains/losses and per-position detail
- Agent recommendations, conviction scores, and per-agent scorecards
- Cron job / session status and execution history
- Full trade history and PM decision reasoning

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
       ├─ Step 2: 6 Analyst Subagents (PARALLEL)
       │   ├── Macro Strategist ──────┐
       │   ├── Crypto Analyst ────────┤
       │   ├── Momentum Quant ────────┤→ 6 JSON recommendations
       │   ├── Sentiment Scout ───────┤
       │   ├── Contrarian ────────────┤
       │   └── Catalyst Agent ────────┘
       |
       ├─ Step 3: Fundamental Overlay (stocks only)
       │   └── Price Fetch MCP → yfinance fundamentals
       |
       ├─ Step 4: Bull/Bear Debate (top 2-3 picks)
       │   ├── Bull Researcher × 2-3 ─┐ (PARALLEL per pick)
       │   └── Bear Researcher × 2-3 ─┘
       |
       ├─ Step 5: PM Decision (buy/pass/sell)
       │   └── Write trades to state/ JSON (authoritative ledger)
       |
       ├─ Step 6: Record outcomes
       └─ Step 7: Write logs/{today}.md
```

### Infrastructure

| Component | Details |
|-----------|---------|
| **Runtime** | Claude Code CLI on VPS running **Kimi K3** (`kimi-k3`) via the Kimi platform's Anthropic-compatible endpoint (`https://api.kimi.com/coding`, pay-per-token key; switched 2026-08-09 after GLM cancellation + Claude downgrade to Pro — Pro quota can't cover 6 agents × 3 sessions/day) |
| **Live Prices** | Finnhub REST `/quote` for the dashboard/app (15-min cached); agents fetch prices via Brave Search / Fetch during checks |
| **Price History** | Yahoo Finance `v8/finance/chart` (keyless) — powers every chart, sparkline, and NAV reconstruction |
| **Cron Price Refresh** | `scripts/refresh-prices.sh` (Yahoo Finance + CoinGecko) updates NAV before each session |
| **Portfolio State** | JSON files in `state/` are authoritative (portfolio, trades, outcomes, scorecards, leaderboard, daily-state); no external portfolio-sync service |
| **Market Research** | Brave Search MCP for real-time news, analysis, and price lookups (per-agent, during checks) |
| **Dashboard / App** | Express.js API (port 3001) → native Expo iOS app over Tailscale (bearer-token auth) + earlier PWA; `pm2` runs the API + a Metro bundler process |
| **News Feed (Markets)** | Yahoo Finance search (`v1/finance/search`) for per-symbol headlines |
| **Notifications** | Telegram via OpenClaw cron jobs (morning briefing, EOD briefing) |
| **Scheduling** | System crontab (3 market checks) + OpenClaw cron (briefings, healthchecks) |
| **Backtesting** | `scripts/backtest.sh` -- replays full pipeline against historical dates |

### Directory Structure

```
alpha-firm/
├── agents/                    # Agent system prompts
│   ├── macro.md, crypto.md, quant.md, sentiment.md, contrarian.md, catalyst.md
│   ├── bull-researcher.md     # Bull/Bear debate agents
│   └── bear-researcher.md
├── skills/                    # Shared skill docs
│   ├── trade-execution.md, debate.md, fundamental-overlay.md
│   ├── outcome-evaluation.md, backtesting.md
│   ├── market-research.md, price-fetch.md, sentiment-research.md
│   └── memory-management.md
├── memory/                    # Agent research memory (last 20 sessions)
│   └── {macro,crypto,quant,sentiment,contrarian,catalyst}/{date}.json
├── state/                     # Persistent portfolio state
│   ├── portfolio.json, trade-log.json, leaderboard.json
│   ├── daily-state.json, outcomes.json, cron-status.json
│   └── scorecards/{macro,crypto,quant,sentiment,contrarian,catalyst}.json
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

9. **Near-zero marginal cost** -- Runs on Claude Max subscription. Falls back to the Anthropic API only if subscription quota is exhausted, ensuring no missed sessions. No per-trade API fees, no data vendor costs beyond Brave Search.

10. **Real-time monitoring** -- Native iOS app + dashboard API over Tailscale (portfolio, markets, analysts, live sessions), Telegram briefings (morning + EOD), and automated alerts.
