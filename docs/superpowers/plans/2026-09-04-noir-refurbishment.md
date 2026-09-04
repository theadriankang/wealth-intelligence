# Financial-Noir Visual Refurbishment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Wealth Intelligence one committed visual identity ("Financial noir"), replace the five-tab cockpit with a single narrative "briefing spine", add a title screen, and re-skin the client view as a calm light inversion — without touching anything below the UI layer.

**Architecture:** Pure `src/ui/*` refactor plus `index.html`, `src/main.js`, `src/store.js`, `src/config.js`. A new CSS token system in `styles.css` re-skins every existing component through variables (including the signal-ramp vars that `palette.js` consumes, so `palette.js` needs no edit). `shell.js` is restructured from tabs to a pinned situation column + a scrolling spine of five `<section class="seg">` blocks + an Evidence slide-over that reuses the existing drawer mechanism. `tabs.js` is split into `spine.js` (segments 04–05) and `evidence.js` (Compliance + Impact into the slide-over). A new `title.js` renders a full-screen overlay the cockpit builds behind.

**Tech Stack:** Vanilla ES modules, Vite 6, `globe.gl` 2.46.2. Google Fonts. No framework, no test runner, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-noir-refurbishment-design.md` — read it alongside this plan.

## Global Constraints

- **No new runtime dependencies.** `package.json` `dependencies` stays `{ "globe.gl": "2.46.2" }`.
- **No test framework.** This project has none by design (hackathon, imminent demo). Every task is verified manually via `npm run dev` and the checks written into the task. There are no `*.test.js` files to write.
- **Do not touch** `src/adapters/`, `src/model/`, `src/signals/`, `src/llm/` except to *read* a CSS variable. No logic changes there.
- **`globe.gl` data pipeline is frozen** — only colour arguments in `src/ui/globe.js` change. No changes to `polygonsData`, `polygonAltitude`, `pointsData`, `ringsData`, `arcsData` *data*, only their colour callbacks.
- **The 9-beat demo path in `docs/FRIDAY-CHECKLIST.md` must run beat-for-beat after every task.** The mapping table is in the spec §3.3.
- **`npm run dev` must work fully offline** after every task.
- **Every keyframe animation must be disabled under** `@media (prefers-reduced-motion:reduce)`.
- **Colour tokens are verbatim from spec §2.1. Type faces verbatim from spec §2.2:** Bricolage Grotesque (display), JetBrains Mono (data/chrome), Spectral (narrative).
- **Commit after every task** with the message shown in the task's final step.

---

## File Structure

| File | Responsibility after this plan |
|---|---|
| `index.html` | Loads the three Google font families; unchanged otherwise |
| `src/config.js` | Adds `TITLE_SCREEN: true` |
| `src/store.js` | App state + selectors; `tab` key removed |
| `src/main.js` | Boot (title screen → cockpit), globe mount, poll, event wiring (lenses, book, goals, household, slide-over), `LATE_FEED` sim |
| `src/ui/styles.css` | The noir token system + every component style, including the new `.seg` / `.situation` / `.slideover` / title-screen / `.cv*` classes |
| `src/ui/palette.js` | **Unchanged.** Reads `--up-*` / `--dn-*` / etc. from `styles.css` |
| `src/ui/globe.js` | `globe.gl` mount + paint; noir colours; data pipeline unchanged |
| `src/ui/shell.js` | The cockpit DOM skeleton: top bar, ticker, book strip, situation column, spine (5 segments), slide-over container |
| `src/ui/panels.js` | Renders top bar bits, book, situation header, legend, evidence readout, ticker, and — split out of the old `paintPfRail` — `paintSituation()` (segment 01) and `paintPositions()` (segment 03); `paintGoals()` (segment 02); `lookThroughBar()` |
| `src/ui/spine.js` | **New.** `paintActions()` (segment 04) + `paintConversation()` (segment 05), moved from `tabs.js` |
| `src/ui/evidence.js` | **New.** `paintCompliance()` + `paintEconomics()`, moved from `tabs.js`, rendering into the slide-over; `openEvidence()` / `closeEvidence()` |
| `src/ui/title.js` | **New.** `renderTitle(root, onEnter)` — full-screen title overlay |
| `src/ui/drawers.js` | Position drawer + client-note drawer; restyled only |
| `src/ui/clientview.js` | Client view; light-inversion re-skin, logic unchanged |
| `src/ui/tabs.js` | **Deleted** |
| `docs/FRIDAY-CHECKLIST.md` | Demo-path section updated to spine locations |

---

## Task 1: Noir token system + fonts

Re-skin every existing component by swapping the CSS variables and font faces. After this task the current tab layout still works — it just looks like the noir system. No structural change yet.

**Files:**
- Modify: `index.html:7-8`
- Modify: `src/ui/styles.css:1-19` (the `:root` block) and `:374` (the reduced-motion rule)
- Modify: `src/ui/styles.css:415-442` — leave the `.cv*` block for Task 6; only adjust if a shared token breaks it visibly

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties on `:root` that every other file relies on —
  `--black --near --raise --line --line-soft --ink --ink-2 --ink-3 --ink-4 --amber --amber-2 --ember --cool --flat --good`,
  the font vars `--disp` (Bricolage Grotesque), `--mono` (JetBrains Mono), `--serif` (Spectral),
  and the **redefined signal-ramp vars** `--up-1..5` (amber ramp), `--dn-1..4` (steel ramp),
  `--sq-1..5` (ember ramp), `--pol-h2/h4/d2/d4`, `--crit --serious --warn --good --flat --dim --mute-sel`
  which `src/ui/palette.js` reads unchanged.

- [ ] **Step 1: Swap the font links in `index.html`**

Replace lines 7–8:

```html
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500;700&family=Spectral:ital,wght@0,300;0,400;0,500;1,400&display=swap">
  <link rel="stylesheet" href="/src/ui/styles.css">
```

- [ ] **Step 2: Rewrite the `:root` block in `src/ui/styles.css`**

Replace lines 1–15 (the whole `:root{…}`) with:

```css
:root{
  color-scheme: dark;
  /* ground + structure */
  --black:#08090b; --near:#0d0e11; --raise:#131419;
  --line:#1c1d22; --line-soft:#141519;
  --void:var(--black); --plane:var(--near); --panel:var(--near); --panel-2:var(--raise); --panel-3:#191a20;
  /* ink */
  --ink:#eceded; --ink-2:#a0a2a8; --ink-3:#63656c; --ink-4:#3f4147;
  /* the one luminous signal + its lone counter-pole */
  --amber:#f5c542; --amber-2:#f0a03c; --ember:#e2683c; --cool:#5c7a8f;
  --flat:#2a2c31; --dim:#141519; --mute-sel:#242730; --good:#4a9d8e;
  /* deterioration ramp (heat) — palette.js reads these as P.UP */
  --up-1:#4a3c1a; --up-2:#7a5f1f; --up-3:#b08a24; --up-4:#dcb02e; --up-5:#f5c542;
  /* improvement ramp (steel) — palette.js reads these as P.DN */
  --dn-1:#233038; --dn-2:#33474f; --dn-3:#48636d; --dn-4:#5c7a8f;
  /* instability (ember) — P.SQ */
  --sq-1:#3a2114; --sq-2:#6b3320; --sq-3:#9c4a2c; --sq-4:#c85f38; --sq-5:#e2683c;
  /* policy, unvalenced: amber tightening / cool easing — P.POL_* */
  --pol-h4:#f5c542; --pol-h2:#8a6f2a; --pol-d2:#33474f; --pol-d4:#5c7a8f;
  /* severity — P.SEV */
  --crit:#e2683c; --serious:#f0a03c; --warn:#f5c542; --good:#4a9d8e;
  /* type */
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --disp:"Bricolage Grotesque","Archivo",system-ui,sans-serif;
  --serif:"Spectral",Georgia,"Times New Roman",serif;
}
```

Notes: `--sans` is aliased to the mono stack on purpose — the old design used a UI sans everywhere; noir uses mono for chrome. Prose that should be Spectral is switched per-component in later tasks, not here. The `--void/--plane/--panel*` aliases keep every existing selector working.

- [ ] **Step 3: Add the atmospheric background to `.app`**

In `src/ui/styles.css`, find `.app{` (line ~20) and replace its `background:var(--void);` declaration with:

```css
  background:
    radial-gradient(ellipse 52% 40% at 50% -4%, rgba(245,197,66,.09), transparent 70%),
    radial-gradient(ellipse 80% 60% at 50% 118%, rgba(0,0,0,.5), transparent 60%),
    var(--black);
  position:relative;
```

Then immediately after the `.app{…}` rule add:

```css
.app::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.5;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")}
.app > *{position:relative;z-index:1}
```

- [ ] **Step 4: Give the display face to headings and numerals**

In `src/ui/styles.css` add near the top (after the `body` rule, ~line 18):

```css
.brand h1,.ch h2,.goal .pct,.econ .v,.evid .big,.memo .mh .t{font-family:var(--disp);letter-spacing:-.02em}
.brand h1{font-weight:800;text-transform:uppercase}
```

- [ ] **Step 5: Extend the reduced-motion guard**

`src/ui/styles.css` line ~374 already reads:

```css
@media (prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important}}
```

Leave it — it already covers every keyframe by wildcard. Confirm it is the last rule in the file; if later tasks append keyframes below it, move this rule to the very end.

- [ ] **Step 6: Verify**

Run: `npm run dev` (offline is fine)
Expected:
- App loads, no console errors.
- Ground is near-black `#08090b` with a faint amber glow top-centre and visible film grain.
- The live-dot pulse, ticker, goal deltas, globe are all recoloured amber/steel — no blue, no green except the dim `--good` teal.
- All five tabs still switch and render.
- Toggle DevTools "Emulate CSS prefers-reduced-motion: reduce" → pulse and ticker stop.

- [ ] **Step 7: Commit**

```bash
git add index.html src/ui/styles.css
git commit -m "Noir token system: palette, three-voice type, atmosphere

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 2: Recolour the globe

`src/ui/globe.js` colour arguments only. The data pipeline is frozen.

**Files:**
- Modify: `src/ui/globe.js:20-23` (mount: atmosphere), `:28-29` (rings), `:32-35` (arcs), `:38-40` (material), `:74` (polygon stroke), `:94` (point colour)

**Interfaces:**
- Consumes: `P.*` and `css()` from `palette.js` (already imported), the tokens from Task 1.
- Produces: nothing new — same exported `mountGlobe`, `sizeGlobe`, `paintGlobe`, `isoFromFeature`.

- [ ] **Step 1: Atmosphere → amber rim**

`src/ui/globe.js` line 20, change:

```js
    .showAtmosphere(true).atmosphereColor("#f0a03c").atmosphereAltitude(0.15)
```

- [ ] **Step 2: Globe material → near-black**

Lines 38–40, change:

```js
  globe.globeMaterial().color.set("#0c0d10");
  globe.globeMaterial().emissive.set("#f5c542");
  globe.globeMaterial().emissiveIntensity = 0.02;
  globe.globeMaterial().shininess = 2;
```

- [ ] **Step 3: Rings → ember**

Line 28, change the ring colour callback:

```js
    .ringColor(() => (t => `rgba(226,104,60,${1 - t})`))
```

- [ ] **Step 4: Arcs → amber (hot) / steel (cool)**

Lines 32–33, change:

```js
    .arcColor(a => a.hot ? ["rgba(245,197,66,0.05)","rgba(245,197,66,0.75)"]
                         : ["rgba(92,122,143,0.03)","rgba(92,122,143,0.25)"])
```

- [ ] **Step 5: Polygon stroke → keep borders legible on near-black**

Line 74, change:

```js
  globe.polygonStrokeColor(f => ex[a3(f)] ? "rgba(245,197,66,0.35)" : "rgba(255,255,255,0.08)");
```

- [ ] **Step 6: Point colour for strained chokepoints → ember**

Line 94, change the first branch:

```js
    p.status === "strained" ? css("--ember")
```

- [ ] **Step 7: Verify**

Run: `npm run dev`, stay on the Portfolio tab.
Expected:
- Sphere reads near-black with a warm amber halo.
- Countries with mandate exposure have amber (deterioration) or steel-blue (improvement) caps per the current lens; borders on those countries are a thin amber line and remain visible.
- Chokepoint rings pulse ember; the hot shipping lane is amber.
- Switch all four lenses — each still renders; the legend ramp matches.
- DevTools disable WebGL (`chrome://flags` or Rendering panel) → globe area is blank but the rest of the Portfolio tab is intact.

- [ ] **Step 8: Commit**

```bash
git add src/ui/globe.js
git commit -m "Recolour globe to noir: near-black sphere, amber choropleth, ember rings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 3: Split `tabs.js` into `spine.js` + `evidence.js` (pure move)

No behaviour change. Move the four render functions to their new homes and re-point imports. Tabs still work exactly as before. This isolates the mechanical move from the structural change in Task 4.

**Files:**
- Create: `src/ui/spine.js`
- Create: `src/ui/evidence.js`
- Delete: `src/ui/tabs.js`
- Modify: `src/main.js:11` (import)

**Interfaces:**
- Consumes: everything the old `tabs.js` consumed — `S, actionState, economics, flagged, positions, rows` from `store.js`; `P` from `palette.js`; `ECONOMICS_BASELINE` from `model/scoring.js`; `chokepointExposure` from `model/lookthrough.js`.
- Produces:
  - `spine.js` exports `paintActions(onChange)` and `paintConversation()` — identical signatures to today.
  - `evidence.js` exports `paintCompliance()` and `paintEconomics()` — identical signatures to today. (Task 5 adds `openEvidence`/`closeEvidence` here.)

- [ ] **Step 1: Create `src/ui/spine.js`**

Move `paintActions` and `paintConversation` verbatim from `src/ui/tabs.js` (lines 13–84), with the imports they need:

```js
import { S, actionState } from "../store.js";

/* paintActions — segment 04 · Recommended actions */
export function paintActions(onChange) {
  /* … body identical to tabs.js paintActions … */
}

/* paintConversation — segment 05 · The conversation */
export function paintConversation() {
  /* … body identical to tabs.js paintConversation … */
}
```

Keep every `document.getElementById(...)` target string as-is for now (`"tn-act"`, `"actions"`, `"conv"`) — Task 4 changes them.

- [ ] **Step 2: Create `src/ui/evidence.js`**

Move `COMPLY`, `paintCompliance`, `paintEconomics` verbatim from `src/ui/tabs.js` (lines 1–11, 86–142):

```js
import { S } from "../store.js";
import { actionState, economics, flagged, positions } from "../store.js";
import { ECONOMICS_BASELINE } from "../model/scoring.js";
import { chokepointExposure } from "../model/lookthrough.js";

const COMPLY = [ /* … identical … */ ];

export function paintCompliance() { /* … identical … */ }
export function paintEconomics() { /* … identical … */ }
```

- [ ] **Step 3: Delete `src/ui/tabs.js`**

```bash
git rm src/ui/tabs.js
```

- [ ] **Step 4: Re-point the import in `src/main.js`**

Line 11, change:

```js
import { paintActions, paintConversation } from "./ui/spine.js";
import { paintCompliance, paintEconomics } from "./ui/evidence.js";
```

- [ ] **Step 5: Verify**

Run: `npm run dev`
Expected: identical to before — all five tabs render, Actions state toggles work, Compliance watch-count and Impact numbers show. No console errors. `git grep tabs.js` returns nothing.

- [ ] **Step 6: Commit**

```bash
git add src/ui/spine.js src/ui/evidence.js src/main.js
git commit -m "Split tabs.js into spine.js (actions, conversation) + evidence.js (compliance, impact)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 4: The briefing spine — shell restructure + wiring

The structural change. Replace the tab DOM with the pinned situation column + a scrolling spine of five segments + a slide-over container. Split `paintPfRail` into `paintSituation()` (segment 01) and `paintPositions()` (segment 03). Rewire `main.js`. Remove `S.tab`. After this task the app is fully working in its new shape and the demo path runs.

**Files:**
- Modify: `src/ui/shell.js` (whole `shellHtml` template)
- Modify: `src/ui/panels.js` — split `paintPfRail` (lines 114–189) into `paintSituation` + `paintPositions`; retarget `paintGoals` (→ `#seg-goals`), `paintHead` (→ `#sit-head`)
- Modify: `src/ui/globe.js:53` — `.globe-wrap` → `.glass` selector
- Modify: `src/main.js` — `renderAll`, `wire`, `refresh`, `railHandlers`
- Modify: `src/store.js:8` — remove `tab: "pf",`
- Modify: `src/ui/spine.js` — retarget IDs (`tn-act`→remove, `actions`→`seg-actions`, `conv`→`seg-conv`)
- Modify: `src/ui/styles.css` — add `.stage`, `.book` strip, `.situation`, `.spine`, `.seg`, `.slideover` rules; the old `.tabs`/`.pane`/`.pf`/`.cockpit` rules can stay unused or be deleted

**Interfaces:**
- Consumes: `paintActions`, `paintConversation` from `spine.js`; `paintCompliance`, `paintEconomics` from `evidence.js`; all `store.js` selectors; `mountGlobe`/`paintGlobe`/`sizeGlobe` from `globe.js`.
- Produces:
  - `shell.js` `shellHtml()` — DOM with ids: `#book #book-n`, `#sit-head`, `#glass` (was `.globe-wrap`), `#globe`, lens bar, `#ev-k #ev-v #ev-s`, `#lg-*`, `#ticker #mode-tag`, spine ids `#seg-situation #seg-goals #seg-positions #seg-actions #seg-conv`, `#ev-open-comp #ev-open-econ`, `#slideover #slideover-body`, `#scrim #drawer`.
  - `panels.js` new exports `paintSituation()` → renders into `#seg-situation`, `paintPositions(handlers)` → renders into `#seg-positions`. `paintPfRail` is removed.
  - `main.js` `renderAll()` calls the new function set.

- [ ] **Step 1: Rewrite `src/ui/shell.js`**

Replace the entire file with:

```js
import { CONFIG } from "../config.js";

export const shellHtml = () => `
<div class="app">
  <header class="bar">
    <div class="brand"><h1>Wealth·Intelligence</h1><span class="sub">prototype</span></div>
    <div class="live"><span class="pulse"></span><span id="live-t">live · updated 0s ago</span>
      <span class="mode" id="mode-tag">…</span></div>
    <div class="spacer"></div>
    <a class="ghost" id="client-view-btn" href="?view=client">Client view</a>
    <button class="ghost solid" id="brief-btn">Generate note</button>
  </header>

  ${CONFIG.DEMO_BANNER ? `<div class="demo-strip">
    <b>Demonstration data.</b> Mandates, holdings and signal values are fabricated.
    Advisor decision support — not investment advice.</div>` : ""}

  <div class="tick-strip">
    <div class="tick-lab"><span class="pulse" style="width:5px;height:5px"></span> Signals</div>
    <div class="tick-view"><div class="tick-run" id="ticker"></div></div>
  </div>

  <div class="stage">
    <nav class="book" id="book-rail">
      <div class="book-h"><h2>Book</h2><span id="book-n"></span></div>
      <div class="book-list" id="book"></div>
      <div class="book-f">Ember dot = a position whose look-through country risk moved
        <b>+6 or more</b> in seven days.</div>
    </nav>

    <section class="situation">
      <div class="sit-head" id="sit-head"></div>
      <div class="glass" id="glass">
        <div id="globe"></div>
        <div class="overlay hint">Drag to rotate · click a country</div>
        <div class="overlay lensbar" role="group" aria-label="Globe encoding">
          <button data-lens="d" aria-pressed="true">Risk Δ</button>
          <button data-lens="inst" aria-pressed="false">Instability</button>
          <button data-lens="tone" aria-pressed="false">Tone</button>
          <button data-lens="pol" aria-pressed="false">Policy</button>
        </div>
        <div class="overlay evid">
          <div class="k" id="ev-k">Risk-weighted concentration</div>
          <div class="big" id="ev-v">—</div>
          <div class="sm" id="ev-s"></div>
        </div>
        <div class="overlay legend">
          <h2 id="lg-title"></h2>
          <p class="cap" id="lg-cap"></p>
          <div class="ramp" id="lg-ramp" aria-hidden="true"></div>
          <div class="ramp-ax"><span id="lg-lo"></span><span id="lg-mid"></span><span id="lg-hi"></span></div>
          <div class="rule"></div>
          <div class="lg-row"><span class="bars" aria-hidden="true"><i style="height:35%"></i><i style="height:65%"></i><i style="height:100%"></i></span> Column height = capital at risk</div>
          <div class="lg-row"><span class="swatch" style="background:var(--dim)"></span> No mandate exposure</div>
          <div class="lg-row"><span class="swatch" style="background:var(--ember); border-radius:50%"></span> Chokepoint under strain</div>
        </div>
      </div>
    </section>

    <div class="spine" id="spine">
      <section class="seg" id="seg-situation"></section>
      <section class="seg" id="seg-goals"></section>
      <section class="seg" id="seg-positions"></section>
      <section class="seg" id="seg-actions"></section>
      <section class="seg" id="seg-conv"></section>
      <div class="evi-cta">
        <button class="ghost" id="ev-open-comp">Compliance &amp; screening →</button>
        <button class="ghost" id="ev-open-econ">Operating impact →</button>
      </div>
    </div>
  </div>
</div>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Detail"></aside>
<aside class="slideover" id="slideover" role="dialog" aria-modal="true" aria-label="Evidence">
  <div class="so-h"><div><div class="so-t">Evidence</div>
    <div class="so-s">Compliance · concentration · suitability trail</div></div>
    <button class="x" id="slideover-x" aria-label="Close">×</button></div>
  <div class="so-body" id="slideover-body">
    <div class="colw" id="comp"></div>
    <div class="colw" id="econ" style="margin-top:22px"></div>
  </div>
</aside>
`;
```

- [ ] **Step 1b: Retarget the globe container query**

`src/ui/globe.js:53` — `sizeGlobe()` queries the old container class. Change:

```js
  const el = document.querySelector(".glass");
```

(This is a DOM query, not the frozen data pipeline — allowed.)

- [ ] **Step 2: Split `paintPfRail` in `src/ui/panels.js`**

Delete `paintPfRail` (lines 114–189). Add in its place two functions. `paintSituation` takes the "what changed" digest + house view + policy radar; `paintPositions` takes the goal-filter notice + the position cards. Both preserve every `store.js` call from the original.

```js
/* segment 01 — Situation: what changed overnight, house-view tension, policy radar */
export function paintSituation() {
  const L = LENSES().d;
  const sel = S.selIso ? S.signals[S.selIso] : null;
  const hv = sel ? reconcile(S.selIso, sel.riskDelta) : null;
  const held = new Set(positions().map(p => p.instrumentId));
  const digest = sel
    ? sel.events.map(e => [e.at.split(" ").slice(-1)[0], e.source, `<strong>${e.text}</strong> — ${e.value}`])
    : topEvents(3);

  document.getElementById("seg-situation").innerHTML = `
    <div class="seg-h"><span class="seg-n">01</span><h3>Situation</h3>
      <span class="c">${sel ? sel.name : "overnight"}</span></div>
    <div class="digest">${digest.map(e => `<article class="dg"><time>${e[0]}</time>
      <div><p>${e[2]}</p><span class="src">${e[1]}</span></div></article>`).join("")}</div>
    ${hv ? `<div class="hv ${hv.verdict}">
      <div class="hd"><span class="vd" style="color:${hv.verdict === "tension" ? P.SEV.warn
        : hv.verdict === "confirms" ? P.SEV.good : css("--ink-3")}">${hv.verdict}</span>
        <span class="src">House view</span></div>
      <p>${hv.line}</p>${hv.note ? `<div class="src2">“${hv.note}”</div>` : ""}
      <div class="src2">${HOUSE_VIEW.source} · as of ${HOUSE_VIEW.asOf}</div></div>` : ""}
    <div class="policy-radar">
      <div class="st-ax"><span>← easing</span><span>tightening →</span></div>
      ${POLICY.map(p => {
        const w = Math.abs(p.stance) / 3 * 50;
        const col = p.stance > 0 ? P.POL_H[p.stance >= 1.5 ? 1 : 0]
                  : p.stance < 0 ? P.POL_D[p.stance <= -1.5 ? 1 : 0] : P.FLAT;
        const hits = p.affects.filter(t => held.has(t));
        return `<article class="pl"><time>${p.date}</time><div>
          <h3>${p.who} <span style="color:var(--ink-4); font-weight:400">${p.name}</span></h3>
          <p class="ex">${p.excerpt}</p>
          <div class="stance"><div class="st-track"><i style="background:${col};
            ${p.stance > 0 ? `left:50%; width:${w}%` : `right:50%; width:${w}%`}"></i></div>
            <span class="st-lab" style="color:${col}">${p.stance > 0 ? "+" : ""}${p.stance.toFixed(1)}</span></div>
          <div class="pillrow" style="margin-top:7px">${hits.length
            ? hits.map(t => `<span class="chip"><b>holds</b>${t}</span>`).join("")
            : `<span class="chip" style="color:var(--ink-4)">no position</span>`}</div>
        </div></article>`;
      }).join("")}
    </div>`;
}

/* segment 03 — Positions under pressure (+ goal-filter notice) */
export function paintPositions({ onClearGoal, onClearSel, onOpenPosition }) {
  const L = LENSES().d, list = visibleRows(), all = rows();
  const maxw = Math.max(...all.map(r => r.weightPct));
  const g = goal();

  document.getElementById("seg-positions").innerHTML = `
    <div class="seg-h"><span class="seg-n">03</span><h3>Positions under pressure</h3>
      <span class="c">${list.length} of ${all.length}</span></div>
    ${g ? `<div class="filter-note">Showing only the positions funding
      <strong>${g.name}</strong> (${g.horizon}). The globe is filtered to match.
      <button class="ghost sm" id="clear-goal">Clear</button></div>` : ""}
    ${S.selIso ? `<div class="filter-note">Filtered to ${S.selIso}.
      <button class="ghost sm" id="clear-sel">Show all</button></div>` : ""}
    ${list.map(r => `<button class="card" data-t="${r.instrumentId}"
      style="border-left-color:${L.col(r.riskDelta)}">
      <div class="c-top"><span class="tickr">${r.instrumentId}</span>
        <span class="cname">${r.name}</span>
        <span class="delta" style="color:${L.col(r.riskDelta)}">${fmtD(r.riskDelta)}</span></div>
      <div class="c-mid">
        <span class="geo">${r.multi ? r.inst.exposures.length + " markets" : r.iso3}</span>
        ${r.assetClass !== "equity" ? `<span class="ac-badge">${r.assetClass}</span>` : ""}
        <span class="wt"><i style="width:${r.weightPct / maxw * 100}%"></i></span>
        <span class="wtv">${r.weightPct.toFixed(1)}%</span></div>
      ${lookThroughBar(r.inst, S.signals)}
    </button>`).join("")}`;

  document.getElementById("clear-goal")?.addEventListener("click", onClearGoal);
  document.getElementById("clear-sel")?.addEventListener("click", onClearSel);
  document.querySelectorAll("#seg-positions [data-t]").forEach(b =>
    b.addEventListener("click", () => onOpenPosition(b.dataset.t)));
}
```

Keep the existing private `topEvents(n)` helper at the bottom of `panels.js` (it is already there, lines 191–201).

- [ ] **Step 3: Retarget `paintGoals` and `paintHead` in `src/ui/panels.js`**

`paintGoals` (line 55): change `document.getElementById("goals").innerHTML =` to build a segment. Wrap the existing `.goal` button markup:

```js
export function paintGoals(onPick) {
  document.getElementById("seg-goals").innerHTML = `
    <div class="seg-h"><span class="seg-n">02</span><h3>Goals at risk</h3>
      <span class="c">${S.goalSel ? "1 filtered" : goals().length + " tracked"}</span></div>
    ` + goals().map(g => {
      /* … existing per-goal template literal, unchanged … */
    }).join("");
  document.querySelectorAll("[data-g]").forEach(b =>
    b.addEventListener("click", () => onPick(b.dataset.g)));
}
```

`paintHead` (line 35): change `document.getElementById("client-head").innerHTML =` to `document.getElementById("sit-head").innerHTML =`. The inner markup is unchanged (client name, ref, mandate tag, facts row, household button).

- [ ] **Step 4: Retarget IDs in `src/ui/spine.js`**

- `paintActions`: delete the two lines that set `document.getElementById("tn-act").textContent = …`. Change `document.getElementById("actions").innerHTML` → `document.getElementById("seg-actions").innerHTML`, and prepend a segment header to the template:
  ```js
  document.getElementById("seg-actions").innerHTML = `
    <div class="seg-h"><span class="seg-n">04</span><h3>Recommended actions</h3>
      <span class="c">${disc ? "discretionary" : "advisory · needs client decision"}</span></div>
    ` + `<p style="…">${disc ? "…" : "…"}</p>` + p.actions.map(/* unchanged */).join("");
  ```
- `paintConversation`: change `document.getElementById("conv").innerHTML` → `document.getElementById("seg-conv").innerHTML`, prepend:
  ```js
  `<div class="seg-h"><span class="seg-n">05</span><h3>The conversation</h3>
    <span class="c">last contact ${r.last.date}</span></div>` + /* existing blocks */
  ```

- [ ] **Step 5: Add `openEvidence`/`closeEvidence` to `src/ui/evidence.js`**

Append:

```js
export function openEvidence() {
  paintCompliance(); paintEconomics();
  document.getElementById("slideover").classList.add("on");
  document.getElementById("scrim").classList.add("on");
}
export function closeEvidence() {
  document.getElementById("slideover").classList.remove("on");
  document.getElementById("scrim").classList.remove("on");
}
```

Change `paintCompliance` first line from `document.getElementById("tn-comp").textContent = …` — delete that line (no tab badge any more). Targets `#comp` and `#econ` stay (they exist in the slide-over).

- [ ] **Step 6: Remove `S.tab` from `src/store.js`**

Line 8: delete `tab: "pf",` so the line reads:

```js
  portfolio: null, lens: "d", selIso: null, goalSel: null,
```

- [ ] **Step 7: Rewrite `wire()` and `renderAll()` and `refresh()` in `src/main.js`**

Replace the imports block (lines 9–13) references and the three functions:

```js
import { paintBook, paintHead, paintGoals, paintEvidence, paintLegend, paintTicker,
  paintSituation, paintPositions } from "./ui/panels.js";
import { paintActions, paintConversation } from "./ui/spine.js";
import { paintCompliance, paintEconomics, openEvidence, closeEvidence } from "./ui/evidence.js";
```

`wire()` — replace the `[data-tab]` block (lines 60–67) with:

```js
  document.getElementById("ev-open-comp").addEventListener("click", openEvidence);
  document.getElementById("ev-open-econ").addEventListener("click", openEvidence);
  document.getElementById("slideover-x").addEventListener("click", closeEvidence);
  document.getElementById("scrim").addEventListener("click", closeEvidence);
  addEventListener("keydown", e => { if (e.key === "Escape") closeEvidence(); });
```

Keep the lens block, the `live-t` interval, and the `LATE_FEED` block unchanged.

`refresh(what)` (lines 85–88): change `paintPfRail(railHandlers)` → `paintSituation(); paintPositions(railHandlers)`.

`railHandlers` (lines 90–94): unchanged keys, still `onClearGoal`, `onClearSel`, `onOpenPosition`.

`renderAll()` (lines 96–115): replace the body with:

```js
export function renderAll() {
  paintBook(id => {
    S.portfolio = S.portfolios.find(p => p.id === id);
    S.selIso = null; S.goalSel = null; S.household = false;
    renderAll();
  });
  paintHead(() => { S.household = !S.household; S.selIso = null; renderAll(); });
  paintGoals(id => { S.goalSel = S.goalSel === id ? null : id; S.selIso = null; renderAll(); });
  paintLegend(); paintGlobe(); paintEvidence();
  paintTicker(feed);
  paintSituation();
  paintPositions(railHandlers);
  paintActions(renderAll);
  paintConversation();
}
```

(`paintCompliance`/`paintEconomics` are no longer called on every render — only when the slide-over opens.)

- [ ] **Step 8: Add the CSS for the new structure**

Append to `src/ui/styles.css` (before the reduced-motion rule; move that rule to the end if needed). Use the class shapes from the mockup `.superpowers/brainstorm/*/content/briefing-spine.html` §`.stage .book .situation .spine .seg .slideover`. Minimum set:

```css
.stage{display:grid; grid-template-columns:44px minmax(320px,1fr) 400px; min-height:0; position:relative}
.book{border-right:1px solid var(--line); background:var(--plane); display:flex; flex-direction:column; min-height:0; overflow:hidden}
.book:hover{position:absolute; z-index:20; width:230px; height:100%; box-shadow:8px 0 30px rgba(0,0,0,.5)}
.book .book-h,.book .book-f,.book .book-list .rf{opacity:0; transition:opacity .12s}
.book:hover .book-h,.book:hover .book-f,.book:hover .book-list .rf{opacity:1}
.situation{border-right:1px solid var(--line); display:flex; flex-direction:column; min-height:0;
  background:radial-gradient(ellipse 70% 50% at 50% 40%, #12161b, var(--black) 72%)}
.sit-head{padding:13px 16px 4px}
.glass{position:relative; flex:1; min-height:0}
#globe{position:absolute; inset:0}
.spine{overflow-y:auto; min-height:0; display:flex; flex-direction:column}
.seg{padding:16px 20px; border-bottom:1px solid var(--line-soft);
  opacity:0; transform:translateY(10px); animation:rise .5s ease forwards}
.seg:nth-child(1){animation-delay:.04s}.seg:nth-child(2){animation-delay:.12s}
.seg:nth-child(3){animation-delay:.20s}.seg:nth-child(4){animation-delay:.28s}.seg:nth-child(5){animation-delay:.36s}
@keyframes rise{to{opacity:1; transform:none}}
.seg-h{display:flex; align-items:baseline; gap:9px; margin-bottom:12px}
.seg-n{font-family:var(--mono); font-size:10px; color:var(--amber); letter-spacing:.1em}
.seg-h h3{font-family:var(--disp); font-weight:700; font-size:13px; margin:0; text-transform:uppercase; letter-spacing:.02em}
.seg-h .c{margin-left:auto; font-size:10px; color:var(--ink-4)}
.filter-note{font-size:11.5px; color:var(--ink-2); background:var(--panel-2); border:1px solid var(--line-soft);
  border-radius:7px; padding:9px 11px; margin-bottom:10px; line-height:1.5}
.policy-radar{margin-top:14px}
.evi-cta{display:flex; gap:8px; padding:14px 20px}
.evi-cta .ghost{flex:1}
.slideover{position:fixed; top:0; right:0; height:100dvh; width:min(420px,100vw);
  background:var(--panel); border-left:1px solid var(--amber); z-index:50;
  transform:translateX(100%); transition:transform .26s cubic-bezier(.32,.72,0,1);
  display:flex; flex-direction:column}
.slideover.on{transform:translateX(0)}
.so-h{display:flex; gap:12px; padding:16px 20px; border-bottom:1px solid var(--line)}
.so-t{font-family:var(--disp); font-weight:700; font-size:13px; text-transform:uppercase}
.so-s{font-size:10px; color:var(--ink-4); margin-top:3px}
.so-h .x{margin-left:auto; background:transparent; border:1px solid var(--line); border-radius:6px;
  width:28px; height:28px; cursor:pointer; color:var(--ink-3)}
.so-body{overflow-y:auto; padding:18px 20px 30px}
@media (max-width:1200px){.stage{grid-template-columns:1fr} .book{display:none}
  .situation{min-height:300px} .slideover{width:100vw}}
```

Delete the now-unused `.tabs`, `.pane`, `.pf`, `.globe-wrap`, `.cockpit`, `.pfrail`, `.ch` blocks from `styles.css` **only if** a grep of `src/` shows no remaining reference; otherwise leave them.

- [ ] **Step 9: Verify the full demo path**

Run: `npm run dev` offline. Walk `docs/FRIDAY-CHECKLIST.md` "Demo path", all 9 beats:
1. Opens on Bergmann; segment 02 shows the 2027 property goal down sharply.
2. Click that goal → segment 02 count shows "1 filtered", segment 03 filters to its drivers, globe filters.
3. Click TSM card in segment 03 → position drawer opens (look-through table, timeline, provenance, house-view tension).
4. Click JBGEF → drawer shows the 5% Taiwan look-through.
5. Household toggle in the situation header → Taiwan figure rises and the breach shows (check segment 03 / drawer).
6. Segment 04 shows trim vs collar; expand a suitability record; switch to Vogt in the book rail → discretionary wording differs.
7. Click "Operating impact →" → slide-over opens with Compliance + Impact; Esc closes it.
8. Top-bar "Generate note" → client-note drawer, footnoted.
9. Top-bar "Client view" → `?view=client` renders.
Also: segments visibly rise/stagger on load; `git grep "S.tab\|data-tab\|paintPfRail\|pane-"` returns nothing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Briefing spine: replace 5 tabs with pinned situation + scrolling segments + Evidence slide-over

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 5: Title screen

**Files:**
- Create: `src/ui/title.js`
- Modify: `src/config.js` (add `TITLE_SCREEN: true`)
- Modify: `src/main.js` `boot()` (lines 20–48)
- Modify: `src/ui/styles.css` (title-screen classes)

**Interfaces:**
- Consumes: `CONFIG.TITLE_SCREEN` from `config.js`.
- Produces: `src/ui/title.js` exports `renderTitle(root, onEnter)` — appends a `<div class="title-screen">` to `root` (does not clear it), calls `onEnter()` and removes the node on click / any keydown; if `matchMedia("(prefers-reduced-motion:reduce)").matches` it skips the entrance animation.

- [ ] **Step 1: Create `src/ui/title.js`**

```js
export function renderTitle(root, onEnter) {
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const el = document.createElement("div");
  el.className = "title-screen" + (reduced ? " static" : "");
  el.innerHTML = `
    <div class="ts-globe" aria-hidden="true"></div>
    <div class="ts-top"><span>Julius Baer · SingHacks 2026</span><span>Prototype · fabricated data</span></div>
    <div class="ts-center">
      <div class="ts-kicker">From portfolio monitoring to</div>
      <h1 class="ts-title">Wealth <em>Intelligence</em></h1>
      <p class="ts-thesis">An adviser cockpit that reads a client's portfolio against live world
        signals — and answers the question a private bank actually cares about: does this change
        whether my client gets what they want, and what do I say to them about it?</p>
      <button class="ts-enter" type="button">Enter the cockpit <span>→</span></button>
    </div>
    <div class="ts-foot">
      <span><b>Look-through</b> a fund is not a country</span>
      <span><b>Citation gate</b> every claim sourced or dropped</span>
      <span><b>Prepare once</b> deliver to the whole book</span>
    </div>`;
  let done = false;
  const enter = () => {
    if (done) return; done = true;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), reduced ? 0 : 260);
    removeEventListener("keydown", onKey);
  };
  const onKey = () => enter();
  el.querySelector(".ts-enter").addEventListener("click", enter);
  el.addEventListener("click", e => { if (e.target === el) enter(); });
  addEventListener("keydown", onKey);
  root.appendChild(el);
  onEnter();               // build the cockpit behind the overlay immediately
}
```

- [ ] **Step 2: Add the flag to `src/config.js`**

```js
export const CONFIG = {
  ADAPTER: "demo",
  OFFLINE: false,
  POLL_MS: 60000,
  ASOF: "04 Sep 2026, 08:40 SGT",
  DEMO_BANNER: true,
  TITLE_SCREEN: true
};
```

- [ ] **Step 3: Wire it into `boot()` in `src/main.js`**

After the `?view=client` early-return block and before `root.innerHTML = shellHtml();`, restructure so the cockpit build is a function and the title gates it:

```js
  const buildCockpit = () => {
    root.innerHTML = shellHtml();
    initDrawers();
    mountGlobe(document.getElementById("globe"), { onSelect: iso => { S.selIso = iso; refresh("globe"); } });
    wire();
    renderAll();
  };

  if (CONFIG.TITLE_SCREEN && new URLSearchParams(location.search).get("view") !== "client") {
    const { renderTitle } = await import("./ui/title.js");
    renderTitle(root, buildCockpit);
  } else {
    buildCockpit();
  }

  // the existing pollSignals(...) call stays exactly as-is, immediately after this block
```

(Keep the existing `pollSignals(...)` call exactly as is, after this block.)

- [ ] **Step 4: Add title-screen CSS**

Append to `src/ui/styles.css`, using the class shapes from `.superpowers/brainstorm/*/content/title-and-clientview.html` §`.title`. Key rules:

```css
.title-screen{position:fixed; inset:0; z-index:100; display:flex; flex-direction:column;
  background:
    radial-gradient(ellipse 46% 44% at 50% 34%, rgba(245,197,66,.16), transparent 68%),
    radial-gradient(ellipse 90% 60% at 50% 118%, rgba(0,0,0,.6), transparent 55%), var(--black);
  animation:ts-in .3s ease}
.title-screen.leaving{animation:ts-out .26s ease forwards}
@keyframes ts-in{from{opacity:0}} @keyframes ts-out{to{opacity:0}}
.ts-globe{position:absolute; left:50%; top:60%; width:min(680px,90vw); aspect-ratio:1;
  transform:translate(-50%,-50%); border-radius:50%; border:1px solid rgba(245,197,66,.14);
  background:radial-gradient(circle at 44% 40%, rgba(245,197,66,.05), transparent 62%)}
.ts-top{display:flex; justify-content:space-between; padding:18px 26px; font-family:var(--mono);
  font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-4)}
.ts-center{flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;
  text-align:center; padding:0 30px; position:relative; z-index:2}
.ts-kicker{font-family:var(--mono); font-size:11px; letter-spacing:.24em; text-transform:uppercase;
  color:var(--amber); margin-bottom:20px}
.ts-title{font-family:var(--disp); font-weight:800; font-size:clamp(34px,6vw,54px); line-height:1.02;
  letter-spacing:-.03em; margin:0 0 20px}
.ts-title em{font-style:normal; color:var(--amber); text-shadow:0 0 30px rgba(245,197,66,.4)}
.ts-thesis{font-family:var(--serif); font-size:17px; line-height:1.6; color:var(--ink-2); max-width:52ch; margin:0 0 34px}
.ts-enter{font-family:var(--mono); font-size:12px; letter-spacing:.06em; text-transform:uppercase;
  background:var(--amber); color:var(--black); border:0; border-radius:7px; padding:13px 26px;
  font-weight:700; cursor:pointer; box-shadow:0 0 40px rgba(245,197,66,.3)}
.ts-foot{display:flex; gap:16px; flex-wrap:wrap; padding:16px 26px; border-top:1px solid var(--line);
  font-family:var(--mono); font-size:10px; color:var(--ink-4); position:relative; z-index:2}
.ts-foot b{color:var(--amber-2); font-weight:500}
.title-screen:not(.static) .ts-kicker{animation:rise .5s ease .05s both}
.title-screen:not(.static) .ts-title{animation:rise .5s ease .15s both}
.title-screen:not(.static) .ts-thesis{animation:rise .5s ease .27s both}
.title-screen:not(.static) .ts-enter{animation:rise .5s ease .4s both}
```

- [ ] **Step 5: Verify**

Run: `npm run dev`
Expected:
- Load → title screen, elements rise in sequence, "Enter the cockpit" button last.
- Click Enter (or press any key) → title fades, cockpit is already built underneath, globe already warmed.
- `?view=client` → no title screen.
- Set `CONFIG.TITLE_SCREEN = false` → no title screen; revert to `true`.
- DevTools reduced-motion → title elements just present, no rise.

- [ ] **Step 6: Commit**

```bash
git add src/ui/title.js src/config.js src/main.js src/ui/styles.css
git commit -m "Title screen: full-bleed noir intro, cockpit builds behind it

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 6: Client view — light inversion

`src/ui/clientview.js` logic is unchanged. This is a CSS re-skin of the `.cv*` block plus swapping the inline colour literals in the JS for the paper palette.

**Files:**
- Modify: `src/ui/styles.css:415-442` (the `.cv*` block)
- Modify: `src/ui/clientview.js:27` (the `col` ternary colour literals)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — `renderClientView(root)` signature unchanged.

- [ ] **Step 1: Rewrite the `.cv*` block in `src/ui/styles.css`**

Replace lines 415–442 with the paper-ground version (class shapes from `.superpowers/brainstorm/*/content/title-and-clientview.html` §`.cv`):

```css
.cv{min-height:100dvh; background:#f6f3ec; color:#1c1a17; font-family:var(--serif);
  display:flex; justify-content:center; padding:44px 24px 70px}
.cv-inner{width:100%; max-width:720px}
.cv .back{display:inline-block; margin-bottom:30px; font-family:var(--mono); font-size:10px;
  letter-spacing:.08em; text-transform:uppercase; color:#5a554a; text-decoration:none;
  border:1px solid #ddd6c4; border-radius:6px; padding:6px 11px; background:#fffdf8}
.cv h1{font-family:var(--disp); font-weight:700; font-size:30px; letter-spacing:-.015em; margin:0 0 6px; color:#12100d}
.cv .sub{font-family:var(--mono); font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:#5a554a; margin:0 0 30px}
.cv .lead{font-size:19px; line-height:1.62; color:#24211c; margin:0 0 30px; padding-bottom:26px; border-bottom:1px solid #ddd6c4}
.cv .lead strong{color:#8a3324; font-weight:500}
.cv-goal{display:grid; grid-template-columns:1fr auto; gap:5px 20px; align-items:baseline;
  padding:17px 0; border-bottom:1px solid #e8e1cf}
.cv-goal .n{font-family:var(--disp); font-weight:700; font-size:17px}
.cv-goal .h{grid-column:1; font-family:var(--mono); font-size:11px; color:#5a554a}
.cv-goal .p{grid-row:1/3; font-family:var(--disp); font-weight:800; font-size:26px}
.cv-goal .tr{grid-column:1/3; height:5px; border-radius:3px; background:#e6ddc9; overflow:hidden; margin-top:8px}
.cv-goal .tr i{display:block; height:100%; border-radius:3px}
.cv .talk{margin-top:32px; background:#fffdf8; border:1px solid #ddd6c4; border-radius:10px; padding:24px 26px}
.cv .talk h2{font-family:var(--mono); font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#5a554a; margin:0 0 14px}
.cv .talk p{font-size:15px; line-height:1.66; color:#2b2822; margin:0 0 12px}
.cv .talk p:last-child{margin:0}
.cv .foot{margin-top:30px; font-family:var(--mono); font-size:10px; line-height:1.7; color:#9a9074}
```

- [ ] **Step 2: Swap the goal colours in `src/ui/clientview.js`**

Line 27, change:

```js
      const col = g.funded >= 95 ? "#1f6f5c" : g.funded >= 80 ? "#b8862b" : "#8a3324";
```

- [ ] **Step 3: Verify**

Run: `npm run dev`, open `/?view=client`.
Expected:
- Warm paper ground, Spectral body, Bricolage headline + goal names/percentages.
- Goal under pressure is oxblood `#8a3324`; on-track is teal `#1f6f5c`.
- No ticker, no globe, no animation.
- "← Adviser view" link returns to the cockpit (which shows the title screen again — acceptable).
- Flip between `/` and `/?view=client`: the near-black → paper jump is stark.

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles.css src/ui/clientview.js
git commit -m "Client view: calm light inversion — paper ground, Spectral, oxblood/teal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Task 7: Docs + full verification pass

**Files:**
- Modify: `docs/FRIDAY-CHECKLIST.md` (Demo path section)

- [ ] **Step 1: Update the demo path in `docs/FRIDAY-CHECKLIST.md`**

Replace the "Demo path" numbered list (lines 34–47) so each beat names its spine location, using the mapping table from the spec §3.3. Keep the two closing lines ("Let a ticker signal land…", "If something breaks on stage" gets its globe bullet updated to "→ the spine is independent of the globe; segments 01–05 and the Evidence slide-over still carry the argument").

- [ ] **Step 2: Fallback matrix (spec §7)**

Run `npm run dev` and confirm each row:
- `CONFIG.OFFLINE = true` → `fixtures` badge amber in the top bar, app fully usable. Revert.
- Unset any LLM key / `CONFIG` — "Generate note" → template fallback renders with the "Template fallback" label.
- DevTools reduced-motion → no segment rise, no pulse, no ticker, no globe auto-rotate, title screen static.
- DevTools → Rendering → disable WebGL, reload → globe area blank, but segments 01–05 render, book rail works, Evidence slide-over opens, position drawers open, "Generate note" works, `?view=client` works.

- [ ] **Step 3: Responsive check**

Resize to 1440 / 1200 / 900 / 375 widths:
- ≤1200: book rail hidden, situation column stacks above the spine, slide-over full-width.
- ≤900: single column, globe keeps a min-height band.
- No horizontal scroll on `body` at any width.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: succeeds, no errors. Then `npm run preview` and re-walk the 9-beat demo path once in the production build.

- [ ] **Step 5: Grep for dead references**

Run: `git grep -nE "S\.tab|data-tab|pane-|paintPfRail|tn-act|tn-comp|client-head|globe-wrap|IBM Plex|tabs\.js"`
Expected: no hits in `src/` (matches in `docs/` or this plan are fine).

- [ ] **Step 6: Commit**

```bash
git add docs/FRIDAY-CHECKLIST.md
git commit -m "Update demo-path doc for the briefing-spine layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SjfNUSYkvmD5r2FiKezv7C"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §2.1 Colour tokens + ramp remap | Task 1 |
| §2.2 Three-voice typography | Task 1 (vars) + Tasks 4/5/6 (per-component application) |
| §2.3 Motion (staggered spine, title sequence, reduced-motion) | Task 4 (spine), Task 5 (title), Task 1 (guard) |
| §2.4 Background / atmosphere | Task 1 |
| §3.1 Briefing-spine layout | Task 4 |
| §3.2 `S.tab` removal, selectors untouched | Task 4 step 6 + Task 7 step 5 |
| §3.3 Demo-path mapping | Task 4 step 9, Task 7 step 1 |
| §4 Title screen (same-page reveal, bypass, reduced-motion) | Task 5 |
| §5 Client view light inversion | Task 6 |
| §6 File plan (changed/new/deleted) | Tasks 1–6 line up 1:1 with the tables |
| §7 Fallbacks | Task 7 step 2 |
| §8 Manual test checklist | Task 7 |
| §9 book-rail hover-expand; segment 01 vs ticker | Task 4 step 8 (CSS `.book:hover`); Task 4 step 2 (`paintSituation` = interpreted digest, ticker unchanged) |

No gaps.

**2. Placeholder scan:** The per-goal template in `paintGoals` (Task 4 step 3) and the action/conversation templates (Task 4 step 4) are referenced as "existing template literal, unchanged" rather than repeated — this is deliberate: they are large, already in the repo, and the instruction is to wrap not rewrite them. Every *new* markup block is written out in full. No "TBD"/"handle edge cases"/"add error handling" anywhere.

**3. Type consistency:**
- `paintSituation()` — no args — called in `renderAll` and `refresh`. Consistent.
- `paintPositions(handlers)` where `handlers = { onClearGoal, onClearSel, onOpenPosition }` — matches `railHandlers` in `main.js`. Consistent.
- `openEvidence()` / `closeEvidence()` — no args — defined in `evidence.js` (Task 4 step 5), imported in `main.js` (Task 4 step 7). Consistent.
- `renderTitle(root, onEnter)` — defined Task 5 step 1, called Task 5 step 3. Consistent.
- IDs: `#seg-situation #seg-goals #seg-positions #seg-actions #seg-conv` defined in `shell.js` (Task 4 step 1), targeted in `panels.js`/`spine.js` (Task 4 steps 2–4). `#slideover #comp #econ #ev-open-comp #ev-open-econ #slideover-x` defined in shell, wired in Task 4 steps 5/7. Consistent.
- `.glass` replaces `.globe-wrap`; `sizeGlobe()` in `globe.js:53` queries `.globe-wrap` — **Task 4 must also update `globe.js:53`** `document.querySelector(".globe-wrap")` → `.glass`. Added note below.

**Fix applied:** Task 4 step 1 note — also change `src/ui/globe.js:53` selector `.globe-wrap` → `.glass` (one line; it is a DOM query, not the frozen data pipeline).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-04-noir-refurbishment.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
