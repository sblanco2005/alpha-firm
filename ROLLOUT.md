# Alpha Firm — Production Rollout (VPS API + iPhone app over Tailscale)

Goal: the **dashboard API** runs on the VPS (next to the firm + `claude`), your **iPhone**
runs a standalone EAS build, and they connect privately over **Tailscale** — works on
cellular, anywhere, no Mac/Metro involved.

```
iPhone (EAS standalone)  ──Tailscale (private, TLS)──►  VPS
  API base baked in                                      dashboard/server.js  :3001
  + bearer token                                         run-check.sh + state/*.json + claude (Max)
```

Decisions locked: firm already on VPS · Tailscale · EAS Build.
Prereq you must obtain: a **paid Apple Developer account** ($99/yr) for EAS device installs.

---

## Phase 0 — Push the code (done on the Mac)

The dashboard changes are committed and pushed to `origin/main` (private repo). Nothing
secret is committed (`.env*` and `.env.dashboard` are git-ignored).

---

## Phase 1 — Tailscale (VPS + iPhone)  → gives you the private URL

1. **VPS:** install + join your tailnet:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
2. **iPhone:** install the **Tailscale** app from the App Store, sign in to the same account.
3. **Expose the API as HTTPS on your tailnet** (valid cert, no port opening, tailnet-only):
   ```bash
   sudo tailscale serve --bg --https=443 http://localhost:3001
   tailscale serve status        # shows your URL, e.g. https://vps-name.tailXXXX.ts.net
   ```
   → **Copy that `https://<host>.ts.net` URL.** That's your `EXPO_PUBLIC_API_BASE`.

> Why `tailscale serve`: HTTPS with a real cert means no iOS plaintext/ATS issues and no
> token traveling in the clear — and it's reachable only from your own devices.

---

## Phase 2 — Deploy the API on the VPS

Assumes the repo is already cloned on the VPS (the firm runs from it). Run **as the same
user cron uses** for `run-check.sh` (so `claude` + its login are available to manual runs).

1. **Node 18+** (skip if present): `node -v` — else install via nodesource or `nvm`.
2. **Pull + install:**
   ```bash
   cd /path/to/alpha-firm && git pull
   cd dashboard && npm install
   ```
3. **Token:**
   ```bash
   cp .env.dashboard.example .env.dashboard
   # set API_TOKEN to:  openssl rand -hex 32   (save this value — the app needs it)
   nano .env.dashboard
   ```
4. **Run it (pm2 — inherits your shell env so `claude` is on PATH):**
   ```bash
   npm i -g pm2   # if needed
   set -a; source .env.dashboard; set +a
   pm2 start deploy/ecosystem.config.cjs
   pm2 save && pm2 startup   # run the command it prints, for reboot persistence
   ```
   (systemd alternative: `deploy/alpha-firm-dashboard.service` — fill the REPLACE_* values.)
5. **Verify locally on the VPS:**
   ```bash
   curl -s localhost:3001/api/portfolio -H "Authorization: Bearer $API_TOKEN" | head -c 200
   ```
   …and over Tailscale from another device: `https://<host>.ts.net/api/sessions` with the header.

---

## Phase 3 — Build the iPhone app (EAS) and install

On the **Mac**, in `mobile/`:

1. **One-time:** `npm i -g eas-cli && eas login` (free Expo account), then `eas init`
   (creates the EAS project; commit the `extra.eas.projectId` it adds to `app.json`).
2. **Bake in the URL + token:**
   - Put your Tailscale URL in `eas.json` → `build.preview.env.EXPO_PUBLIC_API_BASE`.
   - Set the token as an EAS env var (kept out of git):
     ```bash
     eas env:create --environment preview --name EXPO_PUBLIC_API_TOKEN --value <API_TOKEN> --visibility plaintext
     ```
3. **Build + install:**
   ```bash
   eas build --platform ios --profile preview
   ```
   EAS will ask for your Apple Developer login and register your iPhone (UDID) the first
   time. When it finishes it prints a QR / install link — open it **on the iPhone** to
   install the app (you may need to trust the profile in Settings → General → VPN & Device
   Management).

---

## Phase 4 — Connect & verify

- iPhone: Tailscale ON. Open the app — it loads live data from the VPS over `https://…ts.net`.
- Live tab → "Run check" hits the VPS, which runs `run-check.sh` on Claude Max; the session
  card updates when it finishes.

## Updating later
- **Backend:** `git pull && cd dashboard && npm install && pm2 restart alpha-firm-dashboard`.
- **App (JS-only change):** `eas update` (if you add expo-updates) or rebuild with `eas build`.

## Security notes
- Tailscale keeps the API private to your devices; the bearer token is defense-in-depth.
- `POST /api/check/run` is billable (a real Max run, ~15–30 min) and has no rate limit —
  the token + Tailscale are the only gates. Consider a confirm dialog in the app (easy add).
