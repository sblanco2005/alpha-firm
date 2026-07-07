import React from "react";
import { View, Text } from "react-native";
import { useApi } from "../api";
import { C, F, rgba } from "../theme";
import { Screen } from "../components/Screen";
import { Touchable, Loading, ErrorState, ExpandableText } from "../components/ui";
import { FadeInView } from "../components/anim";

// One analyst's call for this session: ticker/decision, conviction, and the full thesis.
function AgentPick({ a }: { a: any }) {
  const buy = a.executed || a.status === "buy";
  const badgeColor = buy ? C.gain : rgba("#FFFFFF", 0.5);
  return (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba(a.color, 0.28), borderRadius: 16, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: rgba(a.color, 0.14), borderWidth: 1, borderColor: rgba(a.color, 0.4), alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15 }}>{a.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.text }}>{a.name}</Text>
          <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.42), fontFamily: F.mono, marginTop: 1 }}>conviction {a.conviction ?? "—"}/10</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <Text style={{ fontFamily: F.mono700, fontSize: 15, color: buy ? C.gain : a.color }}>{a.ticker || "—"}</Text>
          <View style={{ backgroundColor: rgba(badgeColor, 0.14), borderWidth: 1, borderColor: rgba(badgeColor, 0.3), borderRadius: 6, paddingVertical: 1.5, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 9, fontFamily: F.ui700, color: badgeColor, letterSpacing: 0.4 }}>{buy ? "EXECUTED" : "PASS"}</Text>
          </View>
        </View>
      </View>
      {a.thesis ? (
        <View style={{ marginTop: 11 }}>
          <ExpandableText lines={3} moreColor={a.color}>{a.thesis}</ExpandableText>
        </View>
      ) : null}
    </View>
  );
}

export function SessionPicksScreen({ route, navigation }: any) {
  const { session, label, date } = route.params;
  const { data, error, loading, reload } = useApi<any>(`/api/sessions/${session}/picks${date ? `?date=${date}` : ""}`);

  if (loading) return <Screen><Loading label="Loading picks…" /></Screen>;
  if (error || !data) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  const agents: any[] = data.agents || [];
  const buy = data.decision === "buy";

  return (
    <Screen>
      <FadeInView>
        <Touchable onPress={() => navigation.goBack()} style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 14 }}>
          <Text style={{ color: rgba("#FFFFFF", 0.6), fontSize: 20, marginTop: -2 }}>‹</Text>
          <Text style={{ color: rgba("#FFFFFF", 0.6), fontSize: 14, fontFamily: F.ui600 }}>Market Check</Text>
        </Touchable>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontFamily: F.display800, fontSize: 27, letterSpacing: -0.6, color: C.text }}>{label || session} picks</Text>
            <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.45), marginTop: 3, fontFamily: F.mono }}>{data.date} · {agents.length} analysts</Text>
          </View>
          <View style={{ backgroundColor: rgba(buy ? C.gain : "#FFFFFF", buy ? 0.14 : 0.06), borderWidth: 1, borderColor: rgba(buy ? C.gain : "#FFFFFF", buy ? 0.3 : 0.12), borderRadius: 9, paddingVertical: 5, paddingHorizontal: 11 }}>
            <Text style={{ fontFamily: F.ui700, fontSize: 12, color: buy ? C.gain : rgba("#FFFFFF", 0.6) }}>
              {data.decision == null ? "—" : buy ? `BUY ${data.ticker || ""}` : "PASS"}
            </Text>
          </View>
        </View>

        {(data.regime || data.vix != null || data.alpha != null) && (
          <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.42), fontFamily: F.mono, marginTop: 8 }}>
            {[data.regime ? `${String(data.regime).toUpperCase()} regime` : null, data.vix != null ? `VIX ${data.vix}` : null, data.alpha != null ? `alpha ${data.alpha > 0 ? "+" : ""}${data.alpha}%` : null].filter(Boolean).join(" · ")}
          </Text>
        )}

        {/* The PM's decision write-up for this session */}
        {data.reasoning ? (
          <View style={{ marginTop: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 16, padding: 15 }}>
            <Text style={{ fontSize: 10.5, fontFamily: F.ui700, letterSpacing: 0.6, color: rgba("#FFFFFF", 0.5), marginBottom: 7 }}>HOW THE PM READ IT</Text>
            <ExpandableText lines={5} threshold={200}>{data.reasoning}</ExpandableText>
          </View>
        ) : null}

        <Text style={{ fontSize: 12, color: rgba("#FFFFFF", 0.45), lineHeight: 17, fontFamily: F.ui, marginTop: 20, marginBottom: 14 }}>
          What each of the six analysts said — tap a thesis to expand.
        </Text>

        <View style={{ gap: 9 }}>
          {agents.map((a) => <AgentPick key={a.agentId} a={a} />)}
          {agents.length === 0 && (
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 16, padding: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.5), fontFamily: F.ui, textAlign: "center" }}>No recorded picks for this session.</Text>
            </View>
          )}
        </View>
        <View style={{ height: 10 }} />
      </FadeInView>
    </Screen>
  );
}
