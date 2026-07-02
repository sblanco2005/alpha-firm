#!/usr/bin/env python3
"""Alpha Firm premarket session 2026-07-02: execute CLSK+FDX sells, PASS new buy, record outcomes.
Atomic writes (tmp -> jq validate -> mv) for every state file."""
import json, subprocess, os, datetime, copy

BASE = "/home/clawd/alpha-firm"
TS = "2026-07-02T11:00:01Z"
TODAY = "2026-07-02"
SPY = 745.76
SPY_INCEPT = 555.66
SPY_RET = round((SPY/SPY_INCEPT - 1)*100, 2)   # 34.22

def awrite(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    r = subprocess.run(["jq", "-e", ".", tmp], capture_output=True)
    if r.returncode != 0:
        print(f"  !! jq FAILED {path}:\n{r.stderr.decode()}", flush=True)
        os.remove(tmp); return False
    os.replace(tmp, path); return True

# ---------- live prices (Finnhub-verified this session) ----------
PX = {"CAT":991.41,"SYK":313.39,"TGLS":46.97,"FCN":149.39,"NCLH":20.67,"MU":1032.28,
      "CLSK":13.62,"FDX":313.89,"KMX":51.82,"MSTR":93.39,"JPM":334.07}

# ================= 1. PORTFOLIO =================
with open(f"{BASE}/state/portfolio.json") as f: pf = json.load(f)

def sell(pf, ticker, price, reason):
    pos = next(p for p in pf["positions"] if p["ticker"]==ticker)
    shares, entry = pos["shares"], pos["entry_price"]
    proceeds = round(shares*price, 2)
    cost = round(shares*entry, 2)
    pnl = round(proceeds - cost, 2)
    pnl_pct = round((pnl/cost)*100, 2)
    pf["positions"] = [p for p in pf["positions"] if p["ticker"]!=ticker]
    pf["cash"] = round(pf["cash"] + proceeds, 2)
    pf["sold_positions"].append({
        "ticker":ticker,"shares":shares,"entry_price":entry,"sell_price":price,
        "entry_date":pos["entry_date"],"sell_date":TODAY,"realized_pnl":pnl,
        "realized_pnl_pct":pnl_pct,"agent":pos["agent"],"reason":reason})
    return {"ticker":ticker,"shares":shares,"entry":entry,"price":price,"proceeds":proceeds,
            "pnl":pnl,"pnl_pct":pnl_pct,"agent":pos["agent"]}

clsk = sell(pf,"CLSK",PX["CLSK"],"Hard stop $14.00 breached: CLSK $13.62 (-21.5%). Crypto-miner margin compression; thesis bled past stop despite BTC $61,194 > $58K falsification. Stop discipline honored.")
fdx  = sell(pf,"FDX",PX["FDX"],"Stop $315.00 breached: FDX $313.89 (-5.4%). Post-earnings (6/23 beat) drift lower 9 sessions; stop honored. Quant execution suspended; thesis not re-confirmed.")

# update latest_price on remaining positions (MTM)
for p in pf["positions"]:
    p["latest_price"] = PX[p["ticker"]]
    p["latest_price_note"] = f"2026-07-02 PREMARKET: ${PX[p['ticker']]} (Finnhub)."

mtm_pos = round(sum(p["shares"]*PX[p["ticker"]] for p in pf["positions"]), 2)
pf["cash"] = round(pf["cash"], 2)
nav = round(pf["cash"] + mtm_pos, 2)
pnl_pct = round((nav/10000 - 1)*100, 2)
alpha = round(pnl_pct - SPY_RET, 2)
pf["nav"] = nav
pf["last_updated"] = TS
pf["spy_closing_price"] = SPY
pf["spy_return_pct"] = SPY_RET
pf["portfolio_pnl_pct"] = pnl_pct
pf["alpha"] = alpha
pf["nav_note"] = (f"NAV 2026-07-02 PREMARKET: ${nav:.2f} (MTM). Cash ${pf['cash']:.2f}. "
    f"6 positions (sold CLSK hard-stop -21.5%, FDX stop -5.4%). MTM winners: TGLS(+21.6%)/CAT(+19.6%)/SYK(+6.4%)/NCLH(+2.2%); "
    f"losers: MU(-2.2%, above $985 stop)/FCN(-2.5%). SPY ${SPY} (reclaimed 50-day $736.61 & 200-day $691.87; BULL MODE). "
    f"VIX 16.7 (<25, risk-on). BTC $61,194. Portfolio +{pnl_pct}%. Alpha {alpha}% (SPY +{SPY_RET}%). "
    f"PREMARKET PASS (8.0 bull bar): KMX(sentiment conv8) raw 7.48 x track 1.0 x fund 0.88 x spy 0.92 x debate 1.05 = 6.35 < 8.0 "
    f"(insider cluster strong but weak fundamentals: net margin 0.84%, rev -1.6%, modest 1.3:1 R/R); "
    f"MSTR(crypto conv7) killed by 0.5x track modifier (crypto pnl -$212 after CLSK stop) = 3.6; "
    f"macro/contrarian/catalyst self-PASS; quant JPM PAPER-ONLY (suspended to 07-08). "
    f"Index tranche DEFERRED to post-NFP (7/3): thin 1.2% 50-day reclaim + NFP binary tomorrow.")
print(f"NAV=${nav} (+{pnl_pct}%) alpha={alpha}% cash=${pf['cash']}")

# ================= 2. LEADERBOARD =================
with open(f"{BASE}/state/leaderboard.json") as f: lb = json.load(f)

def credit(lb, agent, pnl, pnl_pct, ticker, date, note, kind):
    a = lb[agent]
    a["total_pnl"] = round(a["total_pnl"] + pnl, 2)
    if pnl > 0: a["wins"] += 1
    else: a["losses"] += 1
    a["current_streak"] = 1 if pnl>0 else -1
    bt = a.get("best_trade"); wt = a.get("worst_trade")
    if pnl>0 and (bt is None or pnl>bt.get("pnl",-1e9)):
        a["best_trade"]={"ticker":ticker,"pnl":pnl,"pnl_pct":pnl_pct,"date":date,"note":note}
    if pnl<0 and (wt is None or pnl<wt.get("pnl",1e9)):
        a["worst_trade"]={"ticker":ticker,"pnl":pnl,"pnl_pct":pnl_pct,"date":date,"note":note}

credit(lb,"crypto",clsk["pnl"],clsk["pnl_pct"],"CLSK",TODAY,
       f"Hard stop $14 triggered: CLSK ${PX['CLSK']} (-21.5%). BTC ${61194} > $58K but miner margin compression. 14-day hold.","loss")
credit(lb,"quant",fdx["pnl"],fdx["pnl_pct"],"FDX",TODAY,
       f"Stop $315 triggered: FDX ${PX['FDX']} (-5.4%). Post-earnings drift lower. 15-day hold.","loss")

lb["crypto"]["open_positions_notes"]="No open crypto positions after CLSK stop-out. MSTR tracked (conv7, BTC reclaimed $61K + NAV-premium V-bounce off $81.81 low) — killed by 0.5x track modifier (crypto pnl -$212 < -$100)."
lb["quant"]["open_positions_notes"]="MU 1sh@$1,055.89 ($1,032, -2.2%, above $985 stop, post-earnings beat held). FDX SOLD at stop $315 (-5.4%). JPM paper-only (conv8, suspended to 07-08)."
lb["sentiment"]["open_positions_notes"]="TGLS 13sh@$38.61(+21.6% let run), FCN 4sh@$153.18(-2.5%), NCLH 40sh@$20.22(+2.2% stop $19). KMX tracked AGAIN (conv8, 5-insider cluster intact 7 days, below buy range) — final 6.35 < 8.0 bull bar (weak fundamentals net margin 0.84%)."

# reward: leader = highest total_pnl; pool = max(0, NAV-10000)*0.20
pool = round(max(0, nav-10000)*0.20, 2)
leader = max(lb, key=lambda a: lb[a].get("total_pnl",0) if a in ("macro","crypto","quant","sentiment","contrarian","catalyst") else -1e9)
for a in ("macro","crypto","quant","sentiment","contrarian","catalyst"):
    lb[a]["reward_earned"] = round(pool,2) if a==leader else 0.0
lb["reward_pool_usd"] = pool
lb["reward_pool_note"]=(f"2026-07-02 PREMARKET: 2 disciplined stop-out sells (CLSK -21.5%/-$160.82 crypto, FDX -5.4%/-$53.79 quant); PASS new buy (8.0 bull bar). "
    f"MTM NAV ${nav:.2f} (+{pnl_pct}%), alpha {alpha}% (SPY +{SPY_RET}%). Leader {leader} (total_pnl ${lb[leader]['total_pnl']:.2f}), reward_earned ${pool:.2f}. "
    f"Next: deploy index tranche (SPY/QQQ) ONLY on confirmed post-NFP follow-through (SPY holds >50-day $736 on falling VIX); re-evaluate KMX on lower entry / fundamental improvement.")
lb["last_updated"]=TS
print(f"Leaderboard: leader={leader} pool=${pool}")

# ================= 3. TRADE-LOG =================
with open(f"{BASE}/state/trade-log.json") as f: tl = json.load(f)

def add_sell_trade(tl, sid, pos, price, reason, stop_type, stop_price, hold_days, sector, final_score, debate):
    entry={"id":f"premarket-2026-07-02-sell-{sid.lower()}","date":TODAY,"session":"premarket","action":"sell",
      "ticker":sid,"asset_type":"stock","shares":pos["shares"],"entry_price":pos["entry"],"price":price,
      "total_cost":round(pos["shares"]*pos["entry"],2),"sale_value":round(pos["shares"]*price,2),
      "realized_pnl":pos["pnl"],"realized_pnl_pct":pos["pnl_pct"],"agent":pos["agent"],"reason":reason,
      "stop_type":stop_type,"stop_price":stop_price,"hold_days":hold_days,"mode":"simulated","sector":sector}
    tl["trades"].append(entry)

# hold days: CLSK bought 6/18 -> 7/02 = ~14 calendar sessions; FDX 6/17 -> 7/02 ~15
add_sell_trade(tl,"CLSK",clsk,PX["CLSK"],clsk["reason_"] if False else
   "Hard stop $14.00 breached: CLSK $13.62 (-21.54%). BTC $61,194 > $58K falsification held, but miner margin compression / stock-specific selling drove -21.5% past stop. Cut losses fast.",
   "hard_stop",14.0,14,"Technology",6.35,"SELL_STOP")
add_sell_trade(tl,"FDX",fdx,PX["FDX"],
   "Stop $315.00 breached: FDX $313.89 (-5.40%). Earnings beat 6/23 not translating to upside; 9-session drift lower. Price below recorded stop = exit. Quant suspended, no re-confirmation.",
   "stop_loss",315.0,15,"Industrials",None,"SELL_STOP")

tl["total_sells"]=tl["total_sells"]+2
tl["total_trades"]=tl["total_trades"]+2
tl["total_passes"]=tl["total_passes"]+1
tl["last_updated"]=TS

# decision entry
dec={"date":TODAY,"session":"premarket","decision":"pass","selected_agent":None,"ticker":None,
 "sell_tickers":["CLSK","FDX"],
 "sell_reasoning":"CLSK hard stop $14 breached (-21.5%, down >15% hard-stop rule); FDX stop $315 breached (-5.4%). Both executed at open before new-buy consideration.",
 "reasoning":(f"BULL MARKET MODE (SPY ${SPY} > 50-day $736.61 > 200-day $691.87) -> 8.0 execution bar. "
   f"2 sells honored stops. Top candidate KMX (sentiment conv8, EDGAR-verified 5-insider cluster incl CEO, intact 7 days, stock BELOW buy range): "
   f"raw 7.48 x track 1.0 x fund 0.88 (P/E 33.6, rev -1.6%, net margin 0.84%, ROE 3.67%) x spy 0.92 x debate 1.05 = 6.35 < 8.0. "
   f"MSTR (crypto conv7) killed by 0.5x track modifier (crypto realized pnl -$212 < -$100 after CLSK stop) = 3.6. "
   f"macro/contrarian/catalyst self-PASS (unverified risk-on driver, NFP binary tomorrow, all earnings priced-in). "
   f"quant JPM conv8 = PAPER-ONLY (execution suspended to 07-08). Index tranche (SPY/QQQ) DEFERRED to post-NFP: 50-day reclaim is thin (1.2%, 3 sessions old) and July 3 NFP is a binary that could reverse it. "
   f"Disciplined 4th consecutive premarket PASS + 2 stop-out sells. Cash ${pf['cash']:.0f} (57%)."),
 "agents_reviewed":{
   "macro":{"ticker":"PASS","conviction":2,"considered":False,"rejection_reason":"Self-PASS (conv2). Risk-on flip unverified; 0.5x modifier makes conv8=4.0."},
   "crypto":{"ticker":"MSTR","conviction":7,"considered":True,"rejection_reason":"Final 3.6 < bar. 0.5x track modifier (crypto pnl -$212 < -$100 after CLSK stop).",
     "scores":{"evidence":7.5,"falsifiability":7.5,"risk_reward":7,"portfolio_impact":7.5,"signal_confirmation":6.5,"execution_readiness":7},
     "raw_score":7.25,"track_modifier":0.5,"final_score":3.63},
   "quant":{"ticker":"JPM","conviction":8,"considered":False,"rejection_reason":"PAPER ONLY - execution suspended to 2026-07-08 (active lesson quant-min-conviction-8 + Step 1.5).",
     "scores":{"evidence":7,"falsifiability":7,"risk_reward":5,"portfolio_impact":6,"signal_confirmation":7,"execution_readiness":8},"raw_score":6.55},
   "sentiment":{"ticker":"KMX","conviction":8,"considered":True,"rejection_reason":"Final 6.35 < 8.0 bull bar. Weak fundamentals (net margin 0.84%, rev -1.6%) + modest 1.3:1 R/R sink it despite strong insider signal.",
     "scores":{"evidence":8.5,"falsifiability":8,"risk_reward":6.5,"portfolio_impact":7,"signal_confirmation":7,"execution_readiness":7},
     "raw_score":7.48,"track_modifier":1.0,"fundamental_modifier":0.88,"narrative_penalty":1.0,"spy_baseline":0.92,"debate_max":1.05,"final_score":6.35},
   "contrarian":{"ticker":"PASS","conviction":3,"considered":False,"rejection_reason":"Self-PASS (conv3). NKE catalyst fired but FY27 guidance negative; no conv8 setup in bull mode."},
   "catalyst":{"ticker":"PASS","conviction":3,"considered":False,"rejection_reason":"Self-PASS (conv3). All near-term earnings (DAL/LEVI/PEP) priced-in at 52-wk highs; no conv8 dated catalyst."}},
 "debate_results":[{"ticker":"KMX","debate_decision":"not_run_below_bar","bear_classification":"n/a","reason":"Pre-debate final 6.58; even best-case BUY_ELIGIBLE (1.05) yields 6.91 < 7.5/8.0 -> debate mathematically cannot clear threshold, not run. Risk Chair break-the-trade: insider cluster is genuine but KMX has -1.6% rev growth + 0.84% net margin in a +34% SPY bull run; beating SPY over 30d is questionable. Facts-only test: FAIL (modest R/R, weak fundamentals)."}],
 "live_lessons_enforcement":[{"rule_id":"quant-min-conviction-8","status":"active","candidate":"JPM(quant)","action":"moot - quant execution suspended to 07-08; JPM tracked paper-only conv8 (meets floor but not executable)"}],
 "vix_level":16.7,"vix_size_cap":"15-30% (VIX<=25)",
 "sector_check":{"note":"No new buy -> sector cap not exercised. Post-sell sector exposure (cost basis): Industrials 14.5%, Tech 10.6%, ConsDisc 8.1%, Materials 5.0%, Healthcare 3.0%, Cash 57%. All < 40%."},
 "agent_dominance_check":{"last_2_buys_agents":["quant","crypto"],"note":"No new buy this session -> not triggered. Next buy from sentiment/catalyst/macro preferred to avoid crypto/quant concentration."},
 "portfolio_after":{"cash":pf["cash"],"positions":[{"ticker":p["ticker"],"entry_price":p["entry_price"],"shares":p["shares"],"current_value":round(p["shares"]*PX[p["ticker"]],2),"agent":p["agent"]} for p in pf["positions"]],
   "nav":nav,"total_pnl":round(nav-10000,2),"pnl_pct":pnl_pct,"spy_return_pct":SPY_RET,"alpha":alpha}}
tl["decisions"].append(dec)
print("Trade-log updated.")

# ================= 4. OUTCOMES (record 6 recs) =================
with open(f"{BASE}/state/outcomes.json") as f: oc = json.load(f)

HOLIDAYS={"2026-07-04"}
def tdays(start, n):
    d=datetime.date.fromisoformat(start); cnt=0
    while cnt<n:
        d+=datetime.timedelta(days=1)
        if d.weekday()>=5 or d.isoformat() in HOLIDAYS: continue
        cnt+=1
    return d.isoformat()

def ckpts(horizon):
    d1=tdays(TODAY,1); d5=tdays(TODAY,5); d10=tdays(TODAY,10); d20=tdays(TODAY,20); h=tdays(TODAY,max(horizon,1))
    return {"day_1":{"date":d1,"price":None,"return_pct":None},"day_5":{"date":d5,"price":None,"return_pct":None},
            "day_10":{"date":d10,"price":None,"return_pct":None},"day_20":{"date":d20,"price":None,"return_pct":None},
            "horizon":{"date":h,"price":None,"return_pct":None}}

def real_rec(aid,ticker,at,entry,target,horizon,conv,thesis,executed=False):
    return {"id":f"{aid}-2026-07-02-premarket","agent_id":aid,"date":TODAY,"session":"premarket","ticker":ticker,
      "asset_type":at,"entry_price":entry,"target_return_pct":target,"horizon_days":horizon,"conviction":conv,
      "was_executed":executed,"thesis_summary":thesis,"status":"tracking","final_verdict":None,"peak_return_pct":None,
      "checkpoints":ckpts(horizon)}

def pass_rec(aid,conv,thesis):
    return {"id":f"{aid}-2026-07-02-premarket","agent_id":aid,"date":TODAY,"session":"premarket","ticker":"PASS",
      "asset_type":"stock","entry_price":None,"target_return_pct":0,"horizon_days":0,"conviction":conv,
      "was_executed":False,"thesis_summary":thesis[:200],"status":"evaluated","final_verdict":"pass",
      "peak_return_pct":None,"checkpoints":{}}

# dedupe: drop any pre-existing 2026-07-02-premarket ids first
oc["recommendations"]=[r for r in oc["recommendations"] if not (r.get("id","").endswith("2026-07-02-premarket"))]
oc["recommendations"].extend([
  pass_rec("macro",2,"Risk-on flip (SPY reclaimed 50-day) but driver unverified; NFP binary tomorrow; 0.5x modifier makes conv8=4.0."),
  real_rec("crypto","MSTR","stock",93.39,25,30,7,"BTC reclaimed $61K on rising volume; MSTR V-bounced +13.4% off $81.81 52w low, decoupling from bleeding miners (CLSK/MARA/RIOT). NAV-premium recovery play.",False),
  real_rec("quant","JPM","stock",334.07,4,10,8,"52-wk-high continuation breakout ($334, 1.48x vol) leading Financials (+2.18%); stacked-bull MAs. PAPER ONLY (suspended to 07-08).",False),
  real_rec("sentiment","KMX","stock",51.82,12,30,8,"5-insider Form-4 cluster incl CEO ($1.27M, 6/22-6/25), intact 7 days, stock BELOW buy range $52.01-53.39. PT raised 17.7% to $51.40.",False),
  pass_rec("contrarian",3,"NKE Q4 earnings fired but FY27 guidance NEGATIVE (rev down low-mid SD); DIS/PFE/FCX falling knives; no conv8 setup in bull mode."),
  pass_rec("catalyst",3,"All near-term earnings (DAL/LEVI/PEP) priced-in at 52-wk highs; no FDA PDUFA in-window; Q2 banks 8-9d out. No conv8 dated catalyst."),
])
oc["total_recommendations"]=oc.get("total_recommendations",0)+6
oc["total_tracked"]=sum(1 for r in oc["recommendations"] if r.get("status")=="tracking")
oc["last_updated"]=TS
print(f"Outcomes: {len(oc['recommendations'])} recs, {oc['total_tracked']} tracking")

# ================= WRITE ALL =================
for path,obj in [(f"{BASE}/state/portfolio.json",pf),(f"{BASE}/state/leaderboard.json",lb),
                 (f"{BASE}/state/trade-log.json",tl),(f"{BASE}/state/outcomes.json",oc)]:
    ok=awrite(path,obj); print(f"  wrote {os.path.basename(path)}: {ok}")

# ================= 5. DAILY-STATE =================
with open(f"{BASE}/state/daily-state.json") as f: ds=json.load(f)
ds["premarket_session"]={"completed":True,"timestamp":TS,"decision":"pass",
  "reason":"BULL MODE 8.0 bar. 2 stop-out sells (CLSK -21.5% hard, FDX -5.4%). KMX(sent conv8)=6.35<fund 0.88+spy0.92+8.0bar; MSTR(crypto)=3.6 killed by 0.5x (pnl -$212); macro/contrarian/catalyst self-PASS; quant JPM paper-only(suspended). Index tranche deferred to post-NFP. NAV $%.2f alpha %.2f."%(nav,alpha),
  "vix_level":16.7,"buy_attempted":False,"sell_tickers":["CLSK","FDX"]}
ds["last_updated"]=TS
ok=awrite(f"{BASE}/state/daily-state.json",ds); print(f"  wrote daily-state.json: {ok}")
print("ALL DONE")
