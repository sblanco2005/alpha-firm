import React, { useState } from "react";
import { View, Text } from "react-native";
import { useApi } from "../api";
import { C, F, rgba, pnlColor, pct, money, fmtPrice } from "../theme";
import { Screen } from "../components/Screen";
import { Touchable, Loading, ErrorState, ExpandableText } from "../components/ui";
import { FadeInView } from "../components/anim";
import { PerfChart } from "../components/PerfChart";
import { PeriodBar } from "../components/PeriodBar";
import { PeriodKey, POS_LABEL, windowStartIndex, pctChange } from "../chart";

// BOUGHT = executed, PASSED = logged but no trade, INELIGIBLE = mandate blocked it.
const OUTCOME = {
  BOUGHT: { color: C.gain, icon: "✓" },
  PASSED: { color: C.gold, icon: "⏸" },
  INELIGIBLE: { color: rgba("#FFFFFF", 0.55), icon: "🚫" },
} as const;

function StatBox({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}>{label}</Text>
      <Text style={{ fontFamily: F.mono700, fontSize: 16, marginTop: 3, color: color || C.text }}>{value}</Text>
    </View>
  );
}

function Detail({ d, onBack }: { d: any; onBack: () => void }) {
  const [period, setPeriod] = useState<PeriodKey>("3M");

  // Build the value series for the selected period.
  const daily: { date: string; close: number }[] = d.history?.daily || [];
  const intraday: { t: number; value: number }[] = d.history?.intraday || [];
  let values: number[];
  if (period === "LIVE" || period === "1D") {
    values = intraday.length >= 2 ? intraday.map((p) => p.value) : daily.slice(-2).map((p) => p.close);
  } else {
    const pts = daily.map((p) => ({ date: p.date, value: p.close }));
    const start = windowStartIndex(pts, period);
    values = pts.slice(start).map((p) => p.value);
  }
  const { abs, pct: changePct, up } = pctChange(values);
  const color = up ? C.gain : C.loss;

  const tintBg = rgba(d.color, 0.13);
  const tintBorder = rgba(d.color, 0.4);
  const oc = OUTCOME[d.outcome as keyof typeof OUTCOME] || OUTCOME.PASSED;

  // "Since rec" — where the price sits vs the analyst's recommended entry.
  const sincePct = d.recPrice ? +(((d.price - d.recPrice) / d.recPrice) * 100).toFixed(1) : null;

  return (
    <Screen>
      <FadeInView>
        <Touchable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginBottom: 16 }}>
          <Text style={{ fontSize: 18, color: rgba("#FFFFFF", 0.6), marginTop: -2 }}>‹</Text>
          <Text style={{ fontSize: 13, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.6) }}>Market Check</Text>
        </Touchable>

        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Text style={{ fontFamily: F.display800, fontSize: 27, letterSpacing: -0.5, color: C.text }}>{d.ticker}</Text>
              <View style={{ backgroundColor: rgba(oc.color, 0.13), borderWidth: 1, borderColor: rgba(oc.color, 0.34), paddingVertical: 3, paddingHorizontal: 9, borderRadius: 8 }}>
                <Text style={{ fontSize: 10, fontFamily: F.ui700, color: oc.color, letterSpacing: 0.5 }}>{d.outcome}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.55), marginTop: 5, fontFamily: F.ui }}>{d.company}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.1), paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8 }}>
              <Text style={{ fontSize: 10, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.6) }}>{d.sector}</Text>
            </View>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: tintBg, borderWidth: 1, borderColor: tintBorder }}>
              <Text style={{ fontSize: 17 }}>{d.emoji}</Text>
            </View>
          </View>
        </View>

        {/* price + period change */}
        <Text style={{ fontFamily: F.display800, fontSize: 40, letterSpacing: -1.5, marginTop: 16, color: C.text }}>{fmtPrice(d.price)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Text style={{ fontFamily: F.mono700, fontSize: 13.5, color }}>{up ? "▲" : "▼"} {money(abs, { sign: true })} ({pct(changePct)})</Text>
          <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}>{POS_LABEL[period]}</Text>
        </View>

        {/* chart — baseline = the analyst's recommended price */}
        <View style={{ marginTop: 14, marginHorizontal: -4 }}>
          <PerfChart values={values} baseline={d.recPrice} color={color} height={152} />
        </View>
        <PeriodBar selected={period} onSelect={setPeriod} activeColor={color} />

        {/* stats grid */}
        <View style={{ flexDirection: "row", gap: 9, marginTop: 18 }}>
          <StatBox label="Recommended at" value={fmtPrice(d.recPrice)} />
          <StatBox label="Since rec" value={sincePct != null ? pct(sincePct, 1) : "—"} color={sincePct != null ? pnlColor(sincePct) : undefined} />
        </View>
        <View style={{ flexDirection: "row", gap: 9, marginTop: 9 }}>
          <StatBox label="Conviction" value={d.conviction != null ? `${d.conviction}/10` : "—"} color={d.color} />
          <StatBox label="Target / horizon" value={`${d.target || "—"}${d.horizon ? ` · ${d.horizon}` : ""}`} />
        </View>

        {/* why the agent picked it */}
        {d.agentWhy && (
          <View style={{ marginTop: 18, backgroundColor: tintBg, borderWidth: 1, borderColor: tintBorder, borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: tintBg }}>
                <Text style={{ fontSize: 16 }}>{d.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: F.ui700, color: d.color }}>Why {d.agent} picked it</Text>
                <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.mono, marginTop: 1 }}>conviction {d.conviction ?? "—"}/10{d.horizon ? ` · ${d.horizon}` : ""}</Text>
              </View>
            </View>
            {/* lead — the structured one-line claim if the agent emitted it, else its catalyst one-liner */}
            {d.coreClaim ? (
              <Text style={{ fontSize: 13.5, lineHeight: 19, fontFamily: F.ui600, color: C.text, marginBottom: 10 }}>{d.coreClaim}</Text>
            ) : d.catalyst ? (
              <Text style={{ fontSize: 12.5, lineHeight: 18, fontFamily: F.ui600, color: d.color, marginBottom: 9 }}>⚡ {d.catalyst}</Text>
            ) : null}

            {/* supporting facts (structured) */}
            {d.supportingFacts && d.supportingFacts.length > 0 && (
              <View style={{ gap: 5, marginBottom: 10 }}>
                {d.supportingFacts.map((f: string, i: number) => (
                  <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                    <Text style={{ color: d.color, fontSize: 12, lineHeight: 18 }}>▪</Text>
                    <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: rgba("#FFFFFF", 0.72), fontFamily: F.ui }}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* why now (structured) */}
            {d.whyNow && (
              <Text style={{ fontSize: 12, lineHeight: 18, color: rgba("#FFFFFF", 0.62), fontFamily: F.ui, marginBottom: 10 }}>
                <Text style={{ fontFamily: F.ui700, color: rgba("#FFFFFF", 0.78) }}>Why now — </Text>{d.whyNow}
              </Text>
            )}

            {/* full thesis, collapsed */}
            <ExpandableText lines={4} moreColor={d.color}>{d.agentWhy}</ExpandableText>
            {d.target && (
              <View style={{ flexDirection: "row", gap: 6, marginTop: 11, flexWrap: "wrap" }}>
                <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.1), paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7 }}>
                  <Text style={{ fontSize: 9.5, fontFamily: F.mono, color: rgba("#FFFFFF", 0.6) }}>🎯 target {d.target}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* what would break the thesis (the agent's own stated risk) */}
        {(d.falsification || d.risk) && (
          <View style={{ marginTop: 11, backgroundColor: rgba(C.loss, 0.09), borderWidth: 1, borderColor: rgba(C.loss, 0.26), borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 10.5, fontFamily: F.ui700, letterSpacing: 0.6, color: C.loss, marginBottom: 6 }}>WHAT WOULD BREAK IT</Text>
            <ExpandableText lines={3} moreColor={rgba(C.loss, 0.85)}>{d.falsification || d.risk}</ExpandableText>
          </View>
        )}

        {/* how the PM read it — the session's real decision rationale */}
        {d.pmWhy && (
          <View style={{ marginTop: 11, backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.08), borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: rgba(oc.color, 0.14), borderWidth: 1, borderColor: rgba(oc.color, 0.32), alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 15 }}>⚖️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: F.ui700, color: oc.color }}>How the PM read it</Text>
                <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.mono, marginTop: 1 }}>{d.pmDecision ? `session ${d.pmDecision}` : "PM decision"} · {d.outcomeMeta}</Text>
              </View>
            </View>
            <ExpandableText lines={4} moreColor={rgba(oc.color, 0.85)}>{d.pmWhy}</ExpandableText>
          </View>
        )}

        <View style={{ height: 10 }} />
      </FadeInView>
    </Screen>
  );
}

export function PickDetailScreen({ route, navigation }: any) {
  const { agentId } = route.params;
  const { data, error, loading, reload } = useApi<any>(`/api/check/picks/${agentId}`);

  if (loading) return <Screen><Loading label="Loading pick…" /></Screen>;
  if (error || !data) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;
  return <Detail d={data} onBack={() => navigation.goBack()} />;
}
