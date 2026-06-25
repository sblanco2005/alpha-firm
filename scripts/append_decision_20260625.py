#!/usr/bin/env python3
"""Append 2026-06-25 premarket PASS decision to trade-log.json."""
import json

TL = '/home/clawd/alpha-firm/state/trade-log.json'

decision = {
    "date": "2026-06-25",
    "session": "premarket",
    "decision": "pass",
    "selected_agent": None,
    "ticker": None,
    "reasoning": (
        "PASS — bull-market mode (SPY $733.24, +31.96% since inception, mild pullback from $746.74 ATH). "
        "Execution bar raised to 8.0. No candidate cleared it. KMX (sentiment, conv 8, raw 7.15) was the sole "
        "debate candidate: bear's crux attack (10b5-1 plan) was DECISIVELY rebutted via SEC Form 4 XML "
        "(transactionCode=P, aff10b5One=0 for both CEO Barr + director Bensen = genuine ~$628K discretionary cluster), "
        "BUT 2+ serious weaknesses stood unrebutted (no specific catalyst within the 35-day window — earnings outside it, "
        "consensus -31.9% YoY; valuation unreconcilable — +22% target vs 33.3x depressed P/E, analyst consensus $47.93 below "
        "the $50.79 price). Bull downgraded to strength 5. Risk Chair: PASS (0.0x). Even pre-debate, 7.15 < 8.0. "
        "NKE showed rare 2-agent convergence (catalyst conv8 / contrarian conv7) but: contrarian explicitly self-rejected "
        "it as a value trap (margins still falling, -45% downside to BNP $23), catalyst post-modifier score ~5.0. "
        "Macro GLD killed by 0.5x hard modifier (effective ~3.6). Crypto MARA ~4.3 (0.7x) + overlaps CLSK. Quant suspended. "
        "Position mgmt: MU + FDX both BEAT earnings (held); MU stop reset $1050->$985 below the $991 earnings low."
    ),
    "vix_level": "UVXY $27.65 (VIX mildly elevated; WebSearch quota exhausted, used proxy)",
    "vix_size_cap": "VIX<=25 -> 15-30% (estimated; no buy taken)",
    "agents_reviewed": {
        "macro": {"ticker": "GLD", "conviction": 8, "considered": True,
                  "rejection_reason": "Macro 0.5x hard modifier (9.5% win rate, -$2.16 realized) -> effective final ~3.6; unexecutable below 8.0 bar",
                  "scores": {"evidence": 7, "falsifiability": 9, "risk_reward": 6, "portfolio_impact": 8, "signal_confirmation": 6, "execution_readiness": 7},
                  "raw_score": 7.25, "narrative_penalty": False, "final_score_estimate": 3.63},
        "crypto": {"ticker": "MARA", "conviction": 7, "considered": True,
                  "rejection_reason": "Below 8.0 bar (final ~4.3 after 0.7x crypto modifier + SPY penalty); duplicate BTC-miner thesis vs held CLSK",
                  "scores": {"evidence": 7, "falsifiability": 8, "risk_reward": 6, "portfolio_impact": 5, "signal_confirmation": 6, "execution_readiness": 7},
                  "raw_score": 6.60, "narrative_penalty": False, "final_score_estimate": 4.25},
        "quant": {"ticker": "XLI", "conviction": 7, "considered": False,
                  "rejection_reason": "Quant execution SUSPENDED until 2026-07-08 (37.2% win rate, -$106.98 realized) - paper only",
                  "scores": None, "raw_score": None, "narrative_penalty": False},
        "sentiment": {"ticker": "KMX", "conviction": 8, "considered": True,
                  "rejection_reason": "DEBATE PASS (0.0x) - 2+ unrebutted serious weaknesses: (1) no specific 35-day catalyst, (2) valuation unreconciled. Also pre-debate 7.51 < 8.0 bar",
                  "scores": {"evidence": 8, "falsifiability": 6, "risk_reward": 7, "portfolio_impact": 7, "signal_confirmation": 7, "execution_readiness": 8},
                  "raw_score": 7.15, "narrative_penalty": False, "final_score_estimate": 0.0},
        "contrarian": {"ticker": "NKE", "conviction": 7, "considered": False,
                  "rejection_reason": "Conviction 7 < 8 required for contrarian execution; agent explicitly self-rejected as value trap (margins -130bps, Nike Direct -7%, net income -35%)",
                  "scores": None, "raw_score": None, "narrative_penalty": True},
        "catalyst": {"ticker": "NKE", "conviction": 8, "considered": True,
                  "rejection_reason": "Below 8.0 bar (final ~5.0 after 0.8x catalyst modifier + 0.92 SPY penalty); poor pre-earnings R/R (-45% downside to BNP $23 target)",
                  "scores": {"evidence": 8, "falsifiability": 8, "risk_reward": 5, "portfolio_impact": 6, "signal_confirmation": 6, "execution_readiness": 7},
                  "raw_score": 6.80, "narrative_penalty": False, "final_score_estimate": 5.00},
    },
    "debate_results": [
        {
            "ticker": "KMX",
            "debate_decision": "pass",
            "bear_classification": "serious_weakness",
            "risk_flags": ["weak_catalyst", "valuation_mismatch", "macro_conflict", "sector_overlap", "narrative_overreach", "evidence_quality_low", "poor_asymmetry", "timing_risk"],
            "bear_strength": 7,
            "bull_strength_updated": 5,
            "fatal_flaw_found": False,
            "serious_weaknesses_count": 4,
            "serious_weaknesses_rebutted": 0,
            "modifier": 0.0,
            "crux_resolved": True,
            "crux_note": "Bear's 10b5-1 attack DECISIVELY rebutted: SEC Form 4 XML (Accession 0001170010-26-000067/68) shows transactionCode=P + aff10b5One=0 for CEO Barr (9,400sh@$53.005=$498K) and director Bensen (2,500sh@$52.20=$130K) on 2026-06-22 = genuine discretionary ~$628K two-person cluster.",
            "reason": "Signal genuine but catalyst absent. No specific forcing event within 35-day window (Q1 FY27 earnings outside window, consensus -31.9% YoY). Valuation unrebutted: +22% target vs 33.3x depressed P/E; 14-analyst consensus target $47.93 BELOW $50.79 price. CAF credit tail risk ($16B portfolio, 9.50% ECNL) unrebutted. Bull honestly conceded and downgraded to strength 5. Per debate rules: 2+ unrebutted serious weaknesses -> PASS."
        }
    ],
    "agent_dominance_check": {"last_2_buys_agents": ["quant(FDX Jun17)", "crypto(CLSK Jun18)"], "current_top_agent": "sentiment(KMX)", "deprioritized": False},
    "sector_check": {"note": "No buy; not triggered. KMX would be Consumer Discretionary (NCLH also CD) but stayed ~14% of NAV."},
    "sell_tickers": [],
    "sell_reasoning": "No sells. MU + FDX BEAT earnings and held. MU stop reset $1050->$985 (below $991 earnings low). All 8 positions within stops; nothing down 12%+.",
    "portfolio_after": {"cash": 4314.45, "nav": 10326.30, "positions_count": 8,
                        "portfolio_pnl_pct": 3.26, "spy_return_pct": 31.96, "alpha": -28.70},
}

with open(TL) as f:
    tl = json.load(f)

tl.setdefault('decisions', []).append(decision)
tl['last_updated'] = '2026-06-25T11:00:02Z'
tl['total_passes'] = tl.get('total_passes', 0) + 1
tl['total_trades'] = tl.get('total_trades', 0)

with open(TL + '.tmp', 'w') as f:
    json.dump(tl, f, indent=2)
print(f"Decisions: {len(tl['decisions'])} | total_passes: {tl['total_passes']}")
