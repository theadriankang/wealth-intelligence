/**
 * Fingerprint -> retrieval plan. Pure, deterministic, no network.
 *
 * One plan drives both lanes, so a document and a number that appear in the same
 * brief can always be traced to the same exposure. Nothing here decides what is
 * TRUE; it decides what is worth ASKING, and it records who asked.
 *
 * Deduplication keeps the highest-weight driver: UST_10Y is requested once even
 * though six exposures want it, and it is attributed to the largest of them, so
 * the retrieval budget is spent per series rather than per exposure.
 */
import { buildAgenda } from "./agenda.js";
import { seriesFor, hasQuantRow } from "./quant-lexicon.js";

export function buildPlan(fp, { docTiers = ["structural", "forward"], docLimit = 12, quantLimit = 14 } = {}) {
  const agenda = buildAgenda(fp, { tiers: docTiers, limit: docLimit });

  const els = [...fp.elements].sort((a, b) => b.weight_pct - a.weight_pct);
  const bySeries = new Map();
  const quantGaps = new Set();

  for (const el of els) {
    if (!el.key) continue;
    if (!hasQuantRow(el.key)) { quantGaps.add(el.key); continue; }
    for (const s of seriesFor(el.key)) {
      if (bySeries.has(s.key)) { bySeries.get(s.key).also.push(el.key); continue; }
      bySeries.set(s.key, {
        ...s,
        also: [],
        driver: {
          client_id: fp.client_id, key: el.key, dimension: el.dimension,
          value: el.value, weight_pct: el.weight_pct
        }
      });
    }
  }

  const quantSeries = [...bySeries.values()]
    .sort((a, b) => b.driver.weight_pct - a.driver.weight_pct)
    .slice(0, quantLimit);

  return {
    client_id: fp.client_id,
    snapshot: fp.snapshot,
    docQueries: agenda.items,
    docGaps: agenda.gaps,
    quantSeries,
    quantGaps: [...quantGaps].sort()
  };
}
