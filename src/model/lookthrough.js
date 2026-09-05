/**
 * Look-through. The single thing a private-bank judge will check first.
 *
 * A portfolio is not a list of countries. A position in a global equity fund is
 * exposure to thirty of them. Every country number in this app is computed here,
 * from instrument.exposures, so a fund behaves correctly everywhere at once.
 */

/**
 * Roll positions up to country exposure.
 * @returns {Object<string, {iso3:string, weightPct:number, instrumentIds:string[]}>}
 */
export function countryExposure(positions, instruments) {
  const out = {};
  for (const pos of positions) {
    const inst = instruments[pos.instrumentId];
    if (!inst) continue;
    for (const ex of inst.exposures) {
      const w = pos.weightPct * ex.weight;
      if (w <= 0.0001) continue;
      const e = (out[ex.iso3] ||= { iso3: ex.iso3, weightPct: 0, instrumentIds: [], byInstrument: {} });
      e.weightPct += w;
      e.byInstrument[pos.instrumentId] = (e.byInstrument[pos.instrumentId] || 0) + w;
      if (!e.instrumentIds.includes(pos.instrumentId)) e.instrumentIds.push(pos.instrumentId);
    }
  }
  return out;
}

/** Same idea for sectors. */
export function sectorExposure(positions, instruments) {
  const out = {};
  for (const pos of positions) {
    const inst = instruments[pos.instrumentId];
    if (!inst) continue;
    for (const s of inst.sectors || []) {
      out[s.name] = (out[s.name] || 0) + pos.weightPct * s.weight;
    }
  }
  return out;
}

/** Which chokepoints does this portfolio physically depend on, and how much sits behind each. */
export function chokepointExposure(positions, instruments) {
  const out = {};
  for (const pos of positions) {
    const inst = instruments[pos.instrumentId];
    if (!inst) continue;
    for (const c of inst.chokepoints || []) {
      const e = (out[c] ||= { name: c, weightPct: 0, instrumentIds: [] });
      e.weightPct += pos.weightPct;
      e.instrumentIds.push(pos.instrumentId);
    }
  }
  return out;
}

/**
 * A position's own risk delta = exposure-weighted average of its countries' deltas.
 * For a single-country equity this is just that country's delta; for a fund it is
 * the blend, which is the entire point.
 */
export function positionRiskDelta(instrument, signals) {
  if (!instrument?.exposures?.length) return 0;
  let acc = 0, w = 0;
  for (const ex of instrument.exposures) {
    const s = signals[ex.iso3];
    if (!s) continue;
    acc += s.riskDelta * ex.weight;
    w += ex.weight;
  }
  return w ? acc / w : 0;
}

/** The dominant country behind a position — for labels, not for maths. */
export function primaryCountry(instrument) {
  if (!instrument?.exposures?.length) return null;
  return [...instrument.exposures].sort((a, b) => b.weight - a.weight)[0].iso3;
}
