/**
 * Fingerprint -> ranked research agenda.
 *
 * Every query traces to a fingerprint element and inherits its weight.
 * Nothing is invented here: a material exposure with no lexicon row is
 * reported as a GAP so a human can add the row, rather than improvised.
 */
import { lookup } from "./lexicon.js";

const TIER_PRIORITY = { structural: 1.0, forward: 0.7, event: 0.4 };

// Weight alone over-ranks broad regional exposure, which generates generic
// queries. A structure or a collateral position of the same size produces a
// far more actionable question for an RM preparing a meeting, so dimensions
// carry a quality multiplier alongside the exposure weight.
const DIM_PRIORITY = {
  theme: 1.25, collateral: 1.25, liability: 1.15, concentration: 1.15,
  sector: 1.0, currency: 1.0, rate: 1.0, region: 0.75,
};

export function buildAgenda(fp, { tiers = ["structural", "forward"], limit = 12 } = {}) {
  const seen = new Set(), items = [], gaps = new Set();
  const els = [...fp.elements].sort((a, b) => b.weight_pct - a.weight_pct);

  for (const el of els) {
    const entry = el.key ? lookup(el.key) : null;
    if (!entry) { if (el.key) gaps.add(el.key); continue; }
    for (const tier of tiers) {
      for (const query of entry[tier] || []) {
        if (seen.has(query)) continue;
        seen.add(query);
        items.push({
          query, tier,
          score: Math.round(Math.max(el.weight_pct, 1) * TIER_PRIORITY[tier] * (DIM_PRIORITY[el.dimension] ?? 1) * 100) / 100,
          driver: `${el.dimension}: ${el.value}`,
          driver_weight: el.weight_pct,
          sources: entry.sources || [],
        });
      }
    }
  }
  items.sort((a, b) => b.score - a.score);
  return { items: items.slice(0, limit), gaps: [...gaps].sort() };
}
