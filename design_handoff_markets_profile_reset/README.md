# Handoff: Markets Menu, Profile/Account & Strategy Reset

## Overview
Three features added to the **Alpha Firm** portfolio tracker (a mobile app where six AI "agents" run a simulated fund):

1. **Markets tab** — a 4th bottom-nav destination showing key market benchmarks (SPY, GLD, BTC, 10Y and more), each with a live sparkline, price, day change, top headline, a full detail chart, and a news feed. The user can **customize which tickers** appear (1–12 from a catalog of 12).
2. **Profile / Account page** — reached from an avatar in the dashboard header. Lets the user **set the capital they invest** (not fixed at $10,000) and **reset the strategy**.
3. **Full-book recompute** — every dollar figure in the app (NAV, cash, positions, agent P&L, transactions) is **derived from the capital base**, and **Reset** closes everything to **100% cash** and zeroes P&L so a new agent lineup can be judged from a clean slate.

## About the Design Files
The file in this bundle — `Alpha Firm.dc.html` — is a **design reference created in HTML**. It is a working prototype demonstrating the intended look, layout, and behavior; it is **not production code to copy directly**. The `.dc.html` format is a self-contained prototype runtime (a lightweight React-like template + logic class). 

The task is to **recreate these features in the target codebase's existing environment** (React, React Native, SwiftUI, etc.), using its established components, state management, styling system, and data layer. Where this doc gives literal hex/px/logic, reproduce the intent using the codebase's own tokens and patterns. The **recompute logic** (below) is the part to port faithfully — it is real logic, not just styling.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions. Recreate the UI closely using the codebase's existing component library, and port the recompute math exactly.

---

## Design Tokens

**Colors**
- Page background: dark radial, base `#0B0B11`
- Card surface: `#14141C`
- Card border: `rgba(255,255,255,.07)`
- Primary text: `#F2F2F5`; muted: `rgba(255,255,255,.5)`; faint: `rgba(255,255,255,.42)`
- Positive / green: `#2BD98A`
- Negative / red: `#FF5C6A`
- Accent amber (regime/gold): `#F5B731`
- Neutral (reset/dimmed values): `rgba(255,255,255,.55–.6)`
- Ticker accent colors: SPY `#4D7CFF`, GLD `#F5B731`, BTC `#F7931A`, 10Y `#2DD4D4`, QQQ `#9B7BFF`, IWM `#E0729F`, VIX `#FF6B57`, DXY `#5FB0A8`, WTI `#C98A4B`, TLT `#6E8BE0`, EEM `#E0A93F`, ETH `#7E7CF0`
- Tinted chip bg / border per accent: `rgba(<accent>, .12–.13)` / `rgba(<accent>, .3–.4)`

**Typography**
- Display / headings: **Bricolage Grotesque**, weight 700–800, tight tracking (`-0.5px` to `-1.5px` on large sizes)
- UI labels / nav / body: **Space Grotesk**
- Numbers, tickers, mono data: **JetBrains Mono**, weight 700
- Scale: hero NAV ~44px; screen titles 27–32px; section titles 17–19px; card values 14–16px; labels 10.5–12.5px

**Shape**
- Card radius: 14–20px (stat cards 14, list cards 16, hero/panels 18–20)
- Toggle pills / period tabs radius: 8–12px
- Avatar: 32px (header) / 56px (profile), radius 50% / 18px

**Spacing** — screens use `padding: 0 18px`; card internal padding 11–18px; vertical section gaps ~22–26px; list item gaps 7–8px.

---

## Screens / Views

### 1. Markets — list view
**Purpose:** Give the desk the macro backdrop it trades against.
**Layout:** Vertical scroll. Header row (title "Markets" + a "3:45 · CLOSE" mono pill). Sub-line. A **macro regime card** (amber-tinted gradient, `rgba(245,183,49,.14→.03)`, border `rgba(245,183,49,.3)`, radius 20) with label "MACRO REGIME READ", a Bricolage headline ("Risk-on, narrowing"), and a sentence. Then a "Key benchmarks" section header with an **EDIT · N** button on the right (green-tinted). Then a column of benchmark cards.

**Benchmark card** (`#14141C`, radius 16): two rows.
- Row 1: accent glyph tile (38×38, radius 11, accent color on tinted bg) · name (mono 15) + sector (10.5, faint) · flex-grow **sparkline** SVG (viewBox `0 0 120 34`, stroke = green/red by direction, or accent for yield) · right-aligned level (mono 14) + day change (mono 11, green/red).
- Row 2 (separated by a `1px` top border `rgba(255,255,255,.06)`): a colored dot (6px, glow via box-shadow, colored by the headline's sentiment tag) + the single most-important **headline** (11.5px, one line, ellipsis).
- Whole card is tappable → detail view.

### 2. Markets — customize (picker)
**Trigger:** the **EDIT · N** button. **Purpose:** choose which tickers the Markets tab tracks.
**Layout:** Back ("‹ Markets") + a green **Done** button. Title "Customize markets". Sub-line "N of 12 selected." Then a list of **all 12 catalog rows**: glyph tile · name (mono 14) + full name (10.5, ellipsis) · right-aligned level + day change · a **toggle circle** (27px): selected = green fill with `✓` in `#0B0B11`; unselected = outline with `+`.
**Rules:** min 1 selected, max 12. When at max, unselected rows dim to `opacity:.42` and can't be added. Toggling persists immediately.

### 3. Market detail
**Purpose:** full read on one benchmark.
**Layout:** Back ("‹ Markets"). Name (Bricolage 27) + full name; right side shows sector chip + glyph tile. Big **level** (Bricolage 40, tracking `-1.5px`). Change line (mono, colored) + period label. **Area chart** SVG (viewBox `0 0 340 150`) with gradient fill in the accent color, a line (green/red, or accent for yield), and an end dot. **Period selector**: 7 segments `LIVE 1D 1W 1M 3M YTD 1Y` (active = accent-tinted). **Stat grid** (2×2): Today, Year to date, 1-year, 52-wk range. A "What is X?" paragraph. A tinted "**What it means for the book**" callout (accent-tinted) with the macro-desk read. A "**What's moving it**" section: 3 news cards, each with a sentiment tag chip (BULLISH green / BEARISH red / NEUTRAL amber), source (mono), relative time (right), and the headline (13px).

### 4. Dashboard header (modified)
- Top row now shows the dynamic date/day label on the left and a **circular avatar "AM"** (32px, green gradient) on the right → tapping opens **Profile**.
- When reset is active, a green banner appears under the header: "Tracking from <date> · P&L reset to zero".
- NAV number, the "ALPHA vs SPY" card, the **Cash %/$**, **Positions** count, and **Trades total** stat are all now bound to computed values (see Recompute).

### 5. Profile / Account
**Trigger:** avatar. **Layout:** Back ("‹ Back") + "ACCOUNT" label. Identity row: 56px gradient avatar "AM" + "Alex Morgan" / "Alpha Firm · Simulated fund".
- **Capital allocated** section: card with label "INVESTMENT AMOUNT", a large **editable numeric input** (Bricolage 33, `$` prefix) with **− / +** steppers (±$1,000), and 5 **preset chips**: `$5k $10k $25k $50k $100k` (active = green fill). Changing capital rescales the whole book and persists.
- **Strategy tracking** section: card showing "TRACKING SINCE" + the tracking line, a status chip (LIVE / RESET). A red **"↻ Reset strategy"** button → expands an inline **confirm** panel: body text "This closes all positions to 100% cash, zeroes your P&L and resets NAV to $X, tracking from today. Agent scorecards keep their history." with **Cancel** / **Reset now** (red). When already reset, a "Restore full simulated history" link appears to undo.
- The bottom **tab bar is hidden** while on the Profile screen.

### 6. Bottom nav (modified)
Now **4 tabs**: Portfolio · **Markets** · Analysts · Live. Markets icon is a bar-chart glyph. Active tab = full-opacity accent; inactive = dimmed. (Profile is not a tab — it's reached via the avatar.)

---

## Interactions & Behavior
- **Tab nav**: tapping a tab switches the primary view and clears any drill-down/selection state.
- **Drill-downs**: Markets list → market detail; customize → picker; avatar → profile. Each has a back affordance. Pattern matches the app's existing list→detail model.
- **Ticker toggle**: optimistic, persisted; enforces 1–12 bounds (dim + block at max).
- **Capital edit**: input accepts digits only (`replace(/[^0-9]/g,'')`), clamped 0–100,000,000; steppers ±1,000; presets set exact values. Every change recomputes the book live.
- **Reset**: two-step (button → confirm → "Reset now"). Sets `resetAt = today (ISO date)`. **Restore** clears it.
- Fade-up entrance on screens (`animation: afFadeUp .35s ease`), ~translateY(8px)+opacity.

## State Management
State variables (names from the prototype; map to your store):
- `tab` — `'portfolio' | 'markets' | 'analysts' | 'live' | 'profile'`
- `selMkt` — selected market id (detail) | null
- `mktPeriod` — active chart period for market detail (default `'3M'`)
- `mktSel` — **array** of selected ticker ids (default `['SPY','QQQ','GLD','BTC','US10Y','DXY']`)
- `mktEdit` — boolean, picker open
- `capital` — number (default `10000`)
- `resetAt` — ISO date string `'YYYY-MM-DD'` | null
- `confirmReset` — boolean
- `prevTab` — the tab to return to when leaving Profile

**Persistence** (localStorage keys in the prototype; use your app's persistence/user-settings store):
- `af_mkt_sel` → JSON array of ticker ids
- `af_capital` → integer string
- `af_reset_at` → ISO date string (empty/absent = not reset)

Read these on load/mount and hydrate state.

---

## Recompute logic (port this faithfully)

Everything derives from **`capital`** and **`resetAt`**. Let `factor = capital / 10000` (the base book is defined at a $10,000 notional).

**Base book, computed from the position + transaction data:**
```
baseCost   = Σ over open positions of (shares × entry)
baseMV     = Σ over open positions of (shares × latestPrice)
baseReal   = Σ over all agents of realizedPnL          // realized (closed) P&L
baseUnreal = baseMV − baseCost
baseNav    = 10000 + baseReal + baseUnreal
```

**Normal (not reset):**
```
navNum     = baseNav × factor
investedMV = baseMV × factor
cashNum    = navNum − investedMV
cashPct    = round(cashNum / navNum × 100)
incPct     = (baseNav / 10000 − 1) × 100        // "strategy return since inception"
```
Per position, scale by factor: `shares×factor`, `entry` unchanged, `marketValue = latest×shares×factor`, `pnl = (latest−entry)×shares×factor`, return % unchanged. Agent P&L = `realizedRaw × factor`. Transaction rows (open + closed) scale the same way. Share counts may become fractional — format with up to 2 decimals, drop trailing zeros.

**Reset (`resetAt` set) → 100% cash, clean slate:**
```
navNum     = capital           // NAV snaps exactly to capital
investedMV = 0                 // all positions closed to cash
cashNum    = capital           // 100% cash
cashPct    = 100
incPct     = 0                 // strategy return 0.00%
```
- **Positions list = empty**; show the "100% cash" empty state instead.
- **Positions count = 0**, **Trades total = 0**, open transaction rows = empty, closed rows = empty.
- **Agent P&L = 0** for every agent (dim to neutral color).
- **Alpha vs SPY = 0.00%** (neutral styling), and the alpha card note switches to the "fresh start" copy.
- **Header** shows the reset banner + a `<date> · DAY N` label where N = days since `resetAt` (inclusive).
- New agent picks would open fresh positions from here (out of scope for the prototype's static data, but that's the intended model).

**NAV chart** (`_navSeries`): the "you" line runs from `capital` (or the derived start) to `navNum`; the SPY comparison line is a benchmark curve. On reset both series start flat at `capital`. Period buttons `LIVE 1D 1W 1M 3M YTD 1Y` re-scope the window.

> Modeling decision the user confirmed: **Reset moves everything to 100% cash** (positions are closed, not merely re-based). Agent **scorecards keep their pick history** — only P&L/NAV/positions reset.

---

## Market data model
Each catalog entry (12 total): `id, name, full, kind ('price'|'yield'|'level'), sector, color, latest, up, dayPct` (or `dayBps` for yield), `ytd, oneY, range52, volMul`, plus `what` (definition), `read` (desk take), `headline` (top card headline), and `news[]` (3 items: `tag, time, source, title`).
- **kind: 'price'** → `$` formatted, green/red change.
- **kind: 'yield'** (10Y) → `%` formatted, change in **bps**, accent-colored (not green/red).
- **kind: 'level'** (VIX, DXY) → plain 2-decimal number.
Sparklines/detail charts are generated from a seeded random walk pinned to start/end so they're deterministic per (ticker, period). In production, replace with real time-series from your market-data provider; keep the kind-specific formatting.

---

## Files
- `Alpha Firm.dc.html` — the full prototype containing all three features. Key areas:
  - Template: Markets list, customize picker, market detail, Profile screen, modified dashboard header, 4-tab nav (search the `MARKETS`, `CUSTOMIZE MARKETS`, `MARKET DETAIL`, `PROFILE / ACCOUNT`, `TAB BAR` comment banners).
  - Logic (`class Component`): `_markets()` (catalog), `_mktSeries()` / `_navSeries()` (chart generators), `_toggleMkt()`, `_setCapital()`, `_doReset()` / `_restoreHistory()`, and the recompute block inside `renderVals()`.

## Assets
No image assets — all icons are inline SVG, all glyphs are text/unicode. Fonts (Bricolage Grotesque, Space Grotesk, JetBrains Mono) load from Google Fonts in the prototype; use your app's existing font pipeline.
