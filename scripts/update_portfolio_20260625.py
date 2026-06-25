#!/usr/bin/env python3
"""Update portfolio.json for 2026-06-25 premarket: fresh prices, MU stop reset, NAV/alpha."""
import json

PORT = '/home/clawd/alpha-firm/state/portfolio.json'
TODAY = '2026-06-25'
TS = '2026-06-25T11:00:02Z'
SPY_INCEPTION = 555.66

# Fresh prices (Finnhub, 2026-06-25)
PRICES = {
    'CAT': 994.45, 'SYK': 313.68, 'TGLS': 45.31, 'FCN': 144.35,
    'NCLH': 21.01, 'MU': 1048.51, 'FDX': 316.83, 'CLSK': 16.23,
}

NOTES = {
    'CAT': f"2026-06-25 PREMARKET: ${PRICES['CAT']:.2f} (+{(PRICES['CAT']/828.79-1)*100:.1f}% from $828.79). Trailing stop $940 intact. Iran/AI backlog record. Earnings Aug 4. HOLD.",
    'SYK': f"2026-06-25 PREMARKET: ${PRICES['SYK']:.2f} (+{(PRICES['SYK']/294.50-1)*100:.1f}% from $294.50). Healthcare defensive. HOLD.",
    'TGLS': f"2026-06-25 PREMARKET: ${PRICES['TGLS']:.2f} (+{(PRICES['TGLS']/38.61-1)*100:.1f}% from $38.61). Let winner run. Ex-div Jun 30. HOLD.",
    'FCN': f"2026-06-25 PREMARKET: ${PRICES['FCN']:.2f} ({(PRICES['FCN']/153.18-1)*100:+.1f}% from $153.18). Within 12% standard stop. Thesis intact. HOLD.",
    'NCLH': f"2026-06-25 PREMARKET: ${PRICES['NCLH']:.2f} (+{(PRICES['NCLH']/20.22-1)*100:.1f}% from $20.22). Citi PT $25. Stop $19.00. HOLD.",
    'MU': f"2026-06-25 PREMARKET: ${PRICES['MU']:.2f} ({(PRICES['MU']/1055.89-1)*100:+.1f}% from $1055.89). EARNINGS BEAT Jun24 (rev/EPS beat, 'saved tech rally', HBM/AI strong). Flushed to $991, recovered to $1048. Thesis confirmed. Stop reset $1050->$985 (below earnings low $991). HOLD.",
    'FDX': f"2026-06-25 PREMARKET: ${PRICES['FDX']:.2f} ({(PRICES['FDX']/331.82-1)*100:+.1f}% from $331.82). EARNINGS BEAT Jun23 (EPS $6.31 vs $6.02, rev beat) but fell on margin/Freight-spinoff 'near-term noise' (BofA defends momentum). Above $315 stop. HOLD.",
    'CLSK': f"2026-06-25 PREMARKET: ${PRICES['CLSK']:.2f} ({(PRICES['CLSK']/17.36-1)*100:+.1f}% from $17.36). BTC ${61104:.0f} (>$60K falsification). Jun 26 production release catalyst TOMORROW. Stop $14.00. HOLD into catalyst.",
}

with open(PORT) as f:
    p = json.load(f)

cash = p['cash']
positions_value = 0.0
for pos in p['positions']:
    t = pos['ticker']
    price = PRICES[t]
    pos['latest_price'] = price
    pos['latest_price_note'] = NOTES[t]
    positions_value += pos['shares'] * price

nav = cash + positions_value
spy_price = 733.24
spy_return = (spy_price / SPY_INCEPTION - 1) * 100
pnl_pct = (nav / 10000.0 - 1) * 100
alpha = pnl_pct - spy_return

# Reset MU stop to $985
for pos in p['positions']:
    if pos['ticker'] == 'MU':
        pos['stop_loss'] = 985

p['nav'] = round(nav, 2)
p['last_updated'] = TS
p['spy_closing_price'] = spy_price
p['spy_return_pct'] = round(spy_return, 2)
p['portfolio_pnl_pct'] = round(pnl_pct, 2)
p['alpha'] = round(alpha, 2)
p['nav_note'] = (f"NAV 2026-06-25 PREMARKET: ${nav:,.2f}. Cash ${cash:,.2f}. "
                f"8 positions: CAT(+{(994.45/828.79-1)*100:.1f}% stop$940), SYK(+6.5%), TGLS(+17.4%), "
                f"FCN(-5.8%), NCLH(+3.9% stop$19), MU(beat, stop$985), FDX(beat, stop$315), "
                f"CLSK(-6.5% Jun26 catalyst, stop$14). SPY ${spy_price} (+{spy_return:.2f}%). "
                f"Portfolio {pnl_pct:+.2f}%. Alpha {alpha:+.2f}%. PASS — no candidate cleared 8.0 bull-market bar. "
                f"KMX killed in debate (2+ unrebutted weaknesses: no 35-day catalyst, valuation). NKE below threshold.")

with open(PORT + '.tmp', 'w') as f:
    json.dump(p, f, indent=2)
print(f"NAV=${nav:,.2f} | cash=${cash:,.2f} | PnL={pnl_pct:+.2f}% | SPY={spy_return:+.2f}% | alpha={alpha:+.2f}%")
print("Wrote portfolio.json.tmp")
