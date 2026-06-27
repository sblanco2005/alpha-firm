import { useApi } from "../api";
import { C, FONT, ANALYSTS, rgba, pnlColor, money, fmtWinRate, compactMoney } from "../tokens";
import { ScreenHeader, Loading, ErrorState } from "../ui.jsx";

const PRINCIPLES = [
  { lead: "Cut losses fast.", rest: "A small loss is a gift." },
  { lead: "Let winners run.", rest: "Don't panic-sell a working position." },
  { lead: "Never average down.", rest: "More wrong, more money." },
  { lead: "Sit on your hands.", rest: "Most days, doing nothing wins." },
  { lead: "The market is never wrong.", rest: "Price is truth." },
];

function LeaderRow({ a, rank }) {
  const dim = a.statusType === "benched" || a.statusType === "suspended";
  const label = ANALYSTS[a.id]?.label || a.name;
  return (
    <div style={{ background: dim ? C.cardDim : C.card, border: `1px solid ${rank === 1 ? rgba(a.color, 0.28) : C.hair}`, borderRadius: 15, padding: "13px 14px", display: "flex", alignItems: "center", gap: 13, opacity: dim ? 0.78 : 1 }}>
      <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 17, color: rank === 1 ? C.gold : rgba("#FFFFFF", 0.4), width: 20 }}>{rank}</span>
      <span style={{ fontSize: 20 }}>{a.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          {label}
          {a.badge && <span style={{ fontSize: 8.5, fontWeight: 700, color: C.loss, background: rgba(C.loss, 0.14), padding: "1px 5px", borderRadius: 5 }}>{a.badge}</span>}
        </div>
        <div style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.42), fontFamily: FONT.mono }}>{fmtWinRate(a.winRate)} win · {a.executed ?? "—"} exec</div>
      </div>
      <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 15, color: pnlColor(a.realizedPnl) }}>{money(a.realizedPnl, { sign: true })}</span>
    </div>
  );
}

export default function Standings() {
  const { data: analysts, error, loading, reload } = useApi("/api/analysts", { pollMs: 60000 });
  const { data: portfolio } = useApi("/api/portfolio", { pollMs: 60000 });

  if (loading) return <Loading label="Loading standings…" />;
  if (error || !analysts) return <ErrorState error={error} onRetry={reload} />;

  const ranked = [...analysts].sort((a, b) => (b.realizedPnl ?? -1e9) - (a.realizedPnl ?? -1e9));
  const leader = ranked[0];
  const nav = portfolio?.nav;
  const profit = nav != null ? nav - 10000 : null;
  const rewardPool = profit != null ? Math.max(0, profit * 0.2) : null;

  return (
    <div className="af-fade" style={{ padding: "0 18px" }}>
      <ScreenHeader title="Standings" subtitle="Agents earn influence through track record. Bad analysts get discounted — automatically." />

      {/* Reward pool */}
      <div style={{ marginTop: 18, background: "linear-gradient(135deg, rgba(255,210,77,.16), rgba(255,210,77,.03))", border: `1px solid ${rgba(C.gold, 0.34)}`, borderRadius: 20, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: C.gold }}>🏆 REWARD POOL · WINNER-TAKE-ALL</div>
            <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 30, marginTop: 5, letterSpacing: -0.5 }}>
              {rewardPool == null ? "—" : "$" + rewardPool.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 11.5, color: rgba("#FFFFFF", 0.5), marginTop: 2 }}>20% of firm profit → leading analyst</div>
          </div>
          {leader && (
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ width: 54, height: 54, borderRadius: 16, background: rgba(leader.color, 0.14), border: `1px solid ${rgba(leader.color, 0.4)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{leader.emoji}</div>
              <div style={{ fontSize: 10.5, color: leader.color, marginTop: 5, fontWeight: 600 }}>{ANALYSTS[leader.id]?.label || leader.name}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16, margin: "22px 2px 12px" }}>Agent leaderboard</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ranked.map((a, i) => <LeaderRow key={a.id} a={a} rank={i + 1} />)}
      </div>

      <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16, margin: "24px 2px 11px" }}>The Soul · non-negotiables</div>
      <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 18, padding: "6px 16px" }}>
        {PRINCIPLES.map((p, i) => (
          <div key={p.lead} style={{ padding: "11px 0", borderBottom: i < PRINCIPLES.length - 1 ? `1px solid ${rgba("#FFFFFF", 0.06)}` : "none", fontSize: 13, color: rgba("#FFFFFF", 0.78) }}>
            <span style={{ color: C.gain, fontWeight: 700 }}>{p.lead}</span> {p.rest}
          </div>
        ))}
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}
