import React from "react";
import { View, Text, Pressable, ActivityIndicator, StyleProp, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { C, F, rgba } from "../theme";

// A pressable card/button with subtle scale + haptic feedback (native feel).
export function Touchable({
  children, onPress, style,
}: { children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [style, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function Dot({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, shadowColor: color, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }} />
  );
}

export function AvatarBadge({
  color, emoji, size = 48, radius = 14, fontSize = 24,
}: { color: string; emoji: string; size?: number; radius?: number; fontSize?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: rgba(color, 0.13), borderWidth: 1, borderColor: rgba(color, 0.4), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize }}>{emoji}</Text>
    </View>
  );
}

export function StatChip({ value, label, valueColor = C.text }: { value: React.ReactNode; label: string; valueColor?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 12 }}>
      <Text style={{ fontFamily: F.mono700, fontSize: 16, color: valueColor }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: C.text3, marginTop: 2, fontFamily: F.ui }}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ backgroundColor: rgba(color, 0.14), borderWidth: 1, borderColor: rgba(color, 0.3), paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
      <Text style={{ fontSize: 9, fontFamily: F.ui700, color, letterSpacing: 0.5 }}>{text}</Text>
    </View>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.display800, fontSize: 32, letterSpacing: -1, color: C.text }}>{title}</Text>
        {right}
      </View>
      {subtitle != null && (
        <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.48), marginTop: 7, lineHeight: 18, fontFamily: F.ui }}>{subtitle}</Text>
      )}
    </>
  );
}

export function SectionTitle({ children, right, mt = 22 }: { children: React.ReactNode; right?: React.ReactNode; mt?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: mt, marginBottom: 12, marginHorizontal: 2 }}>
      <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text }}>{children}</Text>
      {right}
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 70, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={C.gain} />
      <Text style={{ color: C.text3, fontFamily: F.mono, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: any; onRetry?: () => void }) {
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 8, alignItems: "center" }}>
      <Text style={{ fontSize: 13, color: C.text2, lineHeight: 20, textAlign: "center" }}>Couldn't reach the firm.</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.text3, marginTop: 6, textAlign: "center" }}>{String(error?.message || error)}</Text>
      {onRetry && (
        <Touchable onPress={onRetry} style={{ marginTop: 16, backgroundColor: rgba(C.gain, 0.12), borderWidth: 1, borderColor: rgba(C.gain, 0.3), borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9 }}>
          <Text style={{ color: C.gain, fontFamily: F.ui600, fontSize: 13 }}>Retry</Text>
        </Touchable>
      )}
    </View>
  );
}
