import { S, actionState, economics, flagged, positions, rows, aiState } from "../store.js";
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
function filteredActions(actions) {
  if (UI.actionFilter === "high") return actions.filter(isHigh);
  if (UI.actionFilter === "pending") return actions.filter(isPending);
  if (UI.actionFilter === "accepted") return actions.filter(a => ["Accepted", "Executed"].includes(status(a)));
  return actions;
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
    <span>${esc(strip(a.why || ""))}</span>
  </button>`;
}
function effectTiles(a) {
  const labels = ["Effect on goal", "Cost", "Tax"];
  return `<div class="effect-tiles">${labels.map((l, i) => `<button class="effect-tile" data-metric="${a.id}-${i}" type="button">
    <span>${l}</span><b>${a.effect?.[i] || "Existing record"}</b>
    ${UI.expandedMetric === `${a.id}-${i}` ? `<small>${esc(a.suitability?.[["objective","costs","riskFit"][i]] || strip(a.effect?.[i] || ""))}</small>` : ""}
  </button>`).join("")}</div>`;
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
 *  - Traceability: the exact facts behind the current risks/actions are inspectable via the
 *    "Inspect data used" toggle in the client header (paintHead), reading groundingUsed.
 */
export function paintActions() {
  const p = S.portfolio;
  const ev = S.evaluation?.clients?.[p.id];
  const state = aiState(p.id);
  const risks = state === "ai" ? (ev.risks || []) : [];
  const opportunities = state === "ai" ? (ev.opportunities || []) : [];
  const actions = state === "ai" ? (ev.actions || []) : [];
  const suitability = p.mandate === "Discretionary"
    ? "Executable under standing authority" : "Requires client instruction before execution";
  document.getElementById("tn-act").textContent = actions.length;
  const statusLine = state === "loading" ? `<p class="prose-shimmer">Scoring this client…</p>`
    : state === "unavailable" ? `<p style="color:var(--ink-4); font-size:12px">AI scoring unavailable for this client.</p>`
    : !risks.length && !opportunities.length && !actions.length ? `<p style="color:var(--ink-4); font-size:12px">Nothing flagged this week.</p>` : "";
  document.getElementById("actions").innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:15px">
      <p style="margin:0; font-size:12.5px; color:var(--ink-3)">Risk findings and recommended
        actions for this mandate — internal RM guidance, not client-facing advice. The RM reviews,
        accepts, or rejects every item below; nothing here executes on its own.</p>
      ${state === "ai" ? `<span class="mode ai">ai-scored</span>` : ""}
    </div>
    ${statusLine}
    ${risks.length ? `<div class="blk"><h3>Risks</h3>
      ${risks.map(r => `<div class="tp"><span class="num" style="color:${
        r.severity === "high" ? "var(--warn)" : r.severity === "medium" ? "var(--ink-3)" : "var(--ink-4)"
      }">●</span><p>${r.text} <span class="kind" style="margin-left:4px">${r.category || "other"}</span></p></div>`).join("")}</div>` : ""}
    ${opportunities.length ? `<div class="blk"><h3>Opportunities</h3>
      ${opportunities.map(o => `<div class="tp"><span class="num" style="color:var(--good)">●</span><p>${o.text}</p></div>`).join("")}</div>` : ""}
    ${actions.map((a, i) => {
      const key = p.id + "|" + i;
      const acState = S.aiActionState[key] || "pending";
      return `<article class="act">
        <div class="act-h"><span class="kind">${a.kind}${a.category ? ` · ${a.category}` : ""}</span><div><h3>${a.title}</h3></div></div>
        <div class="act-b"><p>${a.why}</p></div>
        <div class="act-f">
          <span class="sp">${suitability}${acState !== "pending" ? ` · ${acState}` : ""}</span>
          <button class="ghost sm ${acState === "accepted" ? "solid" : ""}" data-accept="${i}">Accept</button>
          <button class="ghost sm ${acState === "rejected" ? "solid" : ""}" data-reject="${i}">Reject</button>
        </div>
      </article>`;
    }).join("")}`;
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
  if (state === "loading") {
    el.innerHTML = `<div class="blk"><p class="prose-shimmer">Preparing conversation notes…</p></div>`;
    return;
  }
  if (state === "unavailable") {
    el.innerHTML = `<div class="blk"><p style="color:var(--ink-4)">Conversation notes unavailable.</p></div>`;
    return;
  }
  const r = ev.relationship;
  if (!r) {
    el.innerHTML = `<div class="blk"><p>No relationship record for this mandate.</p></div>`;
    return;
  }
  el.innerHTML = `
    <div class="blk"><h3>Relationship <span class="mode ai" style="margin-left:6px">ai-scored</span></h3>
      <div class="meta-row" style="margin-bottom:11px">
        <div class="fct"><span class="k">Next review</span><span class="v">${p.reviewDate}</span></div>
        <div class="fct"><span class="k">Adviser</span><span class="v">${p.rm}</span></div></div>
      <p>${r.summary}</p></div>
    <div class="blk"><h3>Standing concerns</h3>
      ${r.concerns.map(x => `<div class="tp"><span class="num">·</span><p>${x}</p></div>`).join("")}</div>
    <div class="blk"><h3>Talking points for the next conversation</h3>
      ${r.talkingPoints.map((x, i) => `<div class="tp"><span class="num">${i + 1}</span><p>${x}</p></div>`).join("")}</div>
    <div class="blk"><h3>Likely objections</h3>
      ${r.objections.map(o => `<div class="obj"><p class="q">“${o.question}”</p><p class="a">${o.answer}</p></div>`).join("")}</div>`;
  M.once("conv", p.id + "|" + state, () => M.enter("#conv .blk", { y: 10, delay: 60, duration: 420 }));
}

export function paintCompliance() {
  const p = S.portfolio, checks = complianceChecks(p), watch = checks.filter(c => c.s === "watch").length;
  const recs = (p.actions || []).filter(a => actionState(a) !== "Drafted" || p.mandate === "Discretionary");
  const ck = Object.values(chokepointExposure(positions(), S.instruments)).sort((a, b) => b.weightPct - a.weightPct);
  document.getElementById("tn-comp").textContent = watch;
  document.getElementById("comp").innerHTML = `<div class="tab-page compliance-page">
    <section class="comp-hero ${watch ? "watch" : "clear"}"><span>${watch ? "!" : "✓"}</span><div><h2>${watch ? "Compliance watch" : "No blocking compliance items"}</h2><p>${p.positions.length} holdings · ${checks.length} derived checks · based on current portfolio data</p></div><dl><dt>Next review</dt><dd>${esc(p.reviewDate || "Not recorded")}</dd><dt>Mandate</dt><dd>${esc(p.mandate)}</dd></dl></section>
    <section class="comp-grid">
      <div class="glass-panel"><h2>Compliance Checks</h2>${checks.map(c => `<button class="check-row ${c.s}" data-check="${c.id}" type="button"><span>${c.s === "watch" ? "!" : "✓"}</span><div><b>${esc(c.t)}</b><p>${esc(UI.expandedCheck === c.id ? c.d : c.d.slice(0, 92))}</p></div><em>${c.s}</em></button>`).join("")}</div>
      <div class="glass-panel"><h2>Physical Concentration <small>(look-through)</small></h2><div class="exposure-bars">${ck.length ? ck.slice(0,5).map(c => `<div><span>${esc(c.name)}</span><i><b style="width:${Math.min(100, c.weightPct)}%"></b></i><strong>${c.weightPct.toFixed(1)}%</strong></div>`).join("") : `<div class="empty-state">No chokepoint exposure in current holdings.</div>`}</div></div>
      <div class="glass-panel summary-panel"><h2>Compliance Summary</h2><div class="summary-boxes"><div><b>${checks.length - watch}</b><span>Clear</span></div><div class="watch"><b>${watch}</b><span>Watch</span></div><div class="danger"><b>${checks.filter(c => c.s === "block").length}</b><span>Action required</span></div></div></div>
      <div class="glass-panel"><h2>Suitability Records</h2>${recs.length ? recs.map(a => `<div class="record-row"><b>${esc(a.title)}</b><span>${esc(p.mandate)} · ${esc(actionState(a))}</span></div>`).join("") : `<div class="empty-state">No records yet. They appear when a proposal is put to client or executed.</div>`}</div>
    </section>
  </div>`;
  document.querySelectorAll("[data-check]").forEach(b => b.addEventListener("click", () => { UI.expandedCheck = UI.expandedCheck === b.dataset.check ? null : b.dataset.check; paintCompliance(); }));
  M.once("comp", S.portfolio.id, () => M.enter("#comp .comp-hero, #comp .glass-panel", { y: 10, delay: 50, duration: 360 }));
}

export function paintEconomics() {
  const e = economics(), f = flagged().length, saved = e.prepBefore - e.prepAfter;
  document.getElementById("econ").innerHTML = `<div class="tab-page impact-page">
    <section class="impact-hero"><span>◎</span><div><h2>Wealth Intelligence drives operating leverage for you and your clients</h2><p>Baselines are stated demo assumptions, not measured claims. The value shown here is calculated from book size and mandates affected by current signals.</p></div><aside><b>&lt; 67%</b><small>2028 adjusted cost/income target context</small></aside></section>
    <section class="impact-metrics">
      <div class="impact-card clients"><p>Clients in the book</p><b>${e.clients}</b><span>${e.affected} affected by this week's signals</span></div>
      <div class="impact-card prep"><p>Prep per review</p><b>${e.prepBefore}<small>min</small> → ${e.prepAfter}<small>min</small></b><span>${saved} min saved per review</span></div>
      <div class="impact-card"><p>Saved this morning</p><b>${e.minutesSavedNow}<small>min</small></b><span>Across ${e.affected} mandates that moved</span></div>
      <div class="impact-card bars"><p>Adviser hours per year</p><b>${e.hoursPerYear}</b><span>At ${ECONOMICS_BASELINE.reviewsPerClientPerYear} reviews per client per year</span></div>
    </section>
    <section class="glass-panel leverage-panel"><h2>Prepare Once, Deliver Many</h2><div class="flow">
      <div><i>1</i><b>Analysis</b><span>Done once</span></div><em>→</em>
      <div><i>2</i><b>Client outputs</b><span>${e.affected || 0} mandate${e.affected === 1 ? "" : "s"} moved</span></div><em>→</em>
      <div><i>3</i><b>Personalized RM conversations</b><span>Applied at scale</span></div>
    </div><p>${esc(e.note)}</p></section>
  </div>`;
  M.once("econ", S.portfolio.id + "|" + e.affected, () => M.enter("#econ .impact-hero, #econ .impact-card, #econ .glass-panel", { y: 10, delay: 50, duration: 360 }));
}
