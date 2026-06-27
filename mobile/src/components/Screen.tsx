import React from "react";
import { View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { C } from "../theme";

// Shared screen chrome: base background + the top radial-ish glow + a safe-area
// scroll view. (RN has no CSS radial-gradient, so the glow is a soft vertical
// LinearGradient fading to transparent — visually matches the prototype's top glow.)
export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient
        colors={["#1a1330", "rgba(26,19,48,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.42 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 360 }}
        pointerEvents="none"
      />
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: insets.top + 12, paddingBottom: 28 }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: insets.top + 12 }}>{children}</View>
      )}
    </View>
  );
}
