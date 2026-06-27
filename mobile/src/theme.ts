// Design tokens + formatting helpers (React Native port of the PWA's tokens).

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

// Custom fonts are loaded per-weight, so fontFamily names ARE the weight.
// (In RN you don't combine a family with fontWeight for Google fonts — you point
// at the exact variant.)
export const F = {
  display: "BricolageGrotesque_700Bold",
  display800: "BricolageGrotesque_800ExtraBold", // heavy display (NAV, titles)
  ui: "SpaceGrotesk_400Regular",
  ui500: "SpaceGrotesk_500Medium",
  ui600: "SpaceGrotesk_600SemiBold",
  ui700: "SpaceGrotesk_700Bold",
  mono: "JetBrainsMono_400Regular",
  mono500: "JetBrainsMono_500Medium",
  mono700: "JetBrainsMono_700Bold",
};

export const ANALYSTS: Record<string, { color: string; emoji: string; label: string }> = {
  sentiment: { color: "#FF4D9D", emoji: "📡", label: "Sentiment" },
  contrarian: { color: "#A05CFF", emoji: "🃏", label: "Contrarian" },
  catalyst: { color: "#4D7CFF", emoji: "⏱", label: "Catalyst" },
  macro: { color: "#F5B731", emoji: "🌐", label: "Macro" },
  crypto: { color: "#F7931A", emoji: "₿", label: "Crypto" },
  quant: { color: "#2DD4D4", emoji: "📊", label: "Quant" },
};

export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export const pnlColor = (n: number | null | undefined) =>
  n == null ? C.text2 : n >= 0 ? C.gain : C.loss;

export function signed(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  const s = n < 0 ? "−" : "+";
  return s + Math.abs(n).toFixed(digits);
}
export const pct = (n: number | null | undefined, d = 2) => (n == null ? "—" : signed(n, d) + "%");

export function money(n: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  const { sign = false, digits = 2 } = opts;
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (sign) return (n < 0 ? "−$" : "+$") + abs;
  return (n < 0 ? "−$" : "$") + abs;
}

export function compactMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

export const fmtWinRate = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1) + "%");

export const fmtPrice = (n: number | null | undefined) =>
  n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
