/**
 * Every derived number in the app, in one place, with the formula written down.
 *
 * Judges ask "how is that computed?" — this file is the answer. Nothing here is
 * a black box and nothing is hardcoded in the UI.
 */
import { DEFAULT_SENSITIVITY } from "./schema.js";
import { countryExposure, positionRiskDelta } from "./lookthrough.js";

export const FLAG_THRESHOLD = 6;   // riskDelta at or above this is "flagged"

/**
 * GOAL FUNDING CONFIDENCE
 *
 *   funded = baseFunded × (1 − drag)
 *   drag   = sensitivity × Σ( driverWeightShare × max(0, riskDelta) / 100 )
 *
 * baseFunded is the planning number (what the wealth plan says without market stress).
 * The drag is bounded, monotonic and explainable in one sentence: money sitting in
 * deteriorating places reduces confidence in the goal, in proportion to how much of
 * the goal it funds and how far the risk moved.
 *
 * Replace with a Monte Carlo over the goal horizon if there's time — the interface
 * stays identical.
 */
export function goalFunding(goal, positions, instruments, signals) {
  const sens = goal.sensitivity ?? DEFAULT_SENSITIVITY;
  const drivers = positions.filter(p => goal.driverIds.includes(p.instrumentId));
  const total = drivers.reduce((s, p) => s + p.weightPct, 0) || 1;
  let drag = 0;
  const contributions = [];
  for (const p of drivers) {
    const d = positionRiskDelta(instruments[p.instrumentId], signals);
    const share = p.weightPct / total;
    const c = share * Math.max(0, d) / 100;
    drag += c;
    contributions.push({ instrumentId: p.instrumentId, share, riskDelta: d, contribution: c });
  }
  drag *= sens;
  const funded = Math.max(0, Math.round(goal.baseFunded * (1 - drag)));
  contributions.sort((a, b) => b.contribution - a.contribution);
  return { funded, drag, contributions };
}

/** Same computation against last week's signals, so the UI can show the move. */
export function goalDelta(goal, positions, instruments, signals, prevSignals) {
  const now = goalFunding(goal, positions, instruments, signals);
  const prev = goalFunding(goal, positions, instruments, prevSignals || signals);
  return { ...now, prevFunded: prev.funded, change: now.funded - prev.funded };
}

/** Share of deteriorating exposure sitting in the top N countries. */
export function riskConcentration(positions, instruments, signals, topN = 3) {
  const ex = countryExposure(positions, instruments);
  const scored = Object.values(ex)
    .map(e => ({ ...e, score: e.weightPct * Math.max(0, signals[e.iso3]?.riskDelta || 0) }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);
  const total = scored.reduce((s, e) => s + e.score, 0);
  const top = scored.slice(0, topN);
  return {
    pct: total ? Math.round(top.reduce((s, e) => s + e.score, 0) / total * 100) : 0,
    countries: top.map(e => e.iso3),
    total
  };
}

export function flaggedPositions(positions, instruments, signals) {
  return positions
    .map(p => ({ ...p, riskDelta: positionRiskDelta(instruments[p.instrumentId], signals) }))
    .filter(p => p.riskDelta >= FLAG_THRESHOLD)
    .sort((a, b) => b.riskDelta * b.weightPct - a.riskDelta * a.weightPct);
}

/**
 * RM ECONOMICS — the operating-leverage story.
 *
 * Julius Baer's stated target is an adjusted cost/income ratio below 67% by 2028,
 * so "the RM covers more clients at the same quality" is the language that matters.
 * Baselines are assumptions, stated openly, not measurements. Change them in one place.
 */
export const ECONOMICS_BASELINE = {
  manualPrepMinutes: 45,      // per client, per review, without the tool
  assistedPrepMinutes: 6,     // with a prepared brief to check and edit
  reviewsPerClientPerYear: 4,
  assumptionNote: "Baselines are stated assumptions for the demo, not measured figures."
};

export function rmEconomics(portfolios, signals, instruments, b = ECONOMICS_BASELINE) {
  const affected = portfolios.filter(p =>
    flaggedPositions(p.positions, instruments, signals).length > 0);
  const savedPerReview = b.manualPrepMinutes - b.assistedPrepMinutes;
  return {
    clients: portfolios.length,
    affected: affected.length,
    minutesSavedNow: affected.length * savedPerReview,
    hoursPerYear: Math.round(
      portfolios.length * b.reviewsPerClientPerYear * savedPerReview / 60),
    prepBefore: b.manualPrepMinutes,
    prepAfter: b.assistedPrepMinutes,
    note: b.assumptionNote
  };
}
