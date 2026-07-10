#!/usr/bin/env python3
"""
PM Decision Review engine — gather / promote / scorecard / list.
Protocol: skills/pm-review.md. Cron entry: scripts/run-pm-review.sh.

The PM audits its own passes, debate kills, and buys against the exact
counterfactual (the SPY sweep). Repeated error patterns become BOUNDED
self-adjustments in state/pm-lessons.json.

Commands:
    gather    [--week YYYY-MM-DD]   build state/pm-reviews/{weekStart}.json
    promote                          merge candidates -> state/pm-lessons.json (bounded)
    scorecard                        regenerate state/scorecards/pm.json (cumulative)
    list                             show current adjustments
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state"
REVIEWS = STATE / "pm-reviews"
PM_LESSONS = STATE / "pm-lessons.json"

# ── Hard bounds (see skills/pm-review.md) ──────────────────────────────────
ALLOWED_TYPES = {"threshold_delta", "kill_downgrade", "penalty_disable", "penalty_restore"}
THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_MAX_DELTA = 7.0, 8.5, 0.5
MAX_ACTIVE_ADJUSTMENTS = 3
MIN_EVIDENCE = 3
MIN_DISTINCT_WEEKS = 2
REVIEW_DAYS = 45
NON_EVIDENCE_CAUSES = {"external_shock", "process_correct_outcome_bad"}

KILL_RE = re.compile(r"debate|veto|killed|bear", re.I)

_spy_hist = None


def spy_return(start: str, end: str):
    """SPY % return between two dates (closest prior trading closes)."""
    global _spy_hist
    import yfinance as yf
    if _spy_hist is None:
        _spy_hist = yf.Ticker("SPY").history(start="2026-03-01", auto_adjust=False)
    if _spy_hist.empty:
        return None

    def close_on(date_str):
        d = datetime.strptime(date_str, "%Y-%m-%d")
        for _ in range(6):
            rows = _spy_hist.loc[_spy_hist.index.strftime("%Y-%m-%d") == d.strftime("%Y-%m-%d")]
            if len(rows):
                return float(rows.iloc[0]["Close"])
            d -= timedelta(days=1)
        return None

    a, b = close_on(start), close_on(end)
    if a and b:
        return round((b / a - 1) * 100, 2)
    return None


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return default


def horizon_result(entry):
    """(return_pct, end_date) from the furthest filled checkpoint."""
    cps = entry.get("checkpoints") or {}
    best = None
    for key in ("horizon", "day_20", "day_10", "day_5", "day_1"):
        cp = cps.get(key) or {}
        if cp.get("return_pct") is not None:
            best = (cp["return_pct"], cp.get("date"))
            break
        if cp.get("price") is not None and entry.get("entry_price"):
            r = round((cp["price"] / entry["entry_price"] - 1) * 100, 2)
            best = (r, cp.get("date"))
            break
    return best


def week_start(d: datetime) -> str:
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


# ── gather ──────────────────────────────────────────────────────────────────
def cmd_gather(args):
    wk = args.week or week_start(datetime.now() - timedelta(days=7))
    wk_end = (datetime.strptime(wk, "%Y-%m-%d") + timedelta(days=7)).strftime("%Y-%m-%d")

    outcomes = load_json(STATE / "outcomes.json", {}).get("outcomes", [])
    tl = load_json(STATE / "trade-log.json", {})
    in_week = [d for d in tl.get("decisions", []) if wk <= str(d.get("date", "")) < wk_end]

    # A decision marked data_integrity.exclude_from_review rested on a fabricated or
    # corrupted premise (e.g. an invented catalyst date). Grading it against SPY would
    # teach the PM a lesson drawn from a fact that was never true. Drop it from BOTH
    # learning paths — the decision log AND the per-agent outcome rows for that session —
    # but surface it in `excluded_decisions` so nothing disappears silently.
    def _excluded(d):
        return bool((d.get("data_integrity") or {}).get("exclude_from_review"))

    excluded = [d for d in in_week if _excluded(d)]
    decisions = [d for d in in_week if not _excluded(d)]

    # outcomes.json is deduped to the LATEST run per (date, session). So only quarantine a
    # session's outcome rows when EVERY decision for that key is contaminated. If a clean
    # re-run exists, the surviving outcome rows belong to it and must be reviewed normally.
    by_key = {}
    for d in in_week:
        by_key.setdefault((str(d.get("date", ""))[:10], str(d.get("session", "")).lower()), []).append(d)
    bad_keys = {k for k, v in by_key.items() if v and all(_excluded(x) for x in v)}

    reviewed = []
    for e in outcomes:
        if (str(e.get("date", ""))[:10], str(e.get("session", "")).lower()) in bad_keys:
            continue
        hr = horizon_result(e)
        if hr is None:
            continue
        end_date = hr[1] or e.get("date")
        # review entries whose measurement completed inside this week
        if not (wk <= str(end_date) < wk_end):
            continue
        spy = spy_return(e.get("date"), end_date) if e.get("date") else None
        pick_ret = hr[0]
        rel = None if spy is None else round(pick_ret - spy, 2)
        executed = bool(e.get("was_executed"))
        reason = e.get("rejection_reason") or ""
        kind = "buy" if executed else ("kill" if KILL_RE.search(reason) else "pass")
        if rel is None:
            cls = "unmeasured"
        elif kind == "buy":
            cls = "good_buy" if rel > 0 else "bad_buy"
        else:
            # not executed: pick beat SPY -> we missed alpha
            cls = ("bad_" + kind) if rel > 0 else ("good_" + kind)
        reviewed.append({
            "outcome_id": e.get("id"), "agent": e.get("agent_id"),
            "ticker": e.get("ticker"), "date": e.get("date"),
            "conviction": e.get("conviction"), "decision_kind": kind,
            "rejection_reason": reason or None,
            "pick_return_pct": pick_ret, "spy_return_pct": spy,
            "relative_alpha_pct": rel, "classification": cls,
            "window_end": end_date,
        })

    counts = {}
    for r in reviewed:
        counts[r["classification"]] = counts.get(r["classification"], 0) + 1
    foregone = round(sum(r["relative_alpha_pct"] for r in reviewed
                         if r["classification"] in ("bad_pass", "bad_kill")
                         and r["relative_alpha_pct"]), 2)

    REVIEWS.mkdir(exist_ok=True)
    out = {
        "week_start": wk, "generated": datetime.now().isoformat(timespec="seconds"),
        "summary": {"counts": counts, "foregone_alpha_pct_sum": foregone,
                    "decisions_logged": len(decisions),
                    "decisions_excluded": len(excluded)},
        "reviewed_decisions": reviewed,
        "pm_decision_log": decisions,
        # Quarantined: do NOT draw root causes or adjustments from these — the decision
        # rested on a premise later verified false. Listed for the audit trail only.
        "excluded_decisions": [
            {"date": d.get("date"), "session": d.get("session"),
             "status": (d.get("data_integrity") or {}).get("status"),
             "issue": (d.get("data_integrity") or {}).get("issue"),
             "verified_by": (d.get("data_integrity") or {}).get("verified_by")}
            for d in excluded
        ],
        "data_integrity_note": (
            "excluded_decisions were made on a premise verified false after the fact. "
            "They are quarantined from reviewed_decisions and pm_decision_log. Do not "
            "assign root causes or draft adjustments from them — the PM's reasoning was "
            "sound given what it believed; the defect was the input, not the judgement."
        ) if excluded else None,
        # The Claude review step (skills/pm-review.md) fills these in:
        "root_causes": [],
        "candidate_adjustments": [],
    }
    (REVIEWS / f"{wk}.json").write_text(json.dumps(out, indent=2))
    print(f"Gathered week {wk}: {len(reviewed)} measurable decisions, "
          f"{counts}, foregone alpha sum {foregone}%")
    if excluded:
        print(f"   QUARANTINED {len(excluded)} decision(s) with data_integrity.exclude_from_review:")
        for d in excluded:
            print(f"     - {d.get('date')} {d.get('session')}")
    print(f"-> {REVIEWS / (wk + '.json')}")


# ── promote ─────────────────────────────────────────────────────────────────
def validate_bounds(adj, lessons):
    t = adj.get("adjustment", {}).get("type")
    if t not in ALLOWED_TYPES:
        return f"type '{t}' not allowed"
    if t == "threshold_delta":
        delta = adj["adjustment"].get("delta", 0)
        if abs(delta) > THRESHOLD_MAX_DELTA:
            return f"|delta| > {THRESHOLD_MAX_DELTA}"
        active_deltas = [r for r in lessons.get("adjustments", [])
                         if r.get("status") == "active"
                         and r.get("adjustment", {}).get("type") == "threshold_delta"]
        if active_deltas:
            return "a threshold_delta is already active (never stacks)"
        base = lessons.get("base_threshold", 7.5)
        if not (THRESHOLD_MIN <= base + delta <= THRESHOLD_MAX):
            return f"resulting threshold outside [{THRESHOLD_MIN}, {THRESHOLD_MAX}]"
    if t == "kill_downgrade" and adj["adjustment"].get("includes_fatal_flaw"):
        return "fatal_flaw VETO can never be downgraded"
    if t == "penalty_disable" and adj["adjustment"].get("value", 1.0) > 1.0:
        return "penalty may be disabled (1.0x) but never inverted into a bonus"
    return None


def cmd_promote(_args):
    lessons = load_json(PM_LESSONS, {"base_threshold": 7.5, "adjustments": []})
    today = datetime.now().strftime("%Y-%m-%d")
    existing = {r["id"]: r for r in lessons["adjustments"]}

    # retire expired
    for r in lessons["adjustments"]:
        if r.get("status") == "active" and r.get("review_date") and today >= r["review_date"]:
            r["status"] = "retired"
            r.setdefault("status_history", []).append(
                {"date": today, "from": "active", "to": "retired", "reason": "review_date reached"})

    for f in sorted(REVIEWS.glob("*.json")):
        review = load_json(f, {})
        for cand in review.get("candidate_adjustments", []):
            if cand.get("root_cause") in NON_EVIDENCE_CAUSES:
                continue
            cid = cand.get("id")
            if not cid:
                continue
            rec = existing.get(cid)
            if rec is None:
                rec = {**cand, "status": "candidate", "first_seen": review.get("week_start"),
                       "status_history": [{"date": today, "from": None, "to": "candidate"}]}
                lessons["adjustments"].append(rec)
                existing[cid] = rec
            else:
                seen = {e.get("outcome_id") for e in rec.get("evidence", [])}
                for ev in cand.get("evidence", []):
                    if ev.get("outcome_id") not in seen:
                        rec.setdefault("evidence", []).append(ev)

    # promotion pass
    for rec in lessons["adjustments"]:
        if rec.get("status") != "candidate":
            continue
        ev = rec.get("evidence", [])
        weeks = {str(e.get("date", ""))[:7] + "-" + str(e.get("date", "")) for e in ev}
        distinct_weeks = {week_start(datetime.strptime(e["date"], "%Y-%m-%d"))
                          for e in ev if e.get("date")}
        if len(ev) >= MIN_EVIDENCE and len(distinct_weeks) >= MIN_DISTINCT_WEEKS:
            err = validate_bounds(rec, lessons)
            active = [r for r in lessons["adjustments"] if r.get("status") == "active"]
            if err:
                rec["promotion_blocked"] = err
                continue
            if len(active) >= MAX_ACTIVE_ADJUSTMENTS:
                oldest = min(active, key=lambda r: r.get("first_seen", ""))
                oldest["status"] = "retired"
                oldest.setdefault("status_history", []).append(
                    {"date": today, "from": "active", "to": "retired",
                     "reason": f"displaced by {rec['id']} (max {MAX_ACTIVE_ADJUSTMENTS} active)"})
            rec["status"] = "active"
            rec["effective_date"] = today
            rec["review_date"] = (datetime.now() + timedelta(days=REVIEW_DAYS)).strftime("%Y-%m-%d")
            rec.setdefault("status_history", []).append(
                {"date": today, "from": "candidate", "to": "active", "evidence_count": len(ev)})

    lessons["last_updated"] = today
    PM_LESSONS.write_text(json.dumps(lessons, indent=2))
    act = [r["id"] for r in lessons["adjustments"] if r.get("status") == "active"]
    print(f"pm-lessons.json updated. Active adjustments: {act or 'none'}")


# ── scorecard ───────────────────────────────────────────────────────────────
def cmd_scorecard(_args):
    all_rev = []
    for f in sorted(REVIEWS.glob("*.json")):
        all_rev += load_json(f, {}).get("reviewed_decisions", [])

    def acc(kind):
        rel = [r for r in all_rev if r["decision_kind"] == kind and r["classification"] != "unmeasured"]
        if not rel:
            return {"n": 0, "accuracy_pct": None, "note": "INSUFFICIENT_SAMPLE"}
        good = len([r for r in rel if r["classification"].startswith("good")])
        out = {"n": len(rel), "accuracy_pct": round(good / len(rel) * 100, 1)}
        if len(rel) < 10:
            out["note"] = "INSUFFICIENT_SAMPLE"
        return out

    foregone = round(sum(r["relative_alpha_pct"] for r in all_rev
                         if r["classification"] in ("bad_pass", "bad_kill")
                         and r["relative_alpha_pct"]), 2)
    lessons = load_json(PM_LESSONS, {"adjustments": []})
    sc = {
        "scorecard": "pm", "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "pass_accuracy": acc("pass"), "kill_accuracy": acc("kill"), "buy_accuracy": acc("buy"),
        "foregone_alpha_total_pct": foregone,
        "active_adjustments": [
            {"id": r["id"], "pattern": r.get("pattern"), "adjustment": r.get("adjustment"),
             "review_date": r.get("review_date")}
            for r in lessons.get("adjustments", []) if r.get("status") == "active"],
        "note": "Counterfactual = SPY sweep. good_pass/good_kill = SPY beat the pick. "
                "Calibrate, don't flagellate: ~60% pass accuracy is healthy; ~90% means "
                "the bar is so high the firm is an index fund with overhead.",
    }
    (STATE / "scorecards").mkdir(exist_ok=True)
    (STATE / "scorecards" / "pm.json").write_text(json.dumps(sc, indent=2))
    print(f"PM scorecard: pass {sc['pass_accuracy']}, kill {sc['kill_accuracy']}, "
          f"buy {sc['buy_accuracy']}, foregone {foregone}%")


def cmd_list(_args):
    lessons = load_json(PM_LESSONS, {"adjustments": []})
    for r in lessons.get("adjustments", []):
        print(f"[{r.get('status'):9}] {r.get('id')}: {r.get('pattern')} "
              f"-> {r.get('adjustment')} (evidence {len(r.get('evidence', []))})")
    if not lessons.get("adjustments"):
        print("No PM adjustments yet.")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gather"); g.add_argument("--week")
    sub.add_parser("promote"); sub.add_parser("scorecard"); sub.add_parser("list")
    args = ap.parse_args()
    {"gather": cmd_gather, "promote": cmd_promote,
     "scorecard": cmd_scorecard, "list": cmd_list}[args.cmd](args)


if __name__ == "__main__":
    main()
