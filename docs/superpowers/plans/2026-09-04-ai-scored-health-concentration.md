# AI-scored health & concentration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the health-dial score and the globe-overlay "risk-weighted concentration" figure AI-computed for the currently open portfolio, while keeping the existing deterministic functions as the resilience fallback and the first-paint seed.

**Architecture:** Widen the schema of the app's one existing LLM touch (`narrateClient` in `src/eval/narrate.js`) so it returns `health`/`concentration` alongside `thesis`/`summary`, instead of adding a second call. Reuse the existing "one client on screen, hash-gated" trigger in `main.js`'s `maybeNarrateOpenClient()` verbatim, with a new facts-based hash (`factsHash`) that reacts to the household toggle, which the old hash didn't. `clientEval.js`, `evaluate.js`, `model/scoring.js`, and `store.js` are not modified.

**Tech Stack:** Vanilla JS (ES modules), `node:test` + `node:assert/strict` for unit tests, Vite dev server for manual verification.

**Spec:** `docs/superpowers/specs/2026-09-04-ai-scored-health-concentration-design.md`

## Global Constraints

- No second LLM call, no new API route — reuse `narrateClient` → `generateBrief` → `/api/llm`.
- No change to `evaluate.js`, `clientEval.js`, `model/scoring.js`, or `store.js`.
- `narrate.js` stays a pure module — no import of `store.js`/global `S`. Anything it needs from
  the store (household flag, positions, country signals, the deterministic concentration
  fallback) is assembled by the caller (`main.js`) and passed in as an explicit `grounding` object.
- `healthBand` is never trusted from the model — always recomputed locally from the returned
  `health` via the existing `HEALTH_BANDS` thresholds.
- `concentration.countries` from the model must be validated as a subset of the country codes
  present in the facts sent — reject and fall back on any code not in that set.
- All-or-nothing fallback: any single invalid field in the AI response discards the whole
  response in favour of `templateNarration()` — never a partial merge.
- Only the portfolio currently on screen is ever sent to the model, and only when its facts
  (including the household toggle) changed since the last call for it.

---

## File Structure

- **Modify: `src/eval/narrate.js`** — schema/prompt, `templateNarration()`, `narrateClient()`; new
  exported `validateAiScore()` and `factsHash()`.
- **Modify: `src/eval/narrate.test.js`** — update the two existing tests for the new signatures;
  add tests for `validateAiScore` and `factsHash`.
- **Modify: `src/main.js`** — new `buildGrounding()`; rewritten `maybeNarrateOpenClient()`; household
  toggle now triggers re-narration.
- **Modify: `src/ui/panels.js`** — `paintEvidence()` reads the AI concentration (with fallback) and
  shows a provenance tag.
- **Modify: `src/ui/segments.js`** — `paintExplanation()` shows a provenance tag next to the health
  band.
- **Modify: `src/ui/styles.css`** — one new rule, `.mode.ai`.

No new files. No new dependencies.

---

### Task 1: `validateAiScore()` — pure validation of a candidate AI response

**Files:**
- Modify: `src/eval/narrate.js`
- Test: `src/eval/narrate.test.js`

**Interfaces:**
- Produces: `export function validateAiScore(data, countryCodes)` → `boolean`. `data` is a
  candidate parsed JSON object (shape: `{ thesis, summary, health, concentration: { pct,
  countries } }`, other fields ignored). `countryCodes` is an array of ISO3 strings the returned
  `concentration.countries` must be a subset of.

- [ ] **Step 1: Write the failing tests**

Open `src/eval/narrate.test.js`. Add these four tests after the existing two (leave the existing
two untouched for this task — they're updated in Task 3):

```js
test("validateAiScore accepts a well-formed AI response", () => {
  const data = { thesis: "A thesis long enough.", summary: "A summary long enough.", health: 55,
    concentration: { pct: 40, countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), true);
});

test("validateAiScore rejects a health score out of range", () => {
  const data = { thesis: "t", summary: "s", health: 140, concentration: { pct: 40, countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects a hallucinated country", () => {
  const data = { thesis: "t", summary: "s", health: 55, concentration: { pct: 40, countries: ["ZZZ"] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects a non-numeric concentration percentage", () => {
  const data = { thesis: "t", summary: "s", health: 55, concentration: { pct: "high", countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});
```

Add `validateAiScore` to the existing import line at the top of the file:

```js
import { templateNarration, narrateClient, validateAiScore } from "./narrate.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/eval/narrate.test.js`
Expected: FAIL — `validateAiScore is not a function` (or `undefined`) on all four new tests. The
two pre-existing tests still pass.

- [ ] **Step 3: Implement `validateAiScore`**

In `src/eval/narrate.js`, add this exported function (placement: anywhere below the existing
`SCHEMA` constant, above `templateNarration`):

```js
export function validateAiScore(data, countryCodes) {
  if (!data || typeof data.thesis !== "string" || typeof data.summary !== "string") return false;
  if (typeof data.health !== "number" || !Number.isFinite(data.health) || data.health < 0 || data.health > 100) return false;
  const conc = data.concentration;
  if (!conc || typeof conc.pct !== "number" || !Number.isFinite(conc.pct) || conc.pct < 0 || conc.pct > 100) return false;
  if (!Array.isArray(conc.countries) || conc.countries.some(c => !countryCodes.includes(c))) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/eval/narrate.test.js`
Expected: PASS — all 6 tests (2 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/eval/narrate.js src/eval/narrate.test.js
git commit -m "eval: add validateAiScore for candidate AI health/concentration responses"
```

---

### Task 2: `factsHash()` — pure hash of the raw facts driving a narration decision

**Files:**
- Modify: `src/eval/narrate.js`
- Test: `src/eval/narrate.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `export function factsHash(portfolioId, grounding)` → `string` (8 hex chars). Stable
  for identical inputs; changes when `grounding.household`, any position's `weightPct`/`riskDelta`,
  any country signal's `riskDelta`, or `grounding.policyStance` changes. `grounding` shape:
  `{ household: boolean, positions: [{ instrumentId, weightPct, riskDelta, ... }], countrySignals:
  [{ iso3, riskDelta, ... }], policyStance: number|null, fallbackConcentration: {...} }` — later
  tasks build the full shape; this task only needs the four fields it reads.

- [ ] **Step 1: Write the failing test**

Add to `src/eval/narrate.test.js`, and add a shared `grounding` fixture used by this and later
tasks — put this fixture near the top of the file, right after the existing `ce` constant:

```js
const grounding = {
  household: false,
  positions: [{ instrumentId: "TSM", name: "TSMC", weightPct: 12, riskDelta: 18,
    countries: [{ iso3: "TWN", weight: 1 }] }],
  countrySignals: [{ iso3: "TWN", name: "Taiwan", riskDelta: 18 }],
  fallbackConcentration: { pct: 41, countries: ["TWN"] },
  policyStance: null
};
```

Add the test:

```js
test("factsHash changes when household toggles, stays stable otherwise", () => {
  const h1 = factsHash("p1", grounding);
  const h2 = factsHash("p1", { ...grounding, household: true });
  const h3 = factsHash("p1", grounding);
  assert.notEqual(h1, h2);
  assert.equal(h1, h3);
});

test("factsHash changes when a position's risk delta changes", () => {
  const h1 = factsHash("p1", grounding);
  const moved = { ...grounding, positions: [{ ...grounding.positions[0], riskDelta: 40 }] };
  assert.notEqual(h1, factsHash("p1", moved));
});
```

Update the import line to include `factsHash`:

```js
import { templateNarration, narrateClient, validateAiScore, factsHash } from "./narrate.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/eval/narrate.test.js`
Expected: FAIL — `factsHash is not a function`.

- [ ] **Step 3: Implement `factsHash`**

Add to `src/eval/narrate.js`, below `validateAiScore`:

```js
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function factsHash(portfolioId, grounding) {
  const basis = JSON.stringify({
    id: portfolioId,
    household: grounding.household,
    positions: grounding.positions.map(p => [p.instrumentId, p.weightPct, Math.round(p.riskDelta)]),
    countrySignals: grounding.countrySignals.map(c => [c.iso3, Math.round(c.riskDelta)]),
    policyStance: grounding.policyStance
  });
  return fnv1a(basis);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/eval/narrate.test.js`
Expected: PASS — 8 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/eval/narrate.js src/eval/narrate.test.js
git commit -m "eval: add factsHash, a raw-inputs hash for the narration re-ask gate"
```

---

### Task 3: `templateNarration()` returns health/concentration/provenance

**Files:**
- Modify: `src/eval/narrate.js`
- Test: `src/eval/narrate.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `templateNarration(clientEval, portfolio, fallbackConcentration)` now returns
  `{ health, healthBand, concentration, scoreSource: "deterministic", thesis, summary }` instead
  of `{ thesis, summary }`. `health`/`healthBand` pass through from `clientEval` unchanged.
  `concentration` passes through the `fallbackConcentration` argument unchanged.

- [ ] **Step 1: Update the existing test to assert the new fields**

In `src/eval/narrate.test.js`, replace the existing first test:

```js
test("templateNarration produces a thesis + summary with no imperative verbs", () => {
  const { thesis, summary } = templateNarration(ce, p);
  assert.ok(thesis.length > 20 && summary.length > 20);
  for (const v of ["buy ", "sell ", "execute ", "switch "]) {
    assert.ok(!(`${thesis} ${summary}`.toLowerCase().includes(v)));
  }
  assert.ok(/watch|strained|strong/.test(summary));
});
```

with:

```js
test("templateNarration produces a thesis + summary with no imperative verbs", () => {
  const { thesis, summary, health, healthBand, concentration, scoreSource } =
    templateNarration(ce, p, grounding.fallbackConcentration);
  assert.ok(thesis.length > 20 && summary.length > 20);
  for (const v of ["buy ", "sell ", "execute ", "switch "]) {
    assert.ok(!(`${thesis} ${summary}`.toLowerCase().includes(v)));
  }
  assert.ok(/watch|strained|strong/.test(summary));
  assert.equal(health, ce.health);
  assert.equal(healthBand, ce.healthBand);
  assert.deepEqual(concentration, grounding.fallbackConcentration);
  assert.equal(scoreSource, "deterministic");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/eval/narrate.test.js`
Expected: FAIL — `health`/`healthBand`/`concentration`/`scoreSource` are `undefined`.

- [ ] **Step 3: Update `templateNarration`**

In `src/eval/narrate.js`, change the function signature and return statement (the body that
builds `thesis`/`summary` is unchanged — only the signature and the `return` line change):

```js
export function templateNarration(clientEval, portfolio, fallbackConcentration) {
  const goals = (portfolio.goals || []).map(g => g.name).slice(0, 3).join(", ");
  const thesis =
    `A ${portfolio.mandate.toLowerCase()} mandate on a ${(portfolio.riskProfile || "").toLowerCase()} profile (${portfolio.riskBand}). ` +
    `The book is built to fund ${goals || "the client's stated objectives"}, and the position mix reflects that horizon.`;
  const topRisk = (clientEval.risks || []).slice().sort((a, b) => b.urgency - a.urgency)[0];
  const summary =
    `Health reads ${clientEval.healthBand} (${Math.round(clientEval.health)}/100). ` +
    (topRisk ? `The item that matters this week: ${topRisk.text}` : `Nothing this week requires a decision before the next review.`);
  return {
    health: clientEval.health, healthBand: clientEval.healthBand,
    concentration: fallbackConcentration, scoreSource: "deterministic",
    thesis, summary
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/eval/narrate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/eval/narrate.js src/eval/narrate.test.js
git commit -m "eval: templateNarration returns health/concentration/scoreSource"
```

---

### Task 4: `narrateClient()` asks the model to compute health/concentration

**Files:**
- Modify: `src/eval/narrate.js`
- Test: `src/eval/narrate.test.js`

**Interfaces:**
- Consumes: `validateAiScore` (Task 1), `HEALTH_BANDS` from `./rubric.js` (already used
  elsewhere in this codebase — same import as `clientEval.js`).
- Produces: `narrateClient(clientEval, portfolio, rmNotes = [], grounding)` now returns
  `{ health, healthBand, concentration: { pct, countries }, scoreSource: "ai" | "deterministic",
  thesis, summary }`. On any failure or invalid response it returns exactly what
  `templateNarration(clientEval, portfolio, grounding?.fallbackConcentration)` returns.

- [ ] **Step 1: Update the existing test to assert the new fields**

In `src/eval/narrate.test.js`, replace the second existing test:

```js
test("narrateClient falls back to the template when the LLM is unavailable", async () => {
  // no server in node:test → generateBrief returns { ok:false }
  const r = await narrateClient(ce, p, ["client wants the 2027 goal de-risked"]);
  assert.ok(r.thesis && r.summary);
});
```

with:

```js
test("narrateClient falls back to the template when the LLM is unavailable", async () => {
  // no server in node:test → generateBrief's fetch("/api/llm") throws (no base URL) → { ok:false }
  const r = await narrateClient(ce, p, ["client wants the 2027 goal de-risked"], grounding);
  assert.ok(r.thesis && r.summary);
  assert.equal(r.health, ce.health);
  assert.deepEqual(r.concentration, grounding.fallbackConcentration);
  assert.equal(r.scoreSource, "deterministic");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/eval/narrate.test.js`
Expected: FAIL — `r.health`/`r.concentration`/`r.scoreSource` are `undefined` (current
`narrateClient` still returns only `{ thesis, summary }` on its fallback path).

- [ ] **Step 3: Update `narrateClient` and the SYSTEM/SCHEMA constants**

In `src/eval/narrate.js`, add the import at the top of the file:

```js
import { HEALTH_BANDS } from "./rubric.js";
```

Replace the `SYSTEM` and `SCHEMA` constants:

```js
const SYSTEM =
  "You write a relationship manager's internal briefing and score the portfolio. " +
  "Arrange only the facts given — never invent a position, signal, or country. " +
  "No client-facing advice, never the words buy / sell / execute / switch. " +
  "Compute `health` (0-100, overall portfolio health) and `concentration` (risk-weighted " +
  "concentration of deteriorating exposure, 0-100, plus the driving countries) from the numbers " +
  "given — do not just describe them qualitatively. `concentration.countries` must only contain " +
  "country codes present in the facts. Two short paragraphs for thesis/summary. Return JSON only.";
const SCHEMA = {
  health: "number 0-100 — overall portfolio health given the facts",
  concentration: {
    pct: "number 0-100 — risk-weighted concentration of deteriorating exposure",
    countries: "array of ISO3 codes present in the facts, most significant first"
  },
  thesis: "string — what the portfolio is built to do",
  summary: "string — where it stands now"
};
```

Replace the whole `narrateClient` function:

```js
export async function narrateClient(clientEval, portfolio, rmNotes = [], grounding) {
  const fallback = () => templateNarration(clientEval, portfolio, grounding?.fallbackConcentration);
  const facts = {
    client: { name: portfolio.name, mandate: portfolio.mandate, riskProfile: portfolio.riskProfile, riskBand: portfolio.riskBand },
    household: grounding?.household ?? false,
    positions: grounding?.positions ?? [],
    countrySignals: grounding?.countrySignals ?? [],
    goals: (portfolio.goals || []).map(g => ({ name: g.name, horizon: g.horizon, baseFunded: g.baseFunded })),
    lombard: portfolio.lombard ? { headroomPct: portfolio.lombard.headroomPct } : null,
    risks: (clientEval.risks || []).map(r => r.text),
    opportunities: (clientEval.opportunities || []).map(o => o.text),
    rmNotes
  };
  let res;
  try {
    res = await generateBrief({ system: SYSTEM, prompt: `Facts:\n${JSON.stringify(facts, null, 2)}`, schema: SCHEMA });
  } catch {
    return fallback();
  }
  const countryCodes = (grounding?.countrySignals ?? []).map(c => c.iso3);
  if (res.ok && validateAiScore(res.data, countryCodes)) {
    const health = res.data.health;
    const healthBand = health >= HEALTH_BANDS.strong ? "strong" : health >= HEALTH_BANDS.watch ? "watch" : "strained";
    return {
      health, healthBand,
      concentration: { pct: res.data.concentration.pct, countries: res.data.concentration.countries },
      scoreSource: "ai",
      thesis: res.data.thesis, summary: res.data.summary
    };
  }
  return fallback();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/eval/narrate.test.js`
Expected: PASS — all tests in the file (10 total across Tasks 1-4).

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS — `clientEval.test.js`, `evaluate.test.js`, `store.test.js`, and the rest are
untouched by this plan and should be unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/eval/narrate.js src/eval/narrate.test.js
git commit -m "eval: narrateClient asks the model to compute health + concentration"
```

---

### Task 5: `main.js` — build grounding, widen the narration cache, wire household toggle

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `narrateClient`, `factsHash` from `./eval/narrate.js` (Tasks 2 & 4); `rows`,
  `concentration` from `./store.js` (already exported, unchanged).
- Produces: `S.evaluation.clients[id]` gains `concentration` and `scoreSource` once narration has
  resolved at least once for that client (both `undefined` until then — read with `??`, mirroring
  how `thesis`/`summary` already start `null`). `S.narratedHash[id]` grows to
  `{ hash, health, healthBand, concentration, scoreSource, thesis, summary }`.

- [ ] **Step 1: Add `rows` and `concentration` to the store.js import**

In `src/main.js`, change:

```js
import { S } from "./store.js";
```

to:

```js
import { S, rows, concentration } from "./store.js";
```

- [ ] **Step 2: Add `factsHash` to the narrate.js import**

Change:

```js
import { narrateClient } from "./eval/narrate.js";
```

to:

```js
import { narrateClient, factsHash } from "./eval/narrate.js";
```

- [ ] **Step 3: Add `buildGrounding()`**

Add this function above `maybeNarrateOpenClient` (right after the existing `rmNotesFor` function):

```js
/** Everything narrateClient needs to compute health/concentration, but no store import in narrate.js. */
function buildGrounding() {
  const list = rows();
  const positions = list.map(r => ({
    instrumentId: r.instrumentId,
    name: r.name,
    weightPct: r.weightPct,
    riskDelta: r.riskDelta,
    countries: r.inst?.exposures?.length
      ? r.inst.exposures.map(e => ({ iso3: e.iso3, weight: e.weight }))
      : [{ iso3: r.iso3, weight: 1 }]
  }));
  const isos = new Set(positions.flatMap(p => p.countries.map(c => c.iso3)));
  const countrySignals = [...isos].filter(iso => S.signals[iso]).map(iso => ({
    iso3: iso, name: S.signals[iso].name || iso, riskDelta: S.signals[iso].riskDelta
  }));
  return {
    household: S.household,
    positions,
    countrySignals,
    fallbackConcentration: concentration(),
    policyStance: S.policyScan?.signal?.stanceScore ?? null
  };
}
```

- [ ] **Step 4: Rewrite `maybeNarrateOpenClient`**

Replace the whole function body:

```js
async function maybeNarrateOpenClient() {
  const id = S.portfolio?.id;
  const ev = S.evaluation?.clients?.[id];
  if (!ev) return;
  const grounding = buildGrounding();
  const hash = factsHash(id, grounding);

  const cached = S.narratedHash[id];
  if (cached?.hash === hash) {
    if (ev.thesis !== cached.thesis) {
      ev.thesis = cached.thesis; ev.summary = cached.summary;
      ev.health = cached.health; ev.healthBand = cached.healthBand;
      ev.concentration = cached.concentration; ev.scoreSource = cached.scoreSource;
      paintExplanation(); paintEvidence();
    }
    return;
  }

  const key = `${id}|${hash}`;
  if (inflight.has(key)) return; // same client, same facts, already asking
  inflight.add(key);
  let narrated;
  try {
    narrated = await narrateClient(ev, S.portfolio, rmNotesFor(S.portfolio), grounding);
  } finally {
    inflight.delete(key);
  }

  // A poll (or a household toggle) may have moved the facts mid-await: an answer for
  // superseded facts is discarded — whatever triggered the change makes its own call.
  const live = S.evaluation?.clients?.[id];
  if (!live || factsHash(id, buildGrounding()) !== hash) return;
  S.narratedHash[id] = { hash, ...narrated };
  live.thesis = narrated.thesis; live.summary = narrated.summary;
  live.health = narrated.health; live.healthBand = narrated.healthBand;
  live.concentration = narrated.concentration; live.scoreSource = narrated.scoreSource;
  if (S.portfolio?.id === id) { paintExplanation(); paintEvidence(); }
}
```

Update the doc comment directly above it (currently describes the old thesis/summary-only
behavior) to:

```js
/**
 * Narration is the only LLM call: one client — the one on screen — and only when its facts
 * actually moved (positions, signals, the household toggle, or the policy scan). It now also
 * carries health and the risk-weighted concentration figure, not just prose — both fall back to
 * the deterministic values in `grounding`/`clientEval` if the call fails or the response doesn't
 * validate. Each evaluation mints fresh client objects with `thesis: null`, so the answer is
 * cached in `S.narratedHash` (portfolioId → { hash, health, healthBand, concentration,
 * scoreSource, thesis, summary }) and copied back onto the live object; an unchanged hash never
 * reaches the model. `inflight` makes that guarantee hold for calls that overlap in time, not
 * just in sequence.
 */
```

- [ ] **Step 5: Wire the household toggle to re-narrate**

Inside `renderAll()`, change:

```js
paintHead(() => { S.household = !S.household; S.selIso = null; renderAll(); });
```

to:

```js
paintHead(() => { S.household = !S.household; S.selIso = null; renderAll(); maybeNarrateOpenClient(); });
```

- [ ] **Step 6: Manual verification**

There's no automated test harness for `main.js` (no jsdom in this repo — it's verified by running
the app, same as every other file in `src/ui/` and `main.js` itself). Start the app and the API
server together, then exercise the change:

```bash
npm run dev:all
```

Open `http://localhost:5173` in a browser. Open the browser console and confirm:

1. `S.evaluation.clients[S.portfolio.id].scoreSource` is `undefined` immediately after load (no
   narration has resolved yet) — the app must still show a health number and a concentration
   figure at this point (Task 6/7 add the UI read side; until those tasks land, the UI still
   reads the old fields, so nothing visibly changes yet — this step is confirming `main.js`'s
   plumbing runs without throwing).
2. Wait a few seconds (narration is async) and re-check the same expression — once your
   `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is configured, it becomes `"ai"`; check
   `S.evaluation.clients[S.portfolio.id].concentration` is now `{ pct, countries }`.
3. Toggle the household switch (if the open portfolio has one) and confirm, via the Network tab,
   that a new `/api/llm` request fires — this is the household-reactivity fix from Step 5.
4. No console errors on load, on portfolio switch, or on household toggle.

- [ ] **Step 7: Commit**

```bash
git add src/main.js
git commit -m "main: build grounding for narration, widen the cache, react to household toggle"
```

---

### Task 6: `panels.js` — read the AI concentration, show its provenance

**Files:**
- Modify: `src/ui/panels.js`

**Interfaces:**
- Consumes: `S.evaluation.clients[id].concentration`/`.scoreSource` (Task 5); `.mode.ai` CSS class
  (Task 8 — the class name is used here first; the app still renders correctly without the rule,
  just unstyled, so task order doesn't block this one).

- [ ] **Step 1: Update `paintEvidence`**

Replace the whole function:

```js
export function paintEvidence() {
  const ev = S.evaluation?.clients?.[S.portfolio.id];
  const g = S.goalSel ? goals().find(x => x.id === S.goalSel) : null;
  if (g) {
    document.getElementById("ev-k").textContent = "This goal moved";
    document.getElementById("ev-v").textContent = fmtD(g.change) + " pts";
    const drv = g.contributions.slice(0, 3).map(c => c.instrumentId).join(" · ");
    document.getElementById("ev-s").innerHTML =
      `this week, driven by<br><span style="font-family:var(--mono);color:var(--ink-2)">${drv || "no market driver"}</span>`;
    M.once("evid", "g:" + g.id + ":" + g.change, M.evidence);
    return;
  }
  const c = ev?.concentration ?? concentration();
  const src = ev?.scoreSource === "ai" ? "ai" : "deterministic";
  document.getElementById("ev-k").textContent = "Risk-weighted concentration";
  document.getElementById("ev-v").textContent = c.pct + "%";
  document.getElementById("ev-s").innerHTML =
    `of deteriorating exposure in three countries<br><span style="font-family:var(--mono);color:var(--ink-2)">${c.countries.join(" · ")}</span>
    <span class="mode ${src === "ai" ? "ai" : ""}" style="margin-left:6px">${src === "ai" ? "ai-scored" : "deterministic"}</span>`;
  M.once("evid", "c:" + S.portfolio.id + ":" + c.pct, M.evidence);
}
```

(Only the body changed: added the `ev` lookup at the top, changed the `c`/added `src` in the
non-goal branch, and appended the provenance `<span>`. The goal-selected branch is untouched.)

- [ ] **Step 2: Manual verification**

With `npm run dev:all` still running, reload the app:

1. With no goal selected, confirm the "Risk-weighted concentration" card shows a small tag reading
   "deterministic" immediately on load, and (after narration resolves, per Task 5 Step 6.2)
   flips to "ai-scored" without a page reload.
2. Select a goal and confirm the card switches to the "This goal moved" copy with no provenance
   tag (unchanged branch) — no console error.
3. No layout break: the tag should sit inline after the countries list, wrapping under it if the
   panel is narrow.

- [ ] **Step 3: Commit**

```bash
git add src/ui/panels.js
git commit -m "panels: read AI-scored concentration with a provenance tag, deterministic fallback"
```

---

### Task 7: `segments.js` — provenance tag next to the health band

**Files:**
- Modify: `src/ui/segments.js`

**Interfaces:**
- Consumes: `S.evaluation.clients[id].scoreSource`/`.health`/`.healthBand` (Task 5 — `.health`/
  `.healthBand` are read the same way as before this plan; only the new tag is added).

- [ ] **Step 1: Update the health block in `paintExplanation`**

Replace this line in `paintExplanation` (inside the template literal building `#seg-explanation`):

```js
    <div class="health"><div class="health-dial health-${e.healthBand}"><span>${Math.round(e.health)}</span></div>
      <div><div class="health-band">${e.healthBand}</div>
        <div class="health-drivers">${e.drivers.slice(0, 3).map(d => `<span>${d.label}</span>`).join("")}</div></div></div>
```

with:

```js
    <div class="health"><div class="health-dial health-${e.healthBand}"><span>${Math.round(e.health)}</span></div>
      <div><div class="health-band">${e.healthBand}
          <span class="mode ${e.scoreSource === "ai" ? "ai" : ""}" style="margin-left:6px">${e.scoreSource === "ai" ? "ai-scored" : "deterministic"}</span>
        </div>
        <div class="health-drivers">${e.drivers.slice(0, 3).map(d => `<span>${d.label}</span>`).join("")}</div></div></div>
```

- [ ] **Step 2: Manual verification**

With `npm run dev:all` running, reload the app and confirm the health dial's band label now shows
a small "deterministic" tag on first load, flipping to "ai-scored" once narration resolves for the
open client — matching the concentration card's tag from Task 6. No console error, no visible
layout break in the Explanation segment.

- [ ] **Step 3: Commit**

```bash
git add src/ui/segments.js
git commit -m "segments: provenance tag on the health dial"
```

---

### Task 8: `styles.css` — `.mode.ai`

**Files:**
- Modify: `src/ui/styles.css`

**Interfaces:**
- Consumes: nothing. Produces: the `.mode.ai` class used by Tasks 6 and 7 (the base `.mode` class
  and `.mode.fixtures`/`.mode.live` already exist and are unchanged).

- [ ] **Step 1: Add the rule**

Find these two existing lines:

```css
.mode.live{color:var(--good); border-color:#1f5236}
.mode.fixtures{color:var(--warn); border-color:#5b4a1c}
```

Add immediately after:

```css
.mode.ai{color:var(--good); border-color:#1f5236}
```

(Same treatment as `.mode.live` — both mean "this figure came from a live source, not a static
fixture/fallback".)

- [ ] **Step 2: Manual verification**

Reload the app. The "ai-scored" tags added in Tasks 6/7 should render in the same teal/green as
the ticker's "live feed" tag once they appear; "deterministic" (no `.ai` class) stays the neutral
default `.mode` color.

- [ ] **Step 3: Commit**

```bash
git add src/ui/styles.css
git commit -m "styles: .mode.ai for the ai-scored provenance tag"
```

---

### Task 9: Full suite + end-to-end pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS — every test in `src/eval/`, `src/market/`, `src/store.test.js`.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: builds with no errors (mirrors how the merge earlier in this session was verified).

- [ ] **Step 3: End-to-end manual pass**

With `npm run dev:all` running and `TINYFISH_API_KEY`/`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set
in `.env`:

1. Load the app, open a portfolio with a household toggle and at least one flagged position.
2. Confirm both tags read "deterministic" immediately, then both flip to "ai-scored" within a few
   seconds, and the concentration % / health number may change slightly from what was shown
   deterministically (expected — it's now an independent AI read).
3. Toggle household on/off twice; confirm each toggle re-triggers narration (Network tab shows a
   new `/api/llm` call) and the concentration card updates accordingly.
4. Switch to a second portfolio, then back to the first, within a couple of seconds; confirm no
   duplicate in-flight `/api/llm` calls for the same portfolio+facts (the `inflight` de-dupe from
   Task 5 holds).
5. Temporarily unset the LLM keys in `.env`, restart `node server/index.js`, reload: confirm both
   tags stay "deterministic" and both numbers match what `clientEval()`/`concentration()` would
   show directly in the console — the fallback path never leaves a blank or stale number.

- [ ] **Step 4: Update the spec status**

In `docs/superpowers/specs/2026-09-04-ai-scored-health-concentration-design.md`, no change needed
— it's already `Status: approved for planning`. Leave as-is; this repo doesn't mark specs
"implemented" separately.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "ai-scored health/concentration: verified end-to-end" --allow-empty
```
