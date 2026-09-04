import { positionRiskDelta, countryExposure, primaryCountry, chokepointExposure } from "../model/lookthrough.js";
import { goalDelta, riskConcentration, flaggedPositions } from "../model/scoring.js";
import { reconcile } from "../model/houseview.js";
import { HEALTH_PENALTIES, HEALTH_BANDS, CONC_SOFT, CONC_HARD, URGENCY } from "./rubric.js";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const IMPERATIVE = /\b(buy|sell|execute|switch)\b/gi;
const deImperative = t => t
  .replace(/\bexecute\b/gi, "put to the client")
  .replace(/\bswitch into\b/gi, "review a move to")
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
    { label: "Concentration", penalty: conc.pct * HEALTH_PENALTIES.concentration * (conc.pct > CONC_HARD ? 2 : 1) },
    { label: "Country-risk exposure", penalty: exposureScore * HEALTH_PENALTIES.exposure },
    { label: "Lombard headroom", penalty: (portfolio.lombard && portfolio.lombard.headroomPct < 25) ? HEALTH_PENALTIES.lombard : 0 }
  ].filter(p => p.penalty > 0);

  const health = clamp(100 - penalties.reduce((a, p) => a + p.penalty, 0));
  const healthBand = health >= HEALTH_BANDS.strong ? "strong" : health >= HEALTH_BANDS.watch ? "watch" : "strained";

  // ── findings ─────────────────────────────────────────────────────────
  const risks = [], opportunities = [];
  let n = 0;
  const finding = (arr, { text, severity, cite: ids, goalId, drivingIso }) => {
    const ids2 = ids.filter(id => cite[id]);
    if (!ids2.length) return;
    const near = goalId ? horizonMonthsAway(portfolio.goals.find(x => x.id === goalId)?.horizon) <= URGENCY.horizonMonthsNear : false;
    const trend = drivingIso ? Math.max(0, countryScores[drivingIso]?.trend || 0) : 0;
    const urgency = clamp(
      URGENCY.severityBase[severity]
      + (near ? URGENCY.horizonBoost : 0)
      + Math.min(25, URGENCY.trendBoostPerPoint * trend)
    );
    arr.push({ id: `f${++n}`, text, severity, urgency, cite: ids2 });
  };

  // 1. concentration
  if (conc.pct >= CONC_SOFT && conc.countries.length) {
    const worst = conc.countries[0];
    finding(risks, {
      text: `Look-through concentration is live: ${conc.pct}% of the book's deteriorating exposure sits in ${conc.countries.join(", ")}.`,
      severity: conc.pct >= 60 ? "high" : "medium",
      cite: [...(signals[worst]?.events || []).map(e => e.id), `pos:${positions[0]?.instrumentId}`],
      drivingIso: worst
    });
  }
  // 2. chokepoint stack
  const ck = chokepointExposure(positions, instruments);
  const flaggedIds = flaggedPositions(positions, instruments, signals).map(p => p.instrumentId);
  for (const [name, c] of Object.entries(ck)) {
    const here = c.instrumentIds.filter(id => flaggedIds.includes(id));
    if (here.length >= 2) finding(risks, {
      text: `${here.length} holdings under pressure route through one chokepoint — ${name} (${c.weightPct.toFixed(1)}% of the book).`,
      severity: "high", cite: here.map(id => `pos:${id}`)
    });
  }
  // 3. goal band-cross this week
  for (const g of portfolio.goals) {
    const gd = goalDelta(g, positions, instruments, signals, prevSignals);
    for (const b of [95, 80]) if (gd.prevFunded >= b && gd.funded < b) finding(risks, {
      text: `${g.name} dropped through ${b}% funding confidence this week (${gd.prevFunded}% → ${gd.funded}%).`,
      severity: b === 80 ? "high" : "medium", cite: [`goal:${g.id}`], goalId: g.id
    });
  }
  // 4. lombard
  if (portfolio.lombard && portfolio.lombard.headroomPct < 25) finding(risks, {
    text: `Lombard headroom is ${portfolio.lombard.headroomPct}% (was ${portfolio.lombard.prevHeadroomPct}%) — the item with a hard consequence if collateral reprices.`,
    severity: portfolio.lombard.headroomPct < 15 ? "high" : "medium",
    cite: [`goal:${portfolio.goals[0]?.id}`]
  });
  // 5. house-view tension
  for (const p of positions) {
    const d = positionRiskDelta(instruments[p.instrumentId], signals);
    if (d < 6) continue;
    const iso = primaryCountry(instruments[p.instrumentId]);
    if (reconcile(iso, d).verdict === "tension") finding(risks, {
      text: `${instruments[p.instrumentId]?.name} pulls against the house view on ${iso}. Name the disagreement rather than resolving it silently.`,
      severity: "medium",
      cite: [`pos:${p.instrumentId}`, ...(signals[iso]?.events || []).map(e => e.id)],
      drivingIso: iso
    });
  }
  // opportunities
  for (const p of positions) {
    const d = positionRiskDelta(instruments[p.instrumentId], signals);
    const drives = portfolio.goals.filter(g => (g.driverIds || []).includes(p.instrumentId)).map(g => g.id);
    if (d <= -6 && drives.length) {
      const iso = primaryCountry(instruments[p.instrumentId]);
      finding(opportunities, {
        text: `${instruments[p.instrumentId]?.name} improved ${Math.abs(Math.round(d))} points and funds ${drives.length} goal(s) — a chance to lock in progress at the review.`,
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
      text: `Policy is easing in ${signals[iso].name} — supportive for ${gExposed.map(g => g.name).join(", ")}.`,
      severity: "low", cite: [ev0?.id, ...gExposed.map(g => `goal:${g.id}`)].filter(Boolean), goalId: gExposed[0].id
    });
  }

  // ── actions ──────────────────────────────────────────────────────────
  const mandateClass = portfolio.mandate === "Discretionary" ? "executable-under-mandate"
    : portfolio.mandate === "Advisory" ? "requires-client-instruction" : "inform-only";
  const noteFor = i => `note:${portfolio.id}-concern-${i}`;
  const actions = [];
  let an = 0;
  const action = (kind, text, urgency, reason, ids) => {
    const ids2 = ids.filter(id => cite[id]);
    if (!ids2.length) return;
    let t = text;
    if (mandateClass !== "executable-under-mandate" && IMPERATIVE.test(text)) { IMPERATIVE.lastIndex = 0; t = deImperative(text); }
    IMPERATIVE.lastIndex = 0;
    actions.push({ id: `a${++an}`, text: t, kind, urgency, mandateClass, reason, cite: ids2 });
  };
  for (const r of risks) {
    let text, reason = r.text;
    if (/concentration|chokepoint/i.test(r.text)) text = "Bring the concentrated sleeve back toward the mandate line — trim or hedge.";
    else if (/funding|band/i.test(r.text)) text = "Re-plan the affected goal or de-risk its drivers.";
    else if (/lombard/i.test(r.text)) text = "Restore lombard headroom — add collateral or reduce the drawdown.";
    else if (/house view/i.test(r.text)) text = "Put the signal-vs-house-view disagreement to the client explicitly.";
    else text = "Review the flagged exposure at the next contact.";
    action("reduce-risk", text, r.urgency, reason, r.cite);
  }
  for (const o of opportunities) {
    action("use-opportunity", `Raise ${o.text.split("—")[0].trim()} with the client as a positive.`, o.urgency, o.text, o.cite);
  }
  // fit-needs from RM notes
  (portfolio.relationship?.concerns || []).forEach((concern, i) => {
    const lc = concern.toLowerCase();
    if (/de-risk|progressively/.test(lc) && risks.some(r => /concentration|funding/i.test(r.text))) {
      action("fit-needs", `Honour the client's stated wish to de-risk progressively — bring a staged plan, not a single move.`,
        clamp(URGENCY.severityBase.medium + URGENCY.horizonBoost), concern, [noteFor(i)]);
    } else if (/cost-sensitive|premium/.test(lc) && actions.some(a => /hedge/i.test(a.text))) {
      action("fit-needs", `Quantify the hedge premium up front — the client declined a collar on cost alone before.`,
        URGENCY.severityBase.medium, concern, [noteFor(i)]);
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
