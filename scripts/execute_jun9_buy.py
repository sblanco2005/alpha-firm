#!/usr/bin/env python3
"""Execute BUY MAR — update all state files for 2026-06-09 premarket."""
import json
import os

BASE = '/home/clawd/alpha-firm/state'

# ── Trade details ──────────────────────────────────────────────────────
TRADE = {
    'ticker': 'MAR',
    'asset_type': 'stock',
    'shares': 2,
    'price': 391.62,
    'total_cost': 783.24,
    'agent': 'quant',
    'session': 'premarket',
    'date': '2026-06-09',
    'stop_loss': 381.00,
    'target_price': 417.00,
    'thesis': (
        '52-week high breakout consolidation above $387 support. RSI 67.98, '
        'above 20/50/200 SMA. DBS Buy PT $417 (+6.5%). IBD Stock of Day. '
        'Q1 EPS $2.72 beat. Consumer Discretionary (0% portfolio exposure). '
        'Pre-identified setup June 8. Debate: all bear attacks rebutted → BUY_ELIGIBLE.'
    ),
    'pm_scores': {
        'evidence': 8, 'falsifiability': 8, 'risk_reward': 8,
        'portfolio_impact': 8, 'signal_confirmation': 8, 'execution_readiness': 9
    },
    'raw_score': 8.10,
    'track_record_modifier': 1.0,
    'fundamental_modifier': 0.95,
    'debate_modifier': 1.05,
    'final_score': 8.09,
}

# ── Premarket prices as of June 9, 2026 ───────────────────────────────
CURRENT_PRICES = {
    'CAT':  862.00,
    'META': 593.59,
    'AAPL': 300.96,
    'SYK':  305.66,
    'XLE':   58.38,
    'TGLS':  42.00,
    'FCN':  153.50,
    'IREN':  63.63,  # premarket +8.9% on AI infrastructure news (APLD 210MW lease)
    'STRL': 880.00,
    'MAR':  391.62,  # new position
}

SPY_PREMARKET  = 743.69
SPY_INCEPTION  = 634.09  # corrected 2026-07-02 (was fabricated 555.66)
SPY_RETURN_PCT = round((SPY_PREMARKET / SPY_INCEPTION - 1) * 100, 2)  # 33.85%
VIX            = 18.56


def atomic_write(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)
    os.rename(tmp, path)
    print(f'  ✓ {os.path.basename(path)}')


# ═══════════════════════════════════════════════════════════════════════
# 1. PORTFOLIO.JSON
# ═══════════════════════════════════════════════════════════════════════
def update_portfolio():
    path = f'{BASE}/portfolio.json'
    with open(path) as f:
        data = json.load(f)

    data['cash'] = round(data['cash'] - TRADE['total_cost'], 2)

    # Update existing positions
    for pos in data['positions']:
        t = pos['ticker']
        if t in CURRENT_PRICES:
            pos['latest_price'] = CURRENT_PRICES[t]

    # IREN conditional sell: update btc_close_today
    for pos in data['positions']:
        if pos['ticker'] == 'IREN':
            pos['conditional_sell']['btc_close_today'] = 63414.08
            pos['latest_price_note'] = (
                '2026-06-09 premarket: $63.63 (+8.9% on APLD 210MW AI infrastructure news '
                'driving sector bid). BTC $63,414 — well above $61K conditional sell threshold. '
                'HOLD. Microsoft/$9.7B GPU deal + investment-grade financing fully validating AI pivot.'
            )

    # Add MAR position
    mar_pos = {
        'ticker': 'MAR',
        'asset_type': 'stock',
        'shares': TRADE['shares'],
        'entry_price': TRADE['price'],
        'entry_date': TRADE['date'],
        'agent': TRADE['agent'],
        'latest_price': TRADE['price'],
        'latest_price_note': (
            '2026-06-09 premarket entry. 52-week high breakout consolidation. '
            'DBS $417 target. Stop $381. Thesis: momentum continuation + DBS analyst target.'
        ),
        'stop_loss': TRADE['stop_loss'],
        'mode': 'simulated',
    }
    data['positions'].append(mar_pos)

    # Recompute NAV
    position_val = sum(
        pos['latest_price'] * pos['shares']
        for pos in data['positions']
    )
    nav = round(data['cash'] + position_val, 2)
    pnl_pct = round((nav / 10000 - 1) * 100, 2)
    alpha = round(pnl_pct - SPY_RETURN_PCT, 2)

    data['nav'] = nav
    data['portfolio_pnl_pct'] = pnl_pct
    data['alpha'] = alpha
    data['spy_closing_price'] = SPY_PREMARKET
    data['spy_return_pct'] = SPY_RETURN_PCT
    data['last_updated'] = '2026-06-09T11:30:00Z'
    data['nav_note'] = (
        f'NAV 2026-06-09 PREMARKET: ${nav:,.2f}. Cash ${data["cash"]:,.2f}. '
        f'Positions: CAT $862 (+4.0%), META $593.59 (-4.6%), AAPL $300.96 (+7.2%), '
        f'SYK $305.66 (+3.8%), XLE $58.38 (+1.3%), TGLS $42 (+8.8%), FCN $153.50 (+0.2%), '
        f'IREN $63.63 (+4.7%), STRL $880 (0.0%), MAR $391.62 (NEW). '
        f'SPY ${SPY_PREMARKET} (+{SPY_RETURN_PCT}%). Portfolio +{pnl_pct}%. Alpha: {alpha}%.'
    )

    atomic_write(path, data)
    print(f'    NAV: ${nav:,.2f} | P&L: +{pnl_pct}% | Alpha: {alpha}%')
    return nav, pnl_pct, alpha


# ═══════════════════════════════════════════════════════════════════════
# 2. DAILY-STATE.JSON
# ═══════════════════════════════════════════════════════════════════════
def update_daily_state():
    path = f'{BASE}/daily-state.json'
    with open(path) as f:
        data = json.load(f)

    data['bought'] = True
    data['last_buy'] = {
        'ticker': TRADE['ticker'],
        'shares': TRADE['shares'],
        'price': TRADE['price'],
        'session': TRADE['session'],
        'agent': TRADE['agent'],
    }

    atomic_write(path, data)


# ═══════════════════════════════════════════════════════════════════════
# 3. TRADE-LOG.JSON
# ═══════════════════════════════════════════════════════════════════════
def update_trade_log():
    path = f'{BASE}/trade-log.json'
    with open(path) as f:
        data = json.load(f)

    next_id = data.get('total_trades', 50) + 1

    entry = {
        'id': next_id,
        'date': TRADE['date'],
        'session': TRADE['session'],
        'action': 'buy',
        'ticker': TRADE['ticker'],
        'asset_type': TRADE['asset_type'],
        'shares': TRADE['shares'],
        'price': TRADE['price'],
        'total_cost': TRADE['total_cost'],
        'agent': TRADE['agent'],
        'thesis': TRADE['thesis'],
        'pm_scores': TRADE['pm_scores'],
        'raw_score': TRADE['raw_score'],
        'track_record_modifier': TRADE['track_record_modifier'],
        'fundamental_modifier': TRADE['fundamental_modifier'],
        'debate_modifier': TRADE['debate_modifier'],
        'final_score': TRADE['final_score'],
        'vix_level': VIX,
        'stop_loss': TRADE['stop_loss'],
        'target_price': TRADE['target_price'],
        'debate_result': 'buy_eligible',
        'mode': 'simulated',
        'position_management': {
            'AAPL': f'HOLD — premarket ${CURRENT_PRICES["AAPL"]} >> $292.01 trigger',
            'META': f'HOLD — premarket ${CURRENT_PRICES["META"]} >> $580 stop',
            'IREN': f'HOLD — BTC $63,414 >> $61K conditional sell threshold',
            'STRL': f'HOLD — premarket ~$880 >> $820 stop',
        },
        'agents_not_selected': {
            'macro': {'ticker': 'PASS', 'reason': 'Pre-CPI binary event, track record 0.8x'},
            'crypto': {'ticker': 'RIOT', 'conviction': 6, 'final_score': 7.13,
                       'reason': 'Buy trigger (BTC $65K + 2-session ETF) not met; 1 unrebutted weakness'},
            'sentiment': {'ticker': 'NKE', 'conviction': 8, 'final_score': 6.07,
                          'reason': 'Repeated stop-out 4 days ago unresolved; narrative penalty 0.85x'},
            'contrarian': {'ticker': 'CCL', 'conviction': 8, 'final_score': 5.49,
                           'reason': 'Track record 0.8x + narrative penalty 0.85x on breach FUD thesis'},
            'catalyst': {'ticker': 'ADBE', 'conviction': 6, 'final_score': 4.56,
                         'reason': 'Poor R/R for binary event (0.8:1); CPI risk day before earnings'},
        },
        'spy_price': SPY_PREMARKET,
        'spy_return_pct': SPY_RETURN_PCT,
    }

    data['trades'].append(entry)
    data['total_trades'] = next_id
    data['total_buys'] = data.get('total_buys', 26) + 1
    data['last_updated'] = TRADE['date']

    atomic_write(path, data)


# ═══════════════════════════════════════════════════════════════════════
# 4. LEADERBOARD.JSON
# ═══════════════════════════════════════════════════════════════════════
def update_leaderboard(nav, pnl_pct):
    path = f'{BASE}/leaderboard.json'
    with open(path) as f:
        data = json.load(f)

    # Update quant
    data['quant']['picks_executed'] = data['quant'].get('picks_executed', 9) + 1
    data['quant']['open_positions_notes'] = (
        'AAPL 3sh@$280.75 (+7.2% @$300.96); XLE 9sh@$57.64 (+1.3%); '
        'STRL 1sh@$880 (0.0% entry day); MAR 2sh@$391.62 (NEW — 52wk-high breakout, '
        'DBS $417 target, stop $381).'
    )

    # Update IREN on crypto
    data['crypto']['open_positions_notes'] = (
        'IREN 19sh@$60.75 (+4.7% @$63.63 premarket; AI infra pivot Microsoft $9.7B deal). '
        'BTC $63,414 >> $61K conditional sell threshold. HOLD.'
    )

    # Update reward pool
    total_realized = sum([
        d.get('total_pnl', 0)
        for d in [data['macro'], data['crypto'], data['quant'],
                  data['sentiment'], data['contrarian'], data['catalyst']]
    ])
    reward_pool = round(max(0, total_realized) * 0.2, 2)
    leader = max(
        ['macro', 'crypto', 'quant', 'sentiment', 'contrarian', 'catalyst'],
        key=lambda a: data[a].get('total_pnl', 0)
    )

    data['reward_pool_usd'] = reward_pool
    data['reward_pool_note'] = (
        f'Total realized P&L = ${total_realized:,.2f}. '
        f'Reward pool = ${reward_pool:,.2f} (20%). Leader: {leader.capitalize()}. '
        f'IREN open +4.7% premarket. MAR entered today (quant).'
    )
    data['last_updated'] = '2026-06-09T11:30:00Z'

    atomic_write(path, data)


# ═══════════════════════════════════════════════════════════════════════
# 5. OUTCOMES.JSON — Add today's 6 recommendations
# ═══════════════════════════════════════════════════════════════════════
def add_outcomes():
    path = f'{BASE}/outcomes.json'
    with open(path) as f:
        data = json.load(f)

    # Trading day helpers from 2026-06-09
    # Jun 9=Mon d0; d1=Jun10, d5=Jun16, d10=Jun23, d14=Jun27, d20=Jul8 (Jul4 holiday)
    new_recs = [
        {
            'id': 'macro-2026-06-09',
            'agent_id': 'macro',
            'date': '2026-06-09',
            'session': 'premarket',
            'ticker': 'PASS',
            'asset_type': 'none',
            'entry_price': 0.0,
            'target_return_pct': 0,
            'horizon_days': 0,
            'conviction': 0,
            'was_executed': False,
            'thesis_summary': (
                'PASS — pre-CPI event (May CPI June 10 8:30am ET, Cleveland nowcast 3.89-4.2% YoY). '
                'No setup clears evidence threshold in 24-hour window before binary release. '
                'Track record 11.1% win rate precludes directional macro bet under uncertainty.'
            ),
            'status': 'pass',
            'checkpoints': {},
            'peak_return_pct': None,
            'final_verdict': 'pass',
        },
        {
            'id': 'crypto-2026-06-09',
            'agent_id': 'crypto',
            'date': '2026-06-09',
            'session': 'premarket',
            'ticker': 'RIOT',
            'asset_type': 'stock',
            'entry_price': 27.47,
            'target_return_pct': 13,
            'horizon_days': 35,
            'conviction': 6,
            'was_executed': False,
            'thesis_summary': (
                'RIOT dual analyst upgrades (Bernstein $30, Clear Street $38), '
                'ETF inflow reversal after 13-day outflow streak, BTC stabilization at $63.4K, '
                'Q2 earnings July 30 catalyst. '
                'Rejected: buy trigger (BTC $65K + 2-session ETF confirmation) not yet met.'
            ),
            'status': 'tracking',
            'checkpoints': {
                'day_1': {'date': '2026-06-10', 'price': None, 'return_pct': None},
                'day_5': {'date': '2026-06-16', 'price': None, 'return_pct': None},
                'day_10': {'date': '2026-06-23', 'price': None, 'return_pct': None},
                'day_20': {'date': '2026-07-08', 'price': None, 'return_pct': None},
                'horizon': {'date': '2026-07-14', 'price': None, 'return_pct': None},
            },
            'peak_return_pct': None,
            'final_verdict': None,
            'pm_rejection_reason': (
                'Explicit buy trigger (BTC close above $65K for 2+ sessions + ETF inflow '
                'confirmation) has not been met. ETF inflow reversal only 1 session old vs '
                '13-session outflow streak. 1 unrebutted serious_weakness from Capital Protection Gate. '
                'Final score 7.13 (below MAR 8.09).'
            ),
        },
        {
            'id': 'quant-2026-06-09',
            'agent_id': 'quant',
            'date': '2026-06-09',
            'session': 'premarket',
            'ticker': 'MAR',
            'asset_type': 'stock',
            'entry_price': 391.62,
            'target_return_pct': 6.5,
            'horizon_days': 14,
            'conviction': 7,
            'was_executed': True,
            'thesis_summary': (
                '52-week high breakout consolidation above $387 support. '
                'RSI 67.98, above 20/50/200 SMA. DBS Buy PT $417. IBD Stock of Day. '
                'Q1 EPS $2.72 beat. Consumer Discretionary 0% current exposure. '
                'Stop: close below $381. All Capital Protection Gate attacks rebutted.'
            ),
            'status': 'tracking',
            'checkpoints': {
                'day_1': {'date': '2026-06-10', 'price': None, 'return_pct': None},
                'day_5': {'date': '2026-06-16', 'price': None, 'return_pct': None},
                'day_10': {'date': '2026-06-23', 'price': None, 'return_pct': None},
                'horizon': {'date': '2026-06-23', 'price': None, 'return_pct': None},
            },
            'peak_return_pct': None,
            'final_verdict': None,
            'falsification_condition': (
                'Close below $381 (20-day SMA) OR tech sector (XLK) rips >3% single session '
                'pulling capital from consumer discretionary.'
            ),
            'debate_result': 'buy_eligible',
            'pm_final_score': 8.09,
        },
        {
            'id': 'sentiment-2026-06-09',
            'agent_id': 'sentiment',
            'date': '2026-06-09',
            'session': 'premarket',
            'ticker': 'NKE',
            'asset_type': 'stock',
            'entry_price': 43.03,
            'target_return_pct': 12,
            'horizon_days': 25,
            'conviction': 8,
            'was_executed': False,
            'thesis_summary': (
                'CEO Elliott Hill + Tim Cook insider cluster $3.7M at $42-43 (April). '
                'VIX drop from 21.51 to 18.56 (-13.7%). Put/call OI 0.77 bullish skew. '
                '25 analyst Buy consensus, avg PT $63.04. '
                'Rejected: repeated stop-out 4 days ago at $43.50 unresolved by bull.'
            ),
            'status': 'tracking',
            'checkpoints': {
                'day_1': {'date': '2026-06-10', 'price': None, 'return_pct': None},
                'day_5': {'date': '2026-06-16', 'price': None, 'return_pct': None},
                'day_10': {'date': '2026-06-23', 'price': None, 'return_pct': None},
                'day_20': {'date': '2026-07-08', 'price': None, 'return_pct': None},
                'horizon': {'date': '2026-07-04', 'price': None, 'return_pct': None},
            },
            'peak_return_pct': None,
            'final_verdict': None,
            'pm_rejection_reason': (
                'Narrative penalty 0.85x (2 triggers: "exact environment" narrative + '
                '"stale signal still valid" interpretation). 1 unrebutted serious_weakness: '
                'repeated stop-out June 5 at same price level. Final score 6.07 (below MAR 8.09).'
            ),
        },
        {
            'id': 'contrarian-2026-06-09',
            'agent_id': 'contrarian',
            'date': '2026-06-09',
            'session': 'premarket',
            'ticker': 'CCL',
            'asset_type': 'stock',
            'entry_price': 27.28,
            'target_return_pct': 22,
            'horizon_days': 30,
            'conviction': 8,
            'was_executed': False,
            'thesis_summary': (
                'CCL data breach FUD (6M customers) priced in without booking impact evidence. '
                'PE 12.19, Q1 EPS beat, bookings +10% YoY, 85% of year booked. '
                'Institutional accumulation (BlackRock +7.5%, AQR +161%). June 24 earnings catalyst. '
                'Rejected: narrative penalty + contrarian track record (28.6%) → score 5.49.'
            ),
            'status': 'tracking',
            'checkpoints': {
                'day_1': {'date': '2026-06-10', 'price': None, 'return_pct': None},
                'day_5': {'date': '2026-06-16', 'price': None, 'return_pct': None},
                'day_10': {'date': '2026-06-23', 'price': None, 'return_pct': None},
                'day_20': {'date': '2026-07-08', 'price': None, 'return_pct': None},
                'horizon': {'date': '2026-07-09', 'price': None, 'return_pct': None},
            },
            'peak_return_pct': None,
            'final_verdict': None,
            'pm_rejection_reason': (
                'Track record 0.8x + narrative penalty 0.85x applied. '
                'Agent presupposes breach had no impact before June 24 confirmation. '
                'No price-level stop defined (only June 24 earnings falsification). '
                'Final score 5.49. Structurally sound thesis but wait for June 24 data.'
            ),
        },
        {
            'id': 'catalyst-2026-06-09',
            'agent_id': 'catalyst',
            'date': '2026-06-09',
            'session': 'premarket',
            'ticker': 'ADBE',
            'asset_type': 'stock',
            'entry_price': 249.91,
            'target_return_pct': 11,
            'horizon_days': 3,
            'conviction': 6,
            'was_executed': False,
            'thesis_summary': (
                'Adobe Q2 FY2026 earnings June 11 AMC. Forward PE ~10x vs 35x historical. '
                '8 consecutive EPS beats. $25B buyback. Beat+guidance-raise probability: '
                'agent 55% vs market-implied 38% (17% gap). '
                'Rejected: poor R/R (11% up vs 13.8% options implied move) + '
                'CPI risk day before earnings + track record 0.8x.'
            ),
            'status': 'tracking',
            'checkpoints': {
                'day_1': {'date': '2026-06-10', 'price': None, 'return_pct': None},
                'day_3': {'date': '2026-06-12', 'price': None, 'return_pct': None},
                'horizon': {'date': '2026-06-12', 'price': None, 'return_pct': None},
            },
            'peak_return_pct': None,
            'final_verdict': None,
            'event_date': '2026-06-11',
            'event_type': 'earnings',
            'base_case_probability_pct': 55,
            'market_implied_probability_pct': 38,
            'pm_rejection_reason': (
                'R/R score 4/10: poor for binary (11% up vs 13.8% downside implied move). '
                'CPI print June 10 (hot likely 3.9-4.2%) could pressure tech day before ADBE earnings. '
                'Track record 0.8x + narrative penalty (probability gap is interpretation) 0.85x. '
                'Final score 4.56. Correct call: wait for post-earnings entry if thesis validates.'
            ),
        },
    ]

    # Deduplicate: remove any existing entries with same id
    existing_ids = {e.get('id') for e in data.get('recommendations', [])}
    for rec in new_recs:
        if rec['id'] not in existing_ids:
            data['recommendations'].append(rec)
            print(f'    + Added {rec["id"]} ({rec["ticker"]})')

    data['total_recommendations'] = len(data.get('recommendations', []))
    data['last_updated'] = '2026-06-09T11:30:00Z'

    atomic_write(path, data)


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════
def main():
    print('=== Alpha Firm — 2026-06-09 Premarket State Update ===\n')

    print('1. Updating portfolio.json...')
    nav, pnl_pct, alpha = update_portfolio()

    print('2. Updating daily-state.json...')
    update_daily_state()

    print('3. Updating trade-log.json...')
    update_trade_log()

    print('4. Updating leaderboard.json...')
    update_leaderboard(nav, pnl_pct)

    print('5. Appending outcomes.json...')
    add_outcomes()

    print('\n=== All updates complete ===')
    print(f'Trade: BUY 2 MAR @ $391.62 = $783.24')
    print(f'NAV: ${nav:,.2f} | P&L: +{pnl_pct}%')
    print(f'SPY: ${SPY_PREMARKET} (+{SPY_RETURN_PCT}%) | Alpha: {alpha}%')


if __name__ == '__main__':
    main()
