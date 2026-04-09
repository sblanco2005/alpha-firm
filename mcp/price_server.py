"""
Price Fetch MCP Server — DB-free stock/ETF/crypto price + fundamentals fetching.
Uses Yahoo Finance (yfinance) and CoinGecko APIs directly. No DB required.
"""

import sys
import json
import logging
from datetime import datetime
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

import urllib.request
import urllib.error

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("price-mcp")

server = Server("price-fetch")

# ─── yfinance lazy import (avoid loading unless fundamentals tool is called) ───
_yf_cache: dict[str, Any] = {}
def _get_yf_ticker(symbol: str):
    if symbol.upper() not in _yf_cache:
        import yfinance as _yf
        _yf_cache[symbol.upper()] = _yf.Ticker(symbol.upper())
    return _yf_cache[symbol.upper()]


# ─── Price: Yahoo Finance ───────────────────────────────────────────────────

def _fetch_yahoo(symbol: str) -> dict[str, Any] | None:
    """Fetch stock/ETF price from Yahoo Finance."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
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


# ─── Price: CoinGecko ──────────────────────────────────────────────────────

def _fetch_coingecko(coin_id: str) -> dict[str, Any] | None:
    """Fetch crypto price from CoinGecko."""
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
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


# ─── Fundamentals: Yahoo Finance via yfinance ──────────────────────────────

def _fetch_yf_fundamentals(symbol: str) -> dict[str, Any] | None:
    """Fetch fundamentals for a stock via yfinance (Yahoo Finance unofficial API)."""
    try:
        ticker = _get_yf_ticker(symbol)
        info = ticker.info or {}

        # Compute FCF yield from freeCashflow / marketCap
        fcf = info.get("freeCashflow", 0) or 0
        mcap = info.get("marketCap", 0) or 0
        fcf_yield = (fcf / mcap * 100) if mcap and fcf else None  # as percentage

        return {
            "symbol": symbol.upper(),
            "name": info.get("shortName", info.get("longName", "")),
            "sector": info.get("sector", ""),
            "trailing_pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "peg_ratio": info.get("trailingPegRatio"),
            "revenue_growth": info.get("revenueGrowth"),          # decimal, e.g. 0.238 = 23.8%
            "earnings_growth": info.get("earningsGrowth"),         # decimal
            "profit_margins": info.get("profitMargins"),           # decimal
            "operating_margins": info.get("operatingMargins"),    # decimal
            "roe": info.get("returnOnEquity"),                    # decimal
            "debt_to_equity": info.get("debtToEquity"),          # ratio
            "fcf_yield_pct": fcf_yield,                          # percentage
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
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "ADA": "cardano",
    "LINK": "chainlink",
    "AVAX": "avalanche-2",
    "DOT": "polkadot",
    "MATIC": "matic-network",
    "UNI": "uniswap",
    "XRP": "ripple",
    "DOGE": "dogecoin",
    "ATOM": "cosmos",
    "AAVE": "aave",
    "CRV": "curve-dao-token",
    "MKR": "maker",
}


# ─── Tool definitions ──────────────────────────────────────────────────────

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="get_stock_price",
            description="Fetch current price for a stock or ETF from Yahoo Finance.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Ticker symbol (e.g. AAPL, SPY, QQQ, GLD)"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_crypto_price",
            description="Fetch current price for a cryptocurrency from CoinGecko.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Crypto symbol (e.g. BTC, ETH, SOL)"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_batch_prices",
            description="Fetch multiple prices in one call (stocks, ETFs, or crypto). More efficient than individual calls.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbols": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of ticker symbols. Crypto symbols are automatically detected.",
                    },
                },
                "required": ["symbols"],
            },
        ),
        Tool(
            name="get_stock_fundamentals",
            description="Fetch fundamental data (P/E, revenue growth, margins, ROE, debt/equity, FCF yield) for a stock from Yahoo Finance via yfinance. Use this for fundamental overlay scoring.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Ticker symbol (e.g. AAPL, META, TSLA)"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_batch_fundamentals",
            description="Fetch fundamentals for multiple stocks in one call. More efficient than individual calls.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbols": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of stock ticker symbols.",
                    },
                },
                "required": ["symbols"],
            },
        ),
    ]


# ─── Tool dispatcher ───────────────────────────────────────────────────────

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    symbols: list[str] = arguments.get("symbols", [])
    symbol: str = arguments.get("symbol", "")

    if name == "get_stock_price":
        result = _fetch_yahoo(symbol)
        if result:
            return [TextContent(type="text", text=json.dumps(result))]
        return [TextContent(type="text", text=json.dumps({"error": f"Could not fetch price for {symbol}", "symbol": symbol.upper()}))]

    elif name == "get_crypto_price":
        coin_id = COINGECKO_IDS.get(symbol.upper(), symbol.lower())
        result = _fetch_coingecko(coin_id)
        if result:
            return [TextContent(type="text", text=json.dumps(result))]
        return [TextContent(type="text", text=json.dumps({"error": f"Could not fetch price for {symbol}", "symbol": symbol.upper()}))]

    elif name == "get_stock_fundamentals":
        result = _fetch_yf_fundamentals(symbol)
        if result:
            return [TextContent(type="text", text=json.dumps(result))]
        return [TextContent(type="text", text=json.dumps({"error": f"Could not fetch fundamentals for {symbol}", "symbol": symbol.upper()}))]

    elif name == "get_batch_prices":
        results = []
        stocks = []
        cryptos = []

        for s in symbols:
            s_upper = s.upper()
            if s_upper in COINGECKO_IDS:
                cryptos.append(s_upper)
            else:
                stocks.append(s_upper)

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            stock_futures = {executor.submit(_fetch_yahoo, s): s for s in stocks}
            for future in concurrent.futures.as_completed(stock_futures):
                r = future.result()
                results.append(r if r else {"symbol": stock_futures[future], "error": "fetch_failed"})

            crypto_futures = {executor.submit(_fetch_coingecko, COINGECKO_IDS.get(s, s.lower())): s for s in cryptos}
            for future in concurrent.futures.as_completed(crypto_futures):
                r = future.result()
                results.append(r if r else {"symbol": crypto_futures[future], "error": "fetch_failed"})

        return [TextContent(type="text", text=json.dumps({"prices": results, "count": len(results)}))]

    elif name == "get_batch_fundamentals":
        import concurrent.futures
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_fetch_yf_fundamentals, s.upper()): s.upper() for s in symbols}
            for future in concurrent.futures.as_completed(futures):
                r = future.result()
                results.append(r if r else {"symbol": futures[future], "error": "fetch_failed"})
        return [TextContent(type="text", text=json.dumps({"fundamentals": results, "count": len(results)}))]

    else:
        return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
