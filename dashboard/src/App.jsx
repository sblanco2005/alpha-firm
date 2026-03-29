import { useState, useEffect, useCallback } from "react";

const INITIAL_CAPITAL = 10000;
const REWARD_SPLIT = 0.20;
const API_BASE = "http://localhost:3001/api";

const AGENTS = [
  { id: "macro", name: "Macro Strategist", icon: "\u{1F30D}", color: "#00d4aa" },
  { id: "crypto", name: "Crypto Analyst", icon: "\u20BF", color: "#f7931a" },
  { id: "quant", name: "Momentum Quant", icon: "\u{1F4CA}", color: "#6366f1" },
  { id: "sentiment", name: "Sentiment Scout", icon: "\u{1F4E1}", color: "#ec4899" },
  { id: "contrarian", name: "Contrarian", icon: "\u{1F504}", color: "#eab308" },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

async function fetchJSON(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default function App() {
  const [portfolio, setPortfolio] = useState({ cash: INITIAL_CAPITAL, positions: [], nav: INITIAL_CAPITAL });
  const [leaderboard, setLeaderboard] = useState({});
  const [tradeLog, setTradeLog] = useState({ trades: [], decisions: [] });
  const [dailyState, setDailyState] = useState({ date: todayStr(), checks: 0, bought: false });
  const [agentRecs, setAgentRecs] = useState({});
  const [activeTab, setActiveTab] = useState("dashboard");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, l, t, d, recs] = await Promise.all([
        fetchJSON("/portfolio"),
        fetchJSON("/leaderboard"),
        fetchJSON("/trade-log"),
        fetchJSON("/daily-state"),
        fetchJSON("/recommendations"),
      ]);
      if (p) setPortfolio(p);
      if (l) setLeaderboard(l);
      if (t) setTradeLog(t);
      if (d) setDailyState(d);
      if (recs) setAgentRecs(recs);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Cannot connect to API server. Run: node server.js");
    }
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const totalValue = portfolio.nav || (portfolio.cash + (portfolio.positions || []).reduce((s, p) => s + (p.current_value || p.entry_price * (p.shares || 1)), 0));
  const totalPnL = totalValue - INITIAL_CAPITAL;
  const totalPnLPct = (totalPnL / INITIAL_CAPITAL) * 100;

  const agentEntries = Object.entries(leaderboard).filter(([k]) => AGENTS.some(a => a.id === k));
  const bestAgent = agentEntries.sort((a, b) => (b[1].total_pnl || 0) - (a[1].total_pnl || 0))[0];

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "\u25C9" },
    { id: "agents", label: "Analysts", icon: "\u{1F465}" },
    { id: "portfolio", label: "Portfolio", icon: "\u{1F4BC}" },
    { id: "log", label: "Activity", icon: "\u{1F4CB}" },
  ];

  return (
    <div style={{
      background: "#0a0a0f", color: "#e0e0e0", minHeight: "100vh",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", fontSize: 16,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a1a2e", padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>{"\u26A1"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#fff", letterSpacing: 1.5 }}>ALPHA FIRM</div>
            <div style={{ fontSize: 13, color: "#555", letterSpacing: 2 }}>MULTI-AGENT INVESTMENT ENGINE</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#666", fontSize: 13, letterSpacing: 1 }}>NAV</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>${totalValue.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#666", fontSize: 13, letterSpacing: 1 }}>P&L</div>
            <div style={{ color: totalPnL >= 0 ? "#00d4aa" : "#ff4757", fontWeight: 700, fontSize: 16 }}>
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} ({totalPnLPct.toFixed(1)}%)
            </div>
          </div>
          <button onClick={refresh} style={{
            background: "#1a1a2e", color: "#00d4aa", border: "1px solid #2a2a3e",
            padding: "6px 12px", borderRadius: 4, cursor: "pointer",
            fontFamily: "inherit", fontSize: 14,
          }}>
            {"\u21BB"} Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: "#331111", color: "#ff4757", padding: "8px 20px", fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a2e", background: "#0c0c14" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? "#1a1a2e" : "transparent",
            color: activeTab === t.id ? "#fff" : "#555",
            border: "none", padding: "14px 24px", cursor: "pointer",
            fontFamily: "inherit", fontSize: 18, letterSpacing: 1,
            borderBottom: activeTab === t.id ? "2px solid #00d4aa" : "2px solid transparent",
            transition: "all 0.2s",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: "14px 24px", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#555", fontSize: 11 }}>
            Checks: {dailyState.checks}/3 | {dailyState.bought ? "\u{1F512} Bought today" : "\u{1F7E2} Can buy"}
            {lastRefresh && <span> | Updated {lastRefresh}</span>}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 28 }}>

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div>
            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "CASH", val: `$${(portfolio.cash || 0).toFixed(2)}`, color: "#00d4aa" },
                { label: "POSITIONS", val: (portfolio.positions || []).length, color: "#6366f1" },
                { label: "TOTAL TRADES", val: tradeLog.total_trades || 0, color: "#f7931a" },
                { label: "BEST ANALYST", val: bestAgent ? `${AGENTS.find(a => a.id === bestAgent[0])?.icon || ""} $${(bestAgent[1].total_pnl || 0).toFixed(0)}` : "\u2014", color: "#eab308" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 22,
                }}>
                  <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: 26, fontWeight: 700 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Agent recs */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>LATEST RECOMMENDATIONS</div>
              <div style={{ display: "grid", gap: 8 }}>
                {AGENTS.map((a) => {
                  const r = agentRecs[a.id];
                  return (
                    <div key={a.id} style={{
                      background: "#0f0f1a", border: `1px solid #1a1a2e`,
                      borderRadius: 8, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <span style={{ fontSize: 26, width: 32 }}>{a.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: a.color, fontWeight: 600, fontSize: 12 }}>{a.name}</div>
                        {r && r.recommendation ? (
                          <div style={{ fontSize: 11 }}>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{r.recommendation.ticker || "N/A"}</span>
                            <span style={{ color: "#555" }}> · {r.recommendation.asset_type || ""} · </span>
                            <span style={{ color: (r.recommendation.conviction || 0) >= 8 ? "#00d4aa" : (r.recommendation.conviction || 0) >= 6 ? "#eab308" : "#ff4757" }}>
                              {r.recommendation.conviction || "?"}/10
                            </span>
                            {r.recommendation.target_return && <span style={{ color: "#555" }}> · {r.recommendation.target_return}</span>}
                          </div>
                        ) : (
                          <div style={{ color: "#333", fontSize: 11 }}>No recommendation yet</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Positions */}
            {(portfolio.positions || []).length > 0 && (
              <div>
                <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>OPEN POSITIONS</div>
                {portfolio.positions.map((pos, i) => (
                  <div key={i} style={{
                    background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8,
                    padding: "16px 22px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div>
                      <span style={{ color: "#fff", fontWeight: 700 }}>{pos.ticker}</span>
                      <span style={{ color: "#555", fontSize: 11 }}> · {pos.shares} shares @ ${pos.entry_price} · {pos.entry_date}</span>
                      {pos.agent && <span style={{ color: "#444", fontSize: 10 }}> · via {pos.agent}</span>}
                    </div>
                    {pos.unrealized_pnl != null && (
                      <span style={{ color: pos.unrealized_pnl >= 0 ? "#00d4aa" : "#ff4757", fontWeight: 700, fontSize: 12 }}>
                        {pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AGENTS */}
        {activeTab === "agents" && (
          <div style={{ display: "grid", gap: 16 }}>
            {AGENTS.map((a) => {
              const r = agentRecs[a.id];
              const score = leaderboard[a.id] || {};
              return (
                <div key={a.id} style={{
                  background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 10, padding: 28,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 28 }}>{a.icon}</span>
                      <div>
                        <div style={{ color: a.color, fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                        <div style={{ color: "#555", fontSize: 11 }}>
                          {score.picks_executed || 0} executed · {score.wins || 0}W / {score.losses || 0}L
                          {score.current_streak ? ` · streak: ${score.current_streak}` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: (score.total_pnl || 0) >= 0 ? "#00d4aa" : "#ff4757", fontSize: 16, fontWeight: 700 }}>
                        ${(score.total_pnl || 0).toFixed(2)}
                      </div>
                      <div style={{ color: "#eab308", fontSize: 10 }}>
                        Reward: ${(score.reward_earned || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {r && r.recommendation && (
                    <div style={{
                      background: "#12121e", border: `1px solid ${a.color}22`, borderRadius: 6, padding: 14,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{r.recommendation.ticker}</span>
                        <span style={{
                          background: (r.recommendation.conviction || 0) >= 8 ? "#00d4aa22" : (r.recommendation.conviction || 0) >= 6 ? "#eab30822" : "#ff475722",
                          color: (r.recommendation.conviction || 0) >= 8 ? "#00d4aa" : (r.recommendation.conviction || 0) >= 6 ? "#eab308" : "#ff4757",
                          padding: "2px 10px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                        }}>
                          {r.recommendation.conviction || "?"}/10
                        </span>
                      </div>
                      <div style={{ color: "#ccc", fontSize: 18, lineHeight: 1.6, marginBottom: 8 }}>
                        {r.recommendation.entry_thesis || r.recommendation.thesis || ""}
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
                        {r.recommendation.target_return && <span style={{ color: "#00d4aa" }}>Target: {r.recommendation.target_return}</span>}
                        {r.recommendation.risk && <span style={{ color: "#ff4757" }}>Risk: {r.recommendation.risk}</span>}
                        <span style={{ color: "#666" }}>{r.recommendation.asset_type}</span>
                      </div>
                    </div>
                  )}

                  {/* Memory entries */}
                  {r && r.sessions && r.sessions.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 8 }}>TODAY'S SESSIONS</div>
                      {r.sessions.map((s, i) => (
                        <div key={i} style={{ color: "#444", fontSize: 14, padding: "4px 0", borderBottom: "1px solid #111" }}>
                          <span style={{ color: "#555" }}>[{s.session}]</span> {s.summary || JSON.stringify(s).slice(0, 100)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* PORTFOLIO */}
        {activeTab === "portfolio" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 28 }}>
                <div style={{ color: "#555", fontSize: 13, letterSpacing: 2 }}>TOTAL VALUE</div>
                <div style={{ color: "#fff", fontSize: 36, fontWeight: 700 }}>${totalValue.toFixed(2)}</div>
                <div style={{ color: totalPnL >= 0 ? "#00d4aa" : "#ff4757", fontSize: 14 }}>
                  {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} ({totalPnLPct.toFixed(2)}%)
                </div>
                <div style={{ color: "#444", fontSize: 14, marginTop: 8 }}>
                  Inception: {portfolio.inception_date || "N/A"} · HWM: ${(portfolio.high_water_mark || INITIAL_CAPITAL).toFixed(2)}
                </div>
              </div>
              <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 28 }}>
                <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 8 }}>ANALYST LEADERBOARD</div>
                {agentEntries.length > 0 ? agentEntries
                  .sort((a, b) => (b[1].total_pnl || 0) - (a[1].total_pnl || 0))
                  .map(([id, s]) => {
                    const ag = AGENTS.find(a => a.id === id);
                    return (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                        <span style={{ color: ag?.color }}>{ag?.icon} {ag?.name}</span>
                        <span style={{ color: (s.total_pnl || 0) >= 0 ? "#00d4aa" : "#ff4757" }}>
                          ${(s.total_pnl || 0).toFixed(2)} ({s.wins || 0}W/{s.losses || 0}L)
                        </span>
                      </div>
                    );
                  }) : <div style={{ color: "#333", fontSize: 11 }}>No trades yet</div>}
              </div>
            </div>

            {/* Trade history */}
            <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>TRADE HISTORY</div>
            <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, overflow: "hidden" }}>
              {(tradeLog.trades || []).length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#555", fontSize: 13, letterSpacing: 1 }}>
                      {["DATE", "ACTION", "TICKER", "PRICE", "SHARES", "P&L", "ANALYST"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #1a1a2e" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...tradeLog.trades].reverse().map((t, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #111" }}>
                        <td style={{ padding: "12px 16px", color: "#666" }}>{t.date}</td>
                        <td style={{ padding: "12px 16px", color: t.action === "buy" ? "#00d4aa" : "#ff4757", fontWeight: 700 }}>{(t.action || "").toUpperCase()}</td>
                        <td style={{ padding: "12px 16px", color: "#fff" }}>{t.ticker}</td>
                        <td style={{ padding: "12px 16px" }}>${t.price?.toFixed(2) || t.entry_price?.toFixed(2) || "\u2014"}</td>
                        <td style={{ padding: "12px 16px" }}>{t.shares || "\u2014"}</td>
                        <td style={{ padding: "12px 16px", color: (t.pnl || 0) >= 0 ? "#00d4aa" : "#ff4757" }}>
                          {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "\u2014"}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#555" }}>{t.agent || t.recommended_by || "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 28, color: "#333", textAlign: "center" }}>No trades executed yet</div>
              )}
            </div>

            {/* Reward */}
            {bestAgent && (bestAgent[1].total_pnl || 0) > 0 && (
              <div style={{
                background: "#1a1a0a", border: "1px solid #eab30833", borderRadius: 8, padding: 22, marginTop: 16,
              }}>
                <div style={{ color: "#eab308", fontSize: 13, letterSpacing: 2, marginBottom: 8 }}>{"\u{1F4B0}"} REWARD POOL (20% of profits)</div>
                <div style={{ color: "#fff", fontSize: 14 }}>
                  {AGENTS.find(a => a.id === bestAgent[0])?.icon} {AGENTS.find(a => a.id === bestAgent[0])?.name} earns:{" "}
                  <span style={{ color: "#eab308", fontWeight: 700 }}>${(bestAgent[1].total_pnl * REWARD_SPLIT).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOG — PM decisions */}
        {activeTab === "log" && (
          <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 16 }}>
            <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>PM DECISIONS</div>
            <div style={{ maxHeight: 500, overflow: "auto" }}>
              {(tradeLog.decisions || []).length > 0 ? [...tradeLog.decisions].reverse().map((d, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #111" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
                      {d.decision === "buy" ? `BUY ${d.ticker}` : "PASS"}
                    </span>
                    <span style={{ color: "#555", fontSize: 11 }}>{d.date} · {d.session}</span>
                  </div>
                  <div style={{ color: "#888", fontSize: 18, lineHeight: 1.5 }}>{d.reasoning}</div>
                  {d.selected_agent && (
                    <div style={{ color: "#666", fontSize: 14, marginTop: 4 }}>
                      Selected: {AGENTS.find(a => a.id === d.selected_agent)?.icon} {d.selected_agent}
                      {d.allocation_pct && ` · ${d.allocation_pct}% allocation`}
                    </div>
                  )}
                </div>
              )) : (
                <div style={{ color: "#333" }}>No decisions yet. Run a market check to get started.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
