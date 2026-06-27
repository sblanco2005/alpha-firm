# Alpha Firm — Mobile App (PWA)

The iPhone companion to Alpha Firm, recreated from `design_handoff_alpha_firm_app/`.
It lives inside the existing `dashboard` project as a **second Vite entry point**
(`app.html`), so it shares the Express API server, build, and `node_modules` with
the desktop dashboard.

## Run it

```bash
cd alpha-firm/dashboard
npm run start          # boots the API (server.js :3001) + Vite dev server together
```

- Desktop dashboard: http://localhost:5173/
- **Mobile app:**     http://localhost:5173/app.html

Open the mobile URL in a desktop browser (use device toolbar / responsive mode for
the iPhone frame) or on an iPhone on the same network. On iPhone Safari →
**Share → Add to Home Screen** to install it as a standalone PWA.

## Screens (4 tabs)

| Tab | Screen | Data source |
|---|---|---|
| Portfolio | NAV, P&L, alpha-gap chart, open positions | `GET /api/portfolio` (live prices) + `/api/trade-log` |
| Analysts | "The Desk" roster → analyst scorecard detail | `GET /api/analysts`, `/api/analysts/:id` |
| Live | Market-check pipeline (animated showcase) | bundled demo + `/api/daily-state` session pill |
| League | Reward pool, leaderboard, "The Soul" | `GET /api/analysts` + `/api/portfolio` |

## Architecture notes

- `tokens.js` — colors, fonts, per-agent identity, formatters.
- `api.js` — `useApi(path, { pollMs })` hook; polls slowly since the backend updates ~3×/day.
- `ui.jsx` — shared primitives (avatar, gap chart, stat chips, loading/error).
- `TabBar.jsx` — bottom nav. `App.jsx` — shell (radial bg, safe-area insets, drill-in state).
- `screens/*` — one file per screen.

The **Live** screen renders a coherent bundled demo (the PLTR pipeline from the
prototype) because the bull/bear debate + PM verdict can't be reconstructed from the
state JSON. `GET /api/check/latest` already returns the six analysts' latest
recommendations; wire the grid (and, once logged, the debate/verdict) to it when the
backend persists a full check result to `state/last-check.json`.

## New API endpoints (added to `dashboard/server.js`)

- `GET /api/analysts` — roster: editorial character metadata merged with live
  `leaderboard.json` (picks/executed/pnl), `scorecards/*.json` (win rate), and
  current holdings from `portfolio.json`. Firm leader (⭐) is computed live by P&L.
- `GET /api/analysts/:id` — same object for one analyst (includes blurb, edge,
  conviction calibration, holdings).
- `GET /api/check/latest` — the six analysts' most recent recommendations.

## Not yet done / next steps

- Real icons: `public/app-icon.svg` is used for the manifest + apple-touch-icon.
  iOS prefers a PNG `apple-touch-icon` — export a 180×180 PNG for best home-screen fidelity.
- Auth + remote reachability (Cloudflare Tunnel / Tailscale + bearer token) before
  exposing the VPS API to the phone over the internet — see the handoff README.
- Optional `POST /api/check/run` to trigger `run-check.sh` from the Live screen
  (currently read-only / demo).
