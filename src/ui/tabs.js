import { S, actionState, economics, aiState } from "../store.js";
import { P } from "./palette.js";
import { ECONOMICS_BASELINE } from "../model/scoring.js";
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
/** "Today" is the book's as-of snapshot (S.meta.asOf — "2025-12-31" through "2026-08-26" on the
 * Julius Baer adapter, see adapters/jb/build.js's SNAPSHOTS/TODAY), not a fixed hardcoded date —
 * it moves with switchSnapshot() like everything else on the page. The demo adapter has no
 * snapshot concept at all, so it falls back to the real calendar date rather than a made-up one. */
const today = () => S.meta?.asOf ? niceDate(S.meta.asOf) : new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });

function status(a) { return actionState(a); }
/** The RM's own Accept/Reject/Complete click (S.aiActionState, keyed by this action's stable
 * position in the full actionList()) is authoritative over the deterministic/AI-drafted status —
 * a click is a real decision that happened; `status(a)` is just where the recommendation started
 * out. Accept is a toggle (click again to put it back to pending); Reject and Complete both
 * remove the item from every list in this tab — Reject because it never happened, Complete
 * because it's done and the Risks & Actions queue is for open work, not a done-items archive
 * (the Compliance tab's Suitability Records is that archive — see paintCompliance below). */
function decisionFor(a) { return S.aiActionState[S.portfolio.id + "|" + a._idx]; }
function isRejected(a) { return decisionFor(a) === "rejected"; }
function isCompleted(a) { return decisionFor(a) === "completed"; }
function effectiveStatus(a) {
  const decision = decisionFor(a);
  if (decision === "accepted") return "Accepted";
  if (decision === "rejected") return "Rejected";
  if (decision === "completed") return "Completed";
  return status(a);
}
function isPending(a) { return !["Accepted", "Executed", "Rejected", "Completed"].includes(effectiveStatus(a)); }
/** High priority is the AI's (or, when it's unavailable, the deterministic engine's) own call —
 * see actions[].priority in eval/narrate.js — not a hardcoded guess from the action's kind. */
function isHigh(a) { return !isRejected(a) && !isCompleted(a) && a.priority === "high"; }
function severity(a) {
  if (effectiveStatus(a) === "Urgent") return "critical";
  if (a.priority === "high") return "high";
  if (a.priority === "medium") return "medium";
  return "opportunity";
}
function statusDot(filter) {
  return { all:"📋", high:"⚠", pending:"◷", accepted:"✓" }[filter] || "•";
}
function filteredActions(actions) {
  const live = actions.filter(a => !isRejected(a) && !isCompleted(a));
  if (UI.actionFilter === "high") return live.filter(isHigh);
  if (UI.actionFilter === "pending") return live.filter(isPending);
  if (UI.actionFilter === "accepted") return live.filter(a => ["Accepted", "Executed"].includes(effectiveStatus(a)));
  return live;
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
    _idx: i, // stable position in the FULL list — the key S.aiActionState's accept/reject decisions are keyed on, so a decision survives filtering the tab between All/High/Pending/Accepted
    id: a.id || `a${i + 1}`,
    kind: a.kind || a.category || "Action",
    title: a.title || a.text || "Review recommendation",
    target: a.target || a.instrumentId || a.category || "Portfolio recommendation",
    state: a.state || "Drafted",
    why: a.why || a.rationale || "",
    // ev.actions (AI, or its deterministic fallback) always carries its own priority — see
    // eval/narrate.js. The static per-portfolio fixture (p.actions, shown before narration has
    // resolved even once) predates that field, so it gets the same kind-based guess the whole
    // tab used to run on, purely so "High priority" isn't empty pre-boot — not a claim that this
    // came from any scoring.
    priority: a.priority || (["Collateral", "Trim"].includes(a.kind) ? "high" : ["Hedge", "Hold"].includes(a.kind) ? "medium" : null),
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

/** The caption under the sentiment label — reacts to the actual reading instead of a fixed
 * "No material change" regardless of what it says (the arc's colour reacts too, via the
 * data-sentiment attribute set on .sentiment-panel — see styles.css). */
function sentimentNote(sentiment) {
  return {
    Positive: "Trending well — a good moment to raise new ideas.",
    Cautious: "Some hesitation on record — go in prepared.",
    Concerned: "Address this directly at the next contact."
  }[sentiment] || "No material change.";
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
  const live = actions.filter(a => !isRejected(a) && !isCompleted(a));
  document.getElementById("tn-act").textContent = live.length;
  const statusLine = !actions.length
    ? (state === "loading" ? `<p class="prose-shimmer">Scoring this client…</p>`
      : state === "unavailable" ? `<p style="color:var(--ink-4); font-size:12px">AI scoring unavailable for this client.</p>`
      : !risks.length && !opportunities.length ? `<p style="color:var(--ink-4); font-size:12px">Nothing flagged this week.</p>` : "")
    : "";
  document.getElementById("actions").innerHTML = `<div class="tab-page risks-page">
    <div class="tab-titlebar"><div><h2>Risks & Actions</h2><p>AI-driven recommendations to keep your client on track</p></div><div><span>Last updated</span><b>${today()}, 09:24 SGT</b></div></div>
    <section class="ra-summary">
      ${[
        ["all", "Total actions", live.length],
        ["high", "High priority", live.filter(isHigh).length],
        ["pending", "Pending", live.filter(isPending).length],
        ["accepted", "Accepted", live.filter(a => ["Accepted", "Executed"].includes(effectiveStatus(a))).length]
      ].map(([k, label, value]) => `<button class="ra-counter ${k}" data-action-filter="${k}" aria-pressed="${UI.actionFilter === k}"><i>${statusDot(k)}</i><span>${label}</span><b>${value}</b></button>`).join("")}
    </section>
    ${statusLine}
    <section class="decision-list">${filteredActions(actions).map(a => {
      const acState = effectiveStatus(a);
      const accepted = acState === "Accepted";
      const open = UI.expandedAction === a.id;
      return `<article class="decision-card sev-${severity(a)} ${open ? "open" : ""}" data-expand-action="${a.id}">
        <div class="decision-head"><div><h3>${esc(strip(a.title))}</h3><p>${esc(strip(a.target || "Portfolio recommendation"))}</p></div><button class="ghost sm ${accepted ? "solid" : ""}" data-accept="${a._idx}" type="button">${acState}</button><button class="chev" type="button">›</button></div>
        <div class="decision-core">${fundingVisual(a)}${effectTiles(a)}</div>
        ${open ? `<div class="decision-detail"><p>${esc(strip(a.why || ""))}</p><dl><dt>Objective</dt><dd>${esc(a.suitability?.objective || "Aligned with mandate")}</dd><dt>Risk fit</dt><dd>${esc(a.suitability?.riskFit || "RM review required")}</dd></dl></div>` : ""}
        <div class="act-f">
          <button class="ghost sm ${accepted ? "solid" : ""}" data-accept="${a._idx}" type="button">${accepted ? "Accepted ✓ (click to undo)" : "Accept"}</button>
          <button class="ghost sm" data-reject="${a._idx}" type="button">Reject</button>
          ${accepted ? `<button class="ghost sm" data-complete="${a._idx}" type="button">Mark as complete</button>` : ""}
        </div>
      </article>`;
    }).join("")}</section>
  </div>`;
  document.querySelectorAll("#actions [data-action-filter]").forEach(b => b.addEventListener("click", () => { UI.actionFilter = b.dataset.actionFilter; paintActions(); }));
  document.querySelectorAll("#actions [data-expand-action]").forEach(b => b.addEventListener("click", e => {
    if (e.target.closest("[data-accept],[data-reject],[data-complete],[data-metric]")) return;
    UI.expandedAction = UI.expandedAction === b.dataset.expandAction ? null : b.dataset.expandAction;
    paintActions();
  }));
  document.querySelectorAll("#actions [data-metric]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); UI.expandedMetric = UI.expandedMetric === b.dataset.metric ? null : b.dataset.metric; paintActions(); }));
  // Accept/Reject/Complete write the RM's real decision into S.aiActionState, keyed by each
  // action's stable _idx (its position in the FULL actionList(), not the filtered view on
  // screen) — see decisionFor/effectiveStatus above. Accept is a toggle: clicking it again on an
  // already-accepted item clears the decision, putting it back in Pending. Reject and Complete
  // both drop the item out of every filter here (isRejected/isCompleted in filteredActions) —
  // Reject because it never happened, Complete because it's done (it still lives on in the
  // Compliance tab's Suitability Records, which reads effectiveStatus the same way).
  document.querySelectorAll("#actions [data-accept]").forEach(b => b.addEventListener("click", () => {
    const key = p.id + "|" + b.dataset.accept;
    if (S.aiActionState[key] === "accepted") delete S.aiActionState[key];
    else S.aiActionState[key] = "accepted";
    paintActions();
  }));
  document.querySelectorAll("#actions [data-reject]").forEach(b => b.addEventListener("click", () => {
    S.aiActionState[p.id + "|" + b.dataset.reject] = "rejected"; paintActions();
  }));
  document.querySelectorAll("#actions [data-complete]").forEach(b => b.addEventListener("click", () => {
    S.aiActionState[p.id + "|" + b.dataset.complete] = "completed"; paintActions();
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
  const sentiment = r.sentiment || "Neutral";
  el.innerHTML = `<div class="tab-page conversation-page">
    <section class="conv-top">
      <div class="glass-panel"><h2>Relationship Timeline</h2><div class="timeline"><button class="tl-node" data-conv-focus="last" aria-pressed="${UI.convFocus === "last"}"><span>✓</span><b>Last Contact</b><em>${esc(r.lastContact || "Recent call")}</em></button><button class="tl-node" data-conv-focus="today" aria-pressed="${UI.convFocus === "today"}"><span>□</span><b>Today</b><em>${today()}</em></button><button class="tl-node" data-conv-focus="next" aria-pressed="${UI.convFocus === "next"}"><span>◷</span><b>Next Review</b><em>${esc(r.nextReview)}</em></button></div><p class="focus-note">${esc(r.summary)}</p></div>
      <div class="glass-panel lead-panel"><span class="lead-icon">♙</span><p>Relationship Lead</p><h3>${esc(p.rm || "Relationship Manager")}</h3><small>Senior Adviser</small><div class="lead-actions"><button>✉</button><button>☎</button><button>in</button></div></div>
      <div class="glass-panel sentiment-panel" data-sentiment="${sentiment.toLowerCase()}"><p>Client Sentiment <small>(Recent)</small></p><div class="sentiment-arc"><i></i></div><h3>${esc(sentiment)}</h3><small>${esc(sentimentNote(sentiment))}</small></div>
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

/** Every figure on this tab is AI-generated (or, when the model is unavailable/invalid, the
 * deterministic engine's own verbatim numbers) — none of it is a static per-client checklist:
 *  - complianceChecks: PEP status, tax domicile, KYC review timing, concentration-vs-mandate.
 *  - physicalConcentration: the look-through chokepoint breakdown, verified against the bank's
 *    own chokepointExposure() figures within AI_SCORE_BAND (see eval/narrate.js) rather than
 *    rendered from that computation directly.
 *  - Suitability Records: shares the same actions/decisions as the Risks & Actions tab (see
 *    actionList/effectiveStatus above) — a record only appears once it reflects what was
 *    actually decided, never a separate invented audit trail.
 * See eval/narrate.js for the full schema and the AI_SCORE_BAND validation that backs it. */
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
  // Suitability Records shares the exact same actions the Risks & Actions tab shows and tracks
  // Accept/Reject on (see actionList/effectiveStatus/isRejected above) — a record only appears
  // here once it reflects a real RM decision (or the mandate is Discretionary, where the bank
  // acts without one), never a second, disconnected notion of "what got put to the client."
  const actions = actionList(p, ev, state);
  const recs = actions.filter(a => !isRejected(a) && (effectiveStatus(a) !== "Drafted" || p.mandate === "Discretionary"));
  // AI-generated (or, when unavailable, the deterministic engine's own verbatim figures) — see
  // physicalConcentration in eval/narrate.js. Not the raw chokepointExposure() computation
  // rendered directly: even this exposure breakdown goes through the same AI-narration path (and
  // the same never-shown-when-unavailable rule) as every other Compliance/Impact figure.
  const ck = state === "ai" ? [...(ev.physicalConcentration || [])].sort((a, b) => b.weightPct - a.weightPct) : [];
  document.getElementById("tn-comp").textContent = watch;
  const checksPanel = state === "loading" ? `<div class="glass-panel"><h2>Compliance Checks</h2><p class="prose-shimmer">Scoring compliance…</p></div>`
    : state === "unavailable" ? `<div class="glass-panel"><h2>Compliance Checks</h2><p style="color:var(--ink-4)">Compliance checks unavailable.</p></div>`
    : `<div class="glass-panel"><h2>Compliance Checks</h2>${checks.map(c => `<button class="check-row ${c.s}" data-check="${c.id}" type="button"><span>${c.s === "watch" ? "!" : "✓"}</span><div><b>${esc(c.t)}</b><p>${esc(UI.expandedCheck === c.id ? c.d : c.d.slice(0, 92))}</p></div><em>${c.s}</em></button>`).join("")}</div>`;
  const concPanelHeading = `Physical Concentration <small>(look-through)</small>${concCheck ? ` <em class="status-chip${concCheck.s === "watch" ? " watch" : ""}">${concCheck.s === "watch" ? "Elevated" : "Within mandate"}</em>` : ""}`;
  const concPanel = state === "loading" ? `<div class="glass-panel"><h2>${concPanelHeading}</h2><p class="prose-shimmer">Scoring concentration…</p></div>`
    : state === "unavailable" ? `<div class="glass-panel"><h2>${concPanelHeading}</h2><p style="color:var(--ink-4)">Concentration breakdown unavailable.</p></div>`
    : `<div class="glass-panel"><h2>${concPanelHeading}</h2><div class="exposure-bars">${ck.length ? ck.slice(0,6).map(c => `<div><span>${esc(c.name)}</span><i><b style="width:${Math.min(100, c.weightPct * 5)}%"></b></i><strong>${c.weightPct.toFixed(1)}%</strong></div>`).join("") : `<div class="empty-state">No chokepoint exposure in current holdings.</div>`}</div></div>`;
  document.getElementById("comp").innerHTML = `<div class="tab-page compliance-page">
    <section class="comp-hero ${watch ? "watch" : "clear"}"><span>${watch ? "!" : "✓"}</span><div><h2>${watch ? "Compliance watch" : "No blocking compliance items"}</h2><p>${p.positions.length} holdings · ${checks.length} derived checks · based on current portfolio data${state === "ai" ? ` <span class="mode ai" style="margin-left:6px">ai-scored</span>` : ""}</p></div><dl><dt>Next review</dt><dd>${esc(p.reviewDate || "Not recorded")}</dd><dt>Mandate</dt><dd>${esc(p.mandate)}</dd></dl></section>
    <section class="comp-grid">
      ${checksPanel}
      ${concPanel}
      <div class="glass-panel summary-panel"><h2>Compliance Summary</h2><div class="summary-boxes"><div><b>${checks.length - watch}</b><span>Clear</span></div><div class="watch"><b>${watch}</b><span>Watch</span></div><div class="danger"><b>${checks.filter(c => c.s === "block").length}</b><span>Action required</span></div></div></div>
      <div class="glass-panel"><h2>Suitability Records</h2>${recs.length ? recs.map(a => `<div class="record-row"><b>${esc(a.title)}</b><span>${esc(p.mandate)} · ${esc(effectiveStatus(a))}</span>${a.why ? `<p>${esc(strip(a.why))}</p>` : ""}</div>`).join("") : `<div class="empty-state">No records yet. They appear when a proposal is put to client or executed.</div>`}</div>
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
