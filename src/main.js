import { CONFIG } from "./config.js";
import { loadData } from "./adapters/index.js";
import { S } from "./store.js";
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
import { paintActions, paintConversation, paintCompliance, paintEconomics } from "./ui/tabs.js";
import { initDrawers, openPosition, openPolicyTrial } from "./ui/drawers.js";
import * as M from "./ui/motion.js";
import { FALLBACK_SCAN, runPolicyScan } from "./policy/sentinel.js";

const root = document.getElementById("root");
let feed = FEED.slice(), lateIdx = 0, since = 0;

boot();

async function boot() {
  initPalette();
  const data = await loadData(CONFIG.ADAPTER);
  Object.assign(S, data);
  S.portfolio = S.portfolios[0];
  S.operator = currentOperator(data);
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
      mountGlobe(globeEl, { onSelect: iso => { S.selIso = iso; refresh("globe"); } });
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
  renderAll();
  M.boot();

  if (!usesDatasetSignals) {
    pollSignals([...isos], ({ signals, prevSignals }) => {
      S.signals = signals; S.prevSignals = prevSignals; renderAll();
    }, CONFIG.POLL_MS, { offline: CONFIG.OFFLINE });
  }
}

function wire() {
  document.addEventListener("pointerdown", e => {
    if (!S.copilotOpen) return;
    if (e.target.closest("#copilot")) return;
    S.copilotOpen = false;
    paintCopilot({ onToggle: railHandlers.onCopilotToggle });
  });

  document.getElementById("open-client-rail")?.addEventListener("click", () => { S.clientDrawerOpen = true; S.railDrawerOpen = false; syncDrawers(); });
  document.getElementById("open-priority-rail")?.addEventListener("click", () => { S.railDrawerOpen = true; S.clientDrawerOpen = false; syncDrawers(); });
  document.getElementById("close-client-rail")?.addEventListener("click", () => { S.clientDrawerOpen = false; syncDrawers(); });

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
  });

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
  renderAll();
  openPolicyTrial();
}

export function renderAll() {
  syncRouteClass();
  paintBook(id => {
    S.portfolio = S.portfolios.find(p => p.id === id);
    S.clientScopeId = id; S.goalSel = null; S.household = false; S.clientDrawerOpen = false;
    focusPortfolio(S.portfolio);
    renderAll();
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
  paintActions(renderAll);
  paintConversation();
  paintCompliance();
  paintEconomics();
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
