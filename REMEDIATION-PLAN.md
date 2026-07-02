# Alpha Firm — Remediation Plan
**Date:** 2026-07-02 · **Status:** Phases 0-2 EXECUTED; reconciliation applied on VPS (33 fills corrected, NAV $10,479→$10,901); Run 2 fresh start launched via `scripts/reset_fresh_start.py`. Phase 3 (attribution + scorecard v2) pending.

**Also executed 2026-07-02 (beyond original plan):** ALL Step 1.5 agent restrictions cleared for Run 2 (macro 0.5x/silenced, quant suspension, contrarian/catalyst conviction floors, crypto ETF ban) — every rationale in that table was computed on the deprecated win metric and unreconciled prices. New restrictions may only enter via the lessons pipeline with reconciled evidence, or manually at 30+ executed trades.

## Verified Findings (audited against real OHLC data, 2026-07-02)

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | SPY baseline $555.66 fabricated | **CONFIRMED** | Actual SPY close Fri 2026-03-27 (last session before inception): **$634.09**. $555.66 never traded in the past year (52-wk low $616.61, 2025-07-02). |
| 2 | Alpha overstated | **CONFIRMED** | SPY 634.09 → 745.62 (Jul 2) = **+17.6%**, not +34.4%. Portfolio +4.79% (Jun 26 NAV) → true alpha ≈ **-10 to -13%**, not -29.6%. |
| 3 | Price data systemically stale | **CONFIRMED, worse than claimed** | "SPY $733.58" logged as the Jun 26 close was actually the **Jun 23** close (real Jun 26: $728.99). CAT entry "$828.79 on Apr 28" was the **Apr 27** close (Apr 28 range: $805–825). Fills are recorded at prior-day closes. |
| 4 | Win metric broken | **CONFIRMED** | `skills/outcome-evaluation.md` L47: win = `peak_return_pct >= target` — a spike-then-stop-out counts as a win. |
| 5 | Cash drag | **CONFIRMED** | 41% cash ($4,314 / $10,479 NAV) after 3 consecutive all-PASS days; June 25 rule changes push it higher. |
| 6 | Sample sizes too small for modifiers | **CONFIRMED** | Macro silenced on 1 executed trade; lessons-learned promotes rules at 3 losses; 6 noisy multiplicative modifiers compound. |

**Decisions locked (Santi, 2026-07-02):** full SPY sweep for idle cash · moderate exit rework (keep 1-buy/day) · freeze modifiers at 1.0x and rebuild · Phase 0 executed immediately.

---

## Phase 0 — Data Integrity (DONE this session, except VPS step)

**0.1 Correct SPY baseline everywhere** ✅
`spy_inception_price: 634.09` (close of 2026-03-27). Fixed in: `CLAUDE.md` (×2), `run-check.sh`, `orchestrator.md`, `ALPHA-FIRM-OVERVIEW.md`, `state/portfolio.json`. Corrected Jun 26 figures: SPY close $728.99 → spy_return +14.97%, alpha **-10.18%**.

**0.2 Single price source** ✅ (policy)
`skills/price-fetch.md` rewritten: the **price MCP (`mcp/price_server.py`, yfinance/Yahoo) is the sole source** for prices, entries, checkpoints, and benchmarks. Brave Search is banned for numeric price data (allowed for news only). Every recorded fill must be validated against the trade day's OHLC range; out-of-range price = fetch again, never guess.

**0.3 Historical reconciliation** ✅ (applied on VPS 2026-07-02: 145 fills checked, 33 corrected, 2 baseline fixes, cash rebuilt +$421.69 → NAV $10,901.05)
`scripts/reconcile_prices.py` (new) reconciles every entry/exit in `state/trade-log.json` + `state/portfolio.json` (open + sold positions) against actual OHLC via yfinance:
- price inside that day's [low, high] → keep; outside → flag and correct to that day's close
- recompute realized P&L per trade, leaderboard `total_pnl`, NAV
- rewrite `spy_inception_price` in historical trade-log entries
- then run `scripts/regen_scorecards.py` from corrected outcomes
```bash
cd ~/alpha-firm && python3 scripts/reconcile_prices.py --dry-run   # review report
python3 scripts/reconcile_prices.py --apply && python3 scripts/regen_scorecards.py
```

**0.4 Fix the win metric** ✅
`skills/outcome-evaluation.md`: verdicts now based on **horizon/realized return vs. risk**, not peak. `peak_return_pct` kept as diagnostic only. Executed trades score on realized P&L per unit of risk (R-multiple: realized % ÷ stop distance %).

---

## Phase 1 — Stop the Bleeding: Modifiers & Rules (next Claude Code session, ~1 hr)

**1.1 Freeze track-record modifiers at 1.0x** ✅ (orchestrator.md edited this session)
`track_record_modifier = 1.0` for all agents until an agent has **30+ executed trades** under the corrected metric. Applies to macro's 0.5x too — the silencing was based on n=1.

**1.2 Prune lessons-learned promotion criteria**
- Raise promotion threshold: ≥3 losses **and** ≥10 executed trades for that (agent, pattern)
- Audit currently-active rules against reconciled data; demote any built on corrupted prices
- Keep the quant conviction-8 floor as *candidate* until re-validated

**1.3 Keep (they're sound):** sector cap 40%, VIX sizing, debate gate, agent isolation, falsification-condition requirement.

## Phase 2 — Kill the Structural Drag (1–2 sessions)

**2.1 SPY sweep (default = beta, not cash)**
- New hard rule in `CLAUDE.md` + `orchestrator.md` + `skills/trade-execution.md`: at each closing session, cash above a **5% operational buffer** is swept into SPY as a `benchmark` position (agent: "index", excluded from leaderboard/sector cap)
- Stock buys **fund from the SPY tranche** (sell SPY → buy pick), so an agent pick is explicitly a bet *against* the index — the SPY Baseline Test becomes mechanical, not rhetorical
- Worst case converges to market performance; alpha attribution becomes clean (portfolio vs. 100% SPY counterfactual)

**2.2 Exit rework (moderate)**
- **Thesis-based exits are primary**: every position's `falsification_condition` is the sell trigger, checked each session
- Hard stops widen to **disaster-only -20%** (was 8–15%); pre-binary-event positions may keep tighter stops if the agent justifies
- **Delete the stale-position rule** (14 days/<2%) — winners need time
- **Same-day redeploy**: proceeds from any sell may buy same-day (1-buy/day cap stays, but a stop-out no longer strands capital — it returns to the SPY sweep at close regardless)
- Trailing stops only after +15% unrealized, set at agent's discretion

**2.3 Sell-side symmetry**: sells triggered only by (a) falsification condition, (b) -20% disaster stop, (c) debate-style review the PM must *win* to sell a position above its entry. No more "sell first, then evaluate buys" reflex.

## Phase 3 — Honest Measurement (ongoing)

**3.1 Attribution report** (`scripts/attribution.py`, weekly): decompose alpha into **cash drag** (avg cash weight × SPY return), **selection** (picks vs. SPY over their holding windows), and **whipsaw cost** (stop-out price vs. price 10 sessions later). Run once on reconciled history before touching any agent prompt — if selection ≈ 0 and drag+whipsaw ≈ everything (likely), the agents were never the problem.

**3.2 Scorecard v2**: realized R-multiple per trade, per agent; win = R > 0 at exit; report n and refuse to display win-rate % when n < 20. Modifiers re-enable per agent only at n ≥ 30.

**3.3 Backtest skepticism**: mark all backtest results advisory-only; Brave `before:` operator leaks future info. Don't tune on them.

## Phase 4 — The Edge Question (open, honest)

A long-only public-news stock picker has no structural edge; post-remediation the realistic goal is **SPY ± small**. Keep running it as an orchestration testbed with clean measurement, and let attribution (3.1) tell you whether any agent shows persistent selection skill. If after ~100 executed trades none does, the honest outcome is: the SPY sweep *is* the strategy, and the analysts are a research layer, not an alpha engine. Revisit then — prediction markets and event-driven trades where agents can read faster than crowds *price in* are the only lanes worth testing next.

---

## Acceptance Criteria
- [ ] `reconcile_prices.py --dry-run` shows 0 out-of-range fills after `--apply`
- [ ] Every price in state files traceable to price-MCP fetch on the correct date
- [ ] All track-record modifiers = 1.0x; leaderboard shows n per agent
- [ ] Cash ≤ 5% at every close (rest in SPY tranche)
- [ ] No sells from stale-position rule; stops only fire ≤ -20% or falsification
- [ ] Weekly attribution report decomposes alpha into drag/selection/whipsaw
