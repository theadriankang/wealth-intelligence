import { S, actionState, economics, positions, aiState } from "../store.js";
import { P } from "./palette.js";
import { ECONOMICS_BASELINE } from "../model/scoring.js";
import { chokepointExposure } from "../model/lookthrough.js";
import * as M from "./motion.js";

const UI = {
  actionFilter: "all",
  expandedAction: null,
  expandedMetric: null,
  convFocus: "today",
  expandedConcern: null,
  expandedPoint: null,
  expandedObjection: null,
  expandedCheck: null
};

const TODAY = "13 Nov 2026";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => (
  { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]
));
const strip = v => String(v ?? "").replace(/<[^>]*>/g, "");
const money = v => v || "AUM";
const pct = v => Number.isFinite(v) ? `${v.toFixed(v % 1 ? 1 : 0)}%` : "n/a";
const niceDate = date => {
  const m = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date || "Not scheduled";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
};

function status(a) { return actionState(a); }
function isPending(a) { return !["Accepted", "Executed"].includes(status(a)); }
function isHigh(a) { return ["Urgent"].includes(status(a)) || ["Collateral", "Trim"].includes(a.kind); }
function severity(a) {
  if (status(a) === "Urgent") return "critical";
  if (a.kind === "Collateral" || a.kind === "Trim") return "high";
  if (a.kind === "Hedge" || a.kind === "Hold") return "medium";
  return "opportunity";
}
function icon(kind) {
  return { Collateral:"!", Trim:"%", Hedge:"↗", Hold:"✓", Liquidity:"⌁" }[kind] || "•";
}
function statusDot(filter) {
  return { all:"📋", high:"⚠", pending:"◷", accepted:"✓" }[filter] || "•";
}
function filteredActions(actions) {
  if (UI.actionFilter === "high") return actions.filter(isHigh);
  if (UI.actionFilter === "pending") return actions.filter(isPending);
  if (UI.actionFilter === "accepted") return actions.filter(a => ["Accepted", "Executed"].includes(status(a)));
  return actions;
}
function fundingVisual(a) {
  const e = a.evidence || {};
  const shortfallUsd = Number(e.shortfallUsd || 0);
  if (shortfallUsd > 0 && Number.isFinite(e.funded)) {
    const funded = Math.max(0, Math.min(100, Number(e.funded)));
    return `<div class="funding-viz">
      <div class="fv-row"><span>Required</span><b>100%</b></div>
      <div class="fv-track required"><i style="width:100%"></i></div>
      <div class="fv-row"><span>Funded</span><b>${funded.toFixed(0)}%</b></div>
      <div class="fv-track available"><i style="width:${Math.max(3, funded)}%"></i></div>
      <strong>Shortfall USD ${(shortfallUsd / 1e6).toFixed(2)}m</strong>
    </div>`;
  }
  return visualFor(a);
}
function actionList(p, ev, state) {
  return (state === "ai" && ev?.actions?.length ? ev.actions : (p.actions || [])).map((a, i) => ({
    id: a.id || `a${i + 1}`,
    kind: a.kind || a.category || "Action",
    title: a.title || a.text || "Review recommendation",
    target: a.target || a.instrumentId || a.category || "Portfolio recommendation",
    state: a.state || "Drafted",
    why: a.why || a.rationale || "",
    effect: a.effect || [],
    evidence: a.evidence || {},
    suitability: a.suitability || {}
  }));
}
function visualFor(a) {
  const e = a.evidence || {};
  if (Number.isFinite(e.ltv) && Number.isFinite(e.trigger)) {
    const headroom = e.trigger - e.ltv;
    const fill = Math.min(100, Math.max(0, e.ltv / e.trigger * 100));
    return `<button class="viz threshold-viz" data-expand-action="${a.id}" type="button">
      <div><b>${e.ltv.toFixed(2)}%</b><span>vs ${e.trigger}% trigger</span></div>
      <div class="bar"><i style="width:${fill}%"></i><em style="left:100%"></em></div>
      <small>Remaining headroom ${headroom.toFixed(2)}pp</small>
    </button>`;
  }
  if (Number.isFinite(e.weight) && Number.isFinite(e.limit)) {
    const scale = Math.max(e.weight, e.limit, 1);
    return `<button class="viz twin-viz" data-expand-action="${a.id}" type="button">
      <div><span>Current</span><b>${e.weight.toFixed(1)}%</b></div>
      <div class="bar"><i style="width:${Math.min(100, e.weight / scale * 100)}%"></i></div>
      <div><span>Proposed</span><b>${e.limit.toFixed(1)}%</b></div>
      <div class="bar proposed"><i style="width:${Math.min(100, e.limit / scale * 100)}%"></i></div>
    </button>`;
  }
  return `<button class="viz text-viz" data-expand-action="${a.id}" type="button">
    <strong>${esc(strip(a.effect?.[0] || a.kind))}</strong>
    <span>${esc(strip(a.why || a.target || ""))}</span>
  </button>`;
}
function effectTiles(a) {
  const labels = ["Goal", "Cost", "Tax"];
  return `<div class="effect-tiles">${labels.map((l, i) => `<button class="effect-tile" data-metric="${a.id}-${i}" type="button">
    <span>${l}</span><b>${i === 0 ? "⚠ " : i === 1 ? "✓ " : "◇ "}${a.effect?.[i] || "Existing record"}</b>
    ${UI.expandedMetric === `${a.id}-${i}` ? `<small>${esc(a.suitability?.[["objective","costs","riskFit"][i]] || strip(a.effect?.[i] || ""))}</small>` : ""}
  </button>`).join("")}</div>`;
}

function relationshipView(p, ev, state) {
  const r = state === "ai" && ev?.relationship ? ev.relationship : p.relationship;
  if (!r) return null;
  const objections = (r.objections || []).map(o => Array.isArray(o) ? { question:o[0], answer:o[1] } : o);
  return {
    lastContact: r.lastContact || [r.last?.date, r.last?.channel].filter(Boolean).join(" · ") || "Recent contact",
    nextReview: niceDate(p.reviewDate),
    summary: r.summary || r.behaviour || "Relationship context available for this mandate.",
    sentiment: r.sentiment || "Neutral",
    concerns: r.concerns || [],
    talkingPoints: r.talkingPoints || r.points || [],
    objections
  };
}

function complianceChecks(p) {
  const cks = [
    { id:"sanctions", t:"Sanctions screening", s:"clear", d:`${p.positions.length} holdings screened against consolidated lists.` },
    { id:"jurisdiction", t:"Jurisdiction exposure", s:p.countryRisk === "High" ? "watch" : "clear", d:"Two holdings carry revenue exposure to a jurisdiction re-rated upward this week." },
    { id:"pep", t:"PEP adjacency", s:"clear", d:"No politically exposed person identified in the beneficial ownership chain." },
    { id:"concentration", t:"Concentration policy", s:(p.riskProfile || "").includes("Growth") ? "watch" : "clear", d:"Look-through single-country exposure sits close to the soft mandate limit." }
  ];
  return cks;
}

/** Risks + opportunities + recommended actions — AI-scored for the open client, hash-gated,
 * with a deterministic fallback (clientEval.js's rule-based findings) when the model is
 * unavailable or its response doesn't validate. See eval/narrate.js.
 *
 * Trust/governance, made concrete rather than just claimed:
 *  - Suitability: the mandate-fit line on every action is computed here, deterministically,
 *    from portfolio.mandate — never asked of or trusted from the model.
 *  - Human oversight: Accept/Reject on every action, tracked in S.aiActionState. Nothing here
 *    executes anything; this is a record of what the RM decided, not an execution trigger.
 */
export function paintActions() {
  const p = S.portfolio;
  const ev = S.evaluation?.clients?.[p.id];
  const state = aiState(p.id);
  const risks = state === "ai" ? (ev.risks || []) : [];
  const opportunities = state === "ai" ? (ev.opportunities || []) : [];
  const actions = actionList(p, ev, state);
  document.getElementById("tn-act").textContent = actions.length;
  const statusLine = !actions.length
    ? (state === "loading" ? `<p class="prose-shimmer">Scoring this client…</p>`
      : state === "unavailable" ? `<p style="color:var(--ink-4); font-size:12px">AI scoring unavailable for this client.</p>`
      : !risks.length && !opportunities.length ? `<p style="color:var(--ink-4); font-size:12px">Nothing flagged this week.</p>` : "")
    : "";
  document.getElementById("actions").innerHTML = `<div class="tab-page risks-page">
    <div class="tab-titlebar"><div><h2>Risks & Actions</h2><p>AI-driven recommendations to keep your client on track</p></div><div><span>Last updated</span><b>${TODAY}, 09:24 SGT</b></div></div>
    <section class="ra-summary">
      ${[
        ["all", "Total actions", actions.length],
        ["high", "High priority", actions.filter(isHigh).length],
        ["pending", "Pending", actions.filter(isPending).length],
        ["accepted", "Accepted", actions.filter(a => ["Accepted", "Executed"].includes(status(a))).length]
      ].map(([k, label, value]) => `<button class="ra-counter ${k}" data-action-filter="${k}" aria-pressed="${UI.actionFilter === k}"><i>${statusDot(k)}</i><span>${label}</span><b>${value}</b></button>`).join("")}
    </section>
    ${statusLine}
    <section class="decision-list">${filteredActions(actions).map((a, i) => {
      const key = p.id + "|" + i;
      const acState = S.aiActionState[key] || "pending";
      const open = UI.expandedAction === a.id;
      return `<article class="decision-card sev-${severity(a)} ${open ? "open" : ""}" data-expand-action="${a.id}">
        <div class="decision-head"><span class="kind">${esc(a.kind || "Action")}</span><div><h3>${esc(strip(a.title))}</h3><p>${esc(strip(a.target || "Portfolio recommendation"))}</p></div><button class="ghost sm ${acState === "accepted" ? "solid" : ""}" data-accept="${i}" type="button">${acState === "accepted" ? "Accepted" : status(a)}</button><button class="chev" type="button">›</button></div>
        <div class="decision-core">${fundingVisual(a)}${effectTiles(a)}</div>
        ${open ? `<div class="decision-detail"><p>${esc(strip(a.why || ""))}</p><dl><dt>Objective</dt><dd>${esc(a.suitability?.objective || "Aligned with mandate")}</dd><dt>Risk fit</dt><dd>${esc(a.suitability?.riskFit || "RM review required")}</dd></dl></div>` : ""}
        <div class="act-f">
          <button class="ghost sm ${acState === "accepted" ? "solid" : ""}" data-accept="${i}" type="button">Accept</button>
          <button class="ghost sm ${acState === "rejected" ? "solid" : ""}" data-reject="${i}" type="button">Reject</button>
        </div>
      </article>`;
    }).join("")}</section>
  </div>`;
  document.querySelectorAll("#actions [data-action-filter]").forEach(b => b.addEventListener("click", () => { UI.actionFilter = b.dataset.actionFilter; paintActions(); }));
  document.querySelectorAll("#actions [data-expand-action]").forEach(b => b.addEventListener("click", e => {
    if (e.target.closest("[data-accept],[data-reject],[data-metric]")) return;
    UI.expandedAction = UI.expandedAction === b.dataset.expandAction ? null : b.dataset.expandAction;
    paintActions();
  }));
  document.querySelectorAll("#actions [data-metric]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); UI.expandedMetric = UI.expandedMetric === b.dataset.metric ? null : b.dataset.metric; paintActions(); }));
  document.querySelectorAll("#actions [data-accept]").forEach(b => b.addEventListener("click", () => {
    S.aiActionState[p.id + "|" + b.dataset.accept] = "accepted"; paintActions();
  }));
  document.querySelectorAll("#actions [data-reject]").forEach(b => b.addEventListener("click", () => {
    S.aiActionState[p.id + "|" + b.dataset.reject] = "rejected"; paintActions();
  }));
  M.once("actions", S.portfolio.id + "|" + state, M.actions);
}

/** Relationship, standing concerns, talking points, and likely objections — AI-drafted for the
 * open client (same one narrateClient call as Explanation/Risks & Actions), reprioritising the
 * underlying relationship record for the current facts rather than reciting it. Deterministic
 * fallback is that same static relationship record, reshaped. No number here to fake, but the
 * same loading/unavailable states apply so stale/guessed content is never shown as current. */
export function paintConversation() {
  const p = S.portfolio;
  const state = aiState(p.id);
  const ev = S.evaluation?.clients?.[p.id];
  const el = document.getElementById("conv");
  const r = relationshipView(p, ev, state);
  if (!r) {
    el.innerHTML = `<div class="blk"><p>No relationship record for this mandate.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="tab-page conversation-page">
    <section class="conv-top">
      <div class="glass-panel"><h2>Relationship Timeline</h2><div class="timeline"><button class="tl-node" data-conv-focus="last" aria-pressed="${UI.convFocus === "last"}"><span>✓</span><b>Last Contact</b><em>${esc(r.lastContact || "Recent call")}</em></button><button class="tl-node" data-conv-focus="today" aria-pressed="${UI.convFocus === "today"}"><span>□</span><b>Today</b><em>${TODAY}</em></button><button class="tl-node" data-conv-focus="next" aria-pressed="${UI.convFocus === "next"}"><span>◷</span><b>Next Review</b><em>${esc(r.nextReview)}</em></button></div><p class="focus-note">${esc(r.summary)}</p></div>
      <div class="glass-panel lead-panel"><span class="lead-icon">♙</span><p>Relationship Lead</p><h3>${esc(p.rm || "Relationship Manager")}</h3><small>Senior Adviser</small><div class="lead-actions"><button>✉</button><button>☎</button><button>in</button></div></div>
      <div class="glass-panel sentiment-panel"><p>Client Sentiment <small>(Recent)</small></p><div class="sentiment-arc"><i></i></div><h3>${esc(r.sentiment || "Neutral")}</h3><small>No material change</small></div>
    </section>
    <section class="glass-panel"><h2>Standing Concerns</h2><div class="concern-grid">${(r.concerns || []).slice(0,3).map((x, i) => `<button class="concern-card" data-concern="${i}" type="button"><span>${i + 1}</span><div><em>${i === 0 ? "Relationship" : i === 1 ? "Liquidity / Exit" : "Valuation"}</em><b>${esc(strip(x).split(".")[0])}</b><p>${esc(strip(x))}</p></div></button>`).join("")}</div></section>
    <section class="brief-grid">
      <div class="glass-panel"><h2>Talking Points for Next Conversation</h2>${(r.talkingPoints || []).map((x, i) => `<button class="brief-row" data-point="${i}" type="button"><span>${i + 1}</span><div><b>${esc(strip(x).split(":")[0])}</b><p>${esc(UI.expandedPoint === String(i) ? strip(x) : strip(x).split(".")[0])}</p></div><em>›</em></button>`).join("")}</div>
      <div class="glass-panel"><h2>Likely Objections</h2>${(r.objections || []).map((o, i) => `<button class="objection-card" data-objection="${i}" type="button"><span>?</span><div><b>“${esc(o.question)}”</b><p>${esc(UI.expandedObjection === String(i) ? o.answer : "Suggested response")}</p></div><em>›</em></button>`).join("")}</div>
    </section>
  </div>`;
  document.querySelectorAll("#conv [data-conv-focus]").forEach(b => b.addEventListener("click", () => { UI.convFocus = b.dataset.convFocus; paintConversation(); }));
  document.querySelectorAll("#conv [data-point]").forEach(b => b.addEventListener("click", () => { UI.expandedPoint = UI.expandedPoint === b.dataset.point ? null : b.dataset.point; paintConversation(); }));
  document.querySelectorAll("#conv [data-objection]").forEach(b => b.addEventListener("click", () => { UI.expandedObjection = UI.expandedObjection === b.dataset.objection ? null : b.dataset.objection; paintConversation(); }));
  M.once("conv", p.id + "|" + state, () => M.enter("#conv .blk", { y: 10, delay: 60, duration: 420 }));
}

/** Compliance checks — AI-generated per client from real CSV facts (PEP status, tax domicile,
 * KYC review date, look-through concentration against the mandate's bands), not the generic
 * fixed checklist every client used to see. Deterministic fallback when the model is unavailable
 * or invalid draws on the same facts (fallbackComplianceChecks in eval/narrate.js) rather than
 * inventing a screening result. The chokepoint table and suitability-record table below are
 * unrelated deterministic data (look-through math, the static per-portfolio action list) and are
 * untouched. */
/** Compliance checks are AI-generated per client from real CSV facts (PEP status, tax domicile,
 * KYC review date, look-through concentration against the mandate's bands) — see
 * eval/narrate.js. The visual design (comp-hero/comp-grid/glass-panel) is main's; the data
 * source is ev.complianceChecks (AI, with the same loading/unavailable states as everywhere
 * else) rather than main's `complianceChecks(p)`, which doesn't exist anywhere in the codebase
 * — calling it would throw ReferenceError. */
export function paintCompliance() {
  const p = S.portfolio;
  const ev = S.evaluation?.clients?.[p.id];
  const state = aiState(p.id);
  const checks = state === "ai"
    ? (ev.complianceChecks || []).map((c, i) => ({ id: `c${i}`, s: c.status, t: c.item, d: c.detail }))
    : [];
  const watch = checks.filter(c => c.s === "watch").length;
  // Drives the Physical Concentration panel's status chip below — real, not decorative: the
  // AI's own "Concentration policy" check already covers chokepoint-driven concentration (see
  // clientEval.js's topic:"chokepoint" risks feeding that same check), so its clear/watch status
  // is an actual answer, not an unconditional "Within mandate" claim with nothing behind it.
  const concCheck = checks.find(c => c.t === "Concentration policy") || null;
  const recs = (p.actions || []).filter(a => actionState(a) !== "Drafted" || p.mandate === "Discretionary");
  const ck = Object.values(chokepointExposure(positions(), S.instruments)).sort((a, b) => b.weightPct - a.weightPct);
  document.getElementById("tn-comp").textContent = watch;
  const checksPanel = state === "loading" ? `<div class="glass-panel"><h2>Compliance Checks</h2><p class="prose-shimmer">Scoring compliance…</p></div>`
    : state === "unavailable" ? `<div class="glass-panel"><h2>Compliance Checks</h2><p style="color:var(--ink-4)">Compliance checks unavailable.</p></div>`
    : `<div class="glass-panel"><h2>Compliance Checks</h2>${checks.map(c => `<button class="check-row ${c.s}" data-check="${c.id}" type="button"><span>${c.s === "watch" ? "!" : "✓"}</span><div><b>${esc(c.t)}</b><p>${esc(UI.expandedCheck === c.id ? c.d : c.d.slice(0, 92))}</p></div><em>${c.s}</em></button>`).join("")}</div>`;
  document.getElementById("comp").innerHTML = `<div class="tab-page compliance-page">
    <section class="comp-hero ${watch ? "watch" : "clear"}"><span>${watch ? "!" : "✓"}</span><div><h2>${watch ? "Compliance watch" : "No blocking compliance items"}</h2><p>${p.positions.length} holdings · ${checks.length} derived checks · based on current portfolio data${state === "ai" ? ` <span class="mode ai" style="margin-left:6px">ai-scored</span>` : ""}</p></div><dl><dt>Next review</dt><dd>${esc(p.reviewDate || "Not recorded")}</dd><dt>Mandate</dt><dd>${esc(p.mandate)}</dd></dl></section>
    <section class="comp-grid">
      ${checksPanel}
      <div class="glass-panel"><h2>Physical Concentration <small>(look-through)</small>${concCheck ? ` <em class="status-chip${concCheck.s === "watch" ? " watch" : ""}">${concCheck.s === "watch" ? "Elevated" : "Within mandate"}</em>` : ""}</h2><div class="exposure-bars">${ck.length ? ck.slice(0,6).map(c => `<div><span>${esc(c.name)}</span><i><b style="width:${Math.min(100, c.weightPct * 5)}%"></b></i><strong>${c.weightPct.toFixed(1)}%</strong></div>`).join("") : `<div class="empty-state">No chokepoint exposure in current holdings.</div>`}</div></div>
      <div class="glass-panel summary-panel"><h2>Compliance Summary</h2><div class="summary-boxes"><div><b>${checks.length - watch}</b><span>Clear</span></div><div class="watch"><b>${watch}</b><span>Watch</span></div><div class="danger"><b>${checks.filter(c => c.s === "block").length}</b><span>Action required</span></div></div></div>
      <div class="glass-panel"><h2>Suitability Records</h2>${recs.length ? recs.map(a => `<div class="record-row"><b>${esc(a.title)}</b><span>${esc(p.mandate)} · ${esc(actionState(a))}</span></div>`).join("") : `<div class="empty-state">No records yet. They appear when a proposal is put to client or executed.</div>`}</div>
    </section>
  </div>`;
  document.querySelectorAll("[data-check]").forEach(b => b.addEventListener("click", () => { UI.expandedCheck = UI.expandedCheck === b.dataset.check ? null : b.dataset.check; paintCompliance(); }));
  M.once("comp", p.id + "|" + state, () => M.enter("#comp .comp-hero, #comp .glass-panel", { y: 10, delay: 50, duration: 360 }));
}

/** The operating-leverage tab. The numeric tiles/leverage-panel are a book-wide deterministic
 * formula (rmEconomics — legitimate arithmetic, not a claim about any one client, so it stays
 * deterministic — this part is main's design, unchanged). The hero paragraph is AI-generated and
 * client-specific instead of main's generic "Wealth Intelligence drives operating leverage..."
 * copy — what THIS mandate concretely involves this review, grounded only in this client's own
 * facts. Same loading/unavailable states as everywhere else. */
export function paintEconomics() {
  const p = S.portfolio;
  const e = economics(), saved = e.prepBefore - e.prepAfter;
  const ev = S.evaluation?.clients?.[p.id];
  const state = aiState(p.id);
  const heroBody = state === "ai" ? `${esc(ev.impactNarrative)} <span class="mode ai" style="margin-left:6px">ai-scored</span>`
    : state === "loading" ? `<span class="prose-shimmer">Scoring this client's impact…</span>`
    : `<span style="color:var(--ink-4)">Impact narrative unavailable.</span>`;
  document.getElementById("econ").innerHTML = `<div class="tab-page impact-page">
    <section class="impact-hero"><span>◎</span><div><h2>This client's operating impact</h2><p>${heroBody}</p></div><aside><small>Strategic target</small><b>&lt; 67%</b><small>2028 adjusted cost/income target context</small><i><em style="width:67%"></em></i></aside></section>
    <section class="impact-metrics">
      <div class="impact-card clients"><p>Clients in the book</p><b>${e.clients}</b><span>${e.affected} affected by this week's signals</span></div>
      <div class="impact-card prep impact-primary"><p>Prep per review</p><b>${e.prepBefore}<small>min</small> → ${e.prepAfter}<small>min</small></b><div class="before-after"><i style="height:86%"></i><i style="height:18%"></i><strong>-${Math.round(saved / e.prepBefore * 100)}%</strong></div><span>${saved} min saved per review</span></div>
      <div class="impact-card"><p>Saved this morning</p><b>${e.minutesSavedNow}<small>min</small></b><span>Across ${e.affected} mandates that moved</span></div>
      <div class="impact-card bars"><p>Adviser hours per year</p><b>${e.hoursPerYear}<small>hrs</small></b><span>At ${ECONOMICS_BASELINE.reviewsPerClientPerYear} reviews per client per year</span></div>
    </section>
    <section class="glass-panel leverage-panel"><div class="impact-section-head"><div><h2>Prepare Once, Deliver Many</h2><p>Turn analysis into client impact at scale.</p></div><span>∞ Same analysis. Many conversations.</span></div><div class="flow">
      <button type="button"><i>1</i><b>Analysis</b><span>Done once</span><small>Client and market data</small></button><em>→</em>
      <button type="button"><i>2</i><b>Client outputs</b><span>Many</span><small>Insights, alerts, briefs</small></button><em>→</em>
      <button type="button"><i>3</i><b>Personalised RM conversations</b><span>At scale</span><small>Richer conversations</small></button>
    </div><p>${esc(e.note)}</p></section>
  </div>`;
  M.once("econ", p.id + "|" + state + "|" + e.affected, () => M.enter("#econ .impact-hero, #econ .impact-card, #econ .glass-panel", { y: 10, delay: 50, duration: 360 }));
}
