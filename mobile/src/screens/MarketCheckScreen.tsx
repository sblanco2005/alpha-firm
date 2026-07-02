import React, { useState, useRef, useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useApi, apiPost } from "../api";
import { C, F, rgba } from "../theme";
import { Screen } from "../components/Screen";
import { Touchable, ScreenTitle, Loading, ExpandableText } from "../components/ui";
import { FadeInView, PulseDot, PingDot, GrowBar } from "../components/anim";

const SESSIONS = [
  { key: "premarket", label: "Premarket" },
  { key: "midday", label: "Midday" },
  { key: "closing", label: "Closing" },
];

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

function PendingBadge() {
  return (
    <View style={{ backgroundColor: rgba("#FFFFFF", 0.05), borderWidth: 1, borderColor: rgba("#FFFFFF", 0.1), paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7 }}>
      <Text style={{ fontSize: 10.5, fontFamily: F.ui700, color: rgba("#FFFFFF", 0.4), letterSpacing: 0.4 }}>SCHEDULED</Text>
    </View>
  );
}

// One session row. Completed sessions show their decision + a clamped summary of the PM's
// reason; sessions that haven't run today read "Hasn't run yet" so it's clear where we are.
function SessionCard({ s }: { s: any }) {
  const ran = s.completed;
  const dotColor = ran ? (s.status === "error" ? C.loss : C.gain) : rgba("#FFFFFF", 0.2);
  return (
    <View style={{ backgroundColor: ran ? C.card : C.cardDim, borderWidth: 1, borderColor: C.hair, borderRadius: 16, padding: 15, opacity: ran ? 1 : 0.72 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.ui700, fontSize: 14, color: ran ? C.text : rgba("#FFFFFF", 0.6) }}>{s.label}</Text>
          <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.42), fontFamily: F.mono, marginTop: 1 }}>{s.timeET}{ran && s.vix != null ? ` · VIX ${s.vix}` : ""}</Text>
        </View>
        {ran ? <DecisionBadge s={s} /> : <PendingBadge />}
      </View>
      {ran ? (
        s.reason ? <View style={{ marginTop: 11 }}><ExpandableText lines={2} threshold={120}>{s.reason}</ExpandableText></View> : null
      ) : (
        <Text style={{ marginTop: 9, fontSize: 11.5, color: rgba("#FFFFFF", 0.35), fontFamily: F.ui, fontStyle: "italic" }}>Hasn't run yet.</Text>
      )}
    </View>
  );
}

// Real per-analyst pick card (tap → drill-down explaining why the agent picked it).
function PickCard({ a, onPress }: { a: any; onPress: () => void }) {
  const dim = a.statusType === "benched" || a.statusType === "suspended";
  return (
    <Touchable onPress={onPress} style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: rgba(a.color, 0.3), borderRadius: 15, padding: 12, opacity: dim ? 0.6 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 18 }}>{a.emoji}</Text>
        <Text style={{ fontSize: 11.5, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.7) }}>{a.name}</Text>
        <Text style={{ marginLeft: "auto", color: rgba("#FFFFFF", 0.3), fontSize: 13 }}>▸</Text>
      </View>
      <View style={{ marginTop: 9, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 16, color: a.color }}>{a.ticker || "—"}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: rgba("#FFFFFF", 0.5) }}>conv {a.conviction ?? "—"}</Text>
      </View>
      <GrowBar pct={(a.conviction || 0) * 10} color={a.color} />
      <Text numberOfLines={1} style={{ marginTop: 6, fontSize: 10, color: rgba("#FFFFFF", 0.4), fontFamily: F.ui }}>{a.note || "—"}</Text>
    </Touchable>
  );
}

export function MarketCheckScreen({ navigation }: any) {
  const { data: sessions, reload: reloadSessions } = useApi<any>("/api/sessions", { pollMs: 30000 });
  const { data: latest } = useApi<any>("/api/check/latest", { pollMs: 30000 });
  const { data: runStatus, reload: reloadRun } = useApi<any>("/api/check/run-status", { pollMs: 5000 });
  const [selSession, setSelSession] = useState("closing");
  const [triggering, setTriggering] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);

  const running = runStatus?.running || sessions?.run?.running;
  const runSession = runStatus?.session || sessions?.run?.session;
  const elapsedMin = runStatus?.elapsedSec != null ? Math.floor(runStatus.elapsedSec / 60) : 0;

  // When a run finishes, refresh the session summaries.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) reloadSessions();
    wasRunning.current = !!running;
  }, [running]);

  const runNow = async (force = false) => {
    setErr(null); setTriggering(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await apiPost("/api/check/run", { session: selSession, force });
      setConfirmForce(false);
      await reloadRun();
    } catch (e: any) {
      // Session already ran → offer an explicit override. Executed a trade → hard block.
      if (e?.data?.canForce) { setConfirmForce(true); setErr(e.message); }
      else { setConfirmForce(false); setErr(String(e?.message || e)); }
    } finally {
      setTriggering(false);
    }
  };
  const pickSession = (key: string) => { setSelSession(key); setConfirmForce(false); setErr(null); };

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
                  <Touchable key={s.key} onPress={() => pickSession(s.key)} style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: active ? rgba(C.gain, 0.16) : "transparent", borderWidth: 1, borderColor: active ? rgba(C.gain, 0.3) : rgba("#FFFFFF", 0.08) }}>
                    <Text style={{ fontSize: 12, fontFamily: F.ui600, color: active ? C.gain : rgba("#FFFFFF", 0.5) }}>{s.label}</Text>
                  </Touchable>
                );
              })}
            </View>
            {confirmForce ? (
              // Session already ran today → explicit override (server blocks it if it executed a trade).
              <View>
                <Text style={{ fontSize: 12, color: C.gold, fontFamily: F.ui, lineHeight: 17, marginBottom: 12 }}>
                  Today's {SESSIONS.find((s) => s.key === selSession)?.label} already ran. Re-running overwrites its result and re-logs its outcomes. (If it executed a trade, it's blocked — use Fresh Start.)
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Touchable onPress={() => { setConfirmForce(false); setErr(null); }} style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 13, backgroundColor: C.cardDim, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.1) }}>
                    <Text style={{ fontFamily: F.ui600, fontSize: 14, color: rgba("#FFFFFF", 0.65) }}>Cancel</Text>
                  </Touchable>
                  <Touchable onPress={() => runNow(true)} style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 13, backgroundColor: rgba(C.gold, 0.16), borderWidth: 1, borderColor: rgba(C.gold, 0.4) }}>
                    {triggering ? <ActivityIndicator color={C.gold} size="small" /> : <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.gold }}>Re-run anyway</Text>}
                  </Touchable>
                </View>
              </View>
            ) : (
              <>
                <Touchable onPress={() => runNow(false)} style={{ borderRadius: 14, overflow: "hidden" }}>
                  <LinearGradient colors={["#2BD98A", "#17b56e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14 }}>
                    {triggering ? <ActivityIndicator color="#04130B" size="small" /> : <PingDot />}
                    <Text style={{ fontFamily: F.display800, fontSize: 16, color: "#04130B" }}>Run {SESSIONS.find((s) => s.key === selSession)?.label} check</Text>
                  </LinearGradient>
                </Touchable>
                <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.32), marginTop: 12, fontFamily: F.mono, textAlign: "center" }}>~15–30 min · runs on Claude Max · 1 buy/day</Text>
              </>
            )}
            {err && <Text style={{ fontSize: 11, color: confirmForce ? rgba("#FFFFFF", 0.5) : C.loss, marginTop: 8, textAlign: "center", fontFamily: F.ui }}>{err}</Text>}
          </View>
        )}

        {/* This session's real picks — tap any to see why the agent picked it */}
        {latest && latest.agents && latest.agents.length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
              <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text }}>This session's picks</Text>
              <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.4), fontFamily: F.mono }}>{latest.agents.length} · tap for why</Text>
            </View>
            <View style={{ gap: 8 }}>
              {[[0, 1], [2, 3], [4, 5]].map((row, ri) => (
                <View key={ri} style={{ flexDirection: "row", gap: 8 }}>
                  {row.map((idx) => {
                    const a = latest.agents[idx];
                    return a
                      ? <PickCard key={a.agentId} a={a} onPress={() => navigation.push("PickDetail", { agentId: a.agentId })} />
                      : <View key={idx} style={{ flex: 1 }} />;
                  })}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Session summaries */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text }}>{sessions.stale ? "Last sessions" : "Today's sessions"}</Text>
          <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.4), fontFamily: F.mono }}>{sessions.sessions.filter((s: any) => s.completed).length} of 3 run</Text>
        </View>
        <View style={{ gap: 8 }}>
          {sessions.sessions.map((s: any) => <SessionCard key={s.key} s={s} />)}
        </View>

        <View style={{ height: 8 }} />
      </FadeInView>
    </Screen>
  );
}
