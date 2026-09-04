import { S, rows, goals, flagged, positions, factsForCountries } from "../store.js";
import { P, LENSES, fmtD, css } from "./palette.js";
import { CHOKEPOINTS } from "../signals/fixtures/signals.js";
import { reconcile, HOUSE_VIEW } from "../model/houseview.js";
import { lookThroughBar } from "./panels.js";
import { generateBrief } from "../llm/client.js";
import { validateBrief, briefToHtml } from "../llm/validate.js";
import { BRIEF_SCHEMA } from "../llm/contract.js";
import { SYSTEM, buildBriefPrompt } from "../llm/prompts.js";
import { economics } from "../store.js";
import * as M from "./motion.js";

const scrim = () => document.getElementById("scrim");
const drawer = () => document.getElementById("drawer");

export function initDrawers() {
  scrim().addEventListener("click", closeDrawer);
  addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
}
export function closeDrawer() {
  drawer().classList.remove("on", "wide");
  scrim().classList.remove("on");
}
function openDrawer(html, wide = false) {
  drawer().innerHTML = html;
  drawer().querySelector(".x")?.addEventListener("click", closeDrawer);
  drawer().classList.add("on"); if (wide) drawer().classList.add("wide");
  scrim().classList.add("on");
  M.drawer(drawer());
}

export function openPosition(id) {
  const r = rows().find(x => x.instrumentId === id);
  if (!r) return;
  const L = LENSES().d, inst = r.inst;
  const gs = goals().filter(g => g.driverIds.includes(id));
  const exps = [...inst.exposures].sort((a, b) => b.weight - a.weight);
  const facts = factsForCountries(exps.map(e => e.iso3));
  const hv = reconcile(r.iso3, r.riskDelta);

  openDrawer(`
    <div class="dr-h"><div>
      <div style="display:flex; align-items:baseline; gap:9px">
        <span class="tickr" style="font-size:15px">${inst.id}</span>
        <span style="color:var(--ink-2); font-size:13px">${inst.name}</span></div>
      <div class="pillrow" style="margin-top:6px">
        <span class="chip"><b>type</b>${inst.assetClass}</span>
        <span class="chip"><b>weight</b>${r.weightPct.toFixed(1)}%</span>
        <span class="chip" style="color:${L.col(r.riskDelta)}"><b>risk Δ</b>${fmtD(r.riskDelta)}</span>
        ${r.multi ? `<span class="chip"><b>look-through</b>${exps.length} markets</span>` : ""}</div>
      </div><button class="x" aria-label="Close">×</button></div>
    <div class="dr-body">
      <section class="dr-sec"><h3>What this position funds</h3>
        ${gs.length ? gs.map(g => `<div style="display:flex; align-items:baseline; gap:10px; padding:7px 0">
          <span style="font-family:var(--mono); font-size:15px; font-weight:600; min-width:46px">${g.funded}%</span>
          <div><div style="font-size:13px">${g.name}</div>
            <div style="font-size:11.5px; color:var(--ink-4)">${g.horizon} · ${g.targetLabel} ·
              <span style="color:${g.change < 0 ? P.UP[3] : P.SEV.good}">${g.change === 0 ? "no change" : fmtD(g.change) + " pts this week"}</span>
            </div></div></div>`).join("")
          : `<p class="lede">Not currently mapped to a stated client goal.</p>`}
      </section>

      <section class="dr-sec"><h3>Country exposure${r.multi ? " — look-through" : ""}</h3>
        ${r.multi ? lookThroughBar(inst, S.signals) : ""}
        <table class="prov" style="margin-top:${r.multi ? 12 : 0}px">
          <thead><tr><th>Market</th><th>Share</th><th>Of portfolio</th><th>Risk Δ</th></tr></thead>
          <tbody>${exps.map(e => {
            const s = S.signals[e.iso3];
            return `<tr><td>${s?.name || e.iso3}${e.assumed
              ? `<div class="e">assumed from domicile</div>` : ""}</td>
              <td class="v">${(e.weight * 100).toFixed(0)}%</td>
              <td class="v">${(r.weightPct * e.weight).toFixed(2)}%</td>
              <td class="v" style="color:${s ? L.col(s.riskDelta) : "inherit"}">${s ? fmtD(s.riskDelta) : "—"}</td></tr>`;
          }).join("")}</tbody></table>
      </section>

      <section class="dr-sec"><h3>Why this is flagged</h3>
        <p class="lede">${inst.note || `No security or logistics signal is currently driving this position.`}</p>
        <div class="hv ${hv.verdict}" style="margin-top:12px">
          <div class="hd"><span class="vd" style="color:${hv.verdict === "tension" ? P.SEV.warn
            : hv.verdict === "confirms" ? P.SEV.good : css("--ink-3")}">house view · ${hv.verdict}</span></div>
          <p>${hv.line}</p>${hv.note ? `<div class="src2">“${hv.note}”</div>` : ""}
        </div>
      </section>

      <section class="dr-sec"><h3>Signal timeline</h3>
        ${facts.length ? facts.map(e => `<div class="tl-i">
          <span class="rail-dot" style="background:${L.col(r.riskDelta)}"></span>
          <div><span class="tx"><b>${e.text}</b></span>
            <div class="mt"><span class="src">${e.source}</span>
              <span style="font-family:var(--mono); font-size:10px; color:var(--ink-4)">${e.at}</span></div></div>
          <span class="vl">${e.value}</span></div>`).join("")
          : `<p class="lede">No events recorded for these markets this week.</p>`}
      </section>

      <section class="dr-sec"><h3>Physical routing</h3>
        <div class="pillrow">${inst.chokepoints?.length ? inst.chokepoints.map(k => {
          const c = CHOKEPOINTS.find(x => x.name === k);
          return `<span class="chip"><span class="dot" style="background:${
            c?.status === "strained" ? P.SEV.warn : P.SEV.none}"></span>${k}${
            c?.status === "strained" ? " · under strain" : ""}</span>`;
        }).join("") : `<span class="chip" style="color:var(--ink-4)">no chokepoint dependency mapped</span>`}</div>
      </section>

      <section class="dr-sec"><h3>Provenance</h3>
        <table class="prov"><thead><tr><th>Signal</th><th>Value</th><th>Source</th><th>Fetched</th></tr></thead>
        <tbody>${facts.map(f => `<tr><td>${f.text}<div class="e">${f.endpoint || "—"}</div></td>
          <td class="v">${f.value}</td><td>${f.source}</td><td class="v">${f.at}</td></tr>`).join("")}</tbody></table>
      </section>
    </div>`);
}

export function openPolicyTrial() {
  const scan = S.policyScan || currentPolicyScan();
  const score = scan.signal.stanceScore > 0 ? `+${scan.signal.stanceScore.toFixed(2)}`
    : scan.signal.stanceScore.toFixed(2);
  openDrawer(`
    <div class="dr-h"><div>
      <div style="font-size:15px; font-weight:600">Evidence Trial Mode</div>
      <div style="font-size:11.5px; color:var(--ink-3); margin-top:3px">
        ${scan.source.issuer} · ${scan.signal.stance} ${score} · ${scan.fetchedAt}</div>
    </div><button class="x" aria-label="Close">×</button></div>
    <div class="dr-body">
      <section class="dr-sec"><h3>Policy signal</h3>
        <p class="lede"><strong>${scan.signal.policyActionType}</strong> flagged for
        ${scan.signal.country}. ${scan.signal.whyFlagged}</p>
        <div class="pillrow" style="margin-top:12px">
          <span class="chip"><b>mode</b>${scan.mode}</span>
          <span class="chip"><b>confidence</b>${Math.round(scan.signal.confidence * 100)}%</span>
          <span class="chip"><b>urgency</b>${scan.signal.urgency}</span>
        </div>
      </section>

      <section class="dr-sec"><h3>Agent trial</h3>
        <div class="trial-list">${scan.agents.map(a => `<article class="trial-step ${a.status}">
          <div class="num">${a.status === "approved" ? "✓" : "•"}</div>
          <div><h4>${a.name}</h4><p>${a.finding}</p>
            <div class="src2">${a.evidence}</div></div>
        </article>`).join("")}</div>
      </section>

      <section class="dr-sec"><h3>RM briefing</h3>
        <div class="brief-lines">${scan.rmBrief.map((line, i) =>
          `<p><span>${i + 1}</span>${line}</p>`).join("")}</div>
      </section>

      <section class="dr-sec"><h3>Citations</h3>
        <table class="prov"><thead><tr><th>Source</th><th>Evidence</th></tr></thead>
          <tbody>${scan.citations.map(c => `<tr><td><a href="${c.url}" target="_blank" rel="noreferrer">${c.label}</a>
            <div class="e">${c.url}</div></td><td>${c.quote}</td></tr>`).join("")}</tbody></table>
      </section>

      <section class="dr-sec"><h3>Guardrail</h3>
        <p class="lede">This drawer deliberately stops at adviser intelligence. It does not create a
        client-facing recommendation, order instruction, or suitability conclusion without RM review.</p>
      </section>
    </div>`, true);
}

/* ------------------------------------------------------------------ */
/* Client note. Tries the LLM; falls back to a deterministic template.  */
/* ------------------------------------------------------------------ */
export async function openBrief() {
  const p = S.portfolio;
  openDrawer(headerHtml(p) + `<div class="dr-body"><div class="memo">
    <p style="color:var(--ink-4)">Assembling the note…</p></div></div>`, true);

  const gs = goals(), fl = flagged().map(x => ({
    ...x, instrumentId: x.instrumentId, riskDelta: x.riskDelta }));
  const isos = Object.keys(S.signals);
  const facts = factsForCountries(isos);
  const factsById = Object.fromEntries(facts.map(f => [f.id, f]));

  const prompt = buildBriefPrompt({
    portfolio: p, goals: gs, flagged: fl, facts,
    houseView: Object.entries(HOUSE_VIEW.countries)
      .map(([k, v]) => `${k}: ${v.stance}${v.note ? ` — ${v.note}` : ""}`).join("; "),
    economics: economics()
  });

  const res = await generateBrief({ system: SYSTEM, prompt, schema: BRIEF_SCHEMA });
  let body, sourceLabel;
  if (res.ok) {
    const v = validateBrief(res.data, Object.keys(factsById));
    body = `<p class="t2">${res.data.headline || ""}</p>` + briefToHtml(v.brief, factsById);
    sourceLabel = v.ok
      ? "Generated · every claim cited"
      : `Generated · ${v.dropped.length} uncited claim(s) dropped before rendering`;
  } else {
    body = templateBrief(p, gs, fl);
    sourceLabel = "Template fallback — no model available";
  }
  openDrawer(headerHtml(p, sourceLabel) + `<div class="dr-body"><div class="memo">
      <div class="mh"><p class="t">Goal review and exposure note</p>
        <dl><dt>Mandate</dt><dd>${p.name} (${p.ref}) · ${p.mandate}</dd>
          <dt>Prepared</dt><dd>04 September 2026, 08:40 SGT</dd>
          <dt>Adviser</dt><dd>${p.rm}</dd>
          <dt>Profile</dt><dd>${p.riskProfile} · target band ${p.riskBand}</dd></dl></div>
      ${body}
      <div class="disc">Advisor decision support. Prepared for internal use ahead of a client
      conversation; not investment advice, a recommendation to any third party, or an offer.
      Nothing here is sent without adviser review. Signal values are point-in-time and were
      fabricated for this prototype.</div></div>
    <div style="display:flex; gap:8px; margin-top:18px">
      <button class="ghost solid" id="copy-memo">Copy note</button>
      <button class="ghost" id="close-memo">Close</button></div></div>`, true);

  document.getElementById("close-memo").addEventListener("click", closeDrawer);
  document.getElementById("copy-memo").addEventListener("click", e => {
    navigator.clipboard?.writeText(drawer().querySelector(".memo").innerText);
    e.target.textContent = "Copied";
    setTimeout(() => { e.target.textContent = "Copy note"; }, 1600);
  });
}

const headerHtml = (p, label = "") => `
  <div class="dr-h"><div><div style="font-size:15px; font-weight:600">Client note</div>
    <div style="font-size:11.5px; color:var(--ink-3); margin-top:3px">Draft for ${p.rm} · not sent${
      label ? ` · ${label}` : ""}</div></div>
    <button class="x" aria-label="Close">×</button></div>`;

/** Deterministic version — the demo works with no API key and no network. */
function templateBrief(p, gs, fl) {
  const moved = gs.filter(g => g.change !== 0).sort((a, b) => a.change - b.change);
  return `
    <p>This note is written against your objectives rather than against the market. Of the
    ${gs.length} goals tracked for the mandate, ${moved.length} moved this week, and ${fl.length}
    ${fl.length === 1 ? "position sits" : "positions sit"} in markets whose risk profile
    deteriorated materially.</p>
    <h4>Where the goals stand</h4>
    ${moved.length ? moved.map(g => `<p><strong>${g.name}</strong> (${g.horizon}, ${g.targetLabel}):
      funding confidence ${g.change < 0 ? "fell" : "rose"} from <strong>${g.prevFunded}%</strong> to
      <strong>${g.funded}%</strong>. Largest contributor: ${g.contributions[0]?.instrumentId || "—"}.</p>`).join("")
      : `<p>No stated goal moved materially this week.</p>`}
    ${p.lombard ? `<h4>Borrowing</h4><p>Headroom on the ${p.lombard.amount} lombard facility moved from
      <strong>${p.lombard.prevHeadroomPct}%</strong> to <strong>${p.lombard.headroomPct}%</strong> as
      pledged collateral repriced. This is the item with a hard consequence attached.</p>` : ""}
    <h4>What we propose</h4>
    ${p.actions.filter(a => a.state === "Drafted").map(a =>
      `<p><strong>${a.kind} — ${a.title}.</strong> ${a.why}</p>`).join("") ||
      `<p>No action is proposed; positions are held deliberately and the rationale is on file.</p>`}`;
}
