# Architecture

Three layers, one direction of travel.

```
  outside world            our model               what people see
  ─────────────            ─────────               ───────────────
  adapters/demo.js    ┐                        ┌── ui/globe.js
  adapters/juliusbaer ├──►  model/schema.js  ──┤   ui/panels.js
  adapters/csv.js     ┘     model/lookthrough  │   ui/tabs.js
                            model/scoring      │   ui/drawers.js
  signals/worldmonitor ──►  model/houseview  ──┘   ui/clientview.js
                                  ▲
                            store.js (state + selectors)
```

**Nothing in `ui/` computes anything.** Every derived number comes from `store.js`, which calls
`model/`. If a judge asks how a figure is produced, there is exactly one file to open.

## The four ideas worth defending

**1. Look-through (`model/lookthrough.js`).**
A portfolio is not a list of countries. `countryExposure()` walks every position into its
instrument's `exposures[]` and accumulates. A single equity is a one-element list; a fund is
thirty. Because every country figure in the app — globe altitude, concentration, goal drag,
chokepoint tables — comes from this one function, funds behave correctly everywhere at once.
This is the first thing a banker will test.

**2. Goal funding (`model/scoring.js`).**
```
funded = baseFunded × (1 − sensitivity × Σ(driverShare × max(0, riskDelta)/100))
```
Bounded, monotonic, explainable in a sentence, and swappable for a Monte Carlo behind the same
interface. `goalDelta()` runs it twice — against this week's and last week's signals — which is
where “−16 pts this week” comes from.

**3. House view (`model/houseview.js`).**
`reconcile()` returns `tension | confirms | aligned`. A signal that contradicts the bank's own
investment view is the interesting case, not an error. Replace `HOUSE_VIEW` with the real feed.

**4. The citation gate (`llm/validate.js`).**
The model may only arrange facts we supply, each carrying an id. Claims whose citations don't
resolve are dropped before render — not flagged, dropped. A bank cannot ship “probably sourced”.

## Failure behaviour

| Fails | Result |
|---|---|
| World Monitor unreachable | Fixtures, `fixtures` badge shown, app fully usable |
| Partial live response | Merged over fixtures — never a half-empty map |
| No LLM key / model down | Deterministic template note |
| Model returns uncited claims | Those claims dropped, count shown in the drawer header |
| Adapter mismaps a field | `validatePortfolio` logs it by name at load |

Every fallback is visible in the UI. Silent degradation is how demos die on stage.
