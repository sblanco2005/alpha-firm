# Alpha Firm — Native iOS App (Expo / React Native)

A genuine native iOS app (not a webview), recreated from
`../design_handoff_alpha_firm_app/`. Built with Expo SDK 56 + React Native 0.85.
It talks to the existing Express API in `../dashboard/server.js` over your network.

## How to run & test on your iPhone

You need **two things running**: the API server (serves the data) and the app.

### 1. Start the API server (once)
```bash
cd ../dashboard
npm run server        # Express on :3001, reachable on your LAN
```
The server already binds all interfaces + sends CORS headers, so your phone can reach it.

### 2a. Fastest path — Expo Go (no Xcode, seconds to your phone)
```bash
cd ../mobile
npx expo start
```
- Install **Expo Go** from the App Store on your iPhone.
- Make sure the phone is on the **same Wi-Fi** as the Mac.
- Scan the QR code in the terminal with the iPhone Camera → opens in Expo Go.
- The app auto-detects the Mac's IP (from Expo) and hits `http://<mac-ip>:3001` for data — no manual config.

This is the loop to use while iterating.

### 2b. Real standalone app via Xcode (a true installed app / .ipa)
This compiles the native project and installs it on your device through Xcode.
One-time setup (CocoaPods isn't installed yet):
```bash
brew install cocoapods          # one-time
cd ../mobile
npx expo run:ios                # generates ios/, pod installs, builds, launches
# or: npx expo prebuild -p ios  → then open ios/AlphaFirm.xcworkspace in Xcode 16
```
To run on a **physical iPhone**: open `ios/*.xcworkspace` in Xcode → pick your
device → set a Team under Signing & Capabilities (free Apple ID works; the build
lasts 7 days) → press Run.

> Note: there's no iOS Simulator runtime installed on this Mac right now. Either
> download one in Xcode → Settings → Components, or just use a physical device.

## What's inside

| File | Role |
|---|---|
| `App.tsx` | Loads the 3 fonts, dark navigation theme, providers |
| `src/theme.ts` | Colors, fonts (per-weight families), formatters, agent identity |
| `src/api.ts` | `useApi()` hook; auto-resolves the API base to the Mac's IP via Expo |
| `src/navigation/` | Bottom tabs + a native stack for the Analysts drill-in |
| `src/components/` | `Screen` (bg + safe-area scroll), `GapChart` (SVG), `anim` (native Animated: fade/pulse/shimmer/grow/ping), shared `ui` |
| `src/screens/` | Portfolio · Desk (roster) · AnalystDetail · MarketCheck · Standings |

### Native-feel touches
- Real native push transition + edge swipe-back for the analyst scorecard.
- Haptics on every card/button tap and on the market-check verdict.
- The three real fonts (Bricolage Grotesque / Space Grotesk / JetBrains Mono).
- `react-native-svg` gap chart + tab icons; native linear gradients; `Animated`
  conviction bars, shimmer placeholders, pulsing/pinging live dots.

## Data wiring
Same endpoints as the PWA — including the three added to `dashboard/server.js`:
`/api/portfolio`, `/api/trade-log`, `/api/analysts`, `/api/analysts/:id`,
`/api/daily-state`. The **Live** screen is a coherent bundled demo (the PLTR
pipeline) because the debate/verdict aren't reconstructable from state JSON; the
session pill is live from `/api/daily-state`.

## TODO before shipping
- **App icon**: still the default Expo icon. Drop a 1024×1024 PNG at `assets/icon.png`.
- **Remote access**: for use off your Wi-Fi, expose the API via Cloudflare Tunnel /
  Tailscale + a bearer token, and set `EXPO_PUBLIC_API_BASE` to that URL.
- Optional `POST /api/check/run` to make the Live screen trigger a real check.
