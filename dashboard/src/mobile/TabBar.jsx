import { C } from "./tokens";

const ACTIVE = C.gain;
const INACTIVE = "rgba(255,255,255,0.4)";

function PortfolioIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V12M9.3 20V5M14.6 20V14M20 20V8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></svg>;
}
function AnalystsIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="7" cy="7" r="2.6" stroke="currentColor" strokeWidth="2.1" /><circle cx="17" cy="7" r="2.6" stroke="currentColor" strokeWidth="2.1" /><path d="M3 19c0-2.5 1.8-4.2 4-4.2s4 1.7 4 4.2M13 19c0-2.5 1.8-4.2 4-4.2s4 1.7 4 4.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></svg>;
}
function LiveIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="2.2" fill="currentColor" /><path d="M7 7a7 7 0 000 10M17 7a7 7 0 010 10M4 4a11 11 0 000 16M20 4a11 11 0 010 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}
function LeagueIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 4h10v4a5 5 0 01-10 0V4Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /><path d="M7 6H4v1.5a3.5 3.5 0 003.5 3.5M17 6h3v1.5a3.5 3.5 0 01-3.5 3.5M9.5 14.5L9 20h6l-.5-5.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const TABS = [
  { id: "portfolio", label: "Portfolio", Icon: PortfolioIcon },
  { id: "analysts", label: "Analysts", Icon: AnalystsIcon },
  { id: "live", label: "Live", Icon: LiveIcon },
  { id: "league", label: "League", Icon: LeagueIcon },
];

export function TabBar({ tab, onChange }) {
  return (
    <nav style={{
      flexShrink: 0,
      display: "flex",
      padding: "9px 10px calc(env(safe-area-inset-bottom) + 12px)",
      background: "rgba(10,10,16,.82)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderTop: `1px solid ${C.hair}`,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="af-press"
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              color: active ? ACTIVE : INACTIVE, background: "none", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <Icon />
            <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
