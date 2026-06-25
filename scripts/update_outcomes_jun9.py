#!/usr/bin/env python3
"""Update outcomes.json with June 9, 2026 checkpoint prices."""
import json
from datetime import datetime

TARGET_DATE = "2026-06-09"

# Prices as of June 9, 2026 (premarket / June 8 close)
PRICES = {
    'RIOT':  27.45,
    'GOGO':   4.57,
    'NVDA': 208.14,
    'GLD':  397.91,
    'CSCO': 120.00,   # estimate: ATH $130 Jun 4, $121.64 Jun 6
    'UPST':  30.79,
    'DVN':   45.04,
    'AMAT': 430.00,   # estimate: $453 Jun 5 → semiconductor drop Jun 8
    'XLE':   58.38,
    'NCLH':  18.60,
    'LPLA': 291.84,
    'SOXL': 182.54,
    'KBWB':  85.80,   # estimate: XLF-based
    'CLSK':  16.82,
    'AMD':  499.00,
    'FCN':  153.50,
    'INTC': 111.00,
    'AVGO': 394.92,
    'RKLB': 107.60,
    'NKE':   43.63,
    'LULU': 114.23,   # Jun 8 close
    'ADBE': 244.74,
    'MAR':  392.51,
    'XLF':   51.92,
    'CCL':   27.01,
    'STRL': 880.00,
}


def determine_verdict(peak_pct, horizon_pct, target_pct):
    """Horizon verdict: win if peak >= target, partial if horizon > 0, else loss."""
    if peak_pct is None:
        peak_pct = horizon_pct
    if peak_pct >= target_pct:
        return "win"
    elif horizon_pct > 0:
        return "partial"
    else:
        return "loss"


def checkpoint_verdict(return_pct, target_pct):
    """Per-checkpoint verdict for array-style entries."""
    if return_pct >= target_pct:
        return "win"
    elif return_pct > 0:
        return "partial"
    else:
        return "loss"


def process_entry(entry):
    ticker = entry.get('ticker', '')
    if ticker in ('PASS', '') or ticker not in PRICES:
        return entry

    price = PRICES[ticker]
    entry_price = entry.get('entry_price', 0)
    if not entry_price:
        return entry

    new_return = round((price / entry_price - 1) * 100, 2)
    checkpoints = entry.get('checkpoints', {})
    if not checkpoints:
        return entry

    already_evaluated = (
        entry.get('status') == 'evaluated'
        or entry.get('final_verdict') is not None
    )

    # ── Dict-style checkpoints ──────────────────────────────────────────────
    if isinstance(checkpoints, dict):
        horizon_hit_today = False
        for key, cp in checkpoints.items():
            if isinstance(cp, dict) and cp.get('date') == TARGET_DATE and cp.get('price') is None:
                cp['price'] = price
                cp['return_pct'] = new_return
                if key == 'horizon' and not already_evaluated:
                    horizon_hit_today = True

        if not already_evaluated:
            cur_peak = entry.get('peak_return_pct')
            if cur_peak is None or new_return > cur_peak:
                entry['peak_return_pct'] = new_return

            if horizon_hit_today:
                target = entry.get('target_return_pct', 0)
                peak = entry.get('peak_return_pct', new_return)
                entry['final_verdict'] = determine_verdict(peak, new_return, target)
                entry['status'] = 'evaluated'

    # ── Array-style checkpoints ─────────────────────────────────────────────
    elif isinstance(checkpoints, list):
        valid_dates = [cp.get('date', '') for cp in checkpoints if isinstance(cp, dict)]
        last_date = max(valid_dates) if valid_dates else ''
        horizon_hit_today = False

        for cp in checkpoints:
            if isinstance(cp, dict) and cp.get('date') == TARGET_DATE and cp.get('price') is None:
                cp['price'] = price
                cp['return_pct'] = new_return
                target = entry.get('target_return_pct', 0)
                cp['verdict'] = checkpoint_verdict(new_return, target)
                if cp.get('date') == last_date and not already_evaluated:
                    horizon_hit_today = True

        if not already_evaluated:
            cur_peak = entry.get('peak_return_pct')
            if cur_peak is None or new_return > cur_peak:
                entry['peak_return_pct'] = new_return

            if horizon_hit_today:
                target = entry.get('target_return_pct', 0)
                peak = entry.get('peak_return_pct', new_return)
                entry['final_verdict'] = determine_verdict(peak, new_return, target)
                entry['status'] = 'evaluated'

    return entry


def main():
    src = '/home/clawd/alpha-firm/state/outcomes.json'
    tmp = src + '.tmp'

    with open(src) as f:
        data = json.load(f)

    updated = 0

    # Process flat recommendations array
    for i, entry in enumerate(data.get('recommendations', [])):
        before = json.dumps(entry)
        data['recommendations'][i] = process_entry(entry)
        if json.dumps(data['recommendations'][i]) != before:
            updated += 1

    # Process session-keyed objects
    for key in list(data.keys()):
        if key.startswith('session_') and isinstance(data[key], dict):
            for agent_key, entry in data[key].items():
                if isinstance(entry, dict):
                    before = json.dumps(entry)
                    data[key][agent_key] = process_entry(entry)
                    if json.dumps(data[key][agent_key]) != before:
                        updated += 1

    # Update metadata
    data['last_evaluated'] = TARGET_DATE
    data['last_updated'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Updated {updated} entries. Written to {tmp}")

    # Print summary of horizon verdicts set today
    for entry in data.get('recommendations', []):
        if entry.get('status') == 'evaluated' and entry.get('final_verdict') and entry.get('id', '').find('2026-06') < 0:
            # Check if any checkpoint today is horizon
            checkpoints = entry.get('checkpoints', {})
            if isinstance(checkpoints, dict):
                h = checkpoints.get('horizon', {})
                if h and h.get('date') == TARGET_DATE:
                    print(f"  HORIZON SET: {entry['id']} ({entry['ticker']}) → {entry['final_verdict']} | peak={entry.get('peak_return_pct')}% | horizon={h.get('return_pct')}%")


if __name__ == '__main__':
    main()
