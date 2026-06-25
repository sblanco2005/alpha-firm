#!/usr/bin/env python3
"""
Alpha Firm — Weekly Losing-Trade Post-Mortem Engine

Two subcommands that form the mechanical halves of the weekly learning loop:

  gather   Build an enriched loss-context file at state/retrospectives/{weekStart}.json
           from realized losses (trade-log + portfolio sold_positions) and notable paper
           losses (outcomes.json, conviction >= 7). The reasoning step (skills/weekly-postmortem.md)
           consumes this, assigns root causes, and writes candidate_rules back into the same file.

  promote  Deterministic rule lifecycle. Reads candidate_rules from retro file(s), dedups them into
           state/lessons-learned.json, accumulates corroborating evidence across weeks, auto-promotes
           candidates to ACTIVE once evidence_count >= PROMOTE_THRESHOLD (the over-fit guardrail —
           no human review), and reviews/retires active rules whose underlying leak has closed.

  list     Print a one-line-per-rule summary of state/lessons-learned.json.

Conventions (match regen_scorecards.py / update_outcomes_eval.py):
  - stdlib only
  - absolute paths
  - atomic writes: .tmp -> jq validate -> mv
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from glob import glob

# ─── Paths & constants ───────────────────────────────────────────────────────
BASE = "/home/clawd/alpha-firm"
STATE = f"{BASE}/state"
TRADE_LOG = f"{STATE}/trade-log.json"
OUTCOMES = f"{STATE}/outcomes.json"
PORTFOLIO = f"{STATE}/portfolio.json"
SCORECARDS_DIR = f"{STATE}/scorecards"
LESSONS = f"{STATE}/lessons-learned.json"
RETRO_DIR = f"{STATE}/retrospectives"

INCEPTION = "2026-03-28"          # portfolio inception (from CLAUDE.md)
AGENT_IDS = ["macro", "crypto", "quant", "sentiment", "contrarian", "catalyst"]

PROMOTE_THRESHOLD = 3            # min independent corroborating losses to go ACTIVE
REVIEW_DAYS = 45                 # active-rule re-review window
REVIEW_IMPROVEMENT = 15.0        # agent win-rate improvement (pts) to retire a rule as resolved
NOTABLE_PAPER_MIN_CONVICTION = 7 # paper-loss floor (locked scope decision)
DEFAULT_MAX_LOSSES = 10

# Enforcement specs the orchestrator can mechanically apply (orchestrator.md Step 1.6).
# Must stay in sync with skills/weekly-postmortem.md + orchestrator.md.
ENFORCEMENT_TYPES = {
    "reject_asset_type", "min_conviction", "modifier", "gate",
    "stop_loss", "max_size", "entry_condition", "require_dated_catalyst",
    "fundamental_floor", "max_correlated_positions", "min_evidence_points",
}

ROOT_CAUSES = {
    "thesis_error", "timing_error", "regime_error", "catalyst_miss",
    "valuation_error", "risk_mgmt_error", "asset_type_error",
    "calibration_error", "narrative_bias", "execution_error",
    "concentration_error", "external_shock",
}


# ─── IO helpers ──────────────────────────────────────────────────────────────
def load_json(path):
    with open(path) as f:
        return json.load(f)


def atomic_write(path, obj):
    """Write obj as JSON to path atomically: .tmp -> jq validate -> mv."""
    tmp = f"{path}.tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")
    try:
        subprocess.run(
            ["jq", ".", tmp], check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as e:
        os.remove(tmp)
        raise RuntimeError(f"jq validation failed for {tmp}: {e.stderr.decode(errors='replace')}")
    os.replace(tmp, path)


def parse_date(s):
    if not s:
        return None
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def today_iso():
    return date.today().isoformat()


def load_lessons():
    if not os.path.exists(LESSONS):
        return {"last_updated": None, "rules": [], "_promoted_retros": []}
    data = load_json(LESSONS)
    data.setdefault("rules", [])
    data.setdefault("_promoted_retros", [])
    return data


def scorecard_summary(agent):
    path = f"{SCORECARDS_DIR}/{agent}.json"
    if not os.path.exists(path):
        return None
    sc = load_json(path)
    return {
        "win_rate": sc.get("win_rate"),
        "loss_rate": sc.get("loss_rate"),
        "total_evaluated": sc.get("total_evaluated"),
        "track_record_modifier": sc.get("track_record_modifier"),
        "conviction_calibration": sc.get("conviction_calibration"),
        "by_asset_type": sc.get("by_asset_type"),
    }


# ─── gather ──────────────────────────────────────────────────────────────────
def cmd_gather(args):
    os.makedirs(RETRO_DIR, exist_ok=True)

    # Window: the Mon-Fri of the week containing the anchor (default today).
    # --since expands to a [since, today] backfill window.
    if args.since:
        start = parse_date(INCEPTION if args.since == "inception" else args.since)
        end = date.today()
        window_label = f"backfill-{start.isoformat()}"
    else:
        anchor = parse_date(args.week) if args.week else date.today()
        start = anchor - timedelta(days=anchor.weekday())  # Monday of anchor's week
        end = start + timedelta(days=4)                      # Friday
        window_label = start.isoformat()

    print(f"GATHER window: {start} -> {end}  (label={window_label})")

    trade_log = load_json(TRADE_LOG)
    trades = trade_log.get("trades", [])

    # Index buys by (ticker, date, agent) -> thesis, and (ticker, agent) -> [(date, thesis)]
    buy_thesis = {}
    buy_fallback = {}
    for t in trades:
        if t.get("action") != "buy":
            continue
        th = t.get("thesis") or ""
        buy_thesis[(t.get("ticker"), t.get("date"), t.get("agent"))] = th
        buy_fallback.setdefault((t.get("ticker"), t.get("agent")), []).append(
            (t.get("date"), th)
        )

    def find_thesis(ticker, entry_date, agent):
        th = buy_thesis.get((ticker, entry_date, agent))
        if th:
            return th
        # fallback: most recent buy of same ticker+agent on/before entry_date
        cands = buy_fallback.get((ticker, agent), [])
        prior = [(d, x) for (d, x) in cands if d and entry_date and d <= entry_date]
        if prior:
            prior.sort(key=lambda p: p[0])
            return prior[-1][1]
        cands2 = sorted(cands, key=lambda p: p[0]) if cands else []
        return cands2[-1][1] if cands2 else None

    # Index outcomes recommendations for conviction/checkpoint enrichment
    outcomes = load_json(OUTCOMES)
    rec_by_key = {}
    for r in outcomes.get("recommendations", []):
        rec_by_key[(r.get("agent_id"), r.get("date"), r.get("ticker"))] = r

    def enrich_from_outcomes(loss):
        r = rec_by_key.get((loss.get("agent"), loss.get("entry_date"), loss.get("ticker")))
        if r:
            loss["conviction"] = r.get("conviction")
            loss["target_return_pct"] = r.get("target_return_pct")
            loss["horizon_days"] = r.get("horizon_days")
            cps = r.get("checkpoints", {})
            loss["checkpoints"] = cps
            hz = (cps.get("horizon") or {})
            loss["peak_return_pct"] = r.get("peak_return_pct")
            loss.setdefault("horizon_return_pct", hz.get("return_pct"))
        return loss

    # ── Realized losses (closed at a loss in window) ──
    realized = []
    seen_realized = set()
    for t in trades:
        if t.get("action") != "sell":
            continue
        if (t.get("pnl") or 0) >= 0:
            continue
        sell_date = parse_date(t.get("date"))
        if not (start <= sell_date <= end):
            continue
        key = (t.get("ticker"), t.get("date"))
        if key in seen_realized:
            continue
        seen_realized.add(key)
        loss = {
            "loss_id": f"realized-{t.get('ticker')}-{t.get('date')}",
            "kind": "realized",
            "agent": t.get("agent"),
            "ticker": t.get("ticker"),
            "asset_type": t.get("asset_type"),
            "entry_date": t.get("entry_date"),
            "entry_price": t.get("entry_price"),
            "sell_date": t.get("date"),
            "sell_price": t.get("price"),
            "pnl": t.get("pnl"),
            "return_pct": t.get("pnl_pct"),
            "thesis": find_thesis(t.get("ticker"), t.get("entry_date"), t.get("agent")),
            "exit_reason": t.get("reason"),
            "session": t.get("session"),
        }
        enrich_from_outcomes(loss)
        realized.append(loss)

    # Merge portfolio sold_positions not already captured (belt & suspenders)
    portfolio = load_json(PORTFOLIO)
    for s in portfolio.get("sold_positions", []):
        if (s.get("realized_pnl") or 0) >= 0:
            continue
        sd = s.get("sell_date")
        sdate = parse_date(sd)
        if not sdate or not (start <= sdate <= end):
            continue
        key = (s.get("ticker"), sd)
        if key in seen_realized:
            continue
        seen_realized.add(key)
        loss = {
            "loss_id": f"realized-{s.get('ticker')}-{sd}",
            "kind": "realized",
            "agent": s.get("agent"),
            "ticker": s.get("ticker"),
            "asset_type": s.get("asset_type"),
            "entry_date": s.get("entry_date"),
            "entry_price": s.get("entry_price"),
            "sell_date": sd,
            "sell_price": s.get("sell_price"),
            "pnl": s.get("realized_pnl"),
            "return_pct": s.get("realized_pnl_pct"),
            "thesis": find_thesis(s.get("ticker"), s.get("entry_date"), s.get("agent")),
            "exit_reason": s.get("reason"),
            "session": None,
        }
        enrich_from_outcomes(loss)
        realized.append(loss)

    # ── Notable paper losses (high-conviction recommendations resolved to a loss in window) ──
    paper = []
    for r in outcomes.get("recommendations", []):
        if r.get("final_verdict") != "loss":
            continue
        if (r.get("conviction") or 0) < NOTABLE_PAPER_MIN_CONVICTION:
            continue
        cps = r.get("checkpoints", {}) or {}
        hz = cps.get("horizon") or {}
        hdate = parse_date(hz.get("date"))
        if not hdate or not (start <= hdate <= end):
            continue
        paper.append({
            "loss_id": r.get("id") or f"paper-{r.get('agent_id')}-{r.get('date')}-{r.get('ticker')}",
            "kind": "paper",
            "agent": r.get("agent_id"),
            "ticker": r.get("ticker"),
            "asset_type": r.get("asset_type"),
            "entry_date": r.get("date"),
            "entry_price": r.get("entry_price"),
            "conviction": r.get("conviction"),
            "target_return_pct": r.get("target_return_pct"),
            "horizon_days": r.get("horizon_days"),
            "thesis_summary": r.get("thesis_summary"),
            "was_executed": r.get("was_executed"),
            "peak_return_pct": r.get("peak_return_pct"),
            "horizon_return_pct": hz.get("return_pct"),
            "checkpoints": cps,
        })

    # ── Enrich with scorecard + currently-active lessons that should have caught each loss ──
    lessons = load_lessons()
    active_by_target = {}
    for rule in lessons.get("rules", []):
        if rule.get("status") == "active":
            active_by_target.setdefault(rule.get("applies_to"), []).append({
                "id": rule.get("id"),
                "rule": rule.get("rule"),
                "enforcement": rule.get("enforcement"),
                "root_cause": rule.get("root_cause"),
            })

    all_losses = realized + paper
    for loss in all_losses:
        loss["magnitude_pct"] = abs(loss.get("return_pct") or loss.get("horizon_return_pct") or 0)
        loss["agent_scorecard"] = scorecard_summary(loss.get("agent"))
        aps = []
        aps.extend(active_by_target.get(loss.get("agent"), []))
        aps.extend(active_by_target.get("all", []))
        loss["applicable_active_lessons"] = aps

    # ── Cap & prioritize: realized first (real money), then worst paper losses ──
    realized.sort(key=lambda l: l.get("return_pct") or 0)            # most negative first
    paper.sort(key=lambda l: l.get("horizon_return_pct") or 0)
    max_losses = args.max_losses
    selected = realized[:max_losses]
    remaining = max_losses - len(selected)
    if remaining > 0:
        selected += paper[:remaining]

    retro = {
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "window_label": window_label,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scope": "realized + notable paper losses (conviction >= %d)" % NOTABLE_PAPER_MIN_CONVICTION,
        "realized_loss_count_total": len(realized),
        "paper_loss_count_total": len(paper),
        "loss_count_analyzed": len(selected),
        "max_losses": max_losses,
        "losses": selected,
        "candidate_rules": [],     # populated by the reasoning step
        "analysis_notes": "",      # populated by the reasoning step
    }

    out_path = f"{RETRO_DIR}/{window_label}.json"
    atomic_write(out_path, retro)
    print(f"WROTE {out_path}")
    print(f"  realized in window: {len(realized)}  | notable paper in window: {len(paper)}  | analyzed: {len(selected)}")
    if not selected:
        print("  NOTE: no losses in window — reasoning step will be skipped by run-postmortem.sh.")
    return out_path


# ─── promote ─────────────────────────────────────────────────────────────────
def _norm_value(v):
    """Canonicalize an enforcement value for signature matching."""
    if isinstance(v, float):
        return round(v, 4)
    return v


def _signature(rule):
    e = rule.get("enforcement") or {}
    return (
        rule.get("applies_to"),
        rule.get("category"),
        e.get("type"),
        _norm_value(e.get("value")),
    )


def _slug(cand):
    e = cand.get("enforcement") or {}
    parts = [str(cand.get("applies_to") or "all"), str(e.get("type") or "rule"), str(e.get("value") or "")]
    return "-".join(p.lower().strip().replace(" ", "-") for p in parts if p and p != "None")


def _evidence_for(cand, retro):
    """Map this candidate's source losses into compact evidence records."""
    src = cand.get("source_losses") or []
    by_id = {l.get("loss_id"): l for l in retro.get("losses", [])}
    ev = []
    if src:
        pool = [by_id[s] for s in src if s in by_id]
    else:
        # fallback: every loss in the retro whose agent matches applies_to
        pool = [l for l in retro.get("losses", []) if l.get("agent") == cand.get("applies_to")]
    for l in pool:
        ev.append({
            "loss_id": l.get("loss_id"),
            "date": l.get("sell_date") or l.get("entry_date"),
            "ticker": l.get("ticker"),
            "agent": l.get("agent"),
            "return_pct": l.get("return_pct") if l.get("return_pct") is not None else l.get("horizon_return_pct"),
            "kind": l.get("kind"),
        })
    # dedup within this batch
    seen = set()
    out = []
    for e in ev:
        if e["loss_id"] in seen:
            continue
        seen.add(e["loss_id"])
        out.append(e)
    return out


def _add_evidence(rule, ev_items, today):
    existing = {e.get("loss_id") for e in rule.get("evidence", [])}
    for ev in ev_items:
        if ev.get("loss_id") not in existing:
            rule.setdefault("evidence", []).append(ev)
            existing.add(ev.get("loss_id"))
    rule["evidence_count"] = len(rule.get("evidence", []))
    rule["last_seen"] = today


def _promote_to_active(rule, today):
    rule["status"] = "active"
    rule["effective_date"] = today
    rule["review_date"] = (date.today() + timedelta(days=REVIEW_DAYS)).isoformat()
    sc = scorecard_summary(rule.get("applies_to")) if rule.get("applies_to") in AGENT_IDS else None
    rule["win_rate_at_promotion"] = sc.get("win_rate") if sc else None
    rule.setdefault("status_history", []).append({
        "date": today, "from": "candidate", "to": "active",
        "evidence_count": rule.get("evidence_count"),
    })


def _review_active(rules, today):
    """Retire active rules whose underlying leak has closed (agent win-rate jumped);
    otherwise extend the review window."""
    today_d = parse_date(today)
    for rule in rules:
        if rule.get("status") != "active":
            continue
        rd = parse_date(rule.get("review_date"))
        if not rd or today_d < rd:
            continue
        agent = rule.get("applies_to")
        sc = scorecard_summary(agent) if agent in AGENT_IDS else None
        cur_wr = sc.get("win_rate") if sc else None
        promo_wr = rule.get("win_rate_at_promotion")
        if cur_wr is not None and promo_wr is not None and cur_wr >= promo_wr + REVIEW_IMPROVEMENT:
            rule["status"] = "retired"
            rule["review_date"] = None
            rule.setdefault("status_history", []).append({
                "date": today, "from": "active", "to": "retired",
                "reason": f"agent win_rate improved {promo_wr} -> {cur_wr} (+{REVIEW_IMPROVEMENT:g}pt); leak assumed closed",
            })
            print(f"  RETIRED {rule.get('id')}: win_rate {promo_wr} -> {cur_wr}")
        else:
            rule["review_date"] = (today_d + timedelta(days=REVIEW_DAYS)).isoformat()
            rule["win_rate_at_promotion"] = cur_wr if cur_wr is not None else promo_wr
            rule.setdefault("status_history", []).append({
                "date": today, "from": "active", "to": "active",
                "note": "auto_extended_review", "win_rate": cur_wr,
            })


def cmd_promote(args):
    lessons = load_lessons()
    rules = lessons["rules"]
    by_sig = {_signature(r): r for r in rules}
    promoted_retros = set(lessons.get("_promoted_retros", []))
    today = today_iso()

    # Which retro files to process
    if args.retro:
        candidates = [args.retro]
    else:
        all_retros = sorted(glob(f"{RETRO_DIR}/*.json"))
        candidates = [r for r in all_retros if os.path.basename(r) not in promoted_retros]
        if args.force:
            candidates = all_retros

    if not candidates:
        print("PROMOTE: no unprocessed retro files. (Use --force to reprocess all.)")
        return

    n_new = 0
    n_upd = 0
    for rp in candidates:
        retro = load_json(rp)
        cands = retro.get("candidate_rules", [])
        base = os.path.basename(rp)
        if not cands:
            print(f"  SKIP {base}: no candidate_rules (reasoning step not run yet)")
            continue
        for cand in cands:
            e = cand.get("enforcement") or {}
            if e.get("type") not in ENFORCEMENT_TYPES:
                print(f"  WARN {base}: candidate '{cand.get('id')}' has unknown enforcement "
                      f"type '{e.get('type')}'; skipping.")
                continue
            if cand.get("root_cause") not in ROOT_CAUSES:
                print(f"  WARN {base}: candidate '{cand.get('id')}' has unknown root_cause "
                      f"'{cand.get('root_cause')}'; skipping.")
                continue
            ev = _evidence_for(cand, retro)
            if not ev:
                print(f"  WARN {base}: candidate '{cand.get('id')}' matched no source losses; skipping.")
                continue
            sig = _signature(cand)
            if sig in by_sig:
                rule = by_sig[sig]
                _add_evidence(rule, ev, today)
                # re-promote if it has now cleared the threshold
                if (rule.get("status") == "candidate"
                        and rule.get("evidence_count", 0) >= PROMOTE_THRESHOLD
                        and rule.get("root_cause") != "external_shock"):
                    _promote_to_active(rule, today)
                    print(f"  PROMOTED {rule.get('id')} -> active (evidence_count={rule['evidence_count']})")
                else:
                    print(f"  UPDATED {rule.get('id')} (evidence_count={rule['evidence_count']})")
                n_upd += 1
            else:
                rule = {
                    "id": cand.get("id") or _slug(cand),
                    "status": "candidate",
                    "category": cand.get("category"),
                    "applies_to": cand.get("applies_to"),
                    "root_cause": cand.get("root_cause"),
                    "rule": cand.get("rule"),
                    "enforcement": e,
                    "evidence": ev,
                    "evidence_count": len(ev),
                    "first_seen": today,
                    "last_seen": today,
                    "effective_date": None,
                    "review_date": None,
                    "win_rate_at_promotion": None,
                    "status_history": [{"date": today, "from": None, "to": "candidate"}],
                }
                # backfill case: enough evidence on first sight -> active immediately
                if (rule["evidence_count"] >= PROMOTE_THRESHOLD
                        and rule.get("root_cause") != "external_shock"):
                    _promote_to_active(rule, today)
                    print(f"  PROMOTED {rule['id']} -> active (evidence_count={rule['evidence_count']})")
                else:
                    print(f"  NEW candidate {rule['id']} (evidence_count={rule['evidence_count']})")
                rules.append(rule)
                by_sig[sig] = rule
                n_new += 1
        promoted_retros.add(base)

    # Review already-active rules whose review window has elapsed
    _review_active(rules, today)

    lessons["_promoted_retros"] = sorted(promoted_retros)
    lessons["last_updated"] = today
    atomic_write(LESSONS, lessons)

    active = sum(1 for r in rules if r.get("status") == "active")
    cand = sum(1 for r in rules if r.get("status") == "candidate")
    ret = sum(1 for r in rules if r.get("status") == "retired")
    print(f"PROMOTE done: new={n_new} updated={n_upd} | active={active} candidate={cand} retired={ret}")
    print(f"WROTE {LESSONS}")


# ─── list ────────────────────────────────────────────────────────────────────
def cmd_list(args):
    lessons = load_lessons()
    rules = lessons.get("rules", [])
    if not rules:
        print("No rules in state/lessons-learned.json yet.")
        return
    order = {"active": 0, "candidate": 1, "retired": 2}
    rules = sorted(rules, key=lambda r: (order.get(r.get("status"), 9), r.get("applies_to") or ""))
    print(f"{'STATUS':10} {'AGENT':12} {'CAT':26} {'ENFORCE':34} EV  RULE")
    for r in rules:
        e = r.get("enforcement") or {}
        enf = f"{e.get('type')}={e.get('value')}"
        print(f"{r.get('status','?'):10} {str(r.get('applies_to')):12} "
              f"{str(r.get('category')):26} {enf:34} {r.get('evidence_count',0):<3} {r.get('rule','')[:70]}")


# ─── main ────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="Weekly losing-trade post-mortem engine.")
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("gather", help="Build state/retrospectives/{weekStart}.json loss context.")
    g.add_argument("--week", help="Anchor date YYYY-MM-DD (default: today's week).")
    g.add_argument("--since", help="Backfill window start (YYYY-MM-DD or 'inception').")
    g.add_argument("--max-losses", type=int, default=DEFAULT_MAX_LOSSES,
                   help=f"Max losses to analyze (default {DEFAULT_MAX_LOSSES}).")
    g.set_defaults(func=cmd_gather)

    pr = sub.add_parser("promote", help="Merge candidate_rules into lessons-learned.json with lifecycle.")
    pr.add_argument("--retro", help="Specific retro JSON to process (default: all unprocessed).")
    pr.add_argument("--force", action="store_true", help="Reprocess all retro files (ignore promoted set).")
    pr.set_defaults(func=cmd_promote)

    ls = sub.add_parser("list", help="List all rules in lessons-learned.json.")
    ls.set_defaults(func=cmd_list)

    args = p.parse_args()
    try:
        args.func(args)
    except Exception as exc:  # surface cleanly for cron logs
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
