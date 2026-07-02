import React, { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { useApi, apiPost } from "../api";
import { C, F, rgba } from "../theme";
import { Screen } from "../components/Screen";
import { Loading, ErrorState, Touchable } from "../components/ui";
import { FadeInView } from "../components/anim";
import { GLYPH, fmtLevel, fmtDay, dayColor } from "./MarketsScreen";

const MAX = 12;

function ToggleRow({ m, on, disabled, onToggle }: { m: any; on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <Touchable onPress={onToggle} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, opacity: disabled ? 0.42 : 1 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: rgba(m.color, 0.13), borderWidth: 1, borderColor: rgba(m.color, 0.32), alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 10, color: m.color }}>{GLYPH[m.id] || m.id.slice(0, 3)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 14, color: C.text }} numberOfLines={1}>{m.name}</Text>
        <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.4), marginTop: 1, fontFamily: F.ui }} numberOfLines={1}>{m.full}</Text>
      </View>
      <View style={{ alignItems: "flex-end", marginRight: 4 }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 12.5, color: C.text }}>{fmtLevel(m)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: dayColor(m), marginTop: 1 }}>{fmtDay(m)}</Text>
      </View>
      <View style={{ width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.gain : "transparent", borderWidth: on ? 0 : 1.5, borderColor: rgba("#FFFFFF", 0.3) }}>
        <Text style={{ fontSize: 15, fontFamily: F.ui700, color: on ? C.bg : rgba("#FFFFFF", 0.5), marginTop: -1 }}>{on ? "✓" : "+"}</Text>
      </View>
    </Touchable>
  );
}

export function MarketsCustomizeScreen({ navigation }: any) {
  const { data, error, loading, reload } = useApi<any>("/api/markets");
  const { data: account } = useApi<any>("/api/account");
  const [sel, setSel] = useState<string[] | null>(null);

  useEffect(() => {
    if (account?.markets && sel === null) setSel(account.markets);
  }, [account, sel]);

  if (loading || sel === null) return <Screen><Loading label="Loading catalog…" /></Screen>;
  if (error || !data) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  const all: any[] = data.markets || [];
  const atMax = sel.length >= MAX;

  const toggle = (id: string) => {
    const has = sel.includes(id);
    if (has && sel.length === 1) return;          // keep at least one
    if (!has && atMax) return;                     // block past the cap
    const next = has ? sel.filter((x) => x !== id) : [...sel, id];
    setSel(next);
    apiPost("/api/account", { markets: next }).catch(() => {});  // optimistic persist
  };

  return (
    <Screen>
      <FadeInView>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Touchable onPress={() => navigation.goBack()} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Text style={{ color: rgba("#FFFFFF", 0.6), fontSize: 20, marginTop: -2 }}>‹</Text>
            <Text style={{ color: rgba("#FFFFFF", 0.6), fontSize: 14, fontFamily: F.ui600 }}>Markets</Text>
          </Touchable>
          <Touchable onPress={() => navigation.goBack()} style={{ backgroundColor: rgba(C.gain, 0.14), borderWidth: 1, borderColor: rgba(C.gain, 0.36), borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: F.ui700, fontSize: 13, color: C.gain }}>Done</Text>
          </Touchable>
        </View>

        <Text style={{ fontFamily: F.display800, fontSize: 27, letterSpacing: -0.8, color: C.text }}>Customize markets</Text>
        <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.48), marginTop: 6, marginBottom: 16, fontFamily: F.ui }}>
          {sel.length} of {MAX} selected{atMax ? " · at maximum" : ""}
        </Text>

        <View style={{ gap: 8 }}>
          {all.map((m: any) => {
            const on = sel.includes(m.id);
            return <ToggleRow key={m.id} m={m} on={on} disabled={!on && atMax} onToggle={() => toggle(m.id)} />;
          })}
        </View>
        <View style={{ height: 8 }} />
      </FadeInView>
    </Screen>
  );
}
