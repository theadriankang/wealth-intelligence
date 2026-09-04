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
import { paintIntel, ensureIntel } from "./ui/intel.js";
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
  narrateAllPortfolios(); // fire-and-forget: scores the whole book once, doesn't block first paint

  // GDELT live-tone lens: BUILT, THEN WITHDRAWN — 4 Sep 2026.
  //
  // The lane works. GDELT does not, for us: it rate-limited this IP to a hard
  // stop and would not release it. Measured, from Singapore:
  //   - a single cold curl -> HTTP 429 after 11.5s
  //   - serial requests spaced 12s apart, browser UA, 2-minute cooldown on 429
  //     -> 429 or connection failure on every one of 8 countries
  // No public tier, no key to buy, nothing left to tune.
  //
  // Shipping a lens that greys itself out in front of a judge is worse than
  // shipping five that work, so the button and the lens are withdrawn. The
  // server lane is left intact (server/providers/gdelt.js, api/gdelt.js,
  // src/signals/gdelt.js) because it is correct and because "we integrated it,
  // they blocked our IP, here is the log" is a better answer than silence.
  // Restore: re-add the gtone lens to palette.js, the button to shell.js, and
  // the fetch/poll pair here.

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
    ["pf","act","conv","intel","comp","econ"].forEach(k =>
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
  return {
    household: S.household,
    positions,
    countrySignals,
    fallbackConcentration: concentration(),
    policyStance: S.policyScan?.signal?.stanceScore ?? null,
    baseCurrency: S.portfolio.currency ?? null,
    taxDomicile: jb?.taxDomicile ?? null,
    lifeStage: jb?.lifeStage ?? null,
    objectives: jb?.objectives ?? null,
    sourceOfWealth: jb?.sourceOfWealth ?? null
  };
}

function copyNarratedFields(target, src) {
  target.explanation = src.explanation;
  target.health = src.health; target.healthBand = src.healthBand;
  target.concentration = src.concentration; target.scoreSource = src.scoreSource;
  target.risks = src.risks; target.opportunities = src.opportunities; target.actions = src.actions;
  target.relationship = src.relationship;
}

/**
 * Narration is the one LLM call per portfolio — every portfolio in the book gets scored once at
 * boot (narrateAllPortfolios), and any portfolio's facts moving afterward (positions, signals,
 * the household toggle on whichever one is open, or the policy scan) re-asks just that one. It
 * carries health, the risk-weighted concentration figure, a bullet-point explanation, risk
 * findings, opportunities, recommended actions, and relationship notes — nothing here ever falls
 * back to showing a deterministic number: aiState() (store.js) reports "loading" until this
 * resolves, then "ai" on success or "unavailable" on failure, and every render site switches on
 * that instead of reading a number that might be a guess. The deterministic engine still runs
 * (it grounds the model's prompt and is what `grounding`/`clientEval` hand to it) — it's just
 * never displayed as if it were a live read. Each evaluation mints fresh client objects with
 * these fields absent, so the answer is cached in `S.narratedHash` (portfolioId → { hash,
 * health, healthBand, concentration, scoreSource, explanation, risks, opportunities, actions,
 * relationship }) and copied back onto the live object; an unchanged hash never reaches the
 * model. `inflight` makes that guarantee hold for calls that overlap in time, not just in
 * sequence. `groundingUsed` is stashed on the live object too — the exact facts behind the
 * current answer, for the traceability panel.
 */
const inflight = new Set(); // `${portfolioId}|${hash}` — one narration per client per hash

async function maybeNarratePortfolio(p) {
  const id = p?.id;
  const ev = S.evaluation?.clients?.[id];
  if (!ev) return;
  const grounding = withPortfolioContext(p, buildGrounding);
  const hash = factsHash(id, grounding);

  const cached = S.narratedHash[id];
  if (cached?.hash === hash) {
    ev.groundingUsed = grounding;
    if (ev.explanation !== cached.explanation) {
      copyNarratedFields(ev, cached);
      // Health/explanation live in the client header (paintHead), concentration in the globe
      // overlay (paintEvidence), risks/opportunities/actions in the Risks & Actions tab, and
      // relationship in the Conversation tab (paintConversation) — renderAll() repaints all of
      // them; it's cheap and this branch is rare (only fires once per resolved narration, on a
      // cache hit for a stale object). Only worth a repaint if this portfolio is the one open.
      if (S.portfolio?.id === id) renderAll();
    }
    return;
  }

  const key = `${id}|${hash}`;
  if (inflight.has(key)) return; // same client, same facts, already asking
  inflight.add(key);
  let narrated;
  try {
    narrated = await narrateClient(ev, p, rmNotesFor(p), grounding);
  } finally {
    inflight.delete(key);
  }

  // A poll (or a household toggle) may have moved the facts mid-await: an answer for
  // superseded facts is discarded — whatever triggered the change makes its own call.
  const live = S.evaluation?.clients?.[id];
  if (!live || factsHash(id, withPortfolioContext(p, buildGrounding)) !== hash) return;
  S.narratedHash[id] = { hash, ...narrated };
  live.groundingUsed = grounding;
  copyNarratedFields(live, narrated);
  if (S.portfolio?.id === id) renderAll();
}

function maybeNarrateOpenClient() {
  if (!S.portfolio) return;
  return maybeNarratePortfolio(S.portfolio);
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
  paintActions();
  paintConversation();
  paintCompliance();
  paintEconomics();
  // Fetches this client's bundle on first view, then paints from memory. The
  // walk itself is synchronous and re-derived on every paint, so an approval
  // shows up without a round trip.
  ensureIntel(paintIntel);
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
