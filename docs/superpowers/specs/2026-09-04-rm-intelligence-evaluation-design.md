# RM Intelligence — Evaluation Model — design

**Date:** 2026-09-04
**Status:** approved for planning
**Base:** branch `chunyee` @ `2aa77d9` (noir refurb + Policy Sentinel + motion merged; v1 intelligence-graph spec/plan committed but never implemented)
**Supersedes:** `2026-09-04-rm-intelligence-graph-design.md` and its plan.

---

## 1. Goal

A background evaluation model that scores the whole book every minute and routes typed
outputs to three frontend surfaces:

- **The globe** — a per-country AI risk score (a new 5th lens).
- **The client spine** — Explanation → Situation → Analysis → Actions for the selected client.
- **The dashboard** — a book-wide Urgent-tasks strip above the spine, surfaced *before* you open
  a client.

Framing unchanged: **"Advisor Autopilot With Compliance Brake."** The model prepares the RM's
workbench; it never issues client-facing advice; every flagged item is traceable.

The evaluation is a **composite scoring rubric** — deterministic weighted scores over signals,
portfolio exposure, and vendored market history. An LLM writes only the Explanation prose on top.

## 2. Non-goals

- No LangGraph, no server-side agent pipeline, no `/api/intelligence-review` endpoint. (v1's.)
- No full-screen takeover, no agent-run timeline, no 4-tab modal. (v1's.)
- No per-node LLM calls. Exactly one LLM touch: `narrateClient` → `{ thesis, summary }`.
- No live market-data feed. A vendored ~2-year synthetic-but-plausible dataset behind an
  API-shaped access layer; a real feed swaps the module body later.
- No new npm dependencies. Tests use the built-in `node:test` runner.
- No changes to `src/model/*` logic, `src/adapters/*`, `server/policy-sentinel.js`,
  `server/llm.js`. Import them; do not edit them.
- Goals / Positions / Conversation stop being top-level spine segments (they move to a drawer);
  their underlying data and the existing drawers are unchanged.

## 3. Success criteria

1. On boot and on every `pollSignals` tick (~60 s), `S.evaluation` is recomputed deterministically
   with zero network calls, and the globe / urgent strip / client segments reflect it.
2. The globe's **"AI risk"** lens is present, is the default on load, and colours each country by
   `S.evaluation.countries[iso3].score`.
3. The Urgent strip lists tasks from **all** clients with `urgency ≥ URGENT_CUTOFF`, sorted; a
   click selects that client and scrolls to the Action.
4. The client spine renders exactly four segments in order: Explanation, Situation, Analysis,
   Actions.
5. `narrateClient` fires **only** for the open client and **only** when its score-hash changed or
   it has no prose yet — never on an idle tick. With no LLM key it falls back to a deterministic
   template; the review still shows a thesis + summary.
6. Every risk / opportunity / action in `S.evaluation` carries a non-empty `cite` array whose ids
   resolve to a signal event, a market datapoint, a portfolio field, a policy source, or an RM note.
7. Advisory-client Actions never contain imperative trade language ("buy", "sell", "execute",
   "switch"); discretionary Actions distinguish `executable-under-mandate` from `inform-only`.
8. Works fully offline (`CONFIG.OFFLINE` / no keys): rubric runs, narration templates, policy
   input uses its own fallback.
9. `npm run build` passes; `node --test src/eval/ src/market/` passes.

## 4. Architecture — client-side, pure functions

### 4.1 File layout

```
src/market/
  history.js   MARKET_HISTORY — ~12 series, ~2y daily, vendored (synthetic-but-plausible)
  index.js     the access layer: getSeries · latest · returns · volatility · percentileVsHistory
src/eval/
  rubric.js    every weight, threshold, cutoff, and SERIES_BY_ISO — one tunable file
  countryScore.js   scoreCountries(signals, prevSignals, market) → { iso3 → CountryScore }
  clientEval.js      evaluateClient(portfolio, instruments, signals, countryScores, policyScan) → ClientEval
  urgent.js          collectUrgent(clientEvals, cutoff) → UrgentTask[]
  narrate.js         narrateClient(clientEval, portfolio, rmNotes) → { thesis, summary }   (LLM, template fallback)
  evaluate.js        runEvaluation({ portfolios, instruments, signals, prevSignals, market, policyScan }) → Evaluation
src/ui/
  urgent.js    paintUrgent(onPick) — the dashboard strip
  segments.js  paintExplanation() · paintAnalysis() · paintActions()   (paintSituation stays in panels.js)
src/store.js   + S.evaluation, + selector helpers
src/main.js    + refreshEvaluation() hook in boot and the poll callback; + open-client narration
src/ui/shell.js  + #urgent element, + 5th lens button, spine → 4 segments
src/ui/globe.js  + reads the "ai" lens (one-line: the lens's val closure)
src/ui/palette.js  + the "ai" lens in LENSES()
src/ui/styles.css  + .urgent-*, .seg tweaks
```

`src/eval/*` and `src/market/*` are framework-free ES modules — importable by `node:test` and by
the browser identically, exactly like `src/model/*`.

### 4.2 Data flow

```
boot:
  … load portfolios/instruments, fetchSignals …            (existing)
  refreshEvaluation()                                       (new — see below)
  renderAll(); M.boot()

pollSignals callback (~60s):
  S.signals = signals; S.prevSignals = prevSignals          (existing)
  refreshEvaluation()                                       (new)
  renderAll()                                               (existing)

refreshEvaluation():
  S.evaluation = runEvaluation({
    portfolios: S.portfolios, instruments: S.instruments,
    signals: S.signals, prevSignals: S.prevSignals,
    market: marketData,                    // the src/market/index.js module
    policyScan: S.policyScan               // may be null; folded in if present
  });
  maybeNarrateOpenClient();                // async, fire-and-forget

maybeNarrateOpenClient():
  const id = S.portfolio.id;
  const ev = S.evaluation.clients[id];
  if (ev.thesis && S.evaluation.hash[id] === S.narratedHash[id]) return;   // unchanged, already done
  narrateClient(ev, S.portfolio, rmNotesFor(S.portfolio)).then(({thesis, summary}) => {
    ev.thesis = thesis; ev.summary = summary;
    S.narratedHash[id] = S.evaluation.hash[id];
    paintExplanation();
  });

policy scan (existing trigger, unchanged) → sets S.policyScan → folded in on the next tick.
```

### 4.3 State additions (`src/store.js`)

```js
S.evaluation = null;      // Evaluation | null
S.narratedHash = {};      // portfolioId → hash string last passed to narrateClient
```
Selector helpers: `countryScore(iso3)`, `clientEval()` (for `S.portfolio`), `urgentTasks()`.

## 5. The evaluation output

```
Evaluation = {
  at: number,                                   // Date.now()
  countries: { [iso3]: CountryScore },
  clients:   { [portfolioId]: ClientEval },
  urgent:    UrgentTask[],                       // sorted urgency desc, capped 8
  hash:      { [portfolioId]: string }           // stable digest of the client's rubric inputs+outputs
}

CountryScore = {
  iso3, score: 0..100, band: "low"|"elevated"|"high"|"acute",
  trend: number,                                 // score(now) − score(prev), roughly −40..+40
  drivers: [{ label: string, contribution: 0..100 }]   // top 3 by contribution, desc
}

ClientEval = {
  portfolioId, name, mandate,
  health: 0..100, healthBand: "strong"|"watch"|"strained",
  exposureScore: 0..100,                         // portfolio-weighted country risk
  drivers: [{ label, penalty }],                 // top penalties on health, desc
  thesis: string | null,                         // LLM prose — null until narrated
  summary: string | null,                        // LLM prose
  risks:         Finding[],
  opportunities: Finding[],
  actions:       Action[]
}

Finding = { id: string, text: string, severity: "high"|"medium"|"low", urgency: 0..100, cite: string[] }
Action  = { id: string, text: string, kind: "reduce-risk"|"use-opportunity"|"fit-needs",
            urgency: 0..100, mandateClass: "executable-under-mandate"|"requires-client-instruction"|"inform-only",
            reason: string, cite: string[] }

UrgentTask = { portfolioId, clientName, actionId, text, urgency, kind }
```

**Citation ids** (`cite` entries) follow v1's scheme: `pos:<instrumentId>`, `goal:<id>`,
`<signal event id>` (e.g. `twn-1`), `market:<seriesId>`, `policy:<url>`, `note:<portfolioId>-<n>`.
A registry is built inside `evaluate.js` (`ctx.citations`) and flattened onto the response only
for surviving items; the UI shows the count as a chip and the Evidence is the drawer/tooltip.

## 6. The rubric (`src/eval/rubric.js` — all values here, tunable in one place)

```js
export const COUNTRY_WEIGHTS = {
  instability: 0.30,   // raw 0..100
  tone:        0.15,   // |σ| → 0..100, capped at 3σ
  policy:      0.10,   // |policyStance| → 0..100, capped at 3
  chokepoint:  0.15,   // strained-chokepoint count touching the country / 3, → 0..100
  volatility:  0.20,   // market.percentileVsHistory(seriesForIso, "vol") → 0..100
  sentinel:    0.10    // if policyScan.signal.country === iso: |stanceScore| × 100, else 0
};
export const COUNTRY_BANDS = { low: 25, elevated: 50, high: 72 };   // ≥ high → "acute"

export const HEALTH_PENALTIES = {
  goalGap:        0.9,   // Σ (100 − goal.funded) × goalWeight, ÷ nGoals
  concentration:  1.0,   // riskConcentration.pct, ×2 if > CONC_HARD
  exposure:       0.8,   // Σ (posWeight/100 × countryScore[primaryCountry]) — already 0..100-ish
  lombard:        12,    // flat, if headroomPct < 25
  mandateFit:     0.3    // |realised book vol − riskBand midpoint| capped
};
export const HEALTH_BANDS = { strong: 75, watch: 50 };   // < watch → "strained"

export const CONC_SOFT = 10;
export const CONC_HARD = 12;

export const URGENCY = {
  // urgency = clamp(0..100, severityBase + horizonBoost + trendBoost)
  severityBase: { high: 55, medium: 35, low: 15 },
  horizonMonthsNear: 18,   // a goal within N months of its horizon → +20
  horizonBoost: 20,
  trendBoostPerPoint: 1.2  // × the driving country's `trend`, capped +25
};
export const URGENT_CUTOFF = 65;
export const URGENT_STRIP_MAX = 8;

export const SERIES_BY_ISO = {
  TWN: "tw-tech", KOR: "kospi", CHN: "hscei", SAU: "brent", SGP: "sti",
  NLD: "sx5e", DEU: "sx5e", GBR: "ukx", USA: "spx", JPN: "nky",
  IND: "nifty", BRA: "ibov", CHE: "smi"
};
// Fallbacks: any iso not mapped uses "spx" for volatility context.
```

### 6.1 Country score

`raw = Σ COUNTRY_WEIGHTS[k] × norm_k(signal, market)`, `score = clamp(0, 100, raw)`.
`trend = scoreFrom(signals[iso]) − scoreFrom(prevSignals[iso] ?? signals[iso])` (volatility &
sentinel terms held constant between the two — only the signal-derived terms move week to week).
`band` from `COUNTRY_BANDS`. `drivers` = the 3 largest `weight × norm` terms, labelled
("Instability", "Market volatility", "Policy stress", "Chokepoint strain", "Narrative tone",
"Policy signal").

### 6.2 Client health

`exposureScore` = `Σ (position.weightPct/100 × countryScores[primaryCountry(instrument)].score)`,
clamped 0..100 — the portfolio-weighted country risk, shown in Explanation as its own number.
`health = clamp(0, 100, 100 − Σ penalties)` where the `exposure` penalty = `exposureScore ×
HEALTH_PENALTIES.exposure` and the others are per `HEALTH_PENALTIES`. `healthBand` from
`HEALTH_BANDS`. `drivers` = the penalty terms sorted desc with labels.

### 6.3 Risks / opportunities

The v1 pattern rules, unchanged in spirit, now each producing a `Finding` with a computed
`urgency`:

| Rule | severity | cite |
|---|---|---|
| Look-through single-country concentration ≥ `CONC_SOFT` | `pct ≥ 60` → high, else medium | signal events for the worst country + `pos:` of the top mover |
| ≥ 2 flagged positions share a chokepoint (`chokepointExposure`) | high | `pos:` of each |
| A goal's `funded` crossed below 95 or 80 this week (`goalDelta`) | 80 → high, 95 → medium | `goal:<id>` |
| `lombard.headroomPct < 25` | `< 15` → high, else medium | `goal:<id>` of goal 0 |
| House-view tension (`reconcile`) on a held, deteriorating country | medium | `pos:`, signal events |
| **opp:** a mover improved `riskDelta ≤ −6` and funds ≥ 1 goal | low | `pos:`, signal events |
| **opp:** policy easing (`policyStance ≤ −0.3`) in a country a goal depends on | low | signal event, `goal:` |

`urgency = clamp(0, 100, URGENCY.severityBase[severity] + horizonBoost + trendBoost)` where
`horizonBoost` applies if the finding names a goal within `horizonMonthsNear` of its horizon, and
`trendBoost = min(25, URGENCY.trendBoostPerPoint × max(0, drivingCountryTrend))`.

### 6.4 Actions

Each `Finding` maps to one `Action`:
- risk → `kind: "reduce-risk"`; opportunity → `kind: "use-opportunity"`.
- Plus `fit-needs` actions from RM notes: for each `portfolio.relationship.concerns[i]` that
  matches a live condition (keyword match against the finding set — e.g. "de-risk" + a rising
  goal exposure; "cost-sensitive on hedging" + a hedge action present), emit an action citing
  `note:<portfolioId>-concern-<i>`.
- `mandateClass` from `portfolio.mandate`: Discretionary → `executable-under-mandate`,
  Advisory → `requires-client-instruction`, Execution only → `inform-only`.
- `text` is the action, phrased as a task ("Bring the concentration down to the mandate line" —
  never "Sell TSM"). `reason` = a one-line why, drawn from the finding + (if present) the RM note.
- `urgency` = the parent finding's urgency (fit-needs actions: `severityBase.medium + horizonBoost`).
- Advisory / Execution-only guard: the phrasing pass strips imperative verbs; if a generated
  `text` contains one it is rewritten to the "bring / review / put to the client" form.

### 6.5 Urgent

`collectUrgent(clientEvals, URGENT_CUTOFF)` = every `Action` across every client with
`urgency ≥ cutoff`, as `UrgentTask`, sorted `urgency` desc, sliced to `URGENT_STRIP_MAX`.

### 6.6 Hash

`hash[portfolioId]` = a short stable digest (e.g. `JSON.stringify` of `{ health, risks: risks.map(r=>[r.id,r.urgency]), actions: actions.map(a=>[a.id,a.urgency]) }` run through a tiny FNV-1a). Drives `maybeNarrateOpenClient`.

## 7. The one LLM touch — `narrateClient`

`narrateClient(clientEval, portfolio, rmNotes) → { thesis, summary }`. POSTs `/api/llm` (existing
`callLLM({ system, prompt, schema })`).

- **thesis** (2–3 sentences): what this portfolio is *built to do* — its goals, mandate, risk band,
  the shape of the book. Time-stable; rarely changes.
- **summary** (2–3 sentences): where it stands *now* given the evaluation — the health band and the
  one thing that matters this week.
- **system:** "Arrange only the facts we give you. No new facts, no client-facing advice, never the
  words buy / sell / execute / switch. Two short paragraphs. JSON only."
- **schema:** `{ thesis: "string", summary: "string" }`.
- **fallback** (`callLLM` throws): deterministic template — `thesis` from goals+mandate+riskBand,
  `summary` from `healthBand` + the top risk. Never blocks; `S.evaluation` already has everything.

Called only from `maybeNarrateOpenClient` (§4.2): open client, hash changed or no prose yet.

## 8. Market data (`src/market/`)

### 8.1 `src/market/history.js`

```js
export const MARKET_HISTORY = {
  spx:     { id:"spx",     label:"S&P 500",           unit:"idx", points:[{ d:"2024-01-02", c:4742.8 }, … ] },
  nky:     { id:"nky",     label:"Nikkei 225",        unit:"idx", points:[…] },
  sx5e:    { id:"sx5e",    label:"Euro Stoxx 50",     unit:"idx", points:[…] },
  ukx:     { id:"ukx",     label:"FTSE 100",          unit:"idx", points:[…] },
  smi:     { id:"smi",     label:"SMI",               unit:"idx", points:[…] },
  sti:     { id:"sti",     label:"Straits Times",     unit:"idx", points:[…] },
  hscei:   { id:"hscei",   label:"HS China Ent.",     unit:"idx", points:[…] },
  kospi:   { id:"kospi",   label:"KOSPI",             unit:"idx", points:[…] },
  "tw-tech":{id:"tw-tech", label:"Taiwan tech basket",unit:"idx", points:[…] },
  nifty:   { id:"nifty",   label:"Nifty 50",          unit:"idx", points:[…] },
  ibov:    { id:"ibov",    label:"Ibovespa",          unit:"idx", points:[…] },
  brent:   { id:"brent",   label:"Brent crude",       unit:"USD/bbl", points:[…] },
  gold:    { id:"gold",    label:"Gold",              unit:"USD/oz",  points:[…] },
  ust10:   { id:"ust10",   label:"US 10y yield",      unit:"%",  points:[…] },
  usdsgd:  { id:"usdsgd",  label:"USD/SGD",           unit:"",   points:[…] },
  vix:     { id:"vix",     label:"VIX",               unit:"",   points:[…] }
};
```
~16 series, **weekly** points from 2024-01 to 2026-09 (~140 points each — keeps the file ~120 KB,
fine to bundle). Synthetic-but-plausible: each series a seeded random walk with a realistic drift
and vol, with a visible drawdown episode in mid-2025 (so the volatility/percentile terms have
signal). Authored by a one-off generator script kept in `scripts/gen-market-history.mjs` (not
shipped, output committed).

### 8.2 `src/market/index.js` — the access layer

```js
import { MARKET_HISTORY } from "./history.js";

export function getSeries(id, { from, to } = {}) { … }          // [{ d, c }], date-filtered, [] if unknown id
export function latest(id) { … }                                // { d, c } | null
export function returns(id, days) { … }                         // % change over ~days (nearest points), 0 if n/a
export function volatility(id, window = 26) { … }               // annualised realised vol %, over the last `window` points
export function percentileVsHistory(id, metric = "vol") { … }   // 0..1 — where the current window's vol/return sits in the full history's distribution
```
A live feed later replaces the four function bodies to hit an API; signatures and `history.js`
stay as the offline fallback.

## 9. Frontend surfaces

### 9.1 Globe — the "AI risk" lens

`src/ui/palette.js` `LENSES()` gains:
```js
ai: {
  label: "AI risk score",
  cap: "Sequential. The model's composite country risk — signals, exposure and market volatility combined.",
  lo: "0 calm", mid: "", hi: "100 acute", ramp: P.SQ,
  val: c => (typeof S !== "undefined" && S.evaluation?.countries?.[c.iso3]?.score) || 0,
  fmt: v => Math.round(v),
  col: v => P.SQ[Math.min(4, Math.floor(v / 20))]
}
```
`palette.js` imports `S` from `../store.js` for the closure (it currently does not — add the
import; `store.js` does not import `palette.js` back, so no cycle). If that coupling proves
awkward at plan time, the alternative is a module-level `let AI_SCORES = {}` in `palette.js` with
an exported `setAiScores(map)` that `refreshEvaluation()` calls — the lens reads `AI_SCORES`,
no store import. Decide at plan time; the closure is the default.
`src/ui/shell.js` lens bar gains `<button data-lens="ai" aria-pressed="true">AI risk</button>` and
the four existing buttons flip to `aria-pressed="false"`. `src/store.js` `S.lens = "ai"`.
`src/ui/globe.js` is unchanged — it already does `LENSES()[S.lens].col(L.val(sig(iso)))`; `sig(iso)`
is the CountrySignal which carries `.iso3`, which the `ai` lens's `val` uses. The country tooltip
(also `globe.js`) gains a line for `S.evaluation.countries[iso].drivers` when the lens is `ai` —
one small template addition.

### 9.2 Urgent strip

`src/ui/shell.js` — a new element between `.tick-strip` and `.stage`:
```html
<div class="urgent-strip" id="urgent" hidden></div>
```
`src/ui/urgent.js` `paintUrgent(onPick)`:
- reads `S.evaluation.urgent`; if empty, `#urgent` stays `hidden`.
- renders each task as a `<button class="urgent-task urg-<kind>">` showing `clientName` · `text` ·
  an urgency pip.
- `onPick(task)` → `S.portfolio = S.portfolios.find(p => p.id === task.portfolioId)`, `renderAll()`,
  then scroll `#seg-actions` into view and add a `.flash` class to the matching `[data-action="<id>"]`.
- Called from `renderAll()`.

### 9.3 Client spine — 4 segments

`src/ui/shell.js` `.spine` becomes:
```html
<div class="spine" id="spine">
  <section class="seg" id="seg-explanation"></section>
  <section class="seg" id="seg-situation"></section>
  <section class="seg" id="seg-analysis"></section>
  <section class="seg" id="seg-actions"></section>
</div>
```

- **`paintExplanation()`** (`src/ui/segments.js`) — seg header "Explanation"; a health dial
  (`health` + `healthBand`); `thesis` and `summary` (Spectral prose; a "…" shimmer while
  `thesis === null`); a compact rollup — top 3 goals with funding %, top 3 positions by weight;
  `drivers` as small chips; a **"Full portfolio"** button → a drawer (`openPortfolioDetail()` in
  `drawers.js`, new) showing the old goals + positions detail (reuse the existing goal-card and
  position-card markup / `lookThroughBar`).
- **`paintSituation()`** — the existing function in `panels.js`, unchanged: "what changed
  overnight", house view, policy radar. It is already global (not client-filtered). Only the seg
  header text confirms "Situation — the global picture".
- **`paintAnalysis()`** (`src/ui/segments.js`) — seg header "Analysis"; `risks[]` then
  `opportunities[]` from `clientEval()`; each row: severity dot, `text`, an urgency pip, a
  `N cites` chip. Urgent rows (`urgency ≥ URGENT_CUTOFF`) get an amber left border.
- **`paintActions()`** (`src/ui/segments.js` — replaces the current `paintActions` in
  `spine.js`; that file's old action-card logic is retired) — seg header "Actions"; actions
  sorted urgency desc; `urgency ≥ URGENT_CUTOFF` pinned to the top under an "Urgent" subhead with
  a marker; each row: `kind` tag, `text`, `mandateClass` tag, `reason` (muted), `N cites` chip,
  `data-action="<id>"` for the urgent-strip scroll target. A visible line: *"RM actions — not
  client-facing advice."*

`src/main.js` `renderAll()` calls: `paintUrgent(onUrgentPick)`, `paintExplanation()`,
`paintSituation()`, `paintAnalysis()`, `paintActions()`. The `paintGoals` / `paintPositions` /
`paintConversation` calls are removed from `renderAll` (functions kept for the drawer's reuse or
deleted if fully unused — decide at plan time via grep).

### 9.4 "evaluated Ns ago"

`src/ui/panels.js` `paintTicker` (or the `live-t` interval in `main.js`) appends
` · evaluated ${ago(S.evaluation.at)}` to the live-clock line.

## 10. Error handling & fallback

| Condition | Behaviour |
|---|---|
| No LLM key / model down | `narrateClient` → deterministic template; Explanation still shows thesis + summary; no badge needed (the rubric is the product) |
| `S.policyScan` null (scan not yet run / failed) | `sentinel` term contributes 0; everything else scores normally |
| `S.evaluation` null (first tick not done) | globe `ai` lens shows all-zero (calm); urgent strip hidden; segments show a one-line "evaluating…" |
| Market series id unmapped for a country | volatility term uses `"spx"` as the context series |
| `prevSignals` missing for a country | `trend` = 0 for that country |
| `CONFIG.OFFLINE` / no network | rubric + narration templates run; identical to a keyless run |
| `prefers-reduced-motion` | health dial + urgent pips static; `.flash` is an instant highlight, no animation |
| `npm run build` | unaffected — new modules are ES modules; `history.js` bundles (~120 KB) |

## 11. Testing

`node --test src/eval/ src/market/` — pure-function unit tests:

- `market/index.test.js`: `getSeries` date-filters; `volatility` is higher over the 2025 drawdown
  window than a calm window; `percentileVsHistory` returns 0..1.
- `eval/countryScore.test.js`: a high-instability + high-vol country scores "high"/"acute"; a calm
  country scores "low"; `trend` is positive when this week's signal worsened; `drivers` are the
  top 3 and sum-ordered.
- `eval/clientEval.test.js`: an advisory portfolio's actions are all `requires-client-instruction`
  / `inform-only` and contain no imperative verbs; a discretionary portfolio has ≥1
  `executable-under-mandate`; every risk/opp/action `cite` is non-empty; a goal that crossed 80%
  this week produces a high-urgency risk.
- `eval/urgent.test.js`: only `urgency ≥ URGENT_CUTOFF` reaches the list; sorted desc; capped at 8.
- `eval/evaluate.test.js`: `runEvaluation` over the demo book returns `countries` for every iso in
  the signals, `clients` for every portfolio, a `hash` per client that changes when a signal
  worsens and is stable when nothing moves.

Manual: `npm run dev` → globe defaults to AI lens and is coloured; wait 60 s and confirm the
"evaluated" stamp refreshes; open each client and check the 4 segments; click an urgent task and
confirm it jumps + flashes; emulate reduced-motion; `npm run build`.

## 12. Resolved decisions

- Evaluation = **composite scoring rubric**, deterministic, client-side.
- Runs at **boot + every `pollSignals` tick (~60 s)**, piggybacked on the existing poll.
- **One LLM touch** — `narrateClient` for the open client, gated on score-hash change.
- Market history = **vendored ~2y synthetic-but-plausible** dataset behind an **API-shaped**
  access layer.
- Globe: **new 5th "AI risk" lens, default on load**.
- Urgent panel: **book-wide strip below the ticker, above the spine**.
- Client spine = **Explanation · Situation · Analysis · Actions** (4 segments); Goals / Positions
  / Conversation → an Explanation drawer.
- **Policy Sentinel kept** as a scoring input + citation source; its route and drawer unchanged.
- **Dropped:** `/api/intelligence-review`, the server agent pipeline, the full-screen takeover +
  timeline, the "Run Intelligence Review" button, the v1 4-tab UI.
