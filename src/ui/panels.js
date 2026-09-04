import { S, rows, visibleRows, goals, goal, concentration, flagCountFor, positions } from "../store.js";
import { P, LENSES, fmtD, css, BUCKETS, FUNDING_METHOD } from "./palette.js";
import { POLICY, FEED } from "../signals/fixtures/signals.js";
import { getMode } from "../signals/worldmonitor.js";
import { reconcile, HOUSE_VIEW } from "../model/houseview.js";
import * as M from "./motion.js";

/* ---------- look-through bar: the visual proof a fund is not a country ---------- */
export function lookThroughBar(inst, signals) {
  if (!inst?.exposures?.length || inst.exposures.length === 1) return "";
  const L = LENSES().d;
  const top = [...inst.exposures].sort((a, b) => b.weight - a.weight).slice(0, 6);
  return `<div class="lt">
    <div class="lt-bar">${top.map(e => {
      const s = signals[e.iso3];
      return `<i style="width:${e.weight * 100}%; background:${s ? L.col(s.riskDelta) : P.DIM}"></i>`;
    }).join("")}</div>
    <div class="lt-leg">${top.map(e => {
      const s = signals[e.iso3];
      return `<span><em style="background:${s ? L.col(s.riskDelta) : P.DIM}"></em>${e.iso3} ${(e.weight * 100).toFixed(0)}%</span>`;
    }).join("")}</div></div>`;
}

export function paintBook(onPick) {
  document.getElementById("book-n").textContent = S.portfolios.length + " mandates";
  document.getElementById("book").innerHTML = S.portfolios.map(p => {
    const n = flagCountFor(p);
    return `<button class="cl" data-cl="${p.id}" aria-current="${p.id === S.portfolio.id}">
      <span class="nm">${p.name}</span><span class="badge ${n ? "" : "zero"}">${n}</span>
      <span class="rf">${p.ref} · ${p.currency} ${p.aum}</span></button>`;
  }).join("");
  document.querySelectorAll("[data-cl]").forEach(b =>
    b.addEventListener("click", () => onPick(b.dataset.cl)));
  M.once("book", S.portfolios.length, () => M.enter("#book .cl", { y: 6, delay: 22, duration: 340 }));
}

export function paintHead(onHousehold) {
  const p = S.portfolio, L = p.lombard;
  document.getElementById("sit-head").innerHTML = `
    <h2>${p.name}</h2><span class="ref">${p.ref}</span>
    <span class="tag ${p.mandate === "Advisory" ? "adv" : "disc"}">${p.mandate} mandate</span>
    <div class="facts">
      <div class="fct"><span class="k">${S.household ? "Household" : "Account"}</span>
        <span class="v">${p.currency} ${S.household ? (p.householdAum || p.aum) : p.aum}</span></div>
      <div class="fct"><span class="k">Risk profile</span><span class="v">${p.riskProfile} · ${p.riskBand}</span></div>
      ${L ? `<div class="fct"><span class="k">Lombard headroom</span>
        <span class="v" style="color:${L.headroomPct < 25 ? P.SEV.warn : "inherit"}">${L.headroomPct}%
        <span style="color:var(--ink-4)">from ${L.prevHeadroomPct}%</span></span></div>` : ""}
      <div class="fct"><span class="k">Next review</span><span class="v">${p.reviewDate}</span></div>
      ${p.householdPositions ? `<button class="hh" id="hh-btn" aria-pressed="${S.household}">
        <span class="sw"></span>Household · ${(p.entities || []).length} entities</button>` : ""}
    </div>`;
  document.getElementById("hh-btn")?.addEventListener("click", onHousehold);
}

export function paintGoals(onPick) {
  document.getElementById("seg-goals").innerHTML = `
    <div class="seg-h"><span class="seg-n">02</span><h3>Goals at risk</h3>
      <span class="c">${S.goalSel ? "1 filtered" : goals().length + " tracked"}</span></div>
    ` + `<div class="goal-stack">` + goals().map(g => {
    const col = g.change < 0 ? P.UP[3] : g.change > 0 ? P.SEV.good : css("--ink-3");
    const bar = g.funded >= 95 ? P.SEV.good : g.funded >= 80 ? P.SEV.warn : P.UP[3];
    const bk = BUCKETS[g.bucket] || { label: "Objective", cap: "" };
    return `<button class="goal" data-g="${g.id}" aria-pressed="${S.goalSel === g.id}">
      <div class="g-top">
        <span class="bkt b-${g.bucket || "other"}" title="${bk.cap}">${bk.label}</span>
        <span class="gh">${g.horizon}</span></div>
      <div class="gn">${g.name}</div>
      <div class="gv"><span class="pct">${g.funded}%</span>
        <span class="chg" style="color:${col}">${g.change === 0 ? "no change" : fmtD(g.change) + " pts this week"}</span></div>
      <div class="track"><i style="width:${Math.min(100, g.funded)}%; background:${bar}"></i>
        <span class="prev" style="left:${Math.min(100, g.prevFunded)}%"></span></div>
      <div class="gt2"><span>${g.targetLabel}</span><span>${g.driverIds.length
        ? g.driverIds.length + " positions" : "cash-funded"}</span></div>
    </button>`;
  }).join("") + `</div>`;
  document.querySelectorAll("[data-g]").forEach(b =>
    b.addEventListener("click", () => onPick(b.dataset.g)));
  M.once("goals", S.portfolio.id + "|" + S.household, M.goals);
}

export function paintEvidence() {
  const g = S.goalSel ? goals().find(x => x.id === S.goalSel) : null;
  if (g) {
    document.getElementById("ev-k").textContent = "This goal moved";
    document.getElementById("ev-v").textContent = fmtD(g.change) + " pts";
    const drv = g.contributions.slice(0, 3).map(c => c.instrumentId).join(" · ");
    document.getElementById("ev-s").innerHTML =
      `this week, driven by<br><span style="font-family:var(--mono);color:var(--ink-2)">${drv || "no market driver"}</span>`;
    M.once("evid", "g:" + g.id + ":" + g.change, M.evidence);
    return;
  }
  const c = concentration();
  document.getElementById("ev-k").textContent = "Risk-weighted concentration";
  document.getElementById("ev-v").textContent = c.pct + "%";
  document.getElementById("ev-s").innerHTML =
    `of deteriorating exposure in three countries<br><span style="font-family:var(--mono);color:var(--ink-2)">${c.countries.join(" · ")}</span>`;
  M.once("evid", "c:" + S.portfolio.id + ":" + c.pct, M.evidence);
}

export function paintLegend() {
  const L = LENSES()[S.lens];
  document.getElementById("lg-title").textContent = L.label;
  document.getElementById("lg-cap").textContent = L.cap;
  document.getElementById("lg-ramp").innerHTML =
    L.ramp.map(c => `<span style="background:${c}"></span>`).join("");
  document.getElementById("lg-lo").textContent = L.lo;
  document.getElementById("lg-mid").textContent = L.mid;
  document.getElementById("lg-hi").textContent = L.hi;
  M.once("legend", S.lens, M.ramp);
}

export function paintTicker(feed = FEED) {
  const item = f => `<span class="tk ${f[5] ? "new" : ""}"><time>${f[0]}</time>
    <span class="sv" style="background:${P.SEV[f[4]]}"></span>
    <b>${f[2]}</b> ${f[3]} <span class="src">${f[1]}</span></span>`;
  document.getElementById("ticker").innerHTML = feed.map(item).join("") + feed.map(item).join("");
  M.tick();
  const tag = document.getElementById("mode-tag");
  const { mode } = getMode();
  tag.className = "mode " + mode;
  tag.textContent = mode === "live" ? "live feed" : mode === "fixtures" ? "fixtures" : "…";
  tag.title = mode === "fixtures"
    ? "Live feed unavailable — showing fixture data. This is stated, not hidden."
    : "Signals fetched from the live World Monitor feed.";
}

/* segment 01 — Situation: what changed overnight, house-view tension, policy radar */
export function paintSituation() {
  const sel = S.selIso ? S.signals[S.selIso] : null;
  const hv = sel ? reconcile(S.selIso, sel.riskDelta) : null;
  const held = new Set(positions().map(p => p.instrumentId));
  const digest = sel
    ? sel.events.map(e => [e.at.split(" ").slice(-1)[0], e.source, `<strong>${e.text}</strong> — ${e.value}`])
    : topEvents(3);

  document.getElementById("seg-situation").innerHTML = `
    <div class="seg-h"><span class="seg-n">01</span><h3>Situation</h3>
      <span class="c">${sel ? sel.name : "overnight"}</span></div>
    <div class="digest">${digest.map(e => `<article class="dg"><time>${e[0]}</time>
      <div><p>${e[2]}</p><span class="src">${e[1]}</span></div></article>`).join("")}</div>
    ${hv ? `<div class="hv ${hv.verdict}">
      <div class="hd"><span class="vd" style="color:${hv.verdict === "tension" ? P.SEV.warn
        : hv.verdict === "confirms" ? P.SEV.good : css("--ink-3")}">${hv.verdict}</span>
        <span class="src">House view</span></div>
      <p>${hv.line}</p>${hv.note ? `<div class="src2">“${hv.note}”</div>` : ""}
      <div class="src2">${HOUSE_VIEW.source} · as of ${HOUSE_VIEW.asOf}</div></div>` : ""}
    <div class="policy-radar">
      <div class="st-ax"><span>← easing</span><span>tightening →</span></div>
      ${POLICY.map(p => {
        const w = Math.abs(p.stance) / 3 * 50;
        const col = p.stance > 0 ? P.POL_H[p.stance >= 1.5 ? 1 : 0]
                  : p.stance < 0 ? P.POL_D[p.stance <= -1.5 ? 1 : 0] : P.FLAT;
        const hits = p.affects.filter(t => held.has(t));
        return `<article class="pl"><time>${p.date}</time><div>
          <h3>${p.who} <span style="color:var(--ink-4); font-weight:400">${p.name}</span></h3>
          <p class="ex">${p.excerpt}</p>
          <div class="stance"><div class="st-track"><i style="background:${col};
            ${p.stance > 0 ? `left:50%; width:${w}%` : `right:50%; width:${w}%`}"></i></div>
            <span class="st-lab" style="color:${col}">${p.stance > 0 ? "+" : ""}${p.stance.toFixed(1)}</span></div>
          <div class="pillrow" style="margin-top:7px">${hits.length
            ? hits.map(t => `<span class="chip"><b>holds</b>${t}</span>`).join("")
            : `<span class="chip" style="color:var(--ink-4)">no position</span>`}</div>
        </div></article>`;
      }).join("")}
    </div>`;
}

/* segment 03 — Positions under pressure (+ goal-filter notice) */
export function paintPositions({ onClearGoal, onClearSel, onOpenPosition }) {
  const L = LENSES().d, list = visibleRows(), all = rows();
  const maxw = Math.max(...all.map(r => r.weightPct));
  const g = goal();

  document.getElementById("seg-positions").innerHTML = `
    <div class="seg-h"><span class="seg-n">03</span><h3>Positions under pressure</h3>
      <span class="c">${list.length} of ${all.length}</span></div>
    ${g ? `<div class="filter-note">Showing only the positions funding
      <strong>${g.name}</strong> (${g.horizon}). The globe is filtered to match.
      <button class="ghost sm" id="clear-goal">Clear</button></div>` : ""}
    ${S.selIso ? `<div class="filter-note">Filtered to ${S.selIso}.
      <button class="ghost sm" id="clear-sel">Show all</button></div>` : ""}
    ${list.map(r => `<button class="card" data-t="${r.instrumentId}"
      style="border-left-color:${L.col(r.riskDelta)}">
      <div class="c-top"><span class="tickr">${r.instrumentId}</span>
        <span class="cname">${r.name}</span>
        <span class="delta" style="color:${L.col(r.riskDelta)}">${fmtD(r.riskDelta)}</span></div>
      <div class="c-mid">
        <span class="geo">${r.multi ? r.inst.exposures.length + " markets" : r.iso3}</span>
        ${r.assetClass !== "equity" ? `<span class="ac-badge">${r.assetClass}</span>` : ""}
        <span class="wt"><i style="width:${r.weightPct / maxw * 100}%"></i></span>
        <span class="wtv">${r.weightPct.toFixed(1)}%</span></div>
      ${lookThroughBar(r.inst, S.signals)}
    </button>`).join("")}`;

  document.getElementById("clear-goal")?.addEventListener("click", onClearGoal);
  document.getElementById("clear-sel")?.addEventListener("click", onClearSel);
  document.querySelectorAll("#seg-positions [data-t]").forEach(b =>
    b.addEventListener("click", () => onOpenPosition(b.dataset.t)));
  M.once("rail", [S.portfolio.id, S.selIso, S.goalSel, S.household].join("|"), M.rail);
}

/** The three most consequential events across the countries this book touches. */
function topEvents(n) {
  const iso = new Set(Object.keys(S.signals));
  const evs = [];
  for (const i of iso) {
    const s = S.signals[i];
    for (const e of s.events || []) evs.push({ ...e, weight: Math.abs(s.riskDelta) });
  }
  return evs.sort((a, b) => b.weight - a.weight).slice(0, n)
    .map(e => [e.at.split(" ").slice(-1)[0], e.source, `<strong>${e.text}</strong> — ${e.value}`]);
}
