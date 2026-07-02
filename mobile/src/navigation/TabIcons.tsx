import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";

// Candlestick glyph for the Markets tab (distinct from Portfolio's bar chart).
export function MarketsIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M8 3v4M8 15v6M16 3v6M16 17v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Rect x={5.2} y={7} width={5.6} height={8} rx={1.4} stroke={color} strokeWidth={2} />
      <Rect x={13.2} y={9} width={5.6} height={8} rx={1.4} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function PortfolioIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20V12M9.3 20V5M14.6 20V14M20 20V8" stroke={color} strokeWidth={2.3} strokeLinecap="round" />
    </Svg>
  );
}

export function AnalystsIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={7} cy={7} r={2.6} stroke={color} strokeWidth={2.1} />
      <Circle cx={17} cy={7} r={2.6} stroke={color} strokeWidth={2.1} />
      <Path d="M3 19c0-2.5 1.8-4.2 4-4.2s4 1.7 4 4.2M13 19c0-2.5 1.8-4.2 4-4.2s4 1.7 4 4.2" stroke={color} strokeWidth={2.1} strokeLinecap="round" />
    </Svg>
  );
}

export function LiveIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={2.2} fill={color} />
      <Path d="M7 7a7 7 0 000 10M17 7a7 7 0 010 10M4 4a11 11 0 000 16M20 4a11 11 0 010 16" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function LeagueIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4h10v4a5 5 0 01-10 0V4Z" stroke={color} strokeWidth={2.1} strokeLinejoin="round" />
      <Path d="M7 6H4v1.5a3.5 3.5 0 003.5 3.5M17 6h3v1.5a3.5 3.5 0 01-3.5 3.5M9.5 14.5L9 20h6l-.5-5.5" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
