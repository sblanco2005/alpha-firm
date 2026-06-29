import React from "react";
import { View, Text } from "react-native";
import { useApi } from "../api";
import { C, F, rgba, pnlColor, money, fmtWinRate, pct } from "../theme";
import { Screen } from "../components/Screen";
import { AvatarBadge, Loading, ErrorState, Touchable } from "../components/ui";
import { FadeInView } from "../components/anim";

function statusColor(a: any) {
  if (a.statusType === "leader") return C.gold;
  if (a.statusType === "benched" || a.statusType === "suspended") return C.loss;
  return a.color;
}

function StatBox({ value, label, color }: { value: React.ReactNode; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 15 }}>
      <Text style={{ fontFamily: F.mono700, fontSize: 21, color: color || C.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.45), marginTop: 2, fontFamily: F.ui }}>{label}</Text>
    </View>
  );
}

function CalibrationRow({ band, bandColor, text }: { band: string; bandColor: string; text?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 11, alignItems: "flex-start", backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 13 }}>
      <Text style={{ fontFamily: F.mono700, fontSize: 13, color: bandColor }}>{band}</Text>
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: rgba("#FFFFFF", 0.65), fontFamily: F.ui }}>{text}</Text>
    </View>
  );
}

export function AnalystDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { data: a, error, loading, reload } = useApi<any>(`/api/analysts/${id}`);

  const BackRow = (
    <Touchable onPress={() => navigation.goBack()} style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginBottom: 18 }}>
      <Text style={{ fontSize: 20, lineHeight: 20, color: rgba("#FFFFFF", 0.6), marginTop: -2 }}>‹</Text>
      <Text style={{ fontSize: 13, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.6) }}>The Desk</Text>
    </Touchable>
  );

  if (loading) return <Screen><FadeInView>{BackRow}<Loading label="Loading scorecard…" /></FadeInView></Screen>;
  if (error || !a) return <Screen><FadeInView>{BackRow}<ErrorState error={error} onRetry={reload} /></FadeInView></Screen>;

  const sColor = statusColor(a);
  const tintBg = rgba(a.color, 0.13);
  const tintBorder = rgba(a.color, 0.4);

  return (
    <Screen>
      <FadeInView>
        {BackRow}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
          <AvatarBadge color={a.color} emoji={a.emoji} size={66} radius={18} fontSize={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: F.display800, fontSize: 23, letterSpacing: -0.5, color: C.text }}>{a.name}</Text>
            <Text style={{ fontSize: 13, marginTop: 3, color: a.color, fontFamily: F.ui }}>“{a.nickname}”</Text>
          </View>
        </View>

        <View style={{ alignSelf: "flex-start", marginTop: 14, backgroundColor: rgba(sColor, 0.12), borderWidth: 1, borderColor: rgba(sColor, 0.32), paddingVertical: 5, paddingHorizontal: 11, borderRadius: 9 }}>
          <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 0.5, color: sColor }}>{a.status}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 9, marginTop: 18 }}>
          <StatBox value={money(a.realizedPnl, { sign: true })} label="Realized P&L" color={pnlColor(a.realizedPnl)} />
          <StatBox value={fmtWinRate(a.winRate)} label="Win rate" />
        </View>
        <View style={{ flexDirection: "row", gap: 9, marginTop: 9 }}>
          <StatBox value={a.picks ?? "—"} label="Recommendations" />
          <Touchable onPress={() => navigation.push("AgentTransactions", { id })} style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: tintBorder, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 15 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.mono700, fontSize: 21, color: C.text }}>{a.executed ?? "—"}</Text>
              <Text style={{ fontSize: 15, color: a.color }}>›</Text>
            </View>
            <Text style={{ fontSize: 11, color: a.color, marginTop: 2, fontFamily: F.ui }}>Executed · view trades</Text>
          </Touchable>
        </View>

        <Text style={{ marginTop: 18, fontSize: 13.5, lineHeight: 20, color: rgba("#FFFFFF", 0.7), fontFamily: F.ui }}>{a.blurb}</Text>

        <View style={{ marginTop: 14, backgroundColor: tintBg, borderWidth: 1, borderColor: tintBorder, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 15 }}>
          <Text style={{ fontSize: 10.5, fontFamily: F.ui700, letterSpacing: 1, color: a.color, marginBottom: 5 }}>THE EDGE</Text>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: rgba("#FFFFFF", 0.78), fontFamily: F.ui }}>{a.edge}</Text>
        </View>

        <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 22, marginBottom: 11, marginHorizontal: 2 }}>Conviction calibration</Text>
        <View style={{ gap: 8 }}>
          <CalibrationRow band="9–10" bandColor={C.gain} text={a.calibration?.c910} />
          <CalibrationRow band="7–8" bandColor={C.gold} text={a.calibration?.c78} />
          <CalibrationRow band="5–6" bandColor={rgba("#FFFFFF", 0.5)} text={a.calibration?.c56} />
        </View>

        <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 22, marginBottom: 11, marginHorizontal: 2 }}>Holding now</Text>
        {a.holdings && a.holdings.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {a.holdings.map((h: any) => (
              <View key={h.ticker} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.08), borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Text style={{ fontFamily: F.mono700, fontSize: 14, color: C.text }}>{h.ticker}</Text>
                <Text style={{ fontFamily: F.mono700, fontSize: 13, color: pnlColor(h.returnPct) }}>{h.returnPct == null ? "—" : pct(h.returnPct, 1)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.4), fontStyle: "italic", fontFamily: F.ui }}>No open positions — sitting on its hands.</Text>
        )}
        <View style={{ height: 8 }} />
      </FadeInView>
    </Screen>
  );
}
