import React, { useEffect, useRef } from "react";
import { Animated, Easing, ViewStyle, StyleProp, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { rgba } from "../theme";

// afFadeUp — screen/section enter (opacity + slide up).
export function FadeInView({
  children, style, delay = 0, distance = 10,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; delay?: number; distance?: number }) {
  const o = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(distance)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(o, { toValue: 1, duration: 400, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 400, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity: o, transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

// afPulse — the live "heartbeat" dot.
export function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.35, duration: 550, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: v, transform: [{ scale: v }] }} />
  );
}

// afPing — expanding ring behind the run button dot.
export function PingDot({ color = "#04130B", size = 10 }: { color?: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true })).start();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });
  const opacity = v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.7, 0, 0] });
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
      <Animated.View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity, transform: [{ scale }] }} />
    </View>
  );
}

// afShimmer — researching placeholder.
export function Shimmer({ width = "100%", height = 8, mt = 0 }: { width?: number | string; height?: number; mt?: number }) {
  const x = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);
  const translateX = x.interpolate({ inputRange: [-1, 1], outputRange: [-120, 120] });
  return (
    <View style={{ width: width as any, height, borderRadius: 4, marginTop: mt, overflow: "hidden", backgroundColor: "rgba(255,255,255,.06)" }}>
      <Animated.View style={{ width: "60%", height: "100%", transform: [{ translateX }] }}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,.18)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// afGrow — conviction bar growing from 0 to its width.
export function GrowBar({ pct, color }: { pct: number; color: string }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: pct, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  }, [pct]);
  const width = w.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
  return (
    <View style={{ marginTop: 6, height: 4, borderRadius: 3, backgroundColor: rgba("#FFFFFF", 0.08), overflow: "hidden" }}>
      <Animated.View style={{ height: "100%", borderRadius: 3, width, backgroundColor: color }} />
    </View>
  );
}
