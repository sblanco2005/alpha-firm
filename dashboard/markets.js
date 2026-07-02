// Markets tab data layer. Real quotes + time-series from Yahoo Finance (keyless,
// same source as navHistory), editorial catalog (definitions + desk reads), and a
// news feed from Finnhub. The prototype used seeded random walks; this replaces them
// with live series while keeping the kind-specific formatting (price / yield / level).

import { fetchDailyCloses, fetchIntraday } from "./navHistory.js";

// ── Catalog: 12 benchmarks. `yahoo` is the Yahoo Finance symbol. ──────────────────
// kind: 'price' → $ + %; 'yield' (10Y) → % + bps, accent-colored; 'level' (VIX/DXY) → 2-dec.
export const CATALOG = [
  { id: "SPY",   yahoo: "SPY",       kind: "price", name: "S&P 500",   full: "SPDR S&P 500 ETF",        sector: "US Equities",    color: "#4D7CFF",
    what: "The 500 largest US companies — the market's default heartbeat.",
    read: "The book's benchmark. Alpha is measured against this line; when SPY trends, beating it gets hard." },
  { id: "QQQ",   yahoo: "QQQ",       kind: "price", name: "Nasdaq 100", full: "Invesco QQQ Trust",       sector: "US Tech",        color: "#9B7BFF",
    what: "The 100 largest non-financial Nasdaq names — mega-cap tech and growth.",
    read: "Where the beta and the momentum live. Leads risk-on tapes and gets hit hardest when rates back up." },
  { id: "GLD",   yahoo: "GLD",       kind: "price", name: "Gold",       full: "SPDR Gold Shares",        sector: "Metals",         color: "#F5B731",
    what: "Physical gold in ETF form — the classic store-of-value hedge.",
    read: "A read on real yields and fear. Strength here often means the market is hedging the dollar or policy risk." },
  { id: "BTC",   yahoo: "BTC-USD",   kind: "price", name: "Bitcoin",    full: "Bitcoin / US Dollar",     sector: "Crypto",         color: "#F7931A", newsq: "Bitcoin",
    what: "The largest cryptocurrency — 24/7 risk sentiment and liquidity gauge.",
    read: "The high-beta risk barometer. Moves before equities on liquidity shifts; the crypto desk watches it closely." },
  { id: "US10Y", yahoo: "^TNX",      kind: "yield", name: "US 10Y",     full: "10-Year Treasury Yield",  sector: "Rates",          color: "#2DD4D4", newsq: "treasury yield",
    what: "The benchmark US government bond yield — the price of money for everything else.",
    read: "The gravity behind every valuation. Rising yields pressure growth multiples; falling yields lift them." },
  { id: "DXY",   yahoo: "DX-Y.NYB",  kind: "level", name: "US Dollar",  full: "US Dollar Index",         sector: "FX",             color: "#5FB0A8", newsq: "US dollar index",
    what: "The dollar against a basket of major currencies — global liquidity tide.",
    read: "A strong dollar tightens global conditions and pressures commodities, crypto and EM. Watch the direction." },
  { id: "IWM",   yahoo: "IWM",       kind: "price", name: "Russell 2K", full: "iShares Russell 2000 ETF", sector: "Small Caps",    color: "#E0729F",
    what: "2,000 US small-cap companies — the domestic, rate-sensitive economy.",
    read: "Breadth and risk appetite. When small caps lead, the rally is broad; when they lag, it's narrow and fragile." },
  { id: "VIX",   yahoo: "^VIX",      kind: "level", name: "VIX",        full: "CBOE Volatility Index",   sector: "Volatility",     color: "#FF6B57", newsq: "VIX",
    what: "The market's 30-day expected volatility — Wall Street's fear gauge.",
    read: "Drives the book's position sizing: under 25 = full size, 25–35 = trimmed, over 35 = defensive." },
  { id: "WTI",   yahoo: "CL=F",      kind: "price", name: "Crude Oil",  full: "WTI Crude Futures",       sector: "Energy",         color: "#C98A4B", newsq: "crude oil",
    what: "West Texas Intermediate crude — the pulse of global growth and inflation.",
    read: "An inflation and demand signal. Spikes feed into rates and squeeze the consumer; slides ease both." },
  { id: "TLT",   yahoo: "TLT",       kind: "price", name: "20Y+ Bonds", full: "iShares 20+ Year Treasury", sector: "Long Bonds",   color: "#6E8BE0",
    what: "Long-dated US Treasuries — the purest duration bet on falling yields.",
    read: "The mirror of the 10Y. Rallies when the market prices cuts or a growth scare; the flight-to-safety trade." },
  { id: "EEM",   yahoo: "EEM",       kind: "price", name: "Emerging",   full: "iShares MSCI Emerging Mkts", sector: "EM Equities",  color: "#E0A93F",
    what: "A basket of emerging-market equities — China, India, Brazil and more.",
    read: "A leveraged play on a weak dollar and global growth. Leads when liquidity is easy and DXY is falling." },
  { id: "ETH",   yahoo: "ETH-USD",   kind: "price", name: "Ethereum",   full: "Ethereum / US Dollar",    sector: "Crypto",         color: "#7E7CF0", newsq: "Ethereum",
    what: "The second-largest crypto and the leading smart-contract platform.",
    read: "Higher beta than bitcoin on risk-on days. The desk reads the ETH/BTC ratio for appetite within crypto." },
];

export const MARKET_IDS = new Set(CATALOG.map((c) => c.id));

// ── Custom benchmarks: any Yahoo Finance symbol the user adds. ────────────────────
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const CUSTOM_COLORS = ["#8BA6FF", "#59C3C3", "#E8A0BF", "#B9995E", "#7FB4E0", "#C58AE0", "#5FBF97", "#E0A05F"];

// Turn a stored custom-ticker record into a full catalog entry.
function toEntry(c) {
  return {
    id: c.id, yahoo: c.yahoo, kind: c.kind || "price", name: c.name, full: c.full || c.name,
    sector: c.sector || "Custom", color: c.color || CUSTOM_COLORS[0], custom: true,
    what: `${c.name} — a custom benchmark you track from Yahoo Finance (${c.yahoo}).`,
    read: "A custom benchmark you added; tracked live, outside the desk's core watchlist.",
  };
}

// Resolve the merged catalog (built-in 12 + the account's custom tickers).
function resolveCatalog(account) {
  const custom = Array.isArray(account?.customMarkets) ? account.customMarkets.map(toEntry) : [];
  return [...CATALOG, ...custom];
}

// Validate a user-typed Yahoo symbol (does it return price data?) and build a record.
export async function resolveCustom(symbol, index = 0) {
  const yahoo = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,15}$/.test(yahoo)) return null;
  try {
    const res = await fetch(`${YAHOO}/${encodeURIComponent(yahoo)}?range=5d&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const closes = (r?.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
    if (!r || closes.length < 2) return null;
    const m = r.meta || {};
    return {
      id: yahoo, yahoo,
      name: m.shortName || yahoo,
      full: m.longName || m.shortName || yahoo,
      sector: "Custom",
      color: CUSTOM_COLORS[index % CUSTOM_COLORS.length],
    };
  } catch {
    return null;
  }
}

// ── Period → Yahoo range + interval for the detail chart. ─────────────────────────
const PERIOD_MAP = {
  "1D":  { range: "1d",  interval: "5m",  intraday: true },
  LIVE:  { range: "1d",  interval: "5m",  intraday: true },
  "1W":  { range: "5d",  interval: "30m", intraday: true },
  "1M":  { range: "1mo", interval: "1d" },
  "3M":  { range: "3mo", interval: "1d" },
  YTD:   { range: "ytd", interval: "1d" },
  "1Y":  { range: "1y",  interval: "1d" },
};

const round = (n, d = 2) => (n == null ? null : +Number(n).toFixed(d));

// Downsample a numeric array to at most `n` evenly-spaced points (keep first + last).
function downsample(arr, n = 44) {
  if (arr.length <= n) return arr;
  const out = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

// Compute the quote fields for one catalog entry from a 1y daily series.
function quoteFrom(entry, series) {
  const closes = series.map((p) => p.close).filter((x) => x != null);
  if (closes.length < 2) return null;
  const latest = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const yearStart = String(new Date().getUTCFullYear()) + "-01-01";
  const ytdBase = (series.find((p) => p.date >= yearStart) || series[0]).close;
  const firstClose = closes[0];
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const isYield = entry.kind === "yield";
  return {
    id: entry.id, name: entry.name, full: entry.full, kind: entry.kind,
    sector: entry.sector, color: entry.color, custom: !!entry.custom,
    latest: round(latest, isYield || entry.kind === "level" ? 2 : 2),
    up: latest >= prev,
    dayPct: round((latest / prev - 1) * 100),
    dayBps: isYield ? round((latest - prev) * 100, 0) : null, // ^TNX is in %, Δ×100 = bps
    ytdPct: round((latest / ytdBase - 1) * 100),
    oneYPct: round((latest / firstClose - 1) * 100),
    range52: [round(lo), round(hi)],
    headline: entry.read,      // desk one-liner doubles as the card headline
    spark: downsample(series.slice(-66).map((p) => round(p.close)), 40), // ~last 3 months
  };
}

// Cache the board, keyed by the resolved symbol set (so adding a custom ticker busts it).
// Short TTL so the list price stays as live as the detail view (which fetches uncached).
let LIST_CACHE = { at: 0, sig: "", data: null };
const TTL = 90 * 1000;

export async function getMarkets(account = {}, { force = false } = {}) {
  const catalog = resolveCatalog(account);
  const sig = catalog.map((c) => c.yahoo).join(",");
  if (!force && LIST_CACHE.data && LIST_CACHE.sig === sig && Date.now() - LIST_CACHE.at < TTL) return LIST_CACHE.data;
  const seriesAll = await Promise.all(catalog.map((c) => fetchDailyCloses(c.yahoo, "1y").catch(() => [])));
  const markets = catalog.map((c, i) => quoteFrom(c, seriesAll[i])).filter(Boolean);
  const spy = markets.find((m) => m.id === "SPY");
  const vix = markets.find((m) => m.id === "VIX");
  const data = { asOf: new Date().toISOString(), regime: regimeFrom(spy, vix), markets };
  LIST_CACHE = { at: Date.now(), sig, data };
  return data;
}

// Macro regime read, derived from SPY direction + VIX level/direction.
function regimeFrom(spy, vix) {
  const sUp = (spy?.dayPct ?? 0) >= 0;
  const vUp = (vix?.dayPct ?? 0) >= 0;
  const vLevel = vix?.latest ?? null;
  let headline, note, tone;
  if (sUp && !vUp)       { headline = "Risk-on, narrowing";      tone = "bull";    note = "Equities firm as volatility bleeds lower — the tape is paying to take risk."; }
  else if (!sUp && vUp)  { headline = "Risk-off, widening";      tone = "bear";    note = "Stocks soft and volatility bid — the desk trims size and lets setups come to it."; }
  else if (sUp && vUp)   { headline = "Uneasy grind higher";     tone = "neutral"; note = "Prices up but hedges are being bought — a nervous rally, not a clean one."; }
  else                   { headline = "Low-conviction drift";    tone = "neutral"; note = "Equities easing into calm volatility — no clear regime; stay selective."; }
  if (vLevel != null && vLevel >= 30) { headline = "Defensive — high vol"; tone = "bear"; note = `VIX at ${vLevel.toFixed(1)} forces max-defensive sizing; capital preservation over offense.`; }
  return { headline, note, tone, vix: vLevel };
}

// ── Detail: series for a period + stats + editorial + news. ───────────────────────
export async function getMarketDetail(id, period = "3M", account = {}) {
  const entry = resolveCatalog(account).find((c) => c.id === id);
  if (!entry) return null;
  const p = PERIOD_MAP[period] || PERIOD_MAP["3M"];

  const [periodRows, yearRows, news] = await Promise.all([
    p.intraday
      ? fetchIntraday(entry.yahoo).then((rows) => rows.map((r) => ({ t: r.t, value: r.value })))
      : fetchDailyCloses(entry.yahoo, p.range).then((rows) => rows.map((r) => ({ date: r.date, value: round(r.close) }))),
    fetchDailyCloses(entry.yahoo, "1y").catch(() => []),
    fetchNews(entry).catch(() => []),
  ]);

  const quote = quoteFrom(entry, yearRows) || {};
  const vals = (periodRows || []).map((r) => r.value).filter((x) => x != null);
  const changePct = vals.length >= 2 ? round((vals[vals.length - 1] / vals[0] - 1) * 100) : null;
  const changeBps = entry.kind === "yield" && vals.length >= 2 ? round((vals[vals.length - 1] - vals[0]) * 100, 0) : null;

  return {
    id: entry.id, name: entry.name, full: entry.full, kind: entry.kind,
    sector: entry.sector, color: entry.color, custom: !!entry.custom,
    latest: quote.latest ?? (vals.length ? vals[vals.length - 1] : null),
    up: (changePct ?? 0) >= 0,
    period, changePct, changeBps,
    ytdPct: quote.ytdPct ?? null,
    oneYPct: quote.oneYPct ?? null,
    dayPct: quote.dayPct ?? null,
    dayBps: quote.dayBps ?? null,
    range52: quote.range52 ?? null,
    what: entry.what,
    read: entry.read,
    series: periodRows || [],
    news,
  };
}

// Per-symbol news from Yahoo Finance search (keyless, relevant to THIS ticker — works
// for equities, indices, futures, FX and crypto alike). Honest NEUTRAL tags; we don't
// fabricate a bull/bear read. Returns [] rather than showing unrelated headlines.
async function fetchNews(entry) {
  try {
    const q = entry.newsq || entry.yahoo;   // topic term for non-stock symbols, else the ticker
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=6`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const j = await res.json();
    const arr = Array.isArray(j?.news) ? j.news : [];
    return arr.slice(0, 3).map((n) => ({
      tag: "NEUTRAL",
      title: n.title || "—",
      source: n.publisher || "—",
      time: n.providerPublishTime ? relTime(n.providerPublishTime * 1000) : "",
      url: n.link || null,
    }));
  } catch {
    return [];
  }
}

function relTime(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
