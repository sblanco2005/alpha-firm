import React, { useState, useRef, useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useApi, apiPost } from "../api";
import { C, F, rgba } from "../theme";
import { Screen } from "../components/Screen";
import { Touchable, ScreenTitle, Loading } from "../components/ui";
import { FadeInView, PulseDot, PingDot, Shimmer, GrowBar } from "../components/anim";

const SESSIONS = [
  { key: "premarket", label: "Premarket" },
  { key: "midday", label: "Midday" },
  { key: "closing", label: "Closing" },
];

// ── Bundled pipeline preview (the animated showcase) ───────────────────────────
const DEMO_AGENTS = [
  { id: "macro", name: "Macro", emoji: "🌐", color: "#F5B731", ticker: "SPY", conv: 5, note: "benched · 0.5×", dim: true },
  { id: "crypto", name: "Crypto", emoji: "₿", color: "#F7931A", ticker: "IREN", conv: 7, note: "hash-rate breakout", dim: false },
  { id: "quant", name: "Quant", emoji: "📊", color: "#2DD4D4", ticker: "AMD", conv: 6, note: "suspended", dim: true },
  { id: "sentiment", name: "Sentiment", emoji: "📡", color: "#FF4D9D", ticker: "PLTR", conv: 8, note: "insider cluster", dim: false, star: true },
  { id: "contrarian", name: "Contrarian", emoji: "🃏", color: "#A05CFF", ticker: "PYPL", conv: 7, note: "cheap + turning", dim: false },
  { id: "catalyst", name: "Catalyst", emoji: "⏱", color: "#4D7CFF", ticker: "NVDA", conv: 8, note: "earnings in 3d", dim: false },
];
const STATUS = ["", "Dispatching 6 analysts in parallel…", "Scoring recommendations…", "Capital-protection debate on top picks…", "PM decision logged"];

function AgentCard({ g, recsReady }: { g: any; recsReady: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: rgba(g.color, 0.3), borderRadius: 15, padding: 12, opacity: g.dim ? 0.5 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 18 }}>{g.emoji}</Text>
        <Text style={{ fontSize: 11.5, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.7) }}>{g.name}</Text>
        {g.star && <Text style={{ fontSize: 11, marginLeft: "auto" }}>⭐</Text>}
      </View>
      {recsReady ? (
        <>
          <View style={{ marginTop: 9, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.mono700, fontSize: 16, color: g.color }}>{g.ticker}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: rgba("#FFFFFF", 0.5) }}>conv {g.conv}</Text>
          </View>
          <GrowBar pct={g.conv * 10} color={g.color} />
          <Text style={{ marginTop: 6, fontSize: 10, color: rgba("#FFFFFF", 0.4), fontFamily: F.ui }}>{g.note}</Text>
        </>
      ) : (
        <>
          <Shimmer mt={11} />
          <Shimmer width="60%" mt={7} />
          <Text style={{ marginTop: 8, fontSize: 10, color: rgba("#FFFFFF", 0.35), fontFamily: F.mono }}>researching…</Text>
        </>
      )}
    </View>
  );
}

function RiskFlag({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: rgba(C.loss, 0.1), borderWidth: 1, borderColor: rgba(C.loss, 0.25), paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
      <Text style={{ fontSize: 9.5, fontFamily: F.mono, color: C.loss }}>{children}</Text>
    </View>
  );
}

function PreviewPipeline() {
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const play = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    clear(); setStep(1);
    timers.current.push(setTimeout(() => setStep(2), 1600));
    timers.current.push(setTimeout(() => setStep(3), 3300));
    timers.current.push(setTimeout(() => setStep(4), 5000));
  };
  const reset = () => { clear(); setStep(0); };
  const recsReady = step >= 2;
  const rows = [DEMO_AGENTS.slice(0, 2), DEMO_AGENTS.slice(2, 4), DEMO_AGENTS.slice(4, 6)];

  if (step === 0) {
    return (
      <Touchable onPress={play} style={{ marginTop: 12, alignItems: "center", backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.08), borderRadius: 14, paddingVertical: 13 }}>
        <Text style={{ fontSize: 13, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.6) }}>▶ Preview the pipeline</Text>
      </Touchable>
    );
  }
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <PulseDot color={C.gain} />
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: rgba("#FFFFFF", 0.7) }}>{STATUS[step]}</Text>
      </View>
      <View style={{ gap: 8 }}>
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            {row.map((g) => <AgentCard key={g.id} g={g} recsReady={recsReady} />)}
          </View>
        ))}
      </View>
      {step >= 3 && (
        <FadeInView style={{ marginTop: 16, backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.08), borderRadius: 18, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 0.6, color: C.loss }}>⚔ CAPITAL-PROTECTION DEBATE</Text>
            <Text style={{ marginLeft: "auto", fontFamily: F.mono700, fontSize: 12, color: "#FF4D9D" }}>PLTR · raw 8.2</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 11 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: rgba(C.loss, 0.14), borderWidth: 1, borderColor: rgba(C.loss, 0.35), alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 15 }}>🐻</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: F.ui700, color: C.loss, marginBottom: 3 }}>BEAR · Risk Manager</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: rgba("#FFFFFF", 0.7), fontFamily: F.ui }}>Retail crowding extreme, AI-defense narrative is consensus — likely priced. <Text style={{ color: C.loss }}>1 serious weakness.</Text></Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 7, flexWrap: "wrap" }}><RiskFlag>factor_crowding</RiskFlag><RiskFlag>already_priced_in</RiskFlag></View>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: rgba(C.gain, 0.08), borderWidth: 1, borderColor: rgba(C.gain, 0.28), borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13 }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: rgba(C.gain, 0.18), alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 14 }}>⚖️</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: F.ui700, color: C.gain }}>RISK CHAIR → BUY_ELIGIBLE</Text>
              <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.6), marginTop: 1, fontFamily: F.ui }}>All attacks rebutted · 1.05× modifier</Text>
            </View>
          </View>
        </FadeInView>
      )}
      {step >= 4 && (
        <FadeInView style={{ marginTop: 14, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: rgba(C.gain, 0.4) }}>
          <LinearGradient colors={["rgba(43,217,138,.16)", "rgba(43,217,138,.04)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20 }}>
            <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 1, color: C.gain }}>PM DECISION · LOGGED (demo)</Text>
            <Text style={{ fontFamily: F.display800, fontSize: 34, color: C.gain, letterSpacing: -1, marginTop: 8 }}>BUY PLTR</Text>
            <Text style={{ marginTop: 13, fontSize: 11, color: rgba("#FFFFFF", 0.5), fontFamily: F.mono }}>8.2 raw × 1.0 fund × 1.05 debate = 8.4 · daily buy used</Text>
            <Touchable onPress={reset} style={{ marginTop: 14, alignItems: "center", backgroundColor: "rgba(255,255,255,.05)", borderWidth: 1, borderColor: rgba("#FFFFFF", 0.1), borderRadius: 12, paddingVertical: 11 }}>
              <Text style={{ fontSize: 13, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.55) }}>↺ Reset preview</Text>
            </Touchable>
          </LinearGradient>
        </FadeInView>
      )}
    </View>
  );
}

// ── Real session cards ─────────────────────────────────────────────────────────
function DecisionBadge({ s }: { s: any }) {
  if (!s.decision) return <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.35), fontFamily: F.mono }}>—</Text>;
  if (s.decision === "buy") {
    return (
      <View style={{ backgroundColor: rgba(C.gain, 0.14), borderWidth: 1, borderColor: rgba(C.gain, 0.3), paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7 }}>
        <Text style={{ fontSize: 10.5, fontFamily: F.ui700, color: C.gain }}>BUY {s.ticker || ""}</Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: rgba("#FFFFFF", 0.06), borderWidth: 1, borderColor: rgba("#FFFFFF", 0.12), paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7 }}>
      <Text style={{ fontSize: 10.5, fontFamily: F.ui700, color: rgba("#FFFFFF", 0.55) }}>PASS</Text>
    </View>
  );
}

function SessionCard({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  const dotColor = s.completed ? (s.status === "error" ? C.loss : C.gain) : rgba("#FFFFFF", 0.25);
  return (
    <Touchable onPress={() => s.reason && setOpen((o) => !o)} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 16, padding: 15 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.text }}>{s.label}</Text>
          <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.42), fontFamily: F.mono, marginTop: 1 }}>{s.timeET}{s.vix != null ? ` · VIX ${s.vix}` : ""}</Text>
        </View>
        <DecisionBadge s={s} />
        {s.reason && <Text style={{ color: rgba("#FFFFFF", 0.3), fontSize: 15, marginLeft: 8 }}>{open ? "▾" : "▸"}</Text>}
      </View>
      {open && s.reason && (
        <Text style={{ marginTop: 11, fontSize: 12, lineHeight: 18, color: rgba("#FFFFFF", 0.7), fontFamily: F.ui }}>{s.reason}</Text>
      )}
    </Touchable>
  );
}

export function MarketCheckScreen() {
  const { data: sessions, reload: reloadSessions } = useApi<any>("/api/sessions", { pollMs: 30000 });
  const { data: runStatus, reload: reloadRun } = useApi<any>("/api/check/run-status", { pollMs: 5000 });
  const [selSession, setSelSession] = useState("closing");
  const [triggering, setTriggering] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const running = runStatus?.running || sessions?.run?.running;
  const runSession = runStatus?.session || sessions?.run?.session;
  const elapsedMin = runStatus?.elapsedSec != null ? Math.floor(runStatus.elapsedSec / 60) : 0;

  // When a run finishes, refresh the session summaries.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) reloadSessions();
    wasRunning.current = !!running;
  }, [running]);

  const runNow = async () => {
    setErr(null); setTriggering(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await apiPost("/api/check/run", { session: selSession });
      await reloadRun();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setTriggering(false);
    }
  };

  if (!sessions) return <Screen><Loading label="Loading sessions…" /></Screen>;

  return (
    <Screen>
      <FadeInView>
        <ScreenTitle
          title="Market Check"
          subtitle="6 analysts → fundamental overlay → bull/bear debate → PM decision. Runs 3×/day."
          right={<View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.08), paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8 }}><Text style={{ fontFamily: F.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.5) }}>{sessions.stale ? "LAST" : "TODAY"} · {sessions.date?.slice(5)}</Text></View>}
        />

        {/* Run now / running */}
        {running ? (
          <View style={{ marginTop: 20, backgroundColor: C.card, borderWidth: 1, borderColor: rgba(C.gain, 0.3), borderRadius: 20, padding: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <PulseDot color={C.gain} />
              <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.text }}>Running {runSession || "check"}…</Text>
              <Text style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 12, color: rgba("#FFFFFF", 0.5) }}>{elapsedMin}m elapsed</Text>
            </View>
            <Text style={{ fontSize: 11.5, color: rgba("#FFFFFF", 0.45), marginTop: 6, fontFamily: F.ui, lineHeight: 16 }}>
              Dispatching the six analysts on Claude Max. This takes ~15–30 min; the result lands in the session below when done.
            </Text>
            {runStatus?.lastLine && (
              <Text numberOfLines={2} style={{ marginTop: 10, fontSize: 10.5, color: rgba("#FFFFFF", 0.4), fontFamily: F.mono, lineHeight: 15 }}>{runStatus.lastLine}</Text>
            )}
          </View>
        ) : (
          <View style={{ marginTop: 20, backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.08), borderRadius: 20, padding: 18 }}>
            <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.55), fontFamily: F.ui, lineHeight: 18, marginBottom: 13 }}>Run a market check now — pick the session, dispatch all six analysts, and log a real PM decision.</Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
              {SESSIONS.map((s) => {
                const active = selSession === s.key;
                return (
                  <Touchable key={s.key} onPress={() => setSelSession(s.key)} style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: active ? rgba(C.gain, 0.16) : "transparent", borderWidth: 1, borderColor: active ? rgba(C.gain, 0.3) : rgba("#FFFFFF", 0.08) }}>
                    <Text style={{ fontSize: 12, fontFamily: F.ui600, color: active ? C.gain : rgba("#FFFFFF", 0.5) }}>{s.label}</Text>
                  </Touchable>
                );
              })}
            </View>
            <Touchable onPress={runNow} style={{ borderRadius: 14, overflow: "hidden" }}>
              <LinearGradient colors={["#2BD98A", "#17b56e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14 }}>
                {triggering ? <ActivityIndicator color="#04130B" size="small" /> : <PingDot />}
                <Text style={{ fontFamily: F.display800, fontSize: 16, color: "#04130B" }}>Run {SESSIONS.find((s) => s.key === selSession)?.label} check</Text>
              </LinearGradient>
            </Touchable>
            <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.32), marginTop: 12, fontFamily: F.mono, textAlign: "center" }}>~15–30 min · runs on Claude Max · 1 buy/day</Text>
            {err && <Text style={{ fontSize: 11, color: C.loss, marginTop: 8, textAlign: "center", fontFamily: F.ui }}>{err}</Text>}
          </View>
        )}

        {/* Session summaries */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text }}>{sessions.stale ? "Last sessions" : "Today's sessions"}</Text>
          <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.4), fontFamily: F.mono }}>{sessions.date}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {sessions.sessions.map((s: any) => <SessionCard key={s.key} s={s} />)}
        </View>

        {/* Pipeline preview (the animated showcase) */}
        <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 24, marginBottom: 2, marginHorizontal: 2 }}>How it works</Text>
        <PreviewPipeline />
        <View style={{ height: 8 }} />
      </FadeInView>
    </Screen>
  );
}
