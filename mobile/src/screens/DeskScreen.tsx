import React from "react";
import { View, Text } from "react-native";
import { useApi } from "../api";
import { C, F, rgba, pnlColor, money, fmtWinRate } from "../theme";
import { Screen } from "../components/Screen";
import { AvatarBadge, StatusBadge, Touchable, Loading, ErrorState, ScreenTitle } from "../components/ui";
import { FadeInView } from "../components/anim";

function badgeColor(a: any) {
  return a.statusType === "restricted" ? a.color : C.loss;
}

function RosterCard({ a, onPress }: { a: any; onPress: () => void }) {
  const dim = a.statusType === "benched" || a.statusType === "suspended";
  return (
    <Touchable
      onPress={onPress}
      style={{
        backgroundColor: dim ? C.cardDim : C.card,
        borderWidth: 1,
        borderColor: a.isLeader ? rgba(a.color, 0.28) : rgba("#FFFFFF", 0.08),
        borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "center", gap: 14,
        opacity: dim ? 0.72 : 1,
      }}
    >
      <AvatarBadge color={a.color} emoji={a.emoji} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text }}>{a.name}</Text>
          {a.isLeader && <Text style={{ fontSize: 13 }}>⭐</Text>}
          {a.badge && <StatusBadge text={a.badge} color={badgeColor(a)} />}
        </View>
        <Text style={{ fontSize: 11.5, color: a.color, marginTop: 1, fontFamily: F.ui }}>“{a.nickname}” · {a.tagline}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 15, color: pnlColor(a.realizedPnl) }}>{money(a.realizedPnl, { sign: true })}</Text>
        <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), marginTop: 1, fontFamily: F.ui }}>{fmtWinRate(a.winRate)} · {a.picks ?? "—"} picks</Text>
      </View>
    </Touchable>
  );
}

export function DeskScreen({ navigation }: any) {
  const { data: analysts, error, loading, reload } = useApi<any[]>("/api/analysts", { pollMs: 60000 });

  if (loading) return <Screen><Loading label="Loading the desk…" /></Screen>;
  if (error || !analysts) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  return (
    <Screen>
      <FadeInView>
        <ScreenTitle
          title="The Desk"
          subtitle={<>Six analysts. Independent research, in parallel — <Text style={{ color: C.text }}>no analyst sees the others.</Text></>}
        />
        <View style={{ gap: 10, marginTop: 20 }}>
          {analysts.map((a) => (
            <RosterCard key={a.id} a={a} onPress={() => navigation.navigate("AnalystDetail", { id: a.id, name: a.name })} />
          ))}
        </View>
      </FadeInView>
    </Screen>
  );
}
