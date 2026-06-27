import React from "react";
import { View } from "react-native";
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import { C, rgba } from "../theme";

const W = 340;

// Interactive performance chart: primary line + area, optional SPY dashed overlay,
// optional entry-price dashed baseline, end dot. Colors green/red by direction.
export function PerfChart({
  values, spy, baseline, color = C.gain, height = 120,
}: {
  values: number[];
  spy?: number[];
  baseline?: number | null;
  color?: string;
  height?: number;
}) {
  const H = height;
  const padT = 8, padB = 10;
  if (!values || values.length < 2) {
    return <View style={{ height }} />;
  }

  // Shared y-domain across the line, the SPY overlay, and the baseline if visible.
  const all = [...values, ...(spy || [])];
  let min = Math.min(...all);
  let max = Math.max(...all);
  const baseInRange = baseline != null && baseline > Math.min(...values) && baseline < Math.max(...values);
  if (baseInRange) { min = Math.min(min, baseline!); max = Math.max(max, baseline!); }
  const pad = (max - min) * 0.12 || 1;
  min -= pad; max += pad;

  const X = (i: number, n: number) => (i / (n - 1)) * W;
  const Y = (v: number) => H - padB - ((v - min) / (max - min)) * (H - padT - padB);

  const toPath = (arr: number[]) => {
    let s = `M ${X(0, arr.length).toFixed(1)} ${Y(arr[0]).toFixed(1)}`;
    for (let i = 1; i < arr.length; i++) s += ` L ${X(i, arr.length).toFixed(1)} ${Y(arr[i]).toFixed(1)}`;
    return s;
  };

  const line = toPath(values);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const dotX = X(values.length - 1, values.length);
  const dotY = Y(values[values.length - 1]);
  const up = values[values.length - 1] >= values[0];
  const gradId = up ? "afUp" : "afDown";

  return (
    <View style={{ height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="afUp" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={C.gain} stopOpacity={0.26} />
            <Stop offset="100%" stopColor={C.gain} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="afDown" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={C.loss} stopOpacity={0.24} />
            <Stop offset="100%" stopColor={C.loss} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {baseInRange && (
          <Line x1={0} y1={Y(baseline!)} x2={W} y2={Y(baseline!)} stroke="rgba(255,255,255,.2)" strokeWidth={1.2} strokeDasharray="3 4" />
        )}
        {spy && spy.length >= 2 && (
          <Path d={toPath(spy)} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth={1.6} strokeDasharray="3 4" strokeLinejoin="round" />
        )}
        <Path d={area} fill={`url(#${gradId})`} />
        <Path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={dotX} cy={dotY} r={3.4} fill={color} />
      </Svg>
    </View>
  );
}
