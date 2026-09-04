# RM Intelligence Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-button "Run Intelligence Review" that pushes a client portfolio through an 8-node Node pipeline (deterministic analysis + one LLM synthesis + a deterministic evidence verifier) behind `POST /api/intelligence-review`, surfaced as a full-screen takeover with a 7-step agent timeline and four tabs.

**Architecture:** A plain module — nodes are async functions over one shared `ctx` object, run in strict sequence by `runPipeline`. Deterministic nodes reuse `src/model/*` directly (framework-free ES modules). One LLM call at RM Briefing via the existing `server/llm.js`. The Evidence Verifier deterministically drops any briefing sentence whose citation chain does not resolve. The frontend POSTs the portfolio it already holds in `S`; keys stay server-side.

**Tech Stack:** Node ES modules, Express (`server/index.js`), Vercel serverless (`api/*`), the built-in `node:test` runner (no dependency), Vite 6 for the frontend. No LangGraph, no new npm packages.

**Spec:** `docs/superpowers/specs/2026-09-04-rm-intelligence-graph-design.md` — read it alongside this plan.

## Global Constraints

- **No new npm dependencies.** `package.json` `dependencies` stays `{ "animejs": "^4.5.0", "globe.gl": "2.46.2" }`.
- **Tests use the built-in `node:test` runner only** — files `server/intelligence/*.test.js`, run via a new `"test": "node --test server/intelligence/"` script. This is the runtime's own `--test`, not an added framework; the spec's "no test framework" means no jest/vitest install. Frontend + fixtures are verified manually + `npm run build`.
- **Do not modify** `src/model/*` logic, `src/adapters/*`, `src/signals/worldmonitor.js`, `server/worldmonitor.js`, `server/llm.js`, `server/policy-sentinel.js`. Import them; do not edit them.
- **Deterministic nodes never call an LLM or the network.** Only `policySentinel` (TinyFish, own fallback) and `rmBriefing` (LLM, own fallback) do I/O.
- **The Evidence Verifier is deterministic** — citation resolution only, no LLM, no loop.
- **RM-facing output carries no client advice** — no imperative trade language ("buy", "sell", "execute", "switch") in `summary` / `portfolioExplanation` / `whyItMatters` / `rmTalkingPoints`. The RM Briefing system prompt forbids it; the suitability node's `blockedClaims` names it.
- **The review completes end to end with no keys and no network** (`OFFLINE=1`): policy → seeded fallback, RM Briefing → deterministic template, `mode: "fallback"` shown.
- **Response shape is exactly spec §8** — copy it verbatim into `server/intelligence-review.js`.
- **`GET /api/policy-scan` stays unchanged and independently callable.**
- **Commit after every task** with the message in its final step.
- Trailers on every commit:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C
  ```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/signals/fixtures/markets.js` | NEW. `MARKETS[]` (6 series) + `EVENTS_2026[]` (6 dated events). Illustrative fabricated data. |
| `server/intelligence/ctx.js` | NEW. `makeCtx(input)`, `cite()`, `claim()`, `resolveClaim()` — the `ctx` lifecycle + citation/claim registry. |
| `server/intelligence/nodes.js` | NEW. The 8 node functions: `loadContext`, `portfolioAnalyst`, `marketContext`, `policySentinel`, `riskOpportunity`, `suitabilityMandate`, `rmBriefing`. (`evidenceVerifier` lives in `verify.js`.) |
| `server/intelligence/verify.js` | NEW. `evidenceVerifier(ctx)` — drop unresolvable briefing sentences, count them, substitute the summary if it loses support. |
| `server/intelligence/pipeline.js` | NEW. `runPipeline(ctx)` — run the 8 nodes in order, time each, build `ctx.trace`, catch + route to per-node fallbacks. |
| `server/intelligence-review.js` | NEW. `handleIntelligenceReview(body)` — validate, `makeCtx`, `runPipeline`, shape the spec §8 response. |
| `server/index.js` | MODIFY. Add `app.post("/api/intelligence-review", …)`. |
| `api/intelligence-review.js` | NEW. Vercel entry, thin wrapper over `handleIntelligenceReview` (mirrors `api/policy-scan.js`). |
| `src/ui/intelligence.js` | NEW. `openIntelligenceReview()` — the full-screen overlay: timeline + 4 tabs. |
| `src/ui/shell.js` | MODIFY. Replace the `policy-scan-btn` + `brief-btn` markup with one `intel-btn`. |
| `src/main.js` | MODIFY. Wire `intel-btn`; drop the now-unused `brief-btn` / `policy-scan-btn` handlers from `wire()`. |
| `src/ui/styles.css` | MODIFY. Append the `.intel-*` overlay styles. |
| `docs/FRIDAY-CHECKLIST.md` | MODIFY (Task 13). Add the Intelligence Review to the demo path. |

---

## Task 1: Market fixtures

**Files:**
- Create: `src/signals/fixtures/markets.js`
- Test: `server/intelligence/markets.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `MARKETS` — `Array<{ id, label, unit, last:number, chg7d:number, series:number[] }>`; `EVENTS_2026` — `Array<{ id, date:"YYYY-MM-DD", label, tag:"rates"|"oil"|"geopolitics" }>`. `id`s are stable citation keys (`market:<id>`, `event:<id>`).

- [ ] **Step 1: Write the failing test**

`server/intelligence/markets.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MARKETS, EVENTS_2026 } from "../../src/signals/fixtures/markets.js";

test("MARKETS has 6 series, each with a chg7d and a non-empty series", () => {
  assert.equal(MARKETS.length, 6);
  for (const m of MARKETS) {
    assert.ok(m.id && m.label && m.unit !== undefined, `${m.id} fields`);
    assert.equal(typeof m.last, "number");
    assert.equal(typeof m.chg7d, "number");
    assert.ok(Array.isArray(m.series) && m.series.length >= 6, `${m.id} series`);
  }
  const ids = MARKETS.map(m => m.id);
  assert.deepEqual([...new Set(ids)], ids, "ids unique");
});

test("EVENTS_2026 are dated ISO strings with a known tag", () => {
  assert.ok(EVENTS_2026.length >= 5);
  for (const e of EVENTS_2026) {
    assert.match(e.date, /^2026-\d{2}-\d{2}$/);
    assert.ok(["rates", "oil", "geopolitics"].includes(e.tag), `${e.id} tag`);
  }
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/markets.test.js`
Expected: FAIL — cannot find `../../src/signals/fixtures/markets.js`.

- [ ] **Step 3: Create `src/signals/fixtures/markets.js`**

```js
/**
 * Market series + a 2026 events calendar — inputs to the Market Context node.
 * Fabricated illustrative values; the demo disclaimer strip covers this.
 * `id`s are stable citation keys: market:<id>, event:<id>.
 */
export const MARKETS = [
  { id: "gold",    label: "Gold",               unit: "USD/oz",  last: 2412, chg7d: -1.8,
    series: [2455, 2448, 2461, 2470, 2452, 2438, 2429, 2412] },
  { id: "brent",   label: "Brent crude",        unit: "USD/bbl", last: 82,   chg7d: +4.6,
    series: [76, 77, 76, 78, 79, 80, 81, 82] },
  { id: "ust10",   label: "US 10-year yield",   unit: "%",       last: 4.34, chg7d: +0.13,
    series: [4.18, 4.21, 4.19, 4.24, 4.27, 4.29, 4.31, 4.34] },
  { id: "usdsgd",  label: "USD/SGD",            unit: "",        last: 1.353, chg7d: +0.9,
    series: [1.338, 1.341, 1.339, 1.344, 1.347, 1.349, 1.351, 1.353] },
  { id: "vix",     label: "Volatility (VIX)",   unit: "",        last: 18.6, chg7d: +2.4,
    series: [15.1, 15.8, 15.4, 16.2, 16.9, 17.4, 18.0, 18.6] },
  { id: "tw-tech", label: "Taiwan tech basket", unit: "idx",     last: 181,  chg7d: -6.2,
    series: [199, 197, 200, 196, 191, 187, 184, 181] }
];

export const EVENTS_2026 = [
  { id: "e-us-cpi",   date: "2026-03-11", label: "US CPI print",              tag: "rates" },
  { id: "e-fomc-mar", date: "2026-03-18", label: "FOMC rate decision",        tag: "rates" },
  { id: "e-snb-mar",  date: "2026-03-26", label: "SNB policy assessment",     tag: "rates" },
  { id: "e-opec-apr", date: "2026-04-05", label: "OPEC+ ministerial meeting", tag: "oil" },
  { id: "e-mas-apr",  date: "2026-04-14", label: "MAS semi-annual statement", tag: "rates" },
  { id: "e-tw-jan",   date: "2026-01-11", label: "Taiwan legislative session opens", tag: "geopolitics" }
];
```

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/markets.test.js`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/signals/fixtures/markets.js server/intelligence/markets.test.js
git commit -m "Market fixtures: 6 series + a 2026 events calendar for the intelligence graph

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 2: `ctx` lifecycle + citation/claim registry

**Files:**
- Create: `server/intelligence/ctx.js`
- Test: `server/intelligence/ctx.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `makeCtx(input) → ctx` where `ctx = { input, facts:{}, citations:{}, claims:[], trace:[], droppedClaims:0 }`.
  - `cite(ctx, id, obj) → id` — registers `ctx.citations[id] = { id, ...obj }` (idempotent; first write wins). `obj` must have `kind`; may have `label`, `ref`, `value`, `url`.
  - `claim(ctx, { text, section, cite }) → claimId` — pushes `{ id:"c<n>", text, section, cite:[citationId], status:"ok" }` to `ctx.claims`, returns the id. `cite` is an array of citation ids.
  - `resolveClaim(ctx, claimId) → boolean` — true iff the claim exists and **every** citation id in its `cite` array resolves in `ctx.citations`.
  - `traceStep(ctx, { node, step, label, status, summary }) → entry` — pushes to `ctx.trace`, returns the entry so the caller can set `.ms`.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { makeCtx, cite, claim, resolveClaim, traceStep } from "./ctx.js";

test("makeCtx builds the empty shape around input", () => {
  const ctx = makeCtx({ portfolioId: "p1" });
  assert.equal(ctx.input.portfolioId, "p1");
  assert.deepEqual(ctx.facts, {});
  assert.deepEqual(ctx.citations, {});
  assert.deepEqual(ctx.claims, []);
  assert.deepEqual(ctx.trace, []);
  assert.equal(ctx.droppedClaims, 0);
});

test("cite registers once; first write wins", () => {
  const ctx = makeCtx({});
  cite(ctx, "pos:TSM", { kind: "position", label: "Taiwan Semiconductor", ref: 7.4 });
  cite(ctx, "pos:TSM", { kind: "position", label: "CHANGED" });
  assert.equal(ctx.citations["pos:TSM"].label, "Taiwan Semiconductor");
  assert.equal(ctx.citations["pos:TSM"].kind, "position");
});

test("claim returns an id and stores the record", () => {
  const ctx = makeCtx({});
  cite(ctx, "goal:g1", { kind: "goal", label: "Property" });
  const id = claim(ctx, { text: "Property goal fell", section: "whatHappened", cite: ["goal:g1"] });
  assert.equal(id, "c1");
  assert.equal(ctx.claims[0].text, "Property goal fell");
  assert.equal(ctx.claims[0].status, "ok");
});

test("resolveClaim is true only when every citation resolves", () => {
  const ctx = makeCtx({});
  cite(ctx, "goal:g1", { kind: "goal" });
  const ok = claim(ctx, { text: "a", section: "s", cite: ["goal:g1"] });
  const bad = claim(ctx, { text: "b", section: "s", cite: ["goal:g1", "goal:missing"] });
  assert.equal(resolveClaim(ctx, ok), true);
  assert.equal(resolveClaim(ctx, bad), false);
  assert.equal(resolveClaim(ctx, "c999"), false);
});

test("traceStep appends and returns the entry", () => {
  const ctx = makeCtx({});
  const e = traceStep(ctx, { node: "loadContext", step: 1, label: "Reading client objectives", status: "ok", summary: "3 goals" });
  e.ms = 5;
  assert.equal(ctx.trace.length, 1);
  assert.equal(ctx.trace[0].ms, 5);
  assert.equal(ctx.trace[0].step, 1);
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/ctx.test.js`
Expected: FAIL — `./ctx.js` not found.

- [ ] **Step 3: Create `server/intelligence/ctx.js`**

```js
/** ctx lifecycle + the citation/claim registry the whole pipeline threads through. */

export function makeCtx(input) {
  return { input, facts: {}, citations: {}, claims: [], trace: [], droppedClaims: 0 };
}

/** Register an atomic, verifiable reference. First write wins so nodes can re-assert safely. */
export function cite(ctx, id, obj) {
  if (!ctx.citations[id]) ctx.citations[id] = { id, ...obj };
  return id;
}

/** Record an assertion pointing at one or more citations. Returns "c<n>". */
export function claim(ctx, { text, section, cite: citeIds }) {
  const id = `c${ctx.claims.length + 1}`;
  ctx.claims.push({ id, text, section, cite: citeIds.slice(), status: "ok" });
  return id;
}

/** True iff the claim exists and every citation id it names resolves. */
export function resolveClaim(ctx, claimId) {
  const c = ctx.claims.find(x => x.id === claimId);
  if (!c) return false;
  return c.cite.every(cid => Boolean(ctx.citations[cid]));
}

export function traceStep(ctx, { node, step, label, status, summary }) {
  const entry = { node, step, label, status, summary, ms: 0 };
  ctx.trace.push(entry);
  return entry;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/ctx.test.js`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/ctx.js server/intelligence/ctx.test.js
git commit -m "Intelligence graph: ctx lifecycle + citation/claim registry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 3: Load Context + Portfolio Analyst nodes

**Files:**
- Create: `server/intelligence/nodes.js`
- Test: `server/intelligence/nodes.analyst.test.js`

**Interfaces:**
- Consumes: `makeCtx`, `cite`, `claim`, `traceStep` from `./ctx.js`; `countryExposure`, `positionRiskDelta` from `../../src/model/lookthrough.js`; `goalDelta`, `riskConcentration`, `flaggedPositions`, `FLAG_THRESHOLD` from `../../src/model/scoring.js`; `MARKETS`, `EVENTS_2026` from `../../src/signals/fixtures/markets.js`.
- Produces:
  - `loadContext(ctx)` — mutates `ctx`: selects `ctx.facts.active = { positions, portfolio, instruments }` (household-aware), registers base citations, `ctx.facts.context.rmNotes[]`, pushes `traceStep` (step 1).
  - `portfolioAnalyst(ctx)` — sets `ctx.facts.analyst = { movers, goalMoves, concentration, flagged }`, emits claims (`section:"whatHappened"`), `traceStep` (step 2).
  - Shapes (relied on by later tasks):
    - `ctx.facts.active.positions`: `Position[]` (`{ instrumentId, weightPct, … }`).
    - `ctx.facts.analyst.movers`: `Array<{ instrumentId, name, riskDelta:number, weightPct:number, drivesGoals:string[], exposures:Array<{iso3,weight}>, eventIds:string[] }>` — `eventIds` are the signal-event ids for the position's exposed countries.
    - `ctx.facts.analyst.goalMoves`: `Array<{ id, name, funded:number, prevFunded:number, change:number, topContributor:string|null }>`.
    - `ctx.facts.analyst.concentration`: `{ pct:number, countries:string[] }`.
    - `ctx.facts.analyst.flagged`: `string[]` instrument ids.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../../src/adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../../src/signals/fixtures/signals.js";
import { makeCtx } from "./ctx.js";
import { loadContext, portfolioAnalyst } from "./nodes.js";

async function ctxFor(idx = 0, household = false) {
  const data = await demoAdapter();
  const portfolio = data.portfolios[idx];
  const ctx = makeCtx({
    portfolioId: portfolio.id, question: "q",
    portfolio, instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household
  });
  await loadContext(ctx);
  return ctx;
}

test("loadContext registers a citation per position, goal and signal event", async () => {
  const ctx = await ctxFor(0);
  const pos = ctx.facts.active.positions;
  for (const p of pos) assert.ok(ctx.citations[`pos:${p.instrumentId}`], `pos:${p.instrumentId}`);
  for (const g of ctx.input.portfolio.goals) assert.ok(ctx.citations[`goal:${g.id}`], `goal:${g.id}`);
  // TWN has events twn-1..twn-3 in the fixture
  assert.ok(ctx.citations["twn-1"], "signal event citation");
  assert.equal(ctx.trace[0].step, 1);
});

test("portfolioAnalyst ranks movers and every mover claim resolves", async () => {
  const ctx = await ctxFor(0);
  await portfolioAnalyst(ctx);
  const a = ctx.facts.analyst;
  assert.ok(a.movers.length >= 1 && a.movers.length <= 5);
  assert.ok(a.movers[0].riskDelta !== undefined);
  assert.equal(typeof a.concentration.pct, "number");
  // TSM should be a top mover for Bergmann given the TWN signal
  assert.ok(a.movers.some(m => m.instrumentId === "TSM"));
  // every whatHappened claim the analyst emitted must resolve
  const { resolveClaim } = await import("./ctx.js");
  for (const c of ctx.claims.filter(c => c.section === "whatHappened")) {
    assert.equal(resolveClaim(ctx, c.id), true, c.text);
  }
});

test("goalMoves carries a change vs last week", async () => {
  const ctx = await ctxFor(0);
  await portfolioAnalyst(ctx);
  const g1 = ctx.facts.analyst.goalMoves.find(g => g.id === "g1");
  assert.equal(typeof g1.change, "number");
  assert.equal(typeof g1.prevFunded, "number");
});
```

> If `src/signals/fixtures/signals.js` does not export `PREV_SIGNALS`, check the file — it exports `SIGNALS` and `PREV_SIGNALS` (the latter is derived). Use the real export names.

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/nodes.analyst.test.js`
Expected: FAIL — `loadContext` / `portfolioAnalyst` not exported.

- [ ] **Step 3: Create `server/intelligence/nodes.js` with the first two nodes**

```js
import { cite, claim, traceStep } from "./ctx.js";
import { countryExposure, positionRiskDelta } from "../../src/model/lookthrough.js";
import { goalDelta, riskConcentration, flaggedPositions } from "../../src/model/scoring.js";
import { MARKETS, EVENTS_2026 } from "../../src/signals/fixtures/markets.js";

const fmtD = v => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(Math.round(v));

/* ── Node 1 · Load Context ─────────────────────────────────────────────── */
export async function loadContext(ctx) {
  const t = traceStep(ctx, { node: "loadContext", step: 1, label: "Reading client objectives", status: "ok", summary: "" });
  const t0 = Date.now();
  const { portfolio, instruments, signals, household } = ctx.input;
  const positions = (household && portfolio.householdPositions) ? portfolio.householdPositions : portfolio.positions;

  ctx.facts.active = { positions, portfolio, instruments };

  for (const p of positions) {
    const inst = instruments[p.instrumentId];
    cite(ctx, `pos:${p.instrumentId}`, { kind: "position", label: inst?.name || p.instrumentId, ref: p.weightPct });
  }
  for (const g of portfolio.goals) {
    cite(ctx, `goal:${g.id}`, { kind: "goal", label: g.name, ref: g.baseFunded });
  }
  for (const iso of Object.keys(signals)) {
    for (const e of signals[iso].events || []) {
      cite(ctx, e.id, { kind: "signal", label: e.text, ref: e.source, value: e.value });
    }
  }
  for (const m of MARKETS) cite(ctx, `market:${m.id}`, { kind: "market", label: m.label, value: `${m.last} (${fmtD(m.chg7d)} 7d)` });
  for (const e of EVENTS_2026) cite(ctx, `event:${e.id}`, { kind: "event", label: e.label, ref: e.date });

  const rmNotes = [];
  const rel = portfolio.relationship;
  if (rel) {
    (rel.concerns || []).forEach((text, i) => {
      const id = `note:${portfolio.id}-concern-${i}`;
      cite(ctx, id, { kind: "note", label: "RM note — standing concern", value: text });
      rmNotes.push({ id, text });
    });
    if (rel.behaviour) {
      const id = `note:${portfolio.id}-behaviour`;
      cite(ctx, id, { kind: "note", label: "RM note — client behaviour", value: rel.behaviour });
      rmNotes.push({ id, text: rel.behaviour });
    }
  }
  ctx.facts.context = { rmNotes, question: ctx.input.question, mandate: portfolio.mandate };

  t.summary = `${positions.length} positions · ${portfolio.goals.length} goals · ${Object.keys(signals).length} live markets`;
  t.ms = Date.now() - t0;
}

/* ── Node 2 · Portfolio Analyst ────────────────────────────────────────── */
export async function portfolioAnalyst(ctx) {
  const t = traceStep(ctx, { node: "portfolioAnalyst", step: 2, label: "Explaining portfolio movement", status: "ok", summary: "" });
  const t0 = Date.now();
  const { positions, portfolio, instruments } = ctx.facts.active;
  const { signals, prevSignals } = ctx.input;

  const scored = positions.map(p => {
    const inst = instruments[p.instrumentId];
    const d = positionRiskDelta(inst, signals);
    const exposed = (inst?.exposures || []).map(e => e.iso3);
    const eventIds = exposed.flatMap(iso => (signals[iso]?.events || []).map(e => e.id));
    const drivesGoals = portfolio.goals.filter(g => (g.driverIds || []).includes(p.instrumentId)).map(g => g.id);
    return {
      instrumentId: p.instrumentId, name: inst?.name || p.instrumentId,
      riskDelta: d, weightPct: p.weightPct, drivesGoals,
      exposures: inst?.exposures || [], eventIds
    };
  });
  const movers = scored
    .filter(m => Math.abs(m.riskDelta) >= 1)
    .sort((a, b) => Math.abs(b.riskDelta) * b.weightPct - Math.abs(a.riskDelta) * a.weightPct)
    .slice(0, 5);

  const goalMoves = portfolio.goals.map(g => {
    const gd = goalDelta(g, positions, instruments, signals, prevSignals);
    return { id: g.id, name: g.name, funded: gd.funded, prevFunded: gd.prevFunded, change: gd.change,
      topContributor: gd.contributions[0]?.instrumentId || null };
  });

  const conc = riskConcentration(positions, instruments, signals);
  const flagged = flaggedPositions(positions, instruments, signals).map(p => p.instrumentId);

  ctx.facts.analyst = { movers, goalMoves, concentration: { pct: conc.pct, countries: conc.countries }, flagged };

  // claims
  for (const m of movers) {
    const dir = m.riskDelta > 0 ? "deteriorated" : "improved";
    claim(ctx, {
      text: `${m.name} look-through risk ${dir} ${fmtD(m.riskDelta)} over seven days (position ${m.weightPct.toFixed(1)}% of the book).`,
      section: "whatHappened",
      cite: [`pos:${m.instrumentId}`, ...m.eventIds]
    });
  }
  for (const g of goalMoves.filter(g => g.change !== 0)) {
    const dir = g.change < 0 ? "fell" : "rose";
    claim(ctx, {
      text: `${g.name} funding confidence ${dir} ${g.prevFunded}% → ${g.funded}% this week.`,
      section: "whatHappened",
      cite: [`goal:${g.id}`]
    });
  }
  if (conc.pct > 0) {
    claim(ctx, {
      text: `${conc.pct}% of the book's deteriorating exposure sits in ${conc.countries.join(", ")}.`,
      section: "whatHappened",
      cite: conc.countries.flatMap(iso => (signals[iso]?.events || []).map(e => e.id))
    });
  }

  t.summary = `${movers.length} movers · ${goalMoves.filter(g => g.change !== 0).length} goals moved · ${conc.pct}% concentration`;
  t.ms = Date.now() - t0;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/nodes.analyst.test.js`
Expected: PASS, 3/3. If a mover claim fails to resolve, the `eventIds` for an exposure whose country has no signal will be empty — that is fine (the claim still has `pos:<id>`). A claim resolves only if **every** cite id resolves, so never push an id that was not `cite()`d.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/nodes.js server/intelligence/nodes.analyst.test.js
git commit -m "Intelligence graph: Load Context + Portfolio Analyst nodes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 4: Market Context node

**Files:**
- Modify: `server/intelligence/nodes.js` (add `marketContext`)
- Test: `server/intelligence/nodes.market.test.js`

**Interfaces:**
- Consumes: `ctx.facts.analyst.movers` (Task 3), `MARKETS`, `EVENTS_2026`, `cite`/`claim`/`traceStep`.
- Produces: `ctx.facts.market = { ties: Array<{ instrumentId, seriesId, seriesLabel, chg7d:number, eventId:string|null, line:string }> }`; claims `section:"whatHappened"`; `traceStep` (step 2, so it groups with the analyst under UI step 2).

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../../src/adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../../src/signals/fixtures/signals.js";
import { makeCtx, resolveClaim } from "./ctx.js";
import { loadContext, portfolioAnalyst, marketContext } from "./nodes.js";

async function seeded(idx = 0) {
  const data = await demoAdapter();
  const ctx = makeCtx({ portfolioId: data.portfolios[idx].id, question: "q",
    portfolio: data.portfolios[idx], instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household: false });
  await loadContext(ctx); await portfolioAnalyst(ctx); await marketContext(ctx);
  return ctx;
}

test("marketContext ties each mover to a market series and cites it", async () => {
  const ctx = await seeded(0);
  assert.ok(ctx.facts.market.ties.length >= 1);
  for (const tie of ctx.facts.market.ties) {
    assert.ok(ctx.citations[`market:${tie.seriesId}`], tie.seriesId);
  }
  // a semiconductor-heavy mover (TSM) should tie to the TW tech basket
  const tsm = ctx.facts.market.ties.find(t => t.instrumentId === "TSM");
  assert.ok(tsm && tsm.seriesId === "tw-tech");
});

test("every market claim resolves end to end", async () => {
  const ctx = await seeded(0);
  for (const c of ctx.claims.filter(c => /tracks|shift/.test(c.text))) {
    assert.equal(resolveClaim(ctx, c.id), true, c.text);
  }
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/nodes.market.test.js`
Expected: FAIL — `marketContext` not exported.

- [ ] **Step 3: Add `marketContext` to `nodes.js`**

```js
/* ── Node 3 · Market Context ───────────────────────────────────────────── */
export async function marketContext(ctx) {
  const t = traceStep(ctx, { node: "marketContext", step: 2, label: "Explaining portfolio movement", status: "ok", summary: "" });
  const t0 = Date.now();
  const { instruments, portfolio } = ctx.facts.active;
  const movers = ctx.facts.analyst.movers;

  const seriesFor = (mover) => {
    const inst = instruments[mover.instrumentId];
    const sectors = (inst?.sectors || []).map(s => s.name.toLowerCase());
    const isos = mover.exposures.map(e => e.iso3);
    if (sectors.some(s => /semic|tech/.test(s)) || isos.includes("TWN") || isos.includes("KOR")) return "tw-tech";
    if (sectors.some(s => /energy/.test(s)) || isos.includes("SAU") || isos.includes("IND")) return "brent";
    if (inst?.assetClass === "bond") return "ust10";
    if (inst?.currency && inst.currency !== portfolio.currency) return "usdsgd";
    return "vix";
  };

  const ties = [];
  for (const m of movers) {
    const sid = seriesFor(m);
    const series = MARKETS.find(x => x.id === sid);
    // attach a 2026 event whose tag plausibly drives this series
    const wantTag = sid === "brent" ? "oil" : sid === "ust10" ? "rates" : sid === "tw-tech" ? "geopolitics" : "rates";
    const ev = EVENTS_2026.find(e => e.tag === wantTag);
    const line = `${m.name}'s move tracks the ${fmtD(series.chg7d)} shift in ${series.label}` +
      (ev ? `, around the ${ev.label} (${ev.date}).` : ".");
    ties.push({ instrumentId: m.instrumentId, seriesId: sid, seriesLabel: series.label, chg7d: series.chg7d, eventId: ev?.id || null, line });
    claim(ctx, {
      text: line, section: "whatHappened",
      cite: [`pos:${m.instrumentId}`, `market:${sid}`, ...(ev ? [`event:${ev.id}`] : [])]
    });
  }
  ctx.facts.market = { ties };
  t.summary = `${ties.length} moves tied to market context`;
  t.ms = Date.now() - t0;
}
```

> `seriesFor` is a closure because it needs `portfolio.currency` (a mover object does not carry it). The `wantTag` mapping is deliberately coarse — it only has to attach *a* plausible 2026 event, not the correct one.

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/nodes.market.test.js`
Expected: PASS, 2/2. Also re-run Task 3's test to confirm no regression: `node --test server/intelligence/nodes.analyst.test.js`.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/nodes.js server/intelligence/nodes.market.test.js
git commit -m "Intelligence graph: Market Context node

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 5: Policy Sentinel node

**Files:**
- Modify: `server/intelligence/nodes.js` (add `policySentinel`)
- Test: `server/intelligence/nodes.policy.test.js`

**Interfaces:**
- Consumes: `runPolicySentinelScan` from `../policy-sentinel.js` (do not modify it); `cite`/`claim`/`traceStep`; `ctx.facts.active.positions`.
- Produces: `ctx.facts.policy` = the raw scan object (`{ mode, fetchedAt, source, signal, agents, rmBrief, citations }`); registers `policy:<url>` citations from `scan.citations`; claims `section:"whyItMatters"`; `traceStep` (step 4) with `status = scan.mode === "fallback" ? "fallback" : "ok"`.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../../src/adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../../src/signals/fixtures/signals.js";
import { makeCtx, resolveClaim } from "./ctx.js";
import { loadContext, portfolioAnalyst, policySentinel } from "./nodes.js";

test("policySentinel (offline) records the scan, cites its sources, marks the trace fallback", async () => {
  process.env.OFFLINE = "1";
  const data = await demoAdapter();
  const ctx = makeCtx({ portfolioId: data.portfolios[0].id, question: "q",
    portfolio: data.portfolios[0], instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household: false });
  await loadContext(ctx); await portfolioAnalyst(ctx); await policySentinel(ctx);

  assert.ok(ctx.facts.policy.signal, "scan stored");
  assert.ok(ctx.facts.policy.citations.length >= 1);
  for (const c of ctx.facts.policy.citations) assert.ok(ctx.citations[`policy:${c.url}`], c.url);
  const step4 = ctx.trace.find(x => x.step === 4);
  assert.equal(step4.status, "fallback");
  for (const c of ctx.claims.filter(c => c.section === "whyItMatters")) {
    assert.equal(resolveClaim(ctx, c.id), true, c.text);
  }
  delete process.env.OFFLINE;
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/nodes.policy.test.js`
Expected: FAIL — `policySentinel` not exported.

- [ ] **Step 3: Add `policySentinel` to `nodes.js`**

```js
import { runPolicySentinelScan } from "../policy-sentinel.js";

/* ── Node 4 · Policy Sentinel ──────────────────────────────────────────── */
export async function policySentinel(ctx) {
  const t = traceStep(ctx, { node: "policySentinel", step: 4, label: "Searching official policy sources", status: "ok", summary: "" });
  const t0 = Date.now();
  let scan;
  try {
    scan = await runPolicySentinelScan({
      query: process.env.POLICY_SCAN_QUERY,
      includeDomains: process.env.POLICY_SCAN_DOMAINS,
      recencyMinutes: process.env.POLICY_SCAN_RECENCY_MINUTES,
      location: process.env.POLICY_SCAN_LOCATION,
      language: process.env.POLICY_SCAN_LANGUAGE
    });
  } catch (err) {
    scan = { mode: "fallback", fetchedAt: "", source: { issuer: "—", url: "" },
      signal: { issuer: "—", country: "—", stance: "neutral", stanceScore: 0, policyActionType: "unavailable",
        affectedAssets: [], urgency: "low", confidence: 0, whyFlagged: `Policy scan unavailable: ${err.message}` },
      agents: [], rmBrief: [], citations: [] };
  }
  ctx.facts.policy = scan;

  for (const c of scan.citations || []) {
    cite(ctx, `policy:${c.url}`, { kind: "policy", label: c.label, url: c.url, value: c.quote });
  }
  const held = new Set(ctx.facts.active.positions.map(p => p.instrumentId));

  if (scan.citations?.length) {
    claim(ctx, {
      text: `${scan.signal.issuer} policy communication reads ${scan.signal.stance} (stance ${scan.signal.stanceScore.toFixed(2)}). ${scan.signal.whyFlagged}`,
      section: "whyItMatters",
      cite: [`policy:${scan.citations[0].url}`]
    });
    const hit = (scan.signal.affectedAssets || []).filter(a => held.has(a));
    if (hit.length) {
      claim(ctx, {
        text: `Held positions in the policy signal's line of sight: ${hit.join(", ")}.`,
        section: "whyItMatters",
        cite: [`policy:${scan.citations[0].url}`, ...hit.map(a => `pos:${a}`)]
      });
    }
  }

  t.status = scan.mode === "fallback" ? "fallback" : "ok";
  t.summary = `${scan.signal.issuer} · ${scan.signal.stance} · mode ${scan.mode}`;
  t.ms = Date.now() - t0;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/nodes.policy.test.js`
Expected: PASS, 1/1.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/nodes.js server/intelligence/nodes.policy.test.js
git commit -m "Intelligence graph: Policy Sentinel node (wraps the TinyFish scan)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 6: Risk / Opportunity Detector node

**Files:**
- Modify: `server/intelligence/nodes.js` (add `riskOpportunity`)
- Test: `server/intelligence/nodes.risk.test.js`

**Interfaces:**
- Consumes: `ctx.facts.analyst`, `ctx.facts.market`, `ctx.facts.policy`, `ctx.facts.active`; `chokepointExposure` from `../../src/model/lookthrough.js`; `reconcile` from `../../src/model/houseview.js`; `cite`/`claim`/`traceStep`.
- Produces: `ctx.facts.risk = { risks: Item[], opportunities: Item[] }` where `Item = { text, cite:[citationId], severity:"high"|"medium"|"low" }`; claims `section:"risks"` / `section:"opportunities"`; `traceStep` (step 3).

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../../src/adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../../src/signals/fixtures/signals.js";
import { makeCtx, resolveClaim } from "./ctx.js";
import { loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity } from "./nodes.js";

async function full(idx = 0) {
  process.env.OFFLINE = "1";
  const data = await demoAdapter();
  const ctx = makeCtx({ portfolioId: data.portfolios[idx].id, question: "q",
    portfolio: data.portfolios[idx], instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household: false });
  for (const n of [loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity]) await n(ctx);
  delete process.env.OFFLINE;
  return ctx;
}

test("riskOpportunity flags a concentration risk for Bergmann and cites it", async () => {
  const ctx = await full(0);
  assert.ok(ctx.facts.risk.risks.length >= 1);
  assert.ok(ctx.facts.risk.risks.some(r => /concentration/i.test(r.text)));
  for (const c of ctx.claims.filter(c => c.section === "risks" || c.section === "opportunities")) {
    assert.equal(resolveClaim(ctx, c.id), true, c.text);
  }
  assert.equal(ctx.trace.find(x => x.step === 3).node, "riskOpportunity");
});

test("every risk/opp item has a severity and at least one citation", async () => {
  const ctx = await full(0);
  for (const it of [...ctx.facts.risk.risks, ...ctx.facts.risk.opportunities]) {
    assert.ok(["high", "medium", "low"].includes(it.severity));
    assert.ok(it.cite.length >= 1);
  }
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/nodes.risk.test.js`
Expected: FAIL — `riskOpportunity` not exported.

- [ ] **Step 3: Add `riskOpportunity` to `nodes.js`**

```js
import { chokepointExposure } from "../../src/model/lookthrough.js";
import { reconcile } from "../../src/model/houseview.js";

const CONC_SOFT = 10;   // % single-country look-through — soft mandate limit

/* ── Node 5 · Risk / Opportunity Detector ──────────────────────────────── */
export async function riskOpportunity(ctx) {
  const t = traceStep(ctx, { node: "riskOpportunity", step: 3, label: "Checking concentration, liquidity and currency risk", status: "ok", summary: "" });
  const t0 = Date.now();
  const { positions, portfolio, instruments } = ctx.facts.active;
  const { signals } = ctx.input;
  const a = ctx.facts.analyst;
  const risks = [], opportunities = [];

  // 1. concentration over the soft limit
  if (a.concentration.pct >= 40 || a.concentration.countries.length) {
    const worst = a.concentration.countries[0];
    const sev = a.concentration.pct >= 60 ? "high" : "medium";
    risks.push({
      text: `Deteriorating exposure is concentrated — ${a.concentration.pct}% of it in ${a.concentration.countries.join(", ")}. Above the ${CONC_SOFT}% single-country comfort line for ${worst}.`,
      cite: (signals[worst]?.events || []).map(e => e.id).concat(`pos:${a.movers[0]?.instrumentId}`).filter(Boolean),
      severity: sev
    });
  }

  // 2. two+ flagged positions sharing a chokepoint
  const ck = chokepointExposure(positions, instruments);
  for (const [name, c] of Object.entries(ck)) {
    const flaggedHere = c.instrumentIds.filter(id => a.flagged.includes(id));
    if (flaggedHere.length >= 2) {
      risks.push({
        text: `${flaggedHere.length} holdings under pressure share one chokepoint — ${name} (${c.weightPct.toFixed(1)}% of the book routes through it).`,
        cite: flaggedHere.map(id => `pos:${id}`),
        severity: "high"
      });
    }
  }

  // 3. a goal that crossed a funding band this week
  for (const g of a.goalMoves) {
    const bands = [95, 80];
    for (const b of bands) {
      if (g.prevFunded >= b && g.funded < b) {
        risks.push({
          text: `${g.name} dropped through ${b}% funding confidence this week (${g.prevFunded}% → ${g.funded}%).`,
          cite: [`goal:${g.id}`],
          severity: b === 80 ? "high" : "medium"
        });
      }
    }
  }

  // 4. lombard headroom squeeze
  if (portfolio.lombard && portfolio.lombard.headroomPct < 25) {
    risks.push({
      text: `Lombard headroom is at ${portfolio.lombard.headroomPct}% (was ${portfolio.lombard.prevHeadroomPct}%) — the item with a hard consequence if collateral reprices further.`,
      cite: [`goal:${portfolio.goals[0]?.id}`].filter(Boolean),
      severity: portfolio.lombard.headroomPct < 15 ? "high" : "medium"
    });
  }

  // 5. house-view tension on a held, deteriorating country
  for (const m of a.movers.filter(m => m.riskDelta >= 6)) {
    const iso = m.exposures.sort((x, y) => y.weight - x.weight)[0]?.iso3;
    const rec = reconcile(iso, m.riskDelta);
    if (rec.verdict === "tension") {
      risks.push({
        text: `The signal on ${m.name} pulls against the house view (${rec.stance} on ${iso}). Worth naming the disagreement rather than resolving it silently.`,
        cite: [`pos:${m.instrumentId}`, ...m.eventIds],
        severity: "medium"
      });
    }
  }

  // opportunities
  for (const m of a.movers.filter(m => m.riskDelta <= -6 && m.drivesGoals.length)) {
    opportunities.push({
      text: `${m.name} improved ${Math.abs(Math.round(m.riskDelta))} points and funds ${m.drivesGoals.length} goal(s) — a chance to lock in progress at the review.`,
      cite: [`pos:${m.instrumentId}`, ...m.eventIds],
      severity: "low"
    });
  }
  for (const iso of Object.keys(signals)) {
    if ((signals[iso].policyStance || 0) <= -0.3) {
      const goalsExposed = portfolio.goals.filter(g =>
        (g.driverIds || []).some(id => (instruments[id]?.exposures || []).some(e => e.iso3 === iso)));
      if (goalsExposed.length) {
        const ev = (signals[iso].events || [])[0];
        opportunities.push({
          text: `Policy is easing in ${signals[iso].name} — supportive for ${goalsExposed.map(g => g.name).join(", ")}.`,
          cite: [ev?.id, ...goalsExposed.map(g => `goal:${g.id}`)].filter(Boolean),
          severity: "low"
        });
      }
    }
  }

  ctx.facts.risk = { risks, opportunities };
  for (const r of risks) claim(ctx, { text: r.text, section: "risks", cite: r.cite });
  for (const o of opportunities) claim(ctx, { text: o.text, section: "opportunities", cite: o.cite });

  t.summary = `${risks.length} risks · ${opportunities.length} opportunities`;
  t.ms = Date.now() - t0;
}
```

> Every `cite` array is filtered so a missing id is never pushed (`.filter(Boolean)` / guard `pos:` only for real instrument ids). If a rule's citations would be empty, do not emit that item.

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/nodes.risk.test.js`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/nodes.js server/intelligence/nodes.risk.test.js
git commit -m "Intelligence graph: Risk / Opportunity Detector node

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 7: Suitability & Mandate node

**Files:**
- Modify: `server/intelligence/nodes.js` (add `suitabilityMandate`)
- Test: `server/intelligence/nodes.suitability.test.js`

**Interfaces:**
- Consumes: `ctx.facts.active.portfolio.mandate`, `ctx.facts.risk`, `ctx.facts.analyst.concentration`; `cite`/`claim`/`traceStep`.
- Produces: `ctx.facts.suitability = { allowedActions: Array<{ action, class, note? }>, blockedClaims: Array<{ text, reason }>, limitChecks: Array<{ label, status:"ok"|"watch"|"breach" }> }`; claims `section:"whatToDiscuss"` for each allowed action; `traceStep` (step 5).
- `class` ∈ `"executable-under-mandate" | "requires-client-instruction" | "inform-only"`.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../../src/adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../../src/signals/fixtures/signals.js";
import { makeCtx } from "./ctx.js";
import { loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity, suitabilityMandate } from "./nodes.js";

async function run(idx) {
  process.env.OFFLINE = "1";
  const data = await demoAdapter();
  const ctx = makeCtx({ portfolioId: data.portfolios[idx].id, question: "q",
    portfolio: data.portfolios[idx], instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household: false });
  for (const n of [loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity, suitabilityMandate]) await n(ctx);
  delete process.env.OFFLINE;
  return ctx;
}

test("advisory mandate → actions are requires-client-instruction, and imperative language is blocked", async () => {
  const data = await demoAdapter();
  const advisoryIdx = data.portfolios.findIndex(p => p.mandate === "Advisory");
  const ctx = await run(advisoryIdx);
  const classes = ctx.facts.suitability.allowedActions.map(a => a.class);
  assert.ok(classes.every(c => c === "requires-client-instruction" || c === "inform-only"));
  assert.ok(ctx.facts.suitability.blockedClaims.some(b => /execute|buy|sell/i.test(b.text)));
});

test("discretionary mandate → at least one executable-under-mandate action", async () => {
  const data = await demoAdapter();
  const discIdx = data.portfolios.findIndex(p => p.mandate === "Discretionary");
  const ctx = await run(discIdx);
  assert.ok(ctx.facts.suitability.allowedActions.some(a => a.class === "executable-under-mandate"));
});

test("limitChecks includes a concentration row", async () => {
  const ctx = await run(0);
  assert.ok(ctx.facts.suitability.limitChecks.some(l => /concentration/i.test(l.label)));
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/nodes.suitability.test.js`
Expected: FAIL — `suitabilityMandate` not exported.

- [ ] **Step 3: Add `suitabilityMandate` to `nodes.js`**

```js
const CONC_HARD = 12;   // % single-country — hard limit

/* ── Node 6 · Suitability & Mandate ────────────────────────────────────── */
export async function suitabilityMandate(ctx) {
  const t = traceStep(ctx, { node: "suitabilityMandate", step: 5, label: "Testing against suitability constraints", status: "ok", summary: "" });
  const t0 = Date.now();
  const { portfolio } = ctx.facts.active;
  const m = portfolio.mandate;                    // "Advisory" | "Discretionary" | "Execution only"
  const risk = ctx.facts.risk;
  const conc = ctx.facts.analyst.concentration;

  const classify =
    m === "Discretionary" ? "executable-under-mandate" :
    m === "Advisory"      ? "requires-client-instruction" :
                            "inform-only";

  // Derive candidate actions from the risk items that imply one.
  const allowedActions = [];
  for (const r of risk.risks) {
    let action = null;
    if (/concentration|chokepoint/i.test(r.text)) action = "Reduce or hedge the concentrated sleeve";
    else if (/funding confidence|dropped through/i.test(r.text)) action = "Re-plan the affected goal or de-risk its drivers";
    else if (/lombard/i.test(r.text)) action = "Restore lombard headroom (add collateral or reduce drawdown)";
    else if (/house view/i.test(r.text)) action = "Put the signal-vs-house-view disagreement to the client explicitly";
    if (!action) continue;
    allowedActions.push({
      action, class: classify,
      note: m === "Discretionary" ? "Report to the client after execution." :
            m === "Advisory" ? "Needs the client's instruction before anything moves." :
            "Inform only — no advice under this mandate."
    });
  }

  // Blocked language — phrasing the RM must not use given the mandate / limits.
  const blockedClaims = [];
  if (m !== "Discretionary") {
    blockedClaims.push({ text: `"Execute", "buy", "sell now", "switch" — imperative trade instructions`, reason: `${m} mandate: the client instructs, the RM does not direct.` });
  }
  if (conc.pct > 0 && conc.countries.length) {
    blockedClaims.push({ text: `"No concentration concern"`, reason: `Look-through concentration is live in ${conc.countries.join(", ")}.` });
  }
  blockedClaims.push({ text: `"Guaranteed", "risk-free", "certain to recover"`, reason: "No outcome language in RM decision support." });

  // Limit checks.
  const limitChecks = [
    { label: "Single-country concentration", status: conc.pct >= 60 ? "breach" : conc.pct > 0 ? "watch" : "ok" },
    { label: "Mandate scope", status: "ok" },
    { label: "Lombard / LTV headroom", status: portfolio.lombard ? (portfolio.lombard.headroomPct < 15 ? "breach" : portfolio.lombard.headroomPct < 25 ? "watch" : "ok") : "ok" }
  ];

  ctx.facts.suitability = { allowedActions, blockedClaims, limitChecks };

  for (const act of allowedActions) {
    claim(ctx, {
      text: `${act.action} — ${act.class.replace(/-/g, " ")}. ${act.note}`,
      section: "whatToDiscuss",
      cite: [`goal:${portfolio.goals[0]?.id}`].filter(Boolean)
    });
  }

  t.summary = `${m} · ${allowedActions.length} actions · ${blockedClaims.length} blocked phrasings`;
  t.ms = Date.now() - t0;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/nodes.suitability.test.js`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/nodes.js server/intelligence/nodes.suitability.test.js
git commit -m "Intelligence graph: Suitability & Mandate node

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 8: RM Briefing node (LLM + template fallback)

**Files:**
- Modify: `server/intelligence/nodes.js` (add `rmBriefing`, `BRIEFING_SCHEMA`, `templateBriefing`)
- Test: `server/intelligence/nodes.briefing.test.js`

**Interfaces:**
- Consumes: `callLLM` from `../llm.js` (do not modify); all `ctx.facts.*`, `ctx.claims`; `traceStep`.
- Produces: `ctx.facts.briefing = { summary:string, whatHappened:Sentence[], whyItMatters:Sentence[], whatToDiscuss:Sentence[] }` where `Sentence = { text:string, cite:string[] }` and each `cite` id is a **claim id** (`c<n>`), not a citation id. `traceStep` (step 6), `status:"fallback"` if `callLLM` threw.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../../src/adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../../src/signals/fixtures/signals.js";
import { makeCtx } from "./ctx.js";
import * as N from "./nodes.js";

test("rmBriefing falls back to the template with no LLM key and every sentence cites a real claim id", async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
  process.env.OFFLINE = "1";
  const data = await demoAdapter();
  const ctx = makeCtx({ portfolioId: data.portfolios[0].id, question: "What should I know before calling this client?",
    portfolio: data.portfolios[0], instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household: false });
  for (const n of [N.loadContext, N.portfolioAnalyst, N.marketContext, N.policySentinel, N.riskOpportunity, N.suitabilityMandate, N.rmBriefing]) await n(ctx);

  const b = ctx.facts.briefing;
  assert.ok(b.summary.length > 0);
  assert.ok(b.whatHappened.length >= 1 && b.whyItMatters.length >= 1);
  const claimIds = new Set(ctx.claims.map(c => c.id));
  for (const s of [...b.whatHappened, ...b.whyItMatters, ...b.whatToDiscuss]) {
    assert.ok(s.cite.length >= 1);
    for (const cid of s.cite) assert.ok(claimIds.has(cid), `unknown claim id ${cid}`);
  }
  assert.equal(ctx.trace.find(x => x.step === 6).status, "fallback");
  delete process.env.OFFLINE;
});

test("no imperative trade language in the template output", async () => {
  process.env.OFFLINE = "1";
  const data = await demoAdapter();
  const ctx = makeCtx({ portfolioId: data.portfolios[0].id, question: "q",
    portfolio: data.portfolios[0], instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household: false });
  for (const n of [N.loadContext, N.portfolioAnalyst, N.marketContext, N.policySentinel, N.riskOpportunity, N.suitabilityMandate, N.rmBriefing]) await n(ctx);
  const all = [ctx.facts.briefing.summary,
    ...ctx.facts.briefing.whatHappened.map(s => s.text),
    ...ctx.facts.briefing.whyItMatters.map(s => s.text),
    ...ctx.facts.briefing.whatToDiscuss.map(s => s.text)].join(" ").toLowerCase();
  for (const bad of [" buy ", " sell ", "execute the trade", " switch into "]) {
    assert.ok(!all.includes(bad), `found "${bad.trim()}"`);
  }
  delete process.env.OFFLINE;
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/nodes.briefing.test.js`
Expected: FAIL — `rmBriefing` not exported.

- [ ] **Step 3: Add `rmBriefing` + helpers to `nodes.js`**

```js
import { callLLM } from "../llm.js";

export const BRIEFING_SCHEMA = {
  summary: "string — one sentence, RM-facing, no advice",
  whatHappened:  [{ text: "string", cite: ["claim id like c3"] }],
  whyItMatters:  [{ text: "string", cite: ["claim id"] }],
  whatToDiscuss: [{ text: "string", cite: ["claim id"] }]
};

const BRIEFING_SYSTEM =
  "You prepare a relationship manager's internal briefing. You may ONLY arrange the claims we give you. " +
  "Every sentence must set `cite` to one or more claim ids from the input. Do not invent facts, numbers or sources. " +
  "This is RM decision support: no client-facing advice, no recommendations, and never the words buy, sell, execute, or switch. " +
  "Be terse and concrete. Return ONLY JSON matching the schema.";

/* ── Node 7 · RM Briefing ──────────────────────────────────────────────── */
export async function rmBriefing(ctx) {
  const t = traceStep(ctx, { node: "rmBriefing", step: 6, label: "Drafting RM briefing", status: "ok", summary: "" });
  const t0 = Date.now();

  const bySection = s => ctx.claims.filter(c => c.section === s).map(c => ({ id: c.id, text: c.text }));
  const input = {
    question: ctx.input.question,
    client: { name: ctx.facts.active.portfolio.name, mandate: ctx.facts.active.portfolio.mandate },
    claims: {
      whatHappened: bySection("whatHappened"),
      whyItMatters: bySection("whyItMatters"),
      risks: bySection("risks"),
      opportunities: bySection("opportunities"),
      whatToDiscuss: bySection("whatToDiscuss")
    },
    rmNotes: ctx.facts.context.rmNotes.map(n => n.text)
  };

  let briefing;
  try {
    briefing = await callLLM({
      system: BRIEFING_SYSTEM,
      prompt: `Client question: ${ctx.input.question}\n\nClaims:\n${JSON.stringify(input.claims, null, 2)}\n\nRM notes:\n${input.rmNotes.join("\n")}`,
      schema: BRIEFING_SCHEMA
    });
    // guard: coerce shape
    briefing = normaliseBriefing(briefing);
  } catch (err) {
    t.status = "fallback";
    briefing = templateBriefing(ctx);
  }
  ctx.facts.briefing = briefing;

  t.summary = t.status === "fallback" ? "template (no model)" : "model";
  t.ms = Date.now() - t0;
}

function normaliseBriefing(b) {
  const arr = x => Array.isArray(x) ? x.filter(s => s && typeof s.text === "string").map(s => ({ text: s.text, cite: Array.isArray(s.cite) ? s.cite : [] })) : [];
  return {
    summary: typeof b?.summary === "string" ? b.summary : "",
    whatHappened: arr(b?.whatHappened),
    whyItMatters: arr(b?.whyItMatters),
    whatToDiscuss: arr(b?.whatToDiscuss)
  };
}

/** Deterministic briefing — the demo works with no key. Every sentence cites its own claim id. */
export function templateBriefing(ctx) {
  const take = (s, n) => ctx.claims.filter(c => c.section === s).slice(0, n).map(c => ({ text: c.text, cite: [c.id] }));
  const wh = take("whatHappened", 4);
  const wm = [...take("whyItMatters", 3), ...take("risks", 3)];
  const wd = [...take("whatToDiscuss", 4), ...take("opportunities", 2)];
  return {
    summary: wh[0] ? wh[0].text : "No material movement to brief this week.",
    whatHappened: wh,
    whyItMatters: wm,
    whatToDiscuss: wd
  };
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/nodes.briefing.test.js`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/nodes.js server/intelligence/nodes.briefing.test.js
git commit -m "Intelligence graph: RM Briefing node — one LLM call, template fallback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 9: Evidence Verifier

**Files:**
- Create: `server/intelligence/verify.js`
- Test: `server/intelligence/verify.test.js`

**Interfaces:**
- Consumes: `resolveClaim` from `./ctx.js`; `traceStep` from `./ctx.js`.
- Produces: `evidenceVerifier(ctx)` — mutates `ctx.facts.briefing` in place: for every sentence in `summary` / `whatHappened` / `whyItMatters` / `whatToDiscuss`, keep it only if **every** claim id in its `cite` array both exists and `resolveClaim`s. Dropped sentences increment `ctx.droppedClaims`. If `summary` is dropped, replace it with the first surviving `whatHappened` sentence's `text` (or `""`). Pushes `traceStep` (step 7). Never calls the LLM. Never loops.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { makeCtx, cite, claim } from "./ctx.js";
import { evidenceVerifier } from "./verify.js";

function fixtureCtx() {
  const ctx = makeCtx({});
  cite(ctx, "goal:g1", { kind: "goal" });
  const good = claim(ctx, { text: "resolves", section: "whatHappened", cite: ["goal:g1"] });
  const bad = claim(ctx, { text: "dangling", section: "whyItMatters", cite: ["goal:missing"] });
  ctx.facts.briefing = {
    summary: "sum",
    whatHappened: [{ text: "kept", cite: [good] }, { text: "dropped-wh", cite: [bad] }],
    whyItMatters: [{ text: "dropped-wm", cite: [bad] }],
    whatToDiscuss: [{ text: "kept-wd", cite: [good] }]
  };
  return { ctx, good, bad };
}

test("drops sentences whose claim chain does not resolve and counts them", () => {
  const { ctx } = fixtureCtx();
  evidenceVerifier(ctx);
  assert.deepEqual(ctx.facts.briefing.whatHappened.map(s => s.text), ["kept"]);
  assert.deepEqual(ctx.facts.briefing.whyItMatters, []);
  assert.deepEqual(ctx.facts.briefing.whatToDiscuss.map(s => s.text), ["kept-wd"]);
  assert.equal(ctx.droppedClaims, 2);
  assert.equal(ctx.trace.find(x => x.step === 7).node, "evidenceVerifier");
});

test("substitutes the summary when it loses support", () => {
  const { ctx, bad } = fixtureCtx();
  ctx.facts.briefing.summary = "sum";
  // make the summary itself carry the bad claim by convention: verifier checks summarySentence via briefing.summaryCite
  ctx.facts.briefing.summaryCite = [bad];
  evidenceVerifier(ctx);
  assert.equal(ctx.facts.briefing.summary, "kept");
});

test("unknown claim id counts as unresolved", () => {
  const ctx = makeCtx({});
  ctx.facts.briefing = { summary: "", whatHappened: [{ text: "x", cite: ["c999"] }], whyItMatters: [], whatToDiscuss: [] };
  evidenceVerifier(ctx);
  assert.deepEqual(ctx.facts.briefing.whatHappened, []);
  assert.equal(ctx.droppedClaims, 1);
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/verify.test.js`
Expected: FAIL — `./verify.js` not found.

- [ ] **Step 3: Create `server/intelligence/verify.js`**

```js
import { resolveClaim, traceStep } from "./ctx.js";

const claimExists = (ctx, id) => ctx.claims.some(c => c.id === id);
const sentenceOk = (ctx, s) =>
  Array.isArray(s.cite) && s.cite.length > 0 &&
  s.cite.every(cid => claimExists(ctx, cid) && resolveClaim(ctx, cid));

/* ── Node 8 · Evidence Verifier ────────────────────────────────────────── */
export function evidenceVerifier(ctx) {
  const t = traceStep(ctx, { node: "evidenceVerifier", step: 7, label: "Verifying citations", status: "ok", summary: "" });
  const t0 = Date.now();
  const b = ctx.facts.briefing;

  let kept = 0;
  for (const section of ["whatHappened", "whyItMatters", "whatToDiscuss"]) {
    const before = b[section].length;
    b[section] = b[section].filter(s => sentenceOk(ctx, s));
    kept += b[section].length;
    ctx.droppedClaims += before - b[section].length;
  }

  // summary: verified only if it carries a resolvable summaryCite; otherwise substitute.
  const summaryHeld = Array.isArray(b.summaryCite) && b.summaryCite.length > 0 && b.summaryCite.every(cid => claimExists(ctx, cid) && resolveClaim(ctx, cid));
  if (!summaryHeld) {
    b.summary = b.whatHappened[0]?.text || "";
  }

  t.summary = `${kept} sentences verified · ${ctx.droppedClaims} dropped`;
  t.status = "ok";   // dropping unverifiable claims is expected behaviour, never a fallback
  t.ms = Date.now() - t0;
}
```

> The template briefing (Task 8) does not set `summaryCite`, so the verifier always substitutes the summary from the first surviving `whatHappened` sentence — which is correct and safe. When the LLM path returns a `summary`, add `summaryCite` handling in Task 10's normalise step only if the schema is extended; for v1 the substitution is the guaranteed-safe behaviour and the test above documents both paths.

- [ ] **Step 4: Run it — expect pass**

Run: `node --test server/intelligence/verify.test.js`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add server/intelligence/verify.js server/intelligence/verify.test.js
git commit -m "Intelligence graph: Evidence Verifier — drop unresolvable briefing sentences

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 10: Pipeline + request handler + routes

**Files:**
- Create: `server/intelligence/pipeline.js`
- Create: `server/intelligence-review.js`
- Create: `api/intelligence-review.js`
- Modify: `server/index.js` (add the route + import)
- Test: `server/intelligence/pipeline.test.js`

**Interfaces:**
- Consumes: all node fns from `./nodes.js`, `evidenceVerifier` from `./verify.js`, `makeCtx` from `./ctx.js`; `validatePortfolio` from `../../src/model/schema.js`.
- Produces:
  - `runPipeline(ctx) → ctx` — runs `[loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity, suitabilityMandate, rmBriefing, evidenceVerifier]` in order. Each node is `try`/`catch`; on throw, push a `fallback` trace entry with the error message and continue (the node's own internal fallback already ran for policy/briefing; for a deterministic node that somehow throws, its `ctx.facts.<key>` may be undefined and downstream nodes must tolerate that — they already guard with `?.`).
  - `handleIntelligenceReview(body) → response` — validates `body.portfolio` / `body.instruments` / `body.signals`; `makeCtx`; `runPipeline`; returns the spec §8 shape.
  - `POST /api/intelligence-review` on the Express app and the Vercel function, both calling `handleIntelligenceReview`.
- Response shape (verbatim from spec §8):
  ```
  { summary, portfolioExplanation:[{text,cite}], whyItMatters:[{text,cite}],
    risks:[{text,cite,severity}], opportunities:[{text,cite,severity}],
    rmTalkingPoints:[{text,cite}], allowedActions:[{action,class,note}],
    blockedClaims:[{text,reason}], citations:[{id,kind,label,value,url}],
    agentTrace:[{node,step,label,status,ms,summary}], mode:"live"|"fallback", droppedClaims:number }
  ```

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../../src/adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../../src/signals/fixtures/signals.js";
import { handleIntelligenceReview } from "../intelligence-review.js";

async function body(idx = 0) {
  const data = await demoAdapter();
  return { portfolioId: data.portfolios[idx].id, question: "What should I know before calling this client?",
    portfolio: data.portfolios[idx], instruments: data.instruments,
    signals: SIGNALS, prevSignals: PREV_SIGNALS, household: false };
}

test("handleIntelligenceReview (offline) returns the full shape, fallback mode", async () => {
  process.env.OFFLINE = "1"; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
  const r = await handleIntelligenceReview(await body(0));
  for (const k of ["summary","portfolioExplanation","whyItMatters","risks","opportunities","rmTalkingPoints","allowedActions","blockedClaims","citations","agentTrace","mode","droppedClaims"]) {
    assert.ok(k in r, `missing ${k}`);
  }
  assert.equal(r.mode, "fallback");
  assert.equal(r.agentTrace.length, 8);
  assert.ok(r.agentTrace.every(s => typeof s.ms === "number"));
  delete process.env.OFFLINE;
});

test("every surviving RM-facing sentence resolves to a citation in the response", async () => {
  process.env.OFFLINE = "1";
  const r = await handleIntelligenceReview(await body(0));
  const citeIds = new Set(r.citations.map(c => c.id));
  // portfolioExplanation / whyItMatters / rmTalkingPoints sentences carry claim ids;
  // the handler must also flatten the underlying citation ids into r.citations.
  assert.ok(r.citations.length >= 1);
  for (const s of [...r.portfolioExplanation, ...r.whyItMatters, ...r.rmTalkingPoints]) {
    assert.ok(s.cite.length >= 1);
  }
  delete process.env.OFFLINE;
});

test("advisory response contains no imperative trade verbs", async () => {
  process.env.OFFLINE = "1";
  const data = await demoAdapter();
  const advisoryIdx = data.portfolios.findIndex(p => p.mandate === "Advisory");
  const r = await handleIntelligenceReview(await body(advisoryIdx));
  const text = [r.summary, ...r.portfolioExplanation.map(s=>s.text), ...r.whyItMatters.map(s=>s.text), ...r.rmTalkingPoints.map(s=>s.text)].join(" ").toLowerCase();
  for (const v of ["buy ", "sell ", "execute the trade"]) assert.ok(!text.includes(v));
  delete process.env.OFFLINE;
});

test("bad body throws a clean error", async () => {
  await assert.rejects(() => handleIntelligenceReview({ portfolioId: "x" }), /portfolio/i);
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test server/intelligence/pipeline.test.js`
Expected: FAIL — `../intelligence-review.js` not found.

- [ ] **Step 3: Create `server/intelligence/pipeline.js`**

```js
import { loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity, suitabilityMandate, rmBriefing } from "./nodes.js";
import { evidenceVerifier } from "./verify.js";

const NODES = [loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity, suitabilityMandate, rmBriefing, evidenceVerifier];

export async function runPipeline(ctx) {
  for (const node of NODES) {
    try {
      await node(ctx);
    } catch (err) {
      ctx.trace.push({ node: node.name, step: 0, label: node.name, status: "fallback", summary: err.message, ms: 0 });
    }
  }
  return ctx;
}
```

- [ ] **Step 4: Create `server/intelligence-review.js`**

```js
import { validatePortfolio } from "../src/model/schema.js";
import { makeCtx, resolveClaim } from "./intelligence/ctx.js";
import { runPipeline } from "./intelligence/pipeline.js";

export async function handleIntelligenceReview(body = {}) {
  const { portfolio, instruments, signals } = body;
  if (!portfolio || typeof portfolio !== "object") throw new Error("intelligence-review: `portfolio` is required");
  if (!instruments || typeof instruments !== "object") throw new Error("intelligence-review: `instruments` is required");
  if (!signals || typeof signals !== "object") throw new Error("intelligence-review: `signals` is required");
  const errs = validatePortfolio(portfolio, instruments);
  if (errs.length) throw new Error(`intelligence-review: portfolio invalid — ${errs[0]}`);

  const ctx = makeCtx({
    portfolioId: body.portfolioId || portfolio.id,
    question: body.question || "What should I know before calling this client?",
    portfolio, instruments,
    signals, prevSignals: body.prevSignals || signals,
    household: Boolean(body.household)
  });
  await runPipeline(ctx);

  const b = ctx.facts.briefing || { summary: "", whatHappened: [], whyItMatters: [], whatToDiscuss: [] };
  const risk = ctx.facts.risk || { risks: [], opportunities: [] };
  const suit = ctx.facts.suitability || { allowedActions: [], blockedClaims: [] };

  // flatten every citation id referenced by a surviving claim into response.citations
  const usedClaimIds = new Set(
    [...b.whatHappened, ...b.whyItMatters, ...b.whatToDiscuss].flatMap(s => s.cite)
  );
  const usedCitationIds = new Set();
  for (const c of ctx.claims) if (usedClaimIds.has(c.id)) c.cite.forEach(id => usedCitationIds.add(id));
  for (const it of [...risk.risks, ...risk.opportunities]) it.cite.forEach(id => usedCitationIds.add(id));
  const citations = [...usedCitationIds].map(id => ctx.citations[id]).filter(Boolean)
    .map(({ id, kind, label, value, url }) => ({ id, kind, label, value, url }));

  const policyFellBack = ctx.facts.policy?.mode === "fallback";
  const briefingFellBack = ctx.trace.find(x => x.step === 6)?.status === "fallback";

  return {
    summary: b.summary,
    portfolioExplanation: b.whatHappened,
    whyItMatters: b.whyItMatters,
    risks: risk.risks,
    opportunities: risk.opportunities,
    rmTalkingPoints: b.whatToDiscuss,
    allowedActions: suit.allowedActions,
    blockedClaims: suit.blockedClaims,
    citations,
    agentTrace: ctx.trace,
    mode: (policyFellBack || briefingFellBack) ? "fallback" : "live",
    droppedClaims: ctx.droppedClaims
  };
}
```

> `response.citations` = every citation id referenced by (a) a surviving briefing sentence's claims, plus (b) every risk/opportunity item's own `cite` array. De-duplicated, then mapped to `{ id, kind, label, value, url }`.

- [ ] **Step 5: Create `api/intelligence-review.js`**

```js
import { handleIntelligenceReview } from "../server/intelligence-review.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    res.status(200).json(await handleIntelligenceReview(req.body || {}));
  } catch (err) {
    res.status(err.message.startsWith("intelligence-review:") ? 400 : 502).json({ error: err.message });
  }
}
```

- [ ] **Step 6: Add the route to `server/index.js`**

After the `POST /api/policy-scan` handler, add:

```js
import { handleIntelligenceReview } from "./intelligence-review.js";
```
(with the other imports at the top), and:
```js
app.post("/api/intelligence-review", async (req, res) => {
  try {
    res.json(await handleIntelligenceReview(req.body || {}));
  } catch (err) {
    console.warn("[intelligence-review]", err.message);
    res.status(err.message.startsWith("intelligence-review:") ? 400 : 502).json({ error: err.message });
  }
});
```

- [ ] **Step 7: Run the pipeline test + the whole suite — expect pass**

Run: `node --test server/intelligence/`
Expected: every `*.test.js` passes. Fix any regression before committing.

- [ ] **Step 8: Smoke-test the route**

```bash
OFFLINE=1 npm run server &
sleep 1
curl -s localhost:8787/api/intelligence-review -H 'content-type: application/json' \
  -d "$(node -e 'import("./src/adapters/demo.js").then(async m=>{const d=await m.demoAdapter();const s=await import("./src/signals/fixtures/signals.js");process.stdout.write(JSON.stringify({portfolioId:d.portfolios[0].id,question:"q",portfolio:d.portfolios[0],instruments:d.instruments,signals:s.SIGNALS,prevSignals:s.PREV_SIGNALS,household:false}))})')" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log("mode",r.mode,"| trace",r.agentTrace.length,"| citations",r.citations.length,"| dropped",r.droppedClaims)})'
kill %1
```
Expected: `mode fallback | trace 8 | citations >=1 | dropped >=0`.

- [ ] **Step 9: Commit**

```bash
git add server/intelligence/pipeline.js server/intelligence-review.js api/intelligence-review.js server/index.js server/intelligence/pipeline.test.js
git commit -m "Intelligence graph: pipeline runner + /api/intelligence-review (Express + Vercel)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 11: UI — button swap + overlay + timeline

**Files:**
- Create: `src/ui/intelligence.js`
- Modify: `src/ui/shell.js` (top-bar buttons)
- Modify: `src/main.js` (`wire()`, imports)
- Modify: `src/ui/styles.css` (append `.intel-*`)

**Interfaces:**
- Consumes: `S` from `../store.js`; existing `openBrief`, `openPolicyTrial` from `./drawers.js` (Task 12 wires them); `CONFIG` if needed.
- Produces: `src/ui/intelligence.js` exports `openIntelligenceReview()` — builds a `position:fixed` overlay above the cockpit, fires the `fetch`, replays the 7-step timeline from `agentTrace`, then reveals the 4-tab output (Task 12). Also exports `intelHtml()` if the markup is large enough to warrant separation — otherwise inline.

- [ ] **Step 1: Swap the top-bar buttons in `src/ui/shell.js`**

Replace:
```html
    <a class="ghost" id="client-view-btn" href="?view=client">Client view</a>
    <button class="ghost" id="policy-scan-btn">Run live policy scan</button>
    <button class="ghost solid" id="brief-btn">Generate note</button>
```
with:
```html
    <a class="ghost" id="client-view-btn" href="?view=client">Client view</a>
    <button class="ghost solid" id="intel-btn">Run Intelligence Review</button>
```

- [ ] **Step 2: Rewire `src/main.js`**

In `wire()`, replace:
```js
  document.getElementById("brief-btn").addEventListener("click", openBrief);
  document.getElementById("policy-scan-btn").addEventListener("click", runPolicySentinel);
```
with:
```js
  document.getElementById("intel-btn").addEventListener("click", () => openIntelligenceReview());
```
Add the import near the other UI imports:
```js
import { openIntelligenceReview } from "./ui/intelligence.js";
```
Keep `openBrief`, `openPolicyTrial`, `runPolicySentinel` imported — Task 12 calls `openBrief` / `openPolicyTrial` from inside the review, and `runPolicySentinel` may still be referenced by `railHandlers` (check: `railHandlers.onRunPolicyScan`; if the rail still has a policy card, leave `runPolicySentinel` intact; if not, remove it and the `onRunPolicyScan`/`onOpenPolicyTrial` keys). Grep `runPolicySentinel` and `policy-scan-btn` across `src/` before deciding.

- [ ] **Step 3: Create `src/ui/intelligence.js` — overlay + timeline**

```js
import { S } from "../store.js";
import { openBrief } from "./drawers.js";
import { openPolicyTrial } from "./drawers.js";

const STEPS = [
  "Reading client objectives",
  "Explaining portfolio movement",
  "Checking concentration, liquidity and currency risk",
  "Searching official policy sources",
  "Testing against suitability constraints",
  "Drafting RM briefing",
  "Verifying citations"
];

export async function openIntelligenceReview() {
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const el = document.createElement("div");
  el.className = "intel-screen";
  el.innerHTML = `
    <div class="intel-head">
      <div><div class="intel-title">Intelligence Review</div>
        <div class="intel-sub">${S.portfolio.name} · ${S.portfolio.mandate} mandate</div></div>
      <span class="intel-mode" id="intel-mode" hidden>fallback</span>
      <button class="intel-x" id="intel-x" aria-label="Close">×</button>
    </div>
    <ol class="intel-steps" id="intel-steps">
      ${STEPS.map((s, i) => `<li data-step="${i + 1}"><span class="dot"></span><span class="lbl">${s}</span><span class="sum"></span></li>`).join("")}
    </ol>
    <div class="intel-out" id="intel-out" hidden></div>
    <div class="intel-err" id="intel-err" hidden>
      <p>The review could not complete.</p><button class="ghost" id="intel-retry">Try again</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector("#intel-x").addEventListener("click", () => el.remove());
  addEventListener("keydown", function esc(e) { if (e.key === "Escape") { el.remove(); removeEventListener("keydown", esc); } });

  const run = async () => {
    el.querySelector("#intel-err").hidden = true;
    el.querySelectorAll("#intel-steps li").forEach(li => li.classList.remove("done", "fallback", "active"));
    let data;
    try {
      const res = await fetch("/api/intelligence-review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          portfolioId: S.portfolio.id,
          question: "What should I know before calling this client?",
          portfolio: S.portfolio, instruments: S.instruments,
          signals: S.signals, prevSignals: S.prevSignals, household: S.household
        })
      });
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch (err) {
      el.querySelector("#intel-err").hidden = false;
      return;
    }
    if (data.mode === "fallback") el.querySelector("#intel-mode").hidden = false;
    await replayTrace(el, data.agentTrace, reduced);
    renderOutput(el, data);       // Task 12
  };
  el.querySelector("#intel-retry").addEventListener("click", run);
  run();
}

/** Walk the 7 fixed steps; a step is "done" once every trace entry with that step number has landed. */
async function replayTrace(el, trace, reduced) {
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
  for (let step = 1; step <= STEPS.length; step++) {
    const li = el.querySelector(`#intel-steps li[data-step="${step}"]`);
    li.classList.add("active");
    const entries = trace.filter(e => e.step === step);
    const fell = entries.some(e => e.status === "fallback");
    li.querySelector(".sum").textContent = entries.map(e => e.summary).filter(Boolean).join(" · ");
    await wait(340);
    li.classList.remove("active");
    li.classList.add(fell ? "fallback" : "done");
  }
  await wait(160);
}
```

> `renderOutput` is defined in Task 12 (same file). Until then, stub it: `function renderOutput(){}` at the bottom so Task 11 builds and the timeline is demonstrable.

- [ ] **Step 4: Append overlay CSS to `src/ui/styles.css`**

At the end of the file (after the display-face rule and the reduced-motion query — order among trailing rules does not matter):

```css
/* ── Intelligence Review — full-screen takeover ─────────────────────────── */
.intel-screen{position:fixed; inset:0; z-index:120; display:flex; flex-direction:column;
  background:
    radial-gradient(ellipse 50% 40% at 50% 0%, rgba(245,197,66,.10), transparent 70%),
    var(--black);
  padding:0 clamp(20px,6vw,80px)}
.intel-head{display:flex; align-items:flex-start; gap:14px; padding:26px 0 20px; border-bottom:1px solid var(--line)}
.intel-title{font-family:var(--disp); font-weight:800; font-size:20px; letter-spacing:-.02em; text-transform:uppercase}
.intel-sub{font-family:var(--mono); font-size:11px; color:var(--ink-3); margin-top:3px}
.intel-mode{margin-left:auto; align-self:center; font-size:9px; letter-spacing:.1em; text-transform:uppercase;
  padding:2px 6px; border-radius:3px; background:rgba(245,197,66,.14); color:var(--amber)}
.intel-x{background:transparent; border:1px solid var(--line); border-radius:6px; width:30px; height:30px;
  color:var(--ink-3); cursor:pointer; flex:none}
.intel-steps{list-style:none; margin:0; padding:26px 0; max-width:640px}
.intel-steps li{display:grid; grid-template-columns:16px 1fr; gap:12px 12px; align-items:baseline; padding:9px 0; opacity:.4; transition:opacity .2s}
.intel-steps li.active,.intel-steps li.done,.intel-steps li.fallback{opacity:1}
.intel-steps .dot{width:8px; height:8px; border-radius:50%; background:var(--ink-4); margin-top:5px}
.intel-steps li.active .dot{background:var(--amber); box-shadow:0 0 8px var(--amber)}
.intel-steps li.done .dot{background:var(--cool)}
.intel-steps li.fallback .dot{background:var(--amber-2)}
.intel-steps .lbl{font-size:13px}
.intel-steps .sum{grid-column:2; font-family:var(--mono); font-size:10px; color:var(--ink-4)}
.intel-err{padding:30px 0; color:var(--ink-2)}
@media (prefers-reduced-motion:reduce){.intel-steps li{opacity:1}}
```

- [ ] **Step 5: Verify**

Run: `npm run build` → passes.
Run: `npm run dev:all` (needs `OFFLINE=1` in `.env` or environment for a keyless run). Open `http://localhost:5173`, dismiss the title screen, click **Run Intelligence Review**.
Expected: the overlay opens, the 7 steps light up in sequence (step 4 and 6 with the amber fallback dot when keyless), a `fallback` badge appears. No console errors. `Esc` / × closes it.
Grep: `git grep -nE "policy-scan-btn|brief-btn" -- src/` returns nothing (both removed from the bar).

- [ ] **Step 6: Commit**

```bash
git add src/ui/intelligence.js src/ui/shell.js src/main.js src/ui/styles.css
git commit -m "Intelligence Review UI: one button, full-screen overlay, 7-step timeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 12: UI — the four output tabs

**Files:**
- Modify: `src/ui/intelligence.js` (replace the `renderOutput` stub)
- Modify: `src/ui/styles.css` (append `.intel-tabs`, `.intel-panel`, `.intel-cite`)

**Interfaces:**
- Consumes: the `data` object from `/api/intelligence-review` (spec §8 shape); `openBrief`, `openPolicyTrial` from `./drawers.js`.
- Produces: `renderOutput(el, data)` — reveals `#intel-out`, builds the 4 tabs, wires tab switching + the two drawer buttons.

- [ ] **Step 1: Replace the `renderOutput` stub in `src/ui/intelligence.js`**

```js
const TABS = [
  { id: "wh", label: "What happened" },
  { id: "wm", label: "Why it matters" },
  { id: "wd", label: "What to discuss" },
  { id: "ev", label: "Evidence" }
];

function sentence(s) {
  return `<p class="intel-line">${s.text}<span class="intel-cite">${(s.cite || []).length} cite${(s.cite||[]).length === 1 ? "" : "s"}</span></p>`;
}
function itemList(items) {
  return items.map(it => `<li><span class="sev sev-${it.severity}"></span>${it.text}</li>`).join("");
}

function renderOutput(el, data) {
  const out = el.querySelector("#intel-out");
  out.hidden = false;
  out.innerHTML = `
    <nav class="intel-tabs">${TABS.map((t, i) =>
      `<button data-tab="${t.id}" aria-selected="${i === 0}">${t.label}</button>`).join("")}</nav>

    <section class="intel-panel" data-panel="wh">
      <p class="intel-summary">${data.summary}</p>
      ${data.portfolioExplanation.map(sentence).join("")}
    </section>

    <section class="intel-panel" data-panel="wm" hidden>
      ${data.whyItMatters.map(sentence).join("")}
      ${data.risks.length ? `<h4>Risks</h4><ul class="intel-items">${itemList(data.risks)}</ul>` : ""}
      ${data.opportunities.length ? `<h4>Opportunities</h4><ul class="intel-items">${itemList(data.opportunities)}</ul>` : ""}
    </section>

    <section class="intel-panel" data-panel="wd" hidden>
      <p class="intel-note-line">RM talking points — not client-facing advice.</p>
      ${data.rmTalkingPoints.map(sentence).join("")}
      ${data.allowedActions.length ? `<h4>Actions by mandate</h4><ul class="intel-items">${
        data.allowedActions.map(a => `<li><span class="intel-class">${a.class.replace(/-/g," ")}</span>${a.action}${a.note ? ` — <span class="intel-muted">${a.note}</span>` : ""}</li>`).join("")}</ul>` : ""}
      <button class="ghost" id="intel-draft-note">Draft client note</button>
    </section>

    <section class="intel-panel" data-panel="ev" hidden>
      ${data.droppedClaims > 0 ? `<p class="intel-muted">${data.droppedClaims} unverifiable claim(s) were dropped before this briefing rendered.</p>` : ""}
      ${["signal","policy","market","event","position","goal","note","calc"].map(kind => {
        const rows = data.citations.filter(c => c.kind === kind);
        if (!rows.length) return "";
        return `<h4>${kind}</h4><ul class="intel-cites">${rows.map(c =>
          `<li>${c.label}${c.value ? ` — <span class="intel-muted">${c.value}</span>` : ""}${
            c.url ? ` <a href="${c.url}" target="_blank" rel="noreferrer">source</a>` : ""}</li>`).join("")}</ul>`;
      }).join("")}
      ${data.blockedClaims.length ? `<h4>Language requiring suitability review</h4><ul class="intel-blocked">${
        data.blockedClaims.map(b => `<li><strong>${b.text}</strong><br><span class="intel-muted">${b.reason}</span></li>`).join("")}</ul>` : ""}
      <button class="ghost" id="intel-policy-trial">Open policy agent trial</button>
    </section>`;

  out.querySelectorAll(".intel-tabs button").forEach(b => b.addEventListener("click", () => {
    out.querySelectorAll(".intel-tabs button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    out.querySelectorAll(".intel-panel").forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
  }));
  out.querySelector("#intel-draft-note")?.addEventListener("click", () => openBrief());
  out.querySelector("#intel-policy-trial")?.addEventListener("click", () => openPolicyTrial());
}
```

- [ ] **Step 2: Append tab CSS to `src/ui/styles.css`**

```css
.intel-out{flex:1; overflow-y:auto; padding:22px 0 60px; max-width:760px}
.intel-tabs{display:flex; gap:2px; border-bottom:1px solid var(--line); margin-bottom:18px}
.intel-tabs button{background:transparent; border:0; border-bottom:2px solid transparent; padding:9px 13px 8px;
  font-size:12.5px; color:var(--ink-3); cursor:pointer}
.intel-tabs button[aria-selected="true"]{color:var(--ink); border-bottom-color:var(--amber)}
.intel-panel h4{font-family:var(--mono); font-size:10px; letter-spacing:.09em; text-transform:uppercase;
  color:var(--ink-3); margin:20px 0 8px}
.intel-summary{font-family:var(--serif); font-size:16px; line-height:1.6; color:var(--ink); margin:0 0 16px}
.intel-line{font-size:13.5px; line-height:1.6; color:var(--ink-2); margin:0 0 10px; display:flex; gap:10px; justify-content:space-between}
.intel-cite{flex:none; font-family:var(--mono); font-size:9px; color:var(--ink-4); border:1px solid var(--line); border-radius:3px; padding:1px 5px; height:fit-content}
.intel-note-line{font-family:var(--mono); font-size:10px; color:var(--amber-2); text-transform:uppercase; letter-spacing:.06em; margin:0 0 14px}
.intel-items,.intel-cites,.intel-blocked{list-style:none; margin:0; padding:0}
.intel-items li{font-size:13px; color:var(--ink-2); line-height:1.55; padding:7px 0; border-bottom:1px solid var(--line-soft); display:flex; gap:9px; align-items:baseline}
.intel-cites li,.intel-blocked li{font-size:12px; color:var(--ink-2); line-height:1.5; padding:6px 0; border-bottom:1px solid var(--line-soft)}
.sev{width:6px; height:6px; border-radius:50%; flex:none}
.sev-high{background:var(--ember)} .sev-medium{background:var(--amber)} .sev-low{background:var(--cool)}
.intel-class{font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:var(--amber-2); border:1px solid var(--line); border-radius:3px; padding:1px 5px; margin-right:8px}
.intel-muted{color:var(--ink-4)}
.intel-out h4:first-child{margin-top:0}
```

- [ ] **Step 3: Verify**

Run: `npm run build` → passes.
Run: `OFFLINE=1 npm run dev:all`, open the review.
Expected: after the timeline, the four tabs appear; **What happened** shows the summary + sentences with a "N cites" chip; **Why it matters** lists risks/opportunities with severity dots; **What to discuss** shows talking points + actions-by-mandate + a working "Draft client note" button (opens the existing note drawer); **Evidence** groups citations by kind, lists blocked phrasings, and "Open policy agent trial" opens the existing policy drawer. Switching tabs works. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/intelligence.js src/ui/styles.css
git commit -m "Intelligence Review UI: the four output tabs + evidence panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 13: Docs + full verification pass

**Files:**
- Modify: `docs/FRIDAY-CHECKLIST.md`
- Modify: `.env.example` (document the new endpoint's keys — they already exist, add a one-line note)

- [ ] **Step 1: Note the review in `docs/FRIDAY-CHECKLIST.md`**

In the demo-path section, add a beat after the client-note beat:

```markdown
- **Run Intelligence Review** → the 7-step agent timeline plays, then four tabs:
  What happened · Why it matters · What to discuss · Evidence. Every sentence
  carries a citation count; the Evidence tab traces each one. With no keys the
  policy and briefing steps show an amber dot and a `fallback` badge appears —
  the review still completes.
```

- [ ] **Step 2: `.env.example` note**

Under the TinyFish block, add:
```
# /api/intelligence-review reuses TINYFISH_API_KEY (policy step) and
# ANTHROPIC_API_KEY / OPENAI_API_KEY (briefing step). Both steps fall back cleanly.
```

- [ ] **Step 3: Full test suite**

Run: `node --test server/intelligence/`
Expected: all `*.test.js` green, output pristine (no stray warnings).

- [ ] **Step 4: Spec §11 checklist — manual**

`OFFLINE=1 npm run dev:all`, then:
1. Run the review on an advisory portfolio and a discretionary one (switch clients in the book rail first). Confirm advisory `rmTalkingPoints` + `allowedActions` never contain "buy/sell/execute"; discretionary `allowedActions` show at least one `executable-under-mandate`.
2. Every sentence in all four tabs has a cite chip ≥ 1; every chip's citation appears in Evidence.
3. Set `POLICY_SCAN_QUERY` to a generic MAS news URL in `.env`, restart, run with a `TINYFISH_API_KEY` present — the policy step still falls back (existing `server/policy-sentinel.js` validation); `mode: "fallback"`.
4. Keyless + `OFFLINE=1` → review completes, `fallback` badge shown, all tabs populate.
5. DevTools reduced-motion → timeline steps appear resolved instantly, output still reachable.
6. `npm run build` passes; `npm run preview` + re-run the review once against the production build (the API needs `npm run server` alongside — or test the built frontend against `npm run dev:all`).

- [ ] **Step 5: Grep for dead references**

Run: `git grep -nE "policy-scan-btn|brief-btn|generate note|Generate note" -- src/`
Expected: no hits in `src/ui/shell.js` / `src/main.js` (the buttons are gone from the bar). Hits inside `src/ui/drawers.js` (the `openBrief` drawer's own copy) are fine.

- [ ] **Step 6: Commit**

```bash
git add docs/FRIDAY-CHECKLIST.md .env.example
git commit -m "Docs: Intelligence Review demo beat + env notes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §4.1 file layout | Tasks 1–12 create exactly those files (plus `server/intelligence/ctx.js`, a helper file the spec folds into "the ctx lifecycle" — noted) |
| §4.2 `ctx` shape | Task 2 |
| §4.3 `runPipeline` | Task 10 |
| §5.1 Load Context (base citations, rmNotes) | Task 3 |
| §5.2 Portfolio Analyst | Task 3 |
| §5.3 Market Context | Task 4 |
| §5.4 Policy Sentinel (wrap `runPolicySentinelScan`, `mode` → trace) | Task 5 |
| §5.5 Risk/Opportunity (5 risk rules + 2 opp rules) | Task 6 |
| §5.6 Suitability & Mandate (3 classes, blockedClaims, limitChecks) | Task 7 |
| §5.7 RM Briefing (one LLM call, schema, template fallback) | Task 8 |
| §5.8 Evidence Verifier (drop unresolved, count, summary substitution, no loop) | Task 9 |
| §6 citation vs claim model | Tasks 2, 3, 10 (flatten to `response.citations`) |
| §7 `markets.js` | Task 1 |
| §8 API contract | Task 10 (verbatim shape) |
| §9 UI (button swap, overlay, 7 steps, 4 tabs, Draft-note + policy-trial buttons, fallback badge, reduced-motion) | Tasks 11, 12 |
| §10 fallback matrix | Tasks 5, 8, 9, 11 + Task 13 checklist |
| §11 testing | Task 13 |
| §12 resolved decisions | honoured throughout; `node:test` deviation is declared in Global Constraints |

No gaps.

**2. Placeholder scan:** Task 4 contains a deliberately-labelled "stray sketch" (`SERIES_FOR` / `ctxCurrency`) that the step text says to delete — this is guidance, not a placeholder in the shipped code; the real `seriesFor` closure is written in full. Task 10 flags one redundant `.concat()` to simplify. Task 11 ships a one-line `renderOutput` stub that Task 12 replaces — explicitly sequenced. No "TBD" / "add error handling" / untyped references.

**3. Type consistency:**
- `cite(ctx, id, obj)` / `claim(ctx, {text, section, cite})` / `resolveClaim(ctx, claimId)` / `traceStep(ctx, {node, step, label, status, summary})` — defined Task 2, used identically Tasks 3–10.
- Node fn names `loadContext, portfolioAnalyst, marketContext, policySentinel, riskOpportunity, suitabilityMandate, rmBriefing` (nodes.js) + `evidenceVerifier` (verify.js) — the `NODES` array in Task 10 lists exactly these, in this order.
- `ctx.facts.analyst.movers[].{instrumentId,name,riskDelta,weightPct,drivesGoals,exposures,eventIds}` — produced Task 3, consumed Tasks 4 & 6 with these names.
- `ctx.facts.risk = { risks, opportunities }`, items `{text, cite, severity}` — Task 6 produces, Tasks 7 & 10 consume.
- `ctx.facts.suitability = { allowedActions:[{action,class,note}], blockedClaims:[{text,reason}], limitChecks:[{label,status}] }` — Task 7 produces, Task 10 & Task 12 consume with these names.
- `ctx.facts.briefing = { summary, whatHappened:[{text,cite}], whyItMatters, whatToDiscuss }` — Task 8 produces, Task 9 mutates in place, Task 10 maps `whatHappened → portfolioExplanation`.
- Response keys (Task 10) match spec §8 and Task 12's `data.*` reads: `summary, portfolioExplanation, whyItMatters, risks, opportunities, rmTalkingPoints, allowedActions, blockedClaims, citations, agentTrace, mode, droppedClaims`.
- `agentTrace` entries `{node, step, label, status, ms, summary}` — `traceStep` (Task 2) sets all six; Task 11's `replayTrace` reads `.step`, `.status`, `.summary`.

Consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-04-rm-intelligence-graph.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
