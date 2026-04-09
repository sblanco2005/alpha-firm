# Skill: Capital Protection Gate — Adversarial Trade Review

## Purpose

The debate layer is not a balanced discussion engine. It is a capital-protection gate. The Bear Risk Manager's job is to identify fatal flaws, hidden concentration, weak catalysts, poor asymmetry, and narrative overreach. The Bull Researcher may rebut only the bear's strongest objections with concrete evidence. The PM (acting as Risk Chair) then decides whether the trade is vetoed, passed, approved, or approved at reduced size. **Unresolved uncertainty is treated as negative, not neutral.**

## When to Run

**Every market check**, after scoring (Step 3 in orchestrator.md) and before the PM decision (Step 10).

Only debate the **top 2-3 recommendations** by raw PM score. Don't waste tokens debating weak picks.

If only 1 recommendation has conviction >= 6, debate just that one.
If no recommendation has conviction >= 6, skip debate — PM will likely PASS.

## Three-Stage Debate Process

### Stage 1: Bear Risk Manager (First)

The bear goes FIRST. This is intentional — the bear sets the terms of the debate, not the bull.

For each candidate pick, spawn a **Bear Risk Manager** subagent (`agents/bear-researcher.md`):

**Bear subagent prompt:**
```
You are the BEAR RISK MANAGER at Alpha Firm. Follow agents/bear-researcher.md exactly.

TRADE UNDER REVIEW:
Ticker: {ticker}
Agent: {agent_id}
Thesis: {entry_thesis}
Conviction: {conviction}
Target Return: {target_return_pct}% in {horizon_days} days
Entry Price: {entry_price}

CURRENT PORTFOLIO:
{contents of state/portfolio.json}

YOUR JOB: Attack this trade. Find the hidden way it blows up.
Classify: fatal_flaw, serious_weakness, or manageable_risk.
Assign all applicable risk flags.
List specific questions the bull must answer to save this trade.

Return ONLY the JSON from agents/bear-researcher.md.
```

**Wait for bear to complete before spawning bull.** The bull needs the bear's output.

### Stage 2: Bull Rebuttal (Second)

After the bear reports, spawn a **Bull Researcher** subagent (`agents/bull-researcher.md`) in Phase 2 mode:

**Bull subagent prompt:**
```
You are the BULL RESEARCHER at Alpha Firm in REBUTTAL MODE. Follow agents/bull-researcher.md Phase 2 exactly.

TRADE UNDER REVIEW:
Ticker: {ticker}
Agent: {agent_id}
Thesis: {entry_thesis}
Conviction: {conviction}
Target Return: {target_return_pct}% in {horizon_days} days

BEAR RISK MANAGER'S REPORT:
{full bear JSON output}

YOUR JOB: Answer ONLY the bear's strongest objections with concrete evidence.
Do not restate the thesis. Do not argue broadly.
Answer the bear's questions_for_bull specifically.
If you cannot rebut a point, say so honestly.

Return ONLY the Phase 2 JSON from agents/bull-researcher.md.
```

**NOTE:** For the FIRST candidate, bear and bull run sequentially (bear → bull). For candidates 2 and 3, you may run their bears in parallel, then their bulls in parallel, to save time.

### Stage 3: Risk Chair Decision (PM)

The PM acts as Risk Chair. This is NOT a score averaging. The PM answers:

1. **Did the bear find a fatal flaw?** If yes → **VETO.** Trade is dead.
2. **Did the bear raise serious weaknesses?** If yes → did the bull rebut each one with concrete evidence?
   - All rebutted → **BUY_ELIGIBLE**
   - Some unrebutted → **PASS** (or BUY_ELIGIBLE_REDUCED_SIZE if only 1 unrebutted and it's minor)
   - None rebutted → **PASS**
3. **Was the risk manageable?** → **BUY_ELIGIBLE** (possibly with sizing note)

### "Break the Trade" Checklist

Before approving any trade, the Risk Chair must answer:
- Is this just a good story?
- Is the catalyst actually specific?
- Is the timing edge real, or is this just "eventually true"?
- What happens if the market weakens broadly?
- Does the portfolio already own this bet in another form?
- What is the most likely way this loses money even if the thesis is directionally right?
- **Would I still buy this if I removed the writeup and looked only at the facts?**

That last question strips away narrative advantage.

## Decision Rules

| Outcome | When | Action |
|---------|------|--------|
| **VETO** | Bear found fatal_flaw | Trade rejected. No override. |
| **PASS** | 2+ serious weaknesses remain unrebutted | Trade rejected. Move to next candidate. |
| **BUY_ELIGIBLE_REDUCED_SIZE** | 1 unrebutted serious weakness OR unresolved macro/factor risk | Trade approved at 75% of normal size. |
| **BUY_ELIGIBLE** | Evidence is concrete, catalyst is specific, no major overlap, all serious attacks rebutted | Trade approved at normal size. |

**Critical default:** Unresolved uncertainty counts AGAINST the trade, not neutral. If the debate is inconclusive, the trade does NOT proceed.

## Risk Flag Hard Rules

| Condition | Action |
|-----------|--------|
| Any `fatal_flaw` flag from bear | VETO |
| 2+ serious risk flags unrebutted | PASS |
| `sector_overlap` + existing sector >30% of NAV | PASS or reduce size |
| `macro_conflict` unrebutted | Reduce size by 25% |
| `narrative_overreach` + `weak_catalyst` | PASS unless bull provides specific dated catalyst |
| `thesis_not_falsifiable` | PASS — cannot manage what cannot be measured |

## Debate Output Format

The Risk Chair produces this for each debated candidate:

```json
{
  "ticker": "SYMBOL",
  "debate_decision": "veto|pass|buy_eligible_reduced|buy_eligible",
  "bear_classification": "fatal_flaw|serious_weakness|manageable_risk",
  "risk_flags": ["already_priced_in", "weak_catalyst"],
  "bear_strength": 7,
  "bull_strength_updated": 5,
  "fatal_flaw_found": false,
  "serious_weaknesses_count": 2,
  "serious_weaknesses_rebutted": 1,
  "sizing_note": "Reduce size by 25% due to unrebutted macro_conflict",
  "reason": "Bear identified timing risk and macro headwind. Bull rebutted timing with specific Q1 earnings date (Apr 21) but could not address macro sensitivity. Trade approved at reduced size.",
  "break_the_trade_answer": "Would pass the facts-only test — evidence is concrete despite narrative concerns."
}
```

## Modifier Mapping (for Final Score)

The debate decision maps to a modifier applied to the final score:

| Decision | Modifier | Meaning |
|----------|----------|---------|
| BUY_ELIGIBLE | 1.05x | Survived scrutiny — small boost |
| BUY_ELIGIBLE_REDUCED_SIZE | 0.90x | Approved but weakened |
| PASS | 0.00x | Trade rejected — score zeroed |
| VETO | 0.00x | Trade killed — score zeroed |

**Note:** PASS and VETO both zero the score, but VETO is logged differently — it means a fatal flaw was found, not just insufficient evidence.

## Recording Debate Results

Append to the trade log decision entry:

```json
{
  "date": "2026-04-09",
  "session": "morning",
  "decision": "buy",
  "debate_results": [
    {
      "ticker": "AAPL",
      "debate_decision": "buy_eligible",
      "bear_classification": "serious_weakness",
      "risk_flags": ["timing_risk"],
      "bear_strength": 6,
      "bull_strength_updated": 7,
      "fatal_flaw_found": false,
      "serious_weaknesses_rebutted": 1,
      "reason": "Timing risk identified but rebutted with specific earnings catalyst date."
    },
    {
      "ticker": "NKE",
      "debate_decision": "pass",
      "bear_classification": "serious_weakness",
      "risk_flags": ["narrative_overreach", "weak_catalyst", "sector_overlap"],
      "bear_strength": 8,
      "bull_strength_updated": 4,
      "fatal_flaw_found": false,
      "serious_weaknesses_rebutted": 0,
      "reason": "Narrative-heavy contrarian thesis with no specific catalyst. Bull could not rebut bear's core objection."
    }
  ]
}
```

## Token Budget

- Stage 1 (Bear): 1 subagent per candidate × 2-3 candidates = 2-3 subagents (~1-2k tokens each)
- Stage 2 (Bull rebuttal): 1 subagent per candidate × 2-3 candidates = 2-3 subagents (~1-2k tokens each)
- Stage 3 (Risk Chair): PM inline, no extra subagent
- Total: 4-6 subagents, ~6-12k tokens
- Runs sequentially per candidate (bear then bull), but candidates can be parallelized

## Edge Cases

- **If bear classifies as fatal_flaw:** Bull is still spawned but only to confirm. If bull agrees (strength drops to 4 or below), VETO is confirmed. If bull strongly disagrees (strength 8+ with evidence), escalate to PM for manual review — this is rare and should be logged.
- **If bear classifies as manageable_risk:** Bull Phase 2 is optional. PM can approve directly. Save tokens.
- **If a subagent fails/times out:** Bear timeout → assume serious_weakness (conservative). Bull timeout → assume cannot rebut (trade passes unless bear was manageable_risk).
- **If all candidates get PASS or VETO:** PM should PASS for the day. Cash is a position.
