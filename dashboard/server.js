import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getNavHistory, fetchDailyCloses, fetchIntraday } from "./navHistory.js";
import { POSITION_NARRATIVES } from "./positionNarratives.js";
import { startRun, getRunStatus, isRunning } from "./runCheck.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const STATE_DIR = join(__dirname, "..", "state");
const MEMORY_DIR = join(__dirname, "..", "memory");
const INITIAL_CAPITAL = 10000;

const app = express();
app.use(cors());
app.use(express.json());
app.use((_, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Optional bearer-token auth. Set API_TOKEN in the VPS environment to require it on
// every /api route; left unset (local dev) the API stays open. The mobile app sends
// the matching token via EXPO_PUBLIC_API_TOKEN.
const API_TOKEN = process.env.API_TOKEN || "";
if (API_TOKEN) {
  app.use("/api", (req, res, next) => {
    if (req.get("authorization") === `Bearer ${API_TOKEN}`) return next();
    res.status(401).json({ error: "unauthorized" });
  });
  console.log("API token auth: ENABLED");
}

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

// --- Live price fetching via Finnhub REST (same source the analyst agents use) ---
// Key comes from FINNHUB_API_KEY, falling back to the finnhub MCP config in
// .claude/settings.json so no extra env setup is needed.
function getFinnhubKey() {
  if (process.env.FINNHUB_API_KEY) return process.env.FINNHUB_API_KEY;
  try {
    const settings = JSON.parse(readFileSync(join(__dirname, "..", ".claude", "settings.json"), "utf-8"));
    return settings?.mcpServers?.finnhub?.env?.FINNHUB_API_KEY || "";
  } catch {
    return "";
  }
}

const FINNHUB_KEY = getFinnhubKey();

async function fetchAllPrices(tickers) {
  if (!tickers.length || !FINNHUB_KEY) return {};
  const results = {};
  // Finnhub's free tier has no batch quote, so fetch each symbol in parallel.
  await Promise.all(
    tickers.map(async (symbol) => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
        if (!res.ok) return;
        const data = await res.json();
        // Finnhub returns c=0 for unknown/closed symbols — treat 0/falsy as null
        // so the caller falls back to the last stored price.
        results[symbol] = data && data.c ? data.c : null;
      } catch {
        /* ignore — caller falls back to stored price */
      }
    })
  );
  return results;
}

async function enrichPortfolio(portfolio) {
  if (!portfolio?.positions?.length) return portfolio;

  const tickers = portfolio.positions.map((p) => p.ticker);
  const prices = await fetchAllPrices(tickers);

  let totalPositionValue = 0;
  const enrichedPositions = portfolio.positions.map((pos) => {
    // Prefer the live price; fall back to the last-known stored price; only fall
    // back to cost basis if we have nothing at all. This keeps returns/NAV correct
    // when the live price service (PortClaude :8001) is unavailable.
    const livePrice = prices[pos.ticker];
    const currentPrice = livePrice ?? pos.latest_price ?? null;
    const priceSource = livePrice != null ? "live" : pos.latest_price != null ? "stored" : "cost";
    if (currentPrice == null) {
      const holdingValue = pos.entry_price * (pos.shares || 1);
      totalPositionValue += holdingValue;
      return { ...pos, current_price: null, current_value: +holdingValue.toFixed(2), unrealized_pnl: null, unrealized_pnl_pct: null, price_source: "cost" };
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
      price_source: priceSource,
    };
  });

  const nav = +(portfolio.cash + totalPositionValue).toFixed(2);
  const highWaterMark = Math.max(portfolio.high_water_mark || 10000, nav);

  // SPY benchmark tracking — live SPY price, falling back to the last stored close.
  let spy_return_pct = null;
  let alpha = null;
  if (portfolio.spy_inception_price) {
    const spyPrices = await fetchAllPrices(["SPY"]);
    const spyPrice = spyPrices["SPY"] ?? portfolio.spy_closing_price ?? null;
    if (spyPrice) {
      spy_return_pct = +((spyPrice / portfolio.spy_inception_price - 1) * 100).toFixed(2);
      const portfolioPnlPct = +((nav - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100).toFixed(2);
      alpha = +(portfolioPnlPct - spy_return_pct).toFixed(2);
    }
  }
  // Last resort: stored values from portfolio.json so the screen is never blank.
  if (spy_return_pct == null) spy_return_pct = portfolio.spy_return_pct ?? null;
  if (alpha == null) alpha = portfolio.alpha ?? null;

  return {
    ...portfolio,
    positions: enrichedPositions,
    nav,
    high_water_mark: highWaterMark,
    prices_updated_at: new Date().toISOString(),
    spy_return_pct,
    alpha,
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
  const recs = {};
  for (const agent of AGENT_ORDER) {
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

// ───────────────────────── Analysts (roster + scorecard detail) ─────────────────────────
// Live numbers come from leaderboard.json (picks / executed / pnl), scorecards/*.json
// (win rate), and portfolio.json (current holdings). The editorial character text
// (nickname, blurb, edge, conviction calibration) is fixed metadata kept here.

const AGENT_ORDER = ["sentiment", "contrarian", "catalyst", "macro", "crypto", "quant"];

const ANALYST_META = {
  sentiment: {
    name: "Sentiment Scout", nickname: "The Whisperer", tagline: "reads the room",
    emoji: "📡", color: "#FF4D9D", baseStatus: "CONVICTION-WEIGHTED", statusType: "active",
    blurb: "Reads the room — social buzz, insider buying clusters, unusual options flow and narrative momentum. Ranks signals by historical reliability.",
    edge: "Insider buying clusters have the highest historical hit rate of any sentiment signal — it captures information flow before it shows up in price.",
    calibration: {
      c910: "Insider cluster + social buzz accelerating + narrative still early.",
      c78: "Strong sentiment shift with at least 2 confirming signals.",
      c56: "Interesting buzz but could be noise — single signal only.",
    },
  },
  contrarian: {
    name: "Contrarian", nickname: "The Rebel", tagline: "buys what's hated",
    emoji: "🃏", color: "#A05CFF", baseStatus: "CONVICTION 8+ TO EXECUTE", statusType: "active",
    blurb: "Hunts beaten-down names with improving fundamentals. Every thesis needs all three: cheap + improving + catalyst.",
    edge: "Captures the highest-magnitude moves when consensus is wrong — and is naturally uncorrelated with the other agents.",
    calibration: {
      c910: "Extreme pessimism + clear fundamental improvement + a catalyst forcing re-rating.",
      c78: "Significant pessimism with early improvement and a reasonable timeline.",
      c56: "Interesting value setup but no clear catalyst or improvement yet.",
    },
  },
  catalyst: {
    name: "Catalyst Agent", nickname: "The Clockwatcher", tagline: "trades dates",
    emoji: "⏱", color: "#4D7CFF", baseStatus: "CONVICTION 8+ TO EXECUTE", statusType: "active",
    blurb: "Trades known future events before the market fully prices them — earnings, FDA dates, FOMC, launches. Models both outcomes, only acts on mispricing.",
    edge: "Forward-looking specificity — known dates and quantifiable outcomes, not vibes. No date = no trade.",
    calibration: {
      c910: "Known date + specific asymmetry (market ~50%, you assess 75%+) + bounded downside.",
      c78: "Clear catalyst with probable outcome, some uncertainty on timing or scope.",
      c56: "Event identified but market may already be pricing the outcome.",
    },
  },
  macro: {
    name: "Macro Strategist", nickname: "The Big Picture", tagline: "0.5× muted",
    emoji: "🌐", color: "#F5B731", baseStatus: "BENCHED · 0.5× · CONV 8+ FLOOR", statusType: "benched",
    blurb: "The big picture — Fed policy, Treasury yields, geopolitical risk, currency and commodity cycles. Trades broad instruments on regime shifts.",
    edge: "Identifies regime transitions before they're consensus — risk-on→risk-off, growth→stagflation.",
    calibration: {
      c910: "Clear regime shift or policy pivot with asymmetric risk/reward.",
      c78: "Strong macro setup with confirming data and reasonable risk.",
      c56: "Interesting setup but conflicting signals or unclear timing.",
    },
  },
  crypto: {
    name: "Crypto Analyst", nickname: "On-Chain", tagline: "reads the chain",
    emoji: "₿", color: "#F7931A", baseStatus: "STOCKS ONLY · ETF PICKS BANNED", statusType: "restricted",
    blurb: "Bitcoin on-chain metrics, mining equities, ETF flows and regulatory catalysts. Watches exchange reserves, MVRV Z-Score and hash rate.",
    edge: "On-chain data provides signals — exchange outflows, hash-rate trends — that traditional analysts miss entirely.",
    calibration: {
      c910: "On-chain divergence (exchange outflows while price flat) + an upcoming catalyst.",
      c78: "Strong setup with one confirming signal — ETF flows, hash rate, regulatory clarity.",
      c56: "Interesting, but volatility could go either way.",
    },
  },
  quant: {
    name: "Momentum Quant", nickname: "The Machine", tagline: "resumes Jul 8",
    emoji: "📊", color: "#2DD4D4", baseStatus: "SUSPENDED → JUL 8", statusType: "suspended",
    blurb: "Pure technicals — a weighted model: momentum (3×), volume (2×), relative strength (2×), volatility (1×), catalyst proximity (2×).",
    edge: "Systematic scoring removes emotional bias and catches trend acceleration early.",
    calibration: {
      c910: "Multi-factor alignment — momentum, volume, relative strength all confirm + near-term catalyst.",
      c78: "Strong momentum with volume confirmation, one factor slightly off.",
      c56: "Decent setup but missing volume or relative-strength confirmation.",
    },
  },
};

const BADGE_FOR_STATUS = { benched: "BENCHED", suspended: "SUSPENDED", restricted: "STOCKS ONLY" };

function buildRoster() {
  const lb = readJSON(join(STATE_DIR, "leaderboard.json")) || {};
  const portfolio = readJSON(join(STATE_DIR, "portfolio.json")) || { positions: [] };

  // Firm leader = highest realized P&L. Computed live so the ⭐ follows performance.
  let leaderId = null, leaderPnl = -Infinity;
  for (const id of AGENT_ORDER) {
    const pnl = lb[id]?.total_pnl;
    if (pnl != null && pnl > leaderPnl) { leaderPnl = pnl; leaderId = id; }
  }

  return AGENT_ORDER.map((id) => {
    const meta = ANALYST_META[id];
    const l = lb[id] || {};
    const sc = readJSON(join(STATE_DIR, "scorecards", `${id}.json`)) || {};
    const holdings = (portfolio.positions || [])
      .filter((p) => p.agent === id)
      .map((p) => ({
        ticker: p.ticker,
        returnPct: p.entry_price ? +(((p.latest_price ?? p.entry_price) - p.entry_price) / p.entry_price * 100).toFixed(1) : null,
      }));
    const isLeader = id === leaderId;
    return {
      id,
      name: meta.name,
      nickname: meta.nickname,
      tagline: isLeader ? "reads the room" : meta.tagline,
      emoji: meta.emoji,
      color: meta.color,
      status: isLeader ? "⭐ FIRM LEADER" : meta.baseStatus,
      statusType: isLeader ? "leader" : meta.statusType,
      badge: isLeader ? null : (BADGE_FOR_STATUS[meta.statusType] || null),
      isLeader,
      picks: l.picks ?? null,
      executed: l.picks_executed ?? null,
      realizedPnl: l.total_pnl ?? null,
      winRate: sc.win_rate ?? null,
      blurb: meta.blurb,
      edge: meta.edge,
      calibration: meta.calibration,
      holdings,
    };
  });
}

app.get("/api/analysts", (_, res) => {
  res.json(buildRoster());
});

app.get("/api/analysts/:id", (req, res) => {
  const analyst = buildRoster().find((a) => a.id === req.params.id);
  analyst ? res.json(analyst) : res.status(404).json({ error: "unknown analyst" });
});

// Most recent market check — the six analysts' latest recommendations.
// Debate/verdict are not reconstructable from state files, so the Live screen
// renders those from its bundled showcase data; this hydrates the agent grid.
app.get("/api/check/latest", (_, res) => {
  const agents = [];
  for (const id of AGENT_ORDER) {
    const meta = ANALYST_META[id];
    const agentDir = join(MEMORY_DIR, id);
    let rec = null;
    try {
      const files = readdirSync(agentDir).filter((f) => f.endsWith(".json")).sort();
      if (files.length) rec = readJSON(join(agentDir, files[files.length - 1]));
    } catch { /* no memory yet */ }
    if (rec) {
      agents.push({
        agentId: id, name: meta.name.split(" ")[0], emoji: meta.emoji, color: meta.color,
        statusType: meta.statusType,
        ticker: rec.ticker ?? null, conviction: rec.conviction ?? null,
        note: rec.catalyst || rec.note || (rec.entry_thesis ? rec.entry_thesis.slice(0, 60) + "…" : null),
        ranAt: rec.date ?? null, session: rec.session ?? null,
      });
    }
  }
  const ranAt = agents.map((a) => a.ranAt).filter(Boolean).sort().pop() || null;
  res.json({ ranAt, agents, demo: agents.length === 0 });
});

// Pick detail — one analyst's latest recommendation, enriched for the Market Check
// drill-down. Every field is real: the thesis/catalyst/risk come from the agent's own
// memory rec, the PM rationale is the matching session's decision reason, company/sector
// are enriched via Finnhub. Fields the firm never emits (claim/facts arrays, a numeric
// score breakdown) are simply absent — the app omits those cards rather than fabricate.
app.get("/api/check/picks/:agentId", async (req, res) => {
  const agentId = req.params.agentId;
  const meta = ANALYST_META[agentId];
  if (!meta) return res.status(404).json({ error: "unknown agent" });

  let rec = null;
  try {
    const dir = join(MEMORY_DIR, agentId);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    if (files.length) rec = readJSON(join(dir, files[files.length - 1]));
  } catch { /* no memory yet */ }
  if (!rec) return res.status(404).json({ error: "no recommendation yet" });

  const ticker = String(rec.ticker || "").toUpperCase();

  // Outcome: BOUGHT if this agent holds it (or it was the day's buy); INELIGIBLE if the
  // agent's mandate blocks execution; otherwise PASSED.
  const portfolio = readJSON(join(STATE_DIR, "portfolio.json")) || { positions: [] };
  const dailyState = readJSON(join(STATE_DIR, "daily-state.json")) || {};
  const held = (portfolio.positions || []).some((p) => p.ticker === ticker && p.agent === agentId);
  const lastBuy = dailyState.last_buy || {};
  const wasBought = held || (lastBuy.ticker === ticker && lastBuy.agent === agentId);

  let outcome = wasBought ? "BOUGHT" : "PASSED";
  let outcomeMeta = wasBought ? "executed · logged" : "logged · not executed";
  if (!wasBought) {
    if (meta.statusType === "suspended") { outcome = "INELIGIBLE"; outcomeMeta = "execution suspended"; }
    else if (meta.statusType === "benched") { outcome = "INELIGIBLE"; outcomeMeta = "benched · 0.5× · conv-8 floor"; }
    else if (meta.statusType === "restricted" && rec.asset_type === "etf") { outcome = "INELIGIBLE"; outcomeMeta = "ETF picks banned"; }
  }

  // PM rationale = the decision reason from the matching session.
  const sessObj = dailyState[`${String(rec.session || "").toLowerCase()}_session`] || {};
  const pmWhy = sessObj.reason || null;
  const pmDecision = sessObj.decision ? String(sessObj.decision).toUpperCase() : null;

  // Company / sector — curated narrative first, else Finnhub profile2.
  const narrative = POSITION_NARRATIVES[ticker] || {};
  let company = narrative.company || ticker;
  let sector = narrative.sector || null;
  if (!sector && FINNHUB_KEY && rec.asset_type !== "crypto") {
    try {
      const p = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`).then((r) => r.json());
      if (p && (p.name || p.finnhubIndustry)) {
        company = narrative.company || p.name || company;
        sector = p.finnhubIndustry || null;
      }
    } catch { /* leave sector null */ }
  }

  // Live price + history for the chart.
  let price = rec.current_price ?? null;
  if (FINNHUB_KEY) {
    try {
      const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`).then((r) => r.json());
      if (q && q.c) price = q.c;
    } catch { /* keep rec price */ }
  }
  const [daily, intraday] = await Promise.all([
    fetchDailyCloses(ticker).catch(() => []),
    fetchIntraday(ticker).catch(() => []),
  ]);

  // target / horizon — recs phrase these as "15% in 4-6 weeks" or via numeric fields.
  let target = rec.target_return_pct != null ? `+${rec.target_return_pct}%` : null;
  let horizon = rec.horizon_days != null ? `${rec.horizon_days} days` : (rec.horizon || null);
  if (rec.target_return) {
    const tr = String(rec.target_return);
    if (!target) {
      const m = tr.match(/[+\-]?\d+(?:\.\d+)?\s*(?:[-–]\s*\d+(?:\.\d+)?)?\s*%?/);
      if (m) { let t = m[0].replace(/\s+/g, ""); if (!t.includes("%")) t += "%"; target = t; }
    }
    if (!horizon) { const h = tr.split(/\bin\b/i)[1]; if (h) horizon = h.trim(); }
  }

  res.json({
    agentId, agent: meta.name, nickname: meta.nickname, emoji: meta.emoji, color: meta.color,
    statusType: meta.statusType,
    ticker, company, sector: sector || "—", assetType: rec.asset_type || "stock",
    conviction: rec.conviction ?? null,
    recPrice: rec.current_price ?? null,
    price,
    target, horizon,
    catalyst: rec.catalyst || null,
    agentWhy: rec.entry_thesis || null,
    risk: rec.risk || null,
    outcome, outcomeMeta, pmDecision,
    pmWhy,
    session: rec.session || null, ranAt: rec.date || null,
    history: { daily, intraday },
  });
});

// Position detail — live numbers + curated narrative + price history for the chart.
app.get("/api/positions/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const portfolio = readJSON(join(STATE_DIR, "portfolio.json"));
  if (!portfolio) return res.status(404).json({ error: "not found" });
  try {
    const enriched = await enrichPortfolio(portfolio);
    const pos = (enriched.positions || []).find((p) => p.ticker === ticker);
    if (!pos) return res.status(404).json({ error: "no such position" });

    const narrative = POSITION_NARRATIVES[ticker] || {};
    const agentId = narrative.agentId || pos.agent;
    const meta = ANALYST_META[agentId] || {};
    const AGENT_LABEL = { sentiment: "Sentiment", contrarian: "Contrarian", catalyst: "Catalyst", macro: "Macro", crypto: "Crypto", quant: "Quant" };

    const price = pos.current_price ?? pos.latest_price ?? pos.entry_price;
    const shares = pos.shares || 1;
    const marketValue = +(price * shares).toFixed(2);
    const totalReturnAbs = +((price - pos.entry_price) * shares).toFixed(2);
    const totalReturnPct = pos.unrealized_pnl_pct ?? +(((price - pos.entry_price) / pos.entry_price) * 100).toFixed(2);

    // Price history for the chart (daily for 1W..1Y, intraday for LIVE/1D).
    const [daily, intraday] = await Promise.all([fetchDailyCloses(ticker), fetchIntraday(ticker)]);

    // Transaction history for this ticker (so the app can show how long it's been held).
    const tradeLog = readJSON(join(STATE_DIR, "trade-log.json"));
    const transactions = (tradeLog?.trades || [])
      .filter((t) => t.ticker === ticker && ["buy", "sell"].includes(String(t.action).toLowerCase()))
      .map((t) => {
        const action = String(t.action).toLowerCase();
        const shares = t.shares ?? null;
        let price = t.price ?? null;
        if (price == null && shares) {
          price = action === "buy"
            ? (t.total_cost ? t.total_cost / shares : null)
            : ((t.total_proceeds ?? t.proceeds ?? t.total_value) ? (t.total_proceeds ?? t.proceeds ?? t.total_value) / shares : null);
        }
        return { date: t.date, action, shares, price: price != null ? +price.toFixed(2) : null };
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const heldSince = pos.entry_date || (transactions.find((t) => t.action === "buy")?.date) || null;
    const heldDays = heldSince ? Math.max(0, Math.round((Date.now() - Date.parse(heldSince + "T00:00:00Z")) / 86400000)) : null;

    res.json({
      ticker,
      company: narrative.company || ticker,
      sector: narrative.sector || "—",
      agentId,
      agent: AGENT_LABEL[agentId] || pos.agent,
      agentColor: meta.color || "#888",
      emoji: meta.emoji || "•",
      shares,
      entryPrice: pos.entry_price,
      price,
      marketValue,
      totalReturnAbs,
      totalReturnPct,
      stop: pos.stop_loss ? `$${pos.stop_loss.toLocaleString("en-US")}` : (narrative.stopText || "—"),
      what: narrative.what || null,
      agentWhy: narrative.agentWhy || null,
      pmWhy: narrative.pmWhy || null,
      conv: narrative.conv ?? null,
      horizon: narrative.horizon || null,
      score: narrative.score || null,
      verdict: narrative.verdict || null,
      catalyst: narrative.catalyst || null,
      target: narrative.target || null,
      mgmt: narrative.mgmt || null,
      heldSince,
      heldDays,
      transactions,
      history: { daily, intraday },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Daily NAV equity curve for the performance chart (reconstructed + cached).
app.get("/api/nav-history", async (_, res) => {
  const portfolio = readJSON(join(STATE_DIR, "portfolio.json"));
  if (!portfolio) return res.status(404).json({ error: "not found" });
  try {
    const enriched = await enrichPortfolio(portfolio);
    const data = await getNavHistory(portfolio, { cash: enriched.cash, nav: enriched.nav });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Today's three market-check sessions with their decision + summary.
const SESSION_META = [
  { key: "premarket", label: "Premarket", timeET: "7:00 AM ET" },
  { key: "midday", label: "Midday", timeET: "12:30 PM ET" },
  { key: "closing", label: "Closing", timeET: "3:45 PM ET" },
];

app.get("/api/sessions", (_, res) => {
  const daily = readJSON(join(STATE_DIR, "daily-state.json")) || {};
  const cron = readJSON(join(STATE_DIR, "cron-status.json")) || { runs: [] };
  const today = new Date().toISOString().slice(0, 10);
  // Always surface the most recent recorded day (the "last run"), flagged stale if
  // it isn't today — so the app shows the latest summaries even before today runs.
  const stale = daily.date !== today;

  const sessions = SESSION_META.map((m) => {
    const s = daily[`${m.key}_session`];
    const run = (cron.runs || []).filter((r) => r.session === m.key).pop();
    const decisionRaw = s?.decision ? String(s.decision).toLowerCase() : null;
    const isBuy = decisionRaw === "buy";
    return {
      key: m.key,
      label: m.label,
      timeET: m.timeET,
      completed: !!s?.completed,
      decision: decisionRaw ? (isBuy ? "buy" : "pass") : null,
      ticker: isBuy ? (daily.last_buy?.ticker || null) : null,
      reason: s?.reason || null,
      vix: s?.vix_level ?? null,
      ranAt: s?.timestamp || run?.started_at || null,
      status: run?.status || (s?.completed ? "success" : null),
    };
  });

  res.json({
    date: daily.date || today,
    stale,
    checks: daily.checks ?? 0,
    bought: !!daily.bought,
    sessions,
    run: getRunStatus(),
  });
});

// Trigger a market check manually (runs the full pipeline on Claude Max, ~15-30 min).
app.post("/api/check/run", express.json(), (req, res) => {
  if (isRunning()) return res.status(409).json({ error: "a market check is already running", run: getRunStatus() });
  try {
    const info = startRun(req.body?.session || "midday", ROOT_DIR);
    res.status(202).json({ started: true, ...info });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/check/run-status", (_, res) => {
  res.json(getRunStatus());
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Alpha Firm API running on http://localhost:${PORT}`);
  console.log(`Serving state from: ${STATE_DIR}`);
});
