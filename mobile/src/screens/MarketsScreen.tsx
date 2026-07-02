import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useApi } from "../api";
import { C, F, rgba, pnlColor, signed, money } from "../theme";
import { Screen } from "../components/Screen";
import { Dot, Loading, ErrorState, Touchable } from "../components/ui";
import { FadeInView } from "../components/anim";
import { Sparkline } from "../components/Sparkline";

// Short accent glyph per ticker for the card tile.
export const GLYPH: Record<string, string> = {
  SPY: "S&P", QQQ: "QQQ", GLD: "Au", BTC: "₿", US10Y: "10Y", DXY: "$",
  IWM: "RUT", VIX: "VIX", WTI: "Oil", TLT: "20Y", EEM: "EM", ETH: "Ξ",
};

// kind-aware formatting shared with the detail screen.
export function fmtLevel(m: any): string {
  if (m.kind === "yield") return (m.latest ?? 0).toFixed(2) + "%";
  if (m.kind === "level") return (m.latest ?? 0).toFixed(2);
  return money(m.latest);
}
export function fmtDay(m: any): string {
  if (m.kind === "yield") return (m.dayBps == null ? "—" : signed(m.dayBps, 0) + " bps");
  return m.dayPct == null ? "—" : signed(m.dayPct) + "%";
}
export const dayColor = (m: any) => (m.kind === "yield" ? m.color : pnlColor(m.dayPct));
export const lineColor = (m: any) => (m.kind === "yield" ? m.color : m.up ? C.gain : C.loss);

function GlyphTile({ id, color }: { id: string; color: string }) {
  return (
    <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: rgba(color, 0.13), borderWidth: 1, borderColor: rgba(color, 0.32), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.mono700, fontSize: 10.5, color }}>{GLYPH[id] || id.slice(0, 3)}</Text>
    </View>
  );
}

function BenchmarkCard({ m, onPress }: { m: any; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 16, padding: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <GlyphTile id={m.id} color={m.color} />
        <View style={{ width: 78 }}>
          <Text style={{ fontFamily: F.mono700, fontSize: 14.5, color: C.text }} numberOfLines={1}>{m.name}</Text>
          <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.4), marginTop: 1, fontFamily: F.ui }} numberOfLines={1}>{m.sector}</Text>
        </View>
        <View style={{ flex: 1, height: 34, justifyContent: "center" }}>
          <Sparkline values={m.spark || []} color={lineColor(m)} width="100%" />
        </View>
        <View style={{ alignItems: "flex-end", minWidth: 70 }}>
          <Text style={{ fontFamily: F.mono700, fontSize: 13.5, color: C.text }} numberOfLines={1}>{fmtLevel(m)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: dayColor(m), marginTop: 1 }}>{fmtDay(m)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: rgba("#FFFFFF", 0.06) }}>
        <Dot color={lineColor(m)} size={6} />
        <Text style={{ flex: 1, fontSize: 11.5, color: rgba("#FFFFFF", 0.55), fontFamily: F.ui }} numberOfLines={1}>{m.headline}</Text>
      </View>
    </Touchable>
  );
}

export function MarketsScreen({ navigation }: any) {
  const { data, error, loading, reload } = useApi<any>("/api/markets", { pollMs: 60000 });
  const { data: account } = useApi<any>("/api/account", { pollMs: 30000 });

  if (loading) return <Screen><Loading label="Loading markets…" /></Screen>;
  if (error || !data) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  const sel: string[] = account?.markets || ["SPY", "QQQ", "GLD", "BTC", "US10Y", "DXY"];
  const all: any[] = data.markets || [];
  const shown = sel.map((id) => all.find((m) => m.id === id)).filter(Boolean);
  const regime = data.regime || {};
  const regimeTone = regime.tone === "bull" ? C.gain : regime.tone === "bear" ? C.loss : C.gold;

  return (
    <Screen>
      <FadeInView>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ fontFamily: F.display800, fontSize: 32, letterSpacing: -1, color: C.text }}>Markets</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 9, paddingVertical: 5, paddingHorizontal: 9 }}>
            <Dot color={C.gain} size={6} />
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.55), letterSpacing: 0.4 }}>LIVE</Text>
          </View>
        </View>
        <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.48), lineHeight: 18, fontFamily: F.ui, marginBottom: 18 }}>
          The macro backdrop the desk trades against.
        </Text>

        {/* Macro regime read */}
        <View style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: rgba(C.gold, 0.3) }}>
          <LinearGradient colors={["rgba(245,183,49,.14)", "rgba(245,183,49,.03)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={{ padding: 18 }}>
              <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 0.8, color: C.gold }}>◆ MACRO REGIME READ</Text>
              <Text style={{ fontFamily: F.display800, fontSize: 24, letterSpacing: -0.5, color: C.text, marginTop: 7 }}>{regime.headline || "—"}</Text>
              <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.62), marginTop: 6, lineHeight: 18, fontFamily: F.ui }}>{regime.note || ""}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Key benchmarks + edit */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text }}>Key benchmarks</Text>
          <Touchable onPress={() => navigation.navigate("MarketsCustomize")} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: rgba(C.gain, 0.12), borderWidth: 1, borderColor: rgba(C.gain, 0.3), borderRadius: 10, paddingVertical: 6, paddingHorizontal: 11 }}>
            <Text style={{ fontFamily: F.ui700, fontSize: 12, color: C.gain, letterSpacing: 0.3 }}>EDIT · {shown.length}</Text>
          </Touchable>
        </View>

        <View style={{ gap: 8 }}>
          {shown.map((m: any) => (
            <BenchmarkCard key={m.id} m={m} onPress={() => navigation.navigate("MarketDetail", { id: m.id, name: m.name, color: m.color })} />
          ))}
        </View>
      </FadeInView>
    </Screen>
  );
}
