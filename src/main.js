import { CONFIG } from "./config.js";
import { loadData } from "./adapters/index.js";
import { S, rows, concentration } from "./store.js";
import { fetchSignals, pollSignals } from "./signals/worldmonitor.js";
import { FEED, LATE_FEED } from "./signals/fixtures/signals.js";
import { initPalette } from "./ui/palette.js";
import { shellHtml } from "./ui/shell.js";
import { installLiquidGlass, applyLiquidGlass } from "./ui/glass.js";
import { mountSilk } from "./ui/silk.js";
import { mountGlobe, paintGlobe, sizeGlobe } from "./ui/globe.js";
import { mountGoogleGlobe } from "./ui/googleGlobe.js";
import { paintBook, paintHead, paintGoals, paintEvidence, paintLegend, paintTicker, paintPfRail, paintCopilot }
  from "./ui/panels.js";
import { paintActions, paintConversation, paintCompliance, paintEconomics } from "./ui/tabs.js";
import { initDrawers, openPosition, openPolicyTrial } from "./ui/drawers.js";
import * as M from "./ui/motion.js";
import { FALLBACK_SCAN, runPolicyScan } from "./policy/sentinel.js";
import { runEvaluation } from "./eval/evaluate.js";
import { narrateClient, factsHash } from "./eval/narrate.js";
import * as marketData from "./market/index.js";

const root = document.getElementById("root");
let feed = FEED.slice(), lateIdx = 0, since = 0;

boot();

async function boot() {
  initPalette();
  const data = await loadData(CONFIG.ADAPTER);
  Object.assign(S, data);
  S.portfolio = S.portfolios[0];
  S.policyScan = FALLBACK_SCAN;
  const usesDatasetSignals = data.meta?.source === "julius-baer";

  // Live signals where possible; fixtures otherwise. Never blocks the first paint.
  const isos = new Set();
  for (const p of S.portfolios) for (const pos of p.positions) {
    for (const e of S.instruments[pos.instrumentId]?.exposures || []) isos.add(e.iso3);
  }
  if (usesDatasetSignals) {
    S.signals = data.signals;
    S.prevSignals = data.prevSignals;
    S.live = false;
    feed = feedFromSignals(data.signals);
  } else {
    const sig = await fetchSignals([...isos], { offline: CONFIG.OFFLINE });
    S.signals = sig.signals; S.prevSignals = sig.prevSignals; S.live = sig.live;
  }
  readRouteFromLocation();

  root.innerHTML = shellHtml();
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
      mountGlobe(globeEl, { onSelect: iso => { S.selIso = iso; refresh("globe"); } });
    }
  } catch (err) {
    console.warn("[globe] WebGL unavailable, rendering dashboard without globe canvas:", err);
    document.getElementById("globe").innerHTML = `<div class="globe-fallback">
      <div class="fallback-orbit"></div>
      <div class="fallback-core">Global exposure map unavailable</div>
    </div>`;
  }
  wire();
  refreshEvaluation();
  renderAll();
  M.boot();

  if (!usesDatasetSignals) {
    pollSignals([...isos], ({ signals, prevSignals }) => {
      S.signals = signals; S.prevSignals = prevSignals;
      refreshEvaluation();
      renderAll();
    }, CONFIG.POLL_MS, { offline: CONFIG.OFFLINE });
  }
}

function wire() {
  document.getElementById("open-client-rail")?.addEventListener("click", () => { S.clientDrawerOpen = true; S.railDrawerOpen = false; syncDrawers(); });
  document.getElementById("open-priority-rail")?.addEventListener("click", () => { S.railDrawerOpen = true; S.clientDrawerOpen = false; syncDrawers(); });
  document.getElementById("close-client-rail")?.addEventListener("click", () => { S.clientDrawerOpen = false; syncDrawers(); });

  document.querySelectorAll("[data-lens]").forEach(b => b.addEventListener("click", () => {
    S.lens = b.dataset.lens;
    document.querySelectorAll("[data-lens]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.lens === S.lens)));
    paintLegend(); paintGlobe();
  }));

  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    S.tab = b.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach(x =>
      x.setAttribute("aria-selected", String(x.dataset.tab === S.tab)));
    ["pf","act","conv","comp","econ"].forEach(k =>
      document.getElementById("pane-" + k).hidden = (k !== S.tab));
    if (S.tab === "pf") requestAnimationFrame(sizeGlobe);
    M.pane(S.tab);
  }));

  setInterval(() => {
    since++;
    document.getElementById("live-t").textContent =
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
}

function refresh(what) {
  if (what === "globe") { paintGlobe(); paintPfRail(railHandlers); paintEvidence(); return; }
  renderAll();
}

const railHandlers = {
  onClearGoal: () => { S.goalSel = null; renderAll(); },
  onClearSel: () => { S.selIso = null; S.clientScopeId = null; refresh("globe"); },
  onSelectIso: iso => { S.selIso = iso; S.railDrawerOpen = false; refresh("globe"); },
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

/** The whole deterministic evaluation, recomputed from current signals/policy scan. Pure — no I/O, no LLM. */
function refreshEvaluation() {
  S.evaluation = runEvaluation({
    portfolios: S.portfolios, instruments: S.instruments,
    signals: S.signals, prevSignals: S.prevSignals,
    market: marketData, policyScan: S.policyScan
  });
}

function rmNotesFor(p) { return (p.relationship?.concerns || []); }

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
const inflight = new Set(); // `${portfolioId}|${hash}` — one narration per client per hash

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
      // Health/thesis/summary live in the client header (paintHead), concentration in the
      // globe overlay (paintEvidence) — renderAll() repaints both; it's cheap and this branch
      // is rare (only fires once per resolved narration, on a cache hit for a stale object).
      renderAll();
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
  if (S.portfolio?.id === id) renderAll();
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
  S.policyScan = await runPolicyScan();
  S.policyScanState = "idle";
  since = 0;
  refreshEvaluation();
  renderAll();
  openPolicyTrial();
}

export function renderAll() {
  syncRouteClass();
  paintBook(id => {
    S.portfolio = S.portfolios.find(p => p.id === id);
    S.clientScopeId = id; S.goalSel = null; S.household = false; S.clientDrawerOpen = false;
    renderAll();
  });
  paintHead(() => { S.household = !S.household; S.selIso = null; renderAll(); });
  paintGoals(id => {
    S.goalSel = S.goalSel === id ? null : id;
    S.selIso = null;
    renderAll();
  });
  paintLegend(); paintGlobe(); paintEvidence();
  paintTicker(feed);
  paintPfRail(railHandlers);
  document.getElementById("close-priority-rail")?.addEventListener("click", () => { S.railDrawerOpen = false; syncDrawers(); });
  syncDrawers();
  paintCopilot({ onToggle: railHandlers.onCopilotToggle });
  paintActions(renderAll);
  paintConversation();
  paintCompliance();
  paintEconomics();
  applyLiquidGlass();
  maybeNarrateOpenClient(); // hash-gated: only asks the model again if the open client's facts moved
}

function syncDrawers() {
  document.querySelector(".mission-stage")?.classList.toggle("client-open", !!S.clientDrawerOpen);
  document.querySelector(".mission-stage")?.classList.toggle("rail-open", !!S.railDrawerOpen);
}

function feedFromSignals(signals) {
  const seen = new Set();
  const events = [];
  for (const s of Object.values(signals)) {
    for (const e of s.events || []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const sev = e.severity === "Severe" ? "crit" : e.severity === "High" ? "serious" : "warn";
      events.push([(e.at || "").slice(5), e.source || "event_log.csv", e.region || s.name, e.text || e.value || "Signal update", sev]);
    }
  }
  return events.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
}
