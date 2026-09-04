import { S, actionState, economics, flagged, positions } from "../store.js";
import { ECONOMICS_BASELINE } from "../model/scoring.js";
import { chokepointExposure } from "../model/lookthrough.js";

const COMPLY = [
  { t:"Sanctions screening", s:"ok", d:"Holdings and known counterparties screened against consolidated lists. No designations, no new listings in the last 24 hours." },
  { t:"Jurisdiction exposure", s:"watch", d:"Two holdings carry revenue exposure to a jurisdiction re-rated upward this week. Disclosure review, not a restriction." },
  { t:"PEP adjacency", s:"ok", d:"No politically exposed person identified in the beneficial ownership chain of any holding." },
  { t:"Concentration policy", s:"watch", d:"Look-through single-country exposure sits above the soft mandate limit. RM acknowledgement required at the next review." }
];

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
