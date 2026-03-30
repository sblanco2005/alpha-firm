import { useState, useEffect, useCallback, useRef } from "react";

const INITIAL_CAPITAL = 10000;
const MAX_MEMORY_DAYS = 5;
const REWARD_SPLIT = 0.20;

const AGENTS = [
  {
    id: "macro",
    name: "Macro Strategist",
    icon: "🌍",
    color: "#00d4aa",
    focus: "Global macro trends, interest rates, geopolitics, regime shifts",
    systemPrompt: `You are MACRO STRATEGIST, a senior global macro analyst at an elite investment firm. Your job is to identify the single best trade TODAY based on macro conditions.

FOCUS: Interest rates, central bank policy, geopolitical risk, cross-asset regime changes, currency moves, commodity cycles, fiscal policy shifts.

INSTRUMENTS: US stocks, crypto (BTC, ETH, SOL, etc.), ETFs (sector, commodity, bond, leveraged), prediction markets (Polymarket, Kalshi).

CONSTRAINTS: Long-only positions. You must recommend exactly ONE ticker/asset to BUY today.

Respond in this exact JSON format only, no other text:
{"ticker":"SYMBOL","asset_type":"stock|crypto|etf|prediction","entry_thesis":"2-3 sentence thesis","conviction":8,"risk":"key risk in 1 sentence","target_return":"X% in Y timeframe","catalyst":"what triggers the move"}`,
  },
  {
    id: "crypto",
    name: "Crypto Analyst",
    icon: "₿",
    color: "#f7931a",
    focus: "Crypto markets, on-chain data, DeFi, mining economics, regulatory",
    systemPrompt: `You are CRYPTO ANALYST, a specialist in digital assets and blockchain markets. Your job is to identify the single best crypto-related trade TODAY.

FOCUS: Bitcoin, Ethereum, altcoins, crypto mining stocks (MARA, RIOT, IREN, CIFR, CLSK), crypto ETFs (IBIT, ETHA), MicroStrategy (MSTR), on-chain metrics, DeFi protocols, regulatory developments, halving cycles, miner economics.

INSTRUMENTS: Crypto tokens, crypto mining stocks, crypto ETFs, crypto-adjacent equities, prediction markets on crypto events.

CONSTRAINTS: Long-only positions. You must recommend exactly ONE ticker/asset to BUY today.

Respond in this exact JSON format only, no other text:
{"ticker":"SYMBOL","asset_type":"stock|crypto|etf|prediction","entry_thesis":"2-3 sentence thesis","conviction":8,"risk":"key risk in 1 sentence","target_return":"X% in Y timeframe","catalyst":"what triggers the move"}`,
  },
  {
    id: "quant",
    name: "Momentum Quant",
    icon: "📊",
    color: "#6366f1",
    focus: "Technical signals, momentum, mean reversion, factor models, volume",
    systemPrompt: `You are MOMENTUM QUANT, a quantitative analyst who identifies trades based on technical and statistical signals. Your job is to find the single best momentum or mean-reversion trade TODAY.

FOCUS: Price momentum, relative strength, volume breakouts, moving average crossovers, RSI extremes, sector rotation signals, earnings momentum, short interest, options flow signals.

INSTRUMENTS: US stocks, crypto, ETFs (including leveraged like TQQQ, SOXL, UPRO), prediction markets.

CONSTRAINTS: Long-only positions. You must recommend exactly ONE ticker/asset to BUY today. Prefer setups with clear technical triggers happening NOW.

Respond in this exact JSON format only, no other text:
{"ticker":"SYMBOL","asset_type":"stock|crypto|etf|prediction","entry_thesis":"2-3 sentence thesis","conviction":8,"risk":"key risk in 1 sentence","target_return":"X% in Y timeframe","catalyst":"what triggers the move"}`,
  },
  {
    id: "sentiment",
    name: "Sentiment Scout",
    icon: "📡",
    color: "#ec4899",
    focus: "Social sentiment, news flow, alt data, retail trends, narrative shifts",
    systemPrompt: `You are SENTIMENT SCOUT, an alternative data analyst who identifies trades based on market sentiment, social signals, and narrative shifts. Your job is to find the single best sentiment-driven trade TODAY.

FOCUS: Social media buzz (Reddit, X/Twitter, Discord), news sentiment, earnings whisper, insider buying, institutional flow, retail trader positioning, narrative momentum, meme dynamics, fear/greed extremes.

INSTRUMENTS: US stocks, crypto, ETFs, prediction markets (Polymarket, Kalshi - elections, events, sports).

CONSTRAINTS: Long-only positions. You must recommend exactly ONE ticker/asset to BUY today. Focus on where sentiment is shifting RIGHT NOW.

Respond in this exact JSON format only, no other text:
{"ticker":"SYMBOL","asset_type":"stock|crypto|etf|prediction","entry_thesis":"2-3 sentence thesis","conviction":8,"risk":"key risk in 1 sentence","target_return":"X% in Y timeframe","catalyst":"what triggers the move"}`,
  },
  {
    id: "contrarian",
    name: "Contrarian",
    icon: "🔄",
    color: "#eab308",
    focus: "Overlooked plays, beaten-down names, consensus challenges, deep value",
    systemPrompt: `You are THE CONTRARIAN, a devil's advocate analyst who finds opportunities where the market is WRONG. Your job is to identify the single best contrarian trade TODAY.

FOCUS: Oversold names with improving fundamentals, sectors everyone hates, consensus trades that are crowded, mean-reversion setups after panic selling, unloved value plays, situations where bad news is already priced in.

INSTRUMENTS: US stocks, crypto (especially after washouts), ETFs, prediction markets where odds seem mispriced.

CONSTRAINTS: Long-only positions. You must recommend exactly ONE ticker/asset to BUY today. Your thesis MUST go against current market consensus.

Respond in this exact JSON format only, no other text:
{"ticker":"SYMBOL","asset_type":"stock|crypto|etf|prediction","entry_thesis":"2-3 sentence thesis","conviction":8,"risk":"key risk in 1 sentence","target_return":"X% in Y timeframe","catalyst":"what triggers the move"}`,
  },
];

const PM_SYSTEM_PROMPT = `You are the PORTFOLIO MANAGER / HEAD TRADER of an elite investment firm. You manage a concentrated portfolio with $CAPITAL in capital.

Your analysts have submitted their best trade ideas for today. You must pick THE SINGLE BEST ONE to execute, or pick NONE if nothing is compelling enough.

CURRENT PORTFOLIO:
$PORTFOLIO

ANALYST RECOMMENDATIONS:
$RECOMMENDATIONS

RULES:
- You can only BUY 1 new position today (but can sell existing positions anytime)
- Long-only
- Consider portfolio concentration - don't double up on correlated positions
- Consider the conviction scores, thesis quality, and risk/reward
- If you already hold a similar position, prefer diversification
- You're allocating 15-30% of available cash per position typically

IMPORTANT: The analyst whose picks generate the most profit gets 20% of total returns as bonus. Factor in track record from their memory if available.

Respond in this exact JSON format only, no other text:
{"decision":"buy|pass","selected_agent":"agent_id or null","ticker":"SYMBOL or null","allocation_pct":25,"reasoning":"2-3 sentence reasoning for your decision","sell_tickers":["list of tickers to sell first, or empty"]}`;

// ─── Storage helpers ───
async function loadState(key, fallback) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  } catch { return fallback; }
}
async function saveState(key, value) {
  try { await window.storage.set(key, JSON.stringify(value)); } catch (e) { console.error("Save error:", e); }
}

// ─── API call ───
async function callClaude(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await res.json();
  const texts = (data.content || []).filter((b) => b.type === "text").map((b) => b.text);
  return texts.join("\n");
}

function parseJSON(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function nowLabel() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 16) return "midday";
  return "closing";
}

// ─── Component ───
export default function InvestmentFirm() {
  const [portfolio, setPortfolio] = useState({ cash: INITIAL_CAPITAL, positions: [], tradeHistory: [] });
  const [agentMemories, setAgentMemories] = useState({});
  const [agentScores, setAgentScores] = useState({});
  const [currentRecs, setCurrentRecs] = useState({});
  const [pmDecision, setPmDecision] = useState(null);
  const [dailyState, setDailyState] = useState({ date: todayStr(), checks: 0, bought: false });
  const [loading, setLoading] = useState({});
  const [activeTab, setActiveTab] = useState("dashboard");
  const [log, setLog] = useState([]);
  const [cronStatus, setCronStatus] = useState({ date: null, runs: [], schedule: [] });
  const [initialized, setInitialized] = useState(false);

  const addLog = useCallback((msg) => {
    setLog((p) => [{ time: new Date().toLocaleTimeString(), msg }, ...p].slice(0, 100));
  }, []);

  // Load persisted state
  useEffect(() => {
    (async () => {
      const p = await loadState("firm-portfolio", { cash: INITIAL_CAPITAL, positions: [], tradeHistory: [] });
      const m = await loadState("firm-memories", {});
      const s = await loadState("firm-scores", {});
      const d = await loadState("firm-daily", { date: todayStr(), checks: 0, bought: false });
      const r = await loadState("firm-recs", {});
      if (d.date !== todayStr()) {
        d.date = todayStr();
        d.checks = 0;
        d.bought = false;
      }
      setPortfolio(p);
      setAgentMemories(m);
      setAgentScores(s);
      setDailyState(d);
      setCurrentRecs(r);
      const c = await loadState("firm-cron-status", { date: null, runs: [], schedule: [] });
      setCronStatus(c);
      setInitialized(true);
    })();
  }, []);

  // Persist on change
  useEffect(() => { if (initialized) saveState("firm-portfolio", portfolio); }, [portfolio, initialized]);
  useEffect(() => { if (initialized) saveState("firm-memories", agentMemories); }, [agentMemories, initialized]);
  useEffect(() => { if (initialized) saveState("firm-scores", agentScores); }, [agentScores, initialized]);
  useEffect(() => { if (initialized) saveState("firm-daily", dailyState); }, [dailyState, initialized]);
  useEffect(() => { if (initialized) saveState("firm-recs", currentRecs); }, [currentRecs, initialized]);
  useEffect(() => { if (initialized) saveState("firm-cron-status", cronStatus); }, [cronStatus, initialized]);

  // Poll cron status from filesystem (reads state/cron-status.json via storage)
  useEffect(() => {
    if (!initialized) return;
    const loadCronFromFile = async () => {
      try {
        const r = await window.storage.get("firm-cron-status");
        if (r) setCronStatus(JSON.parse(r.value));
      } catch {}
    };
    const interval = setInterval(loadCronFromFile, 30000); // every 30s
    return () => clearInterval(interval);
  }, [initialized]);

  // ─── Run single agent ───
  const runAgent = useCallback(async (agent) => {
    setLoading((p) => ({ ...p, [agent.id]: true }));
    addLog(`${agent.icon} ${agent.name} scanning markets...`);

    const mem = (agentMemories[agent.id] || []).slice(-MAX_MEMORY_DAYS);
    const memStr = mem.length ? `\n\nYOUR RESEARCH MEMORY (last ${mem.length} days):\n${mem.map((m) => `[${m.date}] ${m.summary}`).join("\n")}` : "\n\nNo previous research memory.";

    const posStr = portfolio.positions.length
      ? `Current portfolio positions: ${portfolio.positions.map((p) => `${p.ticker} (${p.shares} shares @ $${p.entryPrice})`).join(", ")}`
      : "Portfolio is 100% cash.";

    const userMsg = `Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Time: ${nowLabel()} check.

${posStr}
Available cash: $${portfolio.cash.toFixed(2)}
${memStr}

Search for the latest market news, prices, and data relevant to your focus area. Then provide your single best trade recommendation for today.`;

    try {
      const raw = await callClaude(agent.systemPrompt, userMsg);
      const rec = parseJSON(raw);
      if (rec) {
        rec.agent_id = agent.id;
        rec.timestamp = new Date().toISOString();
        setCurrentRecs((p) => ({ ...p, [agent.id]: rec }));
        // Update memory
        const newMem = [...(agentMemories[agent.id] || []), {
          date: todayStr(),
          summary: `Recommended ${rec.ticker} (${rec.asset_type}) - conviction ${rec.conviction}/10. Thesis: ${rec.entry_thesis}`,
        }].slice(-MAX_MEMORY_DAYS);
        setAgentMemories((p) => ({ ...p, [agent.id]: newMem }));
        addLog(`${agent.icon} ${agent.name}: BUY ${rec.ticker} (conviction ${rec.conviction}/10)`);
      } else {
        addLog(`${agent.icon} ${agent.name}: Failed to parse recommendation`);
      }
    } catch (e) {
      addLog(`${agent.icon} ${agent.name}: Error - ${e.message}`);
    }
    setLoading((p) => ({ ...p, [agent.id]: false }));
  }, [agentMemories, portfolio, addLog]);

  // ─── Run all agents ───
  const runMarketCheck = useCallback(async () => {
    if (dailyState.checks >= 3) {
      addLog("⚠️ Already completed 3 market checks today");
      return;
    }
    setDailyState((p) => ({ ...p, checks: p.checks + 1 }));
    addLog(`📈 MARKET CHECK #${dailyState.checks + 1} — ${nowLabel().toUpperCase()}`);
    await Promise.all(AGENTS.map((a) => runAgent(a)));
    addLog("✅ All agents completed. Awaiting PM decision.");
  }, [dailyState, runAgent, addLog]);

  // ─── Run PM ───
  const runPM = useCallback(async () => {
    setLoading((p) => ({ ...p, pm: true }));
    addLog("🎯 Portfolio Manager reviewing recommendations...");

    const recsStr = AGENTS.map((a) => {
      const r = currentRecs[a.id];
      if (!r) return `${a.name}: No recommendation`;
      return `${a.name} (${a.id}): BUY ${r.ticker} (${r.asset_type}) | Conviction: ${r.conviction}/10 | Thesis: ${r.entry_thesis} | Risk: ${r.risk} | Target: ${r.target_return}`;
    }).join("\n");

    const posStr = portfolio.positions.length
      ? portfolio.positions.map((p) => `${p.ticker}: ${p.shares} shares @ $${p.entryPrice} (by ${p.recommended_by})`).join("\n")
      : "No positions";

    const prompt = PM_SYSTEM_PROMPT
      .replace("$CAPITAL", portfolio.cash.toFixed(2))
      .replace("$PORTFOLIO", posStr)
      .replace("$RECOMMENDATIONS", recsStr);

    try {
      const raw = await callClaude(prompt, `Make your trading decision for ${nowLabel()} check on ${todayStr()}. Available cash: $${portfolio.cash.toFixed(2)}`);
      const dec = parseJSON(raw);
      if (dec) {
        setPmDecision(dec);
        addLog(`🎯 PM Decision: ${dec.decision.toUpperCase()} ${dec.ticker || ""} — ${dec.reasoning}`);
      }
    } catch (e) {
      addLog(`🎯 PM Error: ${e.message}`);
    }
    setLoading((p) => ({ ...p, pm: false }));
  }, [currentRecs, portfolio, addLog]);

  // ─── Execute trade ───
  const executeBuy = useCallback((ticker, agentId, allocationPct) => {
    if (dailyState.bought) {
      addLog("⚠️ Already bought today. Max 1 buy per day.");
      return;
    }
    const amount = portfolio.cash * (allocationPct / 100);
    const price = amount; // simplified: 1 unit at the allocation amount
    const newPos = {
      ticker,
      shares: 1,
      entryPrice: amount,
      entryDate: todayStr(),
      recommended_by: agentId,
      currentValue: amount,
    };
    setPortfolio((p) => ({
      ...p,
      cash: p.cash - amount,
      positions: [...p.positions, newPos],
      tradeHistory: [...p.tradeHistory, { ...newPos, action: "BUY", date: todayStr(), time: new Date().toLocaleTimeString() }],
    }));
    setDailyState((p) => ({ ...p, bought: true }));
    // Track agent score
    setAgentScores((p) => ({
      ...p,
      [agentId]: { ...(p[agentId] || { picks: 0, profit: 0 }), picks: ((p[agentId] || {}).picks || 0) + 1 },
    }));
    addLog(`✅ BOUGHT ${ticker} — $${amount.toFixed(2)} (recommended by ${agentId})`);
  }, [portfolio, dailyState, addLog]);

  const executeSell = useCallback((idx) => {
    const pos = portfolio.positions[idx];
    if (!pos) return;
    // Simulate some return (in real version, would fetch current price)
    const returnPct = (Math.random() * 20 - 5); // -5% to +15% for demo
    const saleValue = pos.entryPrice * (1 + returnPct / 100);
    const profit = saleValue - pos.entryPrice;

    setPortfolio((p) => {
      const newPositions = [...p.positions];
      newPositions.splice(idx, 1);
      return {
        ...p,
        cash: p.cash + saleValue,
        positions: newPositions,
        tradeHistory: [...p.tradeHistory, {
          ticker: pos.ticker, action: "SELL", shares: pos.shares,
          entryPrice: pos.entryPrice, salePrice: saleValue, profit,
          recommended_by: pos.recommended_by, date: todayStr(),
          time: new Date().toLocaleTimeString(),
        }],
      };
    });
    // Update agent P&L
    if (pos.recommended_by) {
      setAgentScores((p) => ({
        ...p,
        [pos.recommended_by]: {
          ...(p[pos.recommended_by] || { picks: 0, profit: 0 }),
          profit: ((p[pos.recommended_by] || {}).profit || 0) + profit,
        },
      }));
    }
    addLog(`💰 SOLD ${pos.ticker} — P&L: ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)} (${returnPct.toFixed(1)}%)`);
  }, [portfolio, addLog]);

  const resetFirm = useCallback(async () => {
    const fresh = { cash: INITIAL_CAPITAL, positions: [], tradeHistory: [] };
    setPortfolio(fresh);
    setAgentMemories({});
    setAgentScores({});
    setCurrentRecs({});
    setPmDecision(null);
    setDailyState({ date: todayStr(), checks: 0, bought: false });
    setLog([]);
    await saveState("firm-portfolio", fresh);
    await saveState("firm-memories", {});
    await saveState("firm-scores", {});
    await saveState("firm-daily", { date: todayStr(), checks: 0, bought: false });
    await saveState("firm-recs", {});
    addLog("🔄 Firm reset to initial state");
  }, [addLog]);

  const totalValue = portfolio.cash + portfolio.positions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnL = totalValue - INITIAL_CAPITAL;
  const totalPnLPct = ((totalPnL / INITIAL_CAPITAL) * 100);
  const bestAgent = Object.entries(agentScores).sort((a, b) => (b[1].profit || 0) - (a[1].profit || 0))[0];
  const anyLoading = Object.values(loading).some(Boolean);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "agents", label: "Analysts", icon: "👥" },
    { id: "portfolio", label: "Portfolio", icon: "💼" },
    { id: "cron", label: "Cron Monitor", icon: "⏰" },
    { id: "log", label: "Activity", icon: "📋" },
  ];

  if (!initialized) return (
    <div style={{ background: "#0a0a0f", color: "#e0e0e0", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
        <div style={{ color: "#666", letterSpacing: 2, fontSize: 12 }}>INITIALIZING FIRM...</div>
      </div>
    </div>
  );

  return (
    <div style={{
      background: "#0a0a0f", color: "#e0e0e0", minHeight: "100vh",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", fontSize: 13,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a1a2e", padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: 1.5 }}>ALPHA FIRM</div>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2 }}>MULTI-AGENT INVESTMENT ENGINE</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#666", fontSize: 10, letterSpacing: 1 }}>NAV</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>${totalValue.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#666", fontSize: 10, letterSpacing: 1 }}>P&L</div>
            <div style={{ color: totalPnL >= 0 ? "#00d4aa" : "#ff4757", fontWeight: 700, fontSize: 16 }}>
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} ({totalPnLPct.toFixed(1)}%)
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", borderBottom: "1px solid #1a1a2e", background: "#0c0c14",
      }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? "#1a1a2e" : "transparent",
            color: activeTab === t.id ? "#fff" : "#555",
            border: "none", padding: "10px 20px", cursor: "pointer",
            fontFamily: "inherit", fontSize: 12, letterSpacing: 1,
            borderBottom: activeTab === t.id ? "2px solid #00d4aa" : "2px solid transparent",
            transition: "all 0.2s",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: "10px 20px", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#555", fontSize: 11 }}>
            Checks: {dailyState.checks}/3 | {dailyState.bought ? "🔒 Bought today" : "🟢 Can buy"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        {/* ═══ DASHBOARD ═══ */}
        {activeTab === "dashboard" && (
          <div>
            {/* Action bar */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <button onClick={runMarketCheck} disabled={anyLoading || dailyState.checks >= 3} style={{
                background: dailyState.checks >= 3 ? "#1a1a2e" : "linear-gradient(135deg, #00d4aa, #00b894)",
                color: dailyState.checks >= 3 ? "#555" : "#000", border: "none",
                padding: "12px 24px", borderRadius: 6, cursor: dailyState.checks >= 3 ? "not-allowed" : "pointer",
                fontFamily: "inherit", fontWeight: 700, fontSize: 13, letterSpacing: 1,
              }}>
                {anyLoading ? "⏳ SCANNING..." : `▶ RUN MARKET CHECK #${dailyState.checks + 1}`}
              </button>
              <button onClick={runPM} disabled={anyLoading || !Object.keys(currentRecs).length} style={{
                background: "#1a1a2e", color: Object.keys(currentRecs).length ? "#f7931a" : "#555",
                border: "1px solid #2a2a3e", padding: "12px 24px", borderRadius: 6,
                cursor: Object.keys(currentRecs).length ? "pointer" : "not-allowed",
                fontFamily: "inherit", fontWeight: 700, fontSize: 13, letterSpacing: 1,
              }}>
                🎯 PM REVIEW
              </button>
              <button onClick={resetFirm} style={{
                background: "transparent", color: "#ff4757", border: "1px solid #331111",
                padding: "12px 24px", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12,
              }}>
                ↺ Reset
              </button>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "CASH", val: `$${portfolio.cash.toFixed(2)}`, color: "#00d4aa" },
                { label: "POSITIONS", val: portfolio.positions.length, color: "#6366f1" },
                { label: "TRADES", val: portfolio.tradeHistory.length, color: "#f7931a" },
                { label: "BEST ANALYST", val: bestAgent ? `${AGENTS.find((a) => a.id === bestAgent[0])?.icon || ""} $${(bestAgent[1].profit || 0).toFixed(0)}` : "—", color: "#eab308" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 16,
                }}>
                  <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: 20, fontWeight: 700 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Agent recs summary */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>LATEST RECOMMENDATIONS</div>
              <div style={{ display: "grid", gap: 8 }}>
                {AGENTS.map((a) => {
                  const r = currentRecs[a.id];
                  const isLoading = loading[a.id];
                  return (
                    <div key={a.id} style={{
                      background: "#0f0f1a", border: `1px solid ${pmDecision?.selected_agent === a.id ? a.color : "#1a1a2e"}`,
                      borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                      opacity: isLoading ? 0.6 : 1, transition: "all 0.3s",
                    }}>
                      <span style={{ fontSize: 20, width: 32 }}>{a.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: a.color, fontWeight: 600, fontSize: 12 }}>{a.name}</div>
                        {isLoading ? (
                          <div style={{ color: "#555", fontSize: 11 }}>Analyzing markets...</div>
                        ) : r ? (
                          <div style={{ fontSize: 11 }}>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{r.ticker}</span>
                            <span style={{ color: "#555" }}> · {r.asset_type} · </span>
                            <span style={{ color: r.conviction >= 8 ? "#00d4aa" : r.conviction >= 6 ? "#eab308" : "#ff4757" }}>
                              {r.conviction}/10
                            </span>
                            <span style={{ color: "#555" }}> · {r.target_return}</span>
                          </div>
                        ) : (
                          <div style={{ color: "#333", fontSize: 11 }}>No recommendation yet</div>
                        )}
                      </div>
                      {pmDecision?.selected_agent === a.id && (
                        <span style={{ color: "#f7931a", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>★ PM PICK</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PM Decision */}
            {pmDecision && (
              <div style={{
                background: "#0f0f1a", border: "1px solid #f7931a33", borderRadius: 8, padding: 20, marginBottom: 24,
              }}>
                <div style={{ color: "#f7931a", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>🎯 PM DECISION</div>
                <div style={{ fontSize: 14, color: "#fff", marginBottom: 8, fontWeight: 700 }}>
                  {pmDecision.decision === "buy" ? `BUY ${pmDecision.ticker}` : "PASS — No trade today"}
                </div>
                <div style={{ color: "#888", fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>{pmDecision.reasoning}</div>
                {pmDecision.decision === "buy" && !dailyState.bought && (
                  <button onClick={() => executeBuy(pmDecision.ticker, pmDecision.selected_agent, pmDecision.allocation_pct)} style={{
                    background: "linear-gradient(135deg, #f7931a, #e67e22)",
                    color: "#000", border: "none", padding: "10px 24px", borderRadius: 6,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, letterSpacing: 1,
                  }}>
                    ⚡ EXECUTE — BUY {pmDecision.ticker} ({pmDecision.allocation_pct}% allocation)
                  </button>
                )}
                {pmDecision.sell_tickers?.length > 0 && (
                  <div style={{ marginTop: 12, color: "#ff4757", fontSize: 11 }}>
                    PM recommends selling: {pmDecision.sell_tickers.join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Positions */}
            {portfolio.positions.length > 0 && (
              <div>
                <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>OPEN POSITIONS</div>
                {portfolio.positions.map((pos, i) => (
                  <div key={i} style={{
                    background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8,
                    padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div>
                      <span style={{ color: "#fff", fontWeight: 700 }}>{pos.ticker}</span>
                      <span style={{ color: "#555", fontSize: 11 }}> · ${pos.entryPrice.toFixed(2)} · {pos.entryDate}</span>
                      <span style={{ color: "#444", fontSize: 10 }}> · via {pos.recommended_by}</span>
                    </div>
                    <button onClick={() => executeSell(i)} style={{
                      background: "#1a0a0a", color: "#ff4757", border: "1px solid #331111",
                      padding: "6px 16px", borderRadius: 4, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                    }}>
                      SELL
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ AGENTS ═══ */}
        {activeTab === "agents" && (
          <div style={{ display: "grid", gap: 16 }}>
            {AGENTS.map((a) => {
              const r = currentRecs[a.id];
              const mem = agentMemories[a.id] || [];
              const score = agentScores[a.id] || { picks: 0, profit: 0 };
              return (
                <div key={a.id} style={{
                  background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 10, padding: 20,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 28 }}>{a.icon}</span>
                      <div>
                        <div style={{ color: a.color, fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                        <div style={{ color: "#555", fontSize: 11 }}>{a.focus}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#666", fontSize: 10 }}>{score.picks} picks · P&L: <span style={{ color: score.profit >= 0 ? "#00d4aa" : "#ff4757" }}>${(score.profit || 0).toFixed(2)}</span></div>
                      <div style={{ color: "#eab308", fontSize: 10, marginTop: 2 }}>
                        Bonus pool: ${((score.profit || 0) > 0 ? (score.profit * REWARD_SPLIT).toFixed(2) : "0.00")}
                      </div>
                    </div>
                  </div>

                  {/* Current rec */}
                  {r && (
                    <div style={{
                      background: "#12121e", border: `1px solid ${a.color}22`, borderRadius: 6, padding: 14, marginBottom: 14,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{r.ticker}</span>
                        <span style={{
                          background: r.conviction >= 8 ? "#00d4aa22" : r.conviction >= 6 ? "#eab30822" : "#ff475722",
                          color: r.conviction >= 8 ? "#00d4aa" : r.conviction >= 6 ? "#eab308" : "#ff4757",
                          padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        }}>
                          {r.conviction}/10
                        </span>
                      </div>
                      <div style={{ color: "#ccc", fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>{r.entry_thesis}</div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                        <span style={{ color: "#00d4aa" }}>Target: {r.target_return}</span>
                        <span style={{ color: "#ff4757" }}>Risk: {r.risk}</span>
                        <span style={{ color: "#666" }}>{r.asset_type}</span>
                      </div>
                    </div>
                  )}

                  {/* Memory */}
                  {mem.length > 0 && (
                    <div>
                      <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>MEMORY ({mem.length}/{MAX_MEMORY_DAYS} days)</div>
                      {mem.map((m, i) => (
                        <div key={i} style={{ color: "#444", fontSize: 11, padding: "4px 0", borderBottom: "1px solid #111" }}>
                          <span style={{ color: "#555" }}>[{m.date}]</span> {m.summary}
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => runAgent(a)} disabled={loading[a.id]} style={{
                    background: loading[a.id] ? "#1a1a2e" : `${a.color}11`,
                    color: a.color, border: `1px solid ${a.color}33`,
                    padding: "8px 16px", borderRadius: 6, cursor: loading[a.id] ? "wait" : "pointer",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 600, marginTop: 12,
                  }}>
                    {loading[a.id] ? "⏳ Scanning..." : "▶ Run Solo"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ PORTFOLIO ═══ */}
        {activeTab === "portfolio" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 20 }}>
                <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>TOTAL VALUE</div>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>${totalValue.toFixed(2)}</div>
                <div style={{ color: totalPnL >= 0 ? "#00d4aa" : "#ff4757", fontSize: 14 }}>
                  {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} ({totalPnLPct.toFixed(2)}%)
                </div>
              </div>
              <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 20 }}>
                <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>ANALYST LEADERBOARD</div>
                {Object.entries(agentScores)
                  .sort((a, b) => (b[1].profit || 0) - (a[1].profit || 0))
                  .map(([id, s]) => {
                    const ag = AGENTS.find((a) => a.id === id);
                    return (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                        <span style={{ color: ag?.color }}>{ag?.icon} {ag?.name}</span>
                        <span style={{ color: (s.profit || 0) >= 0 ? "#00d4aa" : "#ff4757" }}>${(s.profit || 0).toFixed(2)}</span>
                      </div>
                    );
                  })}
                {!Object.keys(agentScores).length && <div style={{ color: "#333", fontSize: 11, marginTop: 8 }}>No trades yet</div>}
              </div>
            </div>

            <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>TRADE HISTORY</div>
            <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, overflow: "hidden" }}>
              {portfolio.tradeHistory.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#555", fontSize: 10, letterSpacing: 1 }}>
                      {["DATE", "ACTION", "TICKER", "AMOUNT", "P&L", "ANALYST"].map((h) => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #1a1a2e" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...portfolio.tradeHistory].reverse().map((t, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #111" }}>
                        <td style={{ padding: "8px 12px", color: "#666" }}>{t.date}</td>
                        <td style={{ padding: "8px 12px", color: t.action === "BUY" ? "#00d4aa" : "#ff4757", fontWeight: 700 }}>{t.action}</td>
                        <td style={{ padding: "8px 12px", color: "#fff" }}>{t.ticker}</td>
                        <td style={{ padding: "8px 12px" }}>${t.entryPrice?.toFixed(2)}</td>
                        <td style={{ padding: "8px 12px", color: (t.profit || 0) >= 0 ? "#00d4aa" : "#ff4757" }}>
                          {t.profit != null ? `${t.profit >= 0 ? "+" : ""}$${t.profit.toFixed(2)}` : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#555" }}>{t.recommended_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 20, color: "#333", textAlign: "center" }}>No trades executed yet</div>
              )}
            </div>

            {/* Reward calculation */}
            {bestAgent && (bestAgent[1].profit || 0) > 0 && (
              <div style={{
                background: "#1a1a0a", border: "1px solid #eab30833", borderRadius: 8, padding: 16, marginTop: 16,
              }}>
                <div style={{ color: "#eab308", fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>💰 REWARD POOL (20% of profits)</div>
                <div style={{ color: "#fff", fontSize: 14 }}>
                  {AGENTS.find((a) => a.id === bestAgent[0])?.icon} {AGENTS.find((a) => a.id === bestAgent[0])?.name} earns: <span style={{ color: "#eab308", fontWeight: 700 }}>${(bestAgent[1].profit * REWARD_SPLIT).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ CRON MONITOR ═══ */}
        {activeTab === "cron" && (() => {
          const SCHEDULE = [
            { session: "premarket", time: "7:00 AM ET", utc: "11:00 UTC", desc: "Morning pre-market scan" },
            { session: "midday", time: "12:30 PM ET", utc: "16:30 UTC", desc: "Midday momentum check" },
            { session: "closing", time: "3:45 PM ET", utc: "19:45 UTC", desc: "Closing bell review" },
          ];
          const today = todayStr();
          const todayRuns = (cronStatus.date === today ? cronStatus.runs : []) || [];

          const getRunForSession = (session) => {
            const runs = todayRuns.filter((r) => r.session === session);
            return runs.length ? runs[runs.length - 1] : null;
          };

          const statusColor = (status) => {
            if (status === "success") return "#00d4aa";
            if (status === "failed") return "#ff4757";
            if (status === "running") return "#f7931a";
            return "#333";
          };

          const statusIcon = (status) => {
            if (status === "success") return "\u2714";
            if (status === "failed") return "\u2718";
            if (status === "running") return "\u23F3";
            return "\u25CB";
          };

          const formatTime = (iso) => {
            if (!iso) return "—";
            try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
          };

          const formatDuration = (start, end) => {
            if (!start || !end) return "—";
            try {
              const ms = new Date(end) - new Date(start);
              if (ms < 60000) return `${Math.round(ms / 1000)}s`;
              return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
            } catch { return "—"; }
          };

          const completedToday = todayRuns.filter((r) => r.status === "success").length;
          const failedToday = todayRuns.filter((r) => r.status === "failed").length;
          const runningNow = todayRuns.filter((r) => r.status === "running").length;

          return (
            <div>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "SCHEDULED", val: "3 / day", color: "#6366f1" },
                  { label: "COMPLETED", val: completedToday, color: "#00d4aa" },
                  { label: "FAILED", val: failedToday, color: failedToday > 0 ? "#ff4757" : "#333" },
                  { label: "RUNNING", val: runningNow, color: runningNow > 0 ? "#f7931a" : "#333" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 16 }}>
                    <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ color: s.color, fontSize: 22, fontWeight: 700 }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Schedule timeline */}
              <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>TODAY'S SCHEDULE — {today}</div>
              <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
                {SCHEDULE.map((sched) => {
                  const run = getRunForSession(sched.session);
                  const status = run ? run.status : "pending";
                  return (
                    <div key={sched.session} style={{
                      background: "#0f0f1a",
                      border: `1px solid ${status === "failed" ? "#ff475744" : status === "running" ? "#f7931a44" : "#1a1a2e"}`,
                      borderRadius: 8, padding: "14px 18px",
                      display: "flex", alignItems: "center", gap: 16,
                    }}>
                      {/* Status indicator */}
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: `${statusColor(status)}15`,
                        border: `2px solid ${statusColor(status)}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: statusColor(status),
                        animation: status === "running" ? "pulse 2s infinite" : "none",
                      }}>
                        {statusIcon(status)}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{sched.session}</span>
                          <span style={{
                            background: `${statusColor(status)}20`,
                            color: statusColor(status),
                            padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                            textTransform: "uppercase", letterSpacing: 1,
                          }}>
                            {status}
                          </span>
                        </div>
                        <div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>
                          {sched.desc} — <span style={{ color: "#888" }}>{sched.time}</span> <span style={{ color: "#444" }}>({sched.utc})</span>
                        </div>
                      </div>

                      {/* Timing */}
                      <div style={{ textAlign: "right", minWidth: 100 }}>
                        {run ? (
                          <>
                            <div style={{ color: "#888", fontSize: 11 }}>
                              {formatTime(run.started_at)}
                            </div>
                            <div style={{ color: "#555", fontSize: 10, marginTop: 2 }}>
                              {run.finished_at ? formatDuration(run.started_at, run.finished_at) : "in progress..."}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 11 }}>not yet</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Error details */}
              {todayRuns.filter((r) => r.status === "failed").length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ color: "#ff4757", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>ERRORS</div>
                  {todayRuns.filter((r) => r.status === "failed").map((r, i) => (
                    <div key={i} style={{
                      background: "#1a0a0a", border: "1px solid #331111", borderRadius: 8, padding: 14, marginBottom: 8,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#ff4757", fontWeight: 700, fontSize: 12, textTransform: "capitalize" }}>{r.session}</span>
                        <span style={{ color: "#555", fontSize: 11 }}>exit code: {r.exit_code}</span>
                      </div>
                      <div style={{ color: "#ff8888", fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {r.error || "Unknown error"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Run history */}
              <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>ALL RUNS TODAY</div>
              <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, overflow: "hidden" }}>
                {todayRuns.length ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#555", fontSize: 10, letterSpacing: 1 }}>
                        {["SESSION", "STATUS", "STARTED", "DURATION", "EXIT"].map((h) => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #1a1a2e" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {todayRuns.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #111" }}>
                          <td style={{ padding: "8px 12px", color: "#fff", textTransform: "capitalize", fontWeight: 600 }}>{r.session}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{
                              color: statusColor(r.status), fontWeight: 700,
                              background: `${statusColor(r.status)}15`, padding: "2px 8px", borderRadius: 8, fontSize: 11,
                            }}>
                              {statusIcon(r.status)} {r.status}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", color: "#888" }}>{formatTime(r.started_at)}</td>
                          <td style={{ padding: "8px 12px", color: "#666" }}>{formatDuration(r.started_at, r.finished_at)}</td>
                          <td style={{ padding: "8px 12px", color: r.exit_code === 0 ? "#00d4aa" : r.exit_code != null ? "#ff4757" : "#555" }}>
                            {r.exit_code != null ? r.exit_code : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 20, color: "#333", textAlign: "center" }}>No cron runs today yet. Next run at 7:00 AM ET.</div>
                )}
              </div>

              {/* Cron config info */}
              <div style={{
                background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 16, marginTop: 16,
              }}>
                <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>CRON CONFIGURATION</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 2, color: "#888" }}>
                  <div><span style={{ color: "#6366f1" }}>0 11 * * 1-5</span>  premarket  <span style={{ color: "#555" }}>  7:00 AM ET</span></div>
                  <div><span style={{ color: "#6366f1" }}>30 16 * * 1-5</span> midday     <span style={{ color: "#555" }}> 12:30 PM ET</span></div>
                  <div><span style={{ color: "#6366f1" }}>45 19 * * 1-5</span> closing    <span style={{ color: "#555" }}>  3:45 PM ET</span></div>
                </div>
                <div style={{ color: "#444", fontSize: 10, marginTop: 10 }}>
                  Server: UTC | Mon-Fri only | Skips weekends + US holidays
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══ LOG ═══ */}
        {activeTab === "log" && (
          <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 16 }}>
            <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>ACTIVITY LOG</div>
            <div style={{ maxHeight: 500, overflow: "auto" }}>
              {log.length ? log.map((l, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #111", fontSize: 12 }}>
                  <span style={{ color: "#333" }}>{l.time}</span> <span style={{ color: "#ccc" }}>{l.msg}</span>
                </div>
              )) : (
                <div style={{ color: "#333" }}>No activity yet. Run a market check to get started.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
