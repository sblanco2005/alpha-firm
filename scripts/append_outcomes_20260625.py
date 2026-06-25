#!/usr/bin/env python3
"""Append 2026-06-25 premarket agent recommendations to outcomes.json (Step 8)."""
import json
from datetime import date, timedelta

OUTCOMES = '/home/clawd/alpha-firm/state/outcomes.json'
MEM = '/home/clawd/alpha-firm/memory'
TODAY = date(2026, 6, 25)
TODAY_S = '2026-06-25'

AGENTS = ['macro', 'crypto', 'quant', 'sentiment', 'contrarian', 'catalyst']


def trading_days(n):
    """Return date n trading days (skip Sat/Sun) after TODAY."""
    d = TODAY
    added = 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d.isoformat()


def checkpoint(n):
    dd = trading_days(n)
    return {"date": dd, "price": None, "return_pct": None}


with open(OUTCOMES) as f:
    data = json.load(f)

recs = data.setdefault('recommendations', [])
existing_ids = {r.get('id') for r in recs if isinstance(r, dict)}
added = 0

for agent in AGENTS:
    path = f"{MEM}/{agent}/{TODAY_S}.json"
    try:
        with open(path) as f:
            rec = json.load(f)
    except Exception as e:
        print(f"SKIP {agent}: {e}")
        continue

    ticker = rec.get('ticker')
    entry_price = rec.get('current_price') or rec.get('entry_price')
    horizon = rec.get('horizon_days') or 14
    target = rec.get('target_return_pct')
    conviction = rec.get('conviction')
    asset_type = rec.get('asset_type', 'stock')
    thesis = rec.get('entry_thesis', '')
    # Dedup: same agent+date -> update
    rid = f"{agent}-{TODAY_S}-premarket"
    entry = {
        "id": rid,
        "agent_id": agent,
        "date": TODAY_S,
        "session": "premarket",
        "ticker": ticker,
        "asset_type": asset_type,
        "entry_price": entry_price,
        "target_return_pct": target,
        "horizon_days": horizon,
        "conviction": conviction,
        "was_executed": False,
        "thesis_summary": thesis.split('.')[0][:240] + '.' if thesis else "",
        "status": "tracking",
        "checkpoints": {
            "day_1": checkpoint(1),
            "day_5": checkpoint(5),
            "day_10": checkpoint(10),
            "day_20": checkpoint(20),
            "horizon": checkpoint(horizon),
        },
        "peak_return_pct": None,
        "final_verdict": None,
    }
    # remove old same-id entry, append fresh
    recs = [r for r in recs if not (isinstance(r, dict) and r.get('id') == rid)]
    recs.append(entry)
    added += 1
    print(f"+ {agent}: {ticker} @{entry_price} conv={conviction} horizon={horizon}d target={target}%")

data['recommendations'] = recs
data['total_recommendations'] = len(recs)
data['total_tracked'] = sum(1 for r in recs if isinstance(r, dict) and r.get('status') == 'tracking')
data['last_updated'] = TODAY_S + 'T11:00:02Z'

# Also store a session summary object
data[f'session_{TODAY_S}-premarket'] = {
    "date": TODAY_S,
    "session": "premarket",
    "decision": "pass",
    "reason": "No candidate cleared 8.0 bull-market bar. KMX (sentiment, conv 8) killed in debate: bear crux (10b5-1) rebutted via SEC Form 4, but 2+ unrebutted serious weaknesses (no 35-day catalyst, valuation). NKE convergence (catalyst conv8/contrarian conv7) below threshold + contrarian self-rejected as value trap. MU/FDX earnings beats -> held.",
    "recommendations": {a: f"{TODAY_S}" for a in AGENTS},
}

with open(OUTCOMES + '.tmp', 'w') as f:
    json.dump(data, f, indent=1)
print(f"\nAppended {added} recommendations. Total recs: {len(recs)}. Tracked: {data['total_tracked']}")
