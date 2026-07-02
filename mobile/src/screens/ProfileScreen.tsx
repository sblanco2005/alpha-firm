import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { useApi, apiPost } from "../api";
import { C, F, rgba } from "../theme";
import { Screen } from "../components/Screen";
import { Touchable, Loading, ErrorState } from "../components/ui";
import { FadeInView } from "../components/anim";

const PRESETS = [5000, 10000, 25000, 50000, 100000];
const MIN_CAP = 0;
const MAX_CAP = 100_000_000;
const STEP = 1000;

const clampCap = (n: number) => Math.max(MIN_CAP, Math.min(MAX_CAP, Math.round(n)));
const fmtCap = (n: number) => n.toLocaleString("en-US");

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <Touchable onPress={onBack} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.text, fontSize: 20, marginTop: -2 }}>‹</Text>
      </Touchable>
      <Text style={{ fontFamily: F.display800, fontSize: 26, letterSpacing: -0.6, color: C.text }}>Account</Text>
    </View>
  );
}

export function ProfileScreen({ navigation }: any) {
  const { data: account, error, loading, reload } = useApi<any>("/api/account");
  const [capital, setCapital] = useState(10000);
  const [text, setText] = useState("10000");
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmFirm, setConfirmFirm] = useState(false);
  const [firmBusy, setFirmBusy] = useState(false);
  const [firmMsg, setFirmMsg] = useState<string | null>(null);

  const firmReset = useCallback(async () => {
    setFirmBusy(true);
    setFirmMsg(null);
    try {
      const r = await apiPost<any>("/api/firm/reset", { confirm: true });
      setFirmMsg(r?.ok ? "✓ Fresh start complete — run archived, book reset to $10,000." : "Reset failed.");
      setResetAt(null);
      reload();
    } catch (e: any) {
      setFirmMsg(`Reset failed: ${e?.message || "server error"}`);
    } finally {
      setFirmBusy(false);
      setConfirmFirm(false);
    }
  }, [reload]);

  // Seed local editable state once the account loads.
  useEffect(() => {
    if (account && !dirty) {
      const c = Number.isFinite(account.capital) ? account.capital : 10000;
      setCapital(c);
      setText(String(c));
      setResetAt(account.resetAt || null);
    }
  }, [account, dirty]);

  const save = useCallback(async (patch: { capital?: number; resetAt?: string | null }) => {
    setSaving(true);
    try {
      const next = await apiPost<any>("/api/account", patch);
      setCapital(next.capital);
      setText(String(next.capital));
      setResetAt(next.resetAt || null);
      setDirty(false);
      reload();
    } catch {
      // leave local state; user can retry
    } finally {
      setSaving(false);
    }
  }, [reload]);

  if (loading) return <Screen><Loading label="Loading account…" /></Screen>;
  if (error && !account) return <Screen><ErrorState error={error} onRetry={reload} /></Screen>;

  const onText = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 9);
    setText(digits);
    setDirty(true);
    setCapital(digits === "" ? 0 : clampCap(Number(digits)));
  };
  const step = (delta: number) => {
    const n = clampCap(capital + delta);
    setCapital(n);
    setText(String(n));
    setDirty(true);
  };
  const pickPreset = (n: number) => {
    setCapital(n);
    setText(String(n));
    setDirty(true);
  };
  const canSave = dirty && capital !== account?.capital && text !== "";

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Screen>
      <FadeInView>
        <Header onBack={() => navigation.goBack()} />

        <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.5), marginBottom: 18, lineHeight: 18, fontFamily: F.ui }}>
          A personal view over the firm's book. Your capital scales every figure — NAV, cash, positions, P&L — while the firm's real $10k simulation keeps running untouched.
        </Text>

        {/* ── Investment capital ─────────────────────────── */}
        <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text, marginBottom: 12 }}>Investment capital</Text>

        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 18, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Touchable onPress={() => step(-STEP)} style={stepperStyle}>
              <Text style={{ color: C.text, fontSize: 22, fontFamily: F.ui600, marginTop: -2 }}>−</Text>
            </Touchable>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.cardDim, borderWidth: 1, borderColor: C.hair, borderRadius: 14, paddingHorizontal: 10, height: 58 }}>
              <Text style={{ fontFamily: F.display800, fontSize: 26, color: rgba("#FFFFFF", 0.45) }}>$</Text>
              <TextInput
                value={fmtCap(Number(text || 0))}
                onChangeText={onText}
                keyboardType="number-pad"
                selectTextOnFocus
                style={{ flex: 1, textAlign: "center", fontFamily: F.display800, fontSize: 26, color: C.text, padding: 0 }}
                placeholderTextColor={rgba("#FFFFFF", 0.3)}
              />
            </View>
            <Touchable onPress={() => step(STEP)} style={stepperStyle}>
              <Text style={{ color: C.text, fontSize: 20, fontFamily: F.ui600, marginTop: -1 }}>+</Text>
            </Touchable>
          </View>

          {/* preset chips */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {PRESETS.map((p) => {
              const active = capital === p;
              return (
                <Touchable
                  key={p}
                  onPress={() => pickPreset(p)}
                  style={{
                    paddingVertical: 7, paddingHorizontal: 13, borderRadius: 11,
                    backgroundColor: active ? rgba(C.gain, 0.14) : C.cardDim,
                    borderWidth: 1, borderColor: active ? rgba(C.gain, 0.4) : C.hair,
                  }}
                >
                  <Text style={{ fontFamily: F.ui600, fontSize: 12.5, color: active ? C.gain : rgba("#FFFFFF", 0.6) }}>
                    ${p >= 1000 ? p / 1000 + "k" : p}
                  </Text>
                </Touchable>
              );
            })}
          </View>

          <Touchable
            onPress={() => canSave && save({ capital })}
            style={{
              marginTop: 16, borderRadius: 13, paddingVertical: 13, alignItems: "center",
              backgroundColor: canSave ? rgba(C.gain, 0.16) : C.cardDim,
              borderWidth: 1, borderColor: canSave ? rgba(C.gain, 0.4) : C.hair,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color={C.gain} />
            ) : (
              <Text style={{ fontFamily: F.ui700, fontSize: 14, color: canSave ? C.gain : rgba("#FFFFFF", 0.35) }}>
                {canSave ? `Set capital to $${fmtCap(capital)}` : "Saved"}
              </Text>
            )}
          </Touchable>
        </View>

        {/* ── Strategy reset ─────────────────────────────── */}
        <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text, marginTop: 26, marginBottom: 12 }}>Reset my view</Text>

        {resetAt ? (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba(C.gain, 0.28), borderRadius: 18, padding: 16 }}>
            <Text style={{ fontFamily: F.ui700, fontSize: 13.5, color: C.gain, letterSpacing: 0.3 }}>● TRACKING FROM {resetAt}</Text>
            <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.6), marginTop: 8, lineHeight: 18, fontFamily: F.ui }}>
              Your view started fresh at 100% cash on this date. Every figure tracks from here forward.
            </Text>
            <Touchable onPress={() => save({ resetAt: null })} style={{ marginTop: 14, alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: F.ui600, fontSize: 13, color: rgba("#FFFFFF", 0.55) }}>↺ Restore full simulated history</Text>
            </Touchable>
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.hair, borderRadius: 18, padding: 16 }}>
            <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.6), lineHeight: 18, fontFamily: F.ui }}>
              Start your view over from a clean slate: 100% cash, zero P&L, tracking from today. The firm's real book is not affected — you can restore the full history anytime.
            </Text>
            {!confirmReset ? (
              <Touchable
                onPress={() => setConfirmReset(true)}
                style={{ marginTop: 14, borderRadius: 13, paddingVertical: 13, alignItems: "center", backgroundColor: rgba(C.loss, 0.12), borderWidth: 1, borderColor: rgba(C.loss, 0.32) }}
              >
                <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.loss }}>Reset strategy</Text>
              </Touchable>
            ) : (
              <View style={{ marginTop: 14, gap: 8 }}>
                <Text style={{ fontFamily: F.ui600, fontSize: 12.5, color: C.loss, textAlign: "center" }}>Reset to 100% cash, tracking from {today}?</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Touchable
                    onPress={() => setConfirmReset(false)}
                    style={{ flex: 1, borderRadius: 13, paddingVertical: 13, alignItems: "center", backgroundColor: C.cardDim, borderWidth: 1, borderColor: C.hair }}
                  >
                    <Text style={{ fontFamily: F.ui600, fontSize: 14, color: rgba("#FFFFFF", 0.6) }}>Cancel</Text>
                  </Touchable>
                  <Touchable
                    onPress={() => { setConfirmReset(false); save({ resetAt: today }); }}
                    style={{ flex: 1, borderRadius: 13, paddingVertical: 13, alignItems: "center", backgroundColor: rgba(C.loss, 0.16), borderWidth: 1, borderColor: rgba(C.loss, 0.4) }}
                  >
                    <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.loss }}>Yes, reset</Text>
                  </Touchable>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Firm fresh start (REAL reset) ─────────────── */}
        <Text style={{ fontFamily: F.display, fontSize: 19, color: C.text, marginTop: 26, marginBottom: 12 }}>Firm fresh start</Text>

        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: rgba(C.loss, 0.35), borderRadius: 18, padding: 16 }}>
          <Text style={{ fontSize: 12.5, color: rgba("#FFFFFF", 0.6), lineHeight: 18, fontFamily: F.ui }}>
            This resets the firm's REAL book — not just your view. The current run is archived to runs/, the portfolio restarts at $10,000 (100% cash), the SPY benchmark re-baselines to the latest close, agent restrictions and modifiers stay cleared, and agent memory carries over. This is what launched Run 2 on Jul 2, 2026. It cannot run while a market check is in progress.
          </Text>
          {firmMsg ? (
            <Text style={{ fontFamily: F.ui600, fontSize: 12.5, color: firmMsg.startsWith("✓") ? C.gain : C.loss, marginTop: 12, textAlign: "center" }}>{firmMsg}</Text>
          ) : null}
          {firmBusy ? (
            <View style={{ marginTop: 14, alignItems: "center", paddingVertical: 13 }}>
              <ActivityIndicator color={C.loss} />
              <Text style={{ fontFamily: F.ui600, fontSize: 12, color: rgba("#FFFFFF", 0.5), marginTop: 8 }}>Archiving run and resetting the book…</Text>
            </View>
          ) : !confirmFirm ? (
            <Touchable
              onPress={() => setConfirmFirm(true)}
              style={{ marginTop: 14, borderRadius: 13, paddingVertical: 13, alignItems: "center", backgroundColor: rgba(C.loss, 0.16), borderWidth: 1, borderColor: rgba(C.loss, 0.45) }}
            >
              <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.loss }}>Reset the firm's real book</Text>
            </Touchable>
          ) : (
            <View style={{ marginTop: 14, gap: 8 }}>
              <Text style={{ fontFamily: F.ui600, fontSize: 12.5, color: C.loss, textAlign: "center" }}>
                Archive the current run and restart the REAL portfolio at $10,000? This affects every device.
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Touchable
                  onPress={() => setConfirmFirm(false)}
                  style={{ flex: 1, borderRadius: 13, paddingVertical: 13, alignItems: "center", backgroundColor: C.cardDim, borderWidth: 1, borderColor: C.hair }}
                >
                  <Text style={{ fontFamily: F.ui600, fontSize: 14, color: rgba("#FFFFFF", 0.6) }}>Cancel</Text>
                </Touchable>
                <Touchable
                  onPress={firmReset}
                  style={{ flex: 1, borderRadius: 13, paddingVertical: 13, alignItems: "center", backgroundColor: rgba(C.loss, 0.22), borderWidth: 1, borderColor: rgba(C.loss, 0.55) }}
                >
                  <Text style={{ fontFamily: F.ui700, fontSize: 14, color: C.loss }}>Yes, fresh start</Text>
                </Touchable>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 12 }} />
      </FadeInView>
    </Screen>
  );
}

const stepperStyle = {
  width: 52, height: 58, borderRadius: 14, backgroundColor: C.cardDim,
  borderWidth: 1, borderColor: C.hair, alignItems: "center" as const, justifyContent: "center" as const,
};
