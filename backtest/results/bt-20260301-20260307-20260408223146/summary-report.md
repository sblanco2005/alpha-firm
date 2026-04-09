# Backtest Report: bt-20260301-20260307-20260408223146
Period: 2026-03-01 to 2026-03-07
Trading Days: 5 (March 2–6, 2026)
Session: morning

## Performance
- Starting Capital: $10,000.00
- Ending NAV: $9,992.88
- Total Return: -0.07%
- SPY Return (same period): -2.04%
- **Alpha: +1.97%**
- Max Drawdown: -1.29% (trough $9,871.48 on March 4)
- Win Rate: 2/4 (50%) — unrealized, 1 position flat (ORCL, same-day entry)
- Avg Win: +3.98% | Avg Loss: -4.15%
- Sharpe Estimate: -0.24 (annualized, using 5 daily returns)
- Profit Factor: 0.93 (gross wins $117.72 / gross losses $126.84)

*Note: All 5 positions remain open. Metrics reflect unrealized P&L as of 2026-03-06 close.*

## Agent Leaderboard
| Agent | Picks | Picks Executed | Win Rate | Total P&L | Avg Return |
|-------|-------|----------------|----------|-----------|------------|
| contrarian | 5 | 3 | 2/3 (67%) | +$117.72 | +2.65% |
| quant | 5 | 2 | 0/2 (0%) | -$126.84 | -4.15% |
| macro | 5 | 0 | — | — | — |
| crypto | 5 | 0 | — | — | — |
| sentiment | 5 | 0 | — | — | — |

### Executed Trade Detail
| Date | Ticker | Agent | Entry | Shares | Amount | Unrealized Return | Final Score |
|------|--------|-------|-------|--------|--------|-------------------|-------------|
| 03-02 | XOM | quant | $156.50 | 15 | $2,347.50 | -3.38% | 9.37 |
| 03-03 | MDB | contrarian | $252.73 | 6 | $1,516.38 | +7.02% | 8.15 |
| 03-04 | MSFT | contrarian | $405.20 | 3 | $1,215.60 | +0.93% | 9.03 |
| 03-05 | BURL | quant | $321.47 | 3 | $964.41 | -4.92% | 8.98 |
| 03-06 | ORCL | contrarian | $152.96 | 3 | $458.88 | 0.00% | 9.66 |

## Debate Impact
- Trades where debate UPGRADED conviction: 1 (BURL, modifier 1.05x) → avg return: -4.92%
- Trades where debate DOWNGRADED conviction: 0
- Trades where debate caused PASS: 1 (GLD on 03-04, thesis_flaw detected)
  - GLD day-1 return if taken: -1.20% → **debate saved money**
- Trades with neutral debate (modifier 1.0x): 4 → avg return: +1.14%

### Debate Summary
The debate mechanism ran 10 debates across 5 days. Key findings:
- **GLD thesis_flaw (03-04)**: Bear discovered gold was *falling* during the Iran conflict with record $12B ETF outflows — directly contradicting the macro agent's safe-haven thesis. This was the debate system's strongest value-add.
- **BURL upgrade (03-05)**: The only conviction upgrade (1.05x) led to the worst-performing trade (-4.92%). The bull case on earnings beat was valid but the position immediately gave back its gap-up.
- Most debates ended as toss-ups (score 0 or 1), suggesting the system errs toward caution rather than strong directional calls.

## Monthly Breakdown
| Month | Trades | Wins | Losses | P&L | Return |
|-------|--------|------|--------|-----|--------|
| Mar 2026 | 5 | 2 | 2 (+1 flat) | -$7.12 | -0.07% |

## Daily NAV Progression
| Date | NAV | Daily Return | Cumulative P&L |
|------|-----|-------------|-----------------|
| Start | $10,000.00 | — | $0.00 |
| 03-02 | $10,000.00 | 0.00% | $0.00 |
| 03-03 | $9,929.95 | -0.70% | -$70.05 |
| 03-04 | $9,871.48 | -0.59% | -$128.52 |
| 03-05 | $9,997.54 | +1.28% | -$2.46 |
| 03-06 | $9,992.88 | -0.05% | -$7.12 |

## Key Observations
- Best trade: MDB on 2026-03-03 → +7.02% unrealized (contrarian)
- Worst trade: BURL on 2026-03-05 → -4.92% unrealized (quant)
- Longest winning streak: 2 trades (MDB, MSFT)
- Longest losing streak: 1 trade
- Days passed (no trade): 0/5 (0%)
- Portfolio was fully invested every day — high conviction across the board (all picks had conviction 8)
- Contrarian agent dominated selection (3/5 trades), all with positive or flat unrealized P&L
- Quant agent's 2 picks (XOM, BURL) are both underwater — energy thesis faded and BURL gap-up reversed
- No sells executed — portfolio accumulated 5 open positions consuming 65% of capital

## Sector Exposure (End of Backtest)
| Sector | Positions | Allocation | % of NAV |
|--------|-----------|------------|----------|
| Energy | XOM | $2,268.15 | 22.7% |
| Technology | MDB, MSFT, ORCL | $3,308.58 | 33.1% |
| Consumer Discretionary | BURL | $916.92 | 9.2% |
| Cash | — | $3,497.23 | 35.0% |

## Recommendations
1. **Contrarian agent is the early alpha generator** — its value-investing approach (buying beaten-down quality names) outperformed the quant momentum strategy. Consider weighting contrarian picks higher in the PM scoring framework.
2. **Debate system adds defensive value but not offensive** — the GLD thesis_flaw catch was excellent risk management, but the only upgrade (BURL) backfired. The system is better at *avoiding bad trades* than *boosting good ones*.
3. **0% PASS rate is aggressive** — buying every single day with no passes suggests conviction thresholds may be too low, or the PM is insufficiently selective. Consider raising the minimum final score threshold above 8.0.
4. **Technology concentration (33%) approaching sector cap (40%)** — one more tech buy would require careful sector gate monitoring.
5. **Quant agent needs recalibration** — both momentum-based picks (XOM bull flag, BURL gap-up) showed immediate reversals. Momentum signals may be arriving too late in this volatile market regime (VIX ~25).
6. **Extend backtest to 3+ weeks** to capture position exits and generate realized P&L metrics. Current 5-day window only shows entry quality, not full trade lifecycle.
