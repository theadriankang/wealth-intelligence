import { CONFIG } from "./config.js";
import { loadData } from "./adapters/index.js";
import { S, rows, concentration } from "./store.js";
import { fetchSignals, pollSignals } from "./signals/worldmonitor.js";
import { FEED, LATE_FEED } from "./signals/fixtures/signals.js";
import { initPalette } from "./ui/palette.js";
import { shellHtml } from "./ui/shell.js";
import { mountGlobe, paintGlobe, sizeGlobe } from "./ui/globe.js";
import { paintBook, paintHead, paintEvidence, paintLegend, paintTicker,
  paintSituation } from "./ui/panels.js";
import { paintExplanation, paintAnalysis, paintActions } from "./ui/segments.js";
import { paintUrgent } from "./ui/urgent.js";
import { openEvidence, closeEvidence } from "./ui/evidence.js";
import { initDrawers, openBrief, openPolicyTrial } from "./ui/drawers.js";
import { renderClientView } from "./ui/clientview.js";
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
    refreshEvaluation();
    renderAll();
    maybeNarrateOpenClient();
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
    S.signals = signals; S.prevSignals = prevSignals;
    refreshEvaluation();
    renderAll();
    maybeNarrateOpenClient();
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
    const evAgo = S.evaluation ? Math.round((Date.now() - S.evaluation.at) / 1000) : null;
    document.getElementById("live-t").textContent =
      "live · updated " + (since < 60 ? since + "s" : Math.floor(since / 60) + "m") + " ago"
      + (evAgo != null ? ` · evaluated ${evAgo < 60 ? evAgo + "s" : Math.floor(evAgo / 60) + "m"} ago` : "");
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
    paintGlobe(); paintSituation(); paintEvidence(); return;
  }
  renderAll();
}

/** The whole evaluation, recomputed from current signals. Pure — no I/O, no LLM. */
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
      paintExplanation(); paintEvidence();
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
  if (S.portfolio?.id === id) { paintExplanation(); paintEvidence(); }
}

function onUrgentPick({ portfolioId, actionId }) {
  if (S.portfolio.id !== portfolioId) {
    S.portfolio = S.portfolios.find(p => p.id === portfolioId);
    S.selIso = null; S.goalSel = null; S.household = false;
    renderAll(); maybeNarrateOpenClient();
  }
  requestAnimationFrame(() => {
    document.getElementById("seg-actions")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
    const card = document.querySelector(`[data-action="${actionId}"]`);
    if (card) { card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1400); }
  });
}

async function runPolicySentinel() {
  S.policyScanState = "running";
  renderAll();
  const btn = document.getElementById("policy-scan-btn");
  if (btn) btn.textContent = "Scanning policy...";
  S.policyScan = await runPolicyScan();
  S.policyScanState = "idle";
  since = 0;
  refreshEvaluation();
  renderAll();
  maybeNarrateOpenClient();
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
    maybeNarrateOpenClient();
  });
  paintHead(() => { S.household = !S.household; S.selIso = null; renderAll(); maybeNarrateOpenClient(); });
  paintLegend(); paintGlobe(); paintEvidence();
  paintTicker(feed);
  paintUrgent(onUrgentPick);
  paintExplanation();
  paintSituation();
  paintAnalysis();
  paintActions();
}
