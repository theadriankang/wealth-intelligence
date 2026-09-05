import { CONFIG } from "./config.js";
import { loadData } from "./adapters/index.js";
import { S, rows, concentration } from "./store.js";
import { chokepointExposure } from "./model/lookthrough.js";
import { fetchSignals, pollSignals } from "./signals/worldmonitor.js";
import { FEED, LATE_FEED } from "./signals/fixtures/signals.js";
import { initPalette } from "./ui/palette.js";
import { shellHtml } from "./ui/shell.js";
import { installLiquidGlass, applyLiquidGlass } from "./ui/glass.js";
import { mountSilk } from "./ui/silk.js";
import { focusGlobeOnCountries, mountGlobe, paintGlobe, resetGlobeView, sizeGlobe } from "./ui/globe.js";
import { mountGoogleGlobe } from "./ui/googleGlobe.js";
import { paintBook, paintHead, paintGoals, paintEvidence, paintLegend, paintTicker, paintPfRail, paintCopilot }
  from "./ui/panels.js";
import { paintActions, paintConversation, paintCompliance, paintNews } from "./ui/tabs.js";
import { initDrawers, openPosition, openPolicyTrial } from "./ui/drawers.js";
import * as M from "./ui/motion.js";
import { FALLBACK_SCAN, runPolicyScan } from "./policy/sentinel.js";
import { runEvaluation } from "./eval/evaluate.js";
import { narrateClient, factsHash, askCopilot } from "./eval/narrate.js";
import * as marketData from "./market/index.js";

const root = document.getElementById("root");
let feed = FEED.slice(), lateIdx = 0, since = 0;

boot();

function collectIsos(portfolios, instruments) {
  const isos = new Set();
  for (const p of portfolios) for (const pos of p.positions) {
    for (const e of instruments[pos.instrumentId]?.exposures || []) isos.add(e.iso3);
  }
  return isos;
}

/** Live signals where possible; fixtures/dataset-calibrated signals otherwise. Never blocks the
 * first paint. Returns whether this adapter carries its own pre-computed signals (in which case
 * boot() must not start a live poll on top of them). */
async function loadSignals(data, isos) {
  const usesDatasetSignals = data.meta?.source === "julius-baer";
  if (usesDatasetSignals) {
    S.signals = data.signals;
    S.prevSignals = data.prevSignals;
    S.live = false;
    feed = feedFromSignals(data.signals);
  } else {
    const sig = await fetchSignals([...isos], { offline: CONFIG.OFFLINE });
    S.signals = sig.signals; S.prevSignals = sig.prevSignals; S.live = sig.live;
  }
  return usesDatasetSignals;
}

async function boot() {
  initPalette();
  const data = await loadData(CONFIG.ADAPTER);
  Object.assign(S, data);
  S.portfolio = S.portfolios[0];
  S.operator = currentOperator(data);
  S.policyScan = FALLBACK_SCAN;
  const isos = collectIsos(S.portfolios, S.instruments);
  const usesDatasetSignals = await loadSignals(data, isos);
  // Every fresh load starts at the homepage, regardless of whatever URL happens to be in the
  // address bar (a refresh on /clients/PF-0003, a bookmark, a shared link) — readRouteFromLocation()
  // would otherwise jump straight into that client's tab. history.replaceState (not pushState)
  // so this doesn't add a spurious back-button entry; normal in-app navigation (navigateToClient,
  // the logo, browser back/forward) still goes through readRouteFromLocation()/popstate exactly
  // as before this line.
  S.route = "dashboard";
  S.tab = "pf";
  history.replaceState(null, "", "/");

  root.innerHTML = shellHtml(S.operator);
  installLiquidGlass();
  mountSilk(document.getElementById("silk-bg"), {
    speed: 5,
    scale: 1,
    color: "#7B7481",
    noiseIntensity: 1.5,
    rotation: 0
  });
  initDrawers();
  try {
    const globeEl = document.getElementById("globe");
    if (CONFIG.GLOBE_PROVIDER === "google" && CONFIG.GOOGLE_MAPS_API_KEY) {
      await mountGoogleGlobe(globeEl, { apiKey: CONFIG.GOOGLE_MAPS_API_KEY });
      document.querySelector(".globe-wrap")?.classList.add("using-google-globe");
    } else {
      mountGlobe(globeEl, {
        onSelect: iso => { S.selIso = iso; refresh("globe"); },
        onOpenClient: id => railHandlers.onOpenClient(id)
      });
    }
  } catch (err) {
    console.warn("[globe] WebGL unavailable, rendering dashboard without globe canvas:", err);
    document.getElementById("globe").innerHTML = `<div class="globe-fallback">
      <div class="fallback-halo"></div>
      <div class="fallback-orbit o1"></div>
      <div class="fallback-orbit o2"></div>
      <div class="fallback-orbit o3"></div>
      <div class="fallback-globe" aria-label="Global exposure visualisation">
        <span class="land l1"></span>
        <span class="land l2"></span>
        <span class="land l3"></span>
        <span class="hotspot h1"></span>
        <span class="hotspot h2"></span>
        <span class="hotspot h3"></span>
      </div>
      <div class="fallback-core"><b>Global Exposure</b><span>Local WebGL fallback</span></div>
    </div>`;
  }
  wire();
  paintSnapshotPicker();
  refreshEvaluation();
  renderAll();
  M.boot();
  narrateAllPortfolios(); // fire-and-forget: scores the whole book once, doesn't block first paint

  if (!usesDatasetSignals) {
    pollSignals([...isos], ({ signals, prevSignals }) => {
      S.signals = signals; S.prevSignals = prevSignals;
      refreshEvaluation();
      renderAll();
    }, CONFIG.POLL_MS, { offline: CONFIG.OFFLINE });
  }
}

function wire() {
  document.addEventListener("pointerdown", e => {
    if (!S.copilotOpen) return;
    if (e.target.closest("#copilot")) return;
    S.copilotOpen = false;
    paintCopilot({ onToggle: railHandlers.onCopilotToggle, onAsk: askCopilotQuestion });
  });

  document.getElementById("open-client-rail")?.addEventListener("click", () => { S.clientDrawerOpen = true; S.railDrawerOpen = false; syncDrawers(); });
  document.getElementById("open-priority-rail")?.addEventListener("click", () => { S.railDrawerOpen = true; S.clientDrawerOpen = false; syncDrawers(); });
  document.getElementById("close-client-rail")?.addEventListener("click", () => { S.clientDrawerOpen = false; syncDrawers(); });

  // One control does both jobs — which view, and (for composition) which breakdown.
  // Two chained dropdowns for four options would be ceremony, not clarity.
  document.getElementById("pf-view")?.addEventListener("change", e => {
    S.pfView = e.target.value;
    paintLegend();
    paintGlobe();
    if (S.pfView === "map") requestAnimationFrame(sizeGlobe);
  });

  document.querySelectorAll("[data-lens]").forEach(b => b.addEventListener("click", () => {
    S.lens = b.dataset.lens;
    document.querySelectorAll("[data-lens]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.lens === S.lens)));
    paintLegend(); paintGlobe();
  }));

  document.getElementById("wi-logo-home")?.addEventListener("click", () => {
    S.route = "dashboard";
    S.clientScopeId = null;
    S.selIso = null;
    S.goalSel = null;
    S.tab = "pf";
    S.household = false;
    S.clientDrawerOpen = false;
    S.railDrawerOpen = false;
    history.pushState(null, "", "/");
    resetGlobeView();
    renderAll();
    // renderAll() -> syncTabs() has already unhidden #pane-pf, so the globe host has a real box
    // to measure. sizeGlobe() then forces globe.gl to re-measure and repaint, because the canvas
    // was 0×0 for as long as a non-Overview tab was open.
    requestAnimationFrame(sizeGlobe);
  });

  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    S.tab = b.dataset.tab;
    syncTabs();
    if (S.tab === "pf") requestAnimationFrame(sizeGlobe);
    M.pane(S.tab);
  }));

  setInterval(() => {
    since++;
    const live = document.getElementById("live-t");
    if (live) live.textContent =
      "portfolio + intelligence · updated " + (since < 60 ? since + "s" : Math.floor(since / 60) + "m") + " ago";
  }, 1000);

  // Simulated arrivals so the demo shows liveness even on fixtures.
  if (!matchMedia("(prefers-reduced-motion:reduce)").matches) {
    setInterval(() => {
      if (lateIdx >= LATE_FEED.length) return;
      feed.unshift(LATE_FEED[lateIdx++].concat([true]));
      since = 0; paintTicker(feed);
    }, 21000);
  }
  addEventListener("popstate", () => { readRouteFromLocation(); renderAll(); });
  document.getElementById("snapshot-select")?.addEventListener("change", e => switchSnapshot(e.target.value));
}

/** Shows/hides and fills the top-right snapshot picker from S.meta.snapshots/asOf — present
 * only on adapters that expose multiple calibrated points in time (the Julius Baer dataset's
 * five: 2025-12-31 through 2026-08-26). Absent entirely on the demo adapter. */
function paintSnapshotPicker() {
  const wrap = document.getElementById("snapshot-picker");
  const select = document.getElementById("snapshot-select");
  if (!wrap || !select) return;
  const snapshots = S.meta?.snapshots;
  if (!snapshots?.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  select.innerHTML = snapshots.map(d =>
    `<option value="${d}" ${d === S.meta.asOf ? "selected" : ""}>${d}</option>`).join("");
}

/**
 * Reloads the whole book "as of" a different calibrated snapshot — the same adapter, the same
 * seam (loadData(CONFIG.ADAPTER, { asOf })), just a different point in time, so an RM (or a
 * judge) can see how the AI's read of the same clients changes as market conditions move.
 * Keeps the currently open client selected across the switch when it still exists in the new
 * snapshot. Every prior AI answer is for facts that no longer apply, so S.narratedHash/
 * S.aiActionState are cleared and the whole book is re-scored from scratch — this is a genuine
 * change of "now", not a signals poll tick.
 */
async function switchSnapshot(asOf) {
  const select = document.getElementById("snapshot-select");
  if (select) select.disabled = true;
  try {
    const keepId = S.portfolio?.id;
    const data = await loadData(CONFIG.ADAPTER, { asOf });
    Object.assign(S, data);
    S.portfolio = S.portfolios.find(p => p.id === keepId) || S.portfolios[0];
    S.operator = currentOperator(data);
    S.narratedHash = {}; S.aiActionState = {};
    narrationEpoch++; // invalidates any still-in-flight narration call from the old snapshot —
                       // see maybeNarratePortfolio; clearing narratedHash alone isn't enough,
                       // since a stale result resolving after this looks like "never scored" to
                       // that check, not "scored against facts that no longer apply".
    since = 0;
    await loadSignals(data, collectIsos(S.portfolios, S.instruments));
    refreshEvaluation();
    paintSnapshotPicker();
    renderAll();
    narrateAllPortfolios();
  } finally {
    if (select) select.disabled = false;
  }
}

function refresh(what) {
  if (what === "globe") { paintGlobe(); paintPfRail(railHandlers); paintEvidence(); return; }
  renderAll();
}

const railHandlers = {
  onClearGoal: () => { S.goalSel = null; renderAll(); },
  onClearSel: () => { S.selIso = null; S.clientScopeId = null; resetGlobeView(); refresh("globe"); },
  onSelectIso: iso => { S.selIso = iso; S.railDrawerOpen = false; focusGlobeOnCountries([iso]); refresh("globe"); },
  onOpenClient: id => {
    S.portfolio = S.portfolios.find(p => p.id === id) || S.portfolio;
    S.clientScopeId = null; S.selIso = null; S.goalSel = null; S.household = false; S.railDrawerOpen = false;
    navigateToClient(id);
  },
  onOpenPosition: openPosition,
  onRunPolicyScan: runPolicySentinel,
  onOpenPolicyTrial: openPolicyTrial,
  onCopilotToggle: () => { S.copilotOpen = !S.copilotOpen; renderAll(); }
};

function readRouteFromLocation() {
  const match = location.pathname.match(/^\/clients\/([^/]+)/);
  S.route = match ? "client" : "dashboard";
  if (!match) S.tab = "pf";
  if (match) {
    const id = decodeURIComponent(match[1]);
    S.portfolio = S.portfolios.find(p => p.id === id) || S.portfolio;
    S.clientScopeId = null;
  }
}

function navigateToClient(id) {
  history.pushState(null, "", `/clients/${encodeURIComponent(id)}`);
  readRouteFromLocation();
  renderAll();
}

/** The whole deterministic evaluation, recomputed from current signals/policy scan. Pure — no
 * I/O, no LLM. Called on every poll tick and policy scan, so it mints a brand-new client object
 * per portfolio each time — any already-computed AI narration is reapplied onto those fresh
 * objects here so a live signal tick doesn't blank an already-scored client back to "loading".
 * This never asks the model again: maybeNarratePortfolio computes a client's AI score once and
 * S.narratedHash holds it for the rest of the session (until switchSnapshot deliberately clears
 * it) — a signal drifting, a poll tick, or opening/reopening a client never changes the number an
 * RM is looking at. */
function refreshEvaluation() {
  S.evaluation = runEvaluation({
    portfolios: S.portfolios, instruments: S.instruments,
    signals: S.signals, prevSignals: S.prevSignals,
    market: marketData, policyScan: S.policyScan
  });
  for (const [id, cached] of Object.entries(S.narratedHash)) {
    const ev = S.evaluation.clients[id];
    if (ev) copyNarratedFields(ev, cached);
  }
}

function rmNotesFor(p) { return (p.relationship?.concerns || []); }

/** Runs `fn` with `S.portfolio` temporarily pointed at `p`, then restores it. Synchronous only —
 * lets buildGrounding()/rows()/positions() work for any portfolio, not just the one on screen,
 * without threading a portfolio argument through every store selector they call. */
function withPortfolioContext(p, fn) {
  const old = S.portfolio;
  S.portfolio = p;
  try { return fn(); } finally { S.portfolio = old; }
}

/** Everything narrateClient needs to compute health/concentration/risks/actions, but no store
 * import in narrate.js. `jb` (tax domicile, life stage, objectives, source of wealth) only
 * exists on the Julius Baer adapter's portfolios — undefined/absent on the demo adapter, so
 * every field below degrades to null rather than throwing. Reads S.portfolio (via
 * withPortfolioContext for any portfolio other than the one on screen) and S.household — the
 * household toggle only ever applies to whichever portfolio is actually open. */
function buildGrounding() {
  const list = rows();
  const positions = list.map(r => ({
    instrumentId: r.instrumentId,
    name: r.name,
    weightPct: r.weightPct,
    riskDelta: r.riskDelta,
    currency: r.inst?.currency ?? null,
    liquidityTier: r.inst?.liquidityTier ?? null,
    countries: r.inst?.exposures?.length
      ? r.inst.exposures.map(e => ({ iso3: e.iso3, weight: e.weight }))
      : [{ iso3: r.iso3, weight: 1 }]
  }));
  const isos = new Set(positions.flatMap(p => p.countries.map(c => c.iso3)));
  const countrySignals = [...isos].filter(iso => S.signals[iso]).map(iso => ({
    iso3: iso, name: S.signals[iso].name || iso, riskDelta: S.signals[iso].riskDelta
  }));
  const jb = S.portfolio.jb;
  // The bank's own look-through chokepoint breakdown — same role as fallbackConcentration below:
  // the AI's `physicalConcentration` (Compliance tab) is validated against these real figures
  // (see AI_SCORE_BAND in narrate.js), and this is exactly what's shown if it's ever rejected.
  const chokepoints = Object.values(chokepointExposure(list, S.instruments))
    .map(c => ({ name: c.name, weightPct: Math.round(c.weightPct * 10) / 10 }))
    .sort((a, b) => b.weightPct - a.weightPct);
  return {
    household: S.household,
    positions,
    countrySignals,
    fallbackConcentration: concentration(),
    chokepoints,
    policyStance: S.policyScan?.signal?.stanceScore ?? null,
    baseCurrency: S.portfolio.currency ?? null,
    taxDomicile: jb?.taxDomicile ?? null,
    lifeStage: jb?.lifeStage ?? null,
    objectives: jb?.objectives ?? null,
    sourceOfWealth: jb?.sourceOfWealth ?? null,
    pepStatus: jb?.pepStatus ?? null,
    mandateBands: jb?.mandateBands ?? []
  };
}

function copyNarratedFields(target, src) {
  target.overview = src.overview;
  target.health = src.health; target.healthBand = src.healthBand;
  target.concentration = src.concentration; target.scoreSource = src.scoreSource;
  target.risks = src.risks; target.opportunities = src.opportunities; target.actions = src.actions;
  target.relationship = src.relationship;
  target.complianceChecks = src.complianceChecks;
  target.physicalConcentration = src.physicalConcentration;
}

/**
 * Narration is the one LLM call per portfolio — every portfolio in the book gets scored once at
 * boot (narrateAllPortfolios) and that's it: opening a client, switching tabs, toggling
 * household, or the live signal feed ticking never re-asks the model. The score an RM sees is
 * the score it stays at for the session, not something that can visibly shift under them while
 * they're looking at it. (switchSnapshot is the one deliberate exception — loading a different
 * as-of date is a genuine change of "now", so it clears S.narratedHash and re-runs
 * narrateAllPortfolios from scratch.) It carries health, the risk-weighted concentration figure,
 * a prose overview, risk findings, opportunities, recommended actions, relationship notes, and
 * compliance checks — nothing here ever falls back to showing a deterministic number: aiState()
 * (store.js) reports "loading" until this resolves, then "ai" on success or "unavailable" on
 * failure, and every render site switches on that instead of reading a number that might be a
 * guess. The deterministic engine still runs (it grounds the model's prompt and is what
 * `grounding`/`clientEval` hand to it) — it's just never displayed as if it were a live read.
 * The answer is cached in `S.narratedHash` (portfolioId → { hash, health, healthBand,
 * concentration, scoreSource, overview, risks, opportunities, actions, relationship,
 * complianceChecks, physicalConcentration }) and copied back onto the live object; a cache hit
 * never reaches the model. `inflight` makes that guarantee hold for calls that overlap in time, not
 * just in sequence.
 */
const inflight = new Set(); // `${portfolioId}|${hash}` — guards against asking twice concurrently

// Bumped by switchSnapshot(). A narration call captures this at the start and checks it again
// after awaiting the model — if a snapshot switch happened in between, the facts it was asked
// about no longer exist, and its result is discarded even though S.narratedHash[id] looks empty
// again (the switch clears it first) and would otherwise read as "never scored" rather than
// "scored against a snapshot that's gone".
let narrationEpoch = 0;

async function maybeNarratePortfolio(p) {
  const id = p?.id;
  const ev = S.evaluation?.clients?.[id];
  // Already scored — the AI score is computed once and frozen for the session (see
  // refreshEvaluation for how it survives later evaluation refreshes). Never re-ask the model
  // just because a client got opened again or the facts moved under it.
  if (!ev || S.narratedHash[id]) return;
  const epoch = narrationEpoch;
  const grounding = withPortfolioContext(p, buildGrounding);
  const hash = factsHash(id, grounding);

  const key = `${id}|${hash}`;
  if (inflight.has(key)) return; // same client, already asking
  inflight.add(key);
  let narrated;
  try {
    narrated = await narrateClient(ev, p, rmNotesFor(p), grounding);
  } finally {
    inflight.delete(key);
  }

  if (epoch !== narrationEpoch) return; // a snapshot switch invalidated this call while in flight
  const live = S.evaluation?.clients?.[id];
  if (!live || S.narratedHash[id]) return; // scored by someone else while this call was in flight
  S.narratedHash[id] = { hash, ...narrated };
  copyNarratedFields(live, narrated);
  // Every render of the book list / priority rail reads every portfolio's aiState(), so a
  // freshly-scored client shows up there immediately — not just when it happens to be the one
  // open. This is what makes narrateAllPortfolios() actually feel automatic at boot.
  // Coalesced: narrateAllPortfolios resolves 20 clients a few hundred ms apart, and one full
  // renderAll each would repaint the whole cockpit 20 times. Batch them onto the next frame.
  scheduleRender();
}

/* One render per frame, however many callers ask for it in between. */
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderAll(); });
}

/** Fired once at boot: scores every portfolio in the book so an RM opening any client sees an
 * AI reading already in hand rather than waiting on one, capped at a small concurrency so 20+
 * portfolios don't fire 20+ simultaneous LLM calls. Never awaited by boot() itself — the first
 * paint isn't blocked; each portfolio's card/header flips from "loading" to its answer as its
 * own call resolves, via the renderAll() inside maybeNarratePortfolio. */
async function narrateAllPortfolios(concurrency = 4) {
  const queue = [...S.portfolios];
  const worker = async () => {
    let p;
    while ((p = queue.shift())) await maybeNarratePortfolio(p);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}

/** Applies S.tab to the tablist and the panes. This is the only place the panes' `hidden`
 * attribute is written, and renderAll() calls it — so any state change that moves S.tab
 * (the home-logo route reset, popstate, opening a client) actually shows that tab, instead of
 * leaving whatever pane the last tab CLICK happened to unhide. That mismatch was the
 * "globe doesn't appear" bug: going Overview -> Risks & Actions -> home logo set S.tab = "pf"
 * but left #pane-pf hidden, so the globe was mounted, painted, and sized inside a 0×0 box. */
function syncTabs() {
  document.querySelectorAll("[data-tab]").forEach(x =>
    x.setAttribute("aria-selected", String(x.dataset.tab === S.tab)));
  let revealedPf = false;
  ["pf","act","conv","comp","econ"].forEach(k => {
    const pane = document.getElementById("pane-" + k);
    if (!pane) return;
    const next = (k !== S.tab);
    if (k === "pf" && pane.hidden && !next) revealedPf = true;
    pane.hidden = next;
  });
  // A pane that was hidden had no box, so the globe canvas inside it is 0×0 and stale. Re-measure
  // on the frame after it becomes visible again — whatever caused it (tab click, popstate, the
  // home logo), not just the one code path that used to remember to.
  if (revealedPf) requestAnimationFrame(sizeGlobe);
}

function syncRouteClass() {
  const app = document.querySelector(".app");
  app?.classList.toggle("dashboard-view", S.route === "dashboard");
  app?.classList.toggle("client-workbench", S.route === "client");
}

async function runPolicySentinel() {
  S.policyScanState = "running";
  renderAll();
  const btn = document.getElementById("policy-scan-btn");
  if (btn) btn.textContent = "Scanning portfolio...";
  // Scoped to whichever client is actually in view (S.portfolio, same as the priority rail this
  // is triggered from) — a selected globe country narrows the scan to just that one issuer,
  // matching the "resolve issuers from portfolio exposure" design this endpoint documents but,
  // before this fix, never actually received.
  const countries = S.selIso ? [S.selIso] : isoWeightsForPortfolio(S.portfolio).slice(0, 3);
  const exposures = namedExposuresForPolicyScan(S.portfolio);
  S.policyScan = await runPolicyScan(countries, exposures);
  S.policyScanState = "idle";
  since = 0;
  refreshEvaluation();
  renderAll();
  openPolicyTrial();
}

/** The AI Copilot's "ask anything" box, actually routed now instead of showing a static
 * placeholder. One-off per question — not cached/hash-gated like narrateClient, since a
 * question isn't a recurring fact-driven score. Two ways an in-flight answer can stop applying
 * by the time it resolves: the client changed (copilotAnsweredFor lets paintCopilot only ever
 * show an answer that belongs to the portfolio on screen), or a newer question was asked before
 * this one came back — copilotRequestSeq guards that: two questions in flight at once could
 * resolve out of order, and without this check the *older* question's answer could land last and
 * overwrite the newer one's, silently answering the wrong question. */
let copilotRequestSeq = 0;

async function askCopilotQuestion(question) {
  const q = question?.trim();
  const forId = S.portfolio?.id;
  if (!q || !forId) return;
  const seq = ++copilotRequestSeq;
  S.copilotAsking = true;
  renderAll();
  const grounding = buildGrounding(); // S.portfolio is already the client being asked about
  const res = await askCopilot(q, S.portfolio, grounding, rmNotesFor(S.portfolio));
  if (seq !== copilotRequestSeq) return; // a newer question is now in flight (or already answered)
  S.copilotAsking = false;
  if (S.portfolio?.id !== forId) return; // switched clients mid-ask; the answer no longer applies
  S.copilotAnsweredFor = forId;
  S.copilotAnswer = res.ok ? res.answer : "Couldn't find an answer from the current portfolio data — try rephrasing.";
  if (res.ok) S.copilotDraft = ""; // clear the input for the next question; keep a failed
                                    // question in place so the RM can edit and retry it
  renderAll();
}

export function renderAll() {
  syncRouteClass();
  syncTabs();
  paintBook(id => {
    S.portfolio = S.portfolios.find(p => p.id === id);
    S.clientScopeId = null; S.selIso = null; S.goalSel = null; S.household = false; S.clientDrawerOpen = false;
    focusPortfolio(S.portfolio);
    navigateToClient(id);
  });
  paintHead(() => { S.household = !S.household; S.selIso = null; renderAll(); });
  paintGoals(id => {
    S.goalSel = S.goalSel === id ? null : id;
    focusGoal(S.goalSel);
    renderAll();
  });
  paintLegend(); paintGlobe(); paintEvidence();
  paintTicker(feed);
  paintPfRail(railHandlers);
  document.getElementById("close-priority-rail")?.addEventListener("click", () => { S.railDrawerOpen = false; syncDrawers(); });
  syncDrawers();
  paintCopilot({ onToggle: railHandlers.onCopilotToggle });
  paintActions();
  paintConversation();
  paintCompliance();
  paintNews();
  applyLiquidGlass();
}

function isoWeightsForPortfolio(p, goalId = null) {
  const ids = goalId ? new Set((p.goals.find(g => g.id === goalId)?.driverIds) || []) : null;
  const weights = new Map();
  for (const pos of p.positions || []) {
    if (ids && !ids.has(pos.instrumentId)) continue;
    const inst = S.instruments[pos.instrumentId];
    for (const ex of inst?.exposures || []) {
      weights.set(ex.iso3, (weights.get(ex.iso3) || 0) + (pos.weightPct || 0) * (ex.weight || 1));
    }
  }
  return [...weights.entries()].sort((a, b) => b[1] - a[1]).map(([iso]) => iso);
}

/** Named holdings, per country, for Policy Sentinel — [{iso3, name, weightPct}], heaviest first.
 * Sibling to isoWeightsForPortfolio (same source, same weighting) but keeps the instrument name
 * instead of collapsing to a country total: server/policy-sentinel.js names the actual holdings
 * a classified document is relevant to, rather than a fixed demo market. Capped at 20 so the scan
 * request body stays small regardless of how large a household's book gets. */
function namedExposuresForPolicyScan(p) {
  const rows = [];
  for (const pos of p.positions || []) {
    const inst = S.instruments[pos.instrumentId];
    for (const ex of inst?.exposures || []) {
      const weightPct = (pos.weightPct || 0) * (ex.weight || 1);
      if (weightPct <= 0.0001) continue;
      rows.push({ iso3: ex.iso3, name: inst.name || pos.instrumentId, weightPct });
    }
  }
  return rows.sort((a, b) => b.weightPct - a.weightPct).slice(0, 20);
}

function focusPortfolio(p) {
  const isos = isoWeightsForPortfolio(p);
  if (isos.length) focusGlobeOnCountries(isos);
}

function focusGoal(goalId) {
  if (!goalId) { S.selIso = null; resetGlobeView(); return; }
  const isos = isoWeightsForPortfolio(S.portfolio, goalId);
  if (isos.length) focusGlobeOnCountries(isos);
}

function syncDrawers() {
  document.querySelector(".mission-stage")?.classList.toggle("client-open", !!S.clientDrawerOpen);
  document.querySelector(".mission-stage")?.classList.toggle("rail-open", !!S.railDrawerOpen);
}

function currentOperator(data) {
  const name = data.meta?.operatorName || data.meta?.rmName ||
    data.portfolios?.find(p => p.rm)?.rm ||
    "Relationship Manager";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "").join("") || "RM";
  return { name, initials };
}

function feedFromSignals(signals) {
  const seen = new Set();
  const events = [];
  for (const s of Object.values(signals)) {
    for (const e of s.events || []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const sev = e.severity === "Severe" ? "crit" : e.severity === "High" ? "serious" : "warn";
      events.push([(e.at || "").slice(5), e.source || "event_log.csv", e.region || s.name, e.text || e.value || "Signal update", sev, e.endpoint]);
    }
  }
  return events.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
}
