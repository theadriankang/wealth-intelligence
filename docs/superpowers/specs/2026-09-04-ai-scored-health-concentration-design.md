# AI-scored health & concentration — design

**Date:** 2026-09-04
**Status:** approved for planning
**Base:** branch `chunyee` @ `f3214db`
**Amends:** `2026-09-04-rm-intelligence-evaluation-design.md` §1/§2 — that spec fixed the
architecture to "exactly one LLM touch: `narrateClient` → `{ thesis, summary }`", with health and
concentration as pure deterministic output the LLM only narrates around. This spec widens that
one touch's output schema so the same call also returns the health score and the risk-weighted
concentration figure shown over the globe. It does **not** add a second LLM call, and it does
**not** remove the deterministic engine — that engine becomes the fallback path, exactly the way
Policy Sentinel falls back to a seeded scan and the brief falls back to a template.

---

## 1. Goal

Two numbers that are currently pure deterministic output become AI-computed, with the
deterministic calculation kept alive underneath as the resilience fallback:

- **Health score** (0–100) — the health-dial in the Explanation segment (`segments.js`).
- **Risk-weighted concentration** (%, + driving countries) — the card shown over the globe
  when no goal is selected (`paintEvidence()` in `panels.js`).

Both are already produced by tested, deterministic functions (`evaluateClient()` in
`clientEval.js` for health; the household-aware `concentration()` selector in `store.js`, wrapping
`riskConcentration()`, for the globe-overlay figure — the two sources are already different call
sites today, and stay that way). Neither is deleted — each becomes what's used when the AI is
unavailable or returns something invalid, and what seeds the very first paint before any AI call
has resolved.

## 2. Non-goals

- No second LLM call, no new API route. This reuses the existing `narrateClient` →
  `generateBrief` → `/api/llm` path.
- No change to `evaluate.js`, `clientEval.js`, `model/scoring.js`, `store.js`, or any consumer of
  `S.evaluation.hash` other than the narration gate. The deterministic engine that scores every
  portfolio in the book on every poll tick is untouched, and neither deterministic fallback
  changes scope from what it computes today.
- Not household-aware for *every* portfolio — only the one currently open gets AI treatment
  (mirrors the existing "one client, hash-gated" narration rule). Portfolios not on screen keep
  showing their last-known figures until opened.
- No numeric guarantee on the AI's arithmetic. It is explicitly told not to see the deterministic
  answer, so its number is an independent read, not a rounding of the trusted one — validated for
  shape (range, subset-of-given-countries) but not checked against the deterministic value.

## 3. Data & call flow

`buildFacts()` in `narrate.js` currently sends already-summarized facts (risk/opportunity prose,
the rounded health score) — enough to write *around* a number, not compute one. It grows to
include the raw grounding the model needs to derive both figures itself:

```js
{
  client: { name, mandate, riskProfile, riskBand },
  household: S.household,
  positions: [{ instrumentId, weightPct, countries: [{ iso3, weight }], riskDelta }],
  countrySignals: [{ iso3, name, riskDelta }],   // every country touched by positions()
  goals: [{ name, horizon, baseFunded }],
  lombard: { headroomPct } | null,
  risks: [...], opportunities: [...],            // unchanged, still deterministic prose
  rmNotes
}
```

`positions` uses the household-aware `positions()` selector (respects `S.household`), matching
what the globe-overlay concentration card has always shown — a behavior change from today's
`clientEval.js`, which always scores the account-only view regardless of the household toggle.
That's intentional: it reads as more correct, and it's the only way the concentration figure and
the health figure can share one cache/hash.

The deterministic `health`/`concentration` are **not** included in the facts payload. If the
model saw the trusted answer, "AI-computed" would just mean "AI parrots the number we handed it."

**Schema**, grown from `{ thesis, summary }`:

```js
{
  health: "number 0-100 — overall portfolio health given the facts",
  concentration: {
    pct: "number 0-100 — risk-weighted concentration of deteriorating exposure",
    countries: "array of ISO3 codes present in the facts, most significant first"
  },
  thesis: "string — what the portfolio is built to do",
  summary: "string — where it stands now"
}
```

`healthBand` is **not** requested from the model. It's recomputed locally from the returned
`health` via the existing `HEALTH_BANDS` thresholds (`clientEval.js`/`rubric.js`), so the number
and its band label can never disagree with each other.

System prompt gains one instruction alongside the existing "no new facts, no imperative verbs"
rule: compute `health` and `concentration` from the numbers given; `concentration.countries` must
be a subset of the country codes present in `countrySignals`.

## 4. Caching & trigger

Reuses the existing gate in `main.js`'s `maybeNarrateOpenClient()` verbatim: only the portfolio
currently on screen is ever sent to the model, and only when its facts changed since the last
call, with the same `inflight` de-dupe set preventing overlapping asks for the same
portfolio+hash.

The one change is *what* decides "did facts change." Today that's `evaluate.js`'s `hashClient()`,
built from the deterministic *output* (health, risk/action ids+urgency) — which won't move when
`S.household` toggles, even though concentration should react to it. A new `factsHash()` in
`narrate.js` hashes the raw inputs above (portfolio id, `S.household`, position weights +
riskDeltas, goal funding gaps, lombard headroom, policy-scan signal) and is used **only** for this
gate. `evaluate.js`, `hashClient()`, and `S.evaluation.hash` are untouched — nothing else that
reads them is affected.

## 5. Fallback & validation

Same all-or-nothing pattern already at `narrate.js:36`. The whole response is discarded — falling
back to `templateNarration()` — if any of:

- `thesis`/`summary` aren't non-empty strings (existing check), or
- `health` isn't a finite number in `[0, 100]`, or
- `concentration.pct` isn't a finite number in `[0, 100]`, or
- `concentration.countries` isn't an array, or contains any code not present in the facts'
  `countrySignals` (defends against a hallucinated country)

`templateNarration()` is extended to also return `health`/`concentration` — `health`/`healthBand`
from the `clientEval` object it's already handed, `concentration` from `store.js`'s
`concentration()` selector (household-aware, called fresh) — so the fallback shape is identical to
the AI shape and every consumer reads one field name regardless of source, even though the two
values still come from the two places they come from today.

## 6. Wiring + provenance

No change to `clientEval.js`. Its internal `conc` (account-only, from `portfolio.positions`) stays
exactly what it is today: an input to the health penalty math, never exposed. The concentration
*fallback* is sourced the same place the card gets it today — `store.js`'s household-aware
`concentration()` selector — so a failed or invalid AI call regresses the card to precisely what
it would have shown before this feature existed, not to a different (account-only) scope.
`narrate.js`'s facts-builder and its fallback path both call this selector for their concentration
figure; `clientEval.js` is read only for `health`/`healthBand`/the risk-and-opportunity prose.

`main.js`'s `maybeNarrateOpenClient()` overwrites `live.health`, `live.healthBand`,
`live.concentration` in place once the AI answers — the same idiom already used for
`live.thesis`/`live.summary` (main.js:166). `S.narratedHash[id]` grows the same two fields so a
cache hit restores them without a re-render surprise.

New field: `live.scoreSource: "ai" | "deterministic"`, flipped alongside the other overwrites.
The UI shows a small provenance tag near the health dial and the concentration card — matching
this app's existing "state it, don't hide it" convention (Policy Sentinel's `mode:"fallback"`
tag, the ticker's "fixtures" tag). Before the first successful narration for a client, or whenever
a call fails/validates-false, the tag reads "deterministic" and the numbers shown are
`clientEval()`'s health and `store.js`'s `concentration()` — never blank, never a stale AI number
presented as fresh.

`panels.js`'s `paintEvidence()` stops calling `concentration()` (the store selector) directly for
its primary figure and instead reads `S.evaluation.clients[id].concentration` — falling back to
the store selector only in the narrow window before `S.evaluation` has been populated at all
(first paint before the first `refreshEvaluation()` call completes, if that's ever observable).

`segments.js` needs no changes — it already reads `e.health`/`e.healthBand`/`e.drivers` by name;
those names don't change, only what overwrites them does.

## 7. Test impact

Untouched: `clientEval.test.js`, `evaluate.test.js`, `store.test.js` — neither `clientEval.js` nor
`evaluate.js` nor `store.js` is modified, so nothing about the shapes those tests assert on
changes.

`narrate.test.js` needs new cases:
- `templateNarration` returns `health`/`concentration` matching the input `clientEval`'s values.
- `narrateClient`'s fallback path (already exercised — no server in `node:test`) now also asserts
  the returned `health`/`concentration` came through as the deterministic fallback, not `undefined`.
- A validation-rejection case: a mocked malformed AI response (health out of range, or a
  `countries` entry not present in facts) falls back to `templateNarration()` in full, not a
  partial merge.

## 8. Open risk, stated rather than hidden

The health-dial's small "drivers" pill row (`e.drivers`, e.g. "Goal funding gap", "Concentration")
stays sourced from the deterministic penalty breakdown even once the headline number above it is
AI-scored — the two are no longer guaranteed to visually reconcile (dial says 62, but the driver
list is whatever the deterministic penalty math produced). This is the same kind of gap Policy
Sentinel already lives with (a stance score next to agent trace text that doesn't "add up" to it
arithmetically) and isn't fixed here; flagged so it doesn't surprise anyone later.
