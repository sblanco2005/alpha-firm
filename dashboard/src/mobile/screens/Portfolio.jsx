import { useApi } from "../api";
import { C, FONT, ANALYSTS, rgba, pnlColor, signed, pct, money, compactMoney } from "../tokens";
import { Dot, StatChip, GapChart, Loading, ErrorState } from "../ui.jsx";

const INITIAL_CAPITAL = 10000;

const fmtPrice = (n) =>
  n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Header() {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Dot color={C.gain} size={8} />
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>ALPHA&thinsp;FIRM</span>
      </div>
      <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: rgba("#FFFFFF", 0.42), letterSpacing: 0.3 }}>{dateLabel}</span>
    </div>
  );
}

function PositionRow({ p }) {
  const meta = ANALYSTS[p.agent] || { color: C.text2, label: p.agent };
  const ret = p.unrealized_pnl_pct;
  const latest = p.current_price ?? p.latest_price;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 16, padding: "13px 15px", display: "flex", alignItems: "center", gap: 13 }}>
      <Dot color={meta.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 15 }}>{p.ticker}</div>
        <div style={{ fontSize: 11, color: rgba("#FFFFFF", 0.42), marginTop: 1 }}>
          {p.shares} sh · {fmtPrice(p.entry_price)} → {fmtPrice(latest)}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 14, color: pnlColor(ret) }}>{ret == null ? "—" : pct(ret, 1)}</div>
        <div style={{ fontSize: 10, color: meta.color, marginTop: 1 }}>{meta.label}</div>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { data: portfolio, error, loading, reload } = useApi("/api/portfolio", { pollMs: 45000 });
  const { data: tradeLog } = useApi("/api/trade-log");

  if (loading) return <Loading label="Loading portfolio…" />;
  if (error || !portfolio) return <ErrorState error={error} onRetry={reload} />;

  const nav = portfolio.nav ?? portfolio.cash;
  const pnlAbs = nav - INITIAL_CAPITAL;
  const pnlPct = (pnlAbs / INITIAL_CAPITAL) * 100;
  const spy = portfolio.spy_return_pct;
  const alpha = portfolio.alpha ?? (spy != null ? pnlPct - spy : null);
  const cashPct = nav ? (portfolio.cash / nav) * 100 : 0;

  const [dollars, cents] = nav.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(".");
  const positions = [...(portfolio.positions || [])].sort(
    (a, b) => (b.unrealized_pnl_pct ?? -1e9) - (a.unrealized_pnl_pct ?? -1e9)
  );

  return (
    <div className="af-fade" style={{ padding: "0 18px" }}>
      <Header />

      <div style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.5), letterSpacing: 1.4, fontWeight: 600 }}>NET ASSET VALUE</div>
      <div style={{ marginTop: 4 }}>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 52, letterSpacing: -2, lineHeight: 1 }}>
          ${dollars}<span style={{ fontSize: 30, color: rgba("#FFFFFF", 0.45) }}>.{cents}</span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 14, color: pnlColor(pnlPct), background: rgba(C.gain, pnlPct >= 0 ? 0.12 : 0), border: `1px solid ${rgba(pnlPct >= 0 ? C.gain : C.loss, 0.3)}`, padding: "4px 9px", borderRadius: 8 }}>
          {pnlPct >= 0 ? "▲" : "▼"} {pct(pnlPct)}
        </span>
        <span style={{ fontFamily: FONT.mono, fontSize: 13, color: pnlColor(pnlAbs) }}>{money(pnlAbs, { sign: true })}</span>
        <span style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.38) }}>since inception</span>
      </div>

      <GapChart
        spyLabel={spy == null ? "SPY —" : `SPY ${pct(spy, 1)}`}
        youLabel={`YOU ${pct(pnlPct, 1)}`}
      />

      {/* Alpha-gap callout */}
      <div style={{ marginTop: 8, background: "linear-gradient(135deg, rgba(255,92,106,.14), rgba(255,92,106,.04))", border: `1px solid ${rgba(C.loss, 0.26)}`, borderRadius: 18, padding: "15px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: rgba("#FFFFFF", 0.6), letterSpacing: 0.4, fontWeight: 600 }}>ALPHA vs SPY</div>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 26, color: pnlColor(alpha), letterSpacing: -0.5 }}>{alpha == null ? "—" : pct(alpha)}</div>
        </div>
        <div style={{ maxWidth: 148, textAlign: "right", fontSize: 11.5, lineHeight: 1.45, color: rgba("#FFFFFF", 0.5) }}>
          {alpha != null && alpha < 0 ? "Behind the index in a bull run. " : "Tracking the index. "}
          Still <span style={{ color: C.text }}>simulated</span> — building a track record before risking capital.
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
        <StatChip value={`${cashPct.toFixed(0)}%`} label={`Cash · ${compactMoney(portfolio.cash)}`} />
        <StatChip value={positions.length} label="Positions" />
        <StatChip value={tradeLog?.total_trades ?? "—"} label="Trades total" />
      </div>

      {/* Positions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 2px 12px" }}>
        <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 19 }}>Open positions</span>
        <span style={{ fontSize: 11.5, color: rgba("#FFFFFF", 0.4), fontFamily: FONT.mono }}>{positions.length} · LIVE PX</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {positions.map((p) => <PositionRow key={p.ticker} p={p} />)}
      </div>
    </div>
  );
}
