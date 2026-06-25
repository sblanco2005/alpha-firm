"""
Finnhub MCP Server — Real-time market data, fundamentals, calendar, insider data.
Replaces Brave Search price scraping + yfinance fundamentals with structured API calls.
"""

import sys
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Any
import urllib.request
import urllib.error
import concurrent.futures

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("finnhub-mcp")

server = Server("finnhub")

API_KEY = os.environ.get("FINNHUB_API_KEY", "")
BASE_URL = "https://finnhub.io/api/v1"


def _finnhub_get(path: str, params: dict | None = None) -> dict | list | None:
    """Make a Finnhub API GET request."""
    url = f"{BASE_URL}/{path}"
    if params is None:
        params = {}
    params["token"] = API_KEY

    query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
    url = f"{url}?{query}"

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        logger.warning(f"Finnhub HTTP {e.code} for {path}: {e.reason}")
        return None
    except Exception as e:
        logger.warning(f"Finnhub request failed for {path}: {e}")
        return None


# ─── Crypto symbol mapping (Finnhub uses specific symbols) ─────────────────

CRYPTO_SYMBOLS = {
    "BTC": "BINANCE:BTCUSDT",
    "ETH": "BINANCE:ETHUSDT",
    "SOL": "BINANCE:SOLUSDT",
    "ADA": "BINANCE:ADAUSDT",
    "AVAX": "BINANCE:AVAXUSDT",
    "LINK": "BINANCE:LINKUSDT",
    "DOT": "BINANCE:DOTUSDT",
    "XRP": "BINANCE:XRPUSDT",
    "DOGE": "BINANCE:DOGEUSDT",
    "MATIC": "BINANCE:MATICUSDT",
    "ATOM": "BINANCE:ATOMUSDT",
    "UNI": "BINANCE:UNIUSDT",
}


# ─── Price Tools ───────────────────────────────────────────────────────────

def _fetch_quote(symbol: str) -> dict[str, Any] | None:
    """Fetch real-time stock/ETF quote from Finnhub."""
    data = _finnhub_get("quote", {"symbol": symbol.upper()})
    if not data or data.get("c") == 0:
        return None
    return {
        "symbol": symbol.upper(),
        "current_price": data.get("c", 0),
        "change": data.get("d", 0),
        "percent_change": data.get("dp", 0),
        "high": data.get("h", 0),
        "low": data.get("l", 0),
        "open": data.get("o", 0),
        "previous_close": data.get("pc", 0),
        "timestamp": data.get("t"),
        "source": "finnhub",
    }


def _fetch_crypto(symbol: str) -> dict[str, Any] | None:
    """Fetch crypto price from Finnhub."""
    fh_symbol = CRYPTO_SYMBOLS.get(symbol.upper())
    if not fh_symbol:
        return None
    data = _finnhub_get("quote", {"symbol": fh_symbol})
    if not data or data.get("c") == 0:
        return None
    return {
        "symbol": symbol.upper(),
        "current_price": data.get("c", 0),
        "change": data.get("d", 0),
        "percent_change": data.get("dp", 0),
        "high": data.get("h", 0),
        "low": data.get("l", 0),
        "open": data.get("o", 0),
        "previous_close": data.get("pc", 0),
        "source": "finnhub",
    }


def _fetch_batch_quotes(symbols: list[str]) -> list[dict]:
    """Fetch multiple quotes in parallel."""
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
        futures = {}
        for s in symbols:
            s_upper = s.upper()
            if s_upper in CRYPTO_SYMBOLS:
                futures[executor.submit(_fetch_crypto, s_upper)] = s_upper
            else:
                futures[executor.submit(_fetch_quote, s_upper)] = s_upper
        for future in concurrent.futures.as_completed(futures):
            r = future.result()
            results.append(r if r else {"symbol": futures[future], "error": "fetch_failed"})
    return results


# ─── Fundamentals ──────────────────────────────────────────────────────────

def _fetch_company_profile(symbol: str) -> dict[str, Any] | None:
    """Fetch company profile from Finnhub."""
    profile = _finnhub_get("stock/profile2", {"symbol": symbol.upper()})
    if not profile:
        return None
    return {
        "symbol": symbol.upper(),
        "name": profile.get("name", ""),
        "sector": profile.get("finnhubIndustry", ""),
        "market_cap": profile.get("marketCapitalization", 0),
        "shares_outstanding": profile.get("shareOutstanding", 0),
        "country": profile.get("country", ""),
        "exchange": profile.get("exchange", ""),
        "ipo_date": profile.get("ipo", ""),
        "source": "finnhub",
    }


def _fetch_basic_financials(symbol: str) -> dict[str, Any] | None:
    """Fetch key financial metrics from Finnhub."""
    data = _finnhub_get("stock/metric", {
        "symbol": symbol.upper(),
        "metric": "all",
    })
    if not data:
        return None
    m = data.get("metric", {})
    series = data.get("series", {})
    annual = series.get("annual", {})

    revenue_growth = None
    if annual.get("revenueGrowth"):
        revenue_growth = annual["revenueGrowth"][0].get("v")

    eps_growth = None
    if annual.get("epsGrowth"):
        eps_growth = annual["epsGrowth"][0].get("v")

    return {
        "symbol": symbol.upper(),
        "pe_ttm": m.get("peTTM"),
        "pe_normalized": m.get("peNormalizedTTM"),
        "pb": m.get("pbAnnual"),
        "ps": m.get("psAnnual"),
        "revenue_growth_annual": revenue_growth,
        "eps_growth_annual": eps_growth,
        "roe_ttm": m.get("roeTTM"),
        "roa_ttm": m.get("roaTTM"),
        "gross_margin": m.get("grossMarginTTM"),
        "operating_margin": m.get("operatingMarginTTM"),
        "net_margin": m.get("netProfitMarginTTM"),
        "current_ratio": m.get("currentRatioAnnual"),
        "debt_to_equity": m.get("totalDebt/totalEquityAnnual"),
        "fcf_yield": m.get("fcfYieldTTM"),
        "dividend_yield": m.get("dividendYieldIndicatedAnnual"),
        "beta": m.get("beta"),
        "52w_high": m.get("52WeekHigh"),
        "52w_low": m.get("52WeekLow"),
        "target_mean_price": m.get("targetMeanPrice"),
        "recommendation_mean": m.get("recommendationMean"),
        "source": "finnhub",
    }


# ─── Earnings Calendar ─────────────────────────────────────────────────────

def _fetch_earnings_calendar(from_date: str, to_date: str) -> list[dict]:
    """Fetch earnings calendar for a date range."""
    data = _finnhub_get("calendar/earnings", {
        "from": from_date,
        "to": to_date,
    })
    if not data:
        return []
    return data.get("earningsCalendar", [])


# ─── Economic Calendar ─────────────────────────────────────────────────────

def _fetch_economic_calendar(from_date: str, to_date: str) -> list[dict]:
    """Fetch economic calendar (CPI, NFP, FOMC, etc)."""
    data = _finnhub_get("calendar/economic", {
        "from": from_date,
        "to": to_date,
    })
    if not data:
        return []
    return data if isinstance(data, list) else data.get("economicCalendar", data.get("results", []))


# ─── Insider Sentiment ─────────────────────────────────────────────────────

def _fetch_insider_sentiment(symbol: str) -> dict[str, Any] | None:
    """Fetch insider trading sentiment from Finnhub."""
    from_date = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-01")
    to_date = datetime.now().strftime("%Y-%m-%d")
    data = _finnhub_get("stock/insider-sentiment", {
        "symbol": symbol.upper(),
        "from": from_date,
        "to": to_date,
    })
    if not data:
        return None
    return {
        "symbol": symbol.upper(),
        "data": data.get("data", []),
        "symbol_bullish": data.get("symbol_bullish", None),
        "source": "finnhub",
    }


# ─── Market News ───────────────────────────────────────────────────────────

def _fetch_market_news(category: str = "general", count: int = 10) -> list[dict]:
    """Fetch latest market news."""
    data = _finnhub_get("news", {"category": category})
    if not data:
        return []
    return data[:count]


def _fetch_company_news(symbol: str, count: int = 10) -> list[dict]:
    """Fetch company-specific news from the last 7 days."""
    from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    to_date = datetime.now().strftime("%Y-%m-%d")
    data = _finnhub_get("company-news", {
        "symbol": symbol.upper(),
        "from": from_date,
        "to": to_date,
    })
    if not data:
        return []
    return data[:count]


# ─── Technical Indicators ──────────────────────────────────────────────────

def _fetch_technicals(symbol: str) -> dict[str, Any]:
    """Fetch analyst recommendations + price targets from Finnhub."""
    rec_data = _finnhub_get("stock/recommendation", {"symbol": symbol.upper()})
    price_target = _finnhub_get("stock/price-target", {"symbol": symbol.upper()})

    latest_rec = rec_data[0] if rec_data and isinstance(rec_data, list) else {}

    return {
        "symbol": symbol.upper(),
        "recommendation": {
            "period": latest_rec.get("period"),
            "strong_buy": latest_rec.get("strongBuy", 0),
            "buy": latest_rec.get("buy", 0),
            "hold": latest_rec.get("hold", 0),
            "sell": latest_rec.get("sell", 0),
            "strong_sell": latest_rec.get("strongSell", 0),
        },
        "price_target": {
            "target_high": price_target.get("targetHigh") if price_target else None,
            "target_mean": price_target.get("targetMean") if price_target else None,
            "target_low": price_target.get("targetLow") if price_target else None,
            "target_median": price_target.get("targetMedian") if price_target else None,
        },
        "source": "finnhub",
    }


# ─── Full Analysis (all-in-one) ────────────────────────────────────────────

def _fetch_full_analysis(symbol: str) -> dict[str, Any]:
    """Fetch everything for a stock in parallel."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        quote_fut = executor.submit(_fetch_quote, symbol)
        profile_fut = executor.submit(_fetch_company_profile, symbol)
        financials_fut = executor.submit(_fetch_basic_financials, symbol)
        technicals_fut = executor.submit(_fetch_technicals, symbol)
        insider_fut = executor.submit(_fetch_insider_sentiment, symbol)

        quote = quote_fut.result()
        profile = profile_fut.result() or {}
        financials = financials_fut.result() or {}
        technicals = technicals_fut.result()
        insider = insider_fut.result()

    return {
        "symbol": symbol.upper(),
        "price": quote,
        "profile": profile,
        "financials": financials,
        "technicals": technicals,
        "insider_sentiment": insider,
        "source": "finnhub",
    }


# ─── Tool definitions ──────────────────────────────────────────────────────

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="get_price",
            description="Fetch real-time price for a stock, ETF, or crypto. Returns current price, change, high/low, open, previous close.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Ticker or crypto symbol (AAPL, SPY, BTC, ETH)"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_batch_prices",
            description="Fetch multiple prices in one call. Supports stocks, ETFs, and crypto mixed together.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbols": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of symbols (e.g. [\"AAPL\", \"SPY\", \"BTC\", \"MU\"])",
                    },
                },
                "required": ["symbols"],
            },
        ),
        Tool(
            name="get_fundamentals",
            description="Fetch comprehensive fundamentals for a stock: P/E, revenue growth, margins, ROE, debt/equity, FCF yield, beta, 52-week range, price targets. Use for fundamental overlay scoring.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Stock ticker (e.g. AAPL, MU, CAT)"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_company_profile",
            description="Fetch company profile: sector, market cap, shares outstanding, exchange, IPO date.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Stock ticker"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_technicals",
            description="Fetch analyst recommendations (strong buy/buy/hold/sell counts) and price targets (mean, high, low, median). Use for signal confirmation scoring.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Stock ticker"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_insider_sentiment",
            description="Fetch insider trading sentiment for the last 90 days. Shows whether insiders are net buyers or sellers. Key signal for sentiment analysis.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Stock ticker"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_earnings_calendar",
            description="Fetch upcoming earnings dates for a date range. Returns company, date, EPS estimate, revenue estimate. Use for catalyst agent.",
            inputSchema={
                "type": "object",
                "properties": {
                    "from_date": {
                        "type": "string",
                        "description": "Start date YYYY-MM-DD (default: today)",
                    },
                    "to_date": {
                        "type": "string",
                        "description": "End date YYYY-MM-DD (default: +14 days)",
                    },
                },
            },
        ),
        Tool(
            name="get_economic_calendar",
            description="Fetch economic calendar events (CPI, NFP, FOMC, GDP, retail sales) for a date range. Use for catalyst and macro agents. Note: may require paid plan.",
            inputSchema={
                "type": "object",
                "properties": {
                    "from_date": {"type": "string", "description": "Start date YYYY-MM-DD"},
                    "to_date": {"type": "string", "description": "End date YYYY-MM-DD"},
                },
            },
        ),
        Tool(
            name="get_market_news",
            description="Fetch latest general market news. Returns headlines, sources, summaries, and related tickers.",
            inputSchema={
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["general", "forex", "crypto", "merger"],
                        "description": "News category (default: general)",
                    },
                    "count": {
                        "type": "integer",
                        "description": "Number of articles (default: 10, max: 50)",
                    },
                },
            },
        ),
        Tool(
            name="get_company_news",
            description="Fetch company-specific news from the last 7 days. Returns headlines, dates, and summaries.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Stock ticker"},
                    "count": {"type": "integer", "description": "Number of articles (default: 10)"},
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="get_full_analysis",
            description="Fetch everything for a stock in one call: price, fundamentals, company profile, technicals/recommendations, insider sentiment. Most efficient for comprehensive analysis.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Stock ticker"},
                },
                "required": ["symbol"],
            },
        ),
    ]


# ─── Tool dispatcher ───────────────────────────────────────────────────────

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    symbol = arguments.get("symbol", "")

    if name == "get_price":
        s_upper = symbol.upper()
        if s_upper in CRYPTO_SYMBOLS:
            result = _fetch_crypto(s_upper)
        else:
            result = _fetch_quote(s_upper)
        if result:
            return [TextContent(type="text", text=json.dumps(result))]
        return [TextContent(type="text", text=json.dumps({"error": f"Could not fetch price for {symbol}", "symbol": s_upper}))]

    elif name == "get_batch_prices":
        symbols = arguments.get("symbols", [])
        results = _fetch_batch_quotes(symbols)
        return [TextContent(type="text", text=json.dumps({"prices": results, "count": len(results)}))]

    elif name == "get_fundamentals":
        result = _fetch_basic_financials(symbol)
        if result:
            return [TextContent(type="text", text=json.dumps(result))]
        return [TextContent(type="text", text=json.dumps({"error": f"Could not fetch fundamentals for {symbol}"}))]

    elif name == "get_company_profile":
        result = _fetch_company_profile(symbol)
        if result:
            return [TextContent(type="text", text=json.dumps(result))]
        return [TextContent(type="text", text=json.dumps({"error": f"Could not fetch profile for {symbol}"}))]

    elif name == "get_technicals":
        result = _fetch_technicals(symbol)
        return [TextContent(type="text", text=json.dumps(result))]

    elif name == "get_insider_sentiment":
        result = _fetch_insider_sentiment(symbol)
        if result:
            return [TextContent(type="text", text=json.dumps(result))]
        return [TextContent(type="text", text=json.dumps({"symbol": symbol.upper(), "data": [], "note": "No insider sentiment data available"}))]

    elif name == "get_earnings_calendar":
        today = datetime.now().strftime("%Y-%m-%d")
        two_weeks = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
        from_date = arguments.get("from_date", today)
        to_date = arguments.get("to_date", two_weeks)
        results = _fetch_earnings_calendar(from_date, to_date)
        return [TextContent(type="text", text=json.dumps({"earnings": results[:50], "count": len(results), "from": from_date, "to": to_date}))]

    elif name == "get_economic_calendar":
        today = datetime.now().strftime("%Y-%m-%d")
        two_weeks = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
        from_date = arguments.get("from_date", today)
        to_date = arguments.get("to_date", two_weeks)
        results = _fetch_economic_calendar(from_date, to_date)
        return [TextContent(type="text", text=json.dumps({"events": results[:50], "count": len(results), "from": from_date, "to": to_date}))]

    elif name == "get_market_news":
        category = arguments.get("category", "general")
        count = arguments.get("count", 10)
        results = _fetch_market_news(category, count)
        return [TextContent(type="text", text=json.dumps({"news": results, "count": len(results)}))]

    elif name == "get_company_news":
        count = arguments.get("count", 10)
        results = _fetch_company_news(symbol, count)
        return [TextContent(type="text", text=json.dumps({"news": results, "count": len(results), "symbol": symbol.upper()}))]

    elif name == "get_full_analysis":
        result = _fetch_full_analysis(symbol)
        return [TextContent(type="text", text=json.dumps(result))]

    else:
        return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


async def main():
    if not API_KEY:
        logger.error("FINNHUB_API_KEY environment variable not set!")
        sys.exit(1)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
