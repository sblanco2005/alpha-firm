import React from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { C, F, rgba } from "../theme";
import { PERIODS, PeriodKey } from "../chart";

// Segmented 7-button period selector (LIVE · 1D · 1W · 1M · 3M · YTD · 1Y).
// Active pill tinted to the current line color (green by default, red for losers).
export function PeriodBar({
  selected, onSelect, activeColor = C.gain,
}: {
  selected: PeriodKey;
  onSelect: (p: PeriodKey) => void;
  activeColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 3, marginTop: 10 }}>
      {PERIODS.map(({ key, label }) => {
        const active = key === selected;
        return (
          <Pressable
            key={key}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onSelect(key);
            }}
            style={{
              flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8,
              backgroundColor: active ? rgba(activeColor, 0.16) : "transparent",
            }}
          >
            <Text style={{ fontFamily: F.mono700, fontSize: 11.5, color: active ? activeColor : rgba("#FFFFFF", 0.5) }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
