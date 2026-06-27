// pm2 process file for the Alpha Firm dashboard API on the VPS.
// Start from the SAME user that cron runs run-check.sh as, from an interactive shell,
// so `claude` is on PATH and its Max-subscription login is available to manual runs:
//
//   cd alpha-firm/dashboard
//   set -a; source .env.dashboard; set +a      # loads API_TOKEN (+ optional FINNHUB_API_KEY)
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup    # persist across reboots (run the printed command)
module.exports = {
  apps: [
    {
      name: "alpha-firm-dashboard",
      script: "server.js",
      cwd: __dirname + "/..", // dashboard/
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
