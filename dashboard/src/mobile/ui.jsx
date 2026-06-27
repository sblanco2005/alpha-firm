import { C, FONT, rgba } from "./tokens";

// Small shared building blocks used across screens.

export function Dot({ color, size = 9 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", background: color,
      boxShadow: `0 0 8px ${rgba(color, 0.6)}`, flexShrink: 0, display: "inline-block",
    }} />
  );
}

export function AvatarBadge({ color, emoji, size = 48, radius = 14, fontSize = 24 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: rgba(color, 0.13),
      border: `1px solid ${rgba(color, 0.4)}`, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize, flexShrink: 0,
    }}>{emoji}</div>
  );
}

export function StatChip({ value, label, valueColor = C.text }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 14, padding: "11px 12px" }}>
      <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 16, color: valueColor }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function StatusBadge({ text, color }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color, background: rgba(color, 0.14),
      border: `1px solid ${rgba(color, 0.3)}`, padding: "1.5px 6px", borderRadius: 6, letterSpacing: 0.5,
    }}>{text}</span>
  );
}

export function Shimmer({ width = "100%", height = 8, mt = 0 }) {
  return (
    <div style={{
      marginTop: mt, height, width, borderRadius: 4,
      background: "linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.16), rgba(255,255,255,.05))",
      backgroundSize: "200px 100%", animation: "afShimmer 1.1s linear infinite",
    }} />
  );
}

export function ScreenHeader({ title, subtitle, right }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 32, letterSpacing: -1, lineHeight: 1 }}>{title}</div>
        {right}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.48), marginTop: 7, lineHeight: 1.4 }}>{subtitle}</div>
      )}
    </>
  );
}

export function SectionTitle({ children, right, mt = 22 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: `${mt}px 2px 12px` }}>
      <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 19 }}>{children}</span>
      {right}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div style={{ padding: "60px 0", textAlign: "center", color: C.text3, fontFamily: FONT.mono, fontSize: 12 }}>
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div style={{ padding: "48px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
        Couldn't reach the firm.
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.text3, marginTop: 6 }}>{String(error?.message || error)}</div>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="af-press" style={{
          marginTop: 16, background: rgba(C.gain, 0.12), border: `1px solid ${rgba(C.gain, 0.3)}`,
          color: C.gain, fontWeight: 600, fontSize: 13, padding: "9px 18px", borderRadius: 12,
        }}>Retry</button>
      )}
    </div>
  );
}

// The signature SPY-vs-you gap chart. Static SVG faithful to the prototype.
export function GapChart({ spyLabel = "SPY +34.4%", youLabel = "YOU +2.8%" }) {
  return (
    <div style={{ position: "relative", margin: "20px -4px 0", height: 96 }}>
      <svg viewBox="0 0 320 96" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="afFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2BD98A" stopOpacity=".28" />
            <stop offset="100%" stopColor="#2BD98A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M2,16 C90,12 180,9 318,5" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.6" strokeDasharray="3 4" />
        <path d="M2,78 L34,72 L66,76 L98,62 L130,55 L162,64 L194,48 L226,40 L258,52 L290,38 L318,44 L318,96 L2,96 Z" fill="url(#afFill)" />
        <path d="M2,78 L34,72 L66,76 L98,62 L130,55 L162,64 L194,48 L226,40 L258,52 L290,38 L318,44" fill="none" stroke="#2BD98A" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span style={{ position: "absolute", top: -2, right: 2, fontFamily: FONT.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.5) }}>{spyLabel}</span>
      <span style={{ position: "absolute", bottom: 30, right: 2, fontFamily: FONT.mono, fontSize: 10.5, color: C.gain }}>{youLabel}</span>
    </div>
  );
}
