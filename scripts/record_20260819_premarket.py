#!/usr/bin/env python3
"""2026-08-19 premarket: record 6 recommendations to outcomes.json, append PASS decision to trade-log,
update portfolio marks, update daily-state."""
import json, subprocess, os

BASE = "/home/clawd/alpha-firm"
TS = subprocess.run(["bash", "-c", 'TZ="America/New_York" date +%Y-%m-%dT%H:%M:%S'], capture_output=True, text=True).stdout.strip()

def atomic_write(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    r = subprocess.run(["jq", "-e", ".", tmp], capture_output=True)
    if r.returncode != 0:
        raise SystemExit(f"jq validation FAILED for {path}: {r.stderr.decode()}")
    os.replace(tmp, path)

def cps(day1, day5, day10, day20, horizon):
    def cp(d): return {"date": d, "price": None, "return_pct": None}
    return {"day_1": cp(day1), "day_5": cp(day5), "day_10": cp(day10), "day_20": cp(day20), "horizon": cp(horizon)}

# ---------- outcomes ----------
with open(f"{BASE}/state/outcomes.json") as f:
    outcomes = json.load(f)

new_entries = [
    {
        "id": "macro-2026-08-19-premarket", "agent_id": "macro", "date": "2026-08-19", "session": "premarket",
        "ticker": "PASS", "asset_type": "etf", "entry_price": 0, "target_return_pct": 0, "horizon_days": 0,
        "conviction": 4, "was_executed": False,
        "thesis_summary": "PASS (16th consecutive) on FOMC-minutes morning: UAE attributed two missiles to Iran overnight, oil three-week high, yet USO flat ~6% below the 139 trigger (escalation exhaustion); VXX pinned at 52w lows, TLT at 52w lows, every energy equity a headline gap with -12% to -29% accord-gap risk.",
        "status": "pass", "checkpoints": None, "peak_return_pct": None, "final_verdict": None,
        "model_provider": "kimi"
    },
    {
        "id": "crypto-2026-08-19-premarket", "agent_id": "crypto", "date": "2026-08-19", "session": "premarket",
        "ticker": "PASS", "asset_type": "stock", "entry_price": 0, "target_return_pct": 0, "horizon_days": 0,
        "conviction": 4, "was_executed": False,
        "thesis_summary": "PASS: BTC ETF flows confirmed (+$189M Tue, first 2-day inflow streak since early Aug) and BTC held the ~$64,300 band, but 3 hike dissenters make today's 2pm FOMC minutes a hawkish-skewed binary with 10Y at its 52wk high and the miner tape broken (MSTR through $94 gate, IREN $42 mid-zone with failed $45.32 reclaim).",
        "status": "pass", "checkpoints": None, "peak_return_pct": None, "final_verdict": None,
        "model_provider": "kimi"
    },
    {
        "id": "quant-2026-08-19-premarket", "agent_id": "quant", "date": "2026-08-19", "session": "premarket",
        "ticker": "XLV", "asset_type": "etf", "entry_price": 169.73, "target_return_pct": 4, "horizon_days": 15,
        "conviction": 6, "was_executed": False,
        "thesis_summary": "XLV day-2 breakout: closed 169.73 (+1.6%) new 52w closing high with 168.44 fakeout trigger never tested and JNJ/LLY breadth confirmed, while QQQ distributed -1.69% and SMH broke its 50-day; caveat: breakout volume only 0.83x avg.",
        "status": "tracking",
        "checkpoints": cps("2026-08-20", "2026-08-26", "2026-09-02", "2026-09-16", "2026-09-09"),
        "peak_return_pct": None, "final_verdict": None,
        "pm_decision_note": "PASSed by PM. raw 7.05 x 0.92 SPY-baseline (modest +4%/15d target in bull tape) = 6.49 < 8.0 bull bar; conv6 < 7.5 debate floor (no debate); 0.83x volume = unconfirmed breakout per quant's own guardrail.",
        "model_provider": "kimi"
    },
    {
        "id": "sentiment-2026-08-19-premarket", "agent_id": "sentiment", "date": "2026-08-19", "session": "premarket",
        "ticker": "PASS", "asset_type": "stock", "entry_price": 0, "target_return_pct": 0, "horizon_days": 0,
        "conviction": 3, "was_executed": False,
        "thesis_summary": "PASS: zero new positioning on live setups (APTV $48.60 mid-cluster, no 5th insider; CC $15.42, no 7th insider); fresh prints disqualified (CODI sub-$2B near 52wH, REI small-cap, Schwab call-SELLING); F&G 59 greed slide without fear extreme.",
        "status": "pass", "checkpoints": None, "peak_return_pct": None, "final_verdict": None,
        "model_provider": "kimi"
    },
    {
        "id": "contrarian-2026-08-19-premarket", "agent_id": "contrarian", "date": "2026-08-19", "session": "premarket",
        "ticker": "TPR", "asset_type": "stock", "entry_price": 132.26, "target_return_pct": 20, "horizon_days": 60,
        "conviction": 6, "was_executed": False,
        "thesis_summary": "Tapestry crashed -16.5% on 8/13 after a Q4 FY26 BEAT (EPS +28%, rev +8.9%, FY26 EPS +38%, Coach +24%, div +16%) purely because FY27 guidance merely met elevated expectations; floor $125-129 defended 3 sessions + +2.5-3% reversal day; TGT's overnight beat-and-raise de-risks the consumer bear leg.",
        "status": "tracking",
        "checkpoints": cps("2026-08-20", "2026-08-26", "2026-09-02", "2026-09-16", "2026-11-11"),
        "peak_return_pct": None, "final_verdict": None,
        "pm_decision_note": "PASSed by PM. raw 7.25 x 0.85 narrative (catalyst ~62td away = weak leg; re-rating-dependent thesis) x 1.0 fundamental (6.15/10: cheap fwd P/E 14.9 + FCF 5.2% offset by rev growth 8.9% and D/E 572) = 6.16 < 8.0 bull bar; conv6 < 7.5 debate floor.",
        "model_provider": "kimi"
    },
    {
        "id": "catalyst-2026-08-19-premarket", "agent_id": "catalyst", "date": "2026-08-19", "session": "premarket",
        "ticker": "PASS", "asset_type": "stock", "entry_price": 0, "target_return_pct": 0, "horizon_days": 0,
        "conviction": 3, "was_executed": False,
        "thesis_summary": "PASS: TGT and LOW both printed pre-open and are spent (TGT EPS $4.11 vs ~$2.32 on 370bp tariff-refund lift, FY raised; LOW $4.27 flat YoY, adj $4.40 refund-flattered); WMT pre-run priced; CAPR 8/22 PDUFA 9-3 against-vote bleeding; RARE ~7% EV gap; FOMC minutes stale.",
        "status": "pass", "checkpoints": None, "peak_return_pct": None, "final_verdict": None,
        "model_provider": "kimi"
    },
]

# dedup: remove any same-day same-agent entries first
ids = {e["id"] for e in new_entries}
outcomes["outcomes"] = [e for e in outcomes["outcomes"] if e.get("id") not in ids]
outcomes["outcomes"].extend(new_entries)
outcomes["last_updated"] = TS
atomic_write(f"{BASE}/state/outcomes.json", outcomes)
print(f"outcomes: +{len(new_entries)} entries -> {len(outcomes['outcomes'])} total")

# ---------- trade-log decision ----------
with open(f"{BASE}/state/trade-log.json") as f:
    log = json.load(f)

decision = {
    "date": "2026-08-19",
    "session": "premarket",
    "timestamp": TS,
    "model_provider": "kimi",
    "model_label": "Kimi K3 (kimi-k3 via https://api.kimi.com/coding)",
    "decision": "pass",
    "selected_agent": None,
    "ticker": None,
    "allocation_pct": 0,
    "allocation_amount": 0,
    "reasoning": "Nothing clears the 8.0 bull-mode bar. Quant XLV (conv6, day-2 breakout at new 52w closing high with JNJ/LLY breadth) scored raw 7.05 but breakout volume was 0.83x (unconfirmed by quant's own guardrail) and the +4%/15d target is modest against a bull tape — x0.92 SPY-baseline = 6.49. Contrarian TPR (conv6, -16.5% post-beat crash with floor defended 3 sessions) scored raw 7.25 but the re-rating catalyst is ~62 trading days away (agent's own 'weak leg') and the thesis is re-rating-dependent — x0.85 narrative = 6.16; fundamental overlay neutral at 6.15/10 (fwd P/E 14.9 and FCF 5.2% offset by 8.9% rev growth and D/E 572). Both conv6 < 7.5 debate floor, so no capital-protection gate ran. Macro/crypto/catalyst/sentiment all PASS at conv 3-4: FOMC minutes today 2pm with 3 hawkish dissenters is the binary everyone is waiting on; USO still ~6% below the 139 trigger despite overnight Iran missile attribution (escalation exhaustion); BTC flows confirmed 2-day inflow streak but miner tape broken into the rate binary. ADBE holds at +3.58% with falsification untouched.",
    "sell_tickers": [],
    "sell_reasoning": None,
    "regime": "bull (SPY 767.45 > SMA50 749.84 > SMA200 706.28); execution bar 8.0",
    "agents_reviewed": {
        "macro": {"ticker": "PASS", "conviction": 4, "considered": False, "rejection_reason": "Agent PASS conv4 — 16th consecutive; all re-arm conditions unmet (USO ~6% below 139 trigger and FLAT on overnight Iran missile attribution = exhaustion; VXX 19.65 at 52w lows 9th session; TLT 52w-low zone).", "scores": None, "raw_score": None, "narrative_penalty": False},
        "crypto": {"ticker": "PASS", "conviction": 4, "considered": False, "rejection_reason": "Agent PASS conv4 — flows confirmed (+$189M, 2-day streak) and BTC band held, but 2pm FOMC minutes hawkish-skewed (3 hike dissenters) with 10Y at 52wk high and miner tape broken (MSTR through $94, IREN failed $45.32 reclaim).", "scores": None, "raw_score": None, "narrative_penalty": False},
        "quant": {"ticker": "XLV", "conviction": 6, "considered": True, "rejection_reason": "Final 6.49 < 8.0 bull bar",
                  "scores": {"evidence": 6, "falsifiability": 8, "risk_reward": 6, "portfolio_impact": 9, "signal_confirmation": 6, "execution_readiness": 8},
                  "raw_score": 7.05, "narrative_penalty": False, "spy_baseline_penalty": 0.92,
                  "spy_baseline_reason": "1 solid relative-strength reason (new 52w high while QQQ distributes) but +4%/15d target is modest vs a bull-tape SPY; healthcare rotation concrete but shallow edge",
                  "fundamental_modifier": 1.0, "fundamental_note": "ETF — 1.0x",
                  "final_score": 6.49},
        "sentiment": {"ticker": "PASS", "conviction": 3, "considered": False, "rejection_reason": "Agent PASS conv3 — APTV/CC unchanged (no new insiders/flow), fresh prints disqualified, greed slide without fear extreme.", "scores": None, "raw_score": None, "narrative_penalty": False},
        "contrarian": {"ticker": "TPR", "conviction": 6, "considered": True, "rejection_reason": "Final 6.16 < 8.0 bull bar",
                  "scores": {"evidence": 7, "falsifiability": 8, "risk_reward": 7, "portfolio_impact": 8, "signal_confirmation": 7, "execution_readiness": 6},
                  "raw_score": 7.25, "narrative_penalty": True,
                  "narrative_penalty_reasons": ["catalyst distant/weak (Q1 FY27 ~62td away, agent-flagged 'weak leg'; near-term trigger is WMT — another company's print)", "thesis is re-rating-dependent (market must re-read an already-reported beat)"],
                  "spy_baseline_penalty": 1.0,
                  "fundamental_modifier": 1.0,
                  "fundamental_note": "TPR: fwd P/E 14.9 (score 9, PEG 0.26), rev growth 8.9% (4), op margin 19.8% + ROE adj (7), D/E 571.6 (2), FCF yield 5.24% (8) -> 6.15/10 = neutral 1.0x",
                  "final_score": 6.16},
        "catalyst": {"ticker": "PASS", "conviction": 3, "considered": False, "rejection_reason": "Agent PASS conv3 — TGT/LOW spent pre-open (TGT beat 90.5% priced; LOW refund-flattered), WMT pre-run priced, CAPR negative-panel binary, RARE ~7% gap, minutes stale.", "scores": None, "raw_score": None, "narrative_penalty": False}
    },
    "debate_results": [],
    "debate_note": "No candidate reached the conviction >= 7.5 debate floor (XLV 6, TPR 6) — capital-protection gate not triggered.",
    "lessons_fired": [],
    "pm_adjustments_fired": [],
    "vix_level": 15.81,
    "vix_size_cap": "15-30%",
    "sector_check": None,
    "agent_dominance_check": {"last_2_buys_agents": ["index", "contrarian"], "current_agent": None, "deprioritized": False},
    "position_review": [
        {"ticker": "ADBE", "action": "hold", "price": 263.14, "pnl_pct": 3.58, "note": "Falsification (close <240 on rising volume) untouched — 8/18 close 263.14 on 0.94x volume; target 305 not hit; disaster stop 203.23 far away"},
        {"ticker": "SPY", "action": "hold", "price": 767.45, "note": "benchmark sweep"}
    ],
    "portfolio_after": {
        "cash": 808.6,
        "nav": 10281.14,
        "pnl_pct": 2.8114,
        "spy_return_pct": 3.0439,
        "alpha": -0.2325,
        "positions": [
            {"ticker": "SPY", "shares": 12, "entry_price": 744.78},
            {"ticker": "ADBE", "shares": 1, "entry_price": 254.04}
        ]
    }
}

log["decisions"].append(decision)
log["total_passes"] = log.get("total_passes", 0) + 1
log["last_updated"] = TS
atomic_write(f"{BASE}/state/trade-log.json", log)
print(f"trade-log: decision appended, total_passes={log['total_passes']}")

# ---------- portfolio marks (8/18 closes via price MCP; no trades) ----------
with open(f"{BASE}/state/portfolio.json") as f:
    pf = json.load(f)

spy = 767.45; adbe = 263.14
cash = pf["cash"]
nav = cash + 12 * spy + 1 * adbe
pnl_pct = (nav / 10000 - 1) * 100
spy_ret = (spy / pf["spy_inception_price"] - 1) * 100
pf["nav"] = round(nav, 2)
pf["spy_mark_price"] = spy
pf["spy_return_pct"] = round(spy_ret, 4)
pf["portfolio_pnl_pct"] = round(pnl_pct, 4)
pf["alpha"] = round(pnl_pct - spy_ret, 4)
if nav > pf.get("high_water_mark", 0):
    pf["high_water_mark"] = round(nav, 2)
pf["last_updated"] = TS
pf["nav_note"] = ("2026-08-19 PREMARKET (model_provider=kimi, Kimi K3): PASS — nothing cleared the 8.0 bull bar. "
    "Quant XLV conv6 raw 7.05 x0.92 SPY-baseline = 6.49 (day-2 breakout, 0.83x volume unconfirmed, modest +4% target); "
    "contrarian TPR conv6 raw 7.25 x0.85 narrative = 6.16 (post-beat -16.5% crash, floor defended, but re-rating catalyst ~62td away; fundamentals neutral 6.15/10). "
    "Macro/crypto/catalyst/sentiment PASS conv 3-4 into today's 2pm FOMC minutes (3 hawkish dissenters; USO flat ~6% below trigger despite Iran missile attribution; BTC flows 2-day green but miner tape broken; TGT/LOW spent pre-open). "
    "ADBE 263.14 (+3.58% vs 254.04 entry) — falsification untouched, HOLD. SPY 767.45; VIX 15.81. "
    f"NAV {pf['nav']} = {pf['portfolio_pnl_pct']}% run-2; SPY {pf['spy_return_pct']}% (744.78) => alpha {pf['alpha']}%. Firm-wide SPY +21.03% (634.09).")
atomic_write(f"{BASE}/state/portfolio.json", pf)
print(f"portfolio: NAV {pf['nav']}, pnl {pf['portfolio_pnl_pct']}%, spy {pf['spy_return_pct']}%, alpha {pf['alpha']}%")

# ---------- daily-state note ----------
with open(f"{BASE}/state/daily-state.json") as f:
    ds = json.load(f)
ds["last_updated"] = TS
ds["note"] = ("2026-08-19 PREMARKET complete (1/3, model_provider=kimi): PASS — nothing cleared the 8.0 bull bar. "
    "XLV conv6 6.49 final (unconfirmed 0.83x-volume breakout, modest target); TPR conv6 6.16 final (distant re-rating catalyst, neutral fundamentals). "
    "Macro/crypto/catalyst/sentiment PASS conv 3-4. ADBE 263.14 +3.58% holds, falsification untouched. "
    "VIX 15.81; SPY 767.45; NAV 10281.14 (+2.8114%); alpha -0.2325%. Outcome eval: macro XLE 7/22 horizon EVALUATED partial +8.85% vs 9% target; ADBE day_1 +3.58%. "
    "Midday watch: FOMC minutes 2pm (dissent detail, energy-inflation language), 10Y vs 4.7%, USO vs 139, WMT tomorrow BMO, tonight BTC ETF print (streak test), ADBE holds 260+.")
atomic_write(f"{BASE}/state/daily-state.json", ds)
print("daily-state: note updated")
print(f"TS={TS}")
