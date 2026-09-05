import { positionRiskDelta, primaryCountry, chokepointExposure } from "../model/lookthrough.js";
import { goalDelta, riskConcentration, flaggedPositions, FLAG_THRESHOLD } from "../model/scoring.js";
import { reconcile } from "../model/houseview.js";
import { HEALTH_PENALTIES, HEALTH_BANDS, CONC_SOFT, CONC_HARD, URGENCY } from "./rubric.js";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const IMPERATIVE = /\b(buy|sell|execute|switch)\b/gi;
export const deImperative = t => t
  .replace(/\bexecute\b/gi, "put to the client")
  .replace(/\bswitch into\b/gi, "review a move to")
  .replace(/\bswitch\b/gi, "review a move on")
  .replace(/\bsell\b/gi, "reduce")
  .replace(/\bbuy\b/gi, "add");

const MONTHS = { "Q1": 2, "Q2": 5, "Q3": 8, "Q4": 11 };
function horizonMonthsAway(horizon, nowYear = 2026, nowMonth = 9) {
  const m = /(\d{4})/.exec(horizon || "");
  if (!m) return 999;
  const y = +m[1];
  const q = /Q([1-4])/.exec(horizon);
  const mo = q ? MONTHS["Q" + q[1]] : 6;
  return (y - nowYear) * 12 + (mo - nowMonth);
}

export function evaluateClient(portfolio, instruments, signals, prevSignals, countryScores, policyScan) {
  const positions = portfolio.positions;
  const cite = {};
  const C = (id, obj) => { if (!cite[id]) cite[id] = obj; return id; };

  // register base citations
  for (const p of positions) C(`pos:${p.instrumentId}`, { kind: "position", label: instruments[p.instrumentId]?.name || p.instrumentId, value: `${p.weightPct}%` });
  for (const g of portfolio.goals) C(`goal:${g.id}`, { kind: "goal", label: g.name });
  for (const iso of Object.keys(signals)) for (const e of signals[iso].events || []) C(e.id, { kind: "signal", label: e.text, value: e.value });
  if (policyScan?.citations?.[0]) C(`policy:${policyScan.citations[0].url}`, { kind: "policy", label: policyScan.citations[0].label, value: policyScan.citations[0].quote });
  (portfolio.relationship?.concerns || []).forEach((t, i) => C(`note:${portfolio.id}-concern-${i}`, { kind: "note", label: "RM standing concern", value: t }));

  // ── health ───────────────────────────────────────────────────────────
  const conc = riskConcentration(positions, instruments, signals);
  const exposureScore = clamp(positions.reduce((acc, p) => {
    const iso = primaryCountry(instruments[p.instrumentId]);
    return acc + (p.weightPct / 100) * (countryScores[iso]?.score || 0);
  }, 0));
  const goalGap = portfolio.goals.reduce((a, g) => a + (100 - g.baseFunded), 0) / (portfolio.goals.length || 1);

  const penalties = [
    { label: "Goal funding gap", penalty: goalGap * HEALTH_PENALTIES.goalGap },
    { label: "Concentration", penalty: conc.pct * HEALTH_PENALTIES.concentration * (conc.pct > CONC_HARD ? HEALTH_PENALTIES.concHardMult : 1) },
    { label: "Country-risk exposure", penalty: exposureScore * HEALTH_PENALTIES.exposure },
    { label: "Lombard headroom", penalty: (portfolio.lombard && portfolio.lombard.headroomPct < 25) ? HEALTH_PENALTIES.lombard : 0 }
  ].filter(p => p.penalty > 0);

  if (!penalties.length) penalties.push({ label: "No material stress", penalty: 0 });

  const health = clamp(100 - penalties.reduce((a, p) => a + p.penalty, 0));
  const healthBand = health >= HEALTH_BANDS.strong ? "strong" : health >= HEALTH_BANDS.watch ? "watch" : "strained";

  // ── findings ─────────────────────────────────────────────────────────
  // Each risk/opportunity carries a `topic` tag ('concentration', 'chokepoint', 'funding',
  // 'lombard', 'houseview') alongside its plain-English `text`. The tag — not the wording — is
  // what the action loop below (and narrate.js's categoriseRisk/categoriseAction) uses to
  // classify a finding, so the prose here can read like a quick note to an RM rather than a
  // compliance memo without silently breaking that classification.
  const risks = [], opportunities = [];
  let n = 0;
  const finding = (arr, { text, severity, cite: ids, goalId, drivingIso, topic }) => {
    const ids2 = ids.filter(id => cite[id]);
    if (!ids2.length) return;
    const near = goalId ? horizonMonthsAway(portfolio.goals.find(x => x.id === goalId)?.horizon) <= URGENCY.horizonMonthsNear : false;
    const trend = drivingIso ? Math.max(0, countryScores[drivingIso]?.trend || 0) : 0;
    const urgency = clamp(
      URGENCY.severityBase[severity]
      + (near ? URGENCY.horizonBoost : 0)
      + Math.min(25, URGENCY.trendBoostPerPoint * trend)
    );
    arr.push({ id: `f${++n}`, text, severity, urgency, cite: ids2, topic });
  };

  // 1. concentration
  if (conc.pct >= CONC_SOFT && conc.countries.length) {
    const worst = conc.countries[0];
    finding(risks, {
      text: `${conc.pct}% of the portfolio is tied up in ${conc.countries.join(", ")}, and that part is under pressure right now.`,
      severity: conc.pct >= 60 ? "high" : "medium",
      cite: [...(signals[worst]?.events || []).map(e => e.id), `pos:${positions[0]?.instrumentId}`],
      drivingIso: worst, topic: "concentration"
    });
  }
  // 2. chokepoint stack
  const ck = chokepointExposure(positions, instruments);
  const flaggedIds = flaggedPositions(positions, instruments, signals).map(p => p.instrumentId);
  for (const [name, c] of Object.entries(ck)) {
    const here = c.instrumentIds.filter(id => flaggedIds.includes(id));
    if (here.length >= 2) finding(risks, {
      text: `${here.length} holdings under pressure all run through the same bottleneck — ${name}, ${c.weightPct.toFixed(1)}% of the portfolio.`,
      severity: "high", cite: here.map(id => `pos:${id}`), topic: "chokepoint"
    });
  }
  // 3. goal band-cross this week
  for (const g of portfolio.goals) {
    const gd = goalDelta(g, positions, instruments, signals, prevSignals);
    for (const b of [95, 80]) if (gd.prevFunded >= b && gd.funded < b) finding(risks, {
      text: `${g.name} slipped below ${b}% funded this week (${gd.prevFunded}% → ${gd.funded}%) — worth flagging at the next call.`,
      severity: b === 80 ? "high" : "medium", cite: [`goal:${g.id}`], goalId: g.id, topic: "funding"
    });
  }
  // 4. lombard
  if (portfolio.lombard && portfolio.lombard.headroomPct < 25) finding(risks, {
    text: `Lombard headroom has dropped to ${portfolio.lombard.headroomPct}% (from ${portfolio.lombard.prevHeadroomPct}%) — if collateral falls further, this is the one that bites.`,
    severity: portfolio.lombard.headroomPct < 15 ? "high" : "medium",
    cite: [`goal:${portfolio.goals[0]?.id}`], topic: "lombard"
  });
  // 5. house-view tension (either direction: a worsening signal against an overweight,
  //    or an improving signal running ahead of a standing underweight)
  for (const p of positions) {
    const d = positionRiskDelta(instruments[p.instrumentId], signals);
    if (Math.abs(d) < FLAG_THRESHOLD) continue;
    const iso = primaryCountry(instruments[p.instrumentId]);
    if (reconcile(iso, d).verdict !== "tension") continue;
    const nm = instruments[p.instrumentId]?.name;
    const text = d > 0
      ? `${nm} is moving against the bank's own view on ${iso} — worth raising openly rather than quietly overriding it.`
      : `${nm} is improving faster than the bank's cautious view on ${iso} (a standing underweight) — worth a second look, not a quiet change.`;
    finding(risks, {
      text, severity: "medium",
      cite: [`pos:${p.instrumentId}`, ...(signals[iso]?.events || []).map(e => e.id)],
      drivingIso: iso, topic: "houseview"
    });
  }
  // opportunities
  for (const p of positions) {
    const d = positionRiskDelta(instruments[p.instrumentId], signals);
    const drives = portfolio.goals.filter(g => (g.driverIds || []).includes(p.instrumentId)).map(g => g.id);
    if (d <= -FLAG_THRESHOLD && drives.length) {
      const iso = primaryCountry(instruments[p.instrumentId]);
      finding(opportunities, {
        text: `${instruments[p.instrumentId]?.name} is up ${Math.abs(Math.round(d))} points and helps fund ${drives.length} goal${drives.length === 1 ? "" : "s"} — worth locking in at the review.`,
        severity: "low", cite: [`pos:${p.instrumentId}`, ...(signals[iso]?.events || []).map(e => e.id)], goalId: drives[0], drivingIso: iso
      });
    }
  }
  for (const iso of Object.keys(signals)) {
    if ((signals[iso].policyStance || 0) > -0.3) continue;
    const gExposed = portfolio.goals.filter(g => (g.driverIds || []).some(id => (instruments[id]?.exposures || []).some(e => e.iso3 === iso)));
    if (!gExposed.length) continue;
    const ev0 = (signals[iso].events || [])[0];
    finding(opportunities, {
      text: `Policy is easing in ${signals[iso].name} — good news for ${gExposed.map(g => g.name).join(", ")}.`,
      severity: "low", cite: [ev0?.id, ...gExposed.map(g => `goal:${g.id}`)].filter(Boolean), goalId: gExposed[0].id
    });
  }

  // ── actions ──────────────────────────────────────────────────────────
  const mandateClass = portfolio.mandate === "Discretionary" ? "executable-under-mandate"
    : portfolio.mandate === "Advisory" ? "requires-client-instruction" : "inform-only";
  const noteFor = i => `note:${portfolio.id}-concern-${i}`;
  const actions = [];
  let an = 0;
  const action = (kind, text, urgency, reason, ids, { informOnly = false, topic } = {}) => {
    const ids2 = ids.filter(id => cite[id]);
    if (!ids2.length) return;
    const cls = informOnly ? "inform-only" : mandateClass;
    let t = text;
    if (cls !== "executable-under-mandate" && IMPERATIVE.test(text)) { IMPERATIVE.lastIndex = 0; t = deImperative(text); }
    IMPERATIVE.lastIndex = 0;
    actions.push({ id: `a${++an}`, text: t, kind, urgency, mandateClass: cls, reason, cite: ids2, topic });
  };
  for (const r of risks) {
    let text, reason = r.text, informOnly = false;
    if (r.topic === "concentration" || r.topic === "chokepoint") text = "Trim or hedge the concentrated position so it's back in line with the mandate.";
    else if (r.topic === "funding") text = "Revisit the plan for this goal, or scale back the holdings driving it.";
    else if (r.topic === "lombard") text = "Top up collateral or pay down the loan to rebuild headroom.";
    else if (r.topic === "houseview") { text = "Flag the disagreement with the client directly rather than quietly overriding it."; informOnly = true; }
    else text = "Flag this at the next call.";
    action("reduce-risk", text, r.urgency, reason, r.cite, { informOnly, topic: r.topic });
  }
  for (const o of opportunities) {
    action("use-opportunity", `Bring up ${o.text.split("—")[0].trim()} with the client — it's good news.`, o.urgency, o.text, o.cite);
  }
  // fit-needs from RM notes
  (portfolio.relationship?.concerns || []).forEach((concern, i) => {
    const lc = concern.toLowerCase();
    if (/de-risk|progressively/.test(lc) && risks.some(r => r.topic === "concentration" || r.topic === "funding")) {
      action("fit-needs", `Client's asked to de-risk gradually — bring a staged plan, not one big move.`,
        clamp(URGENCY.severityBase.medium + URGENCY.horizonBoost), concern, [noteFor(i)], { informOnly: true });
    } else if (/cost-sensitive|premium/.test(lc) && actions.some(a => a.topic === "concentration" || a.topic === "chokepoint")) {
      action("fit-needs", `Mention the hedge's cost up front — this client passed on a collar before purely on price.`,
        clamp(URGENCY.severityBase.medium + URGENCY.horizonBoost), concern, [noteFor(i)], { informOnly: true });
    }
  });

  return {
    portfolioId: portfolio.id, name: portfolio.name, mandate: portfolio.mandate,
    health, healthBand, exposureScore,
    drivers: penalties.sort((a, b) => b.penalty - a.penalty).map(p => ({ label: p.label, penalty: Math.round(p.penalty) })),
    thesis: null, summary: null,
    risks, opportunities, actions,
    citations: cite
  };
}
