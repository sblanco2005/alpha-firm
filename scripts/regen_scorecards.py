#!/usr/bin/env python3
"""Regenerate all agent scorecards from outcomes.json."""
import json
import statistics
from datetime import datetime

AGENTS = ['macro', 'crypto', 'quant', 'sentiment', 'contrarian', 'catalyst']
OUTCOMES_PATH = '/home/clawd/alpha-firm/state/outcomes.json'
SCORECARDS_DIR = '/home/clawd/alpha-firm/state/scorecards'


def get_all_entries(data):
    """Flatten all recommendations including session-keyed objects."""
    entries = list(data.get('recommendations', []))
    entries.extend(data.get('outcomes', []))
    for key, val in data.items():
        if key.startswith('session_') and isinstance(val, dict):
            for agent_key, entry in val.items():
                if isinstance(entry, dict) and entry.get('agent_id'):
                    entries.append(entry)
    return entries


def get_horizon_return(entry):
    """Get the horizon return_pct for an evaluated entry."""
    checkpoints = entry.get('checkpoints', {})
    if isinstance(checkpoints, dict):
        h = checkpoints.get('horizon', {})
        return h.get('return_pct') if h else None
    elif isinstance(checkpoints, list) and checkpoints:
        return checkpoints[-1].get('return_pct')
    return None


def build_scorecard(agent_id, entries):
    evaluated = [e for e in entries
                 if e.get('agent_id') == agent_id
                 and e.get('status') == 'evaluated'
                 and e.get('final_verdict') not in (None, 'pass')]

    tracking = [e for e in entries
                if e.get('agent_id') == agent_id
                and e.get('status') == 'tracking']

    wins = [e for e in evaluated if e.get('final_verdict') == 'win']
    losses = [e for e in evaluated if e.get('final_verdict') == 'loss']
    partials = [e for e in evaluated if e.get('final_verdict') == 'partial']

    total = len(evaluated)
    win_rate = round(len(wins) / total * 100, 1) if total > 0 else 0.0
    partial_rate = round(len(partials) / total * 100, 1) if total > 0 else 0.0
    loss_rate = round(len(losses) / total * 100, 1) if total > 0 else 0.0

    # Track record modifier — FROZEN at 1.0x (REMEDIATION-PLAN.md Phase 1.1, 2026-07-02).
    # Historical win rates were computed on the deprecated peak-touched-target metric
    # and partially corrupted prices. Re-enable only when the agent has >= 30 EXECUTED
    # trades under the corrected realized-R metric (see MODIFIER_UNFREEZE_THRESHOLD).
    MODIFIER_UNFREEZE_THRESHOLD = 30
    executed_count = len([e for e in evaluated if e.get('was_executed')])
    if executed_count >= MODIFIER_UNFREEZE_THRESHOLD:
        if win_rate >= 60:
            track_record_modifier = 1.2
        elif win_rate >= 40:
            track_record_modifier = 1.0
        else:
            track_record_modifier = 0.8
    else:
        track_record_modifier = 1.0  # frozen

    # Avg horizon return
    horizon_returns = [get_horizon_return(e) for e in evaluated]
    horizon_returns = [r for r in horizon_returns if r is not None]
    avg_horizon_return = round(statistics.mean(horizon_returns), 2) if horizon_returns else 0.0

    # Avg peak return
    peak_returns = [e.get('peak_return_pct') for e in evaluated
                    if e.get('peak_return_pct') is not None]
    avg_peak_return = round(statistics.mean(peak_returns), 2) if peak_returns else 0.0

    # Conviction calibration (individual conviction values)
    conviction_cal = {}
    for e in evaluated:
        c = str(e.get('conviction', 0))
        if c not in conviction_cal:
            conviction_cal[c] = {'total': 0, 'wins': 0, 'losses': 0, 'partials': 0, 'win_rate': 0.0}
        conviction_cal[c]['total'] += 1
        v = e.get('final_verdict')
        if v == 'win':
            conviction_cal[c]['wins'] += 1
        elif v == 'loss':
            conviction_cal[c]['losses'] += 1
        elif v == 'partial':
            conviction_cal[c]['partials'] += 1
    for c, d in conviction_cal.items():
        d['win_rate'] = round(d['wins'] / d['total'] * 100, 1) if d['total'] > 0 else 0.0

    # By asset type
    asset_types = {}
    for e in evaluated:
        at = e.get('asset_type', 'unknown')
        if at not in asset_types:
            asset_types[at] = {'total': 0, 'wins': 0, 'losses': 0, 'partials': 0, 'win_rate': 0.0}
        asset_types[at]['total'] += 1
        v = e.get('final_verdict')
        if v == 'win':
            asset_types[at]['wins'] += 1
        elif v == 'loss':
            asset_types[at]['losses'] += 1
        elif v == 'partial':
            asset_types[at]['partials'] += 1
    for at, d in asset_types.items():
        d['win_rate'] = round(d['wins'] / d['total'] * 100, 1) if d['total'] > 0 else 0.0

    # Recent picks (last 10, evaluated + tracking)
    all_agent = [e for e in entries if e.get('agent_id') == agent_id]
    all_agent.sort(key=lambda x: x.get('date', ''), reverse=True)
    recent = []
    for e in all_agent[:10]:
        recent.append({
            'id': e.get('id'),
            'date': e.get('date'),
            'ticker': e.get('ticker'),
            'conviction': e.get('conviction'),
            'final_verdict': e.get('final_verdict'),
            'peak_return_pct': e.get('peak_return_pct'),
            'was_executed': e.get('was_executed', False),
        })

    # Patterns
    strengths = []
    weaknesses = []
    adjustment_suggestions = []

    # Strengths
    for at, d in asset_types.items():
        if d['total'] >= 3 and d['win_rate'] >= 60:
            strengths.append(f"{at.capitalize()} picks win rate {d['win_rate']}% — continue focus")

    for c, d in conviction_cal.items():
        if d['total'] >= 2 and int(c) >= 7 and d['win_rate'] >= 60:
            strengths.append(f"Conviction-{c} picks win {d['win_rate']}% — maintain high-conviction approach")

    # Weaknesses
    if win_rate < 40:
        weaknesses.append(f"Win rate {win_rate}% below breakeven — review thesis quality")
    if avg_horizon_return < 0:
        weaknesses.append(f"Negative avg horizon return ({avg_horizon_return}%)")

    for at, d in asset_types.items():
        if d['total'] >= 3 and d['win_rate'] < 30:
            weaknesses.append(f"{at.capitalize()} picks only {d['win_rate']}% win rate — consider avoiding")

    return {
        'agent_id': agent_id,
        'last_updated': '2026-06-09',
        'total_evaluated': total,
        'total_tracking': len(tracking),
        'wins': len(wins),
        'losses': len(losses),
        'partials': len(partials),
        'win_rate': win_rate,
        'partial_rate': partial_rate,
        'loss_rate': loss_rate,
        'avg_horizon_return_pct': avg_horizon_return,
        'avg_peak_return_pct': avg_peak_return,
        'track_record_modifier': track_record_modifier,
        'modifier_frozen': executed_count < MODIFIER_UNFREEZE_THRESHOLD,
        'executed_trades': executed_count,
        'modifier_note': (f"FROZEN at 1.0x until {MODIFIER_UNFREEZE_THRESHOLD} executed trades "
                          f"under corrected metric (currently {executed_count}). Win rates below are "
                          "informational only — computed on the deprecated peak-touched-target metric."
                          if executed_count < MODIFIER_UNFREEZE_THRESHOLD else "active"),
        'conviction_calibration': conviction_cal,
        'by_asset_type': asset_types,
        'recent_picks': recent,
        'patterns': {
            'strengths': strengths,
            'weaknesses': weaknesses,
            'adjustment_suggestions': adjustment_suggestions,
        }
    }


def main():
    with open(OUTCOMES_PATH) as f:
        data = json.load(f)

    entries = get_all_entries(data)

    for agent_id in AGENTS:
        scorecard = build_scorecard(agent_id, entries)
        path = f"{SCORECARDS_DIR}/{agent_id}.json"
        tmp = path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(scorecard, f, indent=2)

        import subprocess
        result = subprocess.run(['jq', '.', tmp], capture_output=True)
        if result.returncode != 0:
            print(f"ERROR: {agent_id} scorecard invalid JSON")
            continue

        import os
        os.rename(tmp, path)
        print(f"✓ {agent_id}: {scorecard['total_evaluated']} evaluated, "
              f"win_rate={scorecard['win_rate']}%, "
              f"track_record={scorecard['track_record_modifier']}x")


if __name__ == '__main__':
    main()
