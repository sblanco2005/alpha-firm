// Curated per-position narrative (company, what-it-is, why the agent picked it, why
// the PM approved it, management read) lifted from the design handoff. Merged with
// live numbers (shares/price/return/stop) at request time. Keyed by ticker.

export const POSITION_NARRATIVES = {
  CAT: {
    company: "Caterpillar Inc.", sector: "Industrials", agentId: "catalyst",
    what: "World's largest maker of construction & mining equipment — a bellwether for global infrastructure and capex cycles.",
    agentWhy: "Bought 4 days ahead of Q2 earnings on a dated setup: dealer-inventory restocking plus the federal infrastructure tranche releasing. Market priced ~50% odds of a guide-raise; modeled 75%+. Downside bounded by the $940 stop.",
    pmWhy: "Cleared the gate on a dated, falsifiable catalyst with hard order-backlog data. Risk Chair: BUY_ELIGIBLE — all attacks rebutted, 1.05×. Sized 12% under the industrials sector cap.",
    conv: 8, horizon: "2–4 weeks", score: "8.6", verdict: "BUY_ELIGIBLE", catalyst: "Q2 earnings + infra capex", target: "+15%",
    mgmt: { label: "Up, target not yet hit", read: "Hold — let the winner run.", tone: "good" },
  },
  TGLS: {
    company: "Tecnoglass Inc.", sector: "Building products", agentId: "sentiment",
    what: "Colombia-based maker of architectural glass & windows for North American commercial and residential construction.",
    agentWhy: "Form-4 insider buying cluster — 3 executives bought inside 14 days, the single highest-hit-rate sentiment signal. Social buzz accelerating off a small base, narrative still early.",
    pmWhy: "Insider cluster is hard, observable evidence — not interpretation — so no narrative penalty. Diversifies away from mega-cap tech. Passed at 1.05× after the bear's small-cap liquidity flag was rebutted.",
    conv: 8, horizon: "3–6 weeks", score: "8.3", verdict: "BUY_ELIGIBLE", catalyst: "Insider cluster + backlog", target: "+18%",
    mgmt: { label: "Up, thesis intact", read: "Hold — catalyst still developing.", tone: "good" },
  },
  MU: {
    company: "Micron Technology", sector: "Semiconductors", agentId: "quant",
    what: "Leading memory chipmaker (DRAM & NAND) — highly cyclical and levered to the AI-driven memory upcycle.",
    agentWhy: "Multi-factor breakout — price momentum (3×) and volume confirmation (2×) both fired on the HBM upgrade cycle; relative strength top-decile vs SOXX. Caught the trend acceleration early.",
    pmWhy: "Strong technical confirmation but a single-signal, factor-heavy thesis — execution-ready, so it cleared. Quant is now suspended to Jul 8 on weak realized P&L; this position is held, not added to.",
    conv: 7, horizon: "2–3 weeks", score: "7.6", verdict: "BUY_ELIGIBLE", catalyst: "HBM demand / earnings", target: "+12%",
    mgmt: { label: "Up, approaching stop band", read: "Hold — trail the $1,050 stop.", tone: "good" },
  },
  SYK: {
    company: "Stryker Corporation", sector: "Medical devices", agentId: "contrarian",
    what: "Med-tech leader in orthopaedics, surgical robotics (Mako) and neurotech.",
    agentWhy: "Beaten down on a margin-miss overreaction while procedure volumes were quietly recovering. Cheap + improving + a catalyst (Mako installs reaccelerating) — all three boxes, and uncorrelated with the book.",
    pmWhy: "Required conviction 8+ for contrarian execution; this met it. Narrative penalty checked but evidence was factual — install base, volume data — not a vibe. Defensive ballast vs the cyclical names.",
    conv: 8, horizon: "4–8 weeks", score: "8.0", verdict: "BUY_ELIGIBLE", catalyst: "Margin recovery / Mako", target: "+14%",
    mgmt: { label: "Up, early in thesis", read: "Hold — re-rating underway.", tone: "good" },
  },
  FCN: {
    company: "FTI Consulting", sector: "Consulting", agentId: "sentiment",
    what: "Specialist business-advisory firm — restructuring, litigation and economic consulting. Counter-cyclical demand.",
    agentWhy: "Unusual options flow plus a narrative shift: a restructuring-demand wave as refinancing walls hit. Two confirming sentiment signals stacked.",
    pmWhy: "Counter-cyclical exposure improves portfolio impact. One unrebutted timing-risk weakness → BUY_ELIGIBLE_REDUCED at 75% size, 0.90×.",
    conv: 7, horizon: "3–5 weeks", score: "7.4", verdict: "REDUCED", catalyst: "Restructuring demand", target: "+12%",
    mgmt: { label: "Up modestly", read: "Hold — thesis on track.", tone: "good" },
  },
  NCLH: {
    company: "Norwegian Cruise Line", sector: "Travel", agentId: "sentiment",
    what: "Global cruise operator with high operating leverage to consumer travel demand and fuel costs.",
    agentWhy: "Narrative momentum — record booking commentary and retail buzz reaccelerating into the summer season. Early-stage narrative, not yet consensus.",
    pmWhy: "Thinner evidence than the insider-cluster names — a near-miss. Cleared on execution readiness but contributes little. The $19 stop bounds the high-beta downside.",
    conv: 6, horizon: "2–4 weeks", score: "7.2", verdict: "BUY_ELIGIBLE", catalyst: "Summer booking season", target: "+10%",
    mgmt: { label: "Roughly flat", read: "Watch — needs the catalyst to fire.", tone: "warn" },
  },
  CLSK: {
    company: "CleanSpark, Inc.", sector: "Bitcoin mining", agentId: "crypto",
    what: "Bitcoin miner running a large self-operated hash-rate fleet — a levered proxy on BTC price and network economics.",
    agentWhy: "On-chain divergence: exchange BTC reserves falling while price is flat, plus the firm's hash rate at a new high into the post-halving difficulty reset. ETF picks are now banned for me — this is the equity expression.",
    pmWhy: "High conviction, but crypto's realized P&L is negative so the track-record modifier is 0.8×. The $14 stop is wide-set (12–15% band) to avoid getting shaken out by volatility.",
    conv: 8, horizon: "3–6 weeks", score: "7.5", verdict: "BUY_ELIGIBLE", catalyst: "Hash rate + BTC reserves", target: "+20%",
    mgmt: { label: "Slightly down, above stop", read: "Hold — thesis still intact.", tone: "warn" },
  },
  FDX: {
    company: "FedEx Corporation", sector: "Logistics", agentId: "quant",
    what: "Global parcel & freight logistics network — a read-through on industrial shipping volumes and e-commerce.",
    agentWhy: "Momentum breakout on the DRIVE cost-cutting re-rating; volume confirmed the move and catalyst proximity scored on the upcoming print.",
    pmWhy: "Cleared on technicals but the thesis leaned on one factor. Now underwater and inside the stale-review window — flagged for the next check against the $315 stop.",
    conv: 7, horizon: "2–3 weeks", score: "7.3", verdict: "BUY_ELIGIBLE", catalyst: "DRIVE program / earnings", target: "+10%",
    mgmt: { label: "Down, stale-review flag", read: "Flagged — review vs the $315 stop.", tone: "bad" },
  },
};
