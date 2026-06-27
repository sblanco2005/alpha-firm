# Handoff: Alpha Firm — iPhone App

## Overview
A mobile app (iPhone) for **Alpha Firm**, an autonomous investment-research system run by six AI analysts and a PM orchestrator on a VPS. The app is a **read-mostly companion** to the existing backend: it shows live portfolio NAV/P&L, open positions, the six analysts as characters with their scorecards, an animated "market check" pipeline, and the agent leaderboard/rewards.

It operates in **simulated mode** (tracks real prices, executes no real trades).

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing the intended look, layout, and behavior. **They are NOT production code to ship directly.** The task is to **recreate these designs in the target app environment**.

There is no app codebase yet, so the implementer should pick the framework (see "Recommended Target" below) and rebuild the screens there, wiring them to the existing backend over a REST API.

- `Alpha Firm.dc.html` — the source prototype (React rendered through a small runtime, all data hardcoded).
- `Alpha Firm — standalone (open in browser).html` — same thing, fully self-contained; **open this one in a browser to see/click the real design.** Tap the bottom tabs, tap an analyst card, tap "Run market check."

### Recommended Target
- **Fastest / recommended for personal use: a PWA** — Vite + React + TypeScript, deployed and "Added to Home Screen." Reuses ~90% of this design (it's already HTML/CSS). No Xcode, no App Store.
- **True native iOS: Expo (React Native)** — installable app, but the HTML/CSS visuals must be *translated* to React Native primitives (View/Text/StyleSheet), not copied. Requires a Mac + Xcode.

Either way: **build the app frontend locally on the Mac; keep the backend on the VPS; the app talks to it over HTTPS.**

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are all specified below and present in the HTML. Recreate the UI faithfully, then swap the hardcoded data for live API calls.

---

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| `bg/base` | `#0B0B11` | App background (base) |
| `bg/glow` | `#1a1330` | Radial glow at top of screens (`radial-gradient(120% 60% at 50% -8%, #1a1330 0%, transparent 46%)`) |
| `surface/card` | `#14141C` | Card / list-row background |
| `surface/card-dim` | `#101017` | Dimmed cards (benched/suspended agents) |
| `border/hairline` | `rgba(255,255,255,0.07)` | Default card border |
| `text/primary` | `#F2F2F5` | Primary text |
| `text/secondary` | `rgba(255,255,255,0.55)` | Secondary text |
| `text/tertiary` | `rgba(255,255,255,0.40)` | Muted labels, inactive tab |
| `gain` | `#2BD98A` | Positive P&L, active tab, primary action |
| `loss` | `#FF5C6A` | Negative P&L, bear/risk |

### Analyst (character) colors
| Analyst | Color | Emoji avatar | Nickname |
|---|---|---|---|
| Sentiment Scout | `#FF4D9D` (pink) | 📡 | "The Whisperer" |
| Contrarian | `#A05CFF` (violet) | 🃏 | "The Rebel" |
| Catalyst Agent | `#4D7CFF` (blue) | ⏱ | "The Clockwatcher" |
| Macro Strategist | `#F5B731` (gold) | 🌐 | "The Big Picture" |
| Crypto Analyst | `#F7931A` (orange) | ₿ | "On-Chain" |
| Momentum Quant | `#2DD4D4` (cyan) | 📊 | "The Machine" |
| (gold accent) | `#FFD24D` | — | leader star / reward pool |

Avatar badge = 48px rounded square (radius 14), background = analyst color at ~13% alpha, border = analyst color at 40% alpha, emoji centered.

### Typography
- **Display** (titles, NAV number, big stats): `Bricolage Grotesque`, weights 700/800, tight letter-spacing (`-0.5` to `-2px`).
- **UI / body**: `Space Grotesk`, weights 400/500/600/700.
- **Numbers / tickers / mono labels**: `JetBrains Mono`, weights 500/700. Use this for every dollar value, %, ticker, and "conv N".
- All three load from Google Fonts (already inlined in the standalone file).

Type scale (px): NAV hero 52 · screen title 32 · section header 16–19 · card stat 21 · body 13 · row title 15 · caption 10.5–11.5.

### Spacing / radius
- Screen horizontal padding: 18px. Content top padding: 56px (clears status bar). Tab bar bottom padding: 26px (clears home indicator).
- Card radius: 14–20px. Pills/badges: 6–9px. Device bezel: 48px.
- Gaps between cards: 8–10px (use flex/grid `gap`, not margins).

### Device frame
402 × 874 px. Dynamic island 126×37 (radius 24). Home indicator 139×5 pill at bottom. (In a real iOS app this is the system chrome — drop the hand-drawn bezel.)

---

## Screens / Views

The app is a single-screen-at-a-time shell with a **bottom tab bar** (4 tabs). One tab ("Analysts") has a drill-in detail view.

### 1. Portfolio (home tab)
- **Purpose**: At-a-glance fund health.
- **Layout**: Vertical scroll. Header row (wordmark + date) → "NET ASSET VALUE" label → NAV hero number → P&L pill row → gap chart → alpha callout → 3-up stat chips → "Open positions" section list.
- **Components**:
  - Header: green live dot (8px, glow) + "ALPHA FIRM" (Bricolage 800, 16px); right: "JUN 24 · DAY 88" (JetBrains Mono 11.5, tertiary).
  - NAV hero: `$10,280` (Bricolage 800, 52px) with `.03` cents at 30px/45% opacity.
  - P&L row: green pill "▲ +2.80%" (mono 700, gain bg 12% + border 30%) · "+$280.03" (gain) · "since inception" (tertiary).
  - **Gap chart** (the signature element): SVG, ~96px tall. A green area+line for portfolio (`#2BD98A`, area fill gradient to transparent) sitting LOW, and a dashed muted line (`rgba(255,255,255,.22)`, dash `3 4`) climbing steeply ABOVE it = SPY. Labels: "SPY +34.4%" top-right (tertiary), "YOU +2.8%" on the green line (gain). This visually tells the alpha-gap story.
  - **Alpha callout**: card with red-tinted gradient bg (`rgba(255,92,106,.14)→.04`), red border. Left: "ALPHA vs SPY" label + "−29.56%" (Bricolage 800, 26px, loss). Right: copy "Behind the index in a bull run. Still **simulated** — building a track record before risking capital."
  - 3 stat chips (grid): "42% / Cash · $4.3k", "8 / Positions", "61 / Trades total". Value in mono 700 16px.
  - Positions list: 8 rows. Each row = analyst color dot (9px, glow) + ticker (mono 700 15px) + "{shares} sh · {entry} → {latest}" (caption) + right side: return % (mono 700, gain/loss colored) + analyst name (10px, analyst color).

### 2. Analysts — "The Desk" (roster, analysts tab default)
- **Purpose**: Browse the six analyst characters; tap to open a scorecard.
- **Layout**: Title "The Desk" (32px) + subtitle "Six analysts. Independent research, in parallel — no analyst sees the others." → vertical list of 6 cards.
- **Card**: avatar badge + name (Bricolage 700 16px) + (star ⭐ if leader) + nickname line in analyst color + right side realized P&L (mono 700, colored) + "{winRate} · {picks} picks" caption.
  - Sentiment card has a pink-tinted border + ⭐. Benched (Macro) and Suspended (Quant) cards are dimmed (opacity .72, darker bg) and carry a small status badge ("BENCHED" / "SUSPENDED" in loss color).
  - Other status badges: Crypto = "STOCKS ONLY" (orange).
- **Interaction**: tap a card → navigates to that analyst's detail (screen 3).

### 3. Analyst Detail / Scorecard
- **Purpose**: Deep view of one analyst.
- **Layout**: "‹ The Desk" back link → header (66px avatar + name + nickname) → status pill → 2×2 stat grid → blurb paragraph → "THE EDGE" tinted card → "Conviction calibration" (3 rows: 9–10 green, 7–8 gold, 5–6 muted) → "Holding now" chips (tickers the agent currently holds, with return %) or "No open positions — sitting on its hands."
- **Stat grid**: Realized P&L (colored), Win rate, Recommendations (total picks), Executed.
- Back link returns to roster.

### 4. Market Check (live tab)
- **Purpose**: Show/replay a market-check run. The showcase animated screen.
- **Idle state**: title "Market Check" + session pill "3:45 · CLOSE" + subtitle "6 analysts → fundamental overlay → bull/bear debate → PM decision." + a card: explainer copy + big green **"Run market check"** button (pulsing dot) + footnote "1 buy / day · sector cap 40% · VIX-sized".
- **Running state** (triggered by the button): a status line with a pulsing dot, then a staggered reveal:
  1. **Dispatch** (~0–1.6s): 6 agent mini-cards in a 2-col grid, each showing avatar + name and a **shimmer placeholder** ("researching…").
  2. **Recommendations** (~1.6s): each card resolves to a ticker (mono 700, analyst color) + "conv N" + a conviction bar (width = conv×10%, animated grow) + a note. Benched/suspended agents are dimmed.
  3. **Debate** (~3.3s): a card titled "⚔ CAPITAL-PROTECTION DEBATE" for the top pick (PLTR). Bear row (🐻 "Risk Manager", loss color, with risk-flag chips `factor_crowding`, `already_priced_in`), Bull row (🐂 rebuttal, gain color), then a Risk-Chair verdict strip "RISK CHAIR → BUY_ELIGIBLE · 1.05× modifier".
  4. **Verdict** (~5s): big green card "PM DECISION · LOGGED" → "BUY PLTR" (Bricolage 800, 34px) + 3 stats (final score 8.4 · 18% of cash ~$776 · Sentiment 📡) + the math line "8.2 raw × 1.0 fund × 1.05 debate = 8.4 · daily buy used" + a "↺ Reset demo" button (returns to idle).
- Timings are illustrative; in production these stages map to the real pipeline result (see API).

### 5. Standings (league tab)
- **Purpose**: Leaderboard + rewards + trading principles.
- **Layout**: title "Standings" + subtitle "Agents earn influence through track record. Bad analysts get discounted — automatically." → **Reward Pool** card (gold-tinted): "🏆 REWARD POOL · WINNER-TAKE-ALL" + "$56.01" + "20% of firm profit → leading analyst" + winner avatar (Sentiment). → "Agent leaderboard" (6 ranked rows, sorted by realized P&L, rank number + avatar + name + status badge + "win% · N exec" + colored P&L). → "The Soul · non-negotiables" card listing the 5 trading principles (green lead-in phrase + rest in secondary).

---

## Interactions & Behavior
- **Tab bar**: 4 tabs (Portfolio, Analysts, Live, League). Active tab = `#2BD98A` icon+label; inactive = `rgba(255,255,255,0.4)`. Tapping switches the visible screen.
- **Analyst drill-in**: tap roster card → detail; back link → roster. Switching tabs resets to roster.
- **Run market check**: button → state machine steps idle → dispatch → recs → debate → verdict (setTimeout-driven in the prototype; in production, kick/poll the API). Reset returns to idle.
- **Animations**: `afFadeUp` (screen enter, opacity+translateY 10px, .4s), `afShimmer` (researching placeholders), `afPulse` (live dots), `afGrow` (conviction bars from width 0), `afPing` (button dot ring). Keep durations as-is.
- **No hover states needed** (touch). Use active/pressed feedback on tappable cards/buttons.

## State Management
- `tab`: `'portfolio' | 'analysts' | 'live' | 'league'`.
- `selectedAnalyst`: `null | analystId` (drives roster vs detail).
- `liveStep`: `0 idle · 1 dispatch · 2 recs · 3 debate · 4 verdict`.
- **Data fetching**: on Portfolio mount → portfolio + positions; Analysts → leaderboard + scorecards; Live → latest check result / cron status; League → leaderboard + reward pool. Cache and poll (e.g. every 30–60s) since the backend updates 3×/day.

---

## API Contract (the backend-linking work)

There is no app API yet. Add REST endpoints to the **existing Express server** (the one already serving the dashboard) that simply return the relevant `state/*.json`. Suggested contract — adapt field names to your actual JSON:

```
GET /api/portfolio
  → { nav, navCents, pnlAbs, pnlPct, cash, cashPct, positionsCount,
      tradesTotal, daysActive, highWaterMark, spyReturnPct, alphaPct,
      inceptionDate, asOf }

GET /api/positions
  → [ { ticker, shares, entryPrice, latestPrice, returnPct, agentId, stop } ]

GET /api/analysts            // roster
  → [ { id, name, nickname, emoji, color, status, picks, executed,
        winRate, realizedPnl } ]

GET /api/analysts/:id        // scorecard detail
  → { ...rosterFields, blurb, edge, calibration:{c910,c78,c56},
      holdings:[{ticker,returnPct}] }

GET /api/leaderboard
  → { rewardPool, leaderId, rows:[{ rank, agentId, name, winRate,
      executed, realizedPnl, status }] }

GET /api/check/latest        // most recent market check
  → { session, ranAt, agents:[{agentId,ticker,conviction,note}],
      debate:{ pick, bearFlags[], bullRebuttal, verdict, modifier },
      decision:{ action, ticker, finalScore, sizePct, sizeUsd, agentId } }

GET /api/cron/status         // from state/cron-status.json
  → { lastRun, nextRun, status, durationMs }

POST /api/check/run          // OPTIONAL — triggers run-check.sh
  → 202 { started:true }     // protect with auth; or omit and just poll
```

**Map → source files**: portfolio/positions ← `state/portfolio.json`; analysts/leaderboard ← `state/leaderboard.json` + `state/scorecards/*.json`; check/latest ← latest `memory/*` + PM decision in `logs/{today}.md` or a new `state/last-check.json`; cron ← `state/cron-status.json`.

**Auth & reachability**: services are `localhost`-only today. Expose via Cloudflare Tunnel / Tailscale / nginx+TLS and require a bearer token / API key header. For local dev, SSH-tunnel the port (`ssh -L 8001:localhost:8001 user@vps`) and hit `localhost` from the simulator.

The "Run market check" button is the only write path — either implement the protected `POST /api/check/run` (which shells out to `run-check.sh`) or make the Live screen **read-only**: show the latest logged check + next cron time instead of triggering.

## Assets
- No bitmap assets. Avatars are **emoji** (📡 🃏 ⏱ 🌐 ₿ 📊). The gap chart and tab icons are **inline SVG** (recreate as components). Fonts via Google Fonts (Bricolage Grotesque, Space Grotesk, JetBrains Mono).

## Files
- `Alpha Firm.dc.html` — source prototype (all five screens + logic).
- `Alpha Firm — standalone (open in browser).html` — self-contained; open to interact with the real design.

## Real data used in the prototype (as of Jun 24, 2026)
NAV $10,280.03 (+2.80% / +$280.03) · Cash $4,314.45 (42%) · SPY +34.39% · Alpha −29.56% · HWM $11,431.25 · 88 days · 31 buys / 30 sells.
Positions: CAT +18.9% (Catalyst), TGLS +13.3% (Sentiment), MU +7.4% (Quant), SYK +4.8% (Contrarian), FCN +3.5% (Sentiment), NCLH +1.1% (Sentiment), CLSK −0.7% (Crypto), FDX −1.7% (Quant).
Leaderboard: Sentiment +$211.70 (58.3%), Contrarian +$90.69 (33.3%), Catalyst +$17.32 (23.3%), Macro −$2.16 (10.0%, benched), Crypto −$51.55 (62.0%, stocks-only), Quant −$106.98 (42.6%, suspended).
