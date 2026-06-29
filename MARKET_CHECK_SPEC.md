# Market Check drill-down — structured-fields spec

Goal: surface in the app's per-pick drill-down the three prototype fields the firm
doesn't yet emit in structured form — **core claim**, **supporting facts[]**, and the
**PM score breakdown** (+ the bull/bear debate) — without fabricating anything.

Today the drill-down derives everything from the analyst's prose `entry_thesis`/`risk`
and the session `reason`. This spec adds discrete fields at two layers: the **analyst rec**
(claim/facts/why-now/falsification) and a new **`state/last-check.json`** snapshot
(PM scoring + debate), then surfaces them through the existing endpoints + screen.

Nothing here changes the trading logic — only what gets *recorded* and *shown*.

---

## 1. Schema additions

### A. Analyst rec — `memory/{agent_id}/{date}.json` (+4 fields)
Each analyst already writes a rec; add four structured fields to the existing prose ones.
The content already exists inside `entry_thesis`/`risk` — this just pulls it into fields.

```jsonc
{
  // ...existing: ticker, asset_type, entry_thesis, conviction, risk,
  //              target_return, catalyst, current_price, target_return_pct,
  //              horizon_days, suggested_allocation_pct ...
  "core_claim":       "one-sentence, falsifiable thesis (≤140 chars)",
  "supporting_facts": ["concrete checkable fact", "fact 2", "fact 3"],   // 2–4 items
  "why_now":          "why actionable today, not last week (≤160 chars)",
  "falsification":    "the specific observation that would prove this wrong (≤160 chars)"
}
```
- `falsification` is the structured form of `risk`; keep `risk` for back-compat (UI prefers
  `falsification` when present, falls back to `risk`).
- The pre-filter in `orchestrator.md` (Step 1) already rejects recs with `<2 concrete facts`
  or `no falsification condition` — reuse it to validate `supporting_facts.length >= 2`.

**Edit points:** the `OUTPUT FORMAT` JSON block in all six `agents/{id}.md`
(sentiment, contrarian, catalyst, macro, crypto, quant). One block each, same 4 keys.

### B. PM scoring + debate — new `state/last-check.json`
The PM already computes the 6-category score and runs the debate; today neither is persisted.
Write one snapshot per run capturing the whole check. This becomes the authoritative source
for the Live screen (grid + drill-down + a future debate view) — no more scraping memory +
daily-state.

```jsonc
{
  "date": "YYYY-MM-DD",
  "session": "premarket|midday|closing",
  "ran_at": "ISO-8601",
  "decision": "BUY|PASS",
  "bought_ticker": "PLTR | null",
  "vix": 18.8,
  "spy_return_pct": 31.2,
  "picks": [
    {
      "agent_id": "sentiment",
      "ticker": "PLTR",
      "conviction": 8,
      "outcome": "BOUGHT|PASSED|INELIGIBLE",
      "pm_scoring": {
        "categories": {
          "evidence_strength":   { "score": 8.5, "weight": 0.25 },
          "falsifiability":      { "score": 7.0, "weight": 0.20 },
          "risk_reward":         { "score": 8.2, "weight": 0.20 },
          "portfolio_impact":    { "score": 7.8, "weight": 0.15 },
          "signal_confirmation": { "score": 8.0, "weight": 0.10 },
          "execution_readiness": { "score": 8.3, "weight": 0.10 }
        },
        "raw_score": 8.2,
        "modifiers": { "track_record": 1.0, "fundamental": 1.0, "debate": 1.05, "narrative_penalty": 1.0 },
        "final_score": 8.4,
        "threshold": 8.0
      },
      "debate": {
        "ran": true,                                  // false if conviction < 7.5 (never reached the gate)
        "bear":  { "classification": "serious_weakness", "flags": ["factor_crowding","already_priced_in"], "summary": "…" },
        "bull":  { "summary": "…" },
        "risk_chair": { "verdict": "BUY_ELIGIBLE|REDUCED|PASS|VETO", "modifier": 1.05 }
      }
    }
    // ...one per analyst that returned a rec
  ]
}
```

**Edit points:**
- `orchestrator.md` Step 3 (scoring) + Step 6 (write summary): after the decision, emit
  `state/last-check.json` with `pm_scoring` per scored pick. The category scores are the same
  numbers the PM already assigns — just record them.
- `skills/debate.md`: have the Risk Chair emit the structured `debate` object (classification,
  flags, verdict, modifier) it already decides in prose.
- `run-check.sh`: no structural change (the PM writes `last-check.json` as a normal state write,
  same as portfolio/daily-state). Optional: a tiny schema-validate step.

---

## 2. Server (`dashboard/server.js`)

Add `readLastCheck()`; prefer it when present + dated within the current run window, else fall
back to today's memory-scrape (current behaviour — zero regression for historical data).

- **`GET /api/check/latest`** (grid): unchanged shape; source from `last-check.json.picks` when
  available (adds nothing visible, just authoritative).
- **`GET /api/check/picks/:agentId`** (detail): add to the response —
  `coreClaim`, `supportingFacts: string[]`, `whyNow`, `falsification`,
  `scoring: { categories, rawScore, modifiers, finalScore, threshold }`,
  `debate: { ran, bear, bull, riskChair }`.
  When `last-check.json` is absent or lacks the pick, omit those keys (app already no-ops on
  missing fields). `falsification` falls back to the rec's `risk`.

Optional later: `GET /api/check/debate` (or fold the debate into picks, as above) to power a
real debate card on the Live screen instead of the canned `PreviewPipeline`.

---

## 3. App (`mobile/src/screens/PickDetailScreen.tsx`)

New cards, each rendered only when its field is present (so old runs look exactly as today):

1. **The claim** — `core_claim` on one emphasized line above the thesis.
2. **Supporting facts** — bullet list (`▪` per `supporting_facts[]`), styled like the
   prototype's "SUPPORTING FACTS" block.
3. **Why now** — small card from `why_now`.
4. **What would disprove it** — already shipped (currently maps `risk`); switch to
   `falsification` when present.
5. **Score breakdown** — 6 rows, each a label + mini `GrowBar` (`score/10`) + the value, then
   a formula line: `8.2 raw × 1.05 debate = 8.4 · bar 8.0` (greyed when no scoring present).
6. **Capital-protection debate** (optional) — bear flags + bull rebuttal + risk-chair verdict,
   the real version of the prototype's pipeline debate card.

No new dependencies; reuses `GrowBar`, `C`/`F`, the existing card styles.

---

## 4. Back-compat & failure modes
- Old memory recs (no new fields) → server omits them → app omits those cards. Drill-down
  degrades to exactly today's behaviour.
- `last-check.json` missing (e.g. before first post-change run) → memory-scrape fallback.
- Agent emits weak/empty `supporting_facts` → pre-filter already rejects `<2 facts`; reuse that
  guard so a thin pick never reaches the UI claiming structure it doesn't have.

## 5. Cost
- Extra analyst output: ~150–300 tokens/agent (the claim/facts/why-now/falsification).
- PM logging step: negligible (numbers already computed).
- vs. the ~23–41k tokens/check budget → immaterial.

## 6. Rollout phases
- **Phase 1 — analyst structured fields** (claim / facts[] / why-now / falsification).
  Edits: 6 `agents/*.md` OUTPUT blocks + `/api/check/picks` + 4 app cards. No pipeline
  restructuring, no PM-scoring work. Visible on the next `run-check`. *Small.*
- **Phase 2 — PM scoring + debate snapshot** (`state/last-check.json`).
  Edits: `orchestrator.md` + `skills/debate.md` + server source-switch + 2 app cards
  (score breakdown, debate). Touches decision logging. *Medium.*

Recommended: ship **Phase 1** first (high value, low blast radius), then **Phase 2**.
