// Period selection + windowing helpers for the interactive charts.

export type PeriodKey = "LIVE" | "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "LIVE", label: "LIVE" },
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
];

export const NAV_LABEL: Record<PeriodKey, string> = {
  LIVE: "Past hour", "1D": "Today", "1W": "Past week", "1M": "Past month",
  "3M": "Past 3 months", YTD: "Year to date", "1Y": "Since inception",
};
export const POS_LABEL: Record<PeriodKey, string> = {
  LIVE: "Past hour", "1D": "Today", "1W": "Past week", "1M": "Past month",
  "3M": "Past 3 months", YTD: "Year to date", "1Y": "Past year",
};

export type DailyPoint = { date: string; value: number };

function cutoffDate(period: PeriodKey, asOf: string): string | null {
  const d = new Date(asOf + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (period) {
    case "1W": d.setUTCDate(d.getUTCDate() - 7); return iso(d);
    case "1M": d.setUTCMonth(d.getUTCMonth() - 1); return iso(d);
    case "3M": d.setUTCMonth(d.getUTCMonth() - 3); return iso(d);
    case "YTD": return asOf.slice(0, 4) + "-01-01";
    case "1Y": d.setUTCFullYear(d.getUTCFullYear() - 1); return iso(d);
    default: return null; // LIVE/1D use intraday or last-2
  }
}

// Start index into a daily series for a period (so a parallel series, e.g. SPY,
// can be windowed identically).
export function windowStartIndex(points: DailyPoint[], period: PeriodKey): number {
  const n = points.length;
  if (n < 2) return 0;
  if (period === "LIVE" || period === "1D") return n - 2;
  const asOf = points[n - 1].date;
  const cut = cutoffDate(period, asOf);
  if (!cut) return n - 2;
  let i = points.findIndex((p) => p.date >= cut);
  if (i < 0 || i > n - 2) i = n - 2;
  return Math.max(0, i);
}

export function pctChange(values: number[]): { abs: number; pct: number; up: boolean } {
  if (values.length < 2) return { abs: 0, pct: 0, up: true };
  const a = values[0], b = values[values.length - 1];
  const abs = b - a;
  const pct = a !== 0 ? (abs / a) * 100 : 0;
  return { abs, pct, up: abs >= 0 };
}
