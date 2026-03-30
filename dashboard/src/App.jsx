import { useState, useEffect, useCallback } from "react";

const INITIAL_CAPITAL = 10000;
const REWARD_SPLIT = 0.20;
const API_BASE = "/api";

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
  const [cronStatus, setCronStatus] = useState({ date: null, runs: [] });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, l, t, d, recs, cron] = await Promise.all([
        fetchJSON("/portfolio"),
        fetchJSON("/leaderboard"),
        fetchJSON("/trade-log"),
        fetchJSON("/daily-state"),
        fetchJSON("/recommendations"),
        fetchJSON("/cron-status"),
      ]);
      if (p) setPortfolio(p);
      if (l) setLeaderboard(l);
      if (t) setTradeLog(t);
      if (d) setDailyState(d);
      if (recs) setAgentRecs(recs);
      if (cron) setCronStatus(cron);
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
    { id: "cron", label: "Cron Monitor", icon: "\u23F0" },
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
          {portfolio.prices_updated_at && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#666", fontSize: 13, letterSpacing: 1 }}>LIVE</div>
              <div style={{ color: "#00d4aa", fontSize: 11 }}>
                {new Date(portfolio.prices_updated_at).toLocaleTimeString()}
              </div>
            </div>
          )}
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
                  const raw = agentRecs[a.id];
                  const r = raw ? (raw.recommendation || raw) : null;
                  return (
                    <div key={a.id} style={{
                      background: "#0f0f1a", border: `1px solid #1a1a2e`,
                      borderRadius: 8, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <span style={{ fontSize: 26, width: 32 }}>{a.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: a.color, fontWeight: 600, fontSize: 12 }}>{a.name}</div>
                        {r && r.ticker ? (
                          <div style={{ fontSize: 11 }}>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{r.ticker || "N/A"}</span>
                            <span style={{ color: "#555" }}> · {r.asset_type || ""} · </span>
                            <span style={{ color: (r.conviction || 0) >= 8 ? "#00d4aa" : (r.conviction || 0) >= 6 ? "#eab308" : "#ff4757" }}>
                              {r.conviction || "?"}/10
                            </span>
                            {r.target_return && <span style={{ color: "#555" }}> · {r.target_return}</span>}
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
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{pos.ticker}</span>
                      <span style={{ color: "#555", fontSize: 11 }}> · {pos.shares} shares @ ${pos.entry_price}</span>
                      {pos.current_price != null && (
                        <span style={{ color: "#888", fontSize: 11 }}> → ${pos.current_price.toFixed(2)}</span>
                      )}
                      <span style={{ color: "#444", fontSize: 10 }}> · {pos.entry_date}</span>
                      {pos.agent && <span style={{ color: "#444", fontSize: 10 }}> · via {pos.agent}</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {pos.unrealized_pnl != null ? (
                        <>
                          <div style={{ color: pos.unrealized_pnl >= 0 ? "#00d4aa" : "#ff4757", fontWeight: 700, fontSize: 14 }}>
                            {pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}
                          </div>
                          <div style={{ color: pos.unrealized_pnl_pct >= 0 ? "#00d4aa" : "#ff4757", fontSize: 11 }}>
                            {pos.unrealized_pnl_pct >= 0 ? "+" : ""}{pos.unrealized_pnl_pct.toFixed(2)}%
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#333", fontSize: 11 }}>no price</span>
                      )}
                    </div>
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
              const raw = agentRecs[a.id];
              const rec = raw ? (raw.recommendation || raw) : null;
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

                  {rec && rec.ticker && (
                    <div style={{
                      background: "#12121e", border: `1px solid ${a.color}22`, borderRadius: 6, padding: 14,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{rec.ticker}</span>
                        <span style={{
                          background: (rec.conviction || 0) >= 8 ? "#00d4aa22" : (rec.conviction || 0) >= 6 ? "#eab30822" : "#ff475722",
                          color: (rec.conviction || 0) >= 8 ? "#00d4aa" : (rec.conviction || 0) >= 6 ? "#eab308" : "#ff4757",
                          padding: "2px 10px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                        }}>
                          {rec.conviction || "?"}/10
                        </span>
                      </div>
                      <div style={{ color: "#ccc", fontSize: 18, lineHeight: 1.6, marginBottom: 8 }}>
                        {rec.entry_thesis || rec.thesis || ""}
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
                        {rec.target_return && <span style={{ color: "#00d4aa" }}>Target: {rec.target_return}</span>}
                        {rec.risk && <span style={{ color: "#ff4757" }}>Risk: {rec.risk}</span>}
                        <span style={{ color: "#666" }}>{rec.asset_type}</span>
                      </div>
                    </div>
                  )}

                  {/* Memory entries */}
                  {raw && raw.sessions && raw.sessions.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 8 }}>TODAY'S SESSIONS</div>
                      {raw.sessions.map((s, i) => (
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

        {/* CRON MONITOR */}
        {activeTab === "cron" && (() => {
          const SCHEDULE = [
            { session: "premarket", time: "7:00 AM ET", utc: "11:00 UTC", desc: "Morning pre-market scan" },
            { session: "midday", time: "12:30 PM ET", utc: "16:30 UTC", desc: "Midday momentum check" },
            { session: "closing", time: "3:45 PM ET", utc: "19:45 UTC", desc: "Closing bell review" },
          ];
          const today = todayStr();
          const todayRuns = (cronStatus.date === today ? cronStatus.runs : []) || [];
          const getRunForSession = (s) => { const r = todayRuns.filter(x => x.session === s); return r.length ? r[r.length - 1] : null; };
          const statusColor = (s) => s === "success" ? "#00d4aa" : s === "failed" ? "#ff4757" : s === "running" ? "#f7931a" : "#333";
          const statusIcon = (s) => s === "success" ? "\u2714" : s === "failed" ? "\u2718" : s === "running" ? "\u23F3" : "\u25CB";
          const fmtTime = (iso) => { if (!iso) return "\u2014"; try { return new Date(iso).toLocaleTimeString(); } catch { return iso; } };
          const fmtDur = (a, b) => { if (!a || !b) return "\u2014"; const ms = new Date(b) - new Date(a); return ms < 60000 ? `${Math.round(ms/1000)}s` : `${Math.floor(ms/60000)}m ${Math.round((ms%60000)/1000)}s`; };
          const completed = todayRuns.filter(r => r.status === "success").length;
          const failed = todayRuns.filter(r => r.status === "failed").length;
          const running = todayRuns.filter(r => r.status === "running").length;

          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "SCHEDULED", val: "3 / day", color: "#6366f1" },
                  { label: "COMPLETED", val: completed, color: "#00d4aa" },
                  { label: "FAILED", val: failed, color: failed > 0 ? "#ff4757" : "#333" },
                  { label: "RUNNING", val: running, color: running > 0 ? "#f7931a" : "#333" },
                ].map(s => (
                  <div key={s.label} style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 22 }}>
                    <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ color: s.color, fontSize: 26, fontWeight: 700 }}>{s.val}</div>
                  </div>
                ))}
              </div>

              <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>{"TODAY\u2019S SCHEDULE \u2014 "}{today}</div>
              <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
                {SCHEDULE.map(sched => {
                  const run = getRunForSession(sched.session);
                  const status = run ? run.status : "pending";
                  return (
                    <div key={sched.session} style={{
                      background: "#0f0f1a",
                      border: `1px solid ${status === "failed" ? "#ff475744" : status === "running" ? "#f7931a44" : "#1a1a2e"}`,
                      borderRadius: 8, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16,
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: `${statusColor(status)}15`, border: `2px solid ${statusColor(status)}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, color: statusColor(status),
                      }}>
                        {statusIcon(status)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{sched.session}</span>
                          <span style={{
                            background: `${statusColor(status)}20`, color: statusColor(status),
                            padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                            textTransform: "uppercase", letterSpacing: 1,
                          }}>{status}</span>
                        </div>
                        <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                          {sched.desc} {"\u2014"} <span style={{ color: "#888" }}>{sched.time}</span>{" "}
                          <span style={{ color: "#444" }}>({sched.utc})</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 100 }}>
                        {run ? (
                          <>
                            <div style={{ color: "#888", fontSize: 12 }}>{fmtTime(run.started_at)}</div>
                            <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>
                              {run.finished_at ? fmtDur(run.started_at, run.finished_at) : "in progress..."}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 12 }}>not yet</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {failed > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ color: "#ff4757", fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>ERRORS</div>
                  {todayRuns.filter(r => r.status === "failed").map((r, i) => (
                    <div key={i} style={{
                      background: "#1a0a0a", border: "1px solid #331111", borderRadius: 8, padding: 16, marginBottom: 8,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#ff4757", fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{r.session}</span>
                        <span style={{ color: "#555", fontSize: 12 }}>exit code: {r.exit_code}</span>
                      </div>
                      <div style={{ color: "#ff8888", fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {r.error || "Unknown error"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>ALL RUNS TODAY</div>
              <div style={{ background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, overflow: "hidden" }}>
                {todayRuns.length ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "#555", fontSize: 11, letterSpacing: 1 }}>
                        {["SESSION", "STATUS", "STARTED", "DURATION", "EXIT"].map(h => (
                          <th key={h} style={{ padding: "12px 14px", textAlign: "left", borderBottom: "1px solid #1a1a2e" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {todayRuns.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #111" }}>
                          <td style={{ padding: "10px 14px", color: "#fff", textTransform: "capitalize", fontWeight: 600 }}>{r.session}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              color: statusColor(r.status), fontWeight: 700,
                              background: `${statusColor(r.status)}15`, padding: "3px 10px", borderRadius: 8, fontSize: 12,
                            }}>
                              {statusIcon(r.status)} {r.status}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "#888" }}>{fmtTime(r.started_at)}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{fmtDur(r.started_at, r.finished_at)}</td>
                          <td style={{ padding: "10px 14px", color: r.exit_code === 0 ? "#00d4aa" : r.exit_code != null ? "#ff4757" : "#555" }}>
                            {r.exit_code != null ? r.exit_code : "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 28, color: "#333", textAlign: "center" }}>No cron runs today yet. Next run at 7:00 AM ET (Mon-Fri).</div>
                )}
              </div>

              <div style={{
                background: "#0f0f1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: 20, marginTop: 16,
              }}>
                <div style={{ color: "#555", fontSize: 13, letterSpacing: 2, marginBottom: 10 }}>CRON CONFIGURATION</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 2.2, color: "#888" }}>
                  <div><span style={{ color: "#6366f1" }}>0 11 * * 1-5</span>{"  premarket   "}<span style={{ color: "#555" }}>7:00 AM ET</span></div>
                  <div><span style={{ color: "#6366f1" }}>30 16 * * 1-5</span>{" midday      "}<span style={{ color: "#555" }}>12:30 PM ET</span></div>
                  <div><span style={{ color: "#6366f1" }}>45 19 * * 1-5</span>{" closing     "}<span style={{ color: "#555" }}>3:45 PM ET</span></div>
                </div>
                <div style={{ color: "#444", fontSize: 11, marginTop: 10 }}>
                  Server: UTC | Mon-Fri only | Skips weekends + US holidays
                </div>
              </div>
            </div>
          );
        })()}

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
