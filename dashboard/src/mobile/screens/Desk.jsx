import { useApi } from "../api";
import { C, FONT, rgba, pnlColor, money, fmtWinRate, pct } from "../tokens";
import { AvatarBadge, ScreenHeader, StatusBadge, Loading, ErrorState } from "../ui.jsx";

// statusType → accent color used for the detail status pill and nickname line.
function statusColor(a) {
  if (a.statusType === "leader") return C.gold;
  if (a.statusType === "benched" || a.statusType === "suspended") return C.loss;
  return a.color; // active / restricted use the analyst's own color
}

function badgeColor(a) {
  return a.statusType === "restricted" ? a.color : C.loss;
}

function RosterCard({ a, onClick }) {
  const dim = a.statusType === "benched" || a.statusType === "suspended";
  return (
    <button
      onClick={onClick}
      className="af-press"
      style={{
        textAlign: "left", cursor: "pointer", width: "100%",
        background: dim ? C.cardDim : C.card,
        border: `1px solid ${a.isLeader ? rgba(a.color, 0.28) : rgba("#FFFFFF", 0.08)}`,
        borderRadius: 18, padding: 15, display: "flex", alignItems: "center", gap: 14,
        opacity: dim ? 0.72 : 1, color: C.text,
      }}
    >
      <AvatarBadge color={a.color} emoji={a.emoji} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16 }}>{a.name}</span>
          {a.isLeader && <span style={{ fontSize: 13 }}>⭐</span>}
          {a.badge && <StatusBadge text={a.badge} color={badgeColor(a)} />}
        </div>
        <div style={{ fontSize: 11.5, color: a.color, marginTop: 1 }}>
          “{a.nickname}” · {a.tagline}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 15, color: pnlColor(a.realizedPnl) }}>{money(a.realizedPnl, { sign: true })}</div>
        <div style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.45), marginTop: 1 }}>{fmtWinRate(a.winRate)} · {a.picks ?? "—"} picks</div>
      </div>
    </button>
  );
}

function Roster({ analysts, onSelect }) {
  return (
    <div className="af-fade" style={{ padding: "0 18px" }}>
      <ScreenHeader
        title="The Desk"
        subtitle={<>Six analysts. Independent research, in parallel — <span style={{ color: C.text }}>no analyst sees the others.</span></>}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {analysts.map((a) => <RosterCard key={a.id} a={a} onClick={() => onSelect(a.id)} />)}
      </div>
    </div>
  );
}

function StatBox({ value, label, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 15, padding: "13px 15px" }}>
      <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 21, color: color || C.text }}>{value}</div>
      <div style={{ fontSize: 11, color: rgba("#FFFFFF", 0.45), marginTop: 2 }}>{label}</div>
    </div>
  );
}

function CalibrationRow({ band, bandColor, text }) {
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "flex-start", background: C.card, border: `1px solid ${C.hair}`, borderRadius: 13, padding: "11px 13px" }}>
      <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 13, color: bandColor, flexShrink: 0, whiteSpace: "nowrap" }}>{band}</span>
      <span style={{ fontSize: 12, lineHeight: 1.45, color: rgba("#FFFFFF", 0.65) }}>{text}</span>
    </div>
  );
}

function Detail({ a, onBack }) {
  const sColor = statusColor(a);
  const tintBg = rgba(a.color, 0.13);
  const tintBorder = rgba(a.color, 0.4);
  return (
    <div className="af-fade" style={{ padding: "0 18px" }}>
      <button onClick={onBack} className="af-press" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: rgba("#FFFFFF", 0.6), fontSize: 13, fontWeight: 600, marginBottom: 18, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> The Desk
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
        <AvatarBadge color={a.color} emoji={a.emoji} size={66} radius={18} fontSize={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 23, letterSpacing: -0.5, lineHeight: 1.05 }}>{a.name}</div>
          <div style={{ fontSize: 13, marginTop: 3, color: a.color }}>“{a.nickname}”</div>
        </div>
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: sColor, background: rgba(sColor, 0.12), border: `1px solid ${rgba(sColor, 0.32)}`, padding: "5px 11px", borderRadius: 9 }}>{a.status}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 18 }}>
        <StatBox value={money(a.realizedPnl, { sign: true })} label="Realized P&L" color={pnlColor(a.realizedPnl)} />
        <StatBox value={fmtWinRate(a.winRate)} label="Win rate" />
        <StatBox value={a.picks ?? "—"} label="Recommendations" />
        <StatBox value={a.executed ?? "—"} label="Executed" />
      </div>

      <div style={{ marginTop: 18, fontSize: 13.5, lineHeight: 1.5, color: rgba("#FFFFFF", 0.7) }}>{a.blurb}</div>

      <div style={{ marginTop: 14, background: tintBg, border: `1px solid ${tintBorder}`, borderRadius: 15, padding: "13px 15px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: a.color, marginBottom: 5 }}>THE EDGE</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: rgba("#FFFFFF", 0.78) }}>{a.edge}</div>
      </div>

      <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16, margin: "22px 2px 11px" }}>Conviction calibration</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <CalibrationRow band="9–10" bandColor={C.gain} text={a.calibration?.c910} />
        <CalibrationRow band="7–8" bandColor={C.gold} text={a.calibration?.c78} />
        <CalibrationRow band="5–6" bandColor={rgba("#FFFFFF", 0.5)} text={a.calibration?.c56} />
      </div>

      <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16, margin: "22px 2px 11px" }}>Holding now</div>
      {a.holdings && a.holdings.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {a.holdings.map((h) => (
            <div key={h.ticker} style={{ background: C.card, border: `1px solid ${rgba("#FFFFFF", 0.08)}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 14 }}>{h.ticker}</span>
              <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 13, color: pnlColor(h.returnPct) }}>{h.returnPct == null ? "—" : pct(h.returnPct, 1)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.4), fontStyle: "italic" }}>No open positions — sitting on its hands.</div>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

export default function Desk({ selected, onSelect, onBack }) {
  const { data: analysts, error, loading, reload } = useApi("/api/analysts", { pollMs: 60000 });

  if (loading) return <Loading label="Loading the desk…" />;
  if (error || !analysts) return <ErrorState error={error} onRetry={reload} />;

  if (selected) {
    const a = analysts.find((x) => x.id === selected);
    if (a) return <Detail a={a} onBack={onBack} />;
  }
  return <Roster analysts={analysts} onSelect={onSelect} />;
}
