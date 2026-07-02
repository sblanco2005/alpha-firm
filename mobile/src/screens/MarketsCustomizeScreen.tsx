import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { useApi, apiPost } from "../api";
import { C, F, rgba } from "../theme";
import { Screen } from "../components/Screen";
import { Loading, ErrorState, Touchable } from "../components/ui";
import { FadeInView } from "../components/anim";
import { GLYPH, fmtLevel, fmtDay, dayColor } from "./MarketsScreen";

const MAX = 12;

function ToggleRow({ m, on, disabled, onToggle, onRemove }: { m: any; on: boolean; disabled: boolean; onToggle: () => void; onRemove?: () => void }) {
  return (
    <Touchable onPress={onToggle} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, opacity: disabled ? 0.42 : 1 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: rgba(m.color, 0.13), borderWidth: 1, borderColor: rgba(m.color, 0.32), alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 10, color: m.color }}>{GLYPH[m.id] || m.id.slice(0, 3)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontFamily: F.mono700, fontSize: 14, color: C.text }} numberOfLines={1}>{m.name}</Text>
          {m.custom && <View style={{ backgroundColor: rgba(m.color, 0.16), borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ fontSize: 8, fontFamily: F.ui700, color: m.color, letterSpacing: 0.4 }}>CUSTOM</Text></View>}
        </View>
        <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.4), marginTop: 1, fontFamily: F.ui }} numberOfLines={1}>{m.custom ? m.id : m.full}</Text>
      </View>
      <View style={{ alignItems: "flex-end", marginRight: 4 }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 12.5, color: C.text }}>{fmtLevel(m)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: dayColor(m), marginTop: 1 }}>{fmtDay(m)}</Text>
      </View>
      {m.custom && onRemove && (
        <Touchable onPress={onRemove} style={{ width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: rgba(C.loss, 0.12), borderWidth: 1, borderColor: rgba(C.loss, 0.28) }}>
          <Text style={{ fontSize: 15, color: C.loss, marginTop: -2 }}>×</Text>
        </Touchable>
      )}
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
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

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

  const addCustom = async () => {
    const sym = input.trim().toUpperCase();
    if (!sym || adding) return;
    setAdding(true); setAddErr(null);
    try {
      const next = await apiPost<any>("/api/account", { addCustom: sym });
      setSel(next.markets);
      setInput("");
      reload();                                   // pull the new ticker's quote into the list
    } catch (e: any) {
      setAddErr(e?.message || "Couldn't add that symbol.");
    } finally {
      setAdding(false);
    }
  };

  const removeCustom = async (id: string) => {
    try {
      const next = await apiPost<any>("/api/account", { removeCustom: id });
      setSel(next.markets);
      reload();
    } catch { /* ignore */ }
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
          {sel.length} selected{atMax ? " · at maximum (12)" : ""}
        </Text>

        {/* Add any Yahoo Finance symbol */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 12, marginBottom: 18 }}>
          <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 0.5, color: rgba("#FFFFFF", 0.55) }}>ADD A TICKER</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 }}>
            <TextInput
              value={input}
              onChangeText={(t) => { setInput(t); setAddErr(null); }}
              placeholder="Yahoo symbol — e.g. NVDA, ^GSPC"
              placeholderTextColor={rgba("#FFFFFF", 0.3)}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={addCustom}
              returnKeyType="done"
              style={{ flex: 1, backgroundColor: C.cardDim, borderWidth: 1, borderColor: C.hair, borderRadius: 11, paddingHorizontal: 12, height: 44, color: C.text, fontFamily: F.mono700, fontSize: 14 }}
            />
            <Touchable
              onPress={addCustom}
              style={{ height: 44, paddingHorizontal: 18, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: input.trim() && !atMax ? rgba(C.gain, 0.16) : C.cardDim, borderWidth: 1, borderColor: input.trim() && !atMax ? rgba(C.gain, 0.4) : C.hair }}
            >
              {adding ? <ActivityIndicator color={C.gain} /> : <Text style={{ fontFamily: F.ui700, fontSize: 14, color: input.trim() && !atMax ? C.gain : rgba("#FFFFFF", 0.35) }}>Add</Text>}
            </Touchable>
          </View>
          {addErr ? (
            <Text style={{ fontSize: 11.5, color: C.loss, marginTop: 8, lineHeight: 16, fontFamily: F.ui }}>{addErr}</Text>
          ) : (
            <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.38), marginTop: 8, lineHeight: 15, fontFamily: F.ui }}>
              Stocks, ETFs, indices (^GSPC), futures (CL=F) or FX (EURUSD=X). Uses Yahoo Finance symbols.
            </Text>
          )}
        </View>

        <View style={{ gap: 8 }}>
          {all.map((m: any) => {
            const on = sel.includes(m.id);
            return <ToggleRow key={m.id} m={m} on={on} disabled={!on && atMax} onToggle={() => toggle(m.id)} onRemove={() => removeCustom(m.id)} />;
          })}
        </View>
        <View style={{ height: 8 }} />
      </FadeInView>
    </Screen>
  );
}
