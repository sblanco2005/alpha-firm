#!/usr/bin/env python3
"""Morning outcome evaluation: fill due checkpoints, set horizon verdicts, regenerate scorecards.
Idempotent: only fills checkpoints whose date<=TODAY and price is null."""
import json, urllib.request, sys, subprocess, time, os, datetime

BASE = "/home/clawd/alpha-firm"
TODAY = "2026-06-29"
FHKEY = "d8u7c0pr01qinhug9jv0d8u7c0pr01qinhug9jvg"
AGENTS = ["macro", "crypto", "quant", "sentiment", "contrarian", "catalyst"]

def fh_quote(sym):
    try:
        url = f"https://finnhub.io/api/v1/quote?symbol={sym}&token={FHKEY}"
        d = json.load(urllib.request.urlopen(url, timeout=12))
        if d and d.get("c") and d["c"] > 0:
            return d["c"]
    except Exception as e:
        pass
    return None

def yahoo(sym):
    ysym = sym
    if sym == "BTC": ysym = "BTC-USD"
    if sym == "VIX": ysym = "^VIX"
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ysym}?interval=1d&range=5d"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        d = json.load(urllib.request.urlopen(req, timeout=12))
        p = d["chart"]["result"][0]["meta"]["regularMarketPrice"]
        if p and p > 0:
            return p
    except Exception:
        pass
    return None

def fetch(sym):
    if sym in ("PASS", "NONE", "none", None, ""):
        return None
    p = fh_quote(sym)
    if p: return p
    time.sleep(0.3)
    p = yahoo(sym)
    return p

def atomic_write(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    # validate with jq
    r = subprocess.run(["jq", "-e", ".", tmp], capture_output=True)
    if r.returncode != 0:
        print(f"  !! jq validation FAILED for {path}; not written", file=sys.stderr)
        os.remove(tmp); return False
    os.replace(tmp, path)
    return True

# Load
with open(f"{BASE}/state/outcomes.json") as f:
    data = json.load(f)
with open(f"{BASE}/state/leaderboard.json") as f:
    board = json.load(f)

recs = data.get("recommendations", [])
print(f"Loaded {len(recs)} recommendations, {sum(1 for r in recs if r.get('status')=='tracking')} tracking")

# 1) collect unique tickers with due checkpoints
due_tickers = set()
for r in recs:
    if r.get("status") != "tracking":
        continue
    cps = r.get("checkpoints", {})
    vals = cps.values() if isinstance(cps, dict) else cps
    for v in vals:
        if isinstance(v, dict) and v.get("date") and v["date"] <= TODAY and v.get("price") is None:
            due_tickers.add(r["ticker"])

print(f"Due tickers ({len(due_tickers)}): {sorted(due_tickers)}")
prices = {}
for t in sorted(due_tickers):
    p = fetch(t)
    prices[t] = p
    print(f"  {t}: {p}")
    time.sleep(0.35)

# 2) fill due checkpoints + horizon verdicts
filled = 0
verdicts = {"win":0,"partial":0,"loss":0}
for r in recs:
    if r.get("status") != "tracking":
        continue
    t = r["ticker"]
    p = prices.get(t)
    if p is None:
        continue
    entry = r["entry_price"]
    cps = r.get("checkpoints", {})
    # normalize to list of (is_horizon, cpdict)
    items = []
    if isinstance(cps, dict):
        for k, v in cps.items():
            if isinstance(v, dict):
                items.append((k == "horizon", v))
    elif isinstance(cps, list):
        n_list = len(cps)
        for i, v in enumerate(cps):
            if isinstance(v, dict):
                items.append((i == n_list - 1, v))
    horizon_filled_now = False
    horizon_cp = None
    peak = r.get("peak_return_pct")
    for is_horizon, v in items:
        if v.get("date") and v["date"] <= TODAY and v.get("price") is None:
            ret = (p - entry) / entry * 100.0
            v["price"] = round(p, 4)
            v["return_pct"] = round(ret, 2)
            filled += 1
            if peak is None or ret > peak:
                peak = round(ret, 2)
            if is_horizon:
                horizon_filled_now = True
                horizon_cp = v
    if peak is not None:
        r["peak_return_pct"] = peak
    if horizon_filled_now:
        tgt = r.get("target_return_pct", 0) or 0
        hret = horizon_cp["return_pct"] if horizon_cp else 0.0
        if peak is not None and peak >= tgt:
            v_ = "win"
        elif hret > 0:
            v_ = "partial"
        else:
            v_ = "loss"
        r["final_verdict"] = v_
        r["status"] = "evaluated"
        if horizon_cp is not None:
            horizon_cp["verdict"] = v_
        verdicts[v_] += 1

print(f"Filled {filled} checkpoints; new horizon verdicts: {verdicts}")

# 3) also fill simplified 'outcomes' array due entries (single checkpoint_price)
for o in data.get("outcomes", []):
    if o.get("status") != "tracking":
        continue
    cd = o.get("checkpoint_date")
    if cd and cd <= TODAY and o.get("checkpoint_price") is None:
        p = fetch(o["ticker"]) or prices.get(o["ticker"])
        if p is None:
            continue
        entry = o["entry_price"]; ret = (p-entry)/entry*100.0
        o["checkpoint_price"] = round(p,4)
        tgt = o.get("target_return_pct",0) or 0
        o["verdict"] = "win" if ret>=tgt else ("partial" if ret>0 else "loss")
        o["status"] = "evaluated"
        print(f"  simplified {o['id']} {o['ticker']}: {ret:.2f}% -> {o['verdict']}")

data["last_evaluated"] = TODAY
data["last_updated"] = "2026-06-29T11:00:02Z"

ok = atomic_write(f"{BASE}/state/outcomes.json", data)
print(f"outcomes.json written: {ok}")

# 4) regenerate scorecards from recommendations (status==evaluated)
def win_rate_mod(wr, n):
    if n < 5: return 1.0
    if wr > 60: return 1.2
    if wr >= 40: return 1.0
    return 0.8
def pnl_mod(pnl):
    if pnl > 100: return 1.2
    if pnl > 0: return 1.0
    if pnl < -100: return 0.5
    if pnl < -50: return 0.7
    return 1.0

for agent in AGENTS:
    arecs = [r for r in recs if r.get("agent_id")==agent]
    ev = [r for r in arecs if r.get("status")=="evaluated"]
    tr = [r for r in arecs if r.get("status")=="tracking"]
    wins = sum(1 for r in ev if r.get("final_verdict")=="win")
    losses = sum(1 for r in ev if r.get("final_verdict")=="loss")
    parts = sum(1 for r in ev if r.get("final_verdict")=="partial")
    n = wins+losses+parts
    wr = round(wins/n*100,1) if n else 0.0
    pk = [r["peak_return_pct"] for r in ev if r.get("peak_return_pct") is not None]
    def horizon_ret(r):
        c = r.get("checkpoints", {})
        if isinstance(c, dict):
            h = c.get("horizon", {})
            return h.get("return_pct") if isinstance(h, dict) else None
        if isinstance(c, list) and c:
            return c[-1].get("return_pct")
        return None
    hr = [horizon_ret(r) for r in ev]
    hr = [x for x in hr if x is not None]
    avgh = round(sum(hr)/len(hr),2) if hr else 0.0
    avgp = round(sum(pk)/len(pk),2) if pk else 0.0
    wrm = win_rate_mod(wr, n)
    pnl = board.get(agent,{}).get("total_pnl",0)
    pm = pnl_mod(pnl)
    eff = min(wrm, pm)
    # conviction calibration
    convcal = {}
    for r in ev:
        cv = str(r.get("conviction"))
        e = convcal.setdefault(cv, {"total":0,"wins":0,"losses":0,"partials":0})
        e["total"]+=1
        e[{"win":"wins","loss":"losses","partial":"partials"}.get(r.get("final_verdict"),"partials")]+=1
    for cv,e in convcal.items():
        e["win_rate"]=round(e["wins"]/e["total"]*100,1) if e["total"] else 0.0
    # by asset type
    byat = {}
    for r in ev:
        at = r.get("asset_type","none")
        e = byat.setdefault(at, {"total":0,"wins":0,"losses":0,"partials":0})
        e["total"]+=1
        e[{"win":"wins","loss":"losses","partial":"partials"}.get(r.get("final_verdict"),"partials")]+=1
    for at,e in byat.items():
        e["win_rate"]=round(e["wins"]/e["total"]*100,1) if e["total"] else 0.0
    # recent picks: last 10 by date (any status), dedup-ish by id
    recent = sorted(arecs, key=lambda r:(r.get("date",""), r.get("session","")), reverse=True)[:10]
    rp = [{"id":r.get("id"),"date":r.get("date"),"ticker":r.get("ticker"),
           "conviction":r.get("conviction"),"final_verdict":r.get("final_verdict"),
           "peak_return_pct":r.get("peak_return_pct"),"was_executed":r.get("was_executed",False)} for r in recent]
    # patterns
    strengths=[]; weaknesses=[]; adj=[]
    if n>=5:
        if wr>60: strengths.append(f"Win rate {wr}% above breakeven")
        if wr<40: weaknesses.append(f"Win rate {wr}% below breakeven — review thesis quality")
        if avgh<0: weaknesses.append(f"Negative avg horizon return ({avgh}%)")
    sc = {
      "agent_id":agent,"last_updated":TODAY,
      "total_evaluated":len(ev),"total_tracking":len(tr),
      "wins":wins,"losses":losses,"partials":parts,
      "win_rate":wr,"partial_rate":round(parts/n*100,1) if n else 0.0,
      "loss_rate":round(losses/n*100,1) if n else 0.0,
      "avg_horizon_return_pct":avgh,"avg_peak_return_pct":avgp,
      "track_record_modifier":eff,
      "conviction_calibration":convcal,"by_asset_type":byat,
      "recent_picks":rp,
      "patterns":{"strengths":strengths,"weaknesses":weaknesses,"adjustment_suggestions":adj}
    }
    ok2 = atomic_write(f"{BASE}/state/scorecards/{agent}.json", sc)
    print(f"scorecard {agent}: ev={len(ev)} wr={wr}% avgH={avgh}% mod={eff} -> {ok2}")

print("DONE")
