# Skill: PM Decision Review (Weekly Self-Audit)

## Purpose
The agents get audited every Saturday (weekly post-mortem). This skill audits the **PM itself** — the decisions to PASS, to kill trades in debate, and to buy. The PM's biggest errors are invisible in the trade log: the winners it refused. This loop makes them visible, prices them, and converts repeated error patterns into bounded self-adjustments — without Santi having to monitor performance manually.

## When
- **Weekly** (Saturday, after the agent post-mortem): pass/kill audit + PM scorecard refresh
- **Monthly** (first Saturday): threshold + penalty calibration (needs the larger sample)

Run via `scripts/run-pm-review.sh` (cron). The gather/promote mechanics live in `scripts/pm_review.py`.

## The Counterfactual Rule
Since Run 2, idle capital sits in the SPY sweep. Therefore every decision has an exact counterfactual:

```
cost_of_pass  = pick_return_over_horizon - spy_return_over_same_window
```

- Passed pick beat SPY at horizon → **bad pass** (the money sat in SPY earning less)
- Passed pick underperformed SPY → **good discipline** (the sweep was the better trade)

A pass is NEVER judged against zero. Judging vs cash flatters the PM in bull markets.

## Weekly Review Steps

### 1. Read the gathered context
`scripts/pm_review.py gather` writes `state/pm-reviews/{weekStart}.json` containing, for each evaluated decision:
- The pick (agent, ticker, conviction, final_score, penalties applied)
- The decision (BUY / PASS / DEBATE_KILL / VETO) and the PM's stated reason
- Realized pick return vs SPY over the same window
- Classification: `good_buy`, `bad_buy`, `good_pass`, `bad_pass`, `good_kill`, `bad_kill`

### 2. Assign root causes to errors
For each `bad_pass`, `bad_kill`, `bad_buy`, pick ONE root cause:

| Root cause | Meaning |
|---|---|
| `threshold_too_high` | Score was 7.0-7.5/8.0, thesis was sound, pick won |
| `debate_overweight_bear` | Bear objection was generic/wrong; bull had data; killed anyway |
| `penalty_misfire` | Narrative/SPY-baseline penalty pushed a winner below the bar |
| `regime_misread` | PM's market-regime call (bull/bear/timing) was wrong |
| `evidence_misjudged` | PM scored evidence/falsifiability wrong vs what was knowable |
| `process_correct_outcome_bad` | Decision was right given the information; result was luck. NOT an error — log and move on |
| `external_shock` | Unknowable event. Never generates an adjustment |

**Honesty rule:** `process_correct_outcome_bad` is the correct label for many losers AND many missed winners. Do not manufacture lessons from noise. If in doubt, it's noise.

### 3. Draft candidate adjustments (machine-enforceable)
Only for patterns, never single events. Each candidate needs `(root_cause + context_pattern + adjustment_spec)`:

```json
{
  "id": "kill-downgrade-sentiment-conv8",
  "status": "candidate",
  "root_cause": "debate_overweight_bear",
  "pattern": "debate kills of sentiment picks with conviction >= 8",
  "adjustment": { "type": "kill_downgrade", "applies_to": "sentiment", "min_conviction": 8 },
  "evidence": [ ...one entry per corroborating decision... ]
}
```

### 4. Write the review
`reports/{year}-week{N}-pm-review.md`: scoreboard (counts + total foregone alpha), each error with root cause, candidates drafted, and one paragraph of honest self-assessment. Then `scripts/pm_review.py promote` merges candidates and auto-promotes at the corroboration threshold.

## Adjustment Bounds (HARD — enforced by pm_review.py, not by judgment)

| Adjustment type | Allowed range | Notes |
|---|---|---|
| `threshold_delta` | execution threshold stays within **[7.0, 8.5]**, max one active delta of ±0.5 | Never stacks |
| `kill_downgrade` | debate kill → BUY_ELIGIBLE_REDUCED_SIZE (0.90x, 75% size) for the matched pattern | **fatal_flaw VETO can never be downgraded** |
| `penalty_disable` | a penalty (narrative / spy_baseline) set to 1.0x for the matched pattern | May never invert into a bonus |
| `penalty_restore` | re-enable a disabled penalty | — |

Promotion requires **≥3 corroborating decisions** across ≥2 different weeks. `external_shock` and `process_correct_outcome_bad` never count as evidence. Every active adjustment carries a 45-day `review_date`; if the pattern's error rate hasn't stayed elevated, it auto-retires. Max **3 active PM adjustments** at any time — if a 4th qualifies, the oldest retires.

## Monthly Recalibration (first Saturday)
With ~60 decisions/month:
1. **Threshold curve**: bucket all scored candidates by final_score (7.0-7.5, 7.5-8.0, 8.0+); compare realized alpha per bucket. If the 7.0-7.5 bucket matches the 8.0+ bucket, the threshold is not discriminating — draft a `threshold_delta` candidate.
2. **Penalty audit**: picks that had narrative/SPY-baseline penalties applied vs not — did penalized picks underperform? If a penalty shows no separation over 2 consecutive months, draft `penalty_disable`.
3. **Debate gate value**: total alpha saved by kills minus total alpha lost to bad kills. Report the number every month — this is the single most important gauge of whether the Capital Protection Gate protects capital.

## PM Scorecard (`state/scorecards/pm.json`)
Regenerated every weekly run; **injected into the PM's context at every market check** (orchestrator Step 1, alongside agent scorecards):
- `pass_accuracy` — % of passes where SPY beat the passed pick
- `kill_accuracy` — % of debate kills where SPY beat the killed pick
- `buy_accuracy` — % of buys that beat SPY over their holding window
- `foregone_alpha_total` — cumulative cost of bad passes/kills (the invisible losses)
- `active_adjustments` — currently applied self-adjustments
- ns for everything; any metric with n < 10 is labeled `INSUFFICIENT_SAMPLE`

The PM reads this the way agents read theirs: calibrate, don't flagellate. A 60% pass accuracy with honest process labels is healthy; a 90% pass accuracy probably means the bar is so high the firm is just an index fund with overhead.
