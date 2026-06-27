import { useState, useRef, useEffect } from "react";
import { useApi } from "../api";
import { C, FONT, rgba } from "../tokens";
import { ScreenHeader, Shimmer } from "../ui.jsx";

// Bundled showcase pipeline (faithful to the design prototype). The whole run —
// grid, debate, and verdict — renders from this one coherent bundled check, so the
// screen behaves as a replayable demo. The debate/verdict can't be reconstructed
// from state files; once the backend logs a full check result, swap this for
// /api/check/latest (the endpoint already returns the six analysts' recommendations).
const DEMO_AGENTS = [
  { id: "macro", name: "Macro", emoji: "🌐", color: "#F5B731", ticker: "SPY", conv: 5, note: "benched · 0.5×", dim: true },
  { id: "crypto", name: "Crypto", emoji: "₿", color: "#F7931A", ticker: "IREN", conv: 7, note: "hash-rate breakout", dim: false },
  { id: "quant", name: "Quant", emoji: "📊", color: "#2DD4D4", ticker: "AMD", conv: 6, note: "suspended", dim: true },
  { id: "sentiment", name: "Sentiment", emoji: "📡", color: "#FF4D9D", ticker: "PLTR", conv: 8, note: "insider cluster", dim: false, star: true },
  { id: "contrarian", name: "Contrarian", emoji: "🃏", color: "#A05CFF", ticker: "PYPL", conv: 7, note: "cheap + turning", dim: false },
  { id: "catalyst", name: "Catalyst", emoji: "⏱", color: "#4D7CFF", ticker: "NVDA", conv: 8, note: "earnings in 3d", dim: false },
];

const STATUS = ["", "Dispatching 6 analysts in parallel…", "Scoring recommendations…", "Capital-protection debate on top picks…", "PM decision logged"];

function AgentCard({ g, recsReady }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${rgba(g.color, 0.3)}`, borderRadius: 15, padding: 12, opacity: g.dim ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{g.emoji}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: rgba("#FFFFFF", 0.7) }}>{g.name}</span>
        {g.star && <span style={{ fontSize: 11, marginLeft: "auto" }}>⭐</span>}
      </div>
      {recsReady ? (
        <>
          <div style={{ marginTop: 9, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 16, color: g.color }}>{g.ticker}</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, color: rgba("#FFFFFF", 0.5) }}>conv {g.conv}</span>
          </div>
          <div style={{ marginTop: 6, height: 4, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${g.conv * 10}%`, background: g.color, animation: "afGrow .6s ease both" }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: rgba("#FFFFFF", 0.4) }}>{g.note}</div>
        </>
      ) : (
        <>
          <Shimmer mt={11} />
          <Shimmer width="60%" mt={7} />
          <div style={{ marginTop: 8, fontSize: 10, color: rgba("#FFFFFF", 0.35), fontFamily: FONT.mono }}>researching…</div>
        </>
      )}
    </div>
  );
}

function RiskFlag({ children }) {
  return <span style={{ fontSize: 9.5, fontFamily: FONT.mono, color: C.loss, background: rgba(C.loss, 0.1), border: `1px solid ${rgba(C.loss, 0.25)}`, padding: "2px 7px", borderRadius: 6 }}>{children}</span>;
}

function Debate() {
  return (
    <div className="af-fade" style={{ marginTop: 16, background: C.card, border: `1px solid ${rgba("#FFFFFF", 0.08)}`, borderRadius: 18, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: C.loss }}>⚔ CAPITAL-PROTECTION DEBATE</span>
        <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: "#FF4D9D" }}>PLTR · raw 8.2</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 11 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: rgba(C.loss, 0.14), border: `1px solid ${rgba(C.loss, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>🐻</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.loss, marginBottom: 3 }}>BEAR · Risk Manager</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: rgba("#FFFFFF", 0.7) }}>Retail crowding extreme, AI-defense narrative is consensus — likely priced. <span style={{ color: C.loss }}>1 serious weakness.</span></div>
          <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
            <RiskFlag>factor_crowding</RiskFlag>
            <RiskFlag>already_priced_in</RiskFlag>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: rgba(C.gain, 0.14), border: `1px solid ${rgba(C.gain, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>🐂</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gain, marginBottom: 3 }}>BULL · Rebuttal</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: rgba("#FFFFFF", 0.7) }}>Form-4 insider cluster (3 buys / 14d) post-dates the run — <span style={{ color: C.gain }}>not priced.</span> Fresh 28-DTE call flow, not crowded retail.</div>
        </div>
      </div>
      <div style={{ background: rgba(C.gain, 0.08), border: `1px solid ${rgba(C.gain, 0.28)}`, borderRadius: 12, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: rgba(C.gain, 0.18), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚖️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gain }}>RISK CHAIR → BUY_ELIGIBLE</div>
          <div style={{ fontSize: 11, color: rgba("#FFFFFF", 0.6), marginTop: 1 }}>All attacks rebutted · 1.05× modifier</div>
        </div>
      </div>
    </div>
  );
}

function Verdict({ onReset }) {
  return (
    <div className="af-fade" style={{ marginTop: 14, background: "linear-gradient(135deg, rgba(43,217,138,.16), rgba(43,217,138,.04))", border: `1px solid ${rgba(C.gain, 0.4)}`, borderRadius: 20, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.gain }}>PM DECISION · LOGGED</div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 34, color: C.gain, letterSpacing: -1 }}>BUY PLTR</span>
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
        <div><div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 17 }}>8.4</div><div style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45) }}>final score</div></div>
        <div><div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 17 }}>18%</div><div style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45) }}>of cash · ~$776</div></div>
        <div><div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 17, color: "#FF4D9D" }}>📡</div><div style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45) }}>Sentiment</div></div>
      </div>
      <div style={{ marginTop: 13, fontSize: 11, color: rgba("#FFFFFF", 0.5), fontFamily: FONT.mono, borderTop: `1px solid ${rgba("#FFFFFF", 0.1)}`, paddingTop: 11 }}>8.2 raw × 1.0 fund × 1.05 debate = 8.4 · daily buy used</div>
      <button onClick={onReset} className="af-press" style={{ width: "100%", marginTop: 14, textAlign: "center", fontSize: 13, fontWeight: 600, color: rgba("#FFFFFF", 0.55), background: "rgba(255,255,255,.05)", border: `1px solid ${rgba("#FFFFFF", 0.1)}`, borderRadius: 12, padding: 11, cursor: "pointer" }}>↺ Reset demo</button>
    </div>
  );
}

export default function MarketCheck() {
  const [step, setStep] = useState(0); // 0 idle · 1 dispatch · 2 recs · 3 debate · 4 verdict
  const timers = useRef([]);
  const { data: daily } = useApi("/api/daily-state");

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const runCheck = () => {
    clearTimers();
    setStep(1);
    timers.current.push(setTimeout(() => setStep(2), 1600));
    timers.current.push(setTimeout(() => setStep(3), 3300));
    timers.current.push(setTimeout(() => setStep(4), 5000));
  };
  const reset = () => { clearTimers(); setStep(0); };

  const agents = DEMO_AGENTS;

  const sessionPill = (() => {
    const sess = daily?.closing_session ? "3:45 · CLOSE" : daily?.midday_session ? "12:30 · MID" : "9:30 · OPEN";
    return sess;
  })();
  const checksDone = daily?.checks ?? 3;

  const running = step >= 1;
  const recsReady = step >= 2;

  return (
    <div className="af-fade" style={{ padding: "0 18px" }}>
      <ScreenHeader
        title="Market Check"
        subtitle="6 analysts → fundamental overlay → bull/bear debate → PM decision."
        right={<span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.5), background: C.card, border: `1px solid ${rgba("#FFFFFF", 0.08)}`, padding: "5px 9px", borderRadius: 8 }}>{sessionPill}</span>}
      />

      {!running && (
        <div style={{ marginTop: 26, background: C.card, border: `1px solid ${rgba("#FFFFFF", 0.08)}`, borderRadius: 22, padding: "26px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: rgba("#FFFFFF", 0.55), lineHeight: 1.55, marginBottom: 20 }}>
            {checksDone >= 3
              ? "All 3 sessions have run today. Tap to replay the pipeline and watch the firm make a call."
              : `Session ${checksDone + 1} of 3 hasn't run yet. Tap to dispatch all six analysts in parallel and watch the pipeline make a call.`}
          </div>
          <button onClick={runCheck} className="af-press" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "linear-gradient(135deg,#2BD98A,#17b56e)", color: "#04130B", fontFamily: FONT.display, fontWeight: 800, fontSize: 17, padding: "15px 28px", borderRadius: 16, border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(43,217,138,.32)" }}>
            <span style={{ position: "relative", width: 10, height: 10 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#04130B" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#04130B", animation: "afPing 1.6s ease-out infinite" }} />
            </span>
            Run market check
          </button>
          <div style={{ fontSize: 11, color: rgba("#FFFFFF", 0.32), marginTop: 16, fontFamily: FONT.mono }}>1 buy / day · sector cap 40% · VIX-sized</div>
        </div>
      )}

      {running && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.gain, animation: "afPulse 1.1s ease-in-out infinite" }} />
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: rgba("#FFFFFF", 0.7) }}>{STATUS[step]}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {agents.map((g) => <AgentCard key={g.id} g={g} recsReady={recsReady} />)}
          </div>

          {step >= 3 && <Debate />}
          {step >= 4 && <Verdict onReset={reset} />}
          <div style={{ height: 6 }} />
        </div>
      )}
    </div>
  );
}
