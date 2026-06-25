#!/usr/bin/env python3
"""Alpha Firm daily report — live prices from today's log + real-time data."""

import re, json, urllib.request, ssl, sys
from datetime import datetime

LOG_FILE = sys.argv[1] if len(sys.argv) > 1 else "/home/clawd/alpha-firm/logs/2026-05-06.log"
PORTFOLIO = sys.argv[2] if len(sys.argv) > 2 else "/home/clawd/alpha-firm/state/portfolio.json"
LEADERBOARD = sys.argv[3] if len(sys.argv) > 3 else "/home/clawd/alpha-firm/state/leaderboard.json"

today_str = datetime.now().strftime("%B %d, %Y")

# ── 1. READ LOG ───────────────────────────────────────────────────────
try:
    with open(LOG_FILE) as f:
        log = f.read()
except Exception as e:
    print(f"ERROR: Cannot read log file {LOG_FILE}: {e}")
    exit(1)

# ── 2. PARSE LOG — GET ALL PRICE REFRESHES, USE LAST ONE ─────────────
# Find all "Refreshing prices for N positions..." blocks
refresh_blocks = re.split(r'Refreshing prices for \d+ positions\.\.\.', log)

# For each block, extract ticker prices and NAV
# We'll take the LAST complete block
all_blocks = []
for block in refresh_blocks[1:]:  # skip empty first split
    prices = re.findall(
        r'^\s+(\w+): \$([\d.]+)\s*\(([+\-]?[\d.]+)% from entry\) — (\d+) shares = \$([\d,.]+)',
        block, re.MULTILINE
    )
    nav_m = re.search(r'NAV: [^\$]*\$?([\d,.]+)\s*→\s*\$?([\d,.]+)', block)
    hwm_m = re.search(r'New high water mark: \$?([\d,.]+)', block)
    spy_m = re.search(r'SPY Benchmark: \$?([\d,.]+)\s*\(([+\-]?[\d.]+)%', block)
    ts_m = re.search(r'\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]', block)
    
    if prices:
        all_blocks.append({
            'prices': prices,
            'nav': float(nav_m.group(2).replace(',','')) if nav_m else 0,
            'hwm': float(hwm_m.group(1).replace(',','')) if hwm_m else None,
            'spy_price': float(spy_m.group(1).replace(',','')) if spy_m else 0,
            'spy_pct': spy_m.group(2) if spy_m else '0',
            'timestamp': ts_m.group(1) if ts_m else ''
        })

# Use the LAST refresh block
if not all_blocks:
    print("ERROR: No price refresh blocks found in log")
    exit(1)

latest = all_blocks[-1]
price_lines = latest['prices']
nav = latest['nav']
hwm = latest['hwm']
spy_price = latest['spy_price']
spy_pct = latest['spy_pct']

# ── 3. PARSE PORTFOLIO FOR AGENT/NOTES ────────────────────────────────
try:
    with open(PORTFOLIO) as f:
        portfolio = json.load(f)
except:
    portfolio = {'positions': [], 'sold_positions': [], 'cash': 4418.13}

cash = portfolio.get('cash', 4418.13)

agent_map = {}
stop_map = {}
earnings_map = {}
catalyst_map = {}
entry_map = {}

for p in portfolio.get('positions', []):
    ticker = p['ticker']
    agent_map[ticker] = p.get('agent', 'unknown')
    entry_map[ticker] = p.get('entry_price', 0)
    note = p.get('latest_price_note', '')

    # Extract earnings date
    earn_m = re.search(r'earnings\s+(May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+', note, re.IGNORECASE)
    if not earn_m:
        earn_m = re.search(r'EARNINGS\s+([A-Za-z]+\s+\d+)', note)
    earnings_map[ticker] = earn_m.group(0) if earn_m else None

    # Extract stop — simple: "stop" followed by "$" and digits, anywhere in note
    stop_m = re.search(r'stop\s+\$?([\d.]+)', note, re.IGNORECASE)
    stop_map[ticker] = float(stop_m.group(1).rstrip('.')) if stop_m else None

    # Extract catalyst — only actual upcoming events, NOT stop prices
    # Look for: Analyst Day, earnings, FDA, PDUFA, FOMC, launch, ruling, trial, data read
    cat_patterns = [
        r'Analyst Day[^.]*',
        r'EARNINGS\s+[A-Za-z]+\s+\d+[^.]*',
        r'(?:FDA|PDUFA|FOMC)[^.]*',
        r'(?:launch|ruling|trial|data read|catalyst)[^.]*',
    ]
    catalyst_map[ticker] = None
    for pat in cat_patterns:
        cat_m = re.search(pat, note, re.IGNORECASE)
        if cat_m:
            catalyst_map[ticker] = cat_m.group(0).strip()[:120]
            break

# ── 4. FETCH LIVE MARKET DATA ──────────────────────────────────────────
def fetch_url(url, timeout=10):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.read().decode('utf-8', errors='ignore')
    except:
        return None

# BTC — primary: CoinGecko (browser-only), fallback: CoinMarketCap
btc_price = None
btc_chg = None
btc_source = None

# Try CoinGecko first (may 403 in headless urllib)
try:
    html = fetch_url('https://www.coingecko.com/en/coins/bitcoin', timeout=15)
    if html and 'bitcoin' in html.lower():
        m = re.search(r'current_price[^>]*?>([\d,]+)', html)
        if m:
            btc_price = float(m.group(1).replace(',',''))
            btc_source = 'CoinGecko'
except:
    pass

# Fallback: CoinMarketCap
if not btc_price:
    try:
        html = fetch_url('https://coinmarketcap.com/currencies/bitcoin/', timeout=10)
        if html:
            m = re.search(r'([\d,]+\.[\d]{2})</span>', html)
            if m:
                btc_price = float(m.group(1).replace(',',''))
            chg_m = re.search(r'change[^>]*?([+\-]?[0-9]+\.[0-9]+)', html)
            if chg_m:
                btc_chg = float(chg_m.group(1))
            btc_source = 'CoinMarketCap (fallback)'
    except:
        pass

# ── 5. BUILD POSITIONS LIST (DEDUPLICATED — ONE PER TICKER) ──────────
# Use the latest refresh block prices; if ticker appears multiple times (shouldn't), take last
ticker_seen = {}
for m in price_lines:
    ticker = m[0]
    ticker_seen[ticker] = m  # last one wins

positions = []
total_pos_value = 0.0

for ticker, m in ticker_seen.items():
    _, curr_str, pnl_str, shares_str, value_str = m
    pnl = float(pnl_str)
    shares = int(shares_str)
    value = float(value_str.replace(',',''))
    curr_price = value / shares if shares else 0
    agent = agent_map.get(ticker, 'unknown')
    entry = entry_map.get(ticker, curr_price)
    stop = stop_map.get(ticker, None)

    # Distance to stop (or default 7% if none)
    stop_dist = None
    if stop:
        stop_dist = (curr_price - stop) / stop * 100
    elif entry:
        default_stop = entry * 0.93
        stop_dist = (curr_price - default_stop) / default_stop * 100

    positions.append({
        'ticker': ticker,
        'price': curr_price,
        'pnl': pnl,
        'shares': shares,
        'value': value,
        'agent': agent,
        'stop': stop,
        'stop_dist': stop_dist,
        'earnings': earnings_map.get(ticker),
        'catalyst': catalyst_map.get(ticker),
        'entry': entry
    })
    total_pos_value += value

positions.sort(key=lambda x: x['pnl'], reverse=True)

# ── 6. OUTPUT ─────────────────────────────────────────────────────────
print(f"ALPHA FIRM REPORT — {today_str}")
print("=" * 70)
print()

# MARKET SNAP
print("MARKET SNAP")
print("-" * 45)
btc_str = f"${btc_price:,.2f} ({btc_chg:+.2f}%)" if btc_price else "[fetch failed]"
src_note = f" [{btc_source}]" if btc_source else ""
print(f"  BTC:   {btc_str}{src_note}")
print(f"  SPY:   ${spy_price:,.2f} ({spy_pct}% from inception)")
if hwm:
    print(f"  NAV:   ${nav:,.2f}  ← HIGH WATER MARK!")
else:
    print(f"  NAV:   ${nav:,.2f}")
print(f"  Cash:  ${cash:,.2f}  |  Positions: ${total_pos_value:,.2f}")
print()

# POSITIONS
print("POSITIONS (closing prices from today's log)")
print("-" * 70)
print(f"{'Ticker':<7} {'Price':>9} {'P&L%':>8} {'Shs':>4} {'Value':>10} {'Agent':<12} Risk / Catalyst")
print("-" * 78)
for p in positions:
    # Build risk/catalyst string
    risk_parts = []
    if p['stop']:
        risk_parts.append(f"Stop ${p['stop']:.2f}")
    if p['earnings']:
        risk_parts.append(f"⚠️ {p['earnings']}")
    elif p['catalyst']:
        risk_parts.append(p['catalyst'][:50])
    risk_str = ' | '.join(risk_parts) if risk_parts else '—'
    print(f"{p['ticker']:<7} ${p['price']:>8.2f} {p['pnl']:>+7.1f}% {p['shares']:>4} ${p['value']:>9,.2f} {p['agent']:<12} {risk_str}")
print("-" * 78)
print(f"{'TOTAL':<7} {' ':>9} {' ':>8} {' ':>4} ${total_pos_value:>9,.2f}")
print()

# CATALYST / RISK SECTION — grouped by ticker
tickers_with_risk = [p for p in positions
                     if p['earnings'] or (p['stop'] and p['stop_dist'] is not None)]

if tickers_with_risk:
    print("⚠️  CATALYST / RISK")
    print("-" * 50)
    for p in tickers_with_risk:
        if p['earnings']:
            print(f"  ⏰ {p['ticker']}: {p['earnings']}")
        elif p['stop'] and p['stop_dist'] is not None:
            flag = "🚨" if p['stop_dist'] < 10 else "⚠️"
            print(f"  {flag} {p['ticker']}: Stop ${p['stop']:.2f} — {p['stop_dist']:.1f}% buffer")
    print()

# AGENT STANDINGS
try:
    with open(LEADERBOARD) as f:
        lb = json.load(f)
    print("AGENT STANDINGS")
    print("-" * 60)
    print(f"{'Agent':<12} {'Picks':>6} {'Exec':>5} {'W':>3} {'L':>3} {'Realized P&L':>14} {'Streak'}")
    print("-" * 65)
    for agent_name in ['sentiment', 'contrarian', 'quant', 'macro', 'crypto', 'catalyst']:
        a = lb.get(agent_name, {})
        picks = a.get('picks', 0)
        execd = a.get('picks_executed', 0)
        wins = a.get('wins', 0)
        losses = a.get('losses', 0)
        pnl = a.get('total_pnl', 0)
        streak = a.get('current_streak', 0)
        streak_str = f"{streak:+,d}" if streak != 0 else "—"
        pnl_str = f"${pnl:+.2f}"
        print(f"{agent_name.capitalize():<12} {picks:>6} {execd:>5} {wins:>3} {losses:>3} {pnl_str:>14} {streak_str}")
    print()
    reward = lb.get('reward_pool_usd', 0)
    if reward:
        print(f"Reward pool: ${reward:.2f}")
except Exception as e:
    print(f"[Agent standings unavailable: {e}]")

# SOLD THIS MONTH
sold = portfolio.get('sold_positions', [])
current_month = datetime.now().strftime('%Y-%m')
recent_sold = [s for s in sold if s.get('sell_date', '')[:7] == current_month]
if recent_sold:
    print()
    print("SOLD THIS MONTH")
    print("-" * 50)
    for s in recent_sold:
        pnl = s.get('realized_pnl', 0)
        pnl_pct = s.get('realized_pnl_pct', 0)
        print(f"  {s['ticker']}: {s['shares']}sh @ ${s.get('sell_price', 0):.2f} — {pnl:+.2f} ({pnl_pct:+.1f}%)")
        if s.get('reason'):
            print(f"    → {s['reason'][:80]}")

print()
print(f"Report generated: {datetime.now().strftime('%I:%M %p ET')}")
print(f"Log: {LOG_FILE}")
