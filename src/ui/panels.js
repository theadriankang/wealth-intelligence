import { S, rows, visibleRows, goals, goal, flagCountFor, positions, flagged, aiState } from "../store.js";
import { P, LENSES, fmtD, css, BUCKETS, FUNDING_METHOD } from "./palette.js";
import { POLICY, FEED } from "../signals/fixtures/signals.js";
import { getMode } from "../signals/worldmonitor.js";
import { reconcile, HOUSE_VIEW } from "../model/houseview.js";
import * as M from "./motion.js";

export const RISK_THRESHOLDS = { critical:80, high:60, medium:35 };

/**
 * Most paint* functions replace an element's innerHTML wholesale, so a plain addEventListener
 * on anything inside it is safe — the old node (and its listener) is thrown away with the old
 * markup. But a handful of controls (the book's filter row, sort/search inputs, the priority
 * rail's own container) live in the *static* shell markup (shell.js) — paint only ever mutates
 * their attributes/value, never their identity. Wiring those with a bare addEventListener inside
 * a function that repaints on every render (paintBook/paintPfRail run on nearly every click)
 * stacks up one more listener per repaint, forever: the element fires N handlers on the Nth
 * repaint, each of which triggers another repaint that adds a (N+1)th — visibly, progressively
 * slower with every click. rewire() replaces whatever handler it last attached instead of
 * stacking a new one alongside it. */
function rewire(el, type, handler) {
  if (!el) return;
  const key = `_rewired_${type}`;
  if (el[key]) el.removeEventListener(type, el[key]);
  el[key] = handler;
  el.addEventListener(type, handler);
}

/**
 * score/band here are NOT recomputed — they defer entirely to clientMeta()'s aiState()-derived
 * meta.urgency/meta.band. An earlier version of this file computed its own weighted score
 * (referencing meta.breakdown, a field clientMeta() no longer produces — it silently degraded
 * to a fallback formula instead of throwing) and displayed it regardless of whether the AI had
 * actually scored the client yet. That's the exact "never show a number that might be a guess"
 * regression the loading/unavailable states exist to prevent, so score is null — and rendered
 * as a state, not a number — until aiState() reports "ai". See clientMeta() in this file and
 * aiState() in store.js.
 */
function riskLevelFor(meta) { return meta.band; } // "critical"|"high"|"medium"|"low"|"loading"|"unavailable"

function sidebarScore(meta) { return meta.urgency; } // number 0-100, or null while loading/unavailable

function scoreLabel(meta) {
  if (meta.band === "loading") return "…";
  if (meta.band === "unavailable") return "n/a";
  return String(sidebarScore(meta));
}

/** Feeds .client-insight — already the labelled "insight" slot on the card, so the text itself
 * doesn't need to re-announce "AI" on every line too. */
function aiInsight(meta) {
  if (meta.band === "loading") return "Scoring…";
  if (meta.band === "unavailable") return "Unavailable";
  if (meta.band === "critical") return meta.ltv ? "ALERT: Margin Call Risk" : "ALERT: Urgent Rebalance";
  if (meta.band === "high") return meta.driver === "Collateral/Leverage" ? "INSIGHT: Risk Limit Warning" : `INSIGHT: ${meta.driver} Pressure`;
  if (meta.band === "medium") return meta.dueSoon ? "NOTICE: Annual Review Due" : `NOTICE: ${meta.driver} Watch`;
  if (/No urgent/i.test(meta.reason)) return "Healthy Portfolio";
  return "Stable Portfolio";
}

function aumNumber(p) {
  if (Number.isFinite(p.jb?.totalUsd)) return p.jb.totalUsd;
  const m = String(p.aum || "").match(/([\d.]+)\s*m/i);
  return m ? Number(m[1]) * 1e6 : 0;
}

function sortClients(list, metas) {
  const riskRank = { critical:4, high:3, medium:2, low:1 };
  return list.sort((a, b) => {
    const am = metas.get(a.id), bm = metas.get(b.id);
    const as = sidebarScore(am), bs = sidebarScore(bm);
    switch (S.clientSort || "urgency-desc") {
      case "aum-desc": return aumNumber(b) - aumNumber(a);
      case "name-asc": return a.name.localeCompare(b.name);
      case "review-asc": return String(a.reviewDate || "").localeCompare(String(b.reviewDate || ""));
      case "risk-desc": return (riskRank[bm.band] ?? 0) - (riskRank[am.band] ?? 0) || (bs ?? -1) - (as ?? -1);
      default: return (bs ?? -1) - (as ?? -1) || String(a.reviewDate || "").localeCompare(String(b.reviewDate || ""));
    }
  });
}

function clientCard(p, m) {
  return `<button class="cl rm-client ${m.band}" data-cl="${p.id}" aria-current="${p.id === S.portfolio.id}">
    <span class="client-accent" aria-hidden="true"></span>
    <span class="client-top"><span class="nm">${p.name}</span><span class="client-aum">${p.currency ? p.currency + " " : ""}${p.aum}</span></span>
    <span class="client-insight"><span class="score-pill">${scoreLabel(m)}</span><span>${aiInsight(m)}</span><span class="chev">›</span></span>
  </button>`;
}

export function lookThroughBar(inst, signals) {
  if (!inst?.exposures?.length || inst.exposures.length === 1) return "";
  const L = LENSES().d;
  const top = [...inst.exposures].sort((a, b) => b.weight - a.weight).slice(0, 6);
  return `<div class="lt"><div class="lt-bar">${top.map(e => {
    const s = signals[e.iso3];
    return `<i style="width:${e.weight * 100}%; background:${s ? L.col(s.riskDelta) : P.DIM}"></i>`;
  }).join("")}</div><div class="lt-leg">${top.map(e => {
    const s = signals[e.iso3];
    return `<span><em style="background:${s ? L.col(s.riskDelta) : P.DIM}"></em>${e.iso3} ${(e.weight * 100).toFixed(0)}%</span>`;
  }).join("")}</div></div>`;
}

function withPortfolio(p, fn) {
  const old = S.portfolio;
  const oldScope = S.clientScopeId;
  S.portfolio = p;
  S.clientScopeId = p.id;
  try { return fn(); } finally { S.portfolio = old; S.clientScopeId = oldScope; }
}

function clientHasIso(p, iso) {
  if (!iso) return true;
  return (p.positions || []).some(pos =>
    S.instruments[pos.instrumentId]?.exposures?.some(e => e.iso3 === iso));
}

/**
 * Structural client facts (flagged positions, goals, review timing, lombard headroom, affected
 * countries) plus the client's attention state. There is no deterministic risk-score formula
 * here any more — urgency/band come from the AI alone via aiState()/S.narratedHash. Until a
 * portfolio has been scored, band is "loading"; if scoring fails or the response doesn't
 * validate, band is "unavailable". Neither state has a numeric urgency — the UI shows a state,
 * not a guessed number.
 */
function clientMeta(p) {
  return withPortfolio(p, () => {
    const fl = flagged();
    const gs = goals();
    const dueSoon = /09 Sep|18 Sep/i.test(p.reviewDate);
    const ltv = p.lombard?.headroomPct && p.lombard.headroomPct < 30;
    const affected = [...new Set((p.positions || []).flatMap(pos =>
      S.instruments[pos.instrumentId]?.exposures?.map(e => e.iso3) || []))]
      .filter(iso => (S.signals[iso]?.riskDelta || 0) >= 6).slice(0, 3);
    const worst = fl[0];
    const scoreState = aiState(p.id); // "loading" | "ai" | "unavailable" — AI freshness, for the scoreSource tag below
    const cachedAi = S.narratedHash[p.id];
    // cachedAi.health is populated by EITHER narrateClient()'s AI-success branch or its
    // templateNarration() fallback (see eval/narrate.js) — the deterministic engine always
    // computes a real, trustworthy health number even when the AI's own independent read gets
    // rejected (routinely — see AI_SCORE_BAND — not a failure). Gating this on
    // scoreState === "ai" meant every client whose AI read didn't validate showed as
    // permanently "unavailable" here, with no health/urgency/band at all, even though a good
    // deterministic score existed the whole time. That was the health metric "not computing".
    const health = cachedAi?.health;
    const urgency = Number.isFinite(health) ? Math.round(100 - health) : null;
    const band = urgency !== null
      ? (urgency >= 80 ? "critical" : urgency >= 60 ? "high" : urgency >= 35 ? "medium" : "low")
      : scoreState; // "loading" — narration hasn't resolved for this portfolio at all yet
    const reason = ltv && p.lombard.currentLtv ? `LTV ${p.lombard.currentLtv.toFixed(2)}% vs ${p.lombard.marginCallLtv.toFixed(0)}% trigger`
      : ltv ? `Collateral headroom at ${p.lombard.headroomPct}%`
      : worst ? `${worst.instrumentId} pressure +${worst.riskDelta.toFixed(0)}`
      : dueSoon ? `Review due ${p.reviewDate}` : "No urgent client action";
    const driver = ltv ? "Collateral/Leverage"
      : worst ? "Concentration"
      : dueSoon ? "Compliance/KYC"
      : affected.length ? "Event Exposure" : "Concentration";
    const next = band === "critical" ? "Open review" : dueSoon ? "Prepare brief" : ltv ? "Check collateral" : "Monitor";
    const source = p.sourceOfWealth ? p.sourceOfWealth.split(" - ")[0] : "Private client";
    return { fl, gs, dueSoon, ltv, affected, urgency, band, category: band, reason, driver, next, source, scoreSource: scoreState };
  });
}

function clientMatches(p, meta) {
  const filter = S.clientFilter || "all";
  const q = (S.clientSearch || "").trim().toLowerCase();
  const hay = [p.name, p.ref, meta.source, p.countryOfResidence, p.bookingCentre, p.currency].join(" ").toLowerCase();
  if (q && !hay.includes(q)) return false;
  if (filter !== "all" && riskLevelFor(meta) !== filter) return false;
  if (S.driverFilter !== "all" && meta.driver !== S.driverFilter) return false;
  if (S.profileFilter !== "all" && p.riskProfile !== S.profileFilter) return false;
  if (S.bookingFilter !== "all" && p.bookingCentre !== S.bookingFilter) return false;
  if (S.aumFilter === "hnw" && p.wealthBand !== "HNW") return false;
  if (S.aumFilter === "uhnw" && p.wealthBand !== "UHNW") return false;
  if (S.selIso && !clientHasIso(p, S.selIso)) return false;
  return true;
}


/**
 * Rewrites #book in place instead of through innerHTML.
 *
 * The book repaints on nearly every render, and the AI scores land one client at a time
 * during boot — twenty separate renders. Replacing the container's innerHTML each time
 * destroys and recreates every card, so untouched clients visibly blink and the whole list
 * re-runs its entrance animation. Here a card is only rewritten when its own markup actually
 * changed, and reordering moves the existing node rather than rebuilding it.
 *
 * `rows` is [id, html] in the order the list should end up in.
 *
 * `wasCursor` is captured before a changed node is replaced, not compared after: `node` gets
 * reassigned to the fresh replacement, so comparing the reassigned `node` against `cursor` would
 * compare the new element to a reference that `replaceWith` has already detached from the DOM —
 * `host.insertBefore(fresh, cursor)` then throws NotFoundError the moment the card that changed
 * happens to be sitting at the current cursor position (the ordinary case: a card's own content
 * updates in place, nothing reordered around it).
 */
function reconcileBook(host, rows, emptyHtml) {
  if (!host) return;
  if (!rows.length) {
    if (host.dataset.state !== "empty" || host.innerHTML !== emptyHtml) {
      host.innerHTML = emptyHtml;
      host.dataset.state = "empty";
    }
    return;
  }
  if (host.dataset.state === "empty") { host.innerHTML = ""; delete host.dataset.state; }

  const existing = new Map();
  for (const node of [...host.children]) {
    const id = node.dataset?.cl;
    if (id && !existing.has(id)) existing.set(id, node);
    else node.remove(); // stale or duplicate
  }

  const scratch = document.createElement("div");
  let cursor = host.firstElementChild;

  for (const [id, html] of rows) {
    let node = existing.get(id);
    const wasCursor = node === cursor;
    if (node && node.outerHTML !== html) {
      scratch.innerHTML = html;
      const fresh = scratch.firstElementChild;
      node.replaceWith(fresh);
      node = fresh;
      existing.set(id, node);
    } else if (!node) {
      scratch.innerHTML = html;
      node = scratch.firstElementChild;
      existing.set(id, node);
    }
    if (wasCursor) cursor = node.nextElementSibling;
    else if (node !== cursor) host.insertBefore(node, cursor);
  }

  for (const [id, node] of existing) {
    if (!rows.some(r => r[0] === id)) node.remove();
  }
}

/** Book-wide AI-scoring status — how many of the whole book's clients narrateAllPortfolios()
 * (main.js, fired once at boot) has actually finished with, not just the currently filtered/
 * visible list. `metas` is already computed once per paintBook() call (one clientMeta() per
 * portfolio), so this reuses it rather than walking S.portfolios/S.narratedHash a second time.
 * "Finished" means aiState() moved past "loading" — scoreSource is "ai" (validated) or
 * "unavailable" (attempted and rejected/failed); either way the attempt resolved, which is what
 * "done generating" means here, not "succeeded". Reruns on every paintBook() call, which already
 * happens on every narration resolution (via renderAll() in main.js), so this updates live as
 * clients finish scoring rather than needing its own polling. */
function paintBookAiStatus(metas) {
  const el = document.getElementById("book-ai-status");
  if (!el) return;
  const total = metas.size;
  const done = [...metas.values()].filter(m => m.scoreSource !== "loading").length;
  const allDone = done >= total;
  // .pulse is the same small live-indicator dot the ticker's "Breaking News" label already uses
  // — reused as-is for "still scoring"; .book-ai-dot.done is the one new rule, a static version
  // of the same dot for once every attempt has resolved.
  el.innerHTML = `<span class="${allDone ? "book-ai-dot done" : "pulse"}"></span>` +
    `<span>${done} of ${total} clients AI-scored</span>`;
}

export function paintBook(onPick) {
  const metas = new Map(S.portfolios.map(p => [p.id, clientMeta(p)]));
  const filtered = S.portfolios.filter(p => clientMatches(p, metas.get(p.id)))
    .sort((a, b) => (metas.get(b.id).urgency ?? -1) - (metas.get(a.id).urgency ?? -1));
  paintBookAiStatus(metas);
  const input = document.getElementById("client-search");
  if (input && input.value !== S.clientSearch) input.value = S.clientSearch;
  document.querySelectorAll("#client-filters [data-filter]").forEach(b =>
    b.setAttribute("aria-pressed", String((S.clientFilter || "all") === b.dataset.filter)));
  const sort = document.getElementById("client-sort");
  if (sort) sort.value = S.clientSort || "urgency-desc";
  const fp = document.getElementById("filter-panel");
  if (fp) fp.hidden = !S.filtersOpen;
  const ft = document.getElementById("filter-toggle");
  if (ft) ft.setAttribute("aria-expanded", String(!!S.filtersOpen));
  for (const [id, value] of [["risk-popover-filter", S.clientFilter], ["driver-filter", S.driverFilter], ["profile-filter", S.profileFilter], ["booking-filter", S.bookingFilter], ["aum-filter", S.aumFilter]]) {
    const el = document.getElementById(id);
    if (el) el.value = value || "all";
  }
  const active = activeClientFilters();
  reconcileBook(
    document.getElementById("book"),
    filtered.map(p => [p.id, clientCard(p, metas.get(p.id))]),
    `<div class="empty-state">No clients match ${active.length ? active.join(" · ") : "the current search"}.</div>`
  );
  // [data-cl] cards are recreated fresh with #book's innerHTML above, so a plain addEventListener
  // is fine there. Everything below targets controls from the *static* shell markup (shell.js) —
  // paintBook only ever updates their value/attributes, never recreates them — and paintBook runs
  // on nearly every render, so those must use rewire() or they'd stack one more listener per
  // repaint forever (see the comment on rewire() above, and paintPfRail's #pfrail fix).
  document.querySelectorAll("[data-cl]").forEach(b => b.addEventListener("click", () => onPick(b.dataset.cl)));
  document.querySelectorAll("#client-filters [data-filter]").forEach(b => rewire(b, "click", () => { S.clientFilter = b.dataset.filter; paintBook(onPick); }));
  rewire(document.getElementById("filter-toggle"), "click", () => { S.filtersOpen = !S.filtersOpen; paintBook(onPick); });
  rewire(document.getElementById("client-sort"), "change", e => { S.clientSort = e.target.value; paintBook(onPick); });
  rewire(document.getElementById("risk-popover-filter"), "change", e => { S.clientFilter = e.target.value; paintBook(onPick); });
  rewire(document.getElementById("clear-client-filters"), "click", () => {
    S.clientFilter = "all"; S.clientSearch = ""; S.driverFilter = "all"; S.profileFilter = "all"; S.bookingFilter = "all"; S.aumFilter = "all"; paintBook(onPick);
  });
  for (const [id, key] of [["driver-filter", "driverFilter"], ["profile-filter", "profileFilter"], ["booking-filter", "bookingFilter"], ["aum-filter", "aumFilter"]]) {
    rewire(document.getElementById(id), "change", e => { S[key] = e.target.value; paintBook(onPick); });
  }
  rewire(document.getElementById("client-search"), "input", e => { S.clientSearch = e.target.value; paintBook(onPick); });
  // Keyed on *which* clients are listed, not the order they are in. Urgency only exists once the
  // AI has scored a client, so the order churns all through boot; replaying the entrance
  // animation on every reshuffle is the flicker this reconcile was meant to remove.
  M.once("book", [...filtered.map(p => p.id)].sort().join("|") + S.clientFilter, () =>
    M.enter("#book .cl", { y: 6, delay: 22, duration: 340 }));
}

function activeClientFilters() {
  return [
    (S.clientFilter || "all") !== "all" && `Band: ${S.clientFilter}`,
    S.driverFilter !== "all" && `Driver: ${S.driverFilter}`,
    S.profileFilter !== "all" && `Profile: ${S.profileFilter}`,
    S.bookingFilter !== "all" && `Booking: ${S.bookingFilter}`,
    S.aumFilter !== "all" && `AUM: ${S.aumFilter.toUpperCase()}`,
    S.clientSearch?.trim() && `Search: ${S.clientSearch.trim()}`
  ].filter(Boolean);
}

const shimmer = `<span class="prose-shimmer">…</span>`;

export function paintHead(onHousehold) {
  const p = S.portfolio, L = p.lombard;
  const meta = clientMeta(p);
  const ev = S.evaluation?.clients?.[p.id];
  const state = aiState(p.id);
  // evaluateClient() (clientEval.js) always computes a real, deterministic health/healthBand as
  // part of the base evaluation — before narration ever touches it, and still there untouched
  // as the fallback whenever the AI's own independent read doesn't validate (routinely — see
  // AI_SCORE_BAND — not a failure). Gating this on state === "ai" meant "Health" showed
  // "Unavailable" any time that happened, even though ev.health was sitting right there valid
  // the whole time — that was the health metric "not computing". The prose overview has the same
  // shape once narration resolves: narrateClient() (eval/narrate.js) always returns a populated
  // `overview` string, whether the response came from the model (scoreSource:"ai") or from
  // templateNarration()'s deterministic fallback (scoreSource:"deterministic") — the only thing
  // that's ever genuinely missing is the state while narration is still in flight (ev.overview
  // is null before narration runs at all, since evaluateClient() doesn't write prose). Gating the
  // whole paragraph on state === "ai" hid that deterministic prose behind "Overview unavailable"
  // any time the model call failed — same bug as Health, just for the overview field.
  const healthDisplay = ev ? `${Math.round(ev.health)} · ${ev.healthBand}` : shimmer;
  const healthTag = ev ? `<span class="mode ${state === "ai" ? "ai" : ""}" style="margin-left:6px">${state === "ai" ? "ai-scored" : "deterministic"}</span>` : "";
  const overviewBlock = ev?.overview
    ? `<p class="prose">${ev.overview}</p>`
    : state === "loading" ? `<p class="prose-shimmer">Generating overview…</p>`
    : `<p style="color:var(--ink-4); font-size:12px">Overview unavailable.</p>`;
  document.getElementById("client-head").innerHTML = `
    <h2>${p.name}</h2><span class="ref">${p.ref}</span><span class="ref">${meta.source}</span>
    <span class="tag ${p.mandate === "Advisory" ? "adv" : "disc"}">${p.mandate} mandate</span>
    <div class="facts">
      <div class="fct"><span class="k">${S.household ? "Household" : "AUM"}</span><span class="v">${p.currency} ${S.household ? (p.householdAum || p.aum) : p.aum}</span></div>
      <div class="fct"><span class="k">Risk profile</span><span class="v">${p.riskProfile} · ${p.riskBand}</span></div>
      <div class="fct"><span class="k">Health</span><span class="v">${healthDisplay}${healthTag}</span></div>
      ${L ? `<div class="fct"><span class="k">Lombard headroom</span><span class="v" style="color:${L.headroomPct < 25 ? P.SEV.warn : "inherit"}">${L.headroomPct}% <span style="color:var(--ink-4)">from ${L.prevHeadroomPct}%</span></span></div>` : ""}
      <div class="fct"><span class="k">Next review</span><span class="v">${p.reviewDate}</span></div>
      ${p.householdPositions ? `<button class="hh" id="hh-btn" aria-pressed="${S.household}"><span class="sw"></span>Household · ${(p.entities || []).length} entities</button>` : ""}
    </div>
    <div class="head-prose">
      ${overviewBlock}
    </div>`;
  document.getElementById("hh-btn")?.addEventListener("click", onHousehold);
}

export function paintGoals(onPick) {
  const gs = goals();
  const moved = gs.filter(g => g.change !== 0).length;
  document.getElementById("goals").innerHTML = `<div class="goal-lab"><h2>Objectives</h2><span class="n">funding ratio</span><span class="n2">${gs.length} tracked · ${moved || "none"} moved</span><span class="method" tabindex="0" title="${FUNDING_METHOD}">method</span></div>` + gs.map(g => {
    const col = g.change < 0 ? P.UP[3] : g.change > 0 ? P.SEV.good : css("--ink-3");
    const bar = g.funded >= 95 ? P.SEV.good : g.funded >= 80 ? P.SEV.warn : P.UP[3];
    const bk = BUCKETS[g.bucket] || { label: "Objective", cap: "" };
    return `<button class="goal" data-g="${g.id}" aria-pressed="${S.goalSel === g.id}">
      <div class="g-top"><span class="bkt b-${g.bucket || "other"}" title="${bk.cap}">${bk.label}</span><span class="gh">${g.horizon}</span></div>
      <div class="gn">${g.name}</div><div class="gv"><span class="pct">${g.funded}%</span><span class="chg" style="color:${col}">${g.change === 0 ? "no change" : fmtD(g.change) + " pts this week"}</span></div>
      <div class="track"><i style="width:${Math.min(100, g.funded)}%; background:${bar}"></i><span class="prev" style="left:${Math.min(100, g.prevFunded)}%"></span></div>
      <div class="gt2"><span>${g.targetLabel}</span><span>${g.driverIds.length ? g.driverIds.length + " positions" : "cash-funded"}</span></div>
    </button>`;
  }).join("");
  document.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => onPick(b.dataset.g)));
  M.once("goals", S.portfolio.id + "|" + S.household, M.goals);
}

/** The globe overlay card — shows only when a goal is selected ("this goal moved this week,
 * driven by X · Y · Z"). The risk-weighted concentration default shown here with no goal
 * selected was removed for a cleaner home page; the same figure still lives on the Compliance
 * tab (Physical Concentration), so nothing is lost, just not duplicated over the globe. */
export function paintEvidence() {
  const card = document.getElementById("evid-card");
  const g = S.goalSel ? goals().find(x => x.id === S.goalSel) : null;
  if (!g) { if (card) card.hidden = true; return; }
  if (card) card.hidden = false;
  document.getElementById("ev-k").textContent = "This goal moved";
  document.getElementById("ev-v").textContent = fmtD(g.change) + " pts";
  const drv = g.contributions.slice(0, 3).map(c => c.instrumentId).join(" · ");
  document.getElementById("ev-s").innerHTML = `this week, driven by<br><span style="font-family:var(--mono);color:var(--ink-2)">${drv || "no market driver"}</span>`;
  M.once("evid", "g:" + g.id + ":" + g.change, M.evidence);
}

export function paintLegend() {
  const L = LENSES()[S.lens];
  document.getElementById("lg-title").textContent = L.label;
  document.getElementById("lg-cap").textContent = L.cap;
  document.getElementById("lg-ramp").innerHTML = L.ramp.map(c => `<span style="background:${c}"></span>`).join("");
  document.getElementById("lg-lo").textContent = L.lo;
  document.getElementById("lg-mid").textContent = L.mid;
  document.getElementById("lg-hi").textContent = L.hi;
  M.once("legend", S.lens, M.ramp);
}

export function paintTicker(feed = FEED) {
  const hrefFor = url => {
    if (!url || typeof url !== "string") return "";
    if (url.startsWith("/")) return url;
    return /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
  };
  const item = f => {
    const url = hrefFor(f[5]);
    const isNew = f[5] === true || f[6] === true;
    const body = `<time>${f[0]}</time><span class="sv" style="background:${P.SEV[f[4]] || P.INK4}"></span><b>${f[2]}</b> ${f[3]} <span class="src">${f[1]}</span>`;
    return url
      ? `<a class="tk ${isNew ? "new" : ""}" href="${url}" target="_blank" rel="noreferrer">${body}</a>`
      : `<span class="tk ${isNew ? "new" : ""}">${body}</span>`;
  };
  document.getElementById("ticker").innerHTML = feed.map(item).join("") + feed.map(item).join("");
  M.tick();
  const tag = document.getElementById("mode-tag");
  if (!tag) return;
  const { mode } = getMode();
  tag.className = "mode " + mode;
  tag.textContent = mode === "live" ? "live feed" : mode === "fixtures" ? "fixtures" : "…";
}

/** The priority rail — Live Intelligence, Positions by pressure, AI Copilot. Used to lead with
 * an "Urgent reviews" carousel (which OTHER clients across the book need attention) — removed
 * entirely: it's book-wide content that doesn't belong once you're focused on one client, and
 * on the dashboard it was still just one more thing competing with Live Intelligence for the
 * same slot. Live Intelligence is the first section now, on every route. */
export function paintPfRail({ onClearSel, onSelectIso, onOpenClient, onOpenPosition, onRunPolicyScan, onOpenPolicyTrial, onCopilotToggle }) {
  const p = S.portfolio, meta = clientMeta(p), L = LENSES().d;
  const digest = S.selIso ? S.signals[S.selIso]?.events || [] : topEventsRaw(4);
  const top = meta.fl[0];
  document.getElementById("pfrail").innerHTML = `<button class="rail-close" id="close-priority-rail" aria-label="Close action rail">×</button>
    <section class="priority-card live-card"><div class="sec-h"><h2>Live Intelligence</h2><button class="ghost sm" id="clear-sel">Reset view</button></div><div class="situation-list">${digest.map(e => signalCard(e)).join("")}</div></section>
    <section class="priority-card positions-mini"><div class="sec-h"><h2>Positions by pressure</h2><span class="count">top 4</span></div>${visibleRows().slice(0,4).map(r => `<button class="mini-pos" data-t="${r.instrumentId}"><span class="tickr">${r.instrumentId}</span><span>${r.name}</span><b style="color:${L.col(r.riskDelta)}">${fmtD(r.riskDelta)}</b></button>`).join("")}</section>
    <section class="priority-card copilot-card"><div class="sec-h"><h2>AI Copilot</h2><span class="spark">✦</span></div><p>Ask about this client, a holding, or a market signal.</p><button class="suggest" data-coprompt="Prepare a call brief for ${p.name}">Prepare call brief</button><button class="suggest" data-coprompt="Show liquidity risks for ${p.name}">Show liquidity risks</button><button class="ghost solid" id="open-copilot">Open copilot</button></section>`;
  document.getElementById("priority-open")?.addEventListener("click", () => top ? onOpenPosition(top.instrumentId) : onRunPolicyScan());
  document.getElementById("clear-sel")?.addEventListener("click", onClearSel);
  document.querySelectorAll("#pfrail [data-cl]").forEach(b => b.addEventListener("click", () => onOpenClient?.(b.dataset.cl)));
  document.querySelectorAll("#pfrail [data-iso]").forEach(b => b.addEventListener("click", () => onSelectIso?.(b.dataset.iso)));
  document.querySelectorAll("#pfrail [data-t]").forEach(b => b.addEventListener("click", () => onOpenPosition(b.dataset.t)));
  M.once("rail", [p.id, S.selIso, S.goalSel, S.household].join("|"), M.rail);
}

/** The AI Copilot's ask box, actually routed to the model now (askCopilot in eval/narrate.js,
 * via main.js's askCopilotQuestion) instead of the old static "Drafting workspace for: X"
 * placeholder. The answer shown is scoped to whichever client it was actually asked about
 * (S.copilotAnsweredFor) — switching clients doesn't leave a stale answer from someone else's
 * portfolio on screen. */
export function paintCopilot({ onToggle, onAsk }) {
  const p = S.portfolio, open = S.copilotOpen;
  const prompts = ["Prepare call brief", "Show liquidity risks", "Summarise alerts", "Find clients affected by Singapore"];
  const answeredHere = S.copilotAnsweredFor === p.id;
  const answerBody = S.copilotAsking ? `<span class="prose-shimmer">Thinking…</span>`
    : answeredHere && S.copilotAnswer ? `${S.copilotAnswer} <span class="mode ai" style="margin-left:6px">ai-scored</span>`
    : "Select a prompt or ask a question to organise the RM workflow.";
  document.getElementById("copilot").innerHTML = open ? `<div class="copilot-box"><div class="copilot-h"><div><h2><span>✦</span> AI Copilot</h2><p>Ask about this client, a holding, or market event</p></div><button class="x" id="copilot-close" aria-label="Close copilot">×</button></div><div class="prompt-grid">${prompts.map(x => `<button data-prompt="${x}">${x}</button>`).join("")}</div><div class="copilot-answer">${answerBody}</div><div class="ask-row"><input id="copilot-input" value="${S.copilotDraft || ""}" placeholder="Ask anything..."><button id="copilot-ask" ${S.copilotAsking ? "disabled" : ""}>➤</button></div></div>` : `<button class="copilot-launch" id="copilot-open" aria-label="Open AI Copilot"><span>✦</span></button>`;
  document.getElementById("copilot-open")?.addEventListener("click", onToggle);
  document.getElementById("copilot-close")?.addEventListener("click", onToggle);
  document.querySelectorAll("#copilot [data-prompt]").forEach(b => b.addEventListener("click", () => {
    S.copilotDraft = b.dataset.prompt;
    onAsk?.(b.dataset.prompt);
  }));
  const input = document.getElementById("copilot-input");
  const submit = () => onAsk?.(input?.value);
  document.getElementById("copilot-ask")?.addEventListener("click", submit);
  input?.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  input?.addEventListener("input", e => { S.copilotDraft = e.target.value; });
}

function topEventsRaw(n) {
  const evs = [];
  for (const s of Object.values(S.signals)) for (const e of s.events || []) evs.push({ ...e, sev: Math.abs(s.riskDelta) > 25 ? "crit" : Math.abs(s.riskDelta) > 12 ? "serious" : "warn" });
  return evs.sort((a,b) => (b.value || "").length - (a.value || "").length).slice(0,n);
}

function signalCard(e) {
  const sev = e.sev || (e.severity === "Severe" ? "crit" : e.severity === "High" ? "serious" : "warn");
  return `<article class="sit">
    <time>${(e.at || "").split(" ").slice(-1)[0]}</time><span class="dot" style="background:${P.SEV[sev] || P.SEV.warn}"></span>
    <div><h3>${e.text || "Signal update"}</h3></div>
  </article>`;
}

function topEvents(n) {
  return topEventsRaw(n).map(e => [e.at.split(" ").slice(-1)[0], e.source, `<strong>${e.text}</strong> — ${e.value}`]);
}
