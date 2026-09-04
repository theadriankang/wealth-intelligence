import { S, actionState } from "../store.js";

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
