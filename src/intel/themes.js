/**
 * Research-theme bridge.
 *
 * Distinct from geo.js `resolveUnderlying`, which resolves a structured
 * product to OTHER INSTRUMENTS INSIDE the dataset (portfolio look-through).
 * This maps an instrument to REAL-WORLD THEMES that can actually be searched.
 *
 * The instruments are synthetic: "Bara Nusantara Energy Tbk" returns nothing
 * from any search engine, ever. The themes underneath it are real. This table
 * is the only place a synthetic name is allowed to touch a research term, and
 * it is hand-authored so the mapping is auditable rather than inferred.
 */

/** instrument_id -> real-world themes the position is actually exposed to */
export const INSTRUMENT_THEMES = {
  "SYN-SP-0501": ["energy majors", "offshore oil services", "cloud infrastructure"],
  "SYN-SP-0502": ["cloud infrastructure", "AI capex"],
  "SYN-SP-0503": ["hong kong property developers"],
  "SYN-SP-0504": ["gold"],
  "SYN-SP-0505": ["tanker shipping", "energy majors", "indonesian coal"],
  "SYN-SP-0506": ["asian bank equity"],
  "SYN-CM-0401": ["gold"],
  "SYN-CM-0402": ["gold"],
  "SYN-AL-0308": ["late-stage venture", "enterprise software"],
};

/**
 * Structures whose MECHANICS are the exposure, whatever the underlying.
 * This is the highest-yield mapping in the file: the specific perpetual is
 * invented, but how perpetuals behave is documented by the BIS.
 */
export const STRUCTURE_THEMES = {
  "Subordinated Perpetual": ["bank perpetual / AT1"],
  "Accumulator": ["accumulator structures"],
  "Private Credit": ["private credit"],
  "Private Equity": ["private equity secondaries"],
  "Private Real Estate": ["private real estate"],
  "Direct Real Estate": ["direct property"],
  "Single Stock": ["single-name concentration"],
  "Yield Enhancement": ["yield enhancement structures"],
  "Capital Protected": ["capital protected notes"],
  "Hedge Fund": ["hedge fund liquidity terms"],
};
