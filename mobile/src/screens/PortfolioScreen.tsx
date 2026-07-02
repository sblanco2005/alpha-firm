import React, { useState } from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useApi } from "../api";
import { C, F, ANALYSTS, rgba, pnlColor, pct, money, compactMoney, fmtPrice } from "../theme";
import { Screen } from "../components/Screen";
import { Dot, StatChip, Loading, ErrorState, Touchable } from "../components/ui";
import { FadeInView } from "../components/anim";
import { PerfChart } from "../components/PerfChart";
import { PeriodBar } from "../components/PeriodBar";
import { PeriodKey, NAV_LABEL, windowStartIndex, pctChange } from "../chart";

const INITIAL_CAPITAL = 10000;

function Header({ onProfile }: { onProfile: () => void }) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Dot color={C.gain} size={8} />
        <Text style={{ fontFamily: F.display800, fontSize: 16, letterSpacing: -0.3, color: C.text }}>ALPHA FIRM</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: rgba("#FFFFFF", 0.42), letterSpacing: 0.3 }}>{date}</Text>
        <Touchable onPress={onProfile} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: rgba(C.gain, 0.14), borderWidth: 1, borderColor: rgba(C.gain, 0.4), alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15 }}>👤</Text>
        </Touchable>
      </View>
    </View>
  );
}

function PositionRow({ p, onPress }: { p: any; onPress: () => void }) {
  const meta = ANALYSTS[p.agent] || { color: C.text2, label: p.agent };
  const ret = p.unrealized_pnl_pct;
  const latest = p.current_price ?? p.latest_price;
  return (
    <Touchable onPress={onPress} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 13 }}>
      <Dot color={meta.color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 15, color: C.text }}>{p.ticker}</Text>
        <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.42), marginTop: 1, fontFamily: F.ui }}>
          {p.shares} sh · {fmtPrice(p.entry_price)} → {fmtPrice(latest)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 14, color: pnlColor(ret) }}>{ret == null ? "—" : pct(ret, 1)}</Text>
        <Text style={{ fontSize: 10, color: meta.color, marginTop: 1, fontFamily: F.ui }}>{meta.label}</Text>
      </View>
      <Text style={{ color: rgba("#FFFFFF", 0.25), fontSize: 17, marginLeft: 1 }}>›</Text>
    </Touchable>
  );
}

export function PortfolioScreen({ navigation }: any) {
  const { data: portfolio, error, loading, reload } = useApi<any>("/api/portfolio", { pollMs: 45000 });
  const { data: tradeLog } = useApi<any>("/api/trade-log");
  const { data: navHist } = useApi<any>("/api/nav-history", { pollMs: 120000 });
  const [period, setPeriod] = useState<PeriodKey>("YTD");

  if (loading) return <Screen><Loading label="Loading portfolio…" /></Screen>;
  if (error || !portfolio) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  const nav = portfolio.nav ?? portfolio.cash;
  const capital = portfolio.capital ?? INITIAL_CAPITAL;
  const isReset = !!portfolio.reset;
  const cashPct = nav ? (portfolio.cash / nav) * 100 : 0;
  const [dollars, cents] = nav.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(".");
  const positions = [...(portfolio.positions || [])].sort(
    (a: any, b: any) => (b.unrealized_pnl_pct ?? -1e9) - (a.unrealized_pnl_pct ?? -1e9)
  );

  // Period-windowed NAV + SPY → drive the chart, the change line, and the alpha gap.
  const points: { date: string; nav: number }[] = navHist?.points || [];
  const spyPts: { date: string; value: number }[] = navHist?.spy || [];
  const hasChart = points.length >= 2;

  let navValues: number[] = [], spyValues: number[] = [];
  let changePct = 0, changeAbs = 0, up = true, spyChangePct: number | null = null, periodAlpha: number | null = portfolio.alpha ?? null;
  if (hasChart) {
    const start = windowStartIndex(points.map((p) => ({ date: p.date, value: p.nav })), period);
    navValues = points.slice(start).map((p) => p.nav);
    spyValues = spyPts.slice(start).map((p) => p.value);
    const ch = pctChange(navValues);
    changePct = ch.pct; changeAbs = ch.abs; up = ch.up;
    if (spyValues.length >= 2) {
      spyChangePct = pctChange(spyValues).pct;
      periodAlpha = +(changePct - spyChangePct).toFixed(2);
    }
  } else {
    changeAbs = nav - capital;
    changePct = capital ? (changeAbs / capital) * 100 : 0;
    up = changeAbs >= 0;
  }

  return (
    <Screen>
      <FadeInView>
        <Header onProfile={() => navigation.navigate("Profile")} />

        {isReset && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: rgba(C.gain, 0.1), borderWidth: 1, borderColor: rgba(C.gain, 0.28), borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 16 }}>
            <Dot color={C.gain} size={7} />
            <Text style={{ fontFamily: F.ui600, fontSize: 12, color: C.gain, letterSpacing: 0.2 }}>
              FRESH START · {portfolio.trackingSince}{portfolio.dayN ? ` · DAY ${portfolio.dayN}` : ""}
            </Text>
          </View>
        )}

        <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.5), letterSpacing: 1.4, fontFamily: F.ui600 }}>NET ASSET VALUE</Text>
        <Text style={{ marginTop: 4, fontFamily: F.display800, fontSize: 52, letterSpacing: -2, color: C.text }}>
          ${dollars}<Text style={{ fontSize: 30, color: rgba("#FFFFFF", 0.45) }}>.{cents}</Text>
        </Text>

        {/* period change line */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 }}>
          <View style={{ backgroundColor: rgba(C.gain, up ? 0.12 : 0), borderWidth: 1, borderColor: rgba(up ? C.gain : C.loss, 0.3), paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8 }}>
            <Text style={{ fontFamily: F.mono700, fontSize: 14, color: pnlColor(changeAbs) }}>{up ? "▲" : "▼"} {money(changeAbs, { sign: true })} ({pct(changePct)})</Text>
          </View>
          <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}>{NAV_LABEL[period]}</Text>
        </View>

        {/* interactive NAV chart */}
        {hasChart && (
          <>
            <View style={{ marginTop: 16, marginHorizontal: -4 }}>
              <View style={{ position: "relative" }}>
                <PerfChart values={navValues} spy={spyValues.length === navValues.length ? spyValues : undefined} color={C.gain} height={120} />
                {spyChangePct != null && (
                  <Text style={{ position: "absolute", top: -2, right: 2, fontFamily: F.mono, fontSize: 10.5, color: rgba("#FFFFFF", 0.5) }}>SPY {pct(spyChangePct, 1)}</Text>
                )}
                <Text style={{ position: "absolute", bottom: 30, right: 2, fontFamily: F.mono, fontSize: 10.5, color: C.gain }}>YOU {pct(changePct, 1)}</Text>
              </View>
            </View>
            <PeriodBar selected={period} onSelect={setPeriod} activeColor={C.gain} />
          </>
        )}

        {/* Alpha-gap callout — period-aware */}
        <View style={{ marginTop: 12, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: rgba(C.loss, 0.26) }}>
          <LinearGradient colors={["rgba(255,92,106,.14)", "rgba(255,92,106,.04)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
              <View>
                <Text style={{ fontSize: 12, color: rgba("#FFFFFF", 0.6), letterSpacing: 0.4, fontFamily: F.ui600 }}>ALPHA vs SPY</Text>
                <Text style={{ fontFamily: F.display800, fontSize: 26, color: pnlColor(periodAlpha), letterSpacing: -0.5, marginTop: 2 }}>{periodAlpha == null ? "—" : pct(periodAlpha)}</Text>
                <Text style={{ fontSize: 10.5, color: rgba("#FFFFFF", 0.4), fontFamily: F.mono, marginTop: 2 }}>{NAV_LABEL[period]}</Text>
              </View>
              <Text style={{ maxWidth: 150, textAlign: "right", fontSize: 11.5, lineHeight: 17, color: rgba("#FFFFFF", 0.5), fontFamily: F.ui }}>
                {isReset
                  ? <>Fresh start — <Text style={{ color: C.text }}>no track record yet.</Text> Tracking from {portfolio.trackingSince}.</>
                  : <>{periodAlpha != null && periodAlpha < 0 ? "Behind the index this window. " : "Ahead of the index this window. "}Still <Text style={{ color: C.text }}>simulated</Text> — building a track record before risking capital.</>}
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* Quick stats */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <StatChip value={`${cashPct.toFixed(0)}%`} label={`Cash · ${compactMoney(portfolio.cash)}`} />
          <StatChip value={positions.length} label="Positions" />
          <StatChip value={tradeLog?.total_trades ?? "—"} label="Trades total" />
        </View>

        {/* Positions */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text }}>Open positions</Text>
          <Text style={{ fontSize: 11.5, color: rgba("#FFFFFF", 0.4), fontFamily: F.mono }}>{positions.length} · LIVE PX</Text>
        </View>

        <View style={{ gap: 8 }}>
          {positions.length === 0 ? (
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.display, fontSize: 15, color: C.text }}>{cashPct >= 100 ? "100% cash" : "No open positions"}</Text>
              <Text style={{ fontSize: 12, color: rgba("#FFFFFF", 0.45), marginTop: 5, textAlign: "center", lineHeight: 17, fontFamily: F.ui }}>
                {isReset ? "Fresh slate — waiting for the desk's first pick." : "Nothing held right now — the desk is waiting for a setup."}
              </Text>
            </View>
          ) : (
            positions.map((p: any) => (
              <PositionRow key={p.ticker} p={p} onPress={() => navigation.navigate("PositionDetail", { ticker: p.ticker })} />
            ))
          )}
        </View>
      </FadeInView>
    </Screen>
  );
}
