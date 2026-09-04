> **⚠️ SUPERSEDED (2026-09-04) by `2026-09-04-rm-intelligence-evaluation-design.md`.**
> Never implemented. The composite-scoring-rubric evaluation model, the every-60s
> book-wide run, the client-side execution, the 4-segment spine, and the AI globe lens
> replace the on-demand server pipeline and full-screen takeover described below.
> Kept for history only.

# RM Intelligence Graph — design

**Date:** 2026-09-04
**Status:** approved for planning
**Base:** branch `chunyee` @ `87871ef` (noir refurbishment + Policy Sentinel + motion.js merged)

---

## 1. Goal

An AI co-pilot for relationship managers. One button — **Run Intelligence Review** — takes a
client's portfolio through a chain of analysis steps and produces an RM-ready briefing:
*what changed, why it matters for this specific client, what to say next, and what compliance
will challenge.*

Framing: **"Advisor Autopilot With Compliance Brake."** The system prepares the RM's
Monday-morning workbench. It never produces client-facing financial advice; the RM stays
central; every claim is traceable to a source.

Maps to the three sponsor building blocks: Intelligent Portfolio Explanations · Proactive Risk
and Opportunity Detection · RM Intelligence Workbench.

## 2. Non-goals

- No LangGraph library (Python or JS). The described flow is a linear DAG with one branch —
  a plain Node pipeline covers it. "Agentic" is the framing, not a dependency.
- No per-node LLM calls. Analysis nodes are deterministic; exactly one LLM call (RM Briefing).
- No lot-level data (cost basis, unrealised P&L, trade history). The repo has none and faking
  it well is a rabbit hole. Structured-product underlyings are already modelled by
  `instrument.exposures[]`.
- No new test framework. Manual checklist, matching the repo.
- No changes to `src/model/*` logic, the adapter seam, or the existing signal pipeline.
- The Evidence Verifier does not call an LLM — it is deterministic citation resolution.

## 3. Success criteria

1. `POST /api/intelligence-review` returns the full response shape (§8) for the demo portfolios.
2. Advisory-mandate output never contains "execute trade" / imperative trade language;
   discretionary output distinguishes "executable under mandate" from "inform the client".
3. Every sentence in the four RM-facing sections resolves to at least one citation; sentences
   that do not are dropped before render and counted in `droppedClaims`.
4. TinyFish routing rejects generic `/news` listing pages (existing `server/policy-sentinel.js`
   behaviour — unchanged, just surfaced).
5. With no keys and no network the review still completes end to end; `mode: "fallback"` badge
   is shown.
6. `npm run build` passes.

## 4. Architecture

A plain module. Nodes are functions over one shared `ctx` object, run in strict sequence. The
"branch" is inside the Evidence Verifier: it filters the briefing's sentences deterministically
and, if `summary` loses all support, substitutes the first surviving sentence. It never calls
the LLM again and never loops.

### 4.1 File layout

```
server/
  intelligence/
    pipeline.js     runPipeline(ctx) → runs the 8 nodes in order, times each,
                    builds ctx.trace, applies the verifier branch
    nodes.js        the 8 node functions (split into nodes/*.js only if it grows past ~400 lines)
    verify.js       evidenceVerifier: resolve every claim's cite ids against ctx.citations
  intelligence-review.js   request handler: validate body → build ctx → runPipeline → shape response
api/
  intelligence-review.js   Vercel serverless entry — thin wrapper over server/intelligence-review.js
                           (mirrors the existing api/policy-scan.js pattern)
src/
  signals/fixtures/markets.js   NEW — MARKETS[] + EVENTS_2026[]
  ui/intelligence.js            NEW — the full-screen takeover (timeline + 4 sections)
```

- `server/index.js` gains `app.post("/api/intelligence-review", …)` for local dev, calling the
  same `server/intelligence-review.js` handler the Vercel function uses.
- Deterministic nodes `import` from `src/model/lookthrough.js`, `src/model/scoring.js`,
  `src/model/houseview.js` directly — these are framework-free ES modules. No logic is copied.
- `src/store.js` is browser glue and is **not** imported server-side; the few selector
  compositions the nodes need (e.g. "positions for goal g") are re-expressed against the raw
  model functions inside `nodes.js`.

### 4.2 `ctx` — threaded through every node

```js
{
  input: {
    portfolioId, question,
    portfolio,        // the resolved Portfolio object (§schema.js), sent by the frontend
    instruments,      // { instrumentId → Instrument }
    signals,          // { iso3 → CountrySignal } — this week
    prevSignals,      // { iso3 → CountrySignal } — last week
    household          // boolean — use portfolio.householdPositions if true
  },
  facts: {},          // node outputs: facts.analyst, facts.market, facts.policy, facts.risk, facts.suitability
  citations: {},      // citationId → { kind, label, ref, value?, url? }   (see §6)
  claims: [],         // { id, text, section, cite: [citationId], status: "ok"|"dropped" }
  trace: []           // { node, label, status: "ok"|"fallback"|"skip", ms, summary }
}
```

### 4.3 `runPipeline(ctx)`

```
for each node in [loadContext, portfolioAnalyst, marketContext, policySentinel,
                  riskOpportunity, suitabilityMandate, rmBriefing, evidenceVerifier]:
    t0 = now()
    try:  await node(ctx)
    catch e:  ctx.trace.push({ node, status:"fallback", summary: e.message }); node-specific fallback
    ctx.trace[-1].ms = now() - t0
```

`rmBriefing` and `policySentinel` are the only nodes that can throw in normal operation; both
have explicit fallbacks (§5). Every other node is pure computation over `ctx`.

## 5. The 8 nodes

### 5.1 Load Context — deterministic

Validate `input.portfolio` with `validatePortfolio` (from `schema.js`). Select the active
position set (`householdPositions` when `input.household`). Register **base citations**, one each:

- per position: `pos:<instrumentId>` → `{ kind:"position", label:<name>, ref:<weightPct> }`
- per goal: `goal:<id>` → `{ kind:"goal", label:<name>, ref:<baseFunded> }`
- per signal event: the event's own `id` → `{ kind:"signal", label:<text>, ref:<source>, value:<value> }`
- per market series: `market:<id>` → `{ kind:"market", label:<label>, value:<last + chg7d> }`
- per 2026 event: `event:<id>` → `{ kind:"event", label:<label>, ref:<date> }`

Trace summary: `"<n> positions · <m> goals · <k> live signals"`.

### 5.2 Portfolio Analyst — deterministic

Reuse: `positionRiskDelta(inst, signals)`, `countryExposure(positions, instruments)`,
`goalDelta(goal, positions, instruments, signals, prevSignals)`, `riskConcentration(...)`,
`flaggedPositions(...)`.

`facts.analyst = {`
- `movers`: positions sorted by `|riskDelta| × weightPct`, top 5 — each `{ instrumentId, riskDelta, weightPct, drivesGoals:[goalId], lookThroughTop:[{iso3, weight}] }`
- `goalMoves`: every goal `{ id, funded, prevFunded, change, topContributor }`
- `concentration`: `{ pct, countries:[iso3] }`
- `flagged`: instrument ids over the flag threshold
`}`

Claims (each with `cite`):
- per mover: `"<name> look-through risk <±d> over seven days"` → `cite:[<signal event ids for its exposed countries>, pos:<id>]`
- per moved goal: `"<goal> funding <fell|rose> <prevFunded>→<funded>%"` → `cite:[goal:<id>]`
- concentration: `"<pct>% of deteriorating exposure sits in <countries>"` → `cite:[pos ids + signal ids]`

### 5.3 Market Context — deterministic

For each `facts.analyst.movers` entry, rule-match to market context:

- assetClass/sector heuristics: tech-heavy exposure → `market:tw-tech` + `market:vix`;
  energy sector or Gulf exposure → `market:brent`; any bond → `market:ust10`; non-base
  currency exposure → `market:usdsgd`.
- if a `EVENTS_2026` entry's `date` is within 10 days of "now" (`CONFIG.ASOF`) and its `tag`
  matches the mover's driver (`rates`→bonds/rate-sensitive, `oil`→energy), attach it.

`facts.market = { ties: [{ instrumentId, seriesId, seriesMove, eventId? , line }] }`

Claims: `"<name>'s move tracks the <±x> shift in <series label>[, around the <event label> on <date>]"`
→ `cite:[market:<id>, event:<id>?, pos:<id>]`.

### 5.4 Policy Sentinel — TinyFish, own fallback

`facts.policy = await runPolicySentinelScan({ query: CONFIG-derived, includeDomains, recencyMinutes })`
(unchanged function from `server/policy-sentinel.js`; it has offline + validation-failure
fallbacks built in).

Register citations from `facts.policy.citations`: `policy:<url>` →
`{ kind:"policy", label:<citation.label>, url:<citation.url>, value:<citation.quote> }`.

Claims:
- `"<issuer> policy stance reads <stance> (<stanceScore>)"` → `cite:[policy:<url>]`
- `"<signal.whyFlagged>"` → `cite:[policy:<url>]`
- affected assets that intersect the portfolio's holdings → a claim linking them, `cite:[policy:<url>, pos:<id>]`

Trace status = `facts.policy.mode` (`"live"` or `"fallback"`).

### 5.5 Risk / Opportunity Detector — deterministic

Pattern rules over `facts.analyst` + `facts.market` + `facts.policy`:

**Risks** (each → a claim, `section:"risks"`):
- concentration `pct` above the soft single-country limit (10%) → risk, `cite` the concentration claim
- ≥2 flagged positions sharing a chokepoint (via `chokepointExposure`) → risk
- a goal whose `funded` crossed below a band (95 / 80) this week → risk, `cite:[goal:<id>]`
- lombard `headroomPct` below 25% (if `portfolio.lombard`) → risk
- a policy stance that contradicts the house view (`reconcile`) on a held country → risk

**Opportunities** (`section:"opportunities"`):
- an easing policy stance (`policyStance < -0.3`) on a country a goal depends on → opportunity
- a market series move that *reduces* drag on a lagging goal → opportunity
- a mover that improved (`riskDelta < -6`) and funds a goal → opportunity

`facts.risk = { risks:[…], opportunities:[…] }` — each item `{ text, cite, severity }`.

### 5.6 Suitability & Mandate — deterministic

`m = portfolio.mandate` (`"Advisory"` | `"Discretionary"` | `"Execution only"`).

For each risk/opportunity item that implies an action (trim / hedge / rebalance / collateral):
- `Discretionary` → `{ action, class: "executable-under-mandate", plus a report-to-client note }`
- `Advisory` → `{ action, class: "requires-client-instruction" }`
- `Execution only` → `{ action, class: "inform-only" }`

Limit checks (produce `blockedClaims` — phrasing the RM must NOT use):
- concentration over hard limit → block "no concentration concern"
- non-base-currency exposure over 25% → block "currency-hedged"
- LTV / lombard headroom low → block "ample borrowing capacity"
- any imperative trade instruction in an Advisory context → block

`facts.suitability = { allowedActions:[…], blockedClaims:[…], limitChecks:[…] }`.

### 5.7 RM Briefing — one LLM call

`callLLM({ system, prompt, schema })` from `server/llm.js`.

- **system:** "You are preparing a relationship manager's internal briefing. You may only
  arrange the facts and claims provided. Every sentence must reference at least one claim id
  from the input. Do not invent facts, figures, or sources. Do not write client-facing advice
  or recommendations — this is RM decision support. Keep it terse and concrete."
- **prompt:** JSON dump of `ctx.facts` + `ctx.claims` (id + text + section), plus
  `input.question`.
- **schema:**
  ```
  { summary: string,
    whatHappened:  [{ text: string, cite: [claimId] }],
    whyItMatters:  [{ text: string, cite: [claimId] }],
    whatToDiscuss: [{ text: string, cite: [claimId] }] }
  ```
- **fallback** (`callLLM` throws — no key, model down): a deterministic template that stitches
  the top claims per section into sentences, each carrying its real `cite`. Same shape.
  `ctx.trace` status `"fallback"`, response `mode: "fallback"`.

### 5.8 Evidence Verifier — deterministic

For every `{ text, cite }` in `whatHappened / whyItMatters / whatToDiscuss` and every `summary`
sentence:
- resolve each `claimId` in `cite` → the claim → its `citation` ids → check each resolves in
  `ctx.citations`.
- **all resolve** → keep.
- **any unresolved** → drop the sentence; `ctx.droppedClaims++`.

If `summary` itself loses all support, replace it with the first surviving `whatHappened`
sentence. One re-filter pass only; never loops.

Trace summary: `"<kept> claims verified, <dropped> dropped"`.

## 6. Citation & evidence model

The defensible core. Two levels:

- **Citations** (`ctx.citations`) — atomic, verifiable references registered by nodes 1 and 4:
  a portfolio field, a computed value, a signal event, a market datapoint, a policy source.
  `{ kind: "position"|"goal"|"signal"|"market"|"event"|"policy"|"calc", label, ref?, value?, url? }`
- **Claims** (`ctx.claims`) — assertions made by the deterministic nodes, each pointing at one
  or more citations. The LLM is given claim ids and must cite *those*; the verifier walks
  claim → citations to confirm the chain resolves end to end.

`response.citations[]` is the flattened, de-duplicated list of every citation referenced by a
*surviving* sentence, each `{ id, kind, label, value?, url? }` — this populates the Evidence tab.

Nothing reaches the RM-facing sections without a resolving chain. This is what "compliance
brake" means concretely.

## 7. New data — `src/signals/fixtures/markets.js`

```js
export const MARKETS = [
  { id:"gold",    label:"Gold",            unit:"USD/oz",  last:2410,  chg7d:-1.8, series:[/* ~8 weekly pts */] },
  { id:"brent",   label:"Brent crude",     unit:"USD/bbl", last:79,    chg7d:+4.2, series:[…] },
  { id:"ust10",   label:"US 10y yield",    unit:"%",       last:4.31,  chg7d:+0.12, series:[…] },
  { id:"usdsgd",  label:"USD/SGD",         unit:"",        last:1.352, chg7d:+0.9, series:[…] },
  { id:"vix",     label:"Volatility (VIX)",unit:"",        last:17.4,  chg7d:+2.1, series:[…] },
  { id:"tw-tech", label:"Taiwan tech basket", unit:"idx",  last:188,   chg7d:-6.0, series:[…] }
];

export const EVENTS_2026 = [
  { id:"e-fomc-mar", date:"2026-03-18", label:"FOMC rate decision",          tag:"rates" },
  { id:"e-opec-apr", date:"2026-04-05", label:"OPEC+ ministerial meeting",   tag:"oil" },
  { id:"e-snb-mar",  date:"2026-03-26", label:"SNB policy assessment",       tag:"rates" },
  { id:"e-mas-apr",  date:"2026-04-14", label:"MAS semi-annual statement",   tag:"rates" },
  { id:"e-tw-elec",  date:"2026-01-11", label:"Taiwan legislative session",  tag:"geopolitics" },
  { id:"e-us-cpi",   date:"2026-03-11", label:"US CPI print",                tag:"rates" }
];
```

Values are illustrative and fabricated — the disclaimer strip already covers this. `chg7d` is
the number the Market Context node reasons from; `series` is for a sparkline in the Evidence
tab (optional in v1).

## 8. API contract

### `POST /api/intelligence-review`

```
request:
{
  "portfolioId": "…",
  "question":    "What should I know before calling this client?",
  "portfolio":   { …resolved Portfolio… },
  "instruments": { …id → Instrument… },
  "signals":     { …iso3 → CountrySignal… },
  "prevSignals": { …iso3 → CountrySignal… },
  "household":   false
}

response:
{
  "summary":              "…",
  "portfolioExplanation": [{ text, cite }],      // whatHappened — joined for the plain string in the note
  "whyItMatters":         [{ text, cite }],
  "risks":                [{ text, cite, severity }],
  "opportunities":        [{ text, cite, severity }],
  "rmTalkingPoints":      [{ text, cite }],      // whatToDiscuss
  "allowedActions":       [{ action, class, note? }],  // class: "executable-under-mandate" | "requires-client-instruction" | "inform-only"
  "blockedClaims":        [{ text, reason }],
  "citations":            [{ id, kind, label, value?, url? }],
  "agentTrace":           [{ node, label, status, ms, summary }],
  "mode":                 "live" | "fallback",
  "droppedClaims":        0
}
```

Field provenance: `summary` / `portfolioExplanation` / `whyItMatters` / `rmTalkingPoints` come
from the RM Briefing LLM node (§5.7), post-verifier. `risks` / `opportunities` come from node 5
(§5.5). `allowedActions` / `blockedClaims` come from node 6 (§5.6). `citations` is the flattened
set referenced by surviving sentences (§6).

- `mode` is `"fallback"` if **either** the policy node **or** the LLM node fell back.
- The frontend sends `portfolio` / `instruments` / `signals` from its own `S` — the server
  never loads adapter fixtures and never receives keys from the browser.
- On total failure (bad body, unhandled throw) → `502 { error }`; the UI shows the error state
  (§9) and offers retry.
- `GET /api/policy-scan` is unchanged and still independently callable.

### Dev vs deploy

`server/index.js` route for `npm run server` / `npm run dev:all`; `api/intelligence-review.js`
for Vercel. Both call `server/intelligence-review.js`. `TINYFISH_API_KEY`, `ANTHROPIC_API_KEY`
/ `OPENAI_API_KEY` are read from the environment server-side only.

## 9. UI — `src/ui/intelligence.js`

### Top bar

The three buttons collapse to one primary: **"Run Intelligence Review"**. `Generate note` and
`Run live policy scan` are removed from the bar; both remain reachable *inside* the review
(§ Phase 2). `openBrief` and `openPolicyTrial` in `drawers.js` are unchanged and still exported.

### The overlay

Full-screen, `position:fixed`, above the cockpit (same pattern as the title screen; `z-index`
above `.slideover`). Built when the button is clicked; removed on close. Respects
`prefers-reduced-motion` (steps appear resolved, no timeline animation).

**Phase 1 — the run.** Seven labelled steps:

1. Reading client objectives
2. Explaining portfolio movement
3. Checking concentration, liquidity and currency risk
4. Searching official policy sources
5. Testing against suitability constraints
6. Drafting RM briefing
7. Verifying citations

The `fetch` fires immediately. When the response lands, the seven steps light up in sequence
from `agentTrace` (~350 ms each; a step showing `status:"fallback"` gets a muted amber dot and
its `summary`). Total replay ≈ 2.5 s. A live `fallback` badge appears if `mode==="fallback"`.
If the fetch errors: the steps stop, an inline error with a "Try again" button.

**Phase 2 — the output.** Four tabs:

| Tab | Content |
|---|---|
| **What happened** | `summary` + `portfolioExplanation` sentences — plain-English portfolio movement |
| **Why it matters** | `whyItMatters` sentences; then `risks[]` and `opportunities[]` as two labelled lists (each item carries its `severity` and cites) |
| **What to discuss** | `rmTalkingPoints`; below them `allowedActions[]` each tagged with its `class`; a **"Draft client note"** button → existing `openBrief`. A visible line: *"RM talking points — not client-facing advice."* |
| **Evidence** | every entry in `response.citations` grouped by `kind`, each showing `label` + `value` + (for policy) a link; a **"Open policy agent trial"** button → existing `openPolicyTrial`. `blockedClaims[]` listed here under "Language requiring suitability review" (`text` + `reason`). `droppedClaims` count shown if > 0. |

Close (× or Esc) → cockpit.

### Offline / no keys

No `fetch` failure — the server completes the pipeline with the policy fallback and the LLM
template. The overlay shows every step (step 4 and step 6 with the amber fallback dot), the
four tabs populate, and the `fallback` badge is shown. Nothing is hidden.

## 10. Error handling & fallback — summary

| Condition | Behaviour |
|---|---|
| No `TINYFISH_API_KEY` / TinyFish down / validation fails | `runPolicySentinelScan` returns its seeded fallback; step 4 amber; `mode:"fallback"` |
| No LLM key / model down / non-JSON | RM Briefing template fallback; step 6 amber; `mode:"fallback"` |
| LLM returns sentences with unresolvable cites | Verifier drops them; `droppedClaims` shown; never surfaced to RM tabs |
| Bad request body / unhandled throw | `502 { error }`; UI error state + retry |
| `prefers-reduced-motion` | Timeline steps appear resolved; no animation |
| `npm run build` | Unaffected — new files are ES modules; UI overlay is lazy-imported like the title screen |

## 11. Testing

Manual, checklist-driven (no framework — matches the repo):

1. Run the review on one advisory portfolio and one discretionary portfolio (e.g. Bergmann /
   Vogt — confirm the current `src/adapters/demo.js` names after the merge).
2. Advisory output contains no imperative trade language ("execute", "buy", "sell now");
   grep the four sections.
3. Discretionary output's `allowedActions` distinguish `executable-under-mandate` from
   `inform-only`.
4. Every sentence in the four tabs has ≥1 citation that appears in the Evidence tab.
5. Point `POLICY_SCAN_QUERY` at a generic MAS news URL → the scan rejects it and falls back
   (existing behaviour; confirm it still holds through the node).
6. Unset all keys, `OFFLINE=1` → review completes, `fallback` badge shown, all tabs populate.
7. `npm run build` passes; `npm run dev:all` serves the review end to end.
8. Reduced-motion emulation → no timeline animation, output still reachable.

## 12. Resolved decisions

- **Orchestration:** hand-rolled Node pipeline, not LangGraph.
- **Node execution:** deterministic analysis nodes + one LLM call (RM Briefing) + deterministic
  verifier.
- **Risk/Opportunity Detector:** deterministic pattern rules, not LLM judgement.
- **RM Briefing LLM scope:** writes only the four prose sections; `risks` / `opportunities` /
  `blockedClaims` are produced deterministically by nodes 5–6.
- **Data:** one new fixtures file (market series + 2026 events). No lot-level data.
- **UI:** full-screen takeover; one button that absorbs "Generate note" and "Run live policy
  scan" (both still reachable inside).
- **Timeline:** replay of `agentTrace` after the response lands (not streamed).
- **Provider:** reuse `server/llm.js` `callLLM` as-is (Anthropic-then-OpenAI). Model id / params
  are a plan-time detail (see the `claude-api` reference at implementation).
