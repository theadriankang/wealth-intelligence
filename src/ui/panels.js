import { S, rows, visibleRows, goals, goal, concentration, flagCountFor, positions, flagged } from "../store.js";
import { P, LENSES, fmtD, css, BUCKETS, FUNDING_METHOD } from "./palette.js";
import { POLICY, FEED } from "../signals/fixtures/signals.js";
import { getMode } from "../signals/worldmonitor.js";
import { reconcile, HOUSE_VIEW } from "../model/houseview.js";
import { currentPolicyScan } from "../policy/sentinel.js";
import * as M from "./motion.js";

const SCALE = { total:20 };
export const RISK_THRESHOLDS = { critical:80, high:60, medium:35 };

function riskLevelFor(score) {
  if (score >= RISK_THRESHOLDS.critical) return "critical";
  if (score >= RISK_THRESHOLDS.high) return "high";
  if (score >= RISK_THRESHOLDS.medium) return "medium";
  return "low";
}

function sidebarScore(p, meta) {
  const b = meta.breakdown || {};
  let score = meta.urgency
    + (b.collateralRisk || 0) * 2.4
    + (b.liquidityRisk || 0) * 1.2
    + (b.mandateRisk || 0) * 1.1
    + (b.complianceRisk || 0) * 1.4
    + (meta.fl?.length || 0) * 6;
  if (meta.ltv) score = Math.max(score, 68);
  if (meta.dueSoon) score = Math.max(score, 45);
  if (p.riskProfile === "Dynamic Opportunistic") score += 8;
  return Math.min(100, Math.round(score));
}

function aiInsight(meta) {
  if (meta.band === "critical") return meta.ltv ? "AI ALERT: Margin Call Risk" : "AI ALERT: Urgent Rebalance";
  if (meta.band === "high") return meta.driver === "Collateral/Leverage" ? "AI INSIGHT: Risk Limit Warning" : `AI INSIGHT: ${meta.driver} Pressure`;
  if (meta.band === "medium") return meta.dueSoon ? "AI NOTICE: Annual Review Due" : `AI NOTICE: ${meta.driver} Watch`;
  if (/No urgent/i.test(meta.reason)) return "AI: Healthy Portfolio";
  return "AI: Stable Portfolio";
}

function aumNumber(p) {
  if (Number.isFinite(p.jb?.totalUsd)) return p.jb.totalUsd;
  const m = String(p.aum || "").match(/([\d.]+)\s*m/i);
  return m ? Number(m[1]) * 1e6 : 0;
}

function sortClients(list, metas) {
  const riskRank = { critical:4, high:3, medium:2, low:1 };
  return list.sort((a, b) => {
    const am = metas.get(a.id), bm = metas.get(b.id);
    const as = sidebarScore(a, am), bs = sidebarScore(b, bm);
    const ar = riskLevelFor(as), br = riskLevelFor(bs);
    switch (S.clientSort || "urgency-desc") {
      case "aum-desc": return aumNumber(b) - aumNumber(a);
      case "name-asc": return a.name.localeCompare(b.name);
      case "review-asc": return String(a.reviewDate || "").localeCompare(String(b.reviewDate || ""));
      case "risk-desc": return riskRank[br] - riskRank[ar] || bs - as;
      default: return bs - as || String(a.reviewDate || "").localeCompare(String(b.reviewDate || ""));
    }
  });
}

function clientCard(p, m) {
  const score = sidebarScore(p, m);
  const riskLevel = riskLevelFor(score);
  return `<button class="cl rm-client ${riskLevel}" data-cl="${p.id}" aria-current="${p.id === S.portfolio.id}">
    <span class="client-accent" aria-hidden="true"></span>
    <span class="client-top"><span class="nm">${p.name}</span><span class="client-aum">${p.aum}</span></span>
    <span class="client-meta">Mandate: ${p.riskProfile}</span>
    <span class="client-insight"><span class="score-pill">${score}</span><span>${aiInsight({ ...m, band:riskLevel })}</span><span class="chev">›</span></span>
  </button>`;
}

export function lookThroughBar(inst, signals) {
  if (!inst?.exposures?.length || inst.exposures.length === 1) return "";
  const L = LENSES().d;
  const top = [...inst.exposures].sort((a, b) => b.weight - a.weight).slice(0, 6);
  return `<div class="lt"><div class="lt-bar">${top.map(e => {
    const s = signals[e.iso3];
    return `<i style="width:${e.weight * 100}%; background:${s ? L.col(s.riskDelta) : P.DIM}"></i>`;
  }).join("")}</div><div class="lt-leg">${top.map(e => {
    const s = signals[e.iso3];
    return `<span><em style="background:${s ? L.col(s.riskDelta) : P.DIM}"></em>${e.iso3} ${(e.weight * 100).toFixed(0)}%</span>`;
  }).join("")}</div></div>`;
}

function withPortfolio(p, fn) {
  const old = S.portfolio;
  const oldScope = S.clientScopeId;
  S.portfolio = p;
  S.clientScopeId = p.id;
  try { return fn(); } finally { S.portfolio = old; S.clientScopeId = oldScope; }
}

function clientHasIso(p, iso) {
  if (!iso) return true;
  return (p.positions || []).some(pos =>
    S.instruments[pos.instrumentId]?.exposures?.some(e => e.iso3 === iso));
}

function clientMeta(p) {
  return withPortfolio(p, () => {
    const fl = flagged();
    const gs = goals();
    const dueSoon = /09 Sep|18 Sep/i.test(p.reviewDate);
    const ltv = p.lombard?.headroomPct && p.lombard.headroomPct < 30;
    const affected = [...new Set((p.positions || []).flatMap(pos =>
      S.instruments[pos.instrumentId]?.exposures?.map(e => e.iso3) || []))]
      .filter(iso => (S.signals[iso]?.riskDelta || 0) >= 6).slice(0, 3);
    const concentrationRisk = Math.min(15, Math.round(Math.max(...(p.positions || []).map(x => x.weightPct || 0), 0)));
    const liquidityRisk = Math.min(25, Math.round(((p.meta?.nearCashNeeds || 0) + (p.meta?.privateCommitments || 0)) ? 25 - Math.min(22, (p.meta?.dailyLiquidityPct || 0) / 3) : 4));
    const collateralRisk = p.lombard ? Math.max(0, Math.min(25, Math.round(25 - (p.lombard.headroomPct || 0) * .8))) : 0;
    const mandateRisk = Math.min(20, Math.round(fl.length * 4 + (p.mandate === "Execution only" ? 4 : 0)));
    const complianceRisk = Math.min(10, dueSoon ? 10 : /Sep|Oct|Nov/i.test(p.reviewDate) ? 5 : 1);
    const eventRisk = Math.min(5, affected.length * 2 + (p.meta?.eventCount ? 1 : 0));
    const breakdown = { collateralRisk, liquidityRisk, mandateRisk, concentrationRisk, complianceRisk, eventRisk };
    const score = Math.min(100, Math.round(Object.values(breakdown).reduce((s, v) => s + v, 0)));
    const band = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
    const worst = fl[0];
    const reason = ltv && p.lombard.currentLtv ? `LTV ${p.lombard.currentLtv.toFixed(2)}% vs ${p.lombard.marginCallLtv.toFixed(0)}% trigger`
      : ltv ? `Collateral headroom at ${p.lombard.headroomPct}%`
      : worst ? `${worst.instrumentId} pressure +${worst.riskDelta.toFixed(0)}`
      : dueSoon ? `Review due ${p.reviewDate}` : "No urgent client action";
    const driver = ltv ? "Collateral/Leverage"
      : liquidityRisk >= 18 ? "Liquidity"
      : mandateRisk >= 12 ? "Mandate/Suitability"
      : concentrationRisk >= 12 ? "Concentration"
      : complianceRisk >= 8 ? "Compliance/KYC"
      : eventRisk >= 3 ? "Event Exposure" : "Concentration";
    const next = band === "critical" ? "Open review" : dueSoon ? "Prepare brief" : ltv ? "Check collateral" : "Monitor";
    const source = p.sourceOfWealth ? p.sourceOfWealth.split(" - ")[0] : "Private client";
    return { fl, gs, dueSoon, ltv, affected, urgency:score, band, category:band, reason, driver, next, source, breakdown };
  });
}

function initials(name) {
  return String(name || "RM").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
}

function reviewDateLabel(date) {
  const d = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) return date || "Not scheduled";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

function urgentReviewCard({ p, m }, index, total) {
  const score = sidebarScore(p, m);
  const band = riskLevelFor(score);
  const badge = band === "critical" ? "Critical attention" : band === "high" ? "High attention" : band === "medium" ? "Medium attention" : "Low attention";
  return `<article class="urgent-swipe-card ${band}" data-urgent-card>
    <div class="urgent-card-top"><span class="attention-badge ${band}"><i></i>${badge}</span><span>${index + 1} / ${total}</span></div>
    <div class="profile-avatar">${initials(p.name)}</div>
    <h3>${p.name}</h3>
    <p class="client-type">${m.source}</p>
    <div class="profile-facts">
      <div><span>AUM</span><b>${p.currency || ""} ${p.aum}</b></div>
      <div><span>Mandate</span><b>${p.riskProfile || p.mandate}</b></div>
    </div>
    <button class="risk-callout ${band}" data-cl="${p.id}">
      <b>${score}</b><span><strong>${aiInsight({ ...m, band })}</strong>${m.reason}</span><em>›</em>
    </button>
    <div class="next-review"><span>▣</span><div><small>Next Review</small><b>${reviewDateLabel(p.reviewDate)}</b></div></div>
    <button class="open-review" data-cl="${p.id}">Open client review <span>→</span></button>
  </article>`;
}

function clientMatches(p, meta) {
  const filter = S.clientFilter || "all";
  const q = (S.clientSearch || "").trim().toLowerCase();
  const hay = [p.name, p.ref, meta.source, p.countryOfResidence, p.bookingCentre, p.currency].join(" ").toLowerCase();
  if (q && !hay.includes(q)) return false;
  if (filter !== "all" && riskLevelFor(sidebarScore(p, meta)) !== filter) return false;
  if (S.driverFilter !== "all" && meta.driver !== S.driverFilter) return false;
  if (S.profileFilter !== "all" && p.riskProfile !== S.profileFilter) return false;
  if (S.bookingFilter !== "all" && p.bookingCentre !== S.bookingFilter) return false;
  if (S.aumFilter === "hnw" && p.wealthBand !== "HNW") return false;
  if (S.aumFilter === "uhnw" && p.wealthBand !== "UHNW") return false;
  if (S.selIso && !clientHasIso(p, S.selIso)) return false;
  return true;
}

export function paintBook(onPick) {
  const metas = new Map(S.portfolios.map(p => [p.id, clientMeta(p)]));
  const filtered = sortClients(S.portfolios.filter(p => clientMatches(p, metas.get(p.id))), metas);
  document.getElementById("book-n").textContent = `${SCALE.total} synthetic clients`;
  document.getElementById("book-foot").innerHTML = `<span>Showing ${Math.min(filtered.length, 5)} of ${S.portfolios.length} clients</span><button id="view-all-clients">View all clients →</button>`;
  const input = document.getElementById("client-search");
  if (input && input.value !== S.clientSearch) input.value = S.clientSearch;
  document.querySelectorAll("#client-filters [data-filter]").forEach(b =>
    b.setAttribute("aria-pressed", String((S.clientFilter || "all") === b.dataset.filter)));
  const sort = document.getElementById("client-sort");
  if (sort) sort.value = S.clientSort || "urgency-desc";
  const fp = document.getElementById("filter-panel");
  if (fp) fp.hidden = !S.filtersOpen;
  const ft = document.getElementById("filter-toggle");
  if (ft) ft.setAttribute("aria-expanded", String(!!S.filtersOpen));
  for (const [id, value] of [["risk-popover-filter", S.clientFilter], ["driver-filter", S.driverFilter], ["profile-filter", S.profileFilter], ["booking-filter", S.bookingFilter], ["aum-filter", S.aumFilter]]) {
    const el = document.getElementById(id);
    if (el) el.value = value || "all";
  }
  const active = activeClientFilters();
  document.getElementById("book").innerHTML = filtered.map(p => clientCard(p, metas.get(p.id))).join("") ||
    `<div class="empty-state">No clients match ${active.length ? active.join(" · ") : "the current search"}.</div>`;
  document.querySelectorAll("[data-cl]").forEach(b => b.addEventListener("click", () => onPick(b.dataset.cl)));
  document.querySelectorAll("#client-filters [data-filter]").forEach(b => b.addEventListener("click", () => { S.clientFilter = b.dataset.filter; paintBook(onPick); }));
  document.getElementById("filter-toggle")?.addEventListener("click", () => { S.filtersOpen = !S.filtersOpen; paintBook(onPick); });
  document.getElementById("client-sort")?.addEventListener("change", e => { S.clientSort = e.target.value; paintBook(onPick); });
  document.getElementById("risk-popover-filter")?.addEventListener("change", e => { S.clientFilter = e.target.value; paintBook(onPick); });
  document.getElementById("view-all-clients")?.addEventListener("click", () => {
    S.clientFilter = "all"; S.clientSearch = ""; S.driverFilter = "all"; S.profileFilter = "all"; S.bookingFilter = "all"; S.aumFilter = "all"; paintBook(onPick);
  });
  document.getElementById("clear-client-filters")?.addEventListener("click", () => {
    S.clientFilter = "all"; S.clientSearch = ""; S.driverFilter = "all"; S.profileFilter = "all"; S.bookingFilter = "all"; S.aumFilter = "all"; paintBook(onPick);
  });
  for (const [id, key] of [["driver-filter", "driverFilter"], ["profile-filter", "profileFilter"], ["booking-filter", "bookingFilter"], ["aum-filter", "aumFilter"]]) {
    document.getElementById(id)?.addEventListener("change", e => { S[key] = e.target.value; paintBook(onPick); });
  }
  document.getElementById("client-search")?.addEventListener("input", e => { S.clientSearch = e.target.value; paintBook(onPick); });
  M.once("book", filtered.map(p => p.id).join("|") + S.clientFilter, () => M.enter("#book .cl", { y: 6, delay: 22, duration: 340 }));
}

function activeClientFilters() {
  return [
    (S.clientFilter || "all") !== "all" && `Band: ${S.clientFilter}`,
    S.driverFilter !== "all" && `Driver: ${S.driverFilter}`,
    S.profileFilter !== "all" && `Profile: ${S.profileFilter}`,
    S.bookingFilter !== "all" && `Booking: ${S.bookingFilter}`,
    S.aumFilter !== "all" && `AUM: ${S.aumFilter.toUpperCase()}`,
    S.clientSearch?.trim() && `Search: ${S.clientSearch.trim()}`
  ].filter(Boolean);
}

export function paintHead(onHousehold) {
  const p = S.portfolio, L = p.lombard;
  const meta = clientMeta(p);
  document.getElementById("client-head").innerHTML = `
    <h2>${p.name}</h2><span class="ref">${p.ref}</span><span class="ref">${meta.source}</span>
    <span class="tag ${p.mandate === "Advisory" ? "adv" : "disc"}">${p.mandate} mandate</span>
    <div class="facts">
      <div class="fct"><span class="k">${S.household ? "Household" : "AUM"}</span><span class="v">${p.currency} ${S.household ? (p.householdAum || p.aum) : p.aum}</span></div>
      <div class="fct"><span class="k">Risk profile</span><span class="v">${p.riskProfile} · ${p.riskBand}</span></div>
      <div class="fct"><span class="k">Attention</span><span class="v">${meta.urgency} · ${meta.band}</span></div>
      ${L ? `<div class="fct"><span class="k">Lombard headroom</span><span class="v" style="color:${L.headroomPct < 25 ? P.SEV.warn : "inherit"}">${L.headroomPct}% <span style="color:var(--ink-4)">from ${L.prevHeadroomPct}%</span></span></div>` : ""}
      <div class="fct"><span class="k">Next review</span><span class="v">${p.reviewDate}</span></div>
    </div>`;
}

export function paintGoals(onPick) {
  const gs = goals();
  const moved = gs.filter(g => g.change !== 0).length;
  document.getElementById("goals").innerHTML = `<div class="goal-lab"><h2>Objectives</h2><span class="n">funding ratio</span><span class="n2">${gs.length} tracked · ${moved || "none"} moved</span><span class="method" tabindex="0" title="${FUNDING_METHOD}">method</span></div>` + gs.map(g => {
    const col = g.change < 0 ? P.UP[3] : g.change > 0 ? P.SEV.good : css("--ink-3");
    const bar = g.funded >= 95 ? P.SEV.good : g.funded >= 80 ? P.SEV.warn : P.UP[3];
    const bk = BUCKETS[g.bucket] || { label: "Objective", cap: "" };
    return `<button class="goal" data-g="${g.id}" aria-pressed="${S.goalSel === g.id}">
      <div class="g-top"><span class="bkt b-${g.bucket || "other"}" title="${bk.cap}">${bk.label}</span><span class="gh">${g.horizon}</span></div>
      <div class="gn">${g.name}</div><div class="gv"><span class="pct">${g.funded}%</span><span class="chg" style="color:${col}">${g.change === 0 ? "no change" : fmtD(g.change) + " pts this week"}</span></div>
      <div class="track"><i style="width:${Math.min(100, g.funded)}%; background:${bar}"></i><span class="prev" style="left:${Math.min(100, g.prevFunded)}%"></span></div>
      <div class="gt2"><span>${g.targetLabel}</span><span>${g.driverIds.length ? g.driverIds.length + " positions" : "cash-funded"}</span></div>
    </button>`;
  }).join("");
  document.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => onPick(b.dataset.g)));
  M.once("goals", S.portfolio.id + "|" + S.household, M.goals);
}

export function paintEvidence() {
  const g = S.goalSel ? goals().find(x => x.id === S.goalSel) : null;
  if (g) {
    document.getElementById("ev-k").textContent = "This goal moved";
    document.getElementById("ev-v").textContent = fmtD(g.change) + " pts";
    const drv = g.contributions.slice(0, 3).map(c => c.instrumentId).join(" · ");
    document.getElementById("ev-s").innerHTML = `this week, driven by<br><span style="font-family:var(--mono);color:var(--ink-2)">${drv || "no market driver"}</span>`;
    M.once("evid", "g:" + g.id + ":" + g.change, M.evidence);
    return;
  }
  const c = concentration();
  document.getElementById("ev-k").textContent = "Risk-weighted concentration";
  document.getElementById("ev-v").textContent = c.pct + "%";
  document.getElementById("ev-s").innerHTML = `of deteriorating exposure in three countries<br><span style="font-family:var(--mono);color:var(--ink-2)">${c.countries.join(" · ")}</span>`;
  M.once("evid", "c:" + S.portfolio.id + ":" + c.pct, M.evidence);
}

export function paintLegend() {
  const L = LENSES()[S.lens];
  document.getElementById("lg-title").textContent = L.label;
  document.getElementById("lg-cap").textContent = L.cap;
  document.getElementById("lg-ramp").innerHTML = L.ramp.map(c => `<span style="background:${c}"></span>`).join("");
  document.getElementById("lg-lo").textContent = L.lo;
  document.getElementById("lg-mid").textContent = L.mid;
  document.getElementById("lg-hi").textContent = L.hi;
  M.once("legend", S.lens, M.ramp);
}

export function paintTicker(feed = FEED) {
  const hrefFor = url => {
    if (!url || typeof url !== "string") return "";
    if (url.startsWith("/")) return url;
    return /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
  };
  const item = f => {
    const url = hrefFor(f[5]);
    const isNew = f[5] === true || f[6] === true;
    const body = `<time>${f[0]}</time><span class="sv" style="background:${P.SEV[f[4]] || P.INK4}"></span><b>${f[2]}</b> ${f[3]} <span class="src">${f[1]}</span>`;
    return url
      ? `<a class="tk ${isNew ? "new" : ""}" href="${url}" target="_blank" rel="noreferrer">${body}</a>`
      : `<span class="tk ${isNew ? "new" : ""}">${body}</span>`;
  };
  document.getElementById("ticker").innerHTML = feed.map(item).join("") + feed.map(item).join("");
  M.tick();
  const tag = document.getElementById("mode-tag");
  if (!tag) return;
  const { mode } = getMode();
  tag.className = "mode " + mode;
  tag.textContent = mode === "live" ? "live feed" : mode === "fixtures" ? "fixtures" : "…";
}

export function paintPfRail({ onClearSel, onSelectIso, onOpenClient, onOpenPosition, onRunPolicyScan, onOpenPolicyTrial, onCopilotToggle }) {
  const p = S.portfolio;
  const urgent = S.portfolios.filter(x => clientHasIso(x, S.selIso)).map(x => ({ p:x, m:clientMeta(x) })).sort((a,b)=>b.m.urgency-a.m.urgency).slice(0,5);
  const digest = S.selIso ? S.signals[S.selIso]?.events || [] : topEventsRaw(4);
  S.urgentReviewIndex = Math.max(0, Math.min(S.urgentReviewIndex || 0, Math.max(urgent.length - 1, 0)));
  const active = urgent[S.urgentReviewIndex];
  document.getElementById("pfrail").innerHTML = `<button class="rail-close" id="close-priority-rail" aria-label="Close action rail">×</button><section class="priority-card urgent-carousel"><div class="sec-h"><h2>Urgent reviews</h2><span class="count">${S.selIso || "global"} · top ${urgent.length}</span></div>${active ? urgentReviewCard(active, S.urgentReviewIndex, urgent.length) : `<div class="empty-state">No urgent reviews in this scope.</div>`}<div class="urgent-nav"><button data-urg-nav="-1" aria-label="Previous urgent review">‹</button><div>${urgent.map((_, i) => `<button class="dot ${i === S.urgentReviewIndex ? "on" : ""}" data-urg-dot="${i}" aria-label="Urgent review ${i + 1}"></button>`).join("")}</div><button data-urg-nav="1" aria-label="Next urgent review">›</button></div></section>
    <section class="priority-card live-card"><div class="sec-h"><h2>Live Intelligence</h2><button class="ghost sm" id="clear-sel">Reset view</button></div><div class="situation-list">${digest.map(e => signalCard(e)).join("")}</div></section>`;
  document.getElementById("clear-sel")?.addEventListener("click", onClearSel);
  document.querySelectorAll("#pfrail [data-cl]").forEach(b => b.addEventListener("click", () => onOpenClient?.(b.dataset.cl)));
  document.querySelectorAll("#pfrail [data-iso]").forEach(b => b.addEventListener("click", () => onSelectIso?.(b.dataset.iso)));
  document.querySelectorAll("#pfrail [data-t]").forEach(b => b.addEventListener("click", () => onOpenPosition(b.dataset.t)));
  document.querySelectorAll("#pfrail [data-urg-nav]").forEach(b => b.addEventListener("click", () => {
    if (!urgent.length) return;
    S.urgentReviewIndex = (S.urgentReviewIndex + Number(b.dataset.urgNav) + urgent.length) % urgent.length;
    paintPfRail({ onClearSel, onSelectIso, onOpenClient, onOpenPosition, onRunPolicyScan, onOpenPolicyTrial, onCopilotToggle });
  }));
  document.querySelectorAll("#pfrail [data-urg-dot]").forEach(b => b.addEventListener("click", () => {
    S.urgentReviewIndex = Number(b.dataset.urgDot) || 0;
    paintPfRail({ onClearSel, onSelectIso, onOpenClient, onOpenPosition, onRunPolicyScan, onOpenPolicyTrial, onCopilotToggle });
  }));
  const card = document.querySelector("#pfrail [data-urgent-card]");
  if (card) {
    let startX = 0;
    card.addEventListener("pointerdown", e => { startX = e.clientX; card.setPointerCapture?.(e.pointerId); });
    card.addEventListener("pointerup", e => {
      const dx = e.clientX - startX;
      if (Math.abs(dx) < 34 || !urgent.length) return;
      S.urgentReviewIndex = (S.urgentReviewIndex + (dx < 0 ? 1 : -1) + urgent.length) % urgent.length;
      paintPfRail({ onClearSel, onSelectIso, onOpenClient, onOpenPosition, onRunPolicyScan, onOpenPolicyTrial, onCopilotToggle });
    });
  }
  M.once("rail", [p.id, S.selIso, S.goalSel, S.household].join("|"), M.rail);
}

export function paintCopilot({ onToggle }) {
  const p = S.portfolio, open = S.copilotOpen;
  const prompts = ["Prepare call brief", "Show liquidity risks", "Summarise alerts", "Find clients affected by Singapore"];
  document.getElementById("copilot").innerHTML = open ? `<div class="copilot-box"><div class="copilot-h"><div><h2><span>✦</span> AI Copilot</h2><p>Ask about this client, a holding, or market event</p></div><button class="x" id="copilot-close" aria-label="Close copilot">×</button></div><div class="prompt-grid">${prompts.map(x => `<button data-prompt="${x}">${x}</button>`).join("")}</div><div class="copilot-answer">${S.copilotDraft ? `Drafting workspace for: <b>${S.copilotDraft}</b><br><span>Will use portfolio, goals, RM notes and live signals when routing is connected.</span>` : "Select a prompt or ask a question to organise the RM workflow."}</div><div class="ask-row"><input value="${S.copilotDraft || ""}" placeholder="Ask anything..."><button>➤</button></div></div>` : `<button class="copilot-launch" id="copilot-open" aria-label="Open AI Copilot"><span>✦</span></button>`;
  document.getElementById("copilot-open")?.addEventListener("click", onToggle);
  document.getElementById("copilot-close")?.addEventListener("click", onToggle);
  document.querySelectorAll("#copilot [data-prompt]").forEach(b => b.addEventListener("click", () => { S.copilotDraft = b.dataset.prompt; paintCopilot({ onToggle }); }));
}

function topEventsRaw(n) {
  const evs = [];
  for (const s of Object.values(S.signals)) for (const e of s.events || []) evs.push({ ...e, sev: Math.abs(s.riskDelta) > 25 ? "crit" : Math.abs(s.riskDelta) > 12 ? "serious" : "warn" });
  return evs.sort((a,b) => (b.value || "").length - (a.value || "").length).slice(0,n);
}

function affectedForEvent(e) {
  const iso = e.iso3 || e.iso;
  const clients = S.portfolios.filter(p => clientHasIso(p, iso));
  const aum = clients.reduce((s, p) => s + (p.aumUsd || 0), 0);
  const names = clients.slice(0, 3).map(p => p.name).join(" · ");
  return { iso, clients, aum, names };
}

function signalCard(e) {
  const affected = affectedForEvent(e);
  const sev = e.sev || (e.severity === "Severe" ? "crit" : e.severity === "High" ? "serious" : "warn");
  const aum = affected.aum >= 1e9 ? `USD ${(affected.aum / 1e9).toFixed(2)}bn` : `USD ${(affected.aum / 1e6).toFixed(0)}m`;
  const why = e.transmission || e.primary_transmission || e.value || "Review client exposure and portfolio actions.";
  return `<article class="sit">
    <time>${(e.at || "").split(" ").slice(-1)[0]}</time><span class="dot" style="background:${P.SEV[sev] || P.SEV.warn}"></span>
    <div><h3>${e.text || "Signal update"}</h3><p>${why}</p><span class="src">${affected.clients.length} clients · ${aum}${affected.names ? ` · ${affected.names}` : ""}</span>
    ${affected.iso ? `<button class="ghost sm" data-iso="${affected.iso}">View ${affected.iso}</button>` : ""}</div>
  </article>`;
}

function topEvents(n) {
  return topEventsRaw(n).map(e => [e.at.split(" ").slice(-1)[0], e.source, `<strong>${e.text}</strong> — ${e.value}`]);
}
