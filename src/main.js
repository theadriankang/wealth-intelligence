import { CONFIG } from "./config.js";
import { loadData } from "./adapters/index.js";
import { S } from "./store.js";
import { fetchSignals, pollSignals } from "./signals/worldmonitor.js";
import { FEED, LATE_FEED } from "./signals/fixtures/signals.js";
import { initPalette } from "./ui/palette.js";
import { shellHtml } from "./ui/shell.js";
import { mountGlobe, paintGlobe, sizeGlobe } from "./ui/globe.js";
import { paintBook, paintHead, paintGoals, paintEvidence, paintLegend, paintTicker,
  paintSituation, paintPositions } from "./ui/panels.js";
import { paintActions, paintConversation } from "./ui/spine.js";
import { openEvidence, closeEvidence } from "./ui/evidence.js";
import { initDrawers, openPosition, openBrief, openPolicyTrial } from "./ui/drawers.js";
import { renderClientView } from "./ui/clientview.js";
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
  S.policyScan = FALLBACK_SCAN;

  // Live signals where possible; fixtures otherwise. Never blocks the first paint.
  const isos = new Set();
  for (const p of S.portfolios) for (const pos of p.positions) {
    for (const e of S.instruments[pos.instrumentId]?.exposures || []) isos.add(e.iso3);
  }
  const sig = await fetchSignals([...isos], { offline: CONFIG.OFFLINE });
  S.signals = sig.signals; S.prevSignals = sig.prevSignals; S.live = sig.live;

  if (new URLSearchParams(location.search).get("view") === "client") {
    renderClientView(root);
    return;
  }

  const buildCockpit = () => {
    root.innerHTML = shellHtml();
    initDrawers();
    mountGlobe(document.getElementById("globe"), { onSelect: iso => { S.selIso = iso; refresh("globe"); } });
    wire();
    renderAll();
    M.boot();
    requestAnimationFrame(() => sizeGlobe());
  };

  if (CONFIG.TITLE_SCREEN && new URLSearchParams(location.search).get("view") !== "client") {
    const { renderTitle } = await import("./ui/title.js");
    renderTitle(root, buildCockpit);
  } else {
    buildCockpit();
  }

  pollSignals([...isos], ({ signals, prevSignals }) => {
    S.signals = signals; S.prevSignals = prevSignals; renderAll();
  }, CONFIG.POLL_MS, { offline: CONFIG.OFFLINE });
}

function wire() {
  document.getElementById("brief-btn").addEventListener("click", openBrief);
  document.getElementById("policy-scan-btn").addEventListener("click", runPolicySentinel);

  document.querySelectorAll("[data-lens]").forEach(b => b.addEventListener("click", () => {
    S.lens = b.dataset.lens;
    document.querySelectorAll("[data-lens]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.lens === S.lens)));
    paintLegend(); paintGlobe();
  }));

  document.getElementById("ev-open-comp").addEventListener("click", openEvidence);
  document.getElementById("ev-open-econ").addEventListener("click", openEvidence);
  document.getElementById("slideover-x").addEventListener("click", closeEvidence);
  document.getElementById("scrim").addEventListener("click", closeEvidence);
  addEventListener("keydown", e => { if (e.key === "Escape") closeEvidence(); });

  setInterval(() => {
    since++;
    document.getElementById("live-t").textContent =
      "live · updated " + (since < 60 ? since + "s" : Math.floor(since / 60) + "m") + " ago";
  }, 1000);

  // Simulated arrivals so the demo shows liveness even on fixtures.
  if (!matchMedia("(prefers-reduced-motion:reduce)").matches) {
    setInterval(() => {
      if (lateIdx >= LATE_FEED.length) return;
      feed.unshift(LATE_FEED[lateIdx++].concat([true]));
      since = 0; paintTicker(feed);
    }, 21000);
  }
}

function refresh(what) {
  if (what === "globe") {
    paintGlobe(); paintSituation(); paintPositions(railHandlers); paintEvidence(); return;
  }
  renderAll();
}

const railHandlers = {
  onClearGoal: () => { S.goalSel = null; renderAll(); },
  onClearSel: () => { S.selIso = null; refresh("globe"); },
  onOpenPosition: openPosition,
  onRunPolicyScan: runPolicySentinel,
  onOpenPolicyTrial: openPolicyTrial
};

async function runPolicySentinel() {
  S.policyScanState = "running";
  renderAll();
  const btn = document.getElementById("policy-scan-btn");
  if (btn) btn.textContent = "Scanning policy...";
  S.policyScan = await runPolicyScan();
  S.policyScanState = "idle";
  since = 0;
  renderAll();
  openPolicyTrial();
}

export function renderAll() {
  const policyBtn = document.getElementById("policy-scan-btn");
  if (policyBtn) {
    policyBtn.textContent = S.policyScanState === "running" ? "Scanning policy..." : "Run live policy scan";
    policyBtn.disabled = S.policyScanState === "running";
  }
  paintBook(id => {
    S.portfolio = S.portfolios.find(p => p.id === id);
    S.selIso = null; S.goalSel = null; S.household = false;
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
  paintSituation();
  paintPositions(railHandlers);
  paintActions(renderAll);
  paintConversation();
}
