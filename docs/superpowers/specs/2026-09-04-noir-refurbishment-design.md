# Wealth Intelligence — visual refurbishment design

**Date:** 2026-09-04
**Status:** approved for planning
**Scope:** full-surface visual refurbishment (adviser cockpit + client view) plus a new title screen. No changes below the adapter/model/signals/llm seam.

---

## 1. Goal

The prototype works; the data mapping is sound. What it lacks is a committed, distinctive
visual identity — it currently reads as a generic dark IDE dashboard. This refurbishment gives
it one design language ("Financial noir"), reshapes the cockpit from five peer tabs into a
single narrative "briefing spine", adds a dramatic title screen, and re-does the client view as
a calm light inversion.

The product thesis is *"from portfolio monitoring to intelligence"* — a story, not a dashboard.
The refurbishment makes that legible in the shape of the UI, not only its skin.

### Non-goals

- No adapter, model, signals, or LLM logic changes. `src/adapters/`, `src/model/`,
  `src/signals/`, `src/llm/` are untouched except where a colour token is read.
- No new runtime dependencies. Vanilla JS + Vite + `globe.gl` only.
- No new framework, no component library, no test framework.
- No changes to the `globe.gl` data pipeline — only its colours.

### Success criteria

1. The rehearsed 9-beat demo path in `docs/FRIDAY-CHECKLIST.md` still runs, beat for beat, in
   the same order.
2. All three documented fallbacks still degrade visibly: `fixtures` badge, `prefers-reduced-motion`,
   and globe-dead (the argument survives without WebGL).
3. `npm run dev` works offline.
4. The UI no longer reads as a template: distinctive type, one committed palette, orchestrated
   page-load motion, atmospheric background — per `CLAUDE.md`.

---

## 2. The aesthetic system — "Financial noir"

A single reference implementation of the tokens below lives in the mockups at
`.superpowers/brainstorm/*/content/briefing-spine.html` and `title-and-clientview.html`.

### 2.1 Colour

Near-black ground, **one luminous amber** carrying every "attention" signal, a single dim
counter-pole, ember for a hard breach. Committed and lopsided by design — not an evenly
distributed palette.

```
--black    #08090b   app ground
--near     #0d0e11   panels
--raise    #131419   raised cards
--line     #1c1d22   borders
--line-soft#141519   internal dividers
--ink      #eceded   primary text
--ink-2    #a0a2a8   secondary text
--ink-3    #63656c   tertiary / labels
--ink-4    #3f4147   faint / captions
--amber    #f5c542   THE signal — attention, deterioration, active state; glows
--amber-2  #f0a03c   secondary heat
--ember    #e2683c   a crossed limit / breach only
--cool     #5c7a8f   the only counter-pole — improvement; kept deliberately dim
--flat     #2a2c31   no-signal / neutral track
--good     #4a9d8e   "clear" / on-track in the client view register
```

**Signal-ramp mapping.** `src/ui/palette.js` maps the CSS vars `--up-1..5` and `--dn-1..4`
into the `P.UP` / `P.DN` arrays that the lens colour functions consume. We keep `palette.js`
structurally unchanged and **redefine those vars in `styles.css`** to the noir ramps:

- `--up-1..5` → amber ramp (`#5c4a1c` → `#f5c542`) — deterioration / heat
- `--dn-1..4` → steel ramp (`#26343d` → `#5c7a8f`) — improvement
- `--sq-1..5` → ember ramp for the instability lens
- `--pol-*` → amber (tightening) / cool (easing), unvalenced
- `--crit/serious/warn/good` → ember / amber-2 / amber / cool

This means every globe colour, look-through bar, and delta figure re-themes with zero JS change.

### 2.2 Typography

A three-voice system:

| Voice | Face | Use |
|---|---|---|
| Display | **Bricolage Grotesque** (800/700, opsz) | product name, tickers, segment headings, every large number |
| Data / chrome | **JetBrains Mono** (400/500/700) | labels, tabular figures, timestamps, UI controls, provenance tables |
| Narrative | **Spectral** (300/400/500, + italic) | prose the adviser reads or says — the conversation, action rationale, the client note, the client view in full |

Replaces IBM Plex Mono / Sans / Serif. Loaded from Google Fonts in `index.html` with a
`gstatic` preconnect (matches the current setup). Every stack keeps a real fallback.

### 2.3 Motion

One orchestrated page-load, not scattered micro-interactions:

- Title screen: kicker → title → thesis → button rise and fade in sequence (~600ms total).
- Cockpit: the spine's five segments rise+fade staggered (`animation-delay` 0.05s → 0.37s).
  **Must not delay first data paint** — segments animate their container, data fills normally.
- Persistent: amber pulse on the live dot; slow drift on the globe (already
  `autoRotate`); ticker marquee (already present).
- Everything inside `@media (prefers-reduced-motion:reduce){*{animation:none!important}}` — the
  rule already exists in `styles.css` and is extended to cover the new keyframes.

### 2.4 Background / atmosphere

`--black` plus: a radial amber glow at top-centre (`rgba(245,197,66,.10)`), a bottom vignette,
and a faint SVG `feTurbulence` film-grain overlay at `opacity:.5; mix-blend-mode:overlay`. The
situation column adds a local radial wash behind the globe.

---

## 3. The cockpit — "Briefing spine"

### 3.1 What changes

The five peer tabs (`Portfolio / Actions / Conversation / Compliance / Impact`) are replaced by:

```
┌────┬──────────────────────┬─────────────────────────────┐
│book│  SITUATION (pinned)  │  THE SPINE (scrolls)         │
│rail│  ┌────────────────┐  │  01  Situation — overnight   │
│    │  │  lens row      │  │  02  Goals at risk          │
│ BE │  │                │  │  03  Positions under        │
│ VO │  │   globe.gl     │  │      pressure (+ household  │
│ HG │  │   (unchanged   │  │      toggle, breach line)   │
│ MR │  │    engine)     │  │  04  Recommended actions    │
│ KX │  │                │  │  05  The conversation       │
│ DL │  │  evidence      │  │  ───────────────────────    │
│    │  │  readout       │  │  [ Compliance → ][ Impact →]│
│    │  └────────────────┘  │                             │
└────┴──────────────────────┴─────────────────────────────┘
                                    Evidence slide-over ──┘
                                    (Compliance + Impact)
```

- **Book rail** collapses to a 44px icon strip (2-letter client codes, ember dot = flagged).
  Full-width labels move into a hover/expand. Below 1200px it hides, as today.
- **Situation column** is the current `.globe-wrap` + `.lensbar` + `.evid` + `.legend`,
  restyled and given a header (client name, ref, mandate tag) lifted from the current `.ch`.
  It stays pinned; only the spine scrolls.
- **The spine** is one scrolling column of five `<section class="seg">` blocks. Selecting a
  goal (segment 02) or a country (globe) filters the whole spine and the globe together —
  exactly the current `S.goalSel` / `S.selIso` behaviour, no new state.
- **Evidence slide-over** holds Compliance and Impact. Reuses the existing `.drawer` / `.scrim`
  mechanism (`initDrawers`, `openDrawer`, `closeDrawer`) — a left-border-amber panel instead of
  a right drawer, opened from the two buttons at the spine's foot.

### 3.2 State

`src/store.js` `S.tab` is **removed**. Everything else in `S` is unchanged. All selectors
(`rows`, `visibleRows`, `goals`, `goal`, `concentration`, `flagged`, `economics`, …) are
untouched — the spine calls the same functions the tabs did.

Grep target before implementation: every reference to `S.tab`, `data-tab`, `pane-`, `"pf"`,
`tn-act`, `tn-comp` across `src/`.

### 3.3 Demo-path mapping (must hold beat for beat)

| Beat (FRIDAY-CHECKLIST) | New location |
|---|---|
| 1. Open on Bergmann; 2027 goal down sharply | Book rail → segment 02 renders the goal cards |
| 2. Click that goal → globe + positions filter | Click goal card → `S.goalSel` set → spine segments 02/03 + globe filter (unchanged logic) |
| 3. Open TSM → look-through, timeline, provenance, house-view tension | Segment 03 position card → existing `openPosition` drawer |
| 4. Open JBGEF → "5% Taiwan, nobody's statement says so" | Same drawer; the look-through bar in segment 03 already foregrounds it |
| 5. Toggle Household → Taiwan 7.8% → 11.5%, crosses limit | Household toggle in segment 03 header → ember breach line renders |
| 6. Actions tab → trim vs collar → expand suitability; switch to Vogt (discretionary) | Segment 04 (was `paintActions`); suitability record inline as today; book rail switches client |
| 7. Impact tab → prepare once, deliver many | "Operating impact →" opens Evidence slide-over (was `paintEconomics`) |
| 8. Generate client note → footnoted | Top-bar "Generate note" button → existing `openBrief` drawer, unchanged |
| 9. Client view → turn the screen around | Top-bar "Client view" link → `?view=client` |

"Let a ticker signal land while you talk" — the simulated `LATE_FEED` arrival in `main.js` is
unchanged.

---

## 4. Title screen

New surface shown before the cockpit.

- **Behaviour:** full-bleed, one viewport, no scroll. Product name (Bricolage 800, "Intelligence"
  in glowing amber), a one-line thesis (Spectral), an "Enter the cockpit →" button, three
  one-line proof points in the footer. Ghost-globe wireframe behind, atmospheric glow + grain.
- **Interaction:** "Enter" (or any keypress) reveals the cockpit **on the same page, no reload**
  — so `globe.gl` keeps warming up behind the title. Implemented as a full-screen overlay in
  `#root` that the cockpit renders behind, then removes.
- **Bypass:** `?view=client` skips it entirely. `CONFIG.TITLE_SCREEN = false` disables it for
  development.
- **Reduced motion:** everything simply present, no rise/fade.

---

## 5. Client view — calm light inversion

`?view=client`, `src/ui/clientview.js`. Structure (lead paragraph, goal rows, "what we'd like
to discuss", disclaimer) is kept. Re-skinned as the deliberate opposite of the cockpit:

- Paper ground (`--paper #f6f3ec`), `--paper-2` cards, warm ink.
- Spectral throughout; Bricolage only for the goal name + percentage.
- Oxblood (`#8a3324`) for the goal under pressure, teal (`#1f6f5c`) for on-track. No amber,
  no glow.
- No ticker, no globe, no motion.
- The jolt when the laptop turns from near-black cockpit to warm paper is the point — it signals
  "this part is for you".

The `stripAdviserVoice()` softening and the `worst`-goal logic are unchanged.

---

## 6. File plan

### Changed

| File | Change |
|---|---|
| `index.html` | Font links → Bricolage Grotesque, JetBrains Mono, Spectral |
| `src/ui/styles.css` | Rewrite to the noir token system. Redefine `--up-*`/`--dn-*`/`--sq-*`/`--pol-*`/severity vars to noir ramps so `palette.js` needs no change. New component classes: `.seg` spine, `.situation`, title screen, `.slideover`. Rewrite the `.cv*` client-view block. Extend the reduced-motion rule to new keyframes |
| `src/ui/shell.js` | Structural: replace `.stage`/`.cockpit`/tabs markup with book strip + `.situation` + `.spine` (5 `<section class="seg">`) + `.slideover` container. Keep `.scrim`/`.drawer` |
| `src/ui/globe.js` | Colour only: `globeMaterial().color`/`emissive`, `atmosphereColor` → amber rim, `ringColor` → ember, `arcColor` → amber/steel, point colours via `P.*`. Keep a low-alpha `polygonStrokeColor` on exposed countries so borders survive on near-black. No pipeline change |
| `src/ui/panels.js` | Repoint the same paint functions at spine segments: `paintHead` → situation header, `paintGoals` → segment 02, `paintPfRail` splits into segment 01 ("what changed") + segment 03 ("positions"). Every `store.js` call unchanged. `lookThroughBar` unchanged |
| `src/ui/drawers.js` | Restyle only (`openPosition`, `openBrief`, memo). The slide-over borrows `openDrawer`/`closeDrawer` |
| `src/ui/clientview.js` | Re-skin to light inversion; logic unchanged |
| `src/main.js` | Boot renders title screen first (unless `?view=client` or `!CONFIG.TITLE_SCREEN`); replace tab-switch wiring with slide-over open/close + segment scroll; remove `S.tab` handling; keep globe mount, poll, `LATE_FEED` sim |
| `src/store.js` | Remove `tab: "pf"` from `S` |
| `src/config.js` | Add `TITLE_SCREEN: true` |
| `docs/FRIDAY-CHECKLIST.md` | Update the demo-path section to the new locations (table in §3.3) |

### New

| File | Contents |
|---|---|
| `src/ui/title.js` | `renderTitle(root, onEnter)` — title screen markup, any-key/click to enter, reduced-motion aware |
| `src/ui/spine.js` | `paintActions` (segment 04) + `paintConversation` (segment 05), moved verbatim-then-restyled from `tabs.js` |
| `src/ui/evidence.js` | `paintCompliance` + `paintEconomics`, moved from `tabs.js`, rendering into `.slideover` |

### Deleted

| File | Reason |
|---|---|
| `src/ui/tabs.js` | Its four functions rehomed to `spine.js` and `evidence.js` |

---

## 7. Error handling & fallbacks

| Condition | Behaviour (must be preserved) |
|---|---|
| World Monitor unreachable | Fixtures merged, `fixtures` badge in the top bar (amber) — unchanged `getMode()` |
| No LLM key / model down | `openBrief` template fallback — unchanged |
| Uncited model claims | Dropped, count in the note header — unchanged |
| `prefers-reduced-motion` | All keyframes off; title screen static; globe `autoRotate` off (already handled in `globe.js`) |
| WebGL / globe fails to render | The spine is independent of the globe. Segments 01–05 and the Evidence slide-over render and are fully usable. This replaces the old "go to Actions/Impact tabs" escape hatch and must be verified |
| Viewport < 1200px | Book strip hides (as today); situation column stacks above the spine; slide-over becomes full-width |
| Viewport < 900px | Single column; globe gets a min-height band, as today |

---

## 8. Testing

No test framework (deliberate — hackathon, vanilla, imminent). Verification is manual and
checklist-driven:

1. **Demo-path run-through** — all 9 beats in `docs/FRIDAY-CHECKLIST.md`, in order, offline.
2. **Fallback checks** — toggle `CONFIG.OFFLINE`, unset the LLM key, emulate reduced-motion,
   and (DevTools) disable WebGL; confirm the table in §7.
3. **`S.tab` removal** — grep confirms zero dangling references; every former tab surface is
   reachable.
4. **Responsive** — 1440 / 1200 / 900 / 375 widths; body never scrolls horizontally.
5. **`npm run build`** succeeds; `npm run dev` loads with no console errors.

---

## 9. Resolved decisions

- **Book-rail expand:** hover-to-expand on pointer devices, tap-to-expand on touch. No pinned
  state — it overlays the situation column while open and closes on mouse-leave / outside tap.
- **Segment 01 vs. the ticker:** both stay. The ticker is the raw chronological feed; segment 01
  is the 2–3 items that matter for *this client*, written as sentences with the "so what". Not
  redundant — it is the interpretation the ticker deliberately withholds.
