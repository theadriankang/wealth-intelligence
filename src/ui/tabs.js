import { S, actionState, economics, flagged, positions } from "../store.js";
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

export function paintActions(onChange) {
  const p = S.portfolio, actions = p.actions || [], disc = p.mandate === "Discretionary";
  const counts = {
    all: actions.length,
    high: actions.filter(isHigh).length,
    pending: actions.filter(isPending).length,
    accepted: actions.filter(a => ["Accepted", "Executed"].includes(status(a))).length
  };
  document.getElementById("tn-act").textContent = counts.pending;
  const shown = filteredActions(actions);
  const markup = `<div class="tab-page actions-page">
    <div class="tab-titlebar"><div><h2>Risks & Actions</h2><p>${disc ? "Executable items under the current mandate, with audit records attached." : "Client decisions needed before execution, ordered for review."}</p></div></div>
    <div class="ra-summary">${[
      ["all", "Total actions", counts.all],
      ["high", "High priority", counts.high],
      ["pending", "Pending", counts.pending],
      ["accepted", "Accepted", counts.accepted]
    ].map(([k, t, v]) => `<button class="ra-counter" data-action-filter="${k}" aria-pressed="${UI.actionFilter === k}" type="button"><span>${t}</span><b>${v}</b></button>`).join("")}</div>
    <div class="decision-list">${shown.length ? shown.map(a => {
      const open = UI.expandedAction === a.id, st = status(a);
      return `<article class="decision-card sev-${severity(a)} ${open ? "open" : ""}" data-card-action="${a.id}">
        <div class="decision-head">
          <span class="kind k-${a.kind.toLowerCase()}">${esc(a.kind)}</span>
          <div><h3>${esc(a.title)}</h3><p>${esc(a.target)}</p></div>
          <span class="state ${st.toLowerCase()}">${esc(st)}</span>
          <button class="chev" data-expand-action="${a.id}" aria-label="Toggle action details" type="button">›</button>
        </div>
        <div class="decision-core">
          <div>${visualFor(a)}</div>
          ${effectTiles(a)}
        </div>
        ${open ? `<div class="decision-detail">
          <p>${esc(a.why)}</p>
          ${a.evidence ? `<dl>${Object.entries(a.evidence).map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === "number" ? pct(v) : v)}</dd>`).join("")}</dl>` : ""}
          ${a.suitability ? `<dl>${Object.entries(a.suitability).map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
        </div>` : ""}
        <div class="act-f">
          <button class="ghost sm" data-suit="${a.id}">Suitability record</button>
          <span class="sp">${disc ? "Mandate authority checked" : "Client instruction required where applicable"}</span>
          ${st === "Executed" ? "" : `<button class="ghost sm ${st === "Drafted" ? "solid" : ""}" data-adv="${a.id}">${disc ? "Execute" : st === "Drafted" ? "Put to client" : "Record acceptance"}</button>`}
        </div>
      </article>`;
    }).join("") : `<div class="empty-state">No actions match this filter.</div>`}</div>
  </div>`;
  document.querySelectorAll("#actions").forEach(el => { el.innerHTML = markup; });

  document.querySelectorAll("#actions").forEach(root => { root.onclick = e => {
    const filter = e.target.closest("[data-action-filter]");
    if (filter) {
      UI.actionFilter = UI.actionFilter === filter.dataset.actionFilter && filter.dataset.actionFilter !== "all" ? "all" : filter.dataset.actionFilter;
      paintActions(onChange);
      return;
    }
    const metric = e.target.closest("[data-metric]");
    if (metric) {
      UI.expandedMetric = UI.expandedMetric === metric.dataset.metric ? null : metric.dataset.metric;
      paintActions(onChange);
      return;
    }
    const adv = e.target.closest("[data-adv]");
    if (adv) {
      const a = S.portfolio.actions.find(x => x.id === adv.dataset.adv), st = actionState(a);
      if (!a) return;
      S.actionState[S.portfolio.id + a.id] = S.portfolio.mandate === "Discretionary" ? "Executed" : st === "Drafted" ? "Discussed" : "Accepted";
      onChange();
      return;
    }
    const expand = e.target.closest("[data-expand-action],[data-suit],[data-card-action]");
    if (!expand) return;
    const id = expand.dataset.expandAction || expand.dataset.suit || expand.dataset.cardAction;
    UI.expandedAction = UI.expandedAction === id ? null : id;
    paintActions(onChange);
  }; });
  M.once("actions", S.portfolio.id, M.actions);
}

function concernParts(text, i) {
  const lower = text.toLowerCase();
  const cat = lower.includes("cost") || lower.includes("premium") ? "Cost sensitivity"
    : lower.includes("liquid") || lower.includes("sale") ? "Liquidity / exit"
    : lower.includes("sell") || lower.includes("call") ? "Relationship" : "Client context";
  return { cat, title: text.split(/[.—-]/)[0].slice(0, 58), text, icon: ["!", "↗", "◇"][i % 3] };
}

export function paintConversation() {
  const p = S.portfolio, r = p.relationship;
  if (!r) { document.getElementById("conv").innerHTML = `<div class="empty-state">No relationship record for this mandate.</div>`; return; }
  const focus = {
    last: r.last ? `${r.last.topics || "No interaction detail available."}` : "No last-contact detail in the dataset.",
    today: r.behaviour || "No relationship tone summary is available in the dataset.",
    next: `Next review: ${p.reviewDate || "not scheduled in the dataset."}`
  }[UI.convFocus];
  document.getElementById("conv").innerHTML = `<div class="tab-page conversation-page">
    <section class="conv-top">
      <div class="glass-panel timeline-panel">
        <h2>Relationship Timeline</h2>
        <div class="timeline">
          ${[
            ["last", "Last Contact", r.last ? `${r.last.date} · ${r.last.channel}` : "No record"],
            ["today", "Today", TODAY],
            ["next", "Next Review", p.reviewDate || "Not scheduled"]
          ].map(([k,t,v]) => `<button class="tl-node" data-conv-focus="${k}" aria-pressed="${UI.convFocus === k}" type="button"><span></span><b>${t}</b><em>${esc(v)}</em></button>`).join("")}
        </div>
        <p class="focus-note">${esc(focus)}</p>
      </div>
      <div class="glass-panel lead-panel"><span class="lead-icon">◎</span><p>Relationship Lead</p><h3>${esc(p.rm || S.operator?.name || "Relationship Manager")}</h3><small>Senior Adviser</small></div>
      <div class="glass-panel sentiment-panel"><p>Recent Relationship Tone</p><h3>${r.behaviour ? "Recorded RM note" : "Not scored"}</h3><small>${r.behaviour ? esc(r.behaviour.slice(0, 95)) : "No sentiment history in the dataset."}</small></div>
    </section>
    <section class="glass-panel"><h2>Standing Concerns</h2><div class="concern-grid">
      ${(r.concerns || []).length ? r.concerns.map((x,i) => {
        const c = concernParts(x, i), open = UI.expandedConcern === String(i);
        return `<button class="concern-card" data-concern="${i}" type="button"><span>${c.icon}</span><div><em>${esc(c.cat)}</em><b>${esc(c.title)}</b><p>${esc(open ? c.text : c.text.slice(0, 118))}</p></div></button>`;
      }).join("") : `<div class="empty-state">No standing concerns recorded.</div>`}
    </div></section>
    <section class="brief-grid">
      <div class="glass-panel"><h2>Talking Points for Next Conversation</h2>${(r.points || []).length ? r.points.map((x,i) => `<button class="brief-row" data-point="${i}" type="button"><span>${i + 1}</span><div><b>${esc(x.split(":")[0].slice(0, 48))}</b><p>${esc(UI.expandedPoint === String(i) ? x : x.slice(0, 96))}</p></div><em>›</em></button>`).join("") : `<div class="empty-state">No talking points recorded.</div>`}</div>
      <div class="glass-panel"><h2>Likely Objections</h2>${(r.objections || []).length ? r.objections.map((o,i) => `<button class="objection-card" data-objection="${i}" type="button"><span>”</span><div><b>“${esc(o[0])}”</b>${UI.expandedObjection === String(i) ? `<p>${esc(o[1])}</p>` : `<p>Suggested response</p>`}</div><em>›</em></button>`).join("") : `<div class="empty-state">No objections or suggested responses recorded.</div>`}</div>
    </section>
  </div>`;
  document.querySelectorAll("[data-conv-focus]").forEach(b => b.addEventListener("click", () => { UI.convFocus = b.dataset.convFocus; paintConversation(); }));
  document.querySelectorAll("[data-concern]").forEach(b => b.addEventListener("click", () => { UI.expandedConcern = UI.expandedConcern === b.dataset.concern ? null : b.dataset.concern; paintConversation(); }));
  document.querySelectorAll("[data-point]").forEach(b => b.addEventListener("click", () => { UI.expandedPoint = UI.expandedPoint === b.dataset.point ? null : b.dataset.point; paintConversation(); }));
  document.querySelectorAll("[data-objection]").forEach(b => b.addEventListener("click", () => { UI.expandedObjection = UI.expandedObjection === b.dataset.objection ? null : b.dataset.objection; paintConversation(); }));
  M.once("conv", S.portfolio.id, () => M.enter("#conv .glass-panel", { y: 10, delay: 50, duration: 360 }));
}

function complianceChecks(p) {
  const cks = [];
  const actionRisk = (p.actions || []).filter(a => isHigh(a));
  cks.push({ id:"actions", t:"Recommendation policy", s:actionRisk.length ? "watch" : "clear", d:actionRisk.length ? `${actionRisk.length} high-priority recommendation${actionRisk.length > 1 ? "s" : ""} need RM acknowledgement.` : "No high-priority recommendations are open." });
  const L = p.lombard;
  if (L) cks.push({ id:"collateral", t:"Collateral headroom", s:L.headroomPct < 25 ? "watch" : "clear", d:`Headroom is ${pct(L.headroomPct)}${Number.isFinite(L.prevHeadroomPct) ? `, previously ${pct(L.prevHeadroomPct)}` : ""}.` });
  const cp = chokepointExposure(positions(), S.instruments);
  const top = Object.values(cp).sort((a,b) => b.weightPct - a.weightPct)[0];
  cks.push({ id:"physical", t:"Physical concentration", s:top?.weightPct > 20 ? "watch" : "clear", d:top ? `${top.name} represents ${top.weightPct.toFixed(1)}% of look-through exposure.` : "No chokepoint exposure in the selected scope." });
  cks.push({ id:"review", t:"Review schedule", s:p.reviewDate ? "clear" : "watch", d:p.reviewDate ? `Next review is recorded for ${p.reviewDate}.` : "No next-review date is recorded." });
  return cks;
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
