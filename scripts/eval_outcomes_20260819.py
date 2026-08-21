#!/usr/bin/env python3
"""2026-08-19 premarket outcome evaluation: fill due checkpoints, set verdicts, regen scorecards.
Prices fetched via price-fetch MCP (verified above): XLE 63.68, ADBE 263.14 (2026-08-18 closes)."""
import json, subprocess, os

BASE = "/home/clawd/alpha-firm"
TODAY = "2026-08-19"
TS = "2026-08-19T07:00:01"
AGENTS = ["macro", "crypto", "quant", "sentiment", "contrarian", "catalyst"]

# ticker -> (price, bar_date)
PRICES = {"XLE": (63.68, "2026-08-18"), "ADBE": (263.14, "2026-08-18")}

def atomic_write(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    r = subprocess.run(["jq", "-e", ".", tmp], capture_output=True)
    if r.returncode != 0:
        raise SystemExit(f"jq validation FAILED for {path}: {r.stderr.decode()}")
    os.replace(tmp, path)

with open(f"{BASE}/state/outcomes.json") as f:
    data = json.load(f)

filled = []
for r in data["outcomes"]:
    if r.get("status") != "tracking":
        continue
    cps = r.get("checkpoints")
    if not isinstance(cps, dict):
        continue
    t = r["ticker"]
    if t not in PRICES:
        continue
    price, bar = PRICES[t]
    entry = r["entry_price"]
    ret = round((price - entry) / entry * 100, 2)
    changed = False
    for cp in cps.values():
        if isinstance(cp, dict) and cp.get("date") and cp["date"] <= TODAY and cp.get("price") is None:
            cp["price"] = price
            cp["return_pct"] = ret
            cp["captured"] = f"{TS} premarket snapshot; price = {bar} close via price-fetch MCP"
            changed = True
    if changed:
        if ret > (r.get("peak_return_pct") or 0):
            r["peak_return_pct"] = ret
        h = cps.get("horizon", {})
        if h.get("price") is not None:
            # horizon filled -> final verdict
            target = r.get("target_return_pct", 0)
            if ret >= target:
                r["final_verdict"] = "win"
            elif ret > 0:
                r["final_verdict"] = "partial"
            else:
                r["final_verdict"] = "loss"
            r["status"] = "evaluated"
            filled.append(f"{r['id']}: EVALUATED {r['final_verdict']} horizon {ret}% vs target {target}%")
        else:
            filled.append(f"{r['id']}: checkpoint filled {ret}% (still tracking)")

data["last_updated"] = TS
atomic_write(f"{BASE}/state/outcomes.json", data)
print("FILLED:")
for f_ in filled:
    print(" ", f_)

# ---- regenerate scorecards ----
def horizon_ret(e):
    cps = e.get("checkpoints")
    if isinstance(cps, dict):
        h = cps.get("horizon") or {}
        return h.get("return_pct")
    return None

def latest_ret(e):
    hr = horizon_ret(e)
    if hr is not None:
        return hr
    cps = e.get("checkpoints")
    if isinstance(cps, dict):
        vals = [c.get("return_pct") for c in cps.values() if isinstance(c, dict) and c.get("return_pct") is not None]
        return vals[-1] if vals else None
    return None

def win_rate(ev):
    w = sum(1 for e in ev if e.get("final_verdict") == "win")
    n = len(ev)
    return round(w / n * 100, 1) if n else None

def avg_ret(ev):
    rets = [horizon_ret(e) for e in ev if horizon_ret(e) is not None]
    return round(sum(rets) / len(rets), 2) if rets else None

for agent in AGENTS:
    mine = [e for e in data["outcomes"] if e.get("agent_id") == agent]
    evaluated = [e for e in mine if e.get("status") == "evaluated" and e.get("final_verdict") not in (None, "pass")]
    tracking = [e for e in mine if e.get("status") == "tracking"]
    wins = [e for e in evaluated if e["final_verdict"] == "win"]
    losses = [e for e in evaluated if e["final_verdict"] == "loss"]
    partials = [e for e in evaluated if e["final_verdict"] == "partial"]
    wr = win_rate(evaluated)

    def bucket(lo, hi):
        ev = [e for e in evaluated if lo <= (e.get("conviction") or 0) <= hi]
        return {"count": len(ev), "win_rate": win_rate(ev) if ev else None, "avg_return": avg_ret(ev)}

    by_asset = {}
    for at in sorted({e.get("asset_type") for e in evaluated if e.get("asset_type")}):
        ev = [e for e in evaluated if e.get("asset_type") == at]
        by_asset[at] = {"count": len(ev), "win_rate": win_rate(ev) if ev else None}

    recent = sorted(mine, key=lambda e: (e.get("date", ""), e.get("session", "")))[-10:]
    recent_picks = [{
        "date": e.get("date"), "session": e.get("session"), "ticker": e.get("ticker"),
        "conviction": e.get("conviction"), "entry_price": e.get("entry_price"),
        "latest_return_pct": latest_ret(e), "status": e.get("status"),
        "final_verdict": e.get("final_verdict"),
    } for e in recent]

    strengths, weaknesses, adjustments = [], [], []
    hi = bucket(8, 10)
    if hi["count"] and hi["win_rate"] is not None and hi["win_rate"] > 60:
        strengths.append(f"high-conviction (8-10) picks win {hi['win_rate']}%")
    for at, st in by_asset.items():
        if st["win_rate"] is not None and st["win_rate"] > 60:
            strengths.append(f"{at} picks win {st['win_rate']}% (n={st['count']})")
    med = bucket(5, 7)
    if med["count"] and med["win_rate"] is not None and med["win_rate"] < 40:
        weaknesses.append(f"medium-conviction (5-7) picks win only {med['win_rate']}%")
        adjustments.append("Raise conviction floor — medium-conviction (5-7) picks underperform")
    lo = bucket(1, 4)
    if lo["count"] and lo["win_rate"] is not None and lo["win_rate"] < 40:
        weaknesses.append(f"low-conviction (1-4) picks win only {lo['win_rate']}%")
    for at, st in by_asset.items():
        if st["win_rate"] is not None and st["count"] >= 3 and st["win_rate"] < 40:
            weaknesses.append(f"{at} picks win only {st['win_rate']}% (n={st['count']})")

    sc = {
        "agent_id": agent,
        "last_updated": TS,
        "total_evaluated": len(evaluated),
        "total_tracking": len(tracking),
        "wins": len(wins),
        "losses": len(losses),
        "partials": len(partials),
        "win_rate": wr if wr is not None else 0.0,
        "avg_return_at_horizon": avg_ret(evaluated),
        "conviction_calibration": {"high_8_10": bucket(8, 10), "medium_5_7": bucket(5, 7), "low_1_4": bucket(1, 4)},
        "by_asset_type": by_asset,
        "track_record_modifier": 1.0,
        "modifier_frozen": True,
        "executed_trades": len([e for e in evaluated if e.get("was_executed")]),
        "modifier_note": "RUN 2 fresh start — frozen at 1.0x until 30 executed trades under realized-R metric.",
        "recent_picks": recent_picks,
        "patterns": {"strengths": strengths, "weaknesses": weaknesses, "adjustments": adjustments},
    }
    atomic_write(f"{BASE}/state/scorecards/{agent}.json", sc)
    print(f"scorecard {agent}: {len(evaluated)} eval ({len(wins)}W/{len(losses)}L/{len(partials)}P), {len(tracking)} tracking")
print("DONE")
