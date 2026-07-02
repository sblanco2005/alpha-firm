# Skill: Outcome Evaluation & Agent Scorecards

## Purpose
This skill defines how the PM evaluates past recommendations to build a feedback loop. Agents learn from their mistakes (and successes) by receiving a scorecard showing their track record.

## When to Run
**Morning session only** (first check of the day). This avoids redundant price fetches.

## Step-by-Step Evaluation Process

### 1. Read Outcomes
Read `state/outcomes.json`. Find all recommendations with `"status": "tracking"`.

### 2. Check Due Checkpoints
For each tracking recommendation, check if today's date matches (or has passed) any unfilled checkpoint date:
- `day_1`, `day_5`, `day_10`, `day_20`, `horizon`

If a checkpoint date has passed but is still `null`, it's due for evaluation.

### 3. Fetch Current Prices
Use the **price-fetch MCP** (`mcp/price_server.py`, Yahoo Finance / CoinGecko) for each unique ticker that has a due checkpoint. **Never use Brave Search for numeric price data** — audit on 2026-07-02 found Brave/LLM-mediated lookups returned prices stale by 1-3 trading days (see REMEDIATION-PLAN.md Phase 0.2). If the MCP fails after retry, mark the checkpoint `"price_unavailable"` and re-evaluate next session rather than filling in a searched number.

**Batch efficiently**: If multiple recommendations share the same ticker, fetch the price once.

### 4. Fill Checkpoints
For each due checkpoint:
```
checkpoint.price = current_price
checkpoint.return_pct = ((current_price - entry_price) / entry_price) * 100
```

Update `peak_return_pct` if this return exceeds the previous peak:
```
if return_pct > (peak_return_pct or 0):
    peak_return_pct = return_pct
```

### 5. Set Final Verdict (horizon checkpoint only)

> **METRIC CORRECTED 2026-07-02** (see REMEDIATION-PLAN.md Phase 0.4). The old definition — win = `peak_return_pct >= target` — counted a position that spiked intraday then got stopped out at a loss as a "win". That inflated win rates (e.g. crypto 62% alongside negative realized P&L) and corrupted every track-record modifier built on it. `peak_return_pct` is now a **diagnostic only** and must never determine a verdict.

When the `horizon` checkpoint is filled, set `final_verdict`:

**Executed trades** — realized outcome is ground truth. Use the realized exit price (or horizon price if still open):

| Condition | Verdict |
|-----------|---------|
| `return_pct >= target_return_pct` | `"win"` |
| `return_pct > 0` but below target | `"partial"` — right direction, wrong magnitude |
| `return_pct <= 0` | `"loss"` — thesis was wrong |

Also record the R-multiple on every executed outcome:
```
stop_distance_pct = abs(entry_price - stop_loss) / entry_price * 100
r_multiple = return_pct / stop_distance_pct
```
Agent quality = **mean realized R-multiple**, not win rate.

**Paper (unexecuted) picks** — same table, using horizon `return_pct`. Never `peak_return_pct`.

Set `status` to `"evaluated"`.

### 6. Regenerate Scorecards
After updating outcomes, regenerate `state/scorecards/{agent_id}.json` for each agent.

#### Scorecard Calculation

For each agent, filter `outcomes.json` for their recommendations:

**Overall stats** (only from `"status": "evaluated"` entries):
```
win_rate = wins / (wins + losses + partial)
avg_return_at_horizon = mean of all horizon return_pct values
avg_peak_return = mean of all peak_return_pct values
```

**Conviction calibration** (group by conviction ranges):
```
high (8-10): count, win_rate, avg_return
medium (5-7): count, win_rate, avg_return
low (1-4): count, win_rate, avg_return
```

**By asset type** (group by asset_type):
```
stock: count, win_rate
etf: count, win_rate
crypto: count, win_rate
prediction: count, win_rate
```

**Recent picks** (last 10, include both evaluated and tracking):
```
For each: date, ticker, conviction, entry_price, current_return_pct or final_return_pct, status, horizon_days_remaining (if tracking)
```

**Patterns** (generate from the data):
- **Strengths**: If high-conviction win rate > 60%, note it. If a specific asset type has >60% win rate, note it.
- **Weaknesses**: If medium/low conviction win rate < 40%, note it. If a specific asset type consistently loses, note it.
- **Adjustment**: Concrete suggestion based on the data. Examples:
  - "Your conviction-8+ picks win 75% of the time — maintain high-conviction approach"
  - "Your medium-conviction picks (5-7) have only 30% win rate — consider raising your threshold to only recommend when conviction >= 7"
  - "Your stock picks underperform your ETF picks — consider focusing more on ETFs"
  - "Your timing tends to be early — peak returns average 12% but horizon returns only 4%. Consider suggesting longer horizons."

### 7. Write Updated Files
Write `state/outcomes.json` and all `state/scorecards/*.json` using the atomic write pattern (write to `.tmp`, validate with `jq`, then `mv`).

## Recording New Recommendations

After each market check (all sessions, not just morning), record all 5 agent recommendations into `outcomes.json`:

For each agent recommendation:
```json
{
  "id": "{agent_id}-{date}",
  "agent_id": "{agent_id}",
  "date": "{today}",
  "session": "{session}",
  "ticker": "{ticker}",
  "asset_type": "{asset_type}",
  "entry_price": "{current_price from recommendation}",
  "target_return_pct": "{target_return_pct from recommendation}",
  "horizon_days": "{horizon_days from recommendation}",
  "conviction": "{conviction}",
  "was_executed": true/false,
  "thesis_summary": "{first sentence of entry_thesis}",
  "status": "tracking",
  "checkpoints": {
    "day_1":  { "date": "{+1 trading day}", "price": null, "return_pct": null },
    "day_5":  { "date": "{+5 trading days}", "price": null, "return_pct": null },
    "day_10": { "date": "{+10 trading days}", "price": null, "return_pct": null },
    "day_20": { "date": "{+20 trading days}", "price": null, "return_pct": null },
    "horizon": { "date": "{+horizon_days trading days}", "price": null, "return_pct": null }
  },
  "peak_return_pct": null,
  "final_verdict": null
}
```

**Trading day calculation**: Skip Saturdays and Sundays. For example, if today is Friday 2026-03-28:
- day_1 = Monday 2026-03-31
- day_5 = Friday 2026-04-04

**Deduplication**: If an agent makes the same ticker recommendation in the same day (e.g., morning and closing sessions), only keep the latest one (update the existing entry).

## Token Budget
- Reading outcomes.json: ~200-500 tokens (grows slowly)
- Brave Search for checkpoints: ~500-1500 tokens (1-3 queries per day on average)
- Writing scorecards: ~500 per agent
- Total additional cost per morning check: ~4,000-6,000 tokens
