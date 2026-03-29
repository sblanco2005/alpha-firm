import express from "express";
import cors from "cors";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const MEMORY_DIR = join(__dirname, "..", "memory");

const app = express();
app.use(cors());

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

app.get("/api/portfolio", (_, res) => {
  const data = readJSON(join(STATE_DIR, "portfolio.json"));
  data ? res.json(data) : res.status(404).json({ error: "not found" });
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
