import React, { useState } from "react";
import { View, Text } from "react-native";
import { useApi } from "../api";
import { C, F, rgba, pnlColor, pct, money, fmtPrice } from "../theme";
import { Screen } from "../components/Screen";
import { Touchable, Loading, ErrorState } from "../components/ui";
import { FadeInView } from "../components/anim";
import { PerfChart } from "../components/PerfChart";
import { PeriodBar } from "../components/PeriodBar";
import { PeriodKey, POS_LABEL, windowStartIndex, pctChange } from "../chart";

const TONE = {
  good: C.gain, warn: C.gold, bad: C.loss,
} as const;

function StatBox({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}>{label}</Text>
      <Text style={{ fontFamily: F.mono700, fontSize: 16, marginTop: 3, color: color || C.text }}>{value}</Text>
    </View>
  );
}

const fmtDate = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

function Detail({ d, onBack }: { d: any; onBack: () => void }) {
  const [period, setPeriod] = useState<PeriodKey>("YTD");

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

  const tintBg = rgba(d.agentColor, 0.13);
  const tintBorder = rgba(d.agentColor, 0.4);
  const mgmtColor = d.mgmt ? TONE[d.mgmt.tone as keyof typeof TONE] || C.gold : C.gold;

  return (
    <Screen>
      <FadeInView>
        <Touchable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginBottom: 16 }}>
          <Text style={{ fontSize: 18, color: rgba("#FFFFFF", 0.6), marginTop: -2 }}>‹</Text>
          <Text style={{ fontSize: 13, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.6) }}>Portfolio</Text>
        </Touchable>

        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: F.display800, fontSize: 27, letterSpacing: -0.5, color: C.text }}>{d.ticker}</Text>
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

        {/* chart */}
        <View style={{ marginTop: 14, marginHorizontal: -4 }}>
          <PerfChart values={values} baseline={d.entryPrice} color={color} height={152} />
        </View>
        <PeriodBar selected={period} onSelect={setPeriod} activeColor={color} />

        {/* holdings grid */}
        <View style={{ flexDirection: "row", gap: 9, marginTop: 18 }}>
          <StatBox label="Shares" value={d.shares} />
          <StatBox label="Avg cost" value={fmtPrice(d.entryPrice)} />
        </View>
        <View style={{ flexDirection: "row", gap: 9, marginTop: 9 }}>
          <StatBox label="Market value" value={fmtPrice(d.marketValue)} />
          <StatBox label="Total return" value={pct(d.totalReturnPct, 1)} color={pnlColor(d.totalReturnPct)} />
        </View>

        {/* transaction history — how long the PM has held it */}
        {d.transactions && d.transactions.length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 22, marginBottom: 9, marginHorizontal: 2 }}>
              <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text }}>Transactions</Text>
              {d.heldDays != null && (
                <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.45), fontFamily: F.mono }}>held {d.heldDays}d · since {d.heldSince ? fmtDate(d.heldSince) : "—"}</Text>
              )}
            </View>
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 16, paddingHorizontal: 14 }}>
              {d.transactions.map((t: any, i: number) => {
                const isBuy = t.action === "buy";
                const tc = isBuy ? C.gain : C.loss;
                return (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, borderBottomWidth: i < d.transactions.length - 1 ? 1 : 0, borderBottomColor: rgba("#FFFFFF", 0.06) }}>
                    <View style={{ backgroundColor: rgba(tc, 0.14), borderWidth: 1, borderColor: rgba(tc, 0.3), borderRadius: 7, paddingVertical: 2, paddingHorizontal: 8 }}>
                      <Text style={{ fontSize: 10, fontFamily: F.ui700, color: tc, letterSpacing: 0.5 }}>{isBuy ? "BUY" : "SELL"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.ui600, fontSize: 13, color: C.text }}>{fmtDate(t.date)}</Text>
                      <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.45), fontFamily: F.mono, marginTop: 1 }}>{t.shares} sh{t.price != null ? ` @ ${fmtPrice(t.price)}` : ""}</Text>
                    </View>
                    {t.price != null && t.shares != null && (
                      <Text style={{ fontFamily: F.mono700, fontSize: 13, color: rgba("#FFFFFF", 0.7) }}>{fmtPrice(t.price * t.shares)}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* what is */}
        {d.what && (
          <>
            <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 22, marginBottom: 9, marginHorizontal: 2 }}>What is {d.ticker}?</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: rgba("#FFFFFF", 0.7), fontFamily: F.ui }}>{d.what}</Text>
          </>
        )}

        {/* why agent picked it */}
        {d.agentWhy && (
          <View style={{ marginTop: 18, backgroundColor: tintBg, borderWidth: 1, borderColor: tintBorder, borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: tintBg }}>
                <Text style={{ fontSize: 16 }}>{d.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: F.ui700, color: d.agentColor }}>Why {d.agent} picked it</Text>
                <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.mono, marginTop: 1 }}>conviction {d.conv}/10 · {d.horizon}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: rgba("#FFFFFF", 0.78), fontFamily: F.ui }}>{d.agentWhy}</Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 11, flexWrap: "wrap" }}>
              {d.catalyst && (
                <View style={{ backgroundColor: tintBg, borderWidth: 1, borderColor: tintBorder, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7 }}>
                  <Text style={{ fontSize: 9.5, fontFamily: F.mono, color: d.agentColor }}>⚡ {d.catalyst}</Text>
                </View>
              )}
              {d.target && (
                <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.1), paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7 }}>
                  <Text style={{ fontSize: 9.5, fontFamily: F.mono, color: rgba("#FFFFFF", 0.6) }}>🎯 target {d.target}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* why PM approved */}
        {d.pmWhy && (
          <View style={{ marginTop: 11, backgroundColor: C.card, borderWidth: 1, borderColor: rgba("#FFFFFF", 0.08), borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: rgba(C.gain, 0.14), borderWidth: 1, borderColor: rgba(C.gain, 0.32), alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 15 }}>⚖️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: F.ui700, color: C.gain }}>Why the PM approved it</Text>
                <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.mono, marginTop: 1 }}>final score {d.score} · {d.verdict}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: rgba("#FFFFFF", 0.78), fontFamily: F.ui }}>{d.pmWhy}</Text>
          </View>
        )}

        {/* position management */}
        {d.mgmt && (
          <View style={{ marginTop: 11, backgroundColor: rgba(mgmtColor, 0.1), borderWidth: 1, borderColor: rgba(mgmtColor, 0.3), borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10.5, fontFamily: F.ui700, letterSpacing: 0.5, color: mgmtColor }}>POSITION MANAGEMENT</Text>
              <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.78), marginTop: 3, fontFamily: F.ui }}>{d.mgmt.label} — {d.mgmt.read}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 10, color: rgba("#FFFFFF", 0.42), fontFamily: F.ui }}>stop</Text>
              <Text style={{ fontFamily: F.mono700, fontSize: 13, color: C.text }}>{d.stop}</Text>
            </View>
          </View>
        )}
        <View style={{ height: 10 }} />
      </FadeInView>
    </Screen>
  );
}

export function PositionDetailScreen({ route, navigation }: any) {
  const { ticker } = route.params;
  const { data, error, loading, reload } = useApi<any>(`/api/positions/${ticker}`);

  if (loading) return <Screen><Loading label={`Loading ${ticker}…`} /></Screen>;
  if (error || !data) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;
  return <Detail d={data} onBack={() => navigation.goBack()} />;
}
