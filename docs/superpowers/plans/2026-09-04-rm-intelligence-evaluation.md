# RM Intelligence — Evaluation Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-side composite scoring rubric that re-evaluates the whole book every 60 s and routes typed outputs to three surfaces — an AI-risk globe lens, a book-wide Urgent strip, and a 4-segment client spine (Explanation · Situation · Analysis · Actions).

**Architecture:** Pure ES-module functions in `src/eval/` and `src/market/`, imported identically by `node:test` and the browser (mirrors `src/model/*`). `runEvaluation(...)` is called from `boot()` and the existing `pollSignals` callback; the result is cached in `S.evaluation`. Exactly one LLM touch — `narrateClient` for the open client — gated on a per-client score-hash. Vendored ~2-year synthetic market history behind an API-shaped access layer.

**Tech Stack:** Vanilla ES modules, Vite 6, the built-in `node:test` runner (no dependency), the existing `src/llm/client.js` (`generateBrief`) for the one LLM call. No LangGraph, no server pipeline, no new npm packages.

**Spec:** `docs/superpowers/specs/2026-09-04-rm-intelligence-evaluation-design.md` — read it alongside this plan.

## Global Constraints

- **No new npm dependencies.** `package.json` `dependencies` stays `{ "animejs": "^4.5.0", "globe.gl": "2.46.2" }`.
- **Tests use the built-in `node:test` runner only** — files `src/eval/*.test.js`, `src/market/*.test.js`, `src/store.test.js`, run via a new `"test": "node --test src/eval/ src/market/ src/store.test.js"` script. Not an added framework.
- **`src/eval/*` and `src/market/*` are pure** — no DOM, no `fetch` except `narrate.js` (which reuses `src/llm/client.js`'s `generateBrief` and always has a template fallback).
- **Do not modify** `src/model/*`, `src/adapters/*`, `server/*`, `src/signals/worldmonitor.js`, `src/policy/sentinel.js`, `src/llm/client.js`. Import them; do not edit them.
- **Every `Finding` and `Action` carries a non-empty `cite` array** whose ids resolve to a real citation (signal event id, `market:<id>`, `pos:<id>`, `goal:<id>`, `policy:<url>`, `note:<pid>-<n>`). A rule that would produce an empty `cite` does not emit its item.
- **Advisory / Execution-only Actions carry no imperative trade verbs** ("buy", "sell", "execute", "switch") — the phrasing guard in `clientEval.js` rewrites them; discretionary Actions distinguish `executable-under-mandate` from `inform-only`.
- **The evaluation runs with zero network** — `runEvaluation` never calls `fetch`. Only `narrateClient` does, and only for the open client on a hash change.
- **`marketData` is the module** `src/market/index.js` (namespace import), passed into `runEvaluation`.
- **Rubric constants live only in `src/eval/rubric.js`** — no magic numbers in the node files.
- Works offline (`CONFIG.OFFLINE` / no keys): rubric runs, `narrateClient` templates, `policyScan` term contributes 0 when `S.policyScan` is null.
- **Commit after every task** with the message in its final step. Trailers on every commit:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C
  ```

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/gen-market-history.mjs` | NEW. One-off generator — seeded synthetic weekly series 2024-01→2026-09 with a mid-2025 drawdown. Output committed; script not shipped in the build. |
| `src/market/history.js` | NEW (generated). `MARKET_HISTORY` — 16 series, `{ id, label, unit, points:[{d,c}] }`. |
| `src/market/index.js` | NEW. `getSeries` · `latest` · `returns` · `volatility` · `percentileVsHistory`. A real feed swaps these four bodies later. |
| `src/eval/rubric.js` | NEW. Every weight / threshold / cutoff / `SERIES_BY_ISO`. |
| `src/eval/countryScore.js` | NEW. `scoreCountries(signals, prevSignals, market)` → `{ iso3 → CountryScore }`. |
| `src/eval/clientEval.js` | NEW. `evaluateClient(portfolio, instruments, signals, countryScores, policyScan)` → `ClientEval`. |
| `src/eval/urgent.js` | NEW. `collectUrgent(clientEvals, cutoff)` → `UrgentTask[]`. |
| `src/eval/narrate.js` | NEW. `narrateClient(clientEval, portfolio, rmNotes)` → `{ thesis, summary }`. LLM via `generateBrief`, template fallback. |
| `src/eval/evaluate.js` | NEW. `runEvaluation({...})` → `Evaluation`; the FNV-1a `hashClient()` helper. |
| `src/store.js` | MODIFY. `S.evaluation`, `S.narratedHash`; selectors `countryScore(iso3)`, `clientEval()`, `urgentTasks()`. |
| `src/ui/palette.js` | MODIFY. Add the `ai` lens to `LENSES()`; import `S`. |
| `src/ui/globe.js` | MODIFY. Country tooltip: a `drivers` line when `S.lens === "ai"`. |
| `src/ui/shell.js` | MODIFY. Lens bar → 5 buttons; spine → 4 segments; `#urgent` element below `.tick-strip`. |
| `src/ui/segments.js` | NEW. `paintExplanation()` · `paintAnalysis()` · `paintActions()`. |
| `src/ui/urgent.js` | NEW. `paintUrgent(onPick)`. |
| `src/ui/spine.js` | DELETE. `paintActions` replaced by `segments.js`; `paintConversation` content moves to the portfolio drawer. |
| `src/ui/drawers.js` | MODIFY. Add `openPortfolioDetail()` — goals + positions + relationship. |
| `src/main.js` | MODIFY. `refreshEvaluation()` in `boot()` + poll callback; `maybeNarrateOpenClient()`; `renderAll()` rewired; "evaluated Ns ago". |
| `src/ui/styles.css` | MODIFY. `.urgent-*`, `.health-dial`, `.seg` tweaks. |
| `package.json` | MODIFY. Add the `"test"` script. |
| `docs/FRIDAY-CHECKLIST.md` | MODIFY (Task 13). |

---

## Task 1: Market history — generator + data

**Files:**
- Create: `scripts/gen-market-history.mjs`
- Create (by running the script): `src/market/history.js`
- Test: `src/market/history.test.js`

**Interfaces:**
- Produces: `MARKET_HISTORY` — `{ [id]: { id, label, unit, points: Array<{ d: "YYYY-MM-DD", c: number }> } }`. 16 series (`spx nky sx5e ukx smi sti hscei kospi tw-tech nifty ibov brent gold ust10 usdsgd vix`), weekly points from `2024-01-05` to `2026-09-04` (~140 points each), dates ascending, with an elevated-volatility stretch across `2025-05` → `2025-08`.

- [ ] **Step 1: Write the failing test**

`src/market/history.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MARKET_HISTORY } from "./history.js";

const IDS = ["spx","nky","sx5e","ukx","smi","sti","hscei","kospi","tw-tech","nifty","ibov","brent","gold","ust10","usdsgd","vix"];

test("16 series, each with ascending weekly points spanning the window", () => {
  assert.deepEqual(Object.keys(MARKET_HISTORY).sort(), [...IDS].sort());
  for (const id of IDS) {
    const s = MARKET_HISTORY[id];
    assert.equal(s.id, id);
    assert.ok(s.label && s.unit !== undefined);
    assert.ok(s.points.length >= 130 && s.points.length <= 145, `${id} point count`);
    assert.equal(s.points[0].d, "2024-01-05");
    assert.match(s.points.at(-1).d, /^2026-09/);
    for (let i = 1; i < s.points.length; i++) {
      assert.ok(s.points[i].d > s.points[i - 1].d, `${id} dates ascending`);
      assert.equal(typeof s.points[i].c, "number");
      assert.ok(s.points[i].c > 0);
    }
  }
});

test("a mid-2025 volatility episode is visible in spx", () => {
  const pts = MARKET_HISTORY.spx.points;
  const win = (from, to) => pts.filter(p => p.d >= from && p.d < to).map(p => p.c);
  const vol = xs => { const r = xs.slice(1).map((c, i) => Math.log(c / xs[i])); const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length); };
  assert.ok(vol(win("2025-05-01", "2025-08-15")) > vol(win("2024-02-01", "2024-05-15")) * 1.4, "drawdown window is >1.4x calmer window");
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test src/market/history.test.js`
Expected: FAIL — `./history.js` not found.

- [ ] **Step 3: Write `scripts/gen-market-history.mjs`**

```js
/* One-off. Regenerate: `node scripts/gen-market-history.mjs > src/market/history.js` */
const SERIES = [
  ["spx","S&P 500","idx",4742,0.0012,0.014], ["nky","Nikkei 225","idx",33450,0.0011,0.016],
  ["sx5e","Euro Stoxx 50","idx",4520,0.0009,0.015], ["ukx","FTSE 100","idx",7720,0.0006,0.011],
  ["smi","SMI","idx",11140,0.0006,0.010], ["sti","Straits Times","idx",3180,0.0007,0.010],
  ["hscei","HS China Ent.","idx",6180,0.0004,0.020], ["kospi","KOSPI","idx",2660,0.0009,0.017],
  ["tw-tech","Taiwan tech basket","idx",188,0.0016,0.022], ["nifty","Nifty 50","idx",21700,0.0015,0.013],
  ["ibov","Ibovespa","idx",132000,0.0008,0.018], ["brent","Brent crude","USD/bbl",78,0.0004,0.021],
  ["gold","Gold","USD/oz",2050,0.0009,0.011], ["ust10","US 10y yield","%",3.95,0.0002,0.020],
  ["usdsgd","USD/SGD","",1.335,0.0000,0.004], ["vix","VIX","",13.5,-0.0003,0.060]
];
// deterministic RNG
let seed = 20260904;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

const start = new Date("2024-01-05");
const weeks = Math.round((new Date("2026-09-04") - start) / (7 * 864e5)) + 1;

const out = {};
for (const [id, label, unit, base, drift, vol] of SERIES) {
  let c = base;
  const points = [];
  for (let w = 0; w < weeks; w++) {
    const d = new Date(start.getTime() + w * 7 * 864e5).toISOString().slice(0, 10);
    // mid-2025 stress: triple vol, negative drift for equities, positive for vix
    const stress = d >= "2025-05-01" && d < "2025-08-15";
    const v = stress ? vol * 3 : vol;
    const dr = stress ? (id === "vix" ? 0.06 : -0.012) : drift;
    c *= Math.exp(dr + v * gauss());
    points.push({ d, c: Number(c.toFixed(unit === "%" ? 3 : c < 5 ? 4 : 1)) });
  }
  out[id] = { id, label, unit, points };
}
process.stdout.write(
  "/** Generated by scripts/gen-market-history.mjs — synthetic, illustrative, do not hand-edit. */\n" +
  "export const MARKET_HISTORY = " + JSON.stringify(out, null, 0) + ";\n"
);
```

- [ ] **Step 4: Generate the data file**

Run: `node scripts/gen-market-history.mjs > src/market/history.js`
Then: `node --check src/market/history.js` → OK. Confirm the file is ~100–160 KB.

- [ ] **Step 5: Run the test — expect pass**

Run: `node --test src/market/history.test.js`
Expected: PASS, 2/2. If the vol-ratio assertion is flaky, bump the stress multiplier in the generator to `× 3.5` and regenerate.

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-market-history.mjs src/market/history.js src/market/history.test.js
git commit -m "Market history: seeded synthetic weekly series 2024–2026 + generator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 2: Market access layer

**Files:**
- Create: `src/market/index.js`
- Test: `src/market/index.test.js`

**Interfaces:**
- Consumes: `MARKET_HISTORY` from `./history.js`.
- Produces:
  - `getSeries(id, { from, to } = {}) → Array<{ d, c }>` — the series' points, optionally date-filtered (`d >= from`, `d <= to`); `[]` for an unknown id.
  - `latest(id) → { d, c } | null`.
  - `returns(id, weeks) → number` — % change from `weeks` points ago to the latest (`0` if unknown / too short).
  - `volatility(id, window = 26) → number` — annualised realised vol as a %, from log-returns over the last `window` points (`√52` scaling for weekly data). `0` if unknown / too short.
  - `percentileVsHistory(id, metric = "vol") → number` — `0..1`: for `"vol"`, where the trailing-26-week vol sits in the distribution of every rolling-26-week vol across the full history; for `"return"`, same for trailing-13-week return.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getSeries, latest, returns, volatility, percentileVsHistory } from "./index.js";

test("getSeries filters by date and handles unknown ids", () => {
  assert.equal(getSeries("nope").length, 0);
  const all = getSeries("spx");
  assert.ok(all.length > 100);
  const q2 = getSeries("spx", { from: "2025-04-01", to: "2025-06-30" });
  assert.ok(q2.length >= 10 && q2.length <= 16);
  assert.ok(q2.every(p => p.d >= "2025-04-01" && p.d <= "2025-06-30"));
});

test("latest returns the last point", () => {
  const l = latest("spx");
  assert.match(l.d, /^2026-09/);
  assert.equal(typeof l.c, "number");
});

test("volatility is higher across the 2025 stress window than a calm window", () => {
  const stressVol = volatility("spx", 12);   // covers ~mid-2026 tail; use a windowed helper instead:
  // window-anchored: compute vol of an explicit slice
  const slice = (from, to) => getSeries("spx", { from, to }).map(p => p.c);
  const v = xs => { const r = xs.slice(1).map((c, i) => Math.log(c / xs[i])); const m = r.reduce((a,b)=>a+b,0)/r.length; return Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/r.length) * Math.sqrt(52) * 100; };
  assert.ok(v(slice("2025-05-01","2025-08-15")) > v(slice("2024-02-01","2024-05-15")) * 1.3);
  assert.equal(typeof stressVol, "number");
});

test("returns and percentileVsHistory are sane", () => {
  assert.equal(typeof returns("spx", 26), "number");
  const p = percentileVsHistory("spx", "vol");
  assert.ok(p >= 0 && p <= 1);
  assert.equal(percentileVsHistory("nope"), 0);
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test src/market/index.test.js`
Expected: FAIL — `./index.js` not found.

- [ ] **Step 3: Create `src/market/index.js`**

```js
import { MARKET_HISTORY } from "./history.js";

const S = id => MARKET_HISTORY[id]?.points || [];

export function getSeries(id, { from, to } = {}) {
  let pts = S(id);
  if (from) pts = pts.filter(p => p.d >= from);
  if (to) pts = pts.filter(p => p.d <= to);
  return pts.map(p => ({ ...p }));
}

export function latest(id) {
  const pts = S(id);
  return pts.length ? { ...pts.at(-1) } : null;
}

export function returns(id, weeks) {
  const pts = S(id);
  if (pts.length <= weeks) return 0;
  const a = pts.at(-1 - weeks).c, b = pts.at(-1).c;
  return a ? ((b - a) / a) * 100 : 0;
}

function realisedVol(closes) {
  if (closes.length < 3) return 0;
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length;
  return Math.sqrt(variance) * Math.sqrt(52) * 100;
}

export function volatility(id, window = 26) {
  const pts = S(id);
  if (pts.length < window) return realisedVol(pts.map(p => p.c));
  return realisedVol(pts.slice(-window).map(p => p.c));
}

export function percentileVsHistory(id, metric = "vol") {
  const pts = S(id);
  if (pts.length < 40) return 0;
  const closes = pts.map(p => p.c);
  const win = metric === "return" ? 13 : 26;
  const samples = [];
  for (let i = win; i <= closes.length; i++) {
    const slice = closes.slice(i - win, i);
    samples.push(metric === "return"
      ? (slice.at(-1) - slice[0]) / slice[0]
      : realisedVol(slice));
  }
  const current = samples.at(-1);
  const below = samples.filter(s => s <= current).length;
  return below / samples.length;
}
```

> `volatility` with a small explicit `window` (like `12`) is allowed; the test only asserts it returns a number. The stress-window assertion uses an explicit slice via `getSeries`, which is the honest way to compare two eras.

- [ ] **Step 4: Run it — expect pass**

Run: `node --test src/market/index.test.js`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/market/index.js src/market/index.test.js
git commit -m "Market access layer: getSeries / latest / returns / volatility / percentileVsHistory

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 3: Rubric constants + country score

**Files:**
- Create: `src/eval/rubric.js`
- Create: `src/eval/countryScore.js`
- Test: `src/eval/countryScore.test.js`

**Interfaces:**
- Consumes: `volatility` / `percentileVsHistory` from `../market/index.js`; `CHOKEPOINTS` from `../signals/fixtures/signals.js` (for the strained set).
- Produces:
  - `rubric.js` exports: `COUNTRY_WEIGHTS`, `COUNTRY_BANDS`, `HEALTH_PENALTIES`, `HEALTH_BANDS`, `CONC_SOFT`, `CONC_HARD`, `URGENCY`, `URGENT_CUTOFF`, `URGENT_STRIP_MAX`, `SERIES_BY_ISO` — all verbatim from spec §6.
  - `countryScore.js` exports `scoreCountries(signals, prevSignals, market) → { [iso3]: CountryScore }` where `CountryScore = { iso3, score:0..100, band, trend, drivers:[{label, contribution}] }`. `market` is the `src/market/index.js` namespace.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { SIGNALS, PREV_SIGNALS } from "../signals/fixtures/signals.js";
import * as market from "../market/index.js";
import { scoreCountries } from "./countryScore.js";

test("high-instability country scores high; calm country scores low", () => {
  const scores = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  assert.ok(scores.TWN.score > scores.USA.score);
  assert.ok(["high", "acute"].includes(scores.TWN.band));
  assert.ok(["low", "elevated"].includes(scores.USA.band));
});

test("trend is positive when this week's signal worsened vs last", () => {
  const scores = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  // PREV_SIGNALS shrinks riskDelta to 15% and empties events → this week is worse for a stressed country
  assert.ok(scores.TWN.trend > 0);
});

test("drivers are the top 3 contributors, descending", () => {
  const d = scoreCountries(SIGNALS, PREV_SIGNALS, market).TWN.drivers;
  assert.equal(d.length, 3);
  assert.ok(d[0].contribution >= d[1].contribution && d[1].contribution >= d[2].contribution);
  assert.ok(typeof d[0].label === "string");
});

test("every signal iso gets a score in 0..100", () => {
  const scores = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  for (const iso of Object.keys(SIGNALS)) {
    assert.ok(scores[iso].score >= 0 && scores[iso].score <= 100, iso);
  }
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test src/eval/countryScore.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/eval/rubric.js`**

Copy spec §6 verbatim:

```js
export const COUNTRY_WEIGHTS = { instability: 0.30, tone: 0.15, policy: 0.10, chokepoint: 0.15, volatility: 0.20, sentinel: 0.10 };
export const COUNTRY_BANDS = { low: 25, elevated: 50, high: 72 };

export const HEALTH_PENALTIES = { goalGap: 0.9, concentration: 1.0, exposure: 0.8, lombard: 12, mandateFit: 0.3 };
export const HEALTH_BANDS = { strong: 75, watch: 50 };

export const CONC_SOFT = 10;
export const CONC_HARD = 12;

export const URGENCY = {
  severityBase: { high: 55, medium: 35, low: 15 },
  horizonMonthsNear: 18,
  horizonBoost: 20,
  trendBoostPerPoint: 1.2
};
export const URGENT_CUTOFF = 65;
export const URGENT_STRIP_MAX = 8;

export const SERIES_BY_ISO = {
  TWN: "tw-tech", KOR: "kospi", CHN: "hscei", SAU: "brent", SGP: "sti",
  NLD: "sx5e", DEU: "sx5e", GBR: "ukx", USA: "spx", JPN: "nky",
  IND: "nifty", BRA: "ibov", CHE: "smi"
};
export const SERIES_FALLBACK = "spx";
```

- [ ] **Step 4: Create `src/eval/countryScore.js`**

```js
import { COUNTRY_WEIGHTS, COUNTRY_BANDS, SERIES_BY_ISO, SERIES_FALLBACK } from "./rubric.js";
import { CHOKEPOINTS } from "../signals/fixtures/signals.js";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const strained = new Set(CHOKEPOINTS.filter(c => c.status === "strained").map(c => c.name));

/** signal-only components (move week to week) */
function signalTerms(sig) {
  return {
    instability: clamp(sig.instability || 0),
    tone: clamp((Math.min(3, Math.abs(sig.tone || 0)) / 3) * 100),
    policy: clamp((Math.min(3, Math.abs(sig.policyStance || 0)) / 3) * 100),
    chokepoint: clamp(((sig.chokepoints || []).filter(c => strained.has(c)).length / 3) * 100)
  };
}

function score(sig, market, iso, policyScan) {
  const s = signalTerms(sig);
  const seriesId = SERIES_BY_ISO[iso] || SERIES_FALLBACK;
  const volPct = clamp(market.percentileVsHistory(seriesId, "vol") * 100);
  const sentinel = policyScan?.signal?.country === iso
    ? clamp(Math.abs(policyScan.signal.stanceScore || 0) * 100) : 0;
  const terms = { ...s, volatility: volPct, sentinel };
  const contributions = Object.entries(COUNTRY_WEIGHTS).map(([k, w]) => ({
    label: LABELS[k], contribution: Math.round(w * terms[k])
  }));
  const total = clamp(contributions.reduce((a, c) => a + c.contribution, 0));
  return { total, contributions, terms };
}

const LABELS = {
  instability: "Instability", tone: "Narrative tone", policy: "Policy stress",
  chokepoint: "Chokepoint strain", volatility: "Market volatility", sentinel: "Policy signal"
};

export function scoreCountries(signals, prevSignals, market, policyScan = null) {
  const out = {};
  for (const iso of Object.keys(signals)) {
    const now = score(signals[iso], market, iso, policyScan);
    const prevSig = prevSignals?.[iso] || signals[iso];
    // hold volatility + sentinel constant between the two — only signal terms move
    const prev = score({ ...prevSig, instability: prevSig.instability, tone: prevSig.tone, policyStance: prevSig.policyStance, chokepoints: prevSig.chokepoints }, market, iso, policyScan);
    const band = now.total >= COUNTRY_BANDS.high ? "acute"
      : now.total >= COUNTRY_BANDS.elevated ? "high"
      : now.total >= COUNTRY_BANDS.low ? "elevated" : "low";
    out[iso] = {
      iso3: iso, score: now.total, band,
      trend: now.total - prev.total,
      drivers: now.contributions.filter(c => c.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3)
    };
    // guarantee 3 drivers even if some are zero
    while (out[iso].drivers.length < 3) out[iso].drivers.push({ label: LABELS.tone, contribution: 0 });
  }
  return out;
}
```

> `COUNTRY_BANDS` has three cutoffs (`low: 25, elevated: 50, high: 72`) → four bands `low/elevated/high/acute`. The names in the spec's `CountryScore.band` are `"low"|"elevated"|"high"|"acute"` — match exactly.

- [ ] **Step 5: Run the test — expect pass**

Run: `node --test src/eval/countryScore.test.js`
Expected: PASS, 4/4.

- [ ] **Step 6: Commit**

```bash
git add src/eval/rubric.js src/eval/countryScore.js src/eval/countryScore.test.js
git commit -m "Eval: rubric constants + composite country risk score

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 4: Client evaluation — health, findings, actions

**Files:**
- Create: `src/eval/clientEval.js`
- Test: `src/eval/clientEval.test.js`

**Interfaces:**
- Consumes: `positionRiskDelta`, `countryExposure`, `primaryCountry`, `chokepointExposure` from `../model/lookthrough.js`; `goalDelta`, `riskConcentration`, `flaggedPositions` from `../model/scoring.js`; `reconcile` from `../model/houseview.js`; all of `rubric.js`; `CountryScore` map from Task 3.
- Produces: `evaluateClient(portfolio, instruments, signals, prevSignals, countryScores, policyScan) → ClientEval` — **note the 6-arg signature; `prevSignals` is arg 4** (needed for the goal-band-cross rule):
  ```
  { portfolioId, name, mandate,
    health:0..100, healthBand:"strong"|"watch"|"strained", exposureScore:0..100, drivers:[{label, penalty}],
    thesis:null, summary:null,
    risks:[Finding], opportunities:[Finding], actions:[Action],
    citations: { [id]: { kind, label, value? } } }
  Finding = { id, text, severity:"high"|"medium"|"low", urgency:0..100, cite:[id] }
  Action  = { id, text, kind:"reduce-risk"|"use-opportunity"|"fit-needs", urgency, mandateClass, reason, cite:[id] }
  ```
  `citations` is the per-client registry; `evaluate.js` (Task 7) flattens the used ones onto `Evaluation`.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../signals/fixtures/signals.js";
import * as market from "../market/index.js";
import { scoreCountries } from "./countryScore.js";
import { evaluateClient } from "./clientEval.js";

async function ev(mandateWanted) {
  const data = await demoAdapter();
  const p = data.portfolios.find(x => x.mandate === mandateWanted);
  const cs = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  return { e: evaluateClient(p, data.instruments, SIGNALS, PREV_SIGNALS, cs, null), p };
}

test("health is 0..100 with a band and non-empty drivers", async () => {
  const { e } = await ev("Advisory");
  assert.ok(e.health >= 0 && e.health <= 100);
  assert.ok(["strong", "watch", "strained"].includes(e.healthBand));
  assert.ok(e.drivers.length >= 1);
  assert.equal(typeof e.exposureScore, "number");
});

test("advisory actions never carry imperative trade verbs; discretionary distinguishes classes", async () => {
  const { e: adv } = await ev("Advisory");
  const advText = adv.actions.map(a => a.text.toLowerCase()).join(" ");
  for (const v of [" buy ", " sell ", "execute", "switch into"]) assert.ok(!advText.includes(v), v);
  assert.ok(adv.actions.every(a => a.mandateClass === "requires-client-instruction" || a.mandateClass === "inform-only"));

  const { e: disc } = await ev("Discretionary");
  assert.ok(disc.actions.some(a => a.mandateClass === "executable-under-mandate"));
});

test("every finding and action has a non-empty resolvable cite", async () => {
  const { e } = await ev("Advisory");
  for (const it of [...e.risks, ...e.opportunities, ...e.actions]) {
    assert.ok(it.cite.length >= 1, it.text);
    for (const cid of it.cite) assert.ok(e.citations[cid], `unresolved ${cid}`);
  }
});

test("a concentration risk is flagged for the Bergmann book with high-ish urgency", async () => {
  const { e } = await ev("Advisory");
  const conc = e.risks.find(r => /concentration/i.test(r.text));
  assert.ok(conc);
  assert.ok(conc.urgency >= 35);
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test src/eval/clientEval.test.js`
Expected: FAIL — `./clientEval.js` not found.

- [ ] **Step 3: Create `src/eval/clientEval.js`**

```js
import { positionRiskDelta, countryExposure, primaryCountry, chokepointExposure } from "../model/lookthrough.js";
import { goalDelta, riskConcentration, flaggedPositions } from "../model/scoring.js";
import { reconcile } from "../model/houseview.js";
import { HEALTH_PENALTIES, HEALTH_BANDS, CONC_SOFT, CONC_HARD, URGENCY } from "./rubric.js";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const IMPERATIVE = /\b(buy|sell|execute|switch)\b/gi;
const deImperative = t => t
  .replace(/\bexecute\b/gi, "put to the client")
  .replace(/\bswitch into\b/gi, "review a move to")
  .replace(/\bsell\b/gi, "reduce")
  .replace(/\bbuy\b/gi, "add");

const MONTHS = { "Q1": 2, "Q2": 5, "Q3": 8, "Q4": 11 };
function horizonMonthsAway(horizon, nowYear = 2026, nowMonth = 9) {
  const m = /(\d{4})/.exec(horizon || "");
  if (!m) return 999;
  const y = +m[1];
  const q = /Q([1-4])/.exec(horizon);
  const mo = q ? MONTHS["Q" + q[1]] : 6;
  return (y - nowYear) * 12 + (mo - nowMonth);
}

export function evaluateClient(portfolio, instruments, signals, prevSignals, countryScores, policyScan) {
  const positions = portfolio.positions;
  const cite = {};
  const C = (id, obj) => { if (!cite[id]) cite[id] = obj; return id; };

  // register base citations
  for (const p of positions) C(`pos:${p.instrumentId}`, { kind: "position", label: instruments[p.instrumentId]?.name || p.instrumentId, value: `${p.weightPct}%` });
  for (const g of portfolio.goals) C(`goal:${g.id}`, { kind: "goal", label: g.name });
  for (const iso of Object.keys(signals)) for (const e of signals[iso].events || []) C(e.id, { kind: "signal", label: e.text, value: e.value });
  if (policyScan?.citations?.[0]) C(`policy:${policyScan.citations[0].url}`, { kind: "policy", label: policyScan.citations[0].label, value: policyScan.citations[0].quote });
  (portfolio.relationship?.concerns || []).forEach((t, i) => C(`note:${portfolio.id}-concern-${i}`, { kind: "note", label: "RM standing concern", value: t }));

  // ── health ───────────────────────────────────────────────────────────
  const conc = riskConcentration(positions, instruments, signals);
  const goalMoves = portfolio.goals.map(g => ({ g, ...goalDelta(g, positions, instruments, signals, prevSignals) }));
  const exposureScore = clamp(positions.reduce((acc, p) => {
    const iso = primaryCountry(instruments[p.instrumentId]);
    return acc + (p.weightPct / 100) * (countryScores[iso]?.score || 0);
  }, 0));
  const goalGap = portfolio.goals.reduce((a, g) => a + (100 - g.baseFunded), 0) / (portfolio.goals.length || 1);

  const penalties = [
    { label: "Goal funding gap", penalty: goalGap * HEALTH_PENALTIES.goalGap },
    { label: "Concentration", penalty: conc.pct * HEALTH_PENALTIES.concentration * (conc.pct > CONC_HARD ? 2 : 1) },
    { label: "Country-risk exposure", penalty: exposureScore * HEALTH_PENALTIES.exposure },
    { label: "Lombard headroom", penalty: (portfolio.lombard && portfolio.lombard.headroomPct < 25) ? HEALTH_PENALTIES.lombard : 0 }
  ].filter(p => p.penalty > 0);

  const health = clamp(100 - penalties.reduce((a, p) => a + p.penalty, 0));
  const healthBand = health >= HEALTH_BANDS.strong ? "strong" : health >= HEALTH_BANDS.watch ? "watch" : "strained";

  // ── findings ─────────────────────────────────────────────────────────
  const risks = [], opportunities = [];
  let n = 0;
  const finding = (arr, { text, severity, cite: ids, goalId, drivingIso }) => {
    const ids2 = ids.filter(id => cite[id]);
    if (!ids2.length) return;
    const near = goalId ? horizonMonthsAway(portfolio.goals.find(x => x.id === goalId)?.horizon) <= URGENCY.horizonMonthsNear : false;
    const trend = drivingIso ? Math.max(0, countryScores[drivingIso]?.trend || 0) : 0;
    const urgency = clamp(
      URGENCY.severityBase[severity]
      + (near ? URGENCY.horizonBoost : 0)
      + Math.min(25, URGENCY.trendBoostPerPoint * trend)
    );
    arr.push({ id: `f${++n}`, text, severity, urgency, cite: ids2 });
  };

  // 1. concentration
  if (conc.pct >= CONC_SOFT && conc.countries.length) {
    const worst = conc.countries[0];
    finding(risks, {
      text: `Look-through concentration is live: ${conc.pct}% of the book's deteriorating exposure sits in ${conc.countries.join(", ")}.`,
      severity: conc.pct >= 60 ? "high" : "medium",
      cite: [...(signals[worst]?.events || []).map(e => e.id), `pos:${positions[0]?.instrumentId}`],
      drivingIso: worst
    });
  }
  // 2. chokepoint stack
  const ck = chokepointExposure(positions, instruments);
  const flaggedIds = flaggedPositions(positions, instruments, signals).map(p => p.instrumentId);
  for (const [name, c] of Object.entries(ck)) {
    const here = c.instrumentIds.filter(id => flaggedIds.includes(id));
    if (here.length >= 2) finding(risks, {
      text: `${here.length} holdings under pressure route through one chokepoint — ${name} (${c.weightPct.toFixed(1)}% of the book).`,
      severity: "high", cite: here.map(id => `pos:${id}`)
    });
  }
  // 3. goal band-cross this week
  for (const g of portfolio.goals) {
    const gd = goalDelta(g, positions, instruments, signals, prevSignals);
    for (const b of [95, 80]) if (gd.prevFunded >= b && gd.funded < b) finding(risks, {
      text: `${g.name} dropped through ${b}% funding confidence this week (${gd.prevFunded}% → ${gd.funded}%).`,
      severity: b === 80 ? "high" : "medium", cite: [`goal:${g.id}`], goalId: g.id
    });
  }
  // 4. lombard
  if (portfolio.lombard && portfolio.lombard.headroomPct < 25) finding(risks, {
    text: `Lombard headroom is ${portfolio.lombard.headroomPct}% (was ${portfolio.lombard.prevHeadroomPct}%) — the item with a hard consequence if collateral reprices.`,
    severity: portfolio.lombard.headroomPct < 15 ? "high" : "medium",
    cite: [`goal:${portfolio.goals[0]?.id}`]
  });
  // 5. house-view tension
  for (const p of positions) {
    const d = positionRiskDelta(instruments[p.instrumentId], signals);
    if (d < 6) continue;
    const iso = primaryCountry(instruments[p.instrumentId]);
    if (reconcile(iso, d).verdict === "tension") finding(risks, {
      text: `${instruments[p.instrumentId]?.name} pulls against the house view on ${iso}. Name the disagreement rather than resolving it silently.`,
      severity: "medium",
      cite: [`pos:${p.instrumentId}`, ...(signals[iso]?.events || []).map(e => e.id)],
      drivingIso: iso
    });
  }
  // opportunities
  for (const p of positions) {
    const d = positionRiskDelta(instruments[p.instrumentId], signals);
    const drives = portfolio.goals.filter(g => (g.driverIds || []).includes(p.instrumentId)).map(g => g.id);
    if (d <= -6 && drives.length) {
      const iso = primaryCountry(instruments[p.instrumentId]);
      finding(opportunities, {
        text: `${instruments[p.instrumentId]?.name} improved ${Math.abs(Math.round(d))} points and funds ${drives.length} goal(s) — a chance to lock in progress at the review.`,
        severity: "low", cite: [`pos:${p.instrumentId}`, ...(signals[iso]?.events || []).map(e => e.id)], goalId: drives[0], drivingIso: iso
      });
    }
  }
  for (const iso of Object.keys(signals)) {
    if ((signals[iso].policyStance || 0) > -0.3) continue;
    const gExposed = portfolio.goals.filter(g => (g.driverIds || []).some(id => (instruments[id]?.exposures || []).some(e => e.iso3 === iso)));
    if (!gExposed.length) continue;
    const ev0 = (signals[iso].events || [])[0];
    finding(opportunities, {
      text: `Policy is easing in ${signals[iso].name} — supportive for ${gExposed.map(g => g.name).join(", ")}.`,
      severity: "low", cite: [ev0?.id, ...gExposed.map(g => `goal:${g.id}`)].filter(Boolean), goalId: gExposed[0].id
    });
  }

  // ── actions ──────────────────────────────────────────────────────────
  const mandateClass = portfolio.mandate === "Discretionary" ? "executable-under-mandate"
    : portfolio.mandate === "Advisory" ? "requires-client-instruction" : "inform-only";
  const noteFor = i => `note:${portfolio.id}-concern-${i}`;
  const actions = [];
  let an = 0;
  const action = (kind, text, urgency, reason, ids) => {
    const ids2 = ids.filter(id => cite[id]);
    if (!ids2.length) return;
    let t = text;
    if (mandateClass !== "executable-under-mandate" && IMPERATIVE.test(text)) { IMPERATIVE.lastIndex = 0; t = deImperative(text); }
    actions.push({ id: `a${++an}`, text: t, kind, urgency, mandateClass, reason, cite: ids2 });
  };
  for (const r of risks) {
    let text, reason = r.text;
    if (/concentration|chokepoint/i.test(r.text)) text = "Bring the concentrated sleeve back toward the mandate line — trim or hedge.";
    else if (/funding|band/i.test(r.text)) text = "Re-plan the affected goal or de-risk its drivers.";
    else if (/lombard/i.test(r.text)) text = "Restore lombard headroom — add collateral or reduce the drawdown.";
    else if (/house view/i.test(r.text)) text = "Put the signal-vs-house-view disagreement to the client explicitly.";
    else text = "Review the flagged exposure at the next contact.";
    action("reduce-risk", text, r.urgency, reason, r.cite);
  }
  for (const o of opportunities) {
    action("use-opportunity", `Raise ${o.text.split("—")[0].trim()} with the client as a positive.`, o.urgency, o.text, o.cite);
  }
  // fit-needs from RM notes
  (portfolio.relationship?.concerns || []).forEach((concern, i) => {
    const lc = concern.toLowerCase();
    if (/de-risk|progressively/.test(lc) && risks.some(r => /concentration|funding/i.test(r.text))) {
      action("fit-needs", `Honour the client's stated wish to de-risk progressively — bring a staged plan, not a single move.`,
        clamp(URGENCY.severityBase.medium + URGENCY.horizonBoost), concern, [noteFor(i)]);
    } else if (/cost-sensitive|premium/.test(lc) && actions.some(a => /hedge/i.test(a.text))) {
      action("fit-needs", `Quantify the hedge premium up front — the client declined a collar on cost alone before.`,
        URGENCY.severityBase.medium, concern, [noteFor(i)]);
    }
  });

  return {
    portfolioId: portfolio.id, name: portfolio.name, mandate: portfolio.mandate,
    health, healthBand, exposureScore,
    drivers: penalties.sort((a, b) => b.penalty - a.penalty).map(p => ({ label: p.label, penalty: Math.round(p.penalty) })),
    thesis: null, summary: null,
    risks, opportunities, actions,
    citations: cite
  };
}
```

> The test helper's `evaluateClient(p, data.instruments, SIGNALS, PREV_SIGNALS, cs, null)` call
> already passes `PREV_SIGNALS` as arg 4 — matches the signature. `goalMoves` is currently only
> used by the health block's goal-gap term (which reads `baseFunded`, not the delta) — it can be
> dropped if unused after the goal-band rule is added; keep it only if a later step needs it.

- [ ] **Step 4: Run the test — expect pass**

Run: `node --test src/eval/clientEval.test.js`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/eval/clientEval.js src/eval/clientEval.test.js
git commit -m "Eval: per-client health, findings and actions (deterministic rubric)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 5: Urgent collection

**Files:**
- Create: `src/eval/urgent.js`
- Test: `src/eval/urgent.test.js`

**Interfaces:**
- Consumes: `URGENT_CUTOFF`, `URGENT_STRIP_MAX` from `./rubric.js`.
- Produces: `collectUrgent(clientEvals, cutoff = URGENT_CUTOFF) → UrgentTask[]` where `clientEvals` is `ClientEval[]` (or the `Object.values` of `Evaluation.clients`). `UrgentTask = { portfolioId, clientName, actionId, text, urgency, kind }`. Sorted `urgency` desc, sliced to `URGENT_STRIP_MAX`.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { collectUrgent } from "./urgent.js";

const mk = (id, name, actions) => ({ portfolioId: id, name, actions });

test("only actions at/above the cutoff, sorted desc, capped", () => {
  const evals = [
    mk("p1", "Alpha", [{ id: "a1", text: "x", urgency: 90, kind: "reduce-risk" }, { id: "a2", text: "y", urgency: 40, kind: "fit-needs" }]),
    mk("p2", "Beta", [{ id: "a1", text: "z", urgency: 70, kind: "use-opportunity" }])
  ];
  const u = collectUrgent(evals, 65);
  assert.deepEqual(u.map(t => t.text), ["x", "z"]);
  assert.equal(u[0].portfolioId, "p1");
  assert.equal(u[0].clientName, "Alpha");
  assert.equal(u[0].actionId, "a1");
});

test("caps at URGENT_STRIP_MAX", () => {
  const many = mk("p", "C", Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, text: `t${i}`, urgency: 80, kind: "reduce-risk" })));
  assert.equal(collectUrgent([many], 65).length, 8);
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test src/eval/urgent.test.js` → FAIL.

- [ ] **Step 3: Create `src/eval/urgent.js`**

```js
import { URGENT_CUTOFF, URGENT_STRIP_MAX } from "./rubric.js";

export function collectUrgent(clientEvals, cutoff = URGENT_CUTOFF) {
  const tasks = [];
  for (const ce of clientEvals) {
    for (const a of ce.actions || []) {
      if (a.urgency >= cutoff) tasks.push({
        portfolioId: ce.portfolioId, clientName: ce.name,
        actionId: a.id, text: a.text, urgency: a.urgency, kind: a.kind
      });
    }
  }
  return tasks.sort((x, y) => y.urgency - x.urgency).slice(0, URGENT_STRIP_MAX);
}
```

- [ ] **Step 4: Run it — expect pass** → PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/eval/urgent.js src/eval/urgent.test.js
git commit -m "Eval: book-wide urgent-task collection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 6: Narrate — the one LLM touch

**Files:**
- Create: `src/eval/narrate.js`
- Test: `src/eval/narrate.test.js`

**Interfaces:**
- Consumes: `generateBrief` from `../llm/client.js` (do not modify).
- Produces: `narrateClient(clientEval, portfolio, rmNotes) → Promise<{ thesis, summary }>`. Calls `generateBrief`; on `{ ok: false }` or a malformed shape, returns the deterministic template. Never throws. `rmNotes` is `string[]`.
- Also exports `templateNarration(clientEval, portfolio) → { thesis, summary }` (used as the fallback and directly testable).

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { templateNarration, narrateClient } from "./narrate.js";

const p = { name: "Bergmann Family Office", mandate: "Advisory", riskProfile: "Balanced", riskBand: "8–14% vol",
  goals: [{ name: "Zurich property acquisition", horizon: "Q2 2027" }, { name: "Retirement drawdown", horizon: "from 2034" }] };
const ce = { health: 62, healthBand: "watch", risks: [{ text: "Concentration is live in Taiwan.", severity: "high", urgency: 80 }], actions: [] };

test("templateNarration produces a thesis + summary with no imperative verbs", () => {
  const { thesis, summary } = templateNarration(ce, p);
  assert.ok(thesis.length > 20 && summary.length > 20);
  for (const v of ["buy ", "sell ", "execute"]) {
    assert.ok(!(`${thesis} ${summary}`.toLowerCase().includes(v)));
  }
  assert.ok(/watch|strained|strong/.test(summary));
});

test("narrateClient falls back to the template when the LLM is unavailable", async () => {
  // no server in node:test → generateBrief returns { ok:false }
  const r = await narrateClient(ce, p, ["client wants the 2027 goal de-risked"]);
  assert.ok(r.thesis && r.summary);
});
```

- [ ] **Step 2: Run it — expect failure** → FAIL.

- [ ] **Step 3: Create `src/eval/narrate.js`**

```js
import { generateBrief } from "../llm/client.js";

const SYSTEM =
  "You write a relationship manager's internal briefing. Arrange only the facts given. " +
  "No new facts, no client-facing advice, never the words buy / sell / execute / switch. " +
  "Two short paragraphs. Return JSON only.";
const SCHEMA = { thesis: "string — what the portfolio is built to do", summary: "string — where it stands now" };

export function templateNarration(clientEval, portfolio) {
  const goals = (portfolio.goals || []).map(g => g.name).slice(0, 3).join(", ");
  const thesis =
    `A ${portfolio.mandate.toLowerCase()} mandate on a ${(portfolio.riskProfile || "").toLowerCase()} profile (${portfolio.riskBand}). ` +
    `The book is built to fund ${goals || "the client's stated objectives"}, and the position mix reflects that horizon.`;
  const topRisk = (clientEval.risks || []).slice().sort((a, b) => b.urgency - a.urgency)[0];
  const summary =
    `Health reads ${clientEval.healthBand} (${Math.round(clientEval.health)}/100). ` +
    (topRisk ? `The item that matters this week: ${topRisk.text}` : `Nothing this week requires a decision before the next review.`);
  return { thesis, summary };
}

export async function narrateClient(clientEval, portfolio, rmNotes = []) {
  const facts = {
    client: { name: portfolio.name, mandate: portfolio.mandate, riskProfile: portfolio.riskProfile, riskBand: portfolio.riskBand },
    goals: (portfolio.goals || []).map(g => ({ name: g.name, horizon: g.horizon })),
    health: { score: Math.round(clientEval.health), band: clientEval.healthBand },
    risks: (clientEval.risks || []).map(r => r.text),
    opportunities: (clientEval.opportunities || []).map(o => o.text),
    rmNotes
  };
  const res = await generateBrief({
    system: SYSTEM,
    prompt: `Facts:\n${JSON.stringify(facts, null, 2)}`,
    schema: SCHEMA
  });
  if (res.ok && res.data && typeof res.data.thesis === "string" && typeof res.data.summary === "string") {
    return { thesis: res.data.thesis, summary: res.data.summary };
  }
  return templateNarration(clientEval, portfolio);
}
```

- [ ] **Step 4: Run it — expect pass** → PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/eval/narrate.js src/eval/narrate.test.js
git commit -m "Eval: narrateClient — the single gated LLM touch, with a template fallback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 7: `runEvaluation` orchestrator + hash

**Files:**
- Create: `src/eval/evaluate.js`
- Test: `src/eval/evaluate.test.js`

**Interfaces:**
- Consumes: `scoreCountries` (Task 3), `evaluateClient` (Task 4 — 6-arg signature: `portfolio, instruments, signals, prevSignals, countryScores, policyScan`), `collectUrgent` (Task 5).
- Produces: `runEvaluation({ portfolios, instruments, signals, prevSignals, market, policyScan }) → Evaluation`:
  ```
  { at:number, countries:{iso3→CountryScore}, clients:{pid→ClientEval}, urgent:UrgentTask[], hash:{pid→string} }
  ```
  Each `ClientEval` in `clients` also gets a flattened `cite`-less shape? No — keep `citations` on it (the UI reads them for chips). Also exports `hashClient(clientEval) → string` (FNV-1a over `{health, risks:[[id,urgency]], actions:[[id,urgency]]}`).

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../signals/fixtures/signals.js";
import * as market from "../market/index.js";
import { runEvaluation, hashClient } from "./evaluate.js";

async function run(signals = SIGNALS) {
  const data = await demoAdapter();
  return runEvaluation({ portfolios: data.portfolios, instruments: data.instruments, signals, prevSignals: PREV_SIGNALS, market, policyScan: null });
}

test("evaluates every country and every client", async () => {
  const ev = await run();
  for (const iso of Object.keys(SIGNALS)) assert.ok(ev.countries[iso], iso);
  const data = await demoAdapter();
  for (const p of data.portfolios) assert.ok(ev.clients[p.id], p.id);
  assert.equal(typeof ev.at, "number");
  assert.ok(Array.isArray(ev.urgent));
  for (const p of data.portfolios) assert.equal(typeof ev.hash[p.id], "string");
});

test("hash is stable for the same inputs and moves when a signal worsens", async () => {
  const a = await run();
  const b = await run();
  const worse = structuredClone(SIGNALS);
  worse.TWN.riskDelta += 20; worse.TWN.instability = 95;
  const c = await run(worse);
  const anyId = Object.keys(a.clients)[0];
  assert.equal(a.hash[anyId], b.hash[anyId]);
  // at least one client's hash should change
  assert.ok(Object.keys(a.hash).some(id => a.hash[id] !== c.hash[id]));
});

test("hashClient is deterministic", () => {
  const ce = { health: 61, risks: [{ id: "f1", urgency: 80 }], actions: [{ id: "a1", urgency: 80 }] };
  assert.equal(hashClient(ce), hashClient(structuredClone(ce)));
});
```

- [ ] **Step 2: Run it — expect failure** → FAIL.

- [ ] **Step 3: Create `src/eval/evaluate.js`**

```js
import { scoreCountries } from "./countryScore.js";
import { evaluateClient } from "./clientEval.js";
import { collectUrgent } from "./urgent.js";

export function hashClient(ce) {
  const basis = JSON.stringify({
    h: Math.round(ce.health),
    r: (ce.risks || []).map(r => [r.id, Math.round(r.urgency)]),
    a: (ce.actions || []).map(a => [a.id, Math.round(a.urgency)])
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) { h ^= basis.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function runEvaluation({ portfolios, instruments, signals, prevSignals, market, policyScan = null }) {
  const countries = scoreCountries(signals, prevSignals, market, policyScan);
  const clients = {}, hash = {};
  for (const p of portfolios) {
    const ce = evaluateClient(p, instruments, signals, prevSignals, countries, policyScan);
    clients[p.id] = ce;
    hash[p.id] = hashClient(ce);
  }
  const urgent = collectUrgent(Object.values(clients));
  return { at: Date.now(), countries, clients, urgent, hash };
}
```

> `scoreCountries` gains a 4th `policyScan` param (Task 3 already wrote it that way). Confirm.

- [ ] **Step 4: Run it — expect pass** → PASS, 3/3. Then run the whole suite: `node --test src/eval/ src/market/`.

- [ ] **Step 5: Add the test script to `package.json`**

```json
  "scripts": {
    …existing…,
    "test": "node --test src/eval/ src/market/ src/store.test.js"
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/eval/evaluate.js src/eval/evaluate.test.js package.json
git commit -m "Eval: runEvaluation orchestrator + FNV-1a per-client hash

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 8: Store — state + selectors

**Files:**
- Modify: `src/store.js`
- Test: `src/store.test.js`

**Interfaces:**
- Produces: `S.evaluation = null`, `S.narratedHash = {}`; selectors `countryScore(iso3)`, `clientEval()`, `urgentTasks()` — all null-safe (return `null` / `[]` when `S.evaluation` is null).

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { S, countryScore, clientEval, urgentTasks } from "./store.js";

test("selectors are null-safe before the first evaluation", () => {
  S.evaluation = null; S.portfolio = { id: "p1" };
  assert.equal(countryScore("TWN"), null);
  assert.equal(clientEval(), null);
  assert.deepEqual(urgentTasks(), []);
});

test("selectors read S.evaluation once populated", () => {
  S.portfolio = { id: "p1" };
  S.evaluation = {
    countries: { TWN: { score: 71 } },
    clients: { p1: { health: 60 } },
    urgent: [{ actionId: "a1" }]
  };
  assert.equal(countryScore("TWN").score, 71);
  assert.equal(clientEval().health, 60);
  assert.equal(urgentTasks().length, 1);
});
```

- [ ] **Step 2: Run it — expect failure** → FAIL (selectors not exported).

- [ ] **Step 3: Modify `src/store.js`**

In the `S` object add:
```js
  policyScan: null, policyScanState: "idle",
  evaluation: null, narratedHash: {}
```
At the end of the file add:
```js
export const countryScore = iso3 => S.evaluation?.countries?.[iso3] || null;
export const clientEval = () => S.evaluation?.clients?.[S.portfolio?.id] || null;
export const urgentTasks = () => S.evaluation?.urgent || [];
```

- [ ] **Step 4: Run it — expect pass** → PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/store.js src/store.test.js
git commit -m "Store: S.evaluation + narratedHash + countryScore/clientEval/urgentTasks selectors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 9: The AI globe lens

**Files:**
- Modify: `src/ui/palette.js` (add `ai` to `LENSES()`, import `S`)
- Modify: `src/ui/globe.js` (tooltip drivers line)
- Modify: `src/ui/shell.js` (5th lens button)
- Modify: `src/store.js` (`S.lens = "ai"`)

**Interfaces:**
- Consumes: `S.evaluation.countries` (Task 7/8).
- Produces: a 5th lens keyed `"ai"` in `LENSES()`; the globe defaults to it.

- [ ] **Step 1: Add the lens to `src/ui/palette.js`**

Add `import { S } from "../store.js";` at the top. In the object returned by `LENSES()` add, after `pol`:
```js
  ai:{ label:"AI risk score",
      cap:"Sequential. The model's composite country risk — signals, market volatility and policy combined.",
      lo:"0 calm", mid:"", hi:"100 acute", ramp:P.SQ,
      val:c => S.evaluation?.countries?.[c.iso3]?.score ?? 0,
      fmt:v => Math.round(v),
      col:v => P.SQ[Math.min(4, Math.floor(v / 20))] }
```
(`c` is the CountrySignal; it carries `.iso3`. `store.js` does not import `palette.js`, so no cycle.)

- [ ] **Step 2: `src/store.js` — default lens**

Change `lens: "d"` → `lens: "ai"`.

- [ ] **Step 3: `src/ui/shell.js` — the button**

In the `.lensbar` group, set `data-lens="d"` button to `aria-pressed="false"` and append:
```html
          <button data-lens="ai" aria-pressed="true">AI risk</button>
```

- [ ] **Step 4: `src/ui/globe.js` — drivers in the tooltip**

Find the `polygonLabel` callback. In the branch that renders an exposed country's tooltip, after the existing rows, add:
```js
      ${S.lens === "ai" && S.evaluation?.countries?.[iso] ? `<div class="r"><span>Drivers</span><span>${
        S.evaluation.countries[iso].drivers.filter(d => d.contribution > 0).map(d => d.label).join(", ") || "—"}</span></div>` : ""}
```
(`iso` is already in scope in that callback — confirm the local variable name; it is `a3(f)` assigned to `iso`.)

- [ ] **Step 5: Verify**

Run: `npm run build` → passes.
Run: `npm run dev`, dismiss the title screen.
Expected: the lens bar shows 5 buttons, **AI risk** pressed; the globe is coloured by the AI score once the first evaluation lands (Task 10 wires `refreshEvaluation` — until then the globe shows all-calm, which is fine). Clicking the other lenses still works and the legend updates.

- [ ] **Step 6: Commit**

```bash
git add src/ui/palette.js src/ui/globe.js src/ui/shell.js src/store.js
git commit -m "Globe: 5th 'AI risk' lens, default on load

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 10: Cockpit rewire — 4-segment spine + evaluation loop

**Files:**
- Modify: `src/ui/shell.js` (spine → 4 segments; `#urgent` element)
- Create: `src/ui/segments.js` (`paintExplanation`, `paintAnalysis`, `paintActions`)
- Create: `src/ui/urgent.js` (minimal `paintUrgent` — fleshed out in Task 11)
- Delete: `src/ui/spine.js`
- Modify: `src/main.js` (`refreshEvaluation`, poll hook, `maybeNarrateOpenClient`, `renderAll` rewire, "evaluated ago")
- Modify: `src/ui/panels.js` (`paintSituation` seg header text only)

**Interfaces:**
- Consumes: `runEvaluation` from `../eval/evaluate.js`; `narrateClient` from `../eval/narrate.js`; `clientEval`, `urgentTasks`, `S` from `../store.js`; `marketData` (namespace) from `../market/index.js`.
- Produces:
  - `shell.js` spine: `#seg-explanation #seg-situation #seg-analysis #seg-actions` + `#urgent` (below `.tick-strip`).
  - `segments.js`: `paintExplanation()`, `paintAnalysis()`, `paintActions()` — all read `clientEval()`; render into their segment; no args.
  - `urgent.js`: `paintUrgent(onPick)` — Task 11 completes it; here it renders nothing and keeps `#urgent` hidden.
  - `main.js`: `refreshEvaluation()` (sync, sets `S.evaluation`), `maybeNarrateOpenClient()` (async), both wired into `boot()` and the poll callback.

- [ ] **Step 1: `src/ui/shell.js` — restructure the spine + add `#urgent`**

Replace the whole `.spine` block:
```html
    <div class="spine" id="spine">
      <section class="seg" id="seg-explanation"></section>
      <section class="seg" id="seg-situation"></section>
      <section class="seg" id="seg-analysis"></section>
      <section class="seg" id="seg-actions"></section>
    </div>
```
(Drop the `.evi-cta` block and the `#slideover` aside only if nothing else uses them — grep `ev-open-comp`, `openEvidence`, `slideover` first; the merged code still wires them in `main.js`. Keep them for now; a later cleanup task can remove. Simplest: leave `.evi-cta` + `#slideover` as-is.)

Add, immediately after the `.tick-strip` div and before `.stage`:
```html
  <div class="urgent-strip" id="urgent" hidden></div>
```

- [ ] **Step 2: Create `src/ui/segments.js`**

```js
import { S, clientEval } from "../store.js";
import { openPortfolioDetail } from "./drawers.js";
import { URGENT_CUTOFF } from "../eval/rubric.js";

const shimmer = `<span class="prose-shimmer">…</span>`;
const citeChip = n => `<span class="cite-chip">${n} cite${n === 1 ? "" : "s"}</span>`;

export function paintExplanation() {
  const e = clientEval();
  const el = document.getElementById("seg-explanation");
  if (!e) { el.innerHTML = `<div class="seg-h"><h3>Explanation</h3></div><p class="muted">evaluating…</p>`; return; }
  const p = S.portfolio;
  const goals = (p.goals || []).slice(0, 3);
  const topPos = [...p.positions].sort((a, b) => b.weightPct - a.weightPct).slice(0, 3);
  el.innerHTML = `
    <div class="seg-h"><span class="seg-n">01</span><h3>Explanation</h3>
      <span class="c">${p.mandate} · ${p.riskBand}</span></div>
    <div class="health"><div class="health-dial health-${e.healthBand}"><span>${Math.round(e.health)}</span></div>
      <div><div class="health-band">${e.healthBand}</div>
        <div class="health-drivers">${e.drivers.slice(0, 3).map(d => `<span>${d.label}</span>`).join("")}</div></div></div>
    <p class="prose">${e.thesis ?? shimmer}</p>
    <p class="prose">${e.summary ?? shimmer}</p>
    <div class="rollup">
      <div><h4>Goals</h4>${goals.map(g => `<div class="ru"><span>${g.name}</span><span>${g.baseFunded}%</span></div>`).join("")}</div>
      <div><h4>Top positions</h4>${topPos.map(x => `<div class="ru"><span>${x.instrumentId}</span><span>${x.weightPct.toFixed(1)}%</span></div>`).join("")}</div>
    </div>
    <button class="ghost sm" id="open-portfolio">Full portfolio</button>`;
  document.getElementById("open-portfolio").addEventListener("click", () => openPortfolioDetail());
}

export function paintAnalysis() {
  const e = clientEval();
  const el = document.getElementById("seg-analysis");
  if (!e) { el.innerHTML = `<div class="seg-h"><h3>Analysis</h3></div><p class="muted">evaluating…</p>`; return; }
  const row = it => `<li class="finding urg-${it.urgency >= URGENT_CUTOFF ? "hi" : "lo"}">
    <span class="sev sev-${it.severity}"></span><span class="ftext">${it.text}</span>
    <span class="upip" title="urgency ${Math.round(it.urgency)}">${Math.round(it.urgency)}</span>${citeChip(it.cite.length)}</li>`;
  el.innerHTML = `
    <div class="seg-h"><span class="seg-n">03</span><h3>Analysis</h3>
      <span class="c">${e.risks.length} risks · ${e.opportunities.length} opportunities</span></div>
    ${e.risks.length ? `<h4>Risks</h4><ul class="findings">${e.risks.map(row).join("")}</ul>` : ""}
    ${e.opportunities.length ? `<h4>Opportunities</h4><ul class="findings">${e.opportunities.map(row).join("")}</ul>` : ""}
    ${!e.risks.length && !e.opportunities.length ? `<p class="muted">Nothing flagged this week.</p>` : ""}`;
}

export function paintActions() {
  const e = clientEval();
  const el = document.getElementById("seg-actions");
  if (!e) { el.innerHTML = `<div class="seg-h"><h3>Actions</h3></div><p class="muted">evaluating…</p>`; return; }
  const sorted = [...e.actions].sort((a, b) => b.urgency - a.urgency);
  const urgent = sorted.filter(a => a.urgency >= URGENT_CUTOFF);
  const rest = sorted.filter(a => a.urgency < URGENT_CUTOFF);
  const row = a => `<article class="action act-${a.kind}" data-action="${a.id}">
    <div class="a-top"><span class="a-kind">${a.kind.replace(/-/g, " ")}</span>
      <span class="a-class">${a.mandateClass.replace(/-/g, " ")}</span>
      <span class="upip">${Math.round(a.urgency)}</span></div>
    <p class="a-text">${a.text}</p>
    <p class="a-reason">${a.reason}</p>
    <span class="cite-chip">${a.cite.length} cite${a.cite.length === 1 ? "" : "s"}</span></article>`;
  el.innerHTML = `
    <div class="seg-h"><span class="seg-n">04</span><h3>Actions</h3><span class="c">RM to-dos</span></div>
    <p class="disclaimer-line">RM actions — not client-facing advice.</p>
    ${urgent.length ? `<h4 class="urgent-head">Urgent</h4>${urgent.map(row).join("")}` : ""}
    ${rest.map(row).join("")}
    ${!sorted.length ? `<p class="muted">No actions this week.</p>` : ""}`;
}
```

- [ ] **Step 3: Create `src/ui/urgent.js` (minimal)**

```js
import { urgentTasks } from "../store.js";

export function paintUrgent(onPick) {
  const el = document.getElementById("urgent");
  const tasks = urgentTasks();
  if (!tasks.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `<span class="urgent-lab">Urgent</span>` + tasks.map(t =>
    `<button class="urgent-task urg-${t.kind}" data-uid="${t.portfolioId}|${t.actionId}">
      <b>${t.clientName}</b> ${t.text}<span class="upip">${Math.round(t.urgency)}</span></button>`).join("");
  el.querySelectorAll("[data-uid]").forEach(b => b.addEventListener("click", () => {
    const [portfolioId, actionId] = b.dataset.uid.split("|");
    onPick({ portfolioId, actionId });
  }));
}
```

- [ ] **Step 4: `src/main.js` — the evaluation loop**

Imports — replace the panels/spine import lines with:
```js
import { paintBook, paintHead, paintEvidence, paintLegend, paintTicker, paintSituation } from "./ui/panels.js";
import { paintExplanation, paintAnalysis, paintActions } from "./ui/segments.js";
import { paintUrgent } from "./ui/urgent.js";
```
Add:
```js
import { runEvaluation } from "./eval/evaluate.js";
import { narrateClient } from "./eval/narrate.js";
import * as marketData from "./market/index.js";
```
Remove the `paintGoals` / `paintPositions` / `paintConversation` / `paintActions(old)` imports and the `import { openEvidence, closeEvidence } from "./ui/evidence.js"` stays (slideover unchanged).

Add these functions (near `renderAll`):
```js
export function refreshEvaluation() {
  S.evaluation = runEvaluation({
    portfolios: S.portfolios, instruments: S.instruments,
    signals: S.signals, prevSignals: S.prevSignals,
    market: marketData, policyScan: S.policyScan
  });
}

function rmNotesFor(p) { return (p.relationship?.concerns || []); }

async function maybeNarrateOpenClient() {
  const id = S.portfolio?.id;
  const ev = S.evaluation?.clients?.[id];
  if (!ev) return;
  if (ev.thesis && S.narratedHash[id] === S.evaluation.hash[id]) return;
  const { thesis, summary } = await narrateClient(ev, S.portfolio, rmNotesFor(S.portfolio));
  ev.thesis = thesis; ev.summary = summary;
  S.narratedHash[id] = S.evaluation.hash[id];
  paintExplanation();
}
```

In `boot()`, inside `buildCockpit`, before `renderAll();`:
```js
    refreshEvaluation();
```
and after `renderAll();`:
```js
    maybeNarrateOpenClient();
```

In the `pollSignals` callback, change to:
```js
  pollSignals([...isos], ({ signals, prevSignals }) => {
    S.signals = signals; S.prevSignals = prevSignals;
    refreshEvaluation();
    renderAll();
    maybeNarrateOpenClient();
  }, CONFIG.POLL_MS, { offline: CONFIG.OFFLINE });
```

Rewrite `renderAll()`'s paint section:
```js
  paintBook(id => {
    S.portfolio = S.portfolios.find(p => p.id === id);
    S.selIso = null; S.goalSel = null; S.household = false;
    renderAll();
    maybeNarrateOpenClient();
  });
  paintHead(() => { S.household = !S.household; S.selIso = null; renderAll(); });
  paintLegend(); paintGlobe(); paintEvidence();
  paintTicker(feed);
  paintUrgent(onUrgentPick);
  paintExplanation();
  paintSituation();
  paintAnalysis();
  paintActions();
```
Add near `railHandlers`:
```js
function onUrgentPick({ portfolioId, actionId }) {
  if (S.portfolio.id !== portfolioId) {
    S.portfolio = S.portfolios.find(p => p.id === portfolioId);
    S.selIso = null; S.goalSel = null; S.household = false;
    renderAll(); maybeNarrateOpenClient();
  }
  requestAnimationFrame(() => {
    document.getElementById("seg-actions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const card = document.querySelector(`[data-action="${actionId}"]`);
    if (card) { card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1400); }
  });
}
```
`refresh("globe")` — change the body to `paintGlobe(); paintSituation(); paintEvidence();` (drop `paintPositions`).
The `railHandlers` object: remove `onClearGoal` / `onClearSel` / `onOpenPosition` if nothing calls `paintPositions` any more — grep first. Keep `onRunPolicyScan` / `onOpenPolicyTrial` if the situation segment still shows the policy card (it does — `paintSituation` is unchanged).

The `live-t` `setInterval` in `wire()`: append the eval stamp:
```js
    const evAgo = S.evaluation ? Math.round((Date.now() - S.evaluation.at) / 1000) : null;
    document.getElementById("live-t").textContent =
      "live · updated " + (since < 60 ? since + "s" : Math.floor(since / 60) + "m") + " ago"
      + (evAgo != null ? ` · evaluated ${evAgo < 60 ? evAgo + "s" : Math.floor(evAgo / 60) + "m"} ago` : "");
```

- [ ] **Step 5: `src/ui/panels.js` — seg header text**

In `paintSituation`, change the `<h3>Situation</h3>` header's `<span class="c">` (or add one) to read `the global picture` and the `seg-n` to `02`.

- [ ] **Step 6: Delete `src/ui/spine.js`**

```bash
git rm src/ui/spine.js
```
Grep `spine.js` / `paintConversation` across `src/` → only `main.js` (now fixed). `paintConversation`'s content is reproduced in Task 12's `openPortfolioDetail`.

- [ ] **Step 7: Verify**

Run: `node --test src/eval/ src/market/ src/store.test.js` → all green.
Run: `npm run build` → passes.
Run: `npm run dev`, dismiss the title screen.
Expected: the spine shows **Explanation · Situation · Analysis · Actions**; the globe is AI-coloured; Explanation shows a health dial + a "…" shimmer that resolves to a thesis/summary within a couple seconds (or immediately as the template with no key); Analysis lists risks/opportunities; Actions lists actions with an Urgent subhead; the "evaluated Ns ago" stamp appears and refreshes ~60 s later. No console errors. `git grep -nE "seg-goals|seg-positions|seg-conv|paintGoals|paintPositions|paintConversation|spine\.js"` in `src/` → nothing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Cockpit: 4-segment spine (Explanation/Situation/Analysis/Actions) + the 60s evaluation loop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 11: Urgent strip — full interaction

**Files:**
- Modify: `src/ui/urgent.js` (already minimal from Task 10 — no change needed if Step 3 there is complete)
- Modify: `src/ui/styles.css` (the `.urgent-*` block — or defer to Task 13)
- Verify only — the wiring landed in Task 10.

This task exists as a **review checkpoint** for the urgent-strip behaviour specifically. If Task 10's `paintUrgent` + `onUrgentPick` are complete and working, this is a no-op commit-free verification; otherwise fix here.

- [ ] **Step 1: Verify the interaction**

Run: `npm run dev`. With `CONFIG.OFFLINE` or keyless is fine.
Expected:
- The urgent strip appears below the ticker when any client has an action `urgency ≥ 65`; hidden otherwise.
- Each entry shows `ClientName` + the action text + an urgency pip.
- Clicking an entry for a *different* client switches to that client (book rail highlight moves), the spine re-renders, then scrolls to Actions and the matching action card flashes.
- Clicking an entry for the *current* client just scrolls + flashes.
- Reduced-motion: the flash is an instant highlight, no smooth-scroll animation (`scrollIntoView` with `behavior: "auto"` when `matchMedia("(prefers-reduced-motion:reduce)").matches`).

- [ ] **Step 2: If `onUrgentPick` did not honour reduced-motion, fix it**

```js
const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
document.getElementById("seg-actions")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
```

- [ ] **Step 3: Commit (only if changed)**

```bash
git add src/ui/urgent.js src/main.js
git commit -m "Urgent strip: reduced-motion-safe jump + flash

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 12: Portfolio-detail drawer

**Files:**
- Modify: `src/ui/drawers.js` (add `openPortfolioDetail`)
- Verify: wired from `segments.js` `paintExplanation` "Full portfolio" button (done in Task 10).

**Interfaces:**
- Consumes: the private `openDrawer(html, wide)` in `drawers.js`; `S`, `goals`, `rows` from `../store.js`; `lookThroughBar` from `./panels.js`.
- Produces: `export function openPortfolioDetail()` — a wide drawer showing goals (with funding % and this-week change), positions (with look-through bars), and the relationship record (last contact, standing concerns, talking points, likely objections — the old `paintConversation` content).

- [ ] **Step 1: Add `openPortfolioDetail` to `src/ui/drawers.js`**

```js
import { goals as goalsSel, rows as rowsSel } from "../store.js";   // add to existing store imports
// … `lookThroughBar` is already imported from "./panels.js" in this file …

export function openPortfolioDetail() {
  const p = S.portfolio, gs = goalsSel(), rs = rowsSel();
  const r = p.relationship;
  openDrawer(`
    <div class="dr-h"><div><div style="font-size:15px;font-weight:600">${p.name}</div>
      <div style="font-size:11.5px;color:var(--ink-3);margin-top:3px">${p.ref} · ${p.mandate} · ${p.currency} ${p.aum}</div>
    </div><button class="x" aria-label="Close">×</button></div>
    <div class="dr-body">
      <section class="dr-sec"><h3>Goals</h3>
        ${gs.map(g => `<div class="tl-i"><span class="rail-dot" style="background:var(--amber)"></span>
          <div><span class="tx"><b>${g.name}</b> — ${g.horizon} · ${g.targetLabel}</span>
            <div class="mt"><span class="src">${g.funded}% funded</span>
              <span style="font-family:var(--mono);font-size:10px;color:var(--ink-4)">${g.change === 0 ? "no change" : (g.change > 0 ? "+" : "−") + Math.abs(g.change) + " pts wk"}</span></div></div></div>`).join("")}
      </section>
      <section class="dr-sec"><h3>Positions</h3>
        ${rs.map(x => `<button class="card" data-t="${x.instrumentId}">
          <div class="c-top"><span class="tickr">${x.instrumentId}</span><span class="cname">${x.name}</span>
            <span class="wtv">${x.weightPct.toFixed(1)}%</span></div>
          ${lookThroughBar(x.inst, S.signals)}</button>`).join("")}
      </section>
      ${r ? `<section class="dr-sec"><h3>Relationship</h3>
        <p class="lede"><strong>Last contact:</strong> ${r.last.date} · ${r.last.channel} — ${r.last.topics}</p>
        <p class="lede">${r.behaviour}</p>
        <h4 style="font-size:11px;text-transform:uppercase;color:var(--ink-3);margin:12px 0 6px">Standing concerns</h4>
        ${r.concerns.map(c => `<p class="lede">· ${c}</p>`).join("")}
        <h4 style="font-size:11px;text-transform:uppercase;color:var(--ink-3);margin:12px 0 6px">Talking points</h4>
        ${r.points.map((pt, i) => `<p class="lede">${i + 1}. ${pt}</p>`).join("")}
        <h4 style="font-size:11px;text-transform:uppercase;color:var(--ink-3);margin:12px 0 6px">Likely objections</h4>
        ${r.objections.map(o => `<p class="lede"><em>"${o[0]}"</em> — ${o[1]}</p>`).join("")}
      </section>` : ""}
    </div>`, true);
  document.querySelectorAll('#drawer [data-t]').forEach(b =>
    b.addEventListener("click", () => openPosition(b.dataset.t)));
}
```

> If `drawers.js` does not already import `lookThroughBar` / `openPosition` locally, add them from `./panels.js` / same file. `openPosition` is defined in this file — call it directly.

- [ ] **Step 2: Verify**

Run: `npm run dev`. Open a client → Explanation → "Full portfolio".
Expected: the drawer opens wide with Goals, Positions (clicking one opens the existing position drawer), and the Relationship record. `Esc` / scrim closes it.

- [ ] **Step 3: Commit**

```bash
git add src/ui/drawers.js
git commit -m "Drawer: openPortfolioDetail — goals + positions + relationship record

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 13: Styles + docs + full verification

**Files:**
- Modify: `src/ui/styles.css`
- Modify: `docs/FRIDAY-CHECKLIST.md`

- [ ] **Step 1: Append the CSS to `src/ui/styles.css`**

At end of file (order among trailing rules is irrelevant):

```css
/* ── Urgent strip ──────────────────────────────────────────────────────── */
.urgent-strip{display:flex; align-items:center; gap:8px; padding:7px 18px; overflow-x:auto;
  background:rgba(226,104,60,.08); border-bottom:1px solid var(--line)}
.urgent-lab{flex:none; font-family:var(--mono); font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--ember)}
.urgent-task{flex:none; display:flex; align-items:center; gap:7px; background:var(--panel); border:1px solid var(--line);
  border-left:2px solid var(--ember); border-radius:6px; padding:5px 9px; font-size:11px; color:var(--ink-2); cursor:pointer; white-space:nowrap}
.urgent-task b{color:var(--ink); font-weight:600}
.upip{font-family:var(--mono); font-size:9px; color:var(--ember); border:1px solid var(--line); border-radius:3px; padding:0 4px}

/* ── Explanation ───────────────────────────────────────────────────────── */
.health{display:flex; align-items:center; gap:14px; margin:4px 0 14px}
.health-dial{width:52px; height:52px; border-radius:50%; display:grid; place-items:center;
  font-family:var(--disp); font-weight:800; font-size:18px; border:2px solid var(--flat)}
.health-strong{border-color:var(--cool); color:var(--cool)}
.health-watch{border-color:var(--amber); color:var(--amber)}
.health-strained{border-color:var(--ember); color:var(--ember)}
.health-band{font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-3)}
.health-drivers span{font-size:10px; color:var(--ink-4); margin-right:8px}
.prose{font-family:var(--serif); font-size:13.5px; line-height:1.62; color:var(--ink-2); margin:0 0 10px}
.prose-shimmer{color:var(--ink-4); animation:pl 1.6s infinite}
.rollup{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:12px 0 12px}
.rollup h4{font-family:var(--mono); font-size:9px; letter-spacing:.09em; text-transform:uppercase; color:var(--ink-3); margin:0 0 6px}
.ru{display:flex; justify-content:space-between; font-size:12px; color:var(--ink-2); padding:3px 0}

/* ── Analysis / Actions ────────────────────────────────────────────────── */
.findings{list-style:none; margin:0 0 6px; padding:0}
.finding{display:flex; gap:9px; align-items:baseline; padding:8px 0; border-bottom:1px solid var(--line-soft); font-size:12.5px; color:var(--ink-2)}
.finding.urg-hi{border-left:2px solid var(--amber); padding-left:9px}
.finding .ftext{flex:1}
.sev{width:6px; height:6px; border-radius:50%; flex:none; margin-top:5px}
.sev-high{background:var(--ember)} .sev-medium{background:var(--amber)} .sev-low{background:var(--cool)}
.cite-chip{flex:none; font-family:var(--mono); font-size:9px; color:var(--ink-4); border:1px solid var(--line); border-radius:3px; padding:1px 5px}
.action{border:1px solid var(--line); border-left:2px solid var(--flat); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:var(--raise)}
.act-reduce-risk{border-left-color:var(--ember)} .act-use-opportunity{border-left-color:var(--cool)} .act-fit-needs{border-left-color:var(--amber-2)}
.a-top{display:flex; gap:8px; align-items:center; margin-bottom:5px}
.a-kind{font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:var(--amber-2)}
.a-class{font-family:var(--mono); font-size:9px; text-transform:uppercase; color:var(--ink-4); border:1px solid var(--line); border-radius:3px; padding:1px 5px}
.a-top .upip{margin-left:auto}
.a-text{font-size:13px; color:var(--ink); margin:0 0 4px}
.a-reason{font-size:11.5px; color:var(--ink-4); margin:0 0 6px; line-height:1.5}
.urgent-head{color:var(--ember) !important}
.disclaimer-line{font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--amber-2); margin:0 0 12px}
.muted{color:var(--ink-4); font-size:12px}
.flash{animation:flash 1.4s ease}
@keyframes flash{0%{box-shadow:0 0 0 2px var(--amber)}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.prose-shimmer,.flash{animation:none}}
```

- [ ] **Step 2: `docs/FRIDAY-CHECKLIST.md`**

Replace the demo-path section's cockpit beats with:
```markdown
- Globe opens on the **AI risk** lens — every country coloured by the model's composite score.
- The **Urgent strip** under the ticker lists the highest-urgency actions across the whole book;
  click one to jump to that client's Actions.
- A client's spine: **Explanation** (health dial + AI-written thesis/summary + a Full-portfolio
  drawer) → **Situation** (the global picture) → **Analysis** (flagged risks & opportunities,
  each with an urgency score and citation count) → **Actions** (RM to-dos, urgent ones pinned,
  each tagged by mandate class).
- The "evaluated Ns ago" stamp by the live clock; the whole book re-scores every 60 s.
- With no LLM key the thesis/summary come from a template — everything else is identical.
```

- [ ] **Step 3: Full test + build**

Run: `npm run test` → all `node:test` files green, output pristine.
Run: `npm run build` → passes, no new warnings.
Run: `git grep -nE "seg-goals|seg-positions|seg-conv|paintGoals\b|paintPositions\b|paintConversation|require.*spine|from \"./ui/spine" -- src/` → nothing.

- [ ] **Step 4: Spec §11 manual checklist**

`npm run dev:all` (or `npm run dev` — the LLM call degrades to template without the server):
1. Globe defaults to AI lens and is coloured; hover a country → score + drivers in the tooltip.
2. Switch to an advisory client, open **Actions** → grep the rendered text for "buy"/"sell"/
   "execute" → none. Switch to Vogt (discretionary) → at least one action tagged
   "executable under mandate".
3. Every Analysis + Actions row shows a "N cites" chip with N ≥ 1.
4. Wait ~60 s → the "evaluated" stamp resets; if a signal changed, the client hash moves and the
   thesis/summary re-generate (watch the shimmer).
5. Click an urgent-strip task for another client → switches client, scrolls to Actions, flashes.
6. DevTools reduced-motion → no shimmer animation, no smooth scroll, instant flash.
7. `?view=client` still renders the light client view unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/ui/styles.css docs/FRIDAY-CHECKLIST.md
git commit -m "Eval model: styles for the urgent strip + 4-segment spine; demo-path doc

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §4.1 file layout | Tasks 1–13 create exactly those files (+ `src/eval/rubric.js` split from the spec's implicit "constants live in rubric.js" — §6 names it) |
| §4.2 data flow (boot + poll → runEvaluation → renderAll; narrate gate) | Task 10 |
| §4.3 `S.evaluation` / `S.narratedHash` / selectors | Task 8 |
| §5 output shapes (`Evaluation`, `CountryScore`, `ClientEval`, `Finding`, `Action`, `UrgentTask`) | Tasks 3, 4, 5, 7 |
| §6 rubric (all constants, country score, health, urgency, findings, actions, urgent, hash) | Tasks 3, 4, 5, 7 |
| §7 `narrateClient` (LLM + template, gated) | Task 6 (fn), Task 10 (gate) |
| §8 market data (`history.js` 16 series, `index.js` 5 fns) | Tasks 1, 2 |
| §9.1 AI globe lens (5th lens, default, tooltip drivers) | Task 9 |
| §9.2 urgent strip (book-wide, below ticker, click→select→scroll→flash) | Tasks 10, 11 |
| §9.3 4-segment spine (Explanation/Situation/Analysis/Actions; Full-portfolio drawer; paintSituation kept) | Tasks 10, 12 |
| §9.4 "evaluated Ns ago" | Task 10 step 4 |
| §10 fallback matrix | Tasks 6, 9, 10 + Task 13 checklist |
| §11 testing | every task's `node:test` + Task 13 |
| §12 resolved decisions | honoured throughout |

No gaps.

**2. Placeholder scan:** Task 4's code carries a `NOTE` block that changes `evaluateClient`'s
signature to add `prevSignals` and adds the goal-band-cross rule — this is an explicit, complete
instruction with the real code, not a placeholder; the surrounding steps and Task 7's caller are
told to match. Task 11 is a verification checkpoint that only commits if something was broken —
deliberate, and its steps contain the actual fix code. No "TBD" / "handle edge cases" / undefined
references.

**3. Type consistency:**
- `evaluateClient(portfolio, instruments, signals, prevSignals, countryScores, policyScan)` — the
  Task 4 NOTE settles the 6-arg signature; Task 7's `runEvaluation` calls it that way; Task 4's
  test is told to pass `PREV_SIGNALS` as arg 4.
- `scoreCountries(signals, prevSignals, market, policyScan = null)` — Task 3 writes the 4-arg form;
  Task 7 calls it with 4.
- `ClientEval` keys (`health, healthBand, exposureScore, drivers, thesis, summary, risks,
  opportunities, actions, citations`) — Task 4 produces, Task 6 (`narrateClient`) reads
  `health/healthBand/risks/opportunities`, Task 8 selector returns it, Task 10 `segments.js` reads
  `health/healthBand/drivers/thesis/summary/risks/opportunities/actions`, each `.cite` /
  `.citations`. Consistent.
- `Action` keys (`id, text, kind, urgency, mandateClass, reason, cite`) — Task 4 produces, Task 5
  `collectUrgent` reads `id/text/urgency/kind`, Task 10 `paintActions` reads all, `onUrgentPick`
  matches `[data-action="${a.id}"]`.
- `UrgentTask` keys (`portfolioId, clientName, actionId, text, urgency, kind`) — Task 5 produces,
  Task 10 `paintUrgent` reads all, `onUrgentPick({portfolioId, actionId})`.
- `hashClient` / `runEvaluation` / `S.evaluation.hash[id]` vs `S.narratedHash[id]` — Task 7
  produces `hash`, Task 10 `maybeNarrateOpenClient` compares against `S.narratedHash`.
- `LENSES().ai.val` reads `S.evaluation?.countries?.[c.iso3]?.score` — matches Task 7's
  `Evaluation.countries[iso3].score`.

Consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-04-rm-intelligence-evaluation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
