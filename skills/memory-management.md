# Skill: Agent Memory Management

## Purpose
Each analyst agent maintains a rolling 5-day memory of their research and recommendations. This memory allows agents to build context, track their accuracy, and identify multi-day trends.

## Memory Structure

### File Location
```
memory/{agent_id}/{YYYY-MM-DD}.json
```
Example: `memory/crypto/2026-03-28.json`

### File Format
Each daily memory file contains the agent's recommendation plus research context:
```json
{
  "agent_id": "crypto",
  "date": "2026-03-28",
  "sessions": [
    {
      "session": "morning",
      "timestamp": "2026-03-28T09:35:00",
      "recommendation": {
        "ticker": "IREN",
        "asset_type": "stock",
        "entry_thesis": "...",
        "conviction": 8,
        "risk": "...",
        "target_return": "15% in 2 weeks",
        "catalyst": "...",
        "current_price": 5.23
      },
      "research_notes": "BTC at $87k, IBIT saw $340M inflows, IREN hash rate up 15% QoQ",
      "market_context": "S&P +0.5%, risk-on day, DXY weakening"
    },
    {
      "session": "midday",
      "timestamp": "2026-03-28T12:35:00",
      "recommendation": {
        "ticker": "MARA",
        "conviction": 7,
        "...": "..."
      },
      "research_notes": "...",
      "market_context": "..."
    }
  ],
  "daily_reflection": "Both picks were BTC mining plays. Portfolio took the IREN morning pick. BTC held above $87k support. Will monitor mining stock relative strength tomorrow."
}
```

## Reading Memory (Before Research)

When an agent starts a session:

1. **List files** in `memory/{agent_id}/` directory
2. **Sort by filename** (date string sorts correctly) descending
3. **Load the last 5 files** (or fewer if the agent hasn't been running that long)
4. **Compile a context string** from each day's recommendations and notes
5. **Pass this context** to the agent as part of their research prompt

### Memory Context Template
```
YOUR RESEARCH MEMORY (last N days):

[2026-03-28] Morning: Recommended IREN (conviction 8) — BTC mining play on hash rate growth. Price was $5.23.
[2026-03-28] Midday: Switched to MARA (conviction 7) — broader BTC exposure.
[2026-03-27] Morning: Recommended IBIT (conviction 9) — ETF flows accelerating. Price was $42.10.
[2026-03-27] Closing: Maintained IBIT recommendation.
[2026-03-26] Morning: Recommended BTC (conviction 7) — pre-halving accumulation thesis.

TRACK RECORD:
- IBIT (3/27): Recommended at $42.10, current price $43.50 → +3.3% ✅
- BTC (3/26): Recommended at $86,200, current price $87,100 → +1.0% ✅
```

## Writing Memory (After Research)

After generating a recommendation:

1. **Read today's memory file** if it exists (may already have earlier sessions)
2. **Append** the new session to the `sessions` array
3. **Write** the updated file back

If it's the last session of the day (closing), add a `daily_reflection`:
- What worked today?
- What themes are you tracking?
- What should you look for tomorrow?

## Memory Pruning

During the orchestrator's pre-flight step:

1. List all files in each `memory/{agent_id}/` directory
2. Sort by date
3. Delete any files older than 5 days
4. Log deleted files for audit

### Pruning Script Logic
```bash
for agent in macro crypto quant sentiment contrarian; do
  find memory/$agent/ -name "*.json" -type f | sort | head -n -5 | xargs rm -f
done
```

## Memory-Informed Decision Making

Agents should use their memory to:

### 1. Track Accuracy
- Compare recommended entry prices to current prices
- Calculate hypothetical P&L on past recommendations
- Adjust conviction scores based on recent hit rate

### 2. Identify Trends
- "I've been bullish on mining stocks for 3 days and they've been working"
- "My macro thesis on rate cuts has been wrong — inflation data keeps surprising"
- "BTC has been consolidating in the $85k-$88k range all week"

### 3. Avoid Repetition
- Don't recommend the exact same trade with the exact same thesis unless new information supports it
- If you recommended something yesterday and the PM didn't pick it, consider whether to strengthen the thesis or pivot

### 4. Build Conviction Over Time
- A thesis that's been building for 3 days with confirming data should have HIGHER conviction
- A thesis that got contradicted by new data should be ABANDONED, not defended

## Retention Policy

| Data | Retention | Location |
|---|---|---|
| Agent daily memory | 5 days (auto-pruned) | `memory/{agent_id}/` |
| Outcome tracking | **Permanent** (never pruned) | `state/outcomes.json` |
| Agent scorecards | **Permanent** (regenerated daily) | `state/scorecards/` |
| Trade log | **Permanent** | `state/trade-log.json` |
| Leaderboard | **Permanent** | `state/leaderboard.json` |

`outcomes.json` and scorecards are the firm's permanent record. They survive memory pruning and allow agents to learn from picks made weeks or months ago.

## Important Rules
- **Never edit historical memory** — if a recommendation was wrong, let the record show it
- **Memory is private per agent** — agents cannot read each other's memory files
- **The PM can read ALL agent memories** — this is for decision context
- **Memory files are JSON** — always validate JSON before writing
- **Max 3 sessions per day** — morning, midday, closing
- **outcomes.json and scorecards are NEVER pruned** — they are the long-term feedback loop
