import { S, actionState, economics, positions, aiState } from "../store.js";
import { P } from "./palette.js";
import { ECONOMICS_BASELINE } from "../model/scoring.js";
import { chokepointExposure } from "../model/lookthrough.js";
import * as M from "./motion.js";

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

/** Compliance checks — AI-generated per client from real CSV facts (PEP status, tax domicile,
 * KYC review date, look-through concentration against the mandate's bands), not the generic
 * fixed checklist every client used to see. Deterministic fallback when the model is unavailable
 * or invalid draws on the same facts (fallbackComplianceChecks in eval/narrate.js) rather than
 * inventing a screening result. The chokepoint table and suitability-record table below are
 * unrelated deterministic data (look-through math, the static per-portfolio action list) and are
 * untouched. */
export function paintCompliance() {
  const p = S.portfolio;
  const ev = S.evaluation?.clients?.[p.id];
  const state = aiState(p.id);
  const checks = state === "ai" ? (ev.complianceChecks || []) : [];
  document.getElementById("tn-comp").textContent = checks.filter(c => c.status === "watch").length;
  const recs = p.actions.filter(a => actionState(a) !== "Drafted" || p.mandate === "Discretionary");
  const ck = chokepointExposure(positions(), S.instruments);
  const checksBlock = state === "loading" ? `<p class="prose-shimmer">Scoring compliance…</p>`
    : state === "unavailable" ? `<p style="color:var(--ink-4); font-size:12px">Compliance checks unavailable.</p>`
    : checks.map(c => `<div class="crow"><span class="t">${c.item}</span>
        <span class="s ${c.status === "clear" ? "ok" : "watch"}">${c.status}</span>
        <span class="d">${c.detail}</span></div>`).join("");
  document.getElementById("comp").innerHTML = `
    <div class="comp-hero"><span class="ic">✓</span>
      <div><h3>Screening clear</h3>
        <p>${p.positions.length} holdings across the mandate${state === "ai" ? ` <span class="mode ai" style="margin-left:6px">ai-scored</span>` : ""}</p></div></div>
    <div class="blk"><h3>Checks</h3>${checksBlock}</div>
    <div class="blk"><h3>Physical concentration (look-through)</h3>
      <table class="prov"><thead><tr><th>Chokepoint</th><th>Capital behind it</th><th>Via</th></tr></thead>
      <tbody>${Object.values(ck).sort((a, b) => b.weightPct - a.weightPct).map(c =>
        `<tr><td>${c.name}</td><td class="v">${c.weightPct.toFixed(1)}%</td>
         <td class="e">${c.instrumentIds.join(" ")}</td></tr>`).join("")}</tbody></table></div>
    <div class="blk"><h3>Suitability records generated</h3>
      <table class="prov"><thead><tr><th>Action</th><th>Mandate</th><th>State</th><th>Generated</th></tr></thead>
      <tbody>${recs.length ? recs.map(a => `<tr><td>${a.title}<div class="e">${a.target}</div></td>
        <td>${p.mandate}</td><td class="v">${actionState(a)}</td><td class="v">04 Sep 08:40</td></tr>`).join("")
        : `<tr><td colspan="4" style="color:var(--ink-4)">No records yet — generated when a proposal is put to the client or executed.</td></tr>`}</tbody></table></div>`;
  M.once("comp", p.id + "|" + state, () => {
    M.enter("#comp .comp-hero, #comp .blk", { y: 10, delay: 60, duration: 420 });
    M.enter("#comp .crow", { y: 5, delay: 26, duration: 340, from: 120 });
  });
}

/** The operating-leverage tab. The numeric tiles are a book-wide deterministic formula
 * (rmEconomics — legitimate arithmetic, not a claim about any one client, so it stays
 * deterministic). The opening paragraph is now AI-generated and client-specific instead —
 * what THIS mandate concretely involves this review, grounded only in this client's own facts,
 * never the generic "Julius Baer's stated target" copy every client used to see. */
export function paintEconomics() {
  const p = S.portfolio;
  const e = economics();
  const ev = S.evaluation?.clients?.[p.id];
  const state = aiState(p.id);
  const impactBlock = state === "ai"
    ? `<p>${ev.impactNarrative} <span class="mode ai" style="margin-left:6px">ai-scored</span></p>`
    : state === "loading" ? `<p class="prose-shimmer">Scoring this client's impact…</p>`
    : `<p style="color:var(--ink-4); font-size:12px">Impact narrative unavailable.</p>`;
  document.getElementById("econ").innerHTML = `
    <div class="blk"><h3>This client</h3>${impactBlock}</div>
    <div class="econ">
      <div><div class="k">Clients in the book</div><div class="v">${e.clients}</div>
        <div class="s">${e.affected} affected by this week's signals</div></div>
      <div><div class="k">Prep per review</div><div class="v">${e.prepBefore}→${e.prepAfter}<span style="font-size:13px"> min</span></div>
        <div class="s">Reading and editing a prepared brief instead of assembling one</div></div>
      <div><div class="k">Saved this morning</div><div class="v">${e.minutesSavedNow}<span style="font-size:13px"> min</span></div>
        <div class="s">Across the ${e.affected} mandates that moved</div></div>
      <div><div class="k">Adviser hours per year</div><div class="v">${e.hoursPerYear}</div>
        <div class="s">At ${ECONOMICS_BASELINE.reviewsPerClientPerYear} reviews per client per year</div></div>
    </div>
    <div class="blk"><h3>What the adviser stops doing</h3>
      ${[["Assembling context", "Reading four sources and reconciling them by hand before each review."],
         ["Missing the link", "Noticing that three holdings and a fund sleeve share one strait — currently nobody's job."],
         ["Writing the file note", "The suitability record is generated as a by-product of the recommendation."],
         ["Triaging by memory", "The book is ordered by what actually moved, not by who called last."]]
        .map(x => `<div class="tp"><span class="num">·</span><p><strong style="color:var(--ink)">${x[0]}.</strong> ${x[1]}</p></div>`).join("")}</div>`;
  M.once("econ", p.id + "|" + state + "|" + e.affected, () => {
    M.economics();
    M.enter("#econ .blk", { y: 10, delay: 70, duration: 420, from: 160 });
  });
}
