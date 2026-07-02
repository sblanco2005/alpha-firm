#!/usr/bin/env python3
"""Record 2026-06-29 premarket session: PASS decision. Updates outcomes, trade-log,
portfolio (MTM), leaderboard, daily-state. Atomic writes (jq-validated)."""
import json, os, subprocess, datetime

BASE = "/home/clawd/alpha-firm"
TODAY = "2026-06-29"
TS = "2026-06-29T11:00:02Z"

def aw(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    r = subprocess.run(["jq", "-e", ".", tmp], capture_output=True)
    if r.returncode != 0:
        print(f"  !! jq FAIL {path}: {r.stderr.decode()[:200]}", flush=True)
        os.remove(tmp); return False
    os.replace(tmp, path); return True

def trading_day_plus(start_iso, n):
    """Add n trading days (skip Sat/Sun) from a date string YYYY-MM-DD."""
    d = datetime.date.fromisoformat(start_iso)
    added = 0
    while added < n:
        d += datetime.timedelta(days=1)
        if d.weekday() < 5:  # Mon-Fri
            added += 1
    return d.isoformat()

def cp_set(horizon_days):
    return {
        "day_1": {"date": trading_day_plus(TODAY, 1), "price": None, "return_pct": None},
        "day_5": {"date": trading_day_plus(TODAY, 5), "price": None, "return_pct": None},
        "day_10": {"date": trading_day_plus(TODAY, 10), "price": None, "return_pct": None},
        "day_20": {"date": trading_day_plus(TODAY, 20), "price": None, "return_pct": None},
        "horizon": {"date": trading_day_plus(TODAY, max(horizon_days, 1)), "price": None, "return_pct": None},
    }

# ---- 1. OUTCOMES: append 6 recommendations ----
with open(f"{BASE}/state/outcomes.json") as f:
    out = json.load(f)
recs = out.setdefault("recommendations", [])

new_recs = [
    {"id":"macro-2026-06-29-premarket","agent_id":"macro","session":"premarket",
     "ticker":"PASS","asset_type":"etf","entry_price":728.99,"target_return_pct":0,
     "horizon_days":0,"conviction":2,"was_executed":False,
     "thesis_summary":"Self-PASS: risk-off transitional breakdown test (SPY $728.99 below 50-day, above 200-day), no exceptional asymmetric regime setup; gold longs stopped (DXY/UUP rising toward 52wk high); 0.5x modifier makes conv-8 unexecutable (8x0.5=4.0<7.5).",
     "status":"evaluated","final_verdict":"no_recommendation","peak_return_pct":None,
     "checkpoints":{"horizon":{"date":TODAY,"price":None,"return_pct":None}}},
    {"id":"crypto-2026-06-29-premarket","agent_id":"crypto","session":"premarket",
     "ticker":"PASS","asset_type":"stock","entry_price":59900.57,"target_return_pct":0,
     "horizon_days":0,"conviction":4,"was_executed":False,
     "thesis_summary":"Self-PASS: BTC $59,900 below $61K confirmation line, MSTR collapsing -24.8%/2wk to $0.50 above 52wk low, no miner reversal; correlation gate blocks a 2nd miner alongside held CLSK.",
     "status":"evaluated","final_verdict":"no_recommendation","peak_return_pct":None,
     "checkpoints":{"horizon":{"date":TODAY,"price":None,"return_pct":None}}},
    {"id":"quant-2026-06-29-premarket","agent_id":"quant","session":"premarket",
     "ticker":"UNH","asset_type":"stock","entry_price":427.89,"target_return_pct":3,
     "horizon_days":6,"conviction":8,"was_executed":False,
     "thesis_summary":"PAPER-ONLY (quant execution suspended to 2026-07-08): UNH fresh 52wk-high close $427.89 on 1.41x avg volume, relative-strength leader in defensive XLV (only green sector); measured move to $440, stop $397.",
     "status":"tracking","final_verdict":None,"peak_return_pct":None,"checkpoints":cp_set(6)},
    {"id":"sentiment-2026-06-29-premarket","agent_id":"sentiment","session":"premarket",
     "ticker":"KMX","asset_type":"stock","entry_price":52.76,"target_return_pct":15,
     "horizon_days":30,"conviction":8,"was_executed":False,
     "thesis_summary":"5-insider open-market (SEC Form 4 code-P) cluster incl CEO Keith Barr, 6/22-6/25, ~$1.27M, stock flat to buy range $52.01-53.39 vs $52.76; EDGAR-verified. Target +15% to ~$60.7. (PM PASSED: R/R 1.36:1 in risk-off tape, final 6.44<7.5.)",
     "status":"tracking","final_verdict":None,"peak_return_pct":None,"checkpoints":cp_set(30)},
    {"id":"contrarian-2026-06-29-premarket","agent_id":"contrarian","session":"premarket",
     "ticker":"PASS","asset_type":"stock","entry_price":0,"target_return_pct":0,
     "horizon_days":0,"conviction":3,"was_executed":False,
     "thesis_summary":"Self-PASS: no conv-8 contrarian setup; NKE earnings gamble without verified margin inflection (gross margin -130bps, JPM PT cut), gold/crypto miners falling knives, tape risk-off (SPY below 50-day).",
     "status":"evaluated","final_verdict":"no_recommendation","peak_return_pct":None,
     "checkpoints":{"horizon":{"date":TODAY,"price":None,"return_pct":None}}},
    {"id":"catalyst-2026-06-29-premarket","agent_id":"catalyst","session":"premarket",
     "ticker":"PASS","asset_type":"stock","entry_price":40.75,"target_return_pct":0,
     "horizon_days":0,"conviction":3,"was_executed":False,
     "thesis_summary":"Self-PASS: no conv-8 dated catalyst Jun29-Jul13; NKE degraded (-10%/6 of 7 sessions into 6/30 print), STZ/FDS/CNXC priced-in (ran into prints), AVAV negative revisions; FDA/macro calendar empty until late July.",
     "status":"evaluated","final_verdict":"no_recommendation","peak_return_pct":None,
     "checkpoints":{"horizon":{"date":TODAY,"price":None,"return_pct":None}}},
]
by_id = {r["id"]: i for i, r in enumerate(recs) if isinstance(r, dict) and "id" in r}
for nr in new_recs:
    if nr["id"] in by_id:
        recs[by_id[nr["id"]]] = nr
    else:
        recs.append(nr)
out["last_updated"] = TS
print("outcomes:", aw(f"{BASE}/state/outcomes.json", out))

# ---- 2. PORTFOLIO MTM ----
with open(f"{BASE}/state/portfolio.json") as f:
    pf = json.load(f)
prices = {"CAT":997.47,"SYK":332.71,"TGLS":44.75,"FCN":151.10,"NCLH":21.24,
          "MU":1132.33,"FDX":318.53,"CLSK":16.33}
posval = 0.0
for p in pf["positions"]:
    t = p["ticker"]; px = prices[t]
    p["latest_price"] = px
    p["latest_price_note"] = f"{TODAY} PREMARKET: ${px:.2f} (Finnhub/Yahoo)."
    posval += p["shares"] * px
cash = pf["cash"]
nav = round(cash + posval, 2)
pnl_pct = round((nav/10000 - 1)*100, 2)
spy = 728.99
spy_ret = round((spy/555.66 - 1)*100, 2)
alpha = round(pnl_pct - spy_ret, 2)
pf["nav"] = nav
pf["last_updated"] = TS
pf["spy_closing_price"] = spy
pf["spy_return_pct"] = spy_ret
pf["portfolio_pnl_pct"] = pnl_pct
pf["alpha"] = alpha
pf["nav_note"] = (f"NAV {TODAY} PREMARKET: ${nav:.2f} (MTM). Cash ${cash:.2f}. "
    f"8 positions all above stops. MTM winners: CAT(+20.3%)/TGLS(+15.9%)/SYK(+13.0%)/MU(+7.2%)/NCLH(+5.0%); "
    f"losers: CLSK(-5.9%, above $14 stop, BTC $60,028>$58K)/FDX(-4.0%, TIGHT $3.53 above $315 stop)/FCN(-1.4%). "
    f"SPY ${spy} (-0.72% vs prev, BELOW 50-day MA ~734, above 200-day; risk-off/transitional). VIX 18.38 (<25). "
    f"BTC $60,028, GLD $373.63 (gold crashed), TLT $87.36 (bonds bid). Portfolio +{pnl_pct}%. Alpha {alpha}% (SPY +{spy_ret}%). "
    f"PREMARKET PASS - disciplined. Only executable candidate KMX (sentiment conv8, EDGAR-verified 5-insider cluster incl CEO) scored raw 7.15; "
    f"capital-protection gate BUY_ELIGIBLE_REDUCED (0.90x, risk-off macro_conflict + modest 1.36:1 R/R) => final 6.44 < 7.5 bar. "
    f"4/6 agents self-PASS; quant UNH (conv8) PAPER-ONLY (suspended to 07-08). No sells - all 8 above stops; FDX tight to $315 stop - watch.")
print(f"portfolio: nav=${nav} pnl={pnl_pct}% spy={spy_ret}% alpha={alpha}% ->", aw(f"{BASE}/state/portfolio.json", pf))

# ---- 3. TRADE-LOG decision ----
with open(f"{BASE}/state/trade-log.json") as f:
    tl = json.load(f)
decision = {
  "date": TODAY, "session": "premarket", "decision": "pass", "selected_agent": None, "ticker": None,
  "reasoning": (
    "Disciplined PREMARKET PASS, 7.5 bar, risk-off tape (SPY $728.99 BELOW 50-day MA ~734, above 200-day; "
    "QQQ/semis weak, GLD $373.63 gold crashed, BTC $60,028 correcting, VIX 18.38 <25, TLT bid = flight to safety). "
    "4/6 agents self-PASS (macro conv2, crypto conv4, contrarian conv3, catalyst conv3 - no edge in risk-off breakdown regime). "
    "quant UNH (conv8, fresh 52wk-high close $427.89 on 1.41x vol, defensive-XLV RS leader) = PAPER-ONLY (execution suspended to 2026-07-08) "
    "AND 0.5x quant modifier => ~3.6 < 7.5 even if not suspended. "
    "sentiment KMX (conv8) = ONLY executable candidate. Insider-cluster thesis INDEPENDENTLY VERIFIED via SEC EDGAR Form 4s: "
    "5 current insiders incl CEO Keith Barr made open-market PURCHASES (code P) 6/22-6/25 (~$1.27M); former-CEO Folliard exercised+sold (M/F, minor offset). "
    "6-category raw score 7.15 (Evidence 8 verified, Falsifiability 8, R/R 6 [1.36:1 to soft floor; 52wk low $30.26], Portfolio 7, Signal 6, Execution 7). "
    "Capital Protection Gate: bear raised macro_conflict (risk-off tape for cyclical Consumer Discretionary) + modest R/R; bull partially rebutted regime risk "
    "(insider clusters leading/counter-cyclical, small size) but could not neutralize => BUY_ELIGIBLE_REDUCED_SIZE (0.90x). "
    "Final = 7.15 x track 1.0 x fundamental 1.0 x debate 0.90 x narrative 1.0 x spy_baseline 1.0 = 6.44 < 7.5 => PASS. "
    "KMX remains a tracked sentiment candidate; re-evaluate on regime stabilization (SPY reclaim 50-day) or improved asymmetry. "
    "No sells - all 8 positions above stops; FDX TIGHT ($318.53 vs $315 stop, $3.53 cushion) - watch closely. NAV $%.2f, alpha %.2f%%." % (nav, alpha)),
  "agents_reviewed": {
    "macro": {"ticker":"PASS","conviction":2,"considered":False,"rejection_reason":"Self-PASS; risk-off transitional breakdown, no asymmetric regime setup, gold longs stopped; 0.5x + conv-8 mathematically unexecutable"},
    "crypto": {"ticker":"PASS","conviction":4,"considered":False,"rejection_reason":"Self-PASS; BTC<$61K confirmation, MSTR at 52wk low, correlation gate blocks 2nd miner w/ held CLSK"},
    "quant": {"ticker":"UNH","conviction":8,"considered":True,"rejection_reason":"PAPER-ONLY (suspended to 07-08); 0.5x modifier => ~3.6 < 7.5; tracked only","scores":{"evidence":8,"falsifiability":7,"risk_reward":6,"portfolio_impact":7,"signal_confirmation":7,"execution_readiness":7},"raw_score":7.10,"final_score":3.55,"narrative_penalty":False,"note":"Execution suspended; recorded paper-only"},
    "sentiment": {"ticker":"KMX","conviction":8,"considered":True,"rejection_reason":"EDGAR-verified 5-insider cluster incl CEO; raw 7.15 but capital-protection gate REDUCED (0.90x) => final 6.44 < 7.5","scores":{"evidence":8,"falsifiability":8,"risk_reward":6,"portfolio_impact":7,"signal_confirmation":6,"execution_readiness":7},"raw_score":7.15,"final_score":6.44,"narrative_penalty":False},
    "contrarian": {"ticker":"PASS","conviction":3,"considered":False,"rejection_reason":"Self-PASS; no conv-8 setup; NKE earnings gamble, gold/crypto miners falling knives"},
    "catalyst": {"ticker":"PASS","conviction":3,"considered":False,"rejection_reason":"Self-PASS; no conv-8 dated catalyst; NKE degraded, STZ/FDS/CNXC priced-in, AVAV neg revisions"}
  },
  "debate_results": [
    {"ticker":"KMX","debate_decision":"buy_eligible_reduced","bear_classification":"serious_weakness",
     "risk_flags":["macro_conflict","modest_asymmetry"],"bear_strength":6,"bull_strength_updated":7,
     "fatal_flaw_found":False,"serious_weaknesses_count":2,"serious_weaknesses_rebutted":1,
     "modifier":0.90,
     "reason":"Bear: risk-off tape (SPY<50-day) hostile to cyclical Consumer Discretionary + 1.36:1 R/R with structural downside to 52wk low $30.26. Bull partially rebuted regime risk (EDGAR-verified CEO-led insider cluster is a leading/counter-cyclical signal; small size) but R/R asymmetry unrebutted. 1 unresolved macro/factor risk => REDUCED SIZE. Final 6.44 < 7.5 => PASS.",
     "break_the_trade_answer":"Facts-only: a verified CEO-led insider cluster is genuinely bullish, but a 1.36:1 discretionary long in a below-50-day tape is not the asymmetric trade to close a -26% alpha gap. PASS and monitor."}
  ],
  "vix_level": 18.38, "vix_size_cap": "15-30%",
  "sector_check": {"ticker_sector":"N/A (PASS)","sector_exposure_before_pct":None,"sector_exposure_after_pct":None,"blocked":False},
  "agent_dominance_check": {"last_2_buys_agents":["quant","crypto"],"current_top_agent":"sentiment","deprioritized":False,"note":"KMX=sentiment; no dominance conflict (last 2 buys quant/crypto)."},
  "live_lessons_enforcement": {"rules_checked":["quant-min-conviction-8 (active)","all-no-cpi-fomc-entry (candidate)","catalyst-min-conviction-8 (candidate)"],"fired":[],"note":"quant-min-conviction-8 active: UNH conv8 meets floor but quant execution-suspended => moot. Candidate rules not enforced. Today is NOT a CPI/FOMC day. No active rule fires on KMX (sentiment)."},
  "portfolio_after": {"cash":cash,"nav":nav,"positions_count":8,"pnl_pct":pnl_pct,"spy_return_pct":spy_ret,"alpha":alpha}
}
# replace any existing same-date/session decision, else append
tl["decisions"] = [d for d in tl.get("decisions", []) if not (d.get("date")==TODAY and d.get("session")=="premarket")]
tl["decisions"].append(decision)
tl["total_passes"] = tl.get("total_passes",0) + 1
tl["last_updated"] = TS
print("trade-log:", aw(f"{BASE}/state/trade-log.json", tl))

# ---- 4. LEADERBOARD ----
with open(f"{BASE}/state/leaderboard.json") as f:
    lb = json.load(f)
lb["reward_pool_note"] = (
    f"{TODAY} PREMARKET: PASS (disciplined; only candidate KMX scored 6.44<7.5 after reduced-size gate). "
    f"No sells => realized P&L unchanged, reward pool unchanged. Leader remains sentiment (total_pnl +$211.70, reward_earned $68.07). "
    f"MTM NAV ${nav:.2f} (+{pnl_pct}%), alpha {alpha}% (SPY +{spy_ret}%). Last 2 buys: FDX-quant, CLSK-crypto. "
    f"Next actionable: KMX tracked (re-enter on regime stabilization/improved R/R); deploy index tranche ONLY on confirmed SPY 50-day reclaim + VIX rollover; watch FDX tight to $315 stop.")
lb["last_updated"] = TS
print("leaderboard:", aw(f"{BASE}/state/leaderboard.json", lb))

# ---- 5. DAILY-STATE ----
with open(f"{BASE}/state/daily-state.json") as f:
    ds = json.load(f)
ds["checks"] = 1
ds["bought"] = False
ds["sessions_completed"] = ["premarket"]
ds["premarket_session"] = {
    "completed": True, "timestamp": TS, "decision": "pass",
    "reason": f"Disciplined PASS, 7.5 bar, risk-off tape (SPY ${spy} below 50-day, VIX 18.38). 4/6 agents self-PASS. quant UNH(conv8)=PAPER-ONLY (suspended 07-08 + 0.5x). sentiment KMX(conv8)=only candidate: EDGAR-verified 5-insider cluster incl CEO, raw 7.15 but REDUCED-SIZE gate (0.90x, risk-off macro_conflict + 1.36:1 R/R) => final 6.44 < 7.5. No sells - all 8 above stops; FDX tight ($318.53 vs $315 stop). NAV ${nav:.2f}, alpha {alpha}%.",
    "vix_level": 18.38, "buy_attempted": False
}
print("daily-state:", aw(f"{BASE}/state/daily-state.json", ds))
print("ALL STATE FILES UPDATED")
