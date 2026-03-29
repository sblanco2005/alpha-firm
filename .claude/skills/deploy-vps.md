---
name: deploy-vps
description: Deploy Alpha Firm to the Hostinger VPS and set up Claude Code CLI for automated trading
---

# Deploy Alpha Firm to Hostinger VPS

## Connection Details
- **SSH:** `clawd@187.77.31.178` (key-based auth via `~/.ssh/id_ed25519`)
- **Remote dir:** `/home/clawd/alpha-firm`
- **Service:** Cron-based (no systemd needed — Claude Code CLI runs on demand)

## First-Time Setup

1. **SSH in and clone the repo:**
   ```bash
   ssh clawd@187.77.31.178 "cd /home/clawd && git clone https://github.com/sblanco2005/alpha-firm.git"
   ```

2. **Install Claude Code CLI on VPS (if not already installed):**
   ```bash
   ssh clawd@187.77.31.178 "npm install -g @anthropic-ai/claude-code"
   ```

3. **Log in to Claude Max subscription (interactive — do this once manually):**
   ```bash
   ssh -t clawd@187.77.31.178 "claude login"
   ```

4. **Create .env on VPS with Brave API key:**
   ```bash
   ssh clawd@187.77.31.178 "echo 'BRAVE_API_KEY=BSAtgYEPO1mFjcK-HSIAGbrmFVafMUG' > /home/clawd/alpha-firm/.env"
   ```

5. **Run setup script:**
   ```bash
   ssh clawd@187.77.31.178 "cd /home/clawd/alpha-firm && chmod +x run-check.sh scripts/*.sh && ./scripts/setup.sh"
   ```

## Deploying Updates

1. **Push local changes to GitHub** (if not already pushed):
   ```bash
   git push origin main
   ```

2. **SSH into VPS and pull latest:**
   ```bash
   ssh clawd@187.77.31.178 "cd /home/clawd/alpha-firm && git pull origin main"
   ```

3. **Verify cron jobs are still active:**
   ```bash
   ssh clawd@187.77.31.178 "crontab -l | grep alpha-firm"
   ```

4. **Test a market check:**
   ```bash
   ssh clawd@187.77.31.178 "cd /home/clawd/alpha-firm && ./run-check.sh premarket"
   ```

## Checking Status

- **Portfolio status:**
  ```bash
  ssh clawd@187.77.31.178 "cd /home/clawd/alpha-firm && ./scripts/status.sh"
  ```

- **Today's log:**
  ```bash
  ssh clawd@187.77.31.178 "cat /home/clawd/alpha-firm/logs/$(date +%Y-%m-%d).log 2>/dev/null || echo 'No log for today'"
  ```

- **Cron log:**
  ```bash
  ssh clawd@187.77.31.178 "tail -50 /home/clawd/alpha-firm/logs/cron.log"
  ```

- **Claude Code auth status:**
  ```bash
  ssh clawd@187.77.31.178 "claude --version"
  ```

## Notes
- SSH key auth is already configured (no password needed for SSH)
- **Sudo password:** `Ariann@@@01` — use `echo 'Ariann@@@01' | sudo -S` for commands requiring sudo
- Claude Code CLI login is interactive — must be done once via `ssh -t` (allocates TTY)
- The VPS needs Node.js 18+ for Claude Code CLI and MCP servers
- jq is needed for state file management — install with `sudo apt install jq` if missing
- `.env` is gitignored — must be created manually on VPS
- If git pull fails due to local state file changes, use `git checkout -- state/` to reset state files before pulling (state is runtime data, not source)
- The dashboard (Vite + Express) can optionally run on VPS too — install with `cd dashboard && npm install && npm run server`
