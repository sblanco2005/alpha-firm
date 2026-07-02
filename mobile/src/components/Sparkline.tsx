import React from "react";
import Svg, { Path } from "react-native-svg";

// Tiny inline sparkline (viewBox 120×34, matches the handoff). Stroke colored by the
// caller — green/red by direction for prices, the ticker accent for yields.
export function Sparkline({ values, color, width = 120, height = 34 }: { values: number[]; color: string; width?: number | string; height?: number | string }) {
  if (!values || values.length < 2) return <Svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const X = (i: number) => (i / (values.length - 1)) * 120;
  const Y = (v: number) => pad + (1 - (v - min) / span) * (34 - pad * 2);
  let d = `M ${X(0).toFixed(1)} ${Y(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) d += ` L ${X(i).toFixed(1)} ${Y(values[i]).toFixed(1)}`;
  return (
    <Svg width={width} height={height} viewBox="0 0 120 34" preserveAspectRatio="none">
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
