# Skill: Fundamental Overlay

## Purpose
A validation layer the PM applies to every analyst recommendation before final scoring. This is NOT a 6th analyst generating competing picks — it's a multiplier that boosts or discounts recommendations based on fundamental health.

## When to Run
Every market check, after collecting all 5 analyst recommendations and before the PM scoring step.

## Data Source
Fetch fundamentals using the `get_batch_fundamentals` tool from the **price-fetch** MCP server (no DB, no portclaude):

Use `mcp__price-fetch__get_batch_fundamentals` with:
```
symbols: ["META", "LOAR", ...]
```

Returns: forward P/E, trailing P/E, revenue growth, earnings growth, profit margins, operating margins, ROE, debt-to-equity, FCF yield, market cap, analyst recommendation.

For stocks only — ETFs, crypto, and commodities get automatic 1.0x modifier (no fundamentals needed).

## Fundamental Modifier Calculation

For each recommended ticker, compute a **Fundamental Modifier** from 0.7x to 1.3x. This gets applied to the analyst's raw PM score.

### Step 1: Score Each Dimension (0-10 scale)

**Valuation Score** (weight: 25%)
| Forward P/E | Score |
|-------------|-------|
| < 10 | 10 (deep value) |
| 10-15 | 8 |
| 15-20 | 6 |
| 20-30 | 4 |
| 30-50 | 2 |
| > 50 or N/A | 1 |

Adjust +1 if PEG < 1.0 (growth at reasonable price). Adjust +1 if EV/EBITDA < 12.

For ETFs: skip valuation scoring, default to 5/10 (neutral).

**Growth Score** (weight: 25%)
| Revenue Growth | Score |
|----------------|-------|
| > 30% | 10 |
| 20-30% | 8 |
| 10-20% | 6 |
| 0-10% | 4 |
| Negative | 2 |

Adjust +1 if earnings growth > revenue growth (operating leverage).

**Profitability Score** (weight: 20%)
| Operating Margin | Score |
|------------------|-------|
| > 30% | 10 |
| 20-30% | 8 |
| 10-20% | 6 |
| 0-10% | 4 |
| Negative | 1 |

Adjust +1 if ROE > 20%. Adjust +1 if profit margins are expanding (compare to sector average if available).

**Balance Sheet Score** (weight: 15%)
| Debt/Equity | Score |
|-------------|-------|
| < 30 | 10 |
| 30-60 | 8 |
| 60-100 | 6 |
| 100-200 | 4 |
| > 200 | 2 |

Adjust +1 if current ratio > 2.0 (strong liquidity). Adjust +1 if total cash > total debt (net cash positive).

**Cash Flow Score** (weight: 15%)
| FCF Yield | Score |
|-----------|-------|
| > 8% | 10 |
| 5-8% | 8 |
| 3-5% | 6 |
| 1-3% | 4 |
| < 1% or negative | 2 |

### Step 2: Compute Weighted Fundamental Score

```
fundamental_score = (valuation * 0.25) + (growth * 0.25) + (profitability * 0.20) + (balance_sheet * 0.15) + (cash_flow * 0.15)
```

### Step 3: Convert to Modifier

| Fundamental Score | Modifier | Interpretation |
|-------------------|----------|----------------|
| 8.0 - 10.0 | 1.3x | Fundamentally excellent — boost the thesis |
| 6.5 - 7.9 | 1.15x | Solid fundamentals — mild boost |
| 5.0 - 6.4 | 1.0x | Neutral — fundamentals neither help nor hurt |
| 3.5 - 4.9 | 0.85x | Weak fundamentals — discount the thesis |
| 0.0 - 3.4 | 0.7x | Poor fundamentals — significant discount |

### Step 4: Apply to PM Score

```
adjusted_pm_score = raw_pm_score * fundamental_modifier
```

## What Gets Scored vs. Skipped

Fundamental analysis only applies to **individual stocks**. Everything else gets a neutral 1.0x modifier:

| Asset Type | Fundamental Overlay | Reason |
|------------|-------------------|--------|
| **Stocks** | Full scoring (0.7x-1.3x) | Companies have financial statements |
| **ETFs** (SPY, XLE, GLD, etc.) | Skip — 1.0x | ETFs are baskets, not single companies |
| **Crypto** (BTC, IBIT, etc.) | Skip — 1.0x | No income statements or balance sheets |
| **Commodities** (GLD, USO, etc.) | Skip — 1.0x | Priced by supply/demand, not fundamentals |
| **Prediction markets** | Skip — 1.0x | Binary outcomes, no financials |

**How to determine asset type:** Check the `asset_type` field in the agent's recommendation. Only run the overlay when `asset_type == "stock"`.

**Pre-revenue / early-stage stocks:** If revenue is < $100M or operating margins are deeply negative (biotech, pre-profit tech), the standard scoring won't work well. Instead:
- Check cash burn rate vs. cash on hand (runway)
- Check analyst target vs. current price (upside consensus)
- Default modifier: 0.9x (slight discount for uncertainty)

## Output Format

Include the fundamental overlay in the PM decision log:

```
FUNDAMENTAL OVERLAY:
  META:  fwd_PE=14.9 | rev_growth=23.8% | op_margin=41.3% | D/E=39 | FCF_yield=1.7% | Score: 7.2/10 → 1.15x
  LOAR:  fwd_PE=51.8 | rev_growth=19.3% | op_margin=18.5% | D/E=168 | FCF_yield=1.6% | Score: 4.8/10 → 0.85x
  XLE:   ETF — default 1.0x
  IBIT:  Crypto ETF — default 1.0x
  NKE:   fwd_PE=28.2 | rev_growth=-8% | op_margin=12% | D/E=118 | FCF_yield=3.2% | Score: 4.1/10 → 0.85x

ADJUSTED PM SCORES:
  Macro (XLE):      8.50 × 1.00 = 8.50
  Crypto (IBIT):    8.00 × 1.00 = 8.00
  Quant (XLE):      8.00 × 1.00 = 8.00
  Sentiment (CRWD): 7.50 × 1.15 = 8.63  ← boosted by fundamentals
  Contrarian (NKE): 8.00 × 0.85 = 6.80  ← discounted by fundamentals
```

## Token Budget
- Fetching fundamentals (batch): ~200-500 tokens per call
- Scoring computation: ~300 tokens in PM reasoning
- Total additional cost per check: ~500-800 tokens
