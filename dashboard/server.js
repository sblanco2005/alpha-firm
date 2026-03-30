import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const MEMORY_DIR = join(__dirname, "..", "memory");

const app = express();
app.use(cors());
app.use(express.json());
app.use((_, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

// --- Live price fetching via PortClaude (localhost:8001) ---

const PORTCLAUDE_URL = "http://localhost:8001";

async function fetchAllPrices(tickers) {
  if (!tickers.length) return {};
  try {
    const res = await fetch(`${PORTCLAUDE_URL}/v1/price/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: tickers.map((symbol) => ({ symbol })) }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const results = {};
    for (const ticker of tickers) {
      results[ticker] = data[ticker]?.currentPrice ?? null;
    }
    return results;
  } catch {
    return {};
  }
}

async function enrichPortfolio(portfolio) {
  if (!portfolio?.positions?.length) return portfolio;

  const tickers = portfolio.positions.map((p) => p.ticker);
  const prices = await fetchAllPrices(tickers);

  let totalPositionValue = 0;
  const enrichedPositions = portfolio.positions.map((pos) => {
    const currentPrice = prices[pos.ticker];
    if (currentPrice == null) {
      const holdingValue = pos.entry_price * (pos.shares || 1);
      totalPositionValue += holdingValue;
      return { ...pos, current_price: null, current_value: holdingValue, unrealized_pnl: null, unrealized_pnl_pct: null };
    }
    const holdingValue = currentPrice * (pos.shares || 1);
    const costBasis = pos.entry_price * (pos.shares || 1);
    const unrealizedPnl = holdingValue - costBasis;
    const unrealizedPnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
    totalPositionValue += holdingValue;
    return {
      ...pos,
      current_price: currentPrice,
      current_value: +holdingValue.toFixed(2),
      unrealized_pnl: +unrealizedPnl.toFixed(2),
      unrealized_pnl_pct: +unrealizedPnlPct.toFixed(2),
    };
  });

  const nav = +(portfolio.cash + totalPositionValue).toFixed(2);
  const highWaterMark = Math.max(portfolio.high_water_mark || 10000, nav);

  return {
    ...portfolio,
    positions: enrichedPositions,
    nav,
    high_water_mark: highWaterMark,
    prices_updated_at: new Date().toISOString(),
  };
}

app.get("/api/portfolio", async (_, res) => {
  const data = readJSON(join(STATE_DIR, "portfolio.json"));
  if (!data) return res.status(404).json({ error: "not found" });
  try {
    const enriched = await enrichPortfolio(data);
    res.json(enriched);
  } catch {
    res.json(data);
  }
});

// POST /api/refresh-prices — fetch live prices, update portfolio.json & outcomes.json, return updated data
app.post("/api/refresh-prices", async (_, res) => {
  const portfolio = readJSON(join(STATE_DIR, "portfolio.json"));
  if (!portfolio) return res.status(404).json({ error: "portfolio not found" });

  try {
    const enriched = await enrichPortfolio(portfolio);

    // Persist updated NAV and position prices to portfolio.json
    writeJSON(join(STATE_DIR, "portfolio.json"), {
      ...portfolio,
      nav: enriched.nav,
      high_water_mark: enriched.high_water_mark,
      last_updated: new Date().toISOString(),
    });

    // Also update outcomes.json checkpoints if any are due
    const outcomes = readJSON(join(STATE_DIR, "outcomes.json"));
    if (outcomes?.recommendations) {
      const today = new Date().toISOString().split("T")[0];
      const allTickers = [...new Set(outcomes.recommendations.filter(r => r.status === "tracking").map(r => r.ticker))];
      const prices = await fetchAllPrices(allTickers);
      let updated = false;

      for (const rec of outcomes.recommendations) {
        if (rec.status !== "tracking") continue;
        const price = prices[rec.ticker];
        if (price == null) continue;

        for (const [key, cp] of Object.entries(rec.checkpoints)) {
          if (cp.price != null) continue; // already filled
          if (cp.date > today) continue; // not due yet
          cp.price = price;
          cp.return_pct = +((((price - rec.entry_price) / rec.entry_price) * 100).toFixed(2));
          updated = true;

          if (cp.return_pct > (rec.peak_return_pct || 0)) {
            rec.peak_return_pct = cp.return_pct;
          }
        }

        // Check if horizon is filled — set final verdict
        const horizon = rec.checkpoints.horizon;
        if (horizon?.price != null && rec.final_verdict == null) {
          if (rec.peak_return_pct >= rec.target_return_pct) {
            rec.final_verdict = "win";
          } else if (horizon.return_pct > 0) {
            rec.final_verdict = "partial";
          } else {
            rec.final_verdict = "loss";
          }
          rec.status = "evaluated";
        }
      }

      if (updated) {
        outcomes.last_evaluated = today;
        writeJSON(join(STATE_DIR, "outcomes.json"), outcomes);
      }
    }

    res.json({ success: true, portfolio: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/leaderboard", (_, res) => {
  const data = readJSON(join(STATE_DIR, "leaderboard.json"));
  data ? res.json(data) : res.status(404).json({ error: "not found" });
});

app.get("/api/trade-log", (_, res) => {
  const data = readJSON(join(STATE_DIR, "trade-log.json"));
  data ? res.json(data) : res.status(404).json({ error: "not found" });
});

app.get("/api/daily-state", (_, res) => {
  const data = readJSON(join(STATE_DIR, "daily-state.json"));
  data ? res.json(data) : res.status(404).json({ error: "not found" });
});

app.get("/api/cron-status", (_, res) => {
  const data = readJSON(join(STATE_DIR, "cron-status.json"));
  data ? res.json(data) : res.json({ date: null, runs: [] });
});

app.get("/api/recommendations", (_, res) => {
  const agents = ["macro", "crypto", "quant", "sentiment", "contrarian"];
  const recs = {};
  for (const agent of agents) {
    const agentDir = join(MEMORY_DIR, agent);
    try {
      const files = readdirSync(agentDir).filter(f => f.endsWith(".json")).sort();
      if (files.length > 0) {
        const latest = readJSON(join(agentDir, files[files.length - 1]));
        if (latest) recs[agent] = latest;
      }
    } catch { /* no memory yet */ }
  }
  res.json(recs);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Alpha Firm API running on http://localhost:${PORT}`);
  console.log(`Serving state from: ${STATE_DIR}`);
});
