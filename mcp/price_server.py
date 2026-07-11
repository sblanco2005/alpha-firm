"""
Price Fetch MCP Server — DB-free stock/ETF/crypto price + fundamentals fetching.
Uses Yahoo Finance (yfinance) and CoinGecko APIs directly. No DB required.

Includes POINT-IN-TIME historical tools (get_historical_price / get_batch_historical_prices)
so the backtester can fetch prices, 52-week ranges, moving averages and volume-vs-average
AS OF a simulated date — Yahoo's chart endpoint takes period1/period2 unix timestamps, so
the data is genuinely date-faithful (no lookahead) rather than "today's" quote.
"""

import sys
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

import urllib.request
import urllib.error

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("price-mcp")

server = Server("price-fetch")


def _http_json(url: str, timeout: int = 12):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


# ─── yfinance lazy import (avoid loading unless fundamentals tool is called) ───
_yf_cache: dict[str, Any] = {}
def _get_yf_ticker(symbol: str):
    if symbol.upper() not in _yf_cache:
        import yfinance as _yf
        _yf_cache[symbol.upper()] = _yf.Ticker(symbol.upper())
    return _yf_cache[symbol.upper()]


# ─── Price: Yahoo Finance (current) ─────────────────────────────────────────

def _fetch_yahoo(symbol: str) -> dict[str, Any] | None:
    """Fetch current price for a stock or ETF from Yahoo Finance."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d"
    try:
        data = _http_json(url, timeout=10)
        result = data.get("chart", {}).get("result", [])
        if not result:
            return None
        meta = result[0].get("meta", {})
        return {
            "symbol": symbol.upper(),
            "price": meta.get("regularMarketPrice", 0),
            "previous_close": meta.get("previousClose", meta.get("chartPreviousClose", 0)),
            "52w_high": meta.get("fiftyTwoWeekHigh", 0),
            "52w_low": meta.get("fiftyTwoWeekLow", 0),
            "market_cap": meta.get("marketCap", 0),
            "currency": meta.get("currency", "USD"),
            "source": "yahoo_finance",
        }
    except Exception as e:
        logger.warning(f"Yahoo fetch failed for {symbol}: {e}")
        return None


# ─── Price: Yahoo Finance (point-in-time / historical) ──────────────────────

def _yahoo_history_asof(symbol: str, as_of: str) -> dict[str, Any] | None:
    """
    Point-in-time snapshot for a stock/ETF AS OF `as_of` (YYYY-MM-DD): the close on the
    last trading day <= as_of, plus 52w range, SMA50/200 and volume-vs-avg20 computed
    ONLY from bars on/before as_of. No future data leaks in.
    """
    try:
        d = datetime.strptime(as_of, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return {"symbol": symbol.upper(), "error": f"bad as_of date '{as_of}' (want YYYY-MM-DD)"}
    p2 = int((d + timedelta(days=1)).timestamp())          # exclusive upper bound = as_of end of day
    p1 = int((d - timedelta(days=420)).timestamp())        # ~14 months back → 52w + SMA200 context
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           f"?period1={p1}&period2={p2}&interval=1d")
    try:
        data = _http_json(url)
        result = data.get("chart", {}).get("result", [])
        if not result:
            return {"symbol": symbol.upper(), "error": "no data"}
        r = result[0]
        ts = r.get("timestamp") or []
        q = (r.get("indicators", {}).get("quote") or [{}])[0]
        closes, highs, lows, opens, vols, dates = [], [], [], [], [], []
        for i, t in enumerate(ts):
            c = (q.get("close") or [None] * len(ts))[i]
            if c is None:
                continue
            bar_day = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
            if bar_day > as_of:                            # guard: never include a future bar
                continue
            dates.append(bar_day); closes.append(c)
            highs.append((q.get("high") or [None]*len(ts))[i] or c)
            lows.append((q.get("low") or [None]*len(ts))[i] or c)
            opens.append((q.get("open") or [None]*len(ts))[i] or c)
            vols.append((q.get("volume") or [0]*len(ts))[i] or 0)
        if not closes:
            return {"symbol": symbol.upper(), "error": f"no bars on/before {as_of}"}

        w52 = closes[-252:]
        avg20 = (sum(vols[-20:]) / len(vols[-20:])) if vols[-20:] else 0
        sma = lambda n: round(sum(closes[-n:]) / len(closes[-n:]), 4) if closes else None
        px, prev = closes[-1], (closes[-2] if len(closes) >= 2 else closes[-1])
        return {
            "symbol": symbol.upper(),
            "as_of": as_of,
            "bar_date": dates[-1],
            "price": round(px, 4),
            "open": round(opens[-1], 4),
            "day_high": round(highs[-1], 4),
            "day_low": round(lows[-1], 4),
            "previous_close": round(prev, 4),
            "change_pct": round((px / prev - 1) * 100, 2) if prev else 0,
            "volume": int(vols[-1]),
            "avg20_volume": int(avg20),
            "volume_ratio": round(vols[-1] / avg20, 2) if avg20 else None,
            "52w_high": round(max(w52), 4),
            "52w_low": round(min(w52), 4),
            "sma50": sma(50),
            "sma200": sma(200),
            "bars_used": len(closes),
            "currency": r.get("meta", {}).get("currency", "USD"),
            "source": "yahoo_finance_historical",
        }
    except Exception as e:
        logger.warning(f"Yahoo historical failed for {symbol} @ {as_of}: {e}")
        return {"symbol": symbol.upper(), "error": str(e)}


# ─── Price: CoinGecko (current) ─────────────────────────────────────────────

def _fetch_coingecko(coin_id: str) -> dict[str, Any] | None:
    """Fetch current crypto price from CoinGecko."""
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true"
    try:
        data = _http_json(url, timeout=10)
        coin_data = data.get(coin_id.lower(), {})
        if not coin_data:
            return None
        return {
            "symbol": coin_id.upper(),
            "price": coin_data.get("usd", 0),
            "change_24h_pct": coin_data.get("usd_24h_change", 0),
            "volume_24h": coin_data.get("usd_24h_vol", 0),
            "source": "coingecko",
        }
    except Exception as e:
        logger.warning(f"CoinGecko fetch failed for {coin_id}: {e}")
        return None


def _coingecko_history_asof(coin_id: str, as_of: str) -> dict[str, Any] | None:
    """Crypto price AS OF a date via CoinGecko /coins/{id}/history?date=dd-mm-yyyy."""
    try:
        dd = datetime.strptime(as_of, "%Y-%m-%d").strftime("%d-%m-%Y")
    except ValueError:
        return {"symbol": coin_id.upper(), "error": f"bad as_of '{as_of}'"}
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/history?date={dd}&localization=false"
    try:
        data = _http_json(url)
        md = (data.get("market_data") or {})
        price = (md.get("current_price") or {}).get("usd")
        if price is None:
            return {"symbol": coin_id.upper(), "as_of": as_of, "error": "no data for date"}
        return {
            "symbol": coin_id.upper(),
            "as_of": as_of,
            "price": price,
            "market_cap": (md.get("market_cap") or {}).get("usd"),
            "volume": (md.get("total_volume") or {}).get("usd"),
            "source": "coingecko_historical",
        }
    except Exception as e:
        logger.warning(f"CoinGecko historical failed for {coin_id} @ {as_of}: {e}")
        return {"symbol": coin_id.upper(), "error": str(e)}


# ─── Fundamentals: Yahoo Finance via yfinance ──────────────────────────────

def _fetch_yf_fundamentals(symbol: str) -> dict[str, Any] | None:
    """Fetch fundamentals for a stock via yfinance (Yahoo Finance unofficial API)."""
    try:
        ticker = _get_yf_ticker(symbol)
        info = ticker.info or {}
        fcf = info.get("freeCashflow", 0) or 0
        mcap = info.get("marketCap", 0) or 0
        fcf_yield = (fcf / mcap * 100) if mcap and fcf else None
        return {
            "symbol": symbol.upper(),
            "name": info.get("shortName", info.get("longName", "")),
            "sector": info.get("sector", ""),
            "trailing_pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "peg_ratio": info.get("trailingPegRatio"),
            "revenue_growth": info.get("revenueGrowth"),
            "earnings_growth": info.get("earningsGrowth"),
            "profit_margins": info.get("profitMargins"),
            "operating_margins": info.get("operatingMargins"),
            "roe": info.get("returnOnEquity"),
            "debt_to_equity": info.get("debtToEquity"),
            "fcf_yield_pct": fcf_yield,
            "market_cap": mcap,
            "target_mean_price": info.get("targetMeanPrice"),
            "recommendation_key": info.get("recommendationKey"),
            "source": "yfinance",
        }
    except Exception as e:
        logger.warning(f"yfinance fundamentals failed for {symbol}: {e}")
        return None


# ─── CoinGecko ID mapping ─────────────────────────────────────────────────

COINGECKO_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "ADA": "cardano",
    "LINK": "chainlink", "AVAX": "avalanche-2", "DOT": "polkadot",
    "MATIC": "matic-network", "UNI": "uniswap", "XRP": "ripple",
    "DOGE": "dogecoin", "ATOM": "cosmos", "AAVE": "aave",
    "CRV": "curve-dao-token", "MKR": "maker",
}


# ─── Tool definitions ──────────────────────────────────────────────────────

@server.list_tools()
async def list_tools():
    return [
        Tool(name="get_stock_price",
             description="Fetch CURRENT price for a stock or ETF from Yahoo Finance. In a backtest use get_historical_price instead.",
             inputSchema={"type": "object", "properties": {"symbol": {"type": "string", "description": "Ticker (e.g. AAPL, SPY)"}}, "required": ["symbol"]}),
        Tool(name="get_crypto_price",
             description="Fetch CURRENT price for a cryptocurrency from CoinGecko. In a backtest use get_historical_price instead.",
             inputSchema={"type": "object", "properties": {"symbol": {"type": "string", "description": "Crypto symbol (e.g. BTC, ETH)"}}, "required": ["symbol"]}),
        Tool(name="get_batch_prices",
             description="Fetch multiple CURRENT prices in one call (stocks/ETFs/crypto). In a backtest use get_batch_historical_prices instead.",
             inputSchema={"type": "object", "properties": {"symbols": {"type": "array", "items": {"type": "string"}}}, "required": ["symbols"]}),
        Tool(name="get_historical_price",
             description=("POINT-IN-TIME snapshot AS OF a date (no lookahead): close on the last trading day "
                          "<= as_of, plus 52-week high/low, SMA50, SMA200, volume and volume-vs-20day-average, "
                          "computed only from bars on/before as_of. Use this for ALL prices/technicals in a backtest."),
             inputSchema={"type": "object", "properties": {
                 "symbol": {"type": "string", "description": "Ticker or crypto symbol (e.g. AAPL, SPY, BTC)"},
                 "as_of": {"type": "string", "description": "Simulated date, YYYY-MM-DD. Only data on/before this date is returned."},
             }, "required": ["symbol", "as_of"]}),
        Tool(name="get_batch_historical_prices",
             description="Point-in-time snapshots for multiple symbols AS OF a date. More efficient than individual calls. Same no-lookahead guarantee.",
             inputSchema={"type": "object", "properties": {
                 "symbols": {"type": "array", "items": {"type": "string"}},
                 "as_of": {"type": "string", "description": "Simulated date, YYYY-MM-DD."},
             }, "required": ["symbols", "as_of"]}),
        Tool(name="get_stock_fundamentals",
             description="Fetch fundamentals (P/E, revenue growth, margins, ROE, D/E, FCF yield) via yfinance. NOTE: these are CURRENT, not point-in-time — in a backtest treat them as approximate.",
             inputSchema={"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}),
        Tool(name="get_batch_fundamentals",
             description="Fetch fundamentals for multiple stocks in one call (CURRENT values).",
             inputSchema={"type": "object", "properties": {"symbols": {"type": "array", "items": {"type": "string"}}}, "required": ["symbols"]}),
    ]


def _hist_one(sym: str, as_of: str) -> dict:
    s = sym.upper()
    if s in COINGECKO_IDS:
        return _coingecko_history_asof(COINGECKO_IDS[s], as_of) or {"symbol": s, "error": "fetch_failed"}
    return _yahoo_history_asof(s, as_of) or {"symbol": s, "error": "fetch_failed"}


# ─── Tool dispatcher ───────────────────────────────────────────────────────

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    symbols: list[str] = arguments.get("symbols", [])
    symbol: str = arguments.get("symbol", "")
    as_of: str = arguments.get("as_of", "")

    if name == "get_stock_price":
        result = _fetch_yahoo(symbol)
        return [TextContent(type="text", text=json.dumps(result or {"error": f"no price for {symbol}", "symbol": symbol.upper()}))]

    elif name == "get_crypto_price":
        coin_id = COINGECKO_IDS.get(symbol.upper(), symbol.lower())
        result = _fetch_coingecko(coin_id)
        return [TextContent(type="text", text=json.dumps(result or {"error": f"no price for {symbol}", "symbol": symbol.upper()}))]

    elif name == "get_historical_price":
        return [TextContent(type="text", text=json.dumps(_hist_one(symbol, as_of)))]

    elif name == "get_batch_historical_prices":
        import concurrent.futures
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
            futs = {ex.submit(_hist_one, s, as_of): s for s in symbols}
            for f in concurrent.futures.as_completed(futs):
                results.append(f.result())
        return [TextContent(type="text", text=json.dumps({"as_of": as_of, "prices": results, "count": len(results)}))]

    elif name == "get_stock_fundamentals":
        result = _fetch_yf_fundamentals(symbol)
        return [TextContent(type="text", text=json.dumps(result or {"error": f"no fundamentals for {symbol}", "symbol": symbol.upper()}))]

    elif name == "get_batch_prices":
        import concurrent.futures
        results, stocks, cryptos = [], [], []
        for s in symbols:
            (cryptos if s.upper() in COINGECKO_IDS else stocks).append(s.upper())
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            sf = {executor.submit(_fetch_yahoo, s): s for s in stocks}
            for fut in concurrent.futures.as_completed(sf):
                results.append(fut.result() or {"symbol": sf[fut], "error": "fetch_failed"})
            cf = {executor.submit(_fetch_coingecko, COINGECKO_IDS.get(s, s.lower())): s for s in cryptos}
            for fut in concurrent.futures.as_completed(cf):
                results.append(fut.result() or {"symbol": cf[fut], "error": "fetch_failed"})
        return [TextContent(type="text", text=json.dumps({"prices": results, "count": len(results)}))]

    elif name == "get_batch_fundamentals":
        import concurrent.futures
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_fetch_yf_fundamentals, s.upper()): s.upper() for s in symbols}
            for future in concurrent.futures.as_completed(futures):
                results.append(future.result() or {"symbol": futures[future], "error": "fetch_failed"})
        return [TextContent(type="text", text=json.dumps({"fundamentals": results, "count": len(results)}))]

    return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
