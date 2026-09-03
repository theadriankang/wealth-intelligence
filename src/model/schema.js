/**
 * The internal model. EVERYTHING in the app reads these shapes and nothing else.
 * Tomorrow's Julius Baer schema is mapped onto this in src/adapters/ — one file —
 * so no UI or scoring code changes when their data lands.
 *
 * @typedef {Object} Exposure
 * @property {string} iso3   ISO-3166 alpha-3, e.g. "TWN"
 * @property {number} weight 0..1 — share of the instrument's value exposed to that country
 *
 * @typedef {Object} Instrument
 * @property {string} id                 ticker, ISIN, or any stable key
 * @property {string} name
 * @property {"equity"|"fund"|"etf"|"bond"|"structured"|"cash"|"other"} assetClass
 * @property {string} currency
 * @property {Exposure[]} exposures      LOOK-THROUGH. A single equity is [{iso3, weight:1}];
 *                                       a fund or ETF carries many. Must sum to ~1.
 * @property {{name:string, weight:number}[]} sectors
 * @property {string[]} chokepoints      named maritime/physical dependencies
 * @property {string} [note]             position-specific "why this matters" prose
 *
 * @typedef {Object} Position
 * @property {string} instrumentId
 * @property {number} weightPct          % of the portfolio (0..100)
 * @property {number} [marketValue]
 * @property {boolean} [pledged]         pledged as lombard collateral
 *
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} name
 * @property {string} horizon            "Q2 2027", "from 2034", "continuous"
 * @property {string} targetLabel        "CHF 12.0m"
 * @property {number} baseFunded         funding % with no risk drag — the planning number
 * @property {string[]} driverIds        instrument ids that fund this goal
 * @property {number} [sensitivity]      how hard risk hits this goal (default 0.6)
 *
 * @typedef {Object} Portfolio
 * @property {string} id
 * @property {string} name
 * @property {string} ref
 * @property {string} currency
 * @property {string} aum
 * @property {"Advisory"|"Discretionary"|"Execution only"} mandate
 * @property {string} riskProfile
 * @property {string} riskBand
 * @property {string} reviewDate
 * @property {string} rm
 * @property {Position[]} positions
 * @property {Position[]} [householdPositions]
 * @property {string[]} [entities]
 * @property {string} [householdAum]
 * @property {Goal[]} goals
 * @property {Object} [lombard] {amount, headroomPct, prevHeadroomPct, pledgedIds[]}
 * @property {Object} [relationship] see adapters/demo.js
 * @property {Object[]} [actions]
 *
 * @typedef {Object} CountrySignal
 * @property {string} iso3
 * @property {string} name
 * @property {number} riskDelta      7-day change, roughly -40..+40
 * @property {number} instability    0..100
 * @property {number} tone           sigma from the 30-day band, -3..+3
 * @property {number} policyStance   -3 easing .. +3 tightening
 * @property {string[]} chokepoints
 * @property {SignalEvent[]} events
 *
 * @typedef {Object} SignalEvent
 * @property {string} id             stable id — the LLM must cite these
 * @property {string} at             ISO timestamp or display time
 * @property {string} source         "World Monitor" | "AIS" | "GDELT" | "MAS" | ...
 * @property {string} text
 * @property {string} value          display value, e.g. "−18% vs 30d"
 * @property {string} [endpoint]     provenance: where it came from
 */

export const DEFAULT_SENSITIVITY = 0.6;

/** Cheap runtime validation — call it on adapter output so bad data fails loudly. */
export function validatePortfolio(p, instruments) {
  const errs = [];
  if (!p?.id) errs.push("portfolio.id missing");
  if (!Array.isArray(p?.positions) || !p.positions.length) errs.push("portfolio.positions empty");
  for (const pos of p.positions || []) {
    if (!instruments[pos.instrumentId]) errs.push(`unknown instrument: ${pos.instrumentId}`);
    if (typeof pos.weightPct !== "number") errs.push(`weightPct not a number on ${pos.instrumentId}`);
  }
  for (const g of p.goals || []) {
    for (const d of g.driverIds || []) {
      if (!instruments[d]) errs.push(`goal ${g.id} names unknown driver ${d}`);
    }
  }
  return errs;
}

export function validateInstrument(i) {
  const errs = [];
  if (!i.exposures?.length) errs.push(`${i.id}: no exposures`);
  const sum = (i.exposures || []).reduce((s, e) => s + e.weight, 0);
  if (i.exposures?.length && Math.abs(sum - 1) > 0.02) {
    errs.push(`${i.id}: exposures sum to ${sum.toFixed(2)}, expected 1.00`);
  }
  return errs;
}
