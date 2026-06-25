#!/usr/bin/env python3
"""Fill due checkpoints in outcomes.json with current prices, set horizon verdicts.
Run once per morning session. Reads /tmp/prices.json (ticker -> current price)."""
import json

OUTCOMES = '/home/clawd/alpha-firm/state/outcomes.json'
PRICES = '/tmp/prices.json'
TODAY = "2026-06-25"

with open(PRICES) as f:
    prices = json.load(f)
with open(OUTCOMES) as f:
    data = json.load(f)


def determine_verdict(peak_pct, horizon_pct, target_pct):
    if peak_pct is None:
        peak_pct = horizon_pct
    if peak_pct is not None and target_pct is not None and peak_pct >= target_pct:
        return "win"
    elif horizon_pct is not None and horizon_pct > 0:
        return "partial"
    else:
        return "loss"


def update_entry(entry):
    if not isinstance(entry, dict):
        return 0
    ticker = entry.get('ticker')
    entry_price = entry.get('entry_price')
    if not ticker or not entry_price or entry_price <= 0:
        return 0
    cps = entry.get('checkpoints')
    if not isinstance(cps, dict):
        return 0
    price = prices.get(ticker)
    if not price or price <= 0:
        return 0
    filled = 0
    horizon_filled_now = False
    for key, cp in cps.items():
        if not isinstance(cp, dict):
            continue
        cp_date = cp.get('date')
        if not cp_date or cp_date > TODAY:
            continue
        if cp.get('price') is not None:
            continue  # already filled
        ret = round((price - entry_price) / entry_price * 100, 2)
        cp['price'] = price
        cp['return_pct'] = ret
        filled += 1
        if key == 'horizon':
            horizon_filled_now = True
    if filled == 0:
        return 0
    # Recompute peak across all filled checkpoints
    rets = [c.get('return_pct') for c in cps.values()
            if isinstance(c, dict) and c.get('return_pct') is not None]
    if rets:
        entry['peak_return_pct'] = round(max(rets), 2)
    # Horizon verdict
    if horizon_filled_now and entry.get('status') == 'tracking':
        h = cps.get('horizon', {})
        h_ret = h.get('return_pct') if isinstance(h, dict) else None
        peak = entry.get('peak_return_pct')
        target = entry.get('target_return_pct')
        entry['final_verdict'] = determine_verdict(peak, h_ret, target)
        entry['status'] = 'evaluated'
    return filled


total_filled = 0
# Main recommendations array
for e in data.get('recommendations', []):
    total_filled += update_entry(e)
# Session-keyed objects containing agent entries
for key, val in list(data.items()):
    if key.startswith('session_') and isinstance(val, dict):
        for ak, entry in val.items():
            if isinstance(entry, dict) and entry.get('agent_id'):
                total_filled += update_entry(entry)

# Update metadata
still_tracking = sum(1 for e in data.get('recommendations', [])
                     if e.get('status') == 'tracking')
data['total_tracked'] = still_tracking
data['last_updated'] = TODAY + 'T11:00:00Z'
data['last_evaluated'] = TODAY

with open(OUTCOMES + '.tmp', 'w') as f:
    json.dump(data, f, indent=1)
print(f"Filled {total_filled} checkpoints. Still tracking: {still_tracking}")
print("Wrote", OUTCOMES + '.tmp')
