#!/usr/bin/env python3
"""
Price reconciliation — REMEDIATION-PLAN.md Phase 0.3

Audits every fill in state/trade-log.json and state/portfolio.json against
actual OHLC data (yfinance). A fill is valid if it lies within the trade
date's [low, high] range (with a small tolerance for pre/post-market fills).
Out-of-range fills are flagged and, with --apply, corrected to that day's
official close. Realized P&L, leaderboard totals, and the SPY baseline in
historical entries are recomputed from corrected prices.

Run on the VPS (needs network + yfinance):
    pip install yfinance --break-system-packages   # if missing
    python3 scripts/reconcile_prices.py --dry-run
    python3 scripts/reconcile_prices.py --apply
    python3 scripts/regen_scorecards.py            # after --apply

Live state only — never touches backtest/.
"""

import argparse
import json
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state"
SPY_INCEPTION = 634.09          # SPY close 2026-03-27 (corrected 2026-07-02)
FABRICATED_BASELINE = 555.66    # value to replace wherever found
TOLERANCE = 0.01                # 1% beyond [low, high] allowed (extended hours)

_ohlc_cache: dict[str, "object"] = {}


def get_history(ticker: str):
    import yfinance as yf
    if ticker not in _ohlc_cache:
        _ohlc_cache[ticker] = yf.Ticker(ticker).history(
            start="2026-03-01", end=datetime.now().strftime("%Y-%m-%d"),
            auto_adjust=False)
    return _ohlc_cache[ticker]


def ohlc_for(ticker: str, date_str: str):
    """OHLC for date, falling back to nearest prior trading day (<=4 days)."""
    hist = get_history(ticker)
    if hist is None or hist.empty:
        return None, None
    d = datetime.strptime(date_str, "%Y-%m-%d")
    for _ in range(5):
        key = d.strftime("%Y-%m-%d")
        rows = hist.loc[hist.index.strftime("%Y-%m-%d") == key]
        if len(rows):
            r = rows.iloc[0]
            return {"open": float(r["Open"]), "high": float(r["High"]),
                    "low": float(r["Low"]), "close": float(r["Close"])}, key
        d -= timedelta(days=1)
    return None, None


def check_fill(ticker, date, price, findings, context):
    ohlc, actual_date = ohlc_for(ticker, date)
    if ohlc is None:
        findings.append({"ticker": ticker, "date": date, "price": price,
                         "context": context, "status": "NO_DATA",
                         "corrected": None})
        return None
    lo = ohlc["low"] * (1 - TOLERANCE)
    hi = ohlc["high"] * (1 + TOLERANCE)
    status = "OK" if lo <= price <= hi else "OUT_OF_RANGE"
    corrected = None if status == "OK" else round(ohlc["close"], 2)
    findings.append({"ticker": ticker, "date": date, "price": price,
                     "context": context, "status": status,
                     "trading_day": actual_date, "day_low": round(ohlc["low"], 2),
                     "day_high": round(ohlc["high"], 2),
                     "day_close": round(ohlc["close"], 2),
                     "corrected": corrected})
    return corrected


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    trade_log_path = STATE / "trade-log.json"
    portfolio_path = STATE / "portfolio.json"
    tl = json.loads(trade_log_path.read_text())
    pf = json.loads(portfolio_path.read_text())
    findings = []

    # ── 1. trade-log fills ────────────────────────────────────────────────
    for t in tl.get("trades", []):
        if t.get("action") not in ("buy", "sell") or t.get("asset_type") == "crypto":
            continue
        price_key = next((k for k in ("price", "sell_price", "buy_price", "fill_price")
                          if isinstance(t.get(k), (int, float))), None)
        if price_key is None or not t.get("ticker") or not t.get("date"):
            findings.append({"ticker": t.get("ticker"), "date": t.get("date"),
                             "price": None, "context": f"trade-log #{t.get('id')} {t.get('action')}",
                             "status": "SKIPPED_NO_PRICE_FIELD", "corrected": None})
            continue
        corrected = check_fill(t["ticker"], t["date"], t[price_key], findings,
                               f"trade-log #{t.get('id')} {t['action']}")
        if corrected is not None and args.apply:
            t["price_original"] = t[price_key]
            t[price_key] = corrected
            t["price_corrected_note"] = "reconciled 2026-07-02 vs actual OHLC"
            if isinstance(t.get("shares"), (int, float)):
                if t["action"] == "buy":
                    t["total_cost"] = round(corrected * t["shares"], 2)
                else:
                    t["total_proceeds"] = round(corrected * t["shares"], 2)

    # sell P&L recompute (entry may also have been corrected)
    if args.apply:
        buy_price = {}
        for t in tl.get("trades", []):
            if t.get("action") == "buy" and isinstance(t.get("price"), (int, float)):
                buy_price[(t.get("ticker"), t.get("date"))] = t["price"]
        for t in tl.get("trades", []):
            if (t.get("action") == "sell" and isinstance(t.get("entry_price"), (int, float))
                    and isinstance(t.get("price"), (int, float))
                    and isinstance(t.get("shares"), (int, float))):
                ep = buy_price.get((t.get("ticker"), t.get("entry_date")), t["entry_price"])
                t["entry_price"] = ep
                t["pnl"] = round((t["price"] - ep) * t["shares"], 2)
                t["pnl_pct"] = round((t["price"] / ep - 1) * 100, 2)

    # ── 2. portfolio open + sold positions ────────────────────────────────
    for p in pf.get("positions", []):
        c = check_fill(p["ticker"], p["entry_date"], p["entry_price"],
                       findings, "portfolio open position entry")
        if c is not None and args.apply:
            p["entry_price_original"] = p["entry_price"]
            p["entry_price"] = c
    for p in pf.get("sold_positions", []):
        ce = check_fill(p["ticker"], p["entry_date"], p["entry_price"],
                        findings, "sold position entry")
        cs = check_fill(p["ticker"], p["sell_date"], p["sell_price"],
                        findings, "sold position exit")
        if args.apply and (ce is not None or cs is not None):
            if ce is not None:
                p["entry_price_original"] = p["entry_price"]
                p["entry_price"] = ce
            if cs is not None:
                p["sell_price_original"] = p["sell_price"]
                p["sell_price"] = cs
            p["realized_pnl"] = round((p["sell_price"] - p["entry_price"]) * p["shares"], 2)
            p["realized_pnl_pct"] = round((p["sell_price"] / p["entry_price"] - 1) * 100, 2)

    # ── 3. SPY baseline in historical entries ─────────────────────────────
    baseline_fixes = 0
    def fix_baseline(obj):
        nonlocal baseline_fixes
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "spy_inception_price" and v == FABRICATED_BASELINE:
                    obj[k] = SPY_INCEPTION
                    baseline_fixes += 1
                else:
                    fix_baseline(v)
        elif isinstance(obj, list):
            for v in obj:
                fix_baseline(v)
    if args.apply:
        fix_baseline(tl)

    # ── 4. report / write ─────────────────────────────────────────────────
    bad = [f for f in findings if f["status"] == "OUT_OF_RANGE"]
    nodata = [f for f in findings if f["status"] == "NO_DATA"]
    skipped = [f for f in findings if f["status"] == "SKIPPED_NO_PRICE_FIELD"]
    print(f"Checked {len(findings)} fills: {len(findings)-len(bad)-len(nodata)-len(skipped)} OK, "
          f"{len(bad)} out-of-range, {len(nodata)} no-data, {len(skipped)} skipped (no price field)")
    for f in bad:
        print(f"  BAD {f['context']}: {f['ticker']} {f['date']} recorded "
              f"{f['price']} vs range [{f['day_low']}, {f['day_high']}] "
              f"-> correct to close {f['corrected']}")
    for f in nodata:
        print(f"  NO_DATA {f['context']}: {f['ticker']} {f['date']} — check manually")

    report = STATE / f"reconciliation-{datetime.now().strftime('%Y%m%d')}.json"
    report.write_text(json.dumps(findings, indent=2))
    print(f"Report: {report}")

    if args.apply:
        for path in (trade_log_path, portfolio_path):
            shutil.copy(path, path.with_suffix(".json.pre-reconcile.bak"))
        trade_log_path.write_text(json.dumps(tl, indent=2))
        # recompute portfolio realized totals note
        pf["reconciliation_note"] = (f"Prices reconciled {datetime.now().date()} vs actual OHLC; "
                                     f"{len(bad)} fills corrected, {baseline_fixes} baseline fixes in trade-log. "
                                     "Backups: *.pre-reconcile.bak")
        portfolio_path.write_text(json.dumps(pf, indent=2))
        print(f"APPLIED. {len(bad)} fills corrected, {baseline_fixes} baseline fixes. "
              "Now run: python3 scripts/regen_scorecards.py")
    else:
        print("DRY RUN — nothing written. Re-run with --apply to correct.")

    return 0 if not nodata else 1


if __name__ == "__main__":
    sys.exit(main())
