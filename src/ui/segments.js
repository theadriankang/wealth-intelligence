/**
 * The client-facing half of the spine: Explanation (01), Analysis (03), Actions (04).
 * Every segment reads `clientEval()` — the pure evaluation — and renders it. No args.
 * Situation (02) stays in panels.js: it is the global picture, not a per-client read.
 */
import { S, clientEval } from "../store.js";
import { openPortfolioDetail } from "./drawers.js";
import { URGENT_CUTOFF } from "../eval/rubric.js";

const shimmer = `<span class="prose-shimmer">…</span>`;
const citeChip = n => `<span class="cite-chip">${n} cite${n === 1 ? "" : "s"}</span>`;

export function paintExplanation() {
  const e = clientEval();
  const el = document.getElementById("seg-explanation");
  if (!el) return;
  if (!e) { el.innerHTML = `<div class="seg-h"><h3>Explanation</h3></div><p class="muted">evaluating…</p>`; return; }
  const p = S.portfolio;
  const goals = (p.goals || []).slice(0, 3);
  const topPos = [...p.positions].sort((a, b) => b.weightPct - a.weightPct).slice(0, 3);
  el.innerHTML = `
    <div class="seg-h"><span class="seg-n">01</span><h3>Explanation</h3>
      <span class="c">${p.mandate} · ${p.riskBand}</span></div>
    <div class="health"><div class="health-dial health-${e.healthBand}"><span>${Math.round(e.health)}</span></div>
      <div><div class="health-band">${e.healthBand}</div>
        <div class="health-drivers">${e.drivers.slice(0, 3).map(d => `<span>${d.label}</span>`).join("")}</div></div></div>
    <p class="prose">${e.thesis ?? shimmer}</p>
    <p class="prose">${e.summary ?? shimmer}</p>
    <div class="rollup">
      <div><h4>Goals</h4>${goals.map(g => `<div class="ru"><span>${g.name}</span><span>${g.baseFunded}%</span></div>`).join("")}</div>
      <div><h4>Top positions</h4>${topPos.map(x => `<div class="ru"><span>${x.instrumentId}</span><span>${x.weightPct.toFixed(1)}%</span></div>`).join("")}</div>
    </div>
    <button class="ghost sm" id="open-portfolio">Full portfolio</button>`;
  document.getElementById("open-portfolio").addEventListener("click", () => openPortfolioDetail());
}

export function paintAnalysis() {
  const e = clientEval();
  const el = document.getElementById("seg-analysis");
  if (!el) return;
  if (!e) { el.innerHTML = `<div class="seg-h"><h3>Analysis</h3></div><p class="muted">evaluating…</p>`; return; }
  const row = it => `<li class="finding urg-${it.urgency >= URGENT_CUTOFF ? "hi" : "lo"}">
    <span class="sev sev-${it.severity}"></span><span class="ftext">${it.text}</span>
    <span class="upip" title="urgency ${Math.round(it.urgency)}">${Math.round(it.urgency)}</span>${citeChip(it.cite.length)}</li>`;
  el.innerHTML = `
    <div class="seg-h"><span class="seg-n">03</span><h3>Analysis</h3>
      <span class="c">${e.risks.length} risks · ${e.opportunities.length} opportunities</span></div>
    ${e.risks.length ? `<h4>Risks</h4><ul class="findings">${e.risks.map(row).join("")}</ul>` : ""}
    ${e.opportunities.length ? `<h4>Opportunities</h4><ul class="findings">${e.opportunities.map(row).join("")}</ul>` : ""}
    ${!e.risks.length && !e.opportunities.length ? `<p class="muted">Nothing flagged this week.</p>` : ""}`;
}

export function paintActions() {
  const e = clientEval();
  const el = document.getElementById("seg-actions");
  if (!el) return;
  if (!e) { el.innerHTML = `<div class="seg-h"><h3>Actions</h3></div><p class="muted">evaluating…</p>`; return; }
  const sorted = [...e.actions].sort((a, b) => b.urgency - a.urgency);
  const urgent = sorted.filter(a => a.urgency >= URGENT_CUTOFF);
  const rest = sorted.filter(a => a.urgency < URGENT_CUTOFF);
  const row = a => `<article class="action act-${a.kind}" data-action="${a.id}">
    <div class="a-top"><span class="a-kind">${a.kind.replace(/-/g, " ")}</span>
      <span class="a-class">${a.mandateClass.replace(/-/g, " ")}</span>
      <span class="upip">${Math.round(a.urgency)}</span></div>
    <p class="a-text">${a.text}</p>
    <p class="a-reason">${a.reason}</p>
    <span class="cite-chip">${a.cite.length} cite${a.cite.length === 1 ? "" : "s"}</span></article>`;
  el.innerHTML = `
    <div class="seg-h"><span class="seg-n">04</span><h3>Actions</h3><span class="c">RM to-dos</span></div>
    <p class="disclaimer-line">RM actions — not client-facing advice.</p>
    ${urgent.length ? `<h4 class="urgent-head">Urgent</h4>${urgent.map(row).join("")}` : ""}
    ${rest.map(row).join("")}
    ${!sorted.length ? `<p class="muted">No actions this week.</p>` : ""}`;
}
