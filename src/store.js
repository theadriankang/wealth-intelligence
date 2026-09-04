/** App state plus every derived selector. UI modules read from here and nothing else. */
import { countryExposure, positionRiskDelta, primaryCountry, chokepointExposure } from "./model/lookthrough.js";
import { goalDelta, riskConcentration, flaggedPositions, rmEconomics, FLAG_THRESHOLD } from "./model/scoring.js";

export const S = {
  instruments: {}, portfolios: [], signals: {}, prevSignals: {},
  portfolio: null, lens: "d", selIso: null, goalSel: null, tab: "pf",
  route: "dashboard", clientScopeId: null,
  household: false, live: false, actionState: {}, meta: {},
  operator: null,
  policyScan: null, policyScanState: "idle",
  evaluation: null, narratedHash: {},
  clientFilter: "all", clientSearch: "", copilotOpen: false, copilotDraft: "",
  clientSort: "urgency-desc", filtersOpen: false,
  driverFilter: "all", profileFilter: "all", bookingFilter: "all", aumFilter: "all",
  clientDrawerOpen: false, railDrawerOpen: false,
  inspectDataOpen: false, aiActionState: {},
  urgentReviewIndex: 0
};

export const positions = () => {
  if (S.route === "dashboard" && !S.clientScopeId) return S.portfolios.flatMap(p => p.positions || []);
  return (S.household && S.portfolio.householdPositions) ? S.portfolio.householdPositions : S.portfolio.positions;
};

export const rows = () => positions().map(p => {
  const inst = S.instruments[p.instrumentId];
  const d = positionRiskDelta(inst, S.signals);
  return {
    ...p, inst, riskDelta: d,
    name: inst?.name || p.instrumentId,
    iso3: primaryCountry(inst),
    multi: (inst?.exposures?.length || 0) > 1,
    assetClass: inst?.assetClass || "other"
  };
}).sort((a, b) => b.riskDelta * b.weightPct - a.riskDelta * a.weightPct);

export const exposure = () => {
  const ex = countryExposure(positions(), S.instruments);
  const g = goal();
  if (!g) return ex;
  const only = countryExposure(
    positions().filter(p => g.driverIds.includes(p.instrumentId)), S.instruments);
  return only;
};

export const goal = () => S.portfolio.goals.find(g => g.id === S.goalSel) || null;

export const goals = () => S.portfolio.goals.map(g => ({
  ...g, ...goalDelta(g, positions(), S.instruments, S.signals, S.prevSignals)
}));

export const concentration = () => riskConcentration(positions(), S.instruments, S.signals);
export const flagged = () => flaggedPositions(positions(), S.instruments, S.signals);
export const chokepoints = () => chokepointExposure(positions(), S.instruments);
export const economics = () => rmEconomics(S.portfolios, S.signals, S.instruments);
export const flagCountFor = p => flaggedPositions(p.positions, S.instruments, S.signals).length;

export const visibleRows = () => {
  let l = rows();
  const g = goal();
  if (g) l = l.filter(r => g.driverIds.includes(r.instrumentId));
  if (S.selIso) l = l.filter(r => r.inst?.exposures?.some(e => e.iso3 === S.selIso));
  return l;
};

export const actionState = a => S.actionState[S.portfolio.id + a.id] || a.state;
export const factsForCountries = isos => isos.flatMap(i => S.signals[i]?.events || []);
export { FLAG_THRESHOLD };

export const countryScore = iso3 => S.evaluation?.countries?.[iso3] || null;
export const clientEval = () => S.evaluation?.clients?.[S.portfolio?.id] || null;
export const urgentTasks = () => S.evaluation?.urgent || [];

/**
 * "loading" — narration hasn't resolved for this portfolio yet (never attempted, or in flight).
 * "ai" — the model answered and validated; this portfolio's AI-scored figures are trustworthy.
 * "unavailable" — narration was attempted and failed or didn't validate. Never silently shown as
 * a deterministic number — the deterministic engine still runs (it grounds the model's prompt
 * and is the plan-B computation), but nothing it produces is displayed as if it were a live read.
 */
export const aiState = portfolioId => {
  const cached = S.narratedHash[portfolioId];
  if (!cached) return "loading";
  return cached.scoreSource === "ai" ? "ai" : "unavailable";
};
