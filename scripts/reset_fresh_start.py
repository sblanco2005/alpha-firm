#!/usr/bin/env python3
"""
Fresh start (Run 2) — archives Run 1 and resets state under Phase 2 rules.
See REMEDIATION-PLAN.md. Decisions (Santi, 2026-07-02): keep learnings, wipe state.

KEPT:      memory/ (agent research memory), lessons-learned rules (demoted to
           candidate — must re-earn active status with fresh evidence)
ARCHIVED:  state/, logs/, reports/, alerts/  ->  runs/run1-<dates>/
RESET:     portfolio ($10,000, SPY baseline fetched live), trade-log,
           leaderboard, outcomes, daily-state, scorecards

Usage (on VPS, needs yfinance):
    python3 scripts/reset_fresh_start.py --dry-run
    python3 scripts/reset_fresh_start.py --apply
"""

import argparse
import json
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state"
AGENTS = ["macro", "crypto", "quant", "sentiment", "contrarian", "catalyst"]
STARTING_CAPITAL = 10000.0


def fetch_spy_baseline():
    """Close of the most recent completed trading day = new benchmark inception."""
    import yfinance as yf
    hist = yf.Ticker("SPY").history(period="10d", auto_adjust=False)
    if hist.empty:
        sys.exit("FATAL: could not fetch SPY history — no baseline, no reset. Retry later.")
    last = hist.iloc[-1]
    date = hist.index[-1].strftime("%Y-%m-%d")
    return round(float(last["Close"]), 2), date


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    today = datetime.now().strftime("%Y-%m-%d")
    old_pf = json.loads((STATE / "portfolio.json").read_text())
    run1_inception = old_pf.get("inception_date", "2026-03-28")
    archive_dir = ROOT / "runs" / f"run1-{run1_inception}-to-{today}"

    spy_price, spy_date = fetch_spy_baseline()
    print(f"Run 1: inception {run1_inception}, final NAV {old_pf.get('nav')} "
          f"({old_pf.get('portfolio_pnl_pct')}%)")
    print(f"Run 2: inception {today}, SPY baseline {spy_price} (close of {spy_date})")
    print(f"Archive -> {archive_dir}")

    if args.dry_run:
        print("DRY RUN — nothing written.")
        return

    # ── archive ───────────────────────────────────────────────────────────
    archive_dir.mkdir(parents=True, exist_ok=True)
    for d in ("state", "logs", "reports", "alerts"):
        src = ROOT / d
        if src.exists():
            shutil.copytree(src, archive_dir / d, dirs_exist_ok=True)
    print("Archived.")

    # ── lessons: keep but demote active -> candidate ──────────────────────
    lessons_path = STATE / "lessons-learned.json"
    if lessons_path.exists():
        lessons = json.loads(lessons_path.read_text())
        for r in lessons.get("rules", []):
            if r.get("status") == "active":
                r["status"] = "candidate"
                r.setdefault("status_history", []).append(
                    {"date": today, "from": "active", "to": "candidate",
                     "reason": "run-2 fresh start — must re-earn promotion with fresh evidence"})
        lessons["last_updated"] = today
        lessons_path.write_text(json.dumps(lessons, indent=2))
        print("Lessons demoted to candidate.")

    # ── fresh state ───────────────────────────────────────────────────────
    (STATE / "portfolio.json").write_text(json.dumps({
        "cash": STARTING_CAPITAL, "positions": [], "nav": STARTING_CAPITAL,
        "inception_date": today,
        "run": 2,
        "spy_inception_price": spy_price,
        "spy_inception_date": spy_date,
        "spy_closing_price": spy_price, "spy_return_pct": 0.0,
        "portfolio_pnl_pct": 0.0, "alpha": 0.0,
        "high_water_mark": STARTING_CAPITAL,
        "sold_positions": [],
        "nav_note": f"RUN 2 FRESH START {today}. Phase 2 rules: SPY sweep (5% cash buffer), "
                    "falsification-first exits, -20% disaster stops, no stale rule, "
                    "modifiers frozen at 1.0x. Run 1 archived in runs/.",
    }, indent=2))

    (STATE / "daily-state.json").write_text(json.dumps({
        "date": today, "checks": 0, "bought": False, "sessions_completed": [],
        "last_buy": None}, indent=2))

    (STATE / "trade-log.json").write_text(json.dumps({
        "trades": [], "decisions": [], "total_trades": 0, "total_buys": 0,
        "total_sells": 0, "total_passes": 0, "last_updated": today}, indent=2))

    (STATE / "outcomes.json").write_text(json.dumps({"outcomes": []}, indent=2))

    (STATE / "leaderboard.json").write_text(json.dumps({
        a: {"picks": 0, "picks_executed": 0, "wins": 0, "losses": 0,
            "total_pnl": 0.0, "best_trade": None, "worst_trade": None,
            "current_streak": 0, "reward_earned": 0.0}
        for a in AGENTS} | {
        "reward_pool_note": f"RUN 2 started {today}. Run 1 standings archived in runs/."},
        indent=2))

    scorecards = STATE / "scorecards"
    scorecards.mkdir(exist_ok=True)
    for a in AGENTS:
        (scorecards / f"{a}.json").write_text(json.dumps({
            "agent_id": a, "last_updated": today, "total_evaluated": 0,
            "total_tracking": 0, "wins": 0, "losses": 0, "partials": 0,
            "win_rate": 0.0, "track_record_modifier": 1.0,
            "modifier_frozen": True, "executed_trades": 0,
            "modifier_note": "RUN 2 fresh start — frozen at 1.0x until 30 executed trades "
                             "under realized-R metric. Run 1 scorecard archived in runs/ "
                             "(informational only; computed on deprecated metric)."},
            indent=2))

    # clear run-1 operational logs from live dirs (archived above)
    for d in ("logs", "reports", "alerts"):
        p = ROOT / d
        if p.exists():
            for f in p.iterdir():
                if f.is_file() and not f.name.startswith("."):
                    f.unlink()

    print(f"RUN 2 READY. Capital ${STARTING_CAPITAL:,.0f}, SPY baseline {spy_price} "
          f"({spy_date}). Memory kept, lessons demoted, state zeroed.")
    print("Reminder: first closing session will sweep idle cash into SPY.")


if __name__ == "__main__":
    main()
