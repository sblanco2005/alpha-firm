# Changelog — new since the first handoff

This file documents what changed in the design **after** the original `README.md` was written. Read `README.md` for the full spec; this covers the two additions: a **Position Detail** screen and **interactive multi-period charts**.

---

## 1. Interactive multi-period chart (Home screen)

The Portfolio home screen's static NAV graphic is now an **interactive chart with a time-period selector**, matching the Robinhood pattern.

**Controls:** a row of 7 segmented buttons — `LIVE · 1D · 1W · 1M · 3M · YTD · 1Y`. The active button is a filled green pill (`rgba(43,217,138,.16)` bg, `#2BD98A` text); inactive are `rgba(255,255,255,.5)` text on transparent. Tapping one re-renders the chart and the change figure for that window. Default selected: `1Y` (labelled "Since inception").

**Chart:** an SVG (viewBox `0 0 340 120`, `preserveAspectRatio="none"`) with two lines on a shared y-domain:
- **Portfolio** — solid `#2BD98A` line + area fill (gradient `#2BD98A` .26→0), with an end dot. Always green (portfolio is positive in every window).
- **SPY** — dashed muted overlay (`rgba(255,255,255,.22)`, dash `3 4`), no fill. Sits *above* the portfolio line — this is the visual alpha-gap story.
- Floating labels: `SPY +X%` top-right, `YOU +X%` near the portfolio end dot.

**Dynamic change line** (above the chart, replaces the old static pill): `▲ +${abs} (+{pct}%)` + period label (e.g. "Past week"). Updates per selected period.

**Per-period values used** (so production can match the feel — these are illustrative; production should compute from real NAV history):

| Period | Portfolio | SPY | Label |
|---|---|---|---|
| LIVE | +0.08% | +0.1% | Past hour |
| 1D | +0.40% | +0.6% | Today |
| 1W | +1.10% | +1.8% | Past week |
| 1M | +1.90% | +7.0% | Past month |
| 3M | +2.60% | +16.0% | Past 3 months |
| YTD | +2.80% | +34.0% | Year to date |
| 1Y | +2.80% | +34.39% | Since inception |

The 1Y / inception figure is pinned to the real **+$280.03 / +2.80%** vs **SPY +34.39%**.

---

## 2. Position Detail screen (new, drill-down from Home)

**Every open-position row on Home is now tappable** (added `cursor:pointer`, an onClick, and a trailing `›` chevron) and navigates to a full detail screen for that ticker. A "‹ Portfolio" back link returns home. It lives under the Portfolio tab (Home shows when no position is selected; Detail shows when one is).

**Layout, top to bottom:**
1. **Header** — ticker (Bricolage 800, 27px) + company name + sector pill + the picking-analyst's emoji avatar (tinted in that analyst's color).
2. **Price** — current price (Bricolage 800, 40px) + a per-period change line (`▲/▼ ${abs} ({pct}%)` + period label), colored green/red by the selected period's direction.
3. **Interactive chart** — same engine as Home but single-series (just the stock). SVG viewBox `0 0 340 150`. **The line + area + period pills recolor green (`#2BD98A`) or red (`#FF5C6A`) depending on whether the selected period's return is positive or negative.** A dashed horizontal **entry-price line** is drawn when the entry price falls within the visible range.
4. **Period selector** — same 7 buttons (`LIVE…1Y`), active pill tinted to the current line color.
5. **Holdings grid** (2×2) — Shares · Avg cost · Market value · Total return (return colored).
6. **"What is {ticker}?"** — one-paragraph plain-language description of the company.
7. **"Why {agent} picked it"** — agent-tinted card: the analyst's thesis in their own methodology, with `conviction N/10 · {horizon}` and two chips (`⚡ {catalyst}`, `🎯 target {target}`).
8. **"Why the PM approved it"** — green ⚖️ card: the orchestrator's gate rationale + `final score {score} · {verdict}`.
9. **Position management** — tone-colored strip (green/amber/red) with the current read (e.g. "Up, target not yet hit — Hold, let the winner run.") + the stop price.

**State added:** `selectedPosition` (ticker or null), `chartPeriod` (detail chart window), `homePeriod` (home chart window) — all independent.

---

## Per-position content (all 8 — real data + written theses)

Each position carries: `company, sector, agent, conviction, horizon, finalScore, verdict, catalyst, target, stop, what, agentWhy, pmWhy, mgmt{label,read,tone}`. The written copy (the `what` / `agentWhy` / `pmWhy` strings) is in the source file's `_positions()` method in the logic `<script>` — lift those strings verbatim if you want the same content; they're grounded in each agent's methodology.

| Ticker | Company | Agent | Conv | Score | Verdict | Catalyst | Stop | Mgmt tone |
|---|---|---|---|---|---|---|---|---|
| CAT | Caterpillar | Catalyst | 8 | 8.6 | BUY_ELIGIBLE | Q2 earnings + infra capex | $940 | good |
| TGLS | Tecnoglass | Sentiment | 8 | 8.3 | BUY_ELIGIBLE | Insider cluster + backlog | — | good |
| MU | Micron | Quant | 7 | 7.6 | BUY_ELIGIBLE | HBM demand / earnings | $1,050 | good |
| SYK | Stryker | Contrarian | 8 | 8.0 | BUY_ELIGIBLE | Margin recovery / Mako | — | good |
| FCN | FTI Consulting | Sentiment | 7 | 7.4 | REDUCED | Restructuring demand | — | good |
| NCLH | Norwegian Cruise | Sentiment | 6 | 7.2 | BUY_ELIGIBLE | Summer booking season | $19 | warn |
| CLSK | CleanSpark | Crypto | 8 | 7.5 | BUY_ELIGIBLE | Hash rate + BTC reserves | $14 | warn |
| FDX | FedEx | Quant | 7 | 7.3 | BUY_ELIGIBLE | DRIVE program / earnings | $315 | bad |

---

## Implementation notes for the real app

- **The charts are seeded synthetic paths** (a deterministic PRNG keyed by ticker+period bridges a random walk between a start value and the current price). They look real and are stable across renders, but they are **not real history**. In production, replace the path generator with a real time-series endpoint:
  - `GET /api/positions/:ticker/history?period=1W` → `{ points: [{t, price}], periodChangePct, periodChangeAbs }`
  - `GET /api/portfolio/history?period=1W` → `{ portfolio: [...], spy: [...], portfolioChangePct, spyChangePct }`
  - Source: Yahoo Finance / your `refresh-prices.sh` cache for stocks, CoinGecko for crypto. The backend already fetches live prices 3×/day; you'll need to **persist a price series** (a new `state/price-history.json` or a small SQLite table) to feed these — the current state files only keep latest prices.
- **`what` / `agentWhy` / `pmWhy`** should come from your real pipeline: the agent thesis is the recommendation JSON in `memory/{agent}/{date}.json`; the PM rationale is the decision record in `logs/{today}.md` (or a structured `state/decisions.json`). The `what` (company description) can be a static lookup table or a one-time enrichment call.
- **Position management read** maps to the PM's 5 position-management questions (target hit / thesis broken / stale / down >10% / catalyst pending) — compute server-side and return `{label, read, tone}` per position so the app stays dumb.
- The chart math (domain fit, path building, green/red-by-direction, entry line) is all in the source `_series()` and `_navSeries()` methods — straightforward to port to any charting lib or keep as hand-rolled SVG.

## Files
- `Alpha Firm.dc.html` — updated source (open positions tappable, both charts, detail screen). The logic `<script>` holds `_positions()`, `_series()`, `_navSeries()` with all data + chart math.
- `Alpha Firm — standalone (open in browser).html` — self-contained; open to click through the new screens.
