// Design tokens + small formatting helpers, lifted from the design handoff.

export const C = {
  bg: "#0B0B11",
  glow: "#1a1330",
  card: "#14141C",
  cardDim: "#101017",
  hair: "rgba(255,255,255,0.07)",
  text: "#F2F2F5",
  text2: "rgba(255,255,255,0.55)",
  text3: "rgba(255,255,255,0.40)",
  gain: "#2BD98A",
  loss: "#FF5C6A",
  gold: "#FFD24D",
};

export const FONT = {
  display: "'Bricolage Grotesque', sans-serif",
  ui: "'Space Grotesk', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

// Per-agent visual identity (colors/emoji/short label) for dots, avatars, position rows.
export const ANALYSTS = {
  sentiment: { color: "#FF4D9D", emoji: "📡", label: "Sentiment" },
  contrarian: { color: "#A05CFF", emoji: "🃏", label: "Contrarian" },
  catalyst: { color: "#4D7CFF", emoji: "⏱", label: "Catalyst" },
  macro: { color: "#F5B731", emoji: "🌐", label: "Macro" },
  crypto: { color: "#F7931A", emoji: "₿", label: "Crypto" },
  quant: { color: "#2DD4D4", emoji: "📊", label: "Quant" },
};

export function rgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export const pnlColor = (n) => (n == null ? C.text2 : n >= 0 ? C.gain : C.loss);

// "−" is the typographic minus the prototype uses for negatives.
export function signed(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const s = n < 0 ? "−" : "+";
  return s + Math.abs(n).toFixed(digits);
}
export const pct = (n, d = 2) => signed(n, d) + "%";

export function money(n, { sign = false, digits = 2 } = {}) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (sign) return (n < 0 ? "−$" : "+$") + abs;
  return (n < 0 ? "−$" : "$") + abs;
}

// "$4.3k" style compact for the cash chip.
export function compactMoney(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

export function fmtWinRate(n) {
  return n == null ? "—" : n.toFixed(1) + "%";
}
