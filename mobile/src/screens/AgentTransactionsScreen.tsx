import React from "react";
import { View, Text } from "react-native";
import { useApi } from "../api";
import { C, F, rgba, pnlColor, money, pct, fmtPrice, fmtWinRate } from "../theme";
import { Screen } from "../components/Screen";
import { AvatarBadge, Loading, ErrorState, Touchable } from "../components/ui";
import { FadeInView } from "../components/anim";

// One trade row — open (unrealized) or closed (realized). Same layout, different badge.
function TradeRow({ ticker, sub, pnl, ret, color, badge, badgeColor, badgeBg, badgeBorder }: any) {
  return (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: F.mono700, fontSize: 15, color: C.text }}>{ticker}</Text>
          <View style={{ backgroundColor: badgeBg, borderWidth: 1, borderColor: badgeBorder, paddingVertical: 1.5, paddingHorizontal: 6, borderRadius: 6 }}>
            <Text style={{ fontSize: 8.5, fontFamily: F.ui700, letterSpacing: 0.5, color: badgeColor }}>{badge}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.42), marginTop: 2, fontFamily: F.ui }}>{sub}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontFamily: F.mono700, fontSize: 14, color }}>{pnl}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color, marginTop: 1 }}>{ret}</Text>
      </View>
    </View>
  );
}

function Ledger({ d, onBack }: { d: any; onBack: () => void }) {
  const tintBg = rgba(d.color, 0.13);
  const tintBorder = rgba(d.color, 0.4);

  const openRows = (d.open || []).map((o: any) => {
    const pnl = (o.lastPrice - o.avgCost) * o.shares;
    const retPct = o.avgCost ? (o.lastPrice / o.avgCost - 1) * 100 : 0;
    return { ...o, pnl, retPct, color: pnlColor(pnl) };
  });
  const closedRows = (d.closed || []).map((c: any) => {
    const pnl = c.realizedPnl;
    const retPct = c.avgCost ? (c.exitPrice / c.avgCost - 1) * 100 : 0;
    return { ...c, pnl, retPct, color: pnlColor(pnl) };
  });

  const shownClosedSum = closedRows.reduce((s: number, c: any) => s + (c.pnl || 0), 0);
  const earlierNet = d.realizedTotal - shownClosedSum;
  const realUp = d.realizedTotal >= 0;
  const realColor = realUp ? C.gain : C.loss;

  return (
    <Screen>
      <FadeInView>
        <Touchable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginBottom: 16 }}>
          <Text style={{ fontSize: 18, color: rgba("#FFFFFF", 0.6), marginTop: -2 }}>‹</Text>
          <Text style={{ fontSize: 13, fontFamily: F.ui600, color: rgba("#FFFFFF", 0.6) }}>{d.name}</Text>
        </Touchable>

        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <AvatarBadge color={d.color} emoji={d.emoji} size={44} radius={13} fontSize={22} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: F.display800, fontSize: 21, letterSpacing: -0.5, color: C.text }}>Executed trades</Text>
            <Text style={{ fontSize: 12, color: d.color, marginTop: 3, fontFamily: F.ui }}>{d.name} · {d.closedTotalCount} closed · {d.open.length} open</Text>
          </View>
        </View>

        {/* realized summary */}
        <View style={{ marginTop: 16, backgroundColor: rgba(realColor, 0.1), borderWidth: 1, borderColor: rgba(realColor, 0.3), borderRadius: 18, padding: 16 }}>
          <Text style={{ fontSize: 11, fontFamily: F.ui700, letterSpacing: 0.6, color: realColor }}>REALIZED P&L · CLOSED TRADES</Text>
          <Text style={{ fontFamily: F.display800, fontSize: 30, letterSpacing: -0.5, marginTop: 5, color: realColor }}>{money(d.realizedTotal, { sign: true })}</Text>
          <View style={{ flexDirection: "row", gap: 18, marginTop: 10 }}>
            <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}><Text style={{ fontFamily: F.mono700, fontSize: 14, color: C.text }}>{d.open.length}</Text> open</Text>
            <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}><Text style={{ fontFamily: F.mono700, fontSize: 14, color: C.text }}>{d.closedTotalCount}</Text> closed</Text>
            <Text style={{ fontSize: 11, color: rgba("#FFFFFF", 0.45), fontFamily: F.ui }}><Text style={{ fontFamily: F.mono700, fontSize: 14, color: C.text }}>{fmtWinRate(d.winRate)}</Text> win rate</Text>
          </View>
        </View>

        {/* open · unrealized */}
        {openRows.length > 0 && (
          <>
            <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 22, marginBottom: 10, marginHorizontal: 2 }}>Open · unrealized</Text>
            <View style={{ gap: 8 }}>
              {openRows.map((o: any) => (
                <TradeRow
                  key={o.ticker}
                  ticker={o.ticker}
                  sub={`${o.shares} sh · avg ${fmtPrice(o.avgCost)} · now ${fmtPrice(o.lastPrice)}`}
                  pnl={money(o.pnl, { sign: true })}
                  ret={pct(o.retPct, 1)}
                  color={o.color}
                  badge="OPEN" badgeColor={d.color} badgeBg={tintBg} badgeBorder={tintBorder}
                />
              ))}
            </View>
          </>
        )}

        {/* closed · realized */}
        <Text style={{ fontFamily: F.display, fontSize: 16, color: C.text, marginTop: 22, marginBottom: 10, marginHorizontal: 2 }}>Closed · realized</Text>
        <View style={{ gap: 8 }}>
          {closedRows.map((c: any, i: number) => (
            <TradeRow
              key={`${c.ticker}-${i}`}
              ticker={c.ticker}
              sub={`${c.shares} sh · avg ${fmtPrice(c.avgCost)} → ${fmtPrice(c.exitPrice)}`}
              pnl={money(c.pnl, { sign: true })}
              ret={pct(c.retPct, 1)}
              color={c.color}
              badge="SOLD" badgeColor={rgba("#FFFFFF", 0.5)} badgeBg={rgba("#FFFFFF", 0.06)} badgeBorder={rgba("#FFFFFF", 0.12)}
            />
          ))}
          {d.earlierClosedCount > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, paddingHorizontal: 15, borderWidth: 1, borderStyle: "dashed", borderColor: rgba("#FFFFFF", 0.12), borderRadius: 15 }}>
              <Text style={{ fontSize: 12, color: rgba("#FFFFFF", 0.5), fontFamily: F.ui }}>+ {d.earlierClosedCount} earlier closed</Text>
              <Text style={{ fontFamily: F.mono700, fontSize: 13, color: pnlColor(earlierNet) }}>{money(earlierNet, { sign: true })}</Text>
            </View>
          )}
        </View>
        <View style={{ height: 10 }} />
      </FadeInView>
    </Screen>
  );
}

export function AgentTransactionsScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { data, error, loading, reload } = useApi<any>(`/api/analysts/${id}/transactions`);

  if (loading) return <Screen><Loading label="Loading trades…" /></Screen>;
  if (error || !data) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;
  return <Ledger d={data} onBack={() => navigation.goBack()} />;
}
