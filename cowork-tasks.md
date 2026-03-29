# Alpha Firm — Cowork Task Templates

These are ready-to-paste prompts for Claude Desktop's Cowork feature.
Cowork handles reporting, monitoring, and analysis — separate from the
Claude Code agents that do the actual trading.

---

## 1. Daily End-of-Day Report (run at 4:30pm ET)

```
Read these files from my alpha-firm project:
- ~/alpha-firm/state/portfolio.json
- ~/alpha-firm/state/leaderboard.json  
- ~/alpha-firm/state/trade-log.json
- ~/alpha-firm/state/daily-state.json
- ~/alpha-firm/logs/ (today's log file)
- ~/alpha-firm/memory/ (today's recommendation files from each agent)

Generate a daily performance report with:

1. PORTFOLIO SNAPSHOT
   - Current NAV vs starting capital ($10,000)
   - Total P&L ($ and %)
   - Cash position and % invested
   - Each open position with entry price, current estimated value, and unrealized P&L

2. TODAY'S ACTIVITY
   - How many market checks ran
   - What each agent recommended (ticker, conviction, thesis summary)
   - What the PM decided and why
   - Any trades executed

3. AGENT LEADERBOARD
   - Rank agents by total P&L
   - Show picks executed, win rate, average return per pick
   - Highlight who would get the 20% reward bonus right now

4. INSIGHTS
   - Are agents converging on similar themes? (potential crowding risk)
   - Which agent has been most consistent this week?
   - Any positions that should be reviewed for stop-loss or profit-taking?

Save the report as ~/alpha-firm/reports/YYYY-MM-DD-daily.md
```

---

## 2. Weekly Review (run Sunday 8pm ET)

```
Analyze the last 7 days of Alpha Firm trading data:
- ~/alpha-firm/state/portfolio.json
- ~/alpha-firm/state/leaderboard.json
- ~/alpha-firm/state/trade-log.json
- ~/alpha-firm/memory/ (all agent memory files from the past week)
- ~/alpha-firm/reports/ (daily reports from the past week)

Generate a weekly review with:

1. PERFORMANCE SUMMARY
   - Week start NAV → Week end NAV
   - Weekly P&L ($ and %)
   - Cumulative P&L since inception
   - Number of trades (buys/sells) this week
   - Win rate this week

2. AGENT ANALYSIS
   - Rank agents by weekly P&L contribution
   - Which agent's picks were executed most?
   - Which agent had the highest average conviction?
   - Which agent was most accurate (recommendations that moved in the right direction)?
   - Current 20% reward pool: who gets it?

3. PORTFOLIO REVIEW
   - Current sector/asset class exposure
   - Concentration risk — is too much capital in one theme?
   - Any positions held > 2 weeks that should be evaluated?
   - Correlation between positions

4. STRATEGY OBSERVATIONS
   - Were there common themes across agent recommendations?
   - What market conditions prevailed this week? (trending, choppy, volatile)
   - Did the PM make good selections? Which passes in hindsight should have been buys?

5. NEXT WEEK OUTLOOK
   - Key events on the calendar (earnings, Fed, economic data)
   - Which agents should be given extra weight based on market conditions?
   - Any adjustments to position sizing or risk limits?

Save as ~/alpha-firm/reports/week-{week_number}-review.md
```

---

## 3. Stop-Loss Alert Monitor (run every 2 hours during market hours)

```
Quick check of Alpha Firm portfolio:
- Read ~/alpha-firm/state/portfolio.json
- Read ~/alpha-firm/state/trade-log.json

For each open position:
1. Check if it's down more than 8% from entry price (based on last known price)
2. Check if it's been held more than 14 days with less than 2% return
3. Check if the original thesis catalyst has passed (compare entry date to current date)

If ANY alerts trigger:
- Create ~/alpha-firm/alerts/YYYY-MM-DD-alert.md with details
- List the position, entry price, current estimated loss, and recommendation (sell/hold/review)

If no alerts: just note "No alerts" and exit.
```

---

## 4. Agent Recalibration (run monthly, 1st Sunday)

```
Deep analysis of Alpha Firm agent performance over the past 30 days:
- Read all files in ~/alpha-firm/memory/ (all agents, all dates)
- Read ~/alpha-firm/state/leaderboard.json
- Read ~/alpha-firm/state/trade-log.json
- Read ~/alpha-firm/reports/ (weekly reviews)

For each agent, analyze:

1. ACCURACY
   - What % of recommendations moved in the predicted direction within 5 days?
   - Average conviction score vs actual outcome
   - Are they calibrated? (high conviction = better outcomes?)

2. RESEARCH QUALITY
   - Are they using diverse search queries or repeating the same ones?
   - Are they tracking their own performance in memory?
   - Are they adjusting conviction based on recent accuracy?

3. STYLE DRIFT
   - Is the Contrarian actually being contrarian, or following trends?
   - Is the Momentum Quant citing technical levels, or just narratives?
   - Is each agent staying in their lane?

4. RECOMMENDATIONS
   - Should any agent's system prompt be modified?
   - Should position sizing defaults change for any agent?
   - Should the PM weighting formula be adjusted?

Save as ~/alpha-firm/reports/month-{month}-recalibration.md
```

---

## 5. Quick Portfolio Status (ad-hoc, anytime)

```
Read ~/alpha-firm/state/portfolio.json and ~/alpha-firm/state/leaderboard.json.
Give me a quick 5-line summary:
- NAV and P&L
- Cash available
- Open positions (tickers and approximate P&L each)
- Best performing agent
- Last trade date
```

---

## Setup Notes

### How to create Cowork tasks:
1. Open Claude Desktop app
2. Go to Cowork
3. Create a new task with the prompt above
4. Set the schedule (daily/weekly/ad-hoc)
5. Point the file access to your ~/alpha-firm/ directory

### Cowork vs Claude Code allocation:
- Cowork tasks use the Claude Desktop/web allocation
- Claude Code market checks use the Claude Code allocation  
- They share the same weekly limits on Pro/Max, but in practice
  Cowork tasks are much lighter (reading files + generating reports)
  compared to Code tasks (spawning subagents + MCP tool calls)
- Budget split: ~80% of quota to Claude Code checks, ~20% to Cowork reports
