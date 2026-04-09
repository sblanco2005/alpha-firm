# Skill: Backtesting — Historical Strategy Validation

## Purpose
Run the Alpha Firm pipeline against historical dates to evaluate how the system would have performed. Backtesting uses **date-fidelity**: agents only see information that was available on the simulated date, not future data.

## How It Works

Backtesting replays the full market check pipeline for a range of historical dates:
1. Set a simulated date (e.g., 2026-01-15)
2. All agent research is constrained to information available on/before that date
3. Prices at entry are the actual closing prices on the simulated date
4. Outcomes are evaluated against actual subsequent price movements
5. No lookahead bias — agents cannot see what happened after the simulated date

## Running a Backtest

### Entry Point
```bash
./scripts/backtest.sh <start_date> <end_date> [session]
```

Examples:
```bash
./scripts/backtest.sh 2026-01-02 2026-03-28           # Full Q1 2026, morning sessions
./scripts/backtest.sh 2026-02-01 2026-02-28 morning    # February, morning only
./scripts/backtest.sh 2026-03-01 2026-03-01             # Single day test
```

### What the Script Does
For each trading day in the range:
1. Invokes Claude Code with a backtesting prompt
2. Claude orchestrates the full pipeline (analysts → debate → PM decision)
3. Results are written to `backtest/results/{run_id}/`
4. After all dates are processed, a summary report is generated

## Backtesting Prompt Template

The orchestrator receives this modified prompt for backtesting:

```
You are running Alpha Firm in BACKTEST MODE.

SIMULATED DATE: {date}
SESSION: {session}

CRITICAL RULES FOR BACKTESTING:
1. DATE FIDELITY: You are pretending today is {date}. When searching with Brave Search,
   add "before:{date}" or "as of {date}" to your queries. Ignore any information
   published after {date}.
2. Use the CLOSING PRICE on {date} as the entry price (search: "{ticker} stock price {date}")
3. Do NOT use any knowledge of what happened after {date}
4. Follow the exact same pipeline as a live market check

BACKTEST PORTFOLIO:
{contents of backtest/results/{run_id}/portfolio.json — or starting portfolio if day 1}

BACKTEST DAILY STATE:
{contents of backtest/results/{run_id}/daily-state.json}

Run the full market check: dispatch 5 analysts, collect recommendations, run debate,
make PM decision, execute trade if applicable.

Write all state updates to backtest/results/{run_id}/ instead of state/.
Write agent memory to backtest/results/{run_id}/memory/ instead of memory/.
```

## Date Fidelity Rules

### Search Queries
All Brave Search queries MUST be date-constrained:
- Stocks: `"{TICKER} stock price {date}"` or `"{TICKER} stock news before:{date}"`
- Macro: `"fed rate decision {month} {year}"`, `"treasury yield {date}"`
- Sentiment: `"{TICKER} reddit {month} {year}"`, `"insider buying {TICKER} {month} {year}"`
- Crypto: `"bitcoin price {date}"`, `"crypto news {month} {year}"`

### What Agents Can See
- News and data published on or before the simulated date
- Price data up to and including the simulated date
- Their own backtest memory from previous simulated dates in this run
- The backtest portfolio state (not the live portfolio)

### What Agents Cannot See
- Any news, prices, or data from after the simulated date
- The live portfolio or live agent memories
- Outcomes of previous backtest recommendations (unless the checkpoint date has passed in simulated time)

## Backtest Directory Structure

```
backtest/
├── results/
│   └── {run_id}/                    # e.g., "bt-2026Q1-20260407"
│       ├── config.json              # Backtest parameters
│       ├── portfolio.json           # Portfolio state (evolves during backtest)
│       ├── daily-state.json         # Daily state tracker
│       ├── trade-log.json           # All trades made during backtest
│       ├── outcomes.json            # All recommendations + checkpoints
│       ├── leaderboard.json         # Agent performance during backtest
│       ├── scorecards/              # Agent scorecards (backtest-scoped)
│       │   ├── macro.json
│       │   ├── crypto.json
│       │   ├── quant.json
│       │   ├── sentiment.json
│       │   └── contrarian.json
│       ├── memory/                  # Agent memory (backtest-scoped)
│       │   ├── macro/
│       │   ├── crypto/
│       │   ├── quant/
│       │   ├── sentiment/
│       │   └── contrarian/
│       ├── debate-log.json          # All debate results
│       ├── daily/                   # Per-day execution logs
│       │   ├── 2026-01-02.json
│       │   ├── 2026-01-03.json
│       │   └── ...
│       └── summary-report.md        # Final backtest summary
└── README.md
```

### config.json
```json
{
  "run_id": "bt-2026Q1-20260407",
  "start_date": "2026-01-02",
  "end_date": "2026-03-28",
  "session": "morning",
  "starting_capital": 10000,
  "created_at": "2026-04-07T20:00:00Z",
  "status": "running|completed|failed",
  "trading_days_total": 61,
  "trading_days_completed": 0
}
```

## Outcome Evaluation in Backtests

Since we're replaying history, we can evaluate outcomes immediately:

1. After each simulated trade, we know the actual future prices
2. At each checkpoint date (day_1, day_5, day_10, day_20, horizon), fetch the ACTUAL closing price on that date
3. This gives us ground-truth performance — no waiting for checkpoints to come due

### Price Fetching for Backtest Outcomes
```
"{TICKER} stock price closing {checkpoint_date}"
```

This means a 3-month backtest produces a COMPLETE scorecard with real win/loss data, not just "tracking" entries. This is the key advantage of backtesting.

## Summary Report Generation

After the backtest completes, generate `summary-report.md`:

```markdown
# Backtest Report: {run_id}
Period: {start_date} to {end_date}
Trading Days: {count}

## Performance
- Starting Capital: $10,000.00
- Ending NAV: ${nav}
- Total Return: {pct}%
- Max Drawdown: {max_dd}%
- Win Rate: {wins}/{total} ({pct}%)
- Avg Win: +{pct}% | Avg Loss: -{pct}%
- Sharpe Estimate: {sharpe} (annualized, using daily returns)
- Profit Factor: {gross_wins / gross_losses}

## Agent Leaderboard
| Agent | Picks Executed | Win Rate | Total P&L | Avg Return |
|-------|---------------|----------|-----------|------------|
| ...   | ...           | ...      | ...       | ...        |

## Debate Impact
- Trades where debate UPGRADED conviction: {count} → avg return: {pct}%
- Trades where debate DOWNGRADED conviction: {count} → avg return: {pct}%
- Trades where debate caused PASS: {count} → avg return if taken: {pct}%
  (positive = debate cost us money, negative = debate saved us money)

## Monthly Breakdown
| Month | Trades | Wins | Losses | P&L | Return |
|-------|--------|------|--------|-----|--------|
| ...   | ...    | ...  | ...    | ... | ...    |

## Key Observations
- Best trade: {ticker} on {date} → +{pct}% ({agent})
- Worst trade: {ticker} on {date} → -{pct}% ({agent})
- Longest winning streak: {count} trades
- Longest losing streak: {count} trades
- Days passed (no trade): {count}/{total} ({pct}%)

## Recommendations
[Auto-generated based on data patterns]
```

## Metrics Calculated

### Portfolio Metrics
- **Total Return**: `(ending_nav - 10000) / 10000 * 100`
- **Max Drawdown**: Largest peak-to-trough decline in NAV during the backtest
- **Sharpe Ratio**: `mean(daily_returns) / std(daily_returns) * sqrt(252)` (annualized)
- **Profit Factor**: `sum(winning_trades_pnl) / abs(sum(losing_trades_pnl))`
- **Win Rate**: `wins / (wins + losses)`

### Daily Returns
Track NAV at each day's close:
```
daily_return[i] = (nav[i] - nav[i-1]) / nav[i-1]
```
For days with no trade, NAV changes based on position mark-to-market at closing prices.

### Agent Metrics
Same scorecards as live trading, but with complete data (all checkpoints filled).

### Debate Metrics
- How often debate changed the outcome (upgraded, downgraded, caused PASS)
- Whether debate-influenced decisions performed better or worse than raw PM picks
- This validates whether the debate mechanism adds alpha or just costs tokens

## Token Budget Considerations

Backtesting is token-intensive:
- Each simulated day: ~25-40k tokens (full pipeline + debate)
- 1 month (~21 trading days): ~525-840k tokens
- 1 quarter (~63 trading days): ~1.6-2.5M tokens

### Optimization Strategies
1. **Run 1 session per day** (morning only) — saves 2/3 of tokens
2. **Use Sonnet for analyst subagents** during backtests — cheaper, fast enough
3. **Skip debate for low-conviction days** — if all analysts have conviction < 6, auto-PASS
4. **Run during off-peak hours** — schedule backtests for evenings/weekends
5. **Batch across days** — run 5 trading days per Claude session to amortize prompt overhead
6. **Start with 1-week backtests** to validate setup before running full quarters

### Recommended Approach
```bash
# Start small — validate the pipeline works
./scripts/backtest.sh 2026-03-01 2026-03-07

# If that works, run a month
./scripts/backtest.sh 2026-02-01 2026-02-28

# Full quarter (run overnight / over weekend)
./scripts/backtest.sh 2026-01-02 2026-03-28
```

## Limitations

1. **Search quality degrades for older dates** — Brave Search may return current results even with date constraints. Always verify dates in search results.
2. **No intraday data** — backtests use closing prices only, not intraday highs/lows
3. **No slippage/spread modeling** — assumes fills at closing price
4. **Survivorship bias** — we can only backtest tickers that still exist today
5. **LLM knowledge cutoff** — the LLM's training data may contain knowledge of events after the simulated date. Date-constrained searches mitigate this but can't fully eliminate it.
6. **Agent behavior may differ** — agents may research differently when given a past date vs. a live market. This is inherent to LLM-based backtesting.

## Comparing Backtest to Live

After accumulating enough live trading data, compare:
```
Live win rate vs backtest win rate → Are we overfit to historical patterns?
Live avg return vs backtest avg return → Are we doing better or worse in production?
Live PASS rate vs backtest PASS rate → Are we more or less selective live?
```

If backtest significantly outperforms live, the system may have lookahead bias or the market regime has changed. If live outperforms, the system is improving with real-time feedback loops.
