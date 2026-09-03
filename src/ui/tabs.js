import { S, actionState, economics, flagged, positions, rows } from "../store.js";
import { P } from "./palette.js";
import { ECONOMICS_BASELINE } from "../model/scoring.js";
import { chokepointExposure } from "../model/lookthrough.js";

const COMPLY = [
  { t:"Sanctions screening", s:"ok", d:"Holdings and known counterparties screened against consolidated lists. No designations, no new listings in the last 24 hours." },
  { t:"Jurisdiction exposure", s:"watch", d:"Two holdings carry revenue exposure to a jurisdiction re-rated upward this week. Disclosure review, not a restriction." },
  { t:"PEP adjacency", s:"ok", d:"No politically exposed person identified in the beneficial ownership chain of any holding." },
  { t:"Concentration policy", s:"watch", d:"Look-through single-country exposure sits above the soft mandate limit. RM acknowledgement required at the next review." }
];

export function paintActions(onChange) {
  const p = S.portfolio, disc = p.mandate === "Discretionary";
  document.getElementById("tn-act").textContent =
    p.actions.filter(a => actionState(a) === "Drafted").length;
  document.getElementById("actions").innerHTML = `
    <p style="margin:0 0 15px; font-size:12.5px; color:var(--ink-3); line-height:1.6; max-width:62ch">
      ${disc
        ? "This is a <strong style='color:var(--ink-2)'>discretionary</strong> mandate — actions execute under standing authority and are reported to the client, with a suitability record generated at execution."
        : "This is an <strong style='color:var(--ink-2)'>advisory</strong> mandate — nothing executes without the client's decision. Each proposal carries the suitability record that must exist before it is put to them."}</p>
    ${p.actions.map(a => {
      const st = actionState(a), k = a.kind.toLowerCase();
      return `<article class="act">
        <div class="act-h"><span class="kind k-${k}">${a.kind}</span>
          <div><h3>${a.title}</h3><div class="sub">${a.target}</div></div>
          <span class="state ${st.toLowerCase()}">${st}</span></div>
        <div class="act-b"><p>${a.why}</p>
          <div class="eff">
            <div><div class="k">Effect on goal</div><div class="v">${a.effect[0]}</div></div>
            <div><div class="k">Cost</div><div class="v">${a.effect[1]}</div></div>
            <div><div class="k">Tax</div><div class="v">${a.effect[2]}</div></div>
          </div></div>
        <div class="suit" id="suit-${a.id}" hidden>
          <dl><dt>Objective</dt><dd>${a.suitability.objective}</dd>
            <dt>Risk fit</dt><dd>${a.suitability.riskFit}</dd>
            <dt>Knowledge</dt><dd>${a.suitability.knowledge}</dd>
            <dt>Concentration</dt><dd>${a.suitability.concentration}</dd>
            <dt>Costs</dt><dd>${a.suitability.costs}</dd></dl>
          <div class="stamp">Record generated automatically · ${p.ref} · 04 Sep 2026 08:40 SGT · ${p.rm}</div>
        </div>
        <div class="act-f">
          <button class="ghost sm" data-suit="${a.id}">Suitability record</button>
          <span class="sp">${disc
            ? (st === "Executed" ? "Executed under standing authority" : "Executable without client instruction")
            : st === "Drafted" ? "Requires client decision before execution"
            : st === "Discussed" ? "Raised with the client — awaiting decision" : "Client accepted"}</span>
          ${st === "Executed" ? "" : `<button class="ghost sm ${st === "Drafted" ? "solid" : ""}"
            data-adv="${a.id}">${disc ? "Execute" : st === "Drafted" ? "Put to client" : "Record acceptance"}</button>`}
        </div></article>`;
    }).join("")}`;

  document.querySelectorAll("[data-suit]").forEach(b => b.addEventListener("click", () => {
    const el = document.getElementById("suit-" + b.dataset.suit);
    el.hidden = !el.hidden;
    b.textContent = el.hidden ? "Suitability record" : "Hide record";
  }));
  document.querySelectorAll("[data-adv]").forEach(b => b.addEventListener("click", () => {
    const a = S.portfolio.actions.find(x => x.id === b.dataset.adv), st = actionState(a);
    S.actionState[S.portfolio.id + a.id] = S.portfolio.mandate === "Discretionary"
      ? "Executed" : st === "Drafted" ? "Discussed" : "Accepted";
    onChange();
  }));
}

export function paintConversation() {
  const r = S.portfolio.relationship;
  if (!r) { document.getElementById("conv").innerHTML =
    `<div class="blk"><p>No relationship record for this mandate.</p></div>`; return; }
  document.getElementById("conv").innerHTML = `
    <div class="blk"><h3>Relationship</h3>
      <div class="meta-row" style="margin-bottom:11px">
        <div class="fct"><span class="k">Last contact</span><span class="v">${r.last.date} · ${r.last.channel}</span></div>
        <div class="fct"><span class="k">Next review</span><span class="v">${S.portfolio.reviewDate}</span></div>
        <div class="fct"><span class="k">Adviser</span><span class="v">${S.portfolio.rm}</span></div></div>
      <p><strong style="color:var(--ink)">Discussed:</strong> ${r.last.topics}</p>
      <p>${r.behaviour}</p></div>
    <div class="blk"><h3>Standing concerns</h3>
      ${r.concerns.map(x => `<div class="tp"><span class="num">·</span><p>${x}</p></div>`).join("")}</div>
    <div class="blk"><h3>Talking points for the next conversation</h3>
      ${r.points.map((x, i) => `<div class="tp"><span class="num">${i + 1}</span><p>${x}</p></div>`).join("")}</div>
    <div class="blk"><h3>Likely objections</h3>
      ${r.objections.map(o => `<div class="obj"><p class="q">“${o[0]}”</p><p class="a">${o[1]}</p></div>`).join("")}</div>`;
}

export function paintCompliance() {
  const p = S.portfolio;
  document.getElementById("tn-comp").textContent = COMPLY.filter(c => c.s === "watch").length;
  const recs = p.actions.filter(a => actionState(a) !== "Drafted" || p.mandate === "Discretionary");
  const ck = chokepointExposure(positions(), S.instruments);
  document.getElementById("comp").innerHTML = `
    <div class="comp-hero"><span class="ic">✓</span>
      <div><h3>Screening clear</h3>
        <p>${p.positions.length} holdings · 41 counterparties · last run 04:12 SGT</p></div></div>
    <div class="blk"><h3>Checks</h3>
      ${COMPLY.map(c => `<div class="crow"><span class="t">${c.t}</span>
        <span class="s ${c.s}">${c.s === "ok" ? "clear" : "watch"}</span>
        <span class="d">${c.d}</span></div>`).join("")}</div>
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
}

/** The operating-leverage tab: what this saves, stated as assumptions, not claims. */
export function paintEconomics() {
  const e = economics(), f = flagged().length;
  document.getElementById("econ").innerHTML = `
    <p style="margin:0 0 15px; font-size:12.5px; color:var(--ink-3); line-height:1.6; max-width:64ch">
      Julius Baer's stated target is an adjusted cost/income ratio below 67% by 2028, so the
      question a tool like this has to answer is not “is it clever” but “does the adviser cover
      more clients at the same quality”. These are the numbers that answer it.</p>
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
    <div class="blk"><h3>Prepare once, deliver many</h3>
      <p>This morning's Taiwan signal touches <strong style="color:var(--ink)">${e.affected} of ${e.clients}</strong>
      mandates in the book. The underlying analysis is done once; what differs per client is the
      goal it threatens and the conversation it needs. That ratio is the whole operating-leverage
      argument — and it improves as the book grows, which a per-client dashboard does not.</p>
      <p style="color:var(--ink-4); font-size:12px">${e.note} Change them in
      <code style="font-family:var(--mono)">src/model/scoring.js</code>.</p></div>
    <div class="blk"><h3>What the adviser stops doing</h3>
      ${[["Assembling context", "Reading four sources and reconciling them by hand before each review."],
         ["Missing the link", "Noticing that three holdings and a fund sleeve share one strait — currently nobody's job."],
         ["Writing the file note", "The suitability record is generated as a by-product of the recommendation."],
         ["Triaging by memory", "The book is ordered by what actually moved, not by who called last."]]
        .map(x => `<div class="tp"><span class="num">·</span><p><strong style="color:var(--ink)">${x[0]}.</strong> ${x[1]}</p></div>`).join("")}</div>`;
}
