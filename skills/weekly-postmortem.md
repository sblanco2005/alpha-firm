# Skill: Weekly Losing-Trade Post-Mortem

## Purpose
Every week, review the firm's losing trades, determine **why** each one lost, attribute it to the responsible **agent** and a root-cause **category**, and draft **preventive rules** that retrofit into the orchestrator so the same mistake is not repeated. This is the engine that turns realized and paper losses into hard, enforced trading constraints — closing the learning loop without any manual editing of `orchestrator.md`.

## Inputs
- `state/retrospectives/{weekStart}.json` — already built by `scripts/weekly_postmortem.py gather`. It contains:
  - `losses[]` — each is `realized` (closed at a loss) or `paper` (high-conviction ≥7 recommendation that resolved to a loss). Each carries: `agent`, `ticker`, `thesis`/`thesis_summary`, `entry_price`, full `checkpoints` trajectory (day_1/5/10/20/horizon), `peak_return_pct`, `horizon_return_pct`/`return_pct`, `exit_reason` (realized), `conviction`, and the agent's current `agent_scorecard` (win_rate, conviction_calibration, by_asset_type). It also lists `applicable_active_lessons` — rules already live that *should* have caught this loss (a violation means the rule is being ignored or is insufficient).
- `state/lessons-learned.json` — existing rules (so you do not duplicate live ones; reference/extend them instead).

## Outputs (write both, atomically: `.tmp` → `jq .` → `mv`)
1. **Human-readable report** → `reports/{year}-week-postmortem.md` (append week_start to the filename if you run more than once a year, e.g. `2026-week-postmortem-06-08.md`).
2. **Candidate rules** written back INTO the same retro JSON under the top-level `candidate_rules` key (array), plus a short `analysis_notes` string. The `promote` step reads these — without them nothing is learned.

---

## Step 1 — Root-cause each loss

For **every** loss in `.losses[]`, assign **one primary** root cause and optionally **one secondary**, each with a 1–2 sentence explanation **grounded in that loss's own data** (cite the checkpoint numbers, thesis, or exit_reason — never hand-wave).

| Root cause | When to choose it | Example signal in the data |
|---|---|---|
| `thesis_error` | The core claim was directionally or factually wrong | Horizon return negative from day_1, never recovered; catalyst thesis didn't play out |
| `timing_error` | Right direction, wrong entry/exit | `peak_return_pct` positive but `horizon_return_pct` negative (gave gains back) |
| `regime_error` | Right idea for the wrong market regime | Contrarian mean-reversion pick during a bull-trend; entry during a VIX spike |
| `catalyst_miss` | Expected catalyst didn't fire or was already priced in | Catalyst date passed with no move, or rallied into the event then faded |
| `valuation_error` | Overpaid vs fundamentals | Entry well above any supportable level; fundamentals overlay would have rejected |
| `risk_mgmt_error` | No stop, held past stop, or oversized | `exit_reason` mentions stop hit; position sized too large; no stop set |
| `asset_type_error` | Wrong instrument for the thesis | Crypto agent picked an ETF instead of a miner; thesis was stock-specific but pick was an index ETF |
| `calibration_error` | High conviction assigned to a weak setup | `conviction` ≥ 8 but the agent's scorecard shows that conviction band has a low win rate |
| `narrative_bias` | Compelling story, not falsifiable / evidence-light | Thesis is interpretive, no hard data points, no dated catalyst |
| `execution_error` | Bad fill / chased the entry | Bought into strength at the peak; entry far above the level the thesis implied |
| `concentration_error` | Added to existing or correlated exposure | Same sector/theme already heavy in the portfolio |
| `external_shock` | Exogenous event unrelated to the thesis | CPI/Fed/geopolitical flush cited in exit_reason; thesis was fine, market wasn't |

**Attribution = the `agent` field on the loss.** Do not blame the PM or "the market" except via `external_shock` (which is logged but, by design, **never auto-promotes to a hard rule** — you can't prevent a black-swan flush with a trading rule).

If a loss clearly violated an already-`active` lesson (it's in `applicable_active_lessons`), call that out explicitly — it means enforcement is broken, and your candidate rule should target *enforcement*, not a new restriction.

---

## Step 2 — Draft candidate preventive rules

Group losses by `(agent + root_cause + enforcement pattern)`. For each **distinct pattern with ≥1 loss this week**, emit exactly ONE candidate rule object. Merge corroborating losses into one rule via `source_losses` — do not emit duplicate rules for the same pattern.

### Candidate rule schema (must match exactly — `promote` validates field names)
```json
{
  "id": "crypto-reject-etf",
  "category": "asset_type_restriction",
  "applies_to": "crypto",
  "root_cause": "asset_type_error",
  "rule": "Reject crypto-agent ETF recommendations (IBIT/BITO/ETHA). Mining stocks and BTC-treasury companies only.",
  "enforcement": { "type": "reject_asset_type", "value": "etf" },
  "source_losses": ["realized-IBIT-2026-06-01", "realized-BITO-2026-06-08"]
}
```
- `applies_to` — an agent id (`macro`/`crypto`/`quant`/`sentiment`/`contrarian`/`catalyst`) or `"all"`.
- `source_losses` — **real `loss_id` values from this retro's `.losses[]`**. The promote step maps these to evidence; bogus ids yield no evidence and the candidate is dropped.
- `root_cause` — exactly one taxonomy value.
- `enforcement.type` — exactly one of the canonical types below.

### Canonical enforcement types (the only values `promote` accepts)
Map the lesson onto the **most specific** existing orchestrator mechanic. Examples:

| type | value | Meaning / how the PM applies it |
|---|---|---|
| `reject_asset_type` | `"etf"` / `"crypto"` / `"prediction"` | Hard reject any pick of that asset class from `applies_to` agent |
| `min_conviction` | `8` (int) | Reject that agent's picks below this conviction |
| `modifier` | `0.85` (float) | Multiply that agent's final score by this |
| `gate` | `"regime:bull"` / `"vix:>30"` | Block that agent's picks when the gate condition holds |
| `stop_loss` | `10` (int, %) | Force a tighter stop on that agent's positions |
| `max_size` | `15` (int, % of cash) | Cap position size for that agent |
| `entry_condition` | `"pullback:>3%"` / `"not_into_strength"` | Require an entry condition before buying |
| `require_dated_catalyst` | `true` | Reject picks whose catalyst has no specific date |
| `fundamental_floor` | `0.9` (float) | Reject picks whose fundamental modifier is below this |
| `max_correlated_positions` | `2` (int) | Block buys that would create >N correlated positions |
| `min_evidence_points` | `3` (int) | Require ≥N concrete data facts for that agent |

When in doubt, prefer the **simplest, most specific** enforcement that would have actually blocked the loss. A rule that wouldn't have prevented the losses it's based on is useless.

---

## Step 3 — Write the report

`reports/{year}-week-postmortem.md`, structure:

```markdown
# Weekly Post-Mortem — {week_start} → {week_end}
**Losses analyzed:** {n} ({realized} realized, {paper} notable paper) | **Candidate rules drafted:** {m}

## Losses reviewed
| Ticker | Agent | Kind | Return | Primary root cause | Why (evidence) | Would-be rule |
|---|---|---|---|---|---|---|
| ... | ... | realized | -21.4% | risk_mgmt_error | same-day buy+stop on VIX 22 spike; no pre-entry check | sentiment entry_condition |
(one short paragraph per loss if the table can't capture the nuance — especially timing_error cases where peak was positive)

## Candidate preventive rules
For each drafted rule: the rule, its enforcement spec, the source losses, and **a one-line check: "would this have blocked/prevented loss X?"** If no, revise it before emitting.

## Active-rule violations
List any losses that broke an already-active lesson (enforcement failure), and what to do about it.

## Notes for next week
Patterns to watch, agents needing recalibration, anything inconclusive.
```

## Step 4 — Write candidates back to the retro JSON

Update `state/retrospectives/{weekStart}.json`: set `candidate_rules` to your array and `analysis_notes` to a 1-2 sentence summary. Atomic write (`.tmp` → `jq .` → `mv`).

---

## Hard rules (do not violate)
1. **Draft candidates only. Never set `status` to `"active"`.** Promotion is decided deterministically by `scripts/weekly_postmortem.py promote` using a corroboration threshold (≥3 independent losses sharing the same pattern across weeks). One bad week cannot harden a rule — that is the over-fit guardrail, and it only works if you leave promotion to the code.
2. `source_losses` must contain **real `loss_id` values present in this retro**. No invented ids.
3. `root_cause` and `enforcement.type` must be **exactly** from the canonical lists above — unknown values are silently dropped by `promote`.
4. A candidate whose `root_cause` is `external_shock` is logged but will **never** be enforced; emit it only for the record, and do not expect it to become a rule.
5. Do not re-emit a rule that already exists and is `active` in `state/lessons-learned.json` for the same `(applies_to, category, enforcement)` — instead, if it was violated, write that up in "Active-rule violations" and let `promote` accumulate the new evidence.
6. Write all JSON atomically: `.tmp` → validate with `jq .` → `mv`.

## Quality bar
- Every "Why" must reference a concrete number from the loss (a checkpoint return, the exit_reason, a scorecard win-rate band). No "the market turned" without the data that shows it.
- Prefer **specific** rules over vague ones. "Reject crypto ETFs" beats "Be more careful with crypto".
- If fewer than ~30% of a week's losses map to an actionable pattern, say so in `analysis_notes` — some weeks are just noise, and forcing rules from noise is exactly what the guardrail exists to prevent.
