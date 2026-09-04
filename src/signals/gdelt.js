/**
 * Live narrative tone, browser side.
 *
 * Deliberately kept OUT of S.signals. The dataset is the sole authority for
 * every portfolio number, and its 2026 is fictional by construction; GDELT is
 * the real world, today. Merging them would produce one number nobody could
 * trace, which is precisely the failure the Measure fence exists to prevent.
 * So this lands in S.liveTone and gets its own lens, labelled live.
 *
 * A country that returns nothing stays absent rather than defaulting to zero —
 * on the globe that reads as "no live reading", not "neutral coverage".
 */
import { S } from "../store.js";

/** Countries worth spending a call on: largest exposure first. */
export function topExposures(limit = 10) {
  const weight = {};
  for (const p of S.portfolios || []) {
    for (const pos of p.positions || []) {
      for (const e of S.instruments[pos.instrumentId]?.exposures || []) {
        weight[e.iso3] = (weight[e.iso3] || 0) + (pos.weightPct || 0) * (e.weight || 0);
      }
    }
  }
  return Object.entries(weight).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([iso]) => iso);
}

export async function fetchLiveTone(isos, { days = 14 } = {}) {
  if (!isos.length) return { readings: {}, failures: [], live: false };
  try {
    // A hung upstream must never leave the lens in a permanent "loading" state:
    // without this the button sat enabled and unlabelled while a queued request
    // crawled, which is indistinguishable from a broken feature.
    const res = await fetch(`/api/gdelt?countries=${encodeURIComponent(isos.join(","))}&days=${days}`,
      { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = await res.json();
    return { ...out, live: Object.keys(out.readings || {}).length > 0 };
  } catch (err) {
    // No route (static preview), no network, or GDELT down. The lens simply has
    // nothing to show and says so — nothing else in the cockpit is affected.
    console.warn("[gdelt] live tone unavailable:", err.message);
    return { readings: {}, failures: [{ reason: err.message }], live: false };
  }
}

/** Poll. GDELT refreshes every 15 minutes; anything faster is noise. */
export function pollLiveTone(isos, onUpdate, ms = 900000) {
  const tick = async () => onUpdate(await fetchLiveTone(isos));
  const id = setInterval(tick, ms);
  return () => clearInterval(id);
}
