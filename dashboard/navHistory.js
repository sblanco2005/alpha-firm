// Reconstructs a daily NAV equity curve (for the Robinhood-style performance chart)
// from the authoritative position ledger in portfolio.json — current `positions`
// (entry_date→now) and `sold_positions` (entry_date→sell_date), each with shares
// and entry/exit prices — valued on each trading day with Yahoo Finance daily
// closes. This reconciles far better than replaying the messy trade log. The final
// point is anchored to the live portfolio NAV so "today" matches the Portfolio screen.

const INITIAL_CAPITAL = 10000;
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";

const isoDay = (tsSeconds) => new Date(tsSeconds * 1000).toISOString().slice(0, 10);

// Intraday series for one symbol (today, ~2-min bars) → [{ t, value }]. For LIVE/1D.
export async function fetchIntraday(symbol) {
  try {
    const res = await fetch(`${YAHOO}/${encodeURIComponent(symbol)}?range=1d&interval=2m`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts = r?.timestamp;
    const closes = r?.indicators?.quote?.[0]?.close;
    if (!ts || !closes) return [];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null) out.push({ t: ts[i] * 1000, value: +closes[i].toFixed(2) });
    }
    return out;
  } catch {
    return [];
  }
}

// Fetch daily closes for one symbol → sorted [{ date, close }]. Empty on failure.
export async function fetchDailyCloses(symbol, range = "1y") {
  try {
    const res = await fetch(`${YAHOO}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts = r?.timestamp;
    const closes = r?.indicators?.quote?.[0]?.close;
    if (!ts || !closes) return [];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null) out.push({ date: isoDay(ts[i]), close: closes[i] });
    }
    return out;
  } catch {
    return [];
  }
}

// Forward-fill: most recent close on/before a date (or first close if date precedes data).
function makePriceLookup(series) {
  return (date) => {
    let val = series.length ? series[0].close : null;
    for (const p of series) {
      if (p.date <= date) val = p.close;
      else break;
    }
    return val;
  };
}

// Each current/closed position becomes a dated "lot".
function buildLots(portfolio) {
  const lots = [];
  for (const p of portfolio.positions || []) {
    if (!p.ticker || !p.shares) continue;
    lots.push({ ticker: p.ticker, shares: p.shares, entryDate: p.entry_date, entryPrice: p.entry_price || 0, sellDate: null, sellPrice: null });
  }
  for (const s of portfolio.sold_positions || []) {
    if (!s.ticker || !s.shares) continue;
    lots.push({ ticker: s.ticker, shares: s.shares, entryDate: s.entry_date, entryPrice: s.entry_price || 0, sellDate: s.sell_date, sellPrice: s.sell_price || 0 });
  }
  return lots;
}

let CACHE = { at: 0, data: null };
const TTL_MS = 15 * 60 * 1000;

// liveMeta: { cash, nav } from the enriched (live-priced) portfolio.
export async function getNavHistory(portfolio, liveMeta, { force = false } = {}) {
  if (!force && CACHE.data && Date.now() - CACHE.at < TTL_MS) return CACHE.data;

  const inception = portfolio.inception_date || "2026-03-28";
  const lots = buildLots(portfolio);
  const tickers = [...new Set(lots.map((l) => l.ticker))];

  const [spySeries, ...tickerSeries] = await Promise.all([
    fetchDailyCloses("SPY"),
    ...tickers.map((t) => fetchDailyCloses(t)),
  ]);
  const priceLookup = {};
  tickers.forEach((t, i) => (priceLookup[t] = makePriceLookup(tickerSeries[i])));
  const spyLookup = makePriceLookup(spySeries);

  // Trading-day axis = SPY's trading days from inception → today.
  const axis = spySeries.map((p) => p.date).filter((d) => d >= inception);

  const rawPoints = axis.map((day) => {
    let cash = INITIAL_CAPITAL;
    let positionsValue = 0;
    for (const lot of lots) {
      if (lot.entryDate && lot.entryDate <= day) {
        cash -= lot.entryPrice * lot.shares; // bought by this day
        const open = !lot.sellDate || lot.sellDate > day;
        if (open) {
          const px = priceLookup[lot.ticker] ? priceLookup[lot.ticker](day) : null;
          if (px != null) positionsValue += px * lot.shares;
        } else {
          cash += lot.sellPrice * lot.shares; // already sold by this day
        }
      }
    }
    return { date: day, cash, positionsValue };
  });

  // Small constant cash reconciliation (ledger ≈ within a few hundred $ of live cash).
  const last = rawPoints[rawPoints.length - 1];
  const cashAdjust = last && liveMeta?.cash != null ? liveMeta.cash - last.cash : 0;

  const points = rawPoints.map((r) => ({ date: r.date, nav: +(r.cash + cashAdjust + r.positionsValue).toFixed(2) }));
  if (points.length && liveMeta?.nav != null) {
    points[points.length - 1] = { date: last.date, nav: +liveMeta.nav.toFixed(2) };
  }

  const spyDenom = portfolio.spy_inception_price || (spySeries[0] && spySeries[0].close) || null;
  const spy = spyDenom
    ? axis.map((day) => ({ date: day, value: +(INITIAL_CAPITAL * (spyLookup(day) / spyDenom)).toFixed(2) }))
    : [];

  const data = {
    inceptionDate: inception,
    asOf: points.length ? points[points.length - 1].date : inception,
    initialCapital: INITIAL_CAPITAL,
    points,
    spy,
    tickersFetched: tickers.length,
  };
  CACHE = { at: Date.now(), data };
  return data;
}
