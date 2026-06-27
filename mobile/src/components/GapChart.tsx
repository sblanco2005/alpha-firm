import React from "react";
import { View, Text } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { C, F, rgba } from "../theme";

// The signature SPY-vs-you alpha-gap chart. Faithful to the prototype SVG.
export function GapChart({ spyLabel, youLabel }: { spyLabel: string; youLabel: string }) {
  return (
    <View style={{ marginTop: 20, marginHorizontal: -4, height: 96 }}>
      <Svg width="100%" height="100%" viewBox="0 0 320 96" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="afFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#2BD98A" stopOpacity={0.28} />
            <Stop offset="100%" stopColor="#2BD98A" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d="M2,16 C90,12 180,9 318,5" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth={1.6} strokeDasharray="3 4" />
        <Path d="M2,78 L34,72 L66,76 L98,62 L130,55 L162,64 L194,48 L226,40 L258,52 L290,38 L318,44 L318,96 L2,96 Z" fill="url(#afFill)" />
        <Path d="M2,78 L34,72 L66,76 L98,62 L130,55 L162,64 L194,48 L226,40 L258,52 L290,38 L318,44" fill="none" stroke="#2BD98A" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <Text style={{ position: "absolute", top: -2, right: 2, fontFamily: F.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.5) }}>{spyLabel}</Text>
      <Text style={{ position: "absolute", bottom: 30, right: 2, fontFamily: F.mono, fontSize: 10.5, color: C.gain }}>{youLabel}</Text>
    </View>
  );
}
