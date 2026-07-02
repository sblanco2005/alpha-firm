import React, { useState } from "react";
import { View, Text, Linking } from "react-native";
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useApi } from "../api";
import { C, F, rgba, pnlColor, signed } from "../theme";
import { Screen } from "../components/Screen";
import { Loading, ErrorState, Touchable } from "../components/ui";
import { FadeInView } from "../components/anim";
import { PeriodBar } from "../components/PeriodBar";
import { PeriodKey } from "../chart";
import { GLYPH } from "./MarketsScreen";

const PERIOD_LABEL: Record<string, string> = {
  LIVE: "Today", "1D": "Today", "1W": "Past week", "1M": "Past month",
  "3M": "Past 3 months", YTD: "Year to date", "1Y": "Past year",
};

// Accent-themed area chart (line + gradient fill both in the ticker's accent).
function AreaChart({ values, color, height = 150 }: { values: number[]; color: string; height?: number }) {
  const W = 340, H = height, padT = 10, padB = 10;
  if (!values || values.length < 2) return <View style={{ height }} />;
  const min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) * 0.12 || 1;
  const lo = min - span, hi = max + span;
  const X = (i: number) => (i / (values.length - 1)) * W;
  const Y = (v: number) => H - padB - ((v - lo) / (hi - lo)) * (H - padT - padB);
  let line = `M ${X(0).toFixed(1)} ${Y(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) line += ` L ${X(i).toFixed(1)} ${Y(values[i]).toFixed(1)}`;
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return (
    <View style={{ height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="mktFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Path d={area} fill="url(#mktFill)" />
        <Path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={X(values.length - 1)} cy={Y(values[values.length - 1])} r={3.4} fill={color} />
      </Svg>
    </View>
  );
}

function heroLevel(d: any): string {
  if (d.kind === "yield") return (d.latest ?? 0).toFixed(2) + "%";
  if (d.kind === "level") return (d.latest ?? 0).toFixed(2);
  return "$" + (d.latest ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function StatBox({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 13 }}>
      <Text style={{ fontSize: 10.5, color: C.text3, fontFamily: F.ui, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontFamily: F.mono700, fontSize: 15, color }}>{value}</Text>
    </View>
  );
}
const TAG_COLOR: Record<string, string> = { BULLISH: C.gain, BEARISH: C.loss, NEUTRAL: C.gold };

export function MarketDetailScreen({ route, navigation }: any) {
  const { id, color: accent } = route.params;
  const [period, setPeriod] = useState<PeriodKey>("3M");
  const { data: d, error, loading, reload } = useApi<any>(`/api/markets/${id}?period=${period}`);

  if (loading && !d) return <Screen><Loading label="Loading…" /></Screen>;
  if (error || !d) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  const color = d.color || accent || C.gain;
  const isYield = d.kind === "yield";
  const changeText = isYield
    ? (d.changeBps == null ? "—" : signed(d.changeBps, 0) + " bps")
    : (d.changePct == null ? "—" : signed(d.changePct) + "%");
  const changeCol = isYield ? color : pnlColor(d.changePct);
  const values: number[] = (d.series || []).map((s: any) => s.value).filter((x: number) => x != null);
  const range = d.range52 ? `${d.range52[0]}–${d.range52[1]}` : "—";
  const todayText = isYield ? (d.dayBps == null ? "—" : signed(d.dayBps, 0) + " bps") : (d.dayPct == null ? "—" : signed(d.dayPct) + "%");

  return (
    <Screen>
      <FadeInView>
        <Touchable onPress={() => navigation.goBack()} style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 14 }}>
          <Text style={{ color: rgba("#FFFFFF", 0.6), fontSize: 20, marginTop: -2 }}>‹</Text>
          <Text style={{ color: rgba("#FFFFFF", 0.6), fontSize: 14, fontFamily: F.ui600 }}>Markets</Text>
        </Touchable>

        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.display800, fontSize: 27, letterSpacing: -0.6, color: C.text }}>{d.name}</Text>
            <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.45), marginTop: 2, fontFamily: F.ui }}>{d.full}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 7 }}>
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: rgba(color, 0.13), borderWidth: 1, borderColor: rgba(color, 0.34), alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.mono700, fontSize: 11, color }}>{GLYPH[id] || id.slice(0, 3)}</Text>
            </View>
            <View style={{ backgroundColor: rgba(color, 0.12), borderWidth: 1, borderColor: rgba(color, 0.3), borderRadius: 7, paddingVertical: 2, paddingHorizontal: 7 }}>
              <Text style={{ fontFamily: F.ui600, fontSize: 10, color }}>{d.sector}</Text>
            </View>
          </View>
        </View>

        <Text style={{ fontFamily: F.display800, fontSize: 40, letterSpacing: -1.5, color: C.text, marginTop: 14 }}>{heroLevel(d)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono700, fontSize: 15, color: changeCol }}>{changeText}</Text>
          <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}>{PERIOD_LABEL[period]}</Text>
        </View>

        <View style={{ marginTop: 14, marginHorizontal: -4 }}>
          <AreaChart values={values} color={color} />
        </View>
        <PeriodBar selected={period} onSelect={setPeriod} activeColor={color} />

        {/* Stat grid 2×2 */}
        <View style={{ gap: 8, marginTop: 16 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatBox label="Today" value={todayText} color={isYield ? color : pnlColor(d.dayPct)} />
            <StatBox label="Year to date" value={d.ytdPct == null ? "—" : signed(d.ytdPct) + "%"} color={pnlColor(d.ytdPct)} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatBox label="1-year" value={d.oneYPct == null ? "—" : signed(d.oneYPct) + "%"} color={pnlColor(d.oneYPct)} />
            <StatBox label="52-wk range" value={range} />
          </View>
        </View>

        {/* What is X */}
        <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 24, marginBottom: 8, marginHorizontal: 2 }}>What is {d.name}?</Text>
        <Text style={{ fontSize: 13, color: rgba("#FFFFFF", 0.7), lineHeight: 19, fontFamily: F.ui }}>{d.what}</Text>

        {/* What it means for the book */}
        <View style={{ marginTop: 18, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: rgba(color, 0.3) }}>
          <LinearGradient colors={[rgba(color, 0.14), rgba(color, 0.03)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={{ padding: 15 }}>
              <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 0.6, color }}>WHAT IT MEANS FOR THE BOOK</Text>
              <Text style={{ fontSize: 13, color: rgba("#FFFFFF", 0.78), marginTop: 7, lineHeight: 19, fontFamily: F.ui }}>{d.read}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* What's moving it */}
        {d.news && d.news.length > 0 && (
          <>
            <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>What's moving it</Text>
            <View style={{ gap: 8 }}>
              {d.news.map((n: any, i: number) => {
                const tag = TAG_COLOR[n.tag] || C.gold;
                return (
                  <Touchable key={i} onPress={() => n.url && Linking.openURL(n.url).catch(() => {})} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 13 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ backgroundColor: rgba(tag, 0.14), borderWidth: 1, borderColor: rgba(tag, 0.3), borderRadius: 6, paddingVertical: 1.5, paddingHorizontal: 6 }}>
                          <Text style={{ fontSize: 8.5, fontFamily: F.ui700, color: tag, letterSpacing: 0.5 }}>{n.tag}</Text>
                        </View>
                        <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.5) }}>{n.source}</Text>
                      </View>
                      <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.4) }}>{n.time}</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: rgba("#FFFFFF", 0.82), lineHeight: 18, fontFamily: F.ui }} numberOfLines={3}>{n.title}</Text>
                  </Touchable>
                );
              })}
            </View>
          </>
        )}
        <View style={{ height: 12 }} />
      </FadeInView>
    </Screen>
  );
}
