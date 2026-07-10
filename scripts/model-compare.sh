#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Alpha Firm — Compare sessions by model provider.
#
#   ./scripts/model-compare.sh              # all recorded sessions
#   ./scripts/model-compare.sh 2026-07-10   # only that date
#
# Reads state/trade-log.json → decisions[], grouped by model_provider (recorded by
# run-check.sh since the model toggle). Decisions from before the toggle show as
# "(unrecorded)" — those all ran on GLM with NO working search/fundamentals MCP,
# so don't compare them against post-fix runs.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$DIR" "${1:-}" <<'PY'
import json, sys, statistics
root, only_date = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "")
d = json.load(open(f"{root}/state/trade-log.json"))
rows = d.get("decisions", [])
if only_date:
    rows = [r for r in rows if str(r.get("date", ""))[:10] == only_date]
if not rows:
    print("no decisions found"); sys.exit(0)

groups = {}
for r in rows:
    groups.setdefault(r.get("model_provider") or "(unrecorded)", []).append(r)

print(f"{'provider':<14} {'sess':>4} {'buy':>4} {'pass':>5} {'convMean':>9} {'convMax':>8} {'#conv>=6':>9} {'#conv>=8':>9}")
print("─" * 76)
for prov, rs in sorted(groups.items()):
    convs = []
    for r in rs:
        for a in (r.get("agents_reviewed") or {}).values():
            c = a.get("conviction")
            if isinstance(c, (int, float)):
                convs.append(c)
    buys = sum(1 for r in rs if str(r.get("decision", "")).lower() == "buy")
    print(f"{prov:<14} {len(rs):>4} {buys:>4} {len(rs)-buys:>5} "
          f"{(statistics.mean(convs) if convs else 0):>9.2f} {(max(convs) if convs else 0):>8} "
          f"{sum(1 for c in convs if c >= 6):>9} {sum(1 for c in convs if c >= 8):>9}")

print("\nper-session detail (newest last):")
for r in rows:
    convs = {k: v.get("conviction") for k, v in (r.get("agents_reviewed") or {}).items()}
    top = max(convs.values()) if convs else "-"
    print(f"  {r.get('date')} {r.get('session'):<10} {str(r.get('decision','')).upper():<5} "
          f"model={r.get('model_provider') or '(unrecorded)':<12} topConv={top}  {convs}")
PY
