/**
 * HOUSE VIEW RECONCILIATION.
 *
 * A signal that disagrees with the bank's own investment view is the interesting
 * case, not an error. An intelligence tool inside a private bank that never
 * reconciles against the CIO view is an orphan — this is the seam where the real
 * house view drops in when the repo provides one.
 */

/** Replace wholesale with the bank's feed. iso3 or sector name -> stance. */
export const HOUSE_VIEW = {
  countries: {
    TWN: { stance: "overweight", note: "Structural AI demand; strait risk treated as tail, not base case." },
    KOR: { stance: "overweight", note: "Memory cycle upturn intact." },
    CHN: { stance: "neutral",    note: "Policy support offset by property drag." },
    SAU: { stance: "neutral",    note: "Oil range-bound in the base case." },
    SGP: { stance: "overweight", note: "Regional financial hub; rate path supportive of banks." },
    NLD: { stance: "neutral",    note: "Cyclical exposure balanced by valuation." },
    USA: { stance: "overweight", note: "Earnings breadth improving." },
    DEU: { stance: "underweight",note: "Industrial recovery repeatedly deferred." },
    GBR: { stance: "neutral",    note: "" },
    CHE: { stance: "neutral",    note: "" },
    JPN: { stance: "overweight", note: "Governance reform still feeding through." },
    IND: { stance: "overweight", note: "Domestic demand resilient." },
    BRA: { stance: "neutral",    note: "" }
  },
  sectors: {
    Semiconductors: { stance: "overweight", note: "Top-conviction secular theme." },
    Energy:         { stance: "neutral",    note: "" },
    Financials:     { stance: "overweight", note: "" },
    Logistics:      { stance: "underweight",note: "Freight rates normalising." }
  },
  asOf: "01 Sep 2026",
  source: "CIO Investment Committee (demo stand-in)"
};

/**
 * Compare what the signal implies against what the house says.
 * @returns {{verdict:"tension"|"aligned"|"confirms"|"neutral", stance:string, note:string, line:string}}
 */
export function reconcile(iso3, riskDelta, houseView = HOUSE_VIEW) {
  const hv = houseView.countries[iso3];
  if (!hv) return { verdict: "neutral", stance: "no view", note: "", line: "No house view on this market." };
  const signalNegative = riskDelta >= 6;
  const signalPositive = riskDelta <= -6;

  if (signalNegative && hv.stance === "overweight") {
    return { verdict: "tension", stance: hv.stance, note: hv.note,
      line: `The signal says reduce; the house view is <strong>overweight</strong>. Worth naming the disagreement out loud rather than resolving it silently.` };
  }
  if (signalNegative && hv.stance === "underweight") {
    return { verdict: "confirms", stance: hv.stance, note: hv.note,
      line: `The signal reinforces an existing <strong>underweight</strong> — this is a house call the data now supports.` };
  }
  if (signalPositive && hv.stance === "underweight") {
    return { verdict: "tension", stance: hv.stance, note: hv.note,
      line: `Conditions are improving against a standing <strong>underweight</strong>. A review candidate.` };
  }
  if (signalPositive && hv.stance === "overweight") {
    return { verdict: "confirms", stance: hv.stance, note: hv.note,
      line: `Improving conditions support the existing <strong>overweight</strong>.` };
  }
  return { verdict: "aligned", stance: hv.stance, note: hv.note,
    line: `House view is <strong>${hv.stance}</strong>; nothing in this week's signal contradicts it.` };
}
