import { useState } from "react";
import { C, FONT } from "./tokens";
import { TabBar } from "./TabBar.jsx";
import Portfolio from "./screens/Portfolio.jsx";
import Desk from "./screens/Desk.jsx";
import MarketCheck from "./screens/MarketCheck.jsx";
import Standings from "./screens/Standings.jsx";

// App shell: radial-glow background, scrollable content, fixed bottom tab bar.
// The hand-drawn iPhone bezel from the prototype is dropped — on a real device the
// system provides the status bar / home indicator (we just reserve safe-area space).
export default function App() {
  const [tab, setTab] = useState("portfolio");
  // Drill-in state for the Analysts tab (null = roster, id = detail).
  const [selectedAnalyst, setSelectedAnalyst] = useState(null);

  const goTab = (t) => {
    setTab(t);
    if (t !== "analysts") setSelectedAnalyst(null);
    else setSelectedAnalyst(null); // switching to Analysts resets to roster
  };

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      maxWidth: 480,
      margin: "0 auto",
      position: "relative",
      background: "radial-gradient(120% 60% at 50% -8%, #1a1330 0%, rgba(11,11,17,0) 46%), #0B0B11",
      color: C.text,
      fontFamily: FONT.ui,
    }}>
      <main style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "calc(env(safe-area-inset-top) + 18px) 0 16px",
      }}>
        {tab === "portfolio" && <Portfolio />}
        {tab === "analysts" && (
          <Desk selected={selectedAnalyst} onSelect={setSelectedAnalyst} onBack={() => setSelectedAnalyst(null)} />
        )}
        {tab === "live" && <MarketCheck />}
        {tab === "league" && <Standings />}
      </main>

      <TabBar tab={tab} onChange={goTab} />
    </div>
  );
}
