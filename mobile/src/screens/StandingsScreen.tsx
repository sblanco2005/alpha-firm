import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useApi } from "../api";
import { C, F, ANALYSTS, rgba, pnlColor, money, fmtWinRate } from "../theme";
import { Screen } from "../components/Screen";
import { Loading, ErrorState, ScreenTitle } from "../components/ui";
import { FadeInView } from "../components/anim";

const PRINCIPLES = [
  { lead: "Cut losses fast.", rest: "A small loss is a gift." },
  { lead: "Let winners run.", rest: "Don't panic-sell a working position." },
  { lead: "Never average down.", rest: "More wrong, more money." },
  { lead: "Sit on your hands.", rest: "Most days, doing nothing wins." },
  { lead: "The market is never wrong.", rest: "Price is truth." },
];

function LeaderRow({ a, rank }: { a: any; rank: number }) {
  const dim = a.statusType === "benched" || a.statusType === "suspended";
  const label = ANALYSTS[a.id]?.label || a.name;
  return (
    <View style={{ backgroundColor: dim ? C.cardDim : C.card, borderWidth: 1, borderColor: rank === 1 ? rgba(a.color, 0.28) : C.hair, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 13, opacity: dim ? 0.78 : 1 }}>
      <Text style={{ fontFamily: F.display800, fontSize: 17, color: rank === 1 ? C.gold : rgba("#FFFFFF", 0.4), width: 20 }}>{rank}</Text>
      <Text style={{ fontSize: 20 }}>{a.emoji}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontFamily: F.ui600, fontSize: 14, color: C.text }}>{label}</Text>
          {a.badge && (
            <View style={{ backgroundColor: rgba(C.loss, 0.14), paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 }}>
              <Text style={{ fontSize: 8.5, fontFamily: F.ui700, color: C.loss }}>{a.badge}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.42), fontFamily: F.mono, marginTop: 1 }}>{fmtWinRate(a.winRate)} win · {a.executed ?? "—"} exec</Text>
      </View>
      <Text style={{ fontFamily: F.mono700, fontSize: 15, color: pnlColor(a.realizedPnl) }}>{money(a.realizedPnl, { sign: true })}</Text>
    </View>
  );
}

export function StandingsScreen() {
  const { data: analysts, error, loading, reload } = useApi<any[]>("/api/analysts", { pollMs: 60000 });
  const { data: portfolio } = useApi<any>("/api/portfolio", { pollMs: 60000 });

  if (loading) return <Screen><Loading label="Loading standings…" /></Screen>;
  if (error || !analysts) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  const ranked = [...analysts].sort((a, b) => (b.realizedPnl ?? -1e9) - (a.realizedPnl ?? -1e9));
  const leader = ranked[0];
  const nav = portfolio?.nav;
  const profit = nav != null ? nav - 10000 : null;
  const rewardPool = profit != null ? Math.max(0, profit * 0.2) : null;

  return (
    <Screen>
      <FadeInView>
        <ScreenTitle title="Standings" subtitle="Agents earn influence through track record. Bad analysts get discounted — automatically." />

        {/* Reward pool */}
        <View style={{ marginTop: 18, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: rgba(C.gold, 0.34) }}>
          <LinearGradient colors={["rgba(255,210,77,.16)", "rgba(255,210,77,.03)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 0.8, color: C.gold }}>🏆 REWARD POOL · WINNER-TAKE-ALL</Text>
                <Text style={{ fontFamily: F.display800, fontSize: 30, marginTop: 5, letterSpacing: -0.5, color: C.text }}>
                  {rewardPool == null ? "—" : "$" + rewardPool.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={{ fontSize: 11.5, color: rgba("#FFFFFF", 0.5), marginTop: 2, fontFamily: F.ui }}>20% of firm profit → leading analyst</Text>
              </View>
              {leader && (
                <View style={{ alignItems: "center" }}>
                  <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: rgba(leader.color, 0.14), borderWidth: 1, borderColor: rgba(leader.color, 0.4), alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 26 }}>{leader.emoji}</Text>
                  </View>
                  <Text style={{ fontSize: 10.5, color: leader.color, marginTop: 5, fontFamily: F.ui600 }}>{ANALYSTS[leader.id]?.label || leader.name}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

        <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 22, marginBottom: 12, marginHorizontal: 2 }}>Agent leaderboard</Text>
        <View style={{ gap: 8 }}>
          {ranked.map((a, i) => <LeaderRow key={a.id} a={a} rank={i + 1} />)}
        </View>

        <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 24, marginBottom: 11, marginHorizontal: 2 }}>The Soul · non-negotiables</Text>
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 18, paddingHorizontal: 16 }}>
          {PRINCIPLES.map((p, i) => (
            <View key={p.lead} style={{ paddingVertical: 11, borderBottomWidth: i < PRINCIPLES.length - 1 ? 1 : 0, borderBottomColor: rgba("#FFFFFF", 0.06) }}>
              <Text style={{ fontSize: 13, color: rgba("#FFFFFF", 0.78), fontFamily: F.ui, lineHeight: 18 }}>
                <Text style={{ color: C.gain, fontFamily: F.ui700 }}>{p.lead}</Text> {p.rest}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ height: 8 }} />
      </FadeInView>
    </Screen>
  );
}
