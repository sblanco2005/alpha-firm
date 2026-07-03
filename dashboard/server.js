import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import { readFileSync, writeFileSync, readdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getNavHistory, fetchDailyCloses, fetchIntraday } from "./navHistory.js";
import { POSITION_NARRATIVES } from "./positionNarratives.js";
import { startRun, getRunStatus, isRunning } from "./runCheck.js";
import { getMarkets, getMarketDetail, MARKET_IDS, resolveCustom } from "./markets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const STATE_DIR = join(__dirname, "..", "state");
const MEMORY_DIR = join(__dirname, "..", "memory");
const INITIAL_CAPITAL = 10000;

// ── Personal account overlay (capital base + strategy reset) ─────────────────────
// Non-destructive: the firm's real $10k book keeps running; these transforms derive the
// *displayed* figures. factor = capital/10000 scales every dollar amount; a reset shows a
// clean 100%-cash slate. Percentages (returns, alpha) are factor-invariant.
const ACCOUNT_FILE = join(STATE_DIR, "account.json");
const DEFAULT_MARKETS = ["SPY", "QQQ", "GLD", "BTC", "US10Y", "DXY"];
function getAccount() {
  const a = readJSON(ACCOUNT_FILE) || {};
  const markets = Array.isArray(a.markets) && a.markets.length ? a.markets : DEFAULT_MARKETS;
  const customMarkets = Array.isArray(a.customMarkets) ? a.customMarkets : [];
  return { capital: Number.isFinite(a.capital) ? a.capital : INITIAL_CAPITAL, resetAt: a.resetAt || null, markets, customMarkets };
}
function daysSince(iso) {
  return Math.max(1, Math.floor((Date.now() - Date.parse(iso + "T00:00:00Z")) / 86400000) + 1); // inclusive
}
function scalePosition(p, f) {
  return {
    ...p,
    shares: p.shares != null ? +(p.shares * f).toFixed(4) : p.shares,
    current_value: p.current_value != null ? +(p.current_value * f).toFixed(2) : p.current_value,
    unrealized_pnl: p.unrealized_pnl != null ? +(p.unrealized_pnl * f).toFixed(2) : p.unrealized_pnl,
  };
}
function applyAccount(enriched) {
  const { capital, resetAt } = getAccount();
  const meta = { capital, reset: !!resetAt, trackingSince: resetAt, dayN: resetAt ? daysSince(resetAt) : null };
  if (resetAt) {
    return { ...enriched, ...meta, positions: [], nav: capital, cash: capital, high_water_mark: capital, alpha: 0, portfolio_pnl_pct: 0 };
  }
  const f = capital / INITIAL_CAPITAL;
  return {
    ...enriched, ...meta,
    nav: +(enriched.nav * f).toFixed(2),
    cash: +(enriched.cash * f).toFixed(2),
    high_water_mark: enriched.high_water_mark != null ? +(enriched.high_water_mark * f).toFixed(2) : enriched.high_water_mark,
    positions: (enriched.positions || []).map((p) => scalePosition(p, f)),
  };
}
function applyAccountNav(navData) {
  const { capital, resetAt } = getAccount();
  if (resetAt) {
    return { ...navData, points: (navData.points || []).map((p) => ({ ...p, nav: capital })), spy: (navData.spy || []).map((p) => ({ ...p, value: capital })) };
  }
  const f = capital / INITIAL_CAPITAL;
  if (f === 1) return navData;
  return {
    ...navData,
    points: (navData.points || []).map((p) => ({ ...p, nav: +(p.nav * f).toFixed(2) })),
    spy: (navData.spy || []).map((p) => ({ ...p, value: +(p.value * f).toFixed(2) })),
  };
}
function applyAccountRoster(roster) {
  const { capital, resetAt } = getAccount();
  if (resetAt) return roster.map((a) => ({ ...a, realizedPnl: 0, holdings: [] }));
  const f = capital / INITIAL_CAPITAL;
  if (f === 1) return roster;
  return roster.map((a) => ({ ...a, realizedPnl: a.realizedPnl != null ? +(a.realizedPnl * f).toFixed(2) : a.realizedPnl }));
}
function applyAccountTxns(t) {
  const { capital, resetAt } = getAccount();
  if (resetAt) return { ...t, realizedTotal: 0, open: [], closed: [], earlierClosedCount: 0, closedTotalCount: 0 };
  const f = capital / INITIAL_CAPITAL;
  if (f === 1) return t;
  return {
    ...t,
    realizedTotal: +(t.realizedTotal * f).toFixed(2),
    open: (t.open || []).map((o) => ({ ...o, shares: +(o.shares * f).toFixed(4) })),
    closed: (t.closed || []).map((c) => ({ ...c, shares: +(c.shares * f).toFixed(4), realizedPnl: +(c.realizedPnl * f).toFixed(2) })),
  };
}
function applyAccountPositionDetail(d) {
  const f = getAccount().capital / INITIAL_CAPITAL;
  if (f === 1) return d;
  return {
    ...d,
    shares: d.shares != null ? +(d.shares * f).toFixed(4) : d.shares,
    marketValue: d.marketValue != null ? +(d.marketValue * f).toFixed(2) : d.marketValue,
    totalReturnAbs: d.totalReturnAbs != null ? +(d.totalReturnAbs * f).toFixed(2) : d.totalReturnAbs,
    transactions: Array.isArray(d.transactions)
      ? d.transactions.map((t) => ({ ...t, shares: t.shares != null ? +(t.shares * f).toFixed(4) : t.shares }))
      : d.transactions,
  };
}

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

// Cache live quotes so app polling doesn't hammer Finnhub's free tier (60 calls/min).
// Each symbol is refetched at most once per TTL window; a failed refresh keeps the last
// good price. Tune with PRICE_CACHE_MINUTES (default 15). `force` bypasses the cache —
// used by the explicit POST /api/refresh-prices so a manual refresh is always live.
const PRICE_TTL_MS = Math.max(1, Number(process.env.PRICE_CACHE_MINUTES) || 15) * 60 * 1000;
const priceCache = new Map(); // symbol -> { price: number|null, ts: number }

async function fetchAllPrices(tickers, { force = false } = {}) {
  if (!tickers.length || !FINNHUB_KEY) return {};
  const now = Date.now();
  const results = {};
  const stale = [];
  for (const symbol of tickers) {
    const hit = priceCache.get(symbol);
    if (!force && hit && now - hit.ts < PRICE_TTL_MS) results[symbol] = hit.price;
    else stale.push(symbol);
  }
  // Only hit Finnhub for symbols whose cache is missing/expired. No batch quote on free tier.
  await Promise.all(
    stale.map(async (symbol) => {
      let price = null;
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
        if (res.ok) {
          const data = await res.json();
          price = data && data.c ? data.c : null; // c=0 for unknown/closed → null
        }
      } catch { /* keep last good price below */ }
      const prev = priceCache.get(symbol);
      // Preserve the last good price on a failed refresh; always bump ts to respect the TTL.
      const finalPrice = price != null ? price : (prev ? prev.price : null);
      priceCache.set(symbol, { price: finalPrice, ts: now });
      results[symbol] = finalPrice;
    })
  );
  return results;
}

// Company name + sector barely change — cache profile lookups for a day.
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const profileCache = new Map(); // symbol -> { name, sector, ts }

async function fetchProfile(symbol) {
  if (!FINNHUB_KEY) return null;
  const now = Date.now();
  const hit = profileCache.get(symbol);
  if (hit && now - hit.ts < PROFILE_TTL_MS) return hit;
  try {
    const p = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`).then((r) => r.json());
    const rec = { name: p?.name || null, sector: p?.finnhubIndustry || null, ts: now };
    profileCache.set(symbol, rec);
    return rec;
  } catch {
    return hit || null;
  }
}

async function enrichPortfolio(portfolio, { force = false } = {}) {
  if (!portfolio?.positions?.length) return portfolio;

  const tickers = portfolio.positions.map((p) => p.ticker);
  const prices = await fetchAllPrices(tickers, { force });

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
    const spyPrices = await fetchAllPrices(["SPY"], { force });
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

// Personal account (capital base + strategy reset). Non-destructive overlay.
app.get("/api/account", (_, res) => res.json(getAccount()));
app.post("/api/account", async (req, res) => {
  const cur = getAccount();
  const body = req.body || {};
  let { capital, resetAt, markets, customMarkets } = cur;
  if (body.capital !== undefined) {
    const n = Math.round(Number(body.capital));
    if (!Number.isFinite(n) || n < 0 || n > 100000000) return res.status(400).json({ error: "capital must be 0–100,000,000" });
    capital = n;
  }
  if (body.resetAt !== undefined) resetAt = body.resetAt ? String(body.resetAt).slice(0, 10) : null;

  // Add a custom Yahoo-Finance ticker → validate it returns data, then select it.
  if (body.addCustom !== undefined) {
    const raw = String(body.addCustom || "").trim().toUpperCase();
    if (MARKET_IDS.has(raw)) {                       // already a built-in — just select it
      if (!markets.includes(raw)) { if (markets.length >= 12) return res.status(400).json({ error: "at maximum (12) — remove one first" }); markets = [...markets, raw]; }
    } else if (customMarkets.some((c) => c.id === raw)) {
      if (!markets.includes(raw)) { if (markets.length >= 12) return res.status(400).json({ error: "at maximum (12) — remove one first" }); markets = [...markets, raw]; }
    } else {
      if (markets.length >= 12) return res.status(400).json({ error: "at maximum (12) — remove one first" });
      const entry = await resolveCustom(raw, customMarkets.length);
      if (!entry) return res.status(400).json({ error: `Couldn't find "${raw}" on Yahoo Finance. Use the Yahoo symbol (e.g. NVDA, ^GSPC, EURUSD=X).` });
      customMarkets = [...customMarkets, entry];
      markets = [...markets, entry.id];
    }
  }

  // Remove a custom ticker entirely (from the library + the selection).
  if (body.removeCustom !== undefined) {
    const rid = String(body.removeCustom).toUpperCase();
    customMarkets = customMarkets.filter((c) => c.id !== rid);
    markets = markets.filter((x) => x !== rid);
    if (markets.length === 0) markets = DEFAULT_MARKETS;
  }

  if (body.markets !== undefined) {
    const valid = new Set([...MARKET_IDS, ...customMarkets.map((c) => c.id)]);
    const ids = Array.isArray(body.markets) ? [...new Set(body.markets.map(String))].filter((x) => valid.has(x)) : [];
    if (ids.length < 1 || ids.length > 12) return res.status(400).json({ error: "markets must have 1–12 valid tickers" });
    markets = ids;
  }

  writeJSON(ACCOUNT_FILE, { capital, resetAt, markets, customMarkets });
  res.json({ capital, resetAt, markets, customMarkets });
});

app.get("/api/portfolio", async (_, res) => {
  const data = readJSON(join(STATE_DIR, "portfolio.json"));
  if (!data) return res.status(404).json({ error: "not found" });
  try {
    const enriched = await enrichPortfolio(data);
    res.json(applyAccount(enriched));
  } catch {
    res.json(data);
  }
});

// POST /api/refresh-prices — fetch live prices, update portfolio.json & outcomes.json, return updated data
app.post("/api/refresh-prices", async (_, res) => {
  const portfolio = readJSON(join(STATE_DIR, "portfolio.json"));
  if (!portfolio) return res.status(404).json({ error: "portfolio not found" });

  try {
    const enriched = await enrichPortfolio(portfolio, { force: true });

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
      const prices = await fetchAllPrices(allTickers, { force: true });
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
    emoji: "📡", color: "#FF4D9D", baseStatus: "ACTIVE", statusType: "active",
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
    emoji: "🃏", color: "#A05CFF", baseStatus: "ACTIVE", statusType: "active",
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
    emoji: "⏱", color: "#4D7CFF", baseStatus: "ACTIVE", statusType: "active",
    blurb: "Trades known future events before the market fully prices them — earnings, FDA dates, FOMC, launches. Models both outcomes, only acts on mispricing.",
    edge: "Forward-looking specificity — known dates and quantifiable outcomes, not vibes. No date = no trade.",
    calibration: {
      c910: "Known date + specific asymmetry (market ~50%, you assess 75%+) + bounded downside.",
      c78: "Clear catalyst with probable outcome, some uncertainty on timing or scope.",
      c56: "Event identified but market may already be pricing the outcome.",
    },
  },
  macro: {
    name: "Macro Strategist", nickname: "The Big Picture", tagline: "the big picture",
    emoji: "🌐", color: "#F5B731", baseStatus: "ACTIVE", statusType: "active",
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
    emoji: "₿", color: "#F7931A", baseStatus: "ACTIVE", statusType: "active",
    blurb: "Bitcoin on-chain metrics, mining equities, ETF flows and regulatory catalysts. Watches exchange reserves, MVRV Z-Score and hash rate.",
    edge: "On-chain data provides signals — exchange outflows, hash-rate trends — that traditional analysts miss entirely.",
    calibration: {
      c910: "On-chain divergence (exchange outflows while price flat) + an upcoming catalyst.",
      c78: "Strong setup with one confirming signal — ETF flows, hash rate, regulatory clarity.",
      c56: "Interesting, but volatility could go either way.",
    },
  },
  quant: {
    name: "Momentum Quant", nickname: "The Machine", tagline: "the machine",
    emoji: "📊", color: "#2DD4D4", baseStatus: "ACTIVE", statusType: "active",
    blurb: "Pure technicals — a weighted model: momentum (3×), volume (2×), relative strength (2×), volatility (1×), catalyst proximity (2×).",
    edge: "Systematic scoring removes emotional bias and catches trend acceleration early.",
    calibration: {
      c910: "Multi-factor alignment — momentum, volume, relative strength all confirm + near-term catalyst.",
      c78: "Strong momentum with volume confirmation, one factor slightly off.",
      c56: "Decent setup but missing volume or relative-strength confirmation.",
    },
  },
};

// Run 2 (2026-07-02): all agent restrictions cleared — statuses hardcoded to ACTIVE above.
// If the lessons pipeline restores a restriction, set statusType/baseStatus there again.
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
  res.json(applyAccountRoster(buildRoster()));
});

app.get("/api/analysts/:id", (req, res) => {
  const analyst = applyAccountRoster(buildRoster()).find((a) => a.id === req.params.id);
  analyst ? res.json(analyst) : res.status(404).json({ error: "unknown analyst" });
});

// Per-agent executed-trade ledger: current holdings (open/unrealized) + sold positions
// (closed/realized). The realized total is the authoritative leaderboard figure; the
// "earlier closed" net row is derived from it so the screen always reconciles.
app.get("/api/analysts/:id/transactions", async (req, res) => {
  const agentId = req.params.id;
  const meta = ANALYST_META[agentId];
  if (!meta) return res.status(404).json({ error: "unknown analyst" });

  const portfolio = readJSON(join(STATE_DIR, "portfolio.json")) || { positions: [], sold_positions: [] };
  const lb = readJSON(join(STATE_DIR, "leaderboard.json")) || {};
  const sc = readJSON(join(STATE_DIR, "scorecards", `${agentId}.json`)) || {};

  let enriched = portfolio;
  try { enriched = await enrichPortfolio(portfolio); } catch { /* live prices optional */ }

  const open = (enriched.positions || [])
    .filter((p) => p.agent === agentId)
    .map((p) => ({
      ticker: p.ticker,
      shares: p.shares || 1,
      avgCost: p.entry_price,
      lastPrice: p.current_price ?? p.latest_price ?? p.entry_price,
    }));

  const allClosed = (portfolio.sold_positions || [])
    .filter((s) => s.agent === agentId)
    .sort((a, b) => (String(a.sell_date) < String(b.sell_date) ? 1 : String(a.sell_date) > String(b.sell_date) ? -1 : 0)); // recent first

  const CAP = 6;
  const closed = allClosed.slice(0, CAP).map((s) => ({
    ticker: s.ticker,
    shares: s.shares,
    avgCost: s.entry_price,
    exitPrice: s.sell_price,
    soldAt: s.sell_date || null,
    realizedPnl: s.realized_pnl != null ? s.realized_pnl : +(((s.sell_price - s.entry_price) * (s.shares || 1))).toFixed(2),
  }));
  const earlierClosedCount = Math.max(0, allClosed.length - closed.length);

  const realizedTotal = lb[agentId]?.total_pnl != null
    ? lb[agentId].total_pnl
    : +allClosed.reduce((sum, x) => sum + (x.realized_pnl || 0), 0).toFixed(2);

  res.json(applyAccountTxns({
    agentId,
    name: meta.name,
    emoji: meta.emoji,
    color: meta.color,
    realizedTotal,
    winRate: sc.win_rate ?? null,
    open,
    closed,
    earlierClosedCount,
    closedTotalCount: allClosed.length,
  }));
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
    const prof = await fetchProfile(ticker);
    if (prof && (prof.name || prof.sector)) {
      company = narrative.company || prof.name || company;
      sector = prof.sector || null;
    }
  }

  // Live price (cached) + history for the chart.
  let price = rec.current_price ?? null;
  const q = await fetchAllPrices([ticker]);
  if (q[ticker] != null) price = q[ticker];
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
    // Structured summary (present once agents emit it; app omits these cards when null).
    coreClaim: rec.core_claim || null,
    supportingFacts: Array.isArray(rec.supporting_facts) ? rec.supporting_facts.filter(Boolean) : null,
    whyNow: rec.why_now || null,
    falsification: rec.falsification || null,
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

    res.json(applyAccountPositionDetail({
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
    }));
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
    res.json(applyAccountNav(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Markets tab — all 12 benchmarks (live quote + sparkline + desk read) + macro regime.
app.get("/api/markets", async (_, res) => {
  try {
    res.json(await getMarkets(getAccount()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// One benchmark's detail — period series, stats, definition, desk read, news feed.
app.get("/api/markets/:id", async (req, res) => {
  try {
    const detail = await getMarketDetail(req.params.id.toUpperCase(), req.query.period || "3M", getAccount());
    detail ? res.json(detail) : res.status(404).json({ error: "unknown market" });
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
  const today = marketToday().date; // US Eastern — matches how daily-state.date is written
  // Always surface the most recent recorded day (the "last run"), flagged stale if
  // it isn't today — so the app shows the latest summaries even before today runs.
  const stale = daily.date !== today;

  const sessions = SESSION_META.map((m) => {
    const s = daily[`${m.key}_session`];
    const run = (cron.runs || []).filter((r) => r.session === m.key).pop();
    // A session counts as run if it's in the day's sessions_completed list (authoritative,
    // reset each trading day) OR its own timestamp matches the board's date. Trusting
    // sessions_completed avoids a UTC/ET skew between daily-state.date and the session's
    // timestamp; the timestamp check still excludes stale leftover objects from a prior day.
    const inCompleted = Array.isArray(daily.sessions_completed) && daily.sessions_completed.includes(m.key);
    const ranToday = !!s?.completed && (inCompleted || String(s?.timestamp || "").slice(0, 10) === daily.date);
    const decisionRaw = ranToday && s?.decision ? String(s.decision).toLowerCase() : null;
    const isBuy = decisionRaw === "buy";
    return {
      key: m.key,
      label: m.label,
      timeET: m.timeET,
      completed: ranToday,
      decision: decisionRaw ? (isBuy ? "buy" : "pass") : null,
      ticker: isBuy ? (daily.last_buy?.ticker || null) : null,
      reason: ranToday ? (s?.reason || null) : null,
      vix: ranToday ? (s?.vix_level ?? null) : null,
      ranAt: ranToday ? (s?.timestamp || null) : null,
      status: ranToday ? (run?.status || "success") : "pending",
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

// Undo one completed session's state so it can be re-run cleanly, without double-counting.
// Drops it from daily-state (sessions_completed, checks, {session}_session) and removes its
// outcome recommendations for today. Trades are NOT touched — the caller guarantees (via the
// block-if-bought guard) that this session did not execute a buy. Once daily-state shows the
// session as not-run, run-check.sh's own "3 checks done" guard passes and the orchestrator
// re-runs it normally — so no changes to run-check.sh or the orchestrator are needed.
// Append a timestamped line to the day's run log (same file + format run-check.sh uses),
// so a forced rollback is visible inline with the run it precedes.
function appendRunLog(today, line) {
  try {
    // US Eastern timestamp to match run-check.sh's log() prefix.
    const ts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
    appendFileSync(join(ROOT_DIR, "logs", `${today}.log`), `[${ts}] ${line}\n`);
  } catch { /* logging is best-effort */ }
}

function rollbackSession(session, today) {
  const summary = { checksFrom: null, checksTo: null, prunedOutcomes: 0 };
  const dsPath = join(STATE_DIR, "daily-state.json");
  const daily = readJSON(dsPath);
  if (daily) {
    const wasCompleted = Array.isArray(daily.sessions_completed) && daily.sessions_completed.includes(session);
    summary.checksFrom = daily.checks ?? null;
    if (Array.isArray(daily.sessions_completed)) daily.sessions_completed = daily.sessions_completed.filter((s) => s !== session);
    if (wasCompleted && Number.isFinite(daily.checks)) daily.checks = Math.max(0, daily.checks - 1);
    summary.checksTo = daily.checks ?? null;
    delete daily[`${session}_session`];
    writeJSON(dsPath, daily);
  }
  const ocPath = join(STATE_DIR, "outcomes.json");
  const outcomes = readJSON(ocPath);
  if (outcomes && Array.isArray(outcomes.recommendations)) {
    const before = outcomes.recommendations.length;
    outcomes.recommendations = outcomes.recommendations.filter(
      (r) => !(String(r.date || "").slice(0, 10) === today && String(r.session || "").toLowerCase() === session)
    );
    summary.prunedOutcomes = before - outcomes.recommendations.length;
    if (summary.prunedOutcomes) writeJSON(ocPath, outcomes);
  }
  appendRunLog(today, `FORCE RE-RUN (app): rolled back ${session} — checks ${summary.checksFrom}→${summary.checksTo}, pruned ${summary.prunedOutcomes} outcome(s). Re-running now.`);
  return summary;
}

// US market holidays run-check.sh skips (keep in sync with run-check.sh's HOLIDAYS).
const US_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
]);
// The firm's trading day is US Eastern (market time) — NOT the VPS clock (UTC), which
// rolls over at 8pm ET and would wrongly flip the date/holiday mid-evening. run-check.sh
// computes TODAY the same way (TZ=America/New_York).
function marketToday() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
  return { date, dow };
}

// Trigger a market check manually (runs the full pipeline on Claude Max, ~15-30 min).
// Refuses up front for the same reasons run-check.sh would silently skip (weekend, holiday)
// so the app gets a clear message instead of a no-op. A session that already ran today is
// refused with { blocked:"duplicate", canForce:true } so the app can offer an explicit
// override; { force:true } re-runs it after rolling back its state — but a session that
// executed a BUY is blocked (unwinding a real trade is the firm reset's job, not a re-run's).
app.post("/api/check/run", express.json(), (req, res) => {
  if (isRunning()) return res.status(409).json({ error: "a market check is already running", run: getRunStatus() });
  const session = String(req.body?.session || "midday").toLowerCase();
  const force = req.body?.force === true;
  if (!["premarket", "midday", "closing"].includes(session)) return res.status(400).json({ error: "invalid session" });

  const { date: today, dow } = marketToday();
  if (dow === 0 || dow === 6) return res.status(409).json({ error: "Markets are closed this weekend — checks run Mon–Fri.", blocked: "closed" });
  if (US_HOLIDAYS.has(today)) return res.status(409).json({ error: `${today} is a US market holiday — no market check runs today.`, blocked: "closed" });

  const daily = readJSON(join(STATE_DIR, "daily-state.json")) || {};
  const sessObj = daily[`${session}_session`] || {};
  const completedToday =
    daily.date === today &&
    ((Array.isArray(daily.sessions_completed) && daily.sessions_completed.includes(session)) ||
      (sessObj.completed && String(sessObj.timestamp || "").slice(0, 10) === today));

  if (completedToday && !force) {
    return res.status(409).json({
      error: `Today's ${session} check already ran.`,
      blocked: "duplicate",
      canForce: true,
      decision: sessObj.decision ? String(sessObj.decision).toLowerCase() : null,
    });
  }
  if (completedToday && force) {
    const bought =
      String(sessObj.decision || "").toLowerCase() === "buy" ||
      (daily.bought && String(daily.last_buy?.session || "").toLowerCase() === session);
    if (bought) {
      return res.status(409).json({
        error: `The ${session} check executed a BUY today — a re-run can't unwind a real trade. Use Fresh Start to reset the book.`,
        blocked: "bought",
      });
    }
    try { rollbackSession(session, today); }
    catch (e) { return res.status(500).json({ error: `couldn't roll back ${session}: ${e.message}` }); }
  }

  try {
    const info = startRun(session, ROOT_DIR);
    res.status(202).json({ started: true, forced: completedToday && force, ...info });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/check/run-status", (_, res) => {
  res.json(getRunStatus());
});

// ── Firm fresh start (DESTRUCTIVE) ──────────────────────────────────────────
// Runs scripts/reset_fresh_start.py --apply: archives the current run to runs/,
// resets the REAL book to $10,000 with a live-fetched SPY baseline, keeps agent
// memory, demotes lessons-learned rules to candidate. Requires { confirm: true }.
app.post("/api/firm/reset", express.json(), (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: "confirm:true required — this archives the current run and resets the real book" });
  }
  if (isRunning()) {
    return res.status(409).json({ error: "a market check is running — reset after it finishes", run: getRunStatus() });
  }
  const py = spawn("python3", [join(ROOT_DIR, "scripts", "reset_fresh_start.py"), "--apply"], { cwd: ROOT_DIR });
  let out = "", errOut = "";
  py.stdout.on("data", (d) => (out += d));
  py.stderr.on("data", (d) => (errOut += d));
  py.on("error", (e) => { if (!res.headersSent) res.status(500).json({ ok: false, error: e.message }); });
  py.on("close", (code) => {
    if (res.headersSent) return;
    if (code === 0) {
      // Clear the personal overlay too, so the app shows the real fresh book.
      const cur = getAccount();
      writeJSON(ACCOUNT_FILE, { ...cur, resetAt: null });
      res.json({ ok: true, output: out.trim() });
    } else {
      res.status(500).json({ ok: false, code, output: out.trim(), error: errOut.trim() });
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Alpha Firm API running on http://localhost:${PORT}`);
  console.log(`Serving state from: ${STATE_DIR}`);
});
