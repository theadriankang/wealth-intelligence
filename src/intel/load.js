/**
 * Bundle access for the browser.
 *
 * A bundle is fetched once per client and then held live: `approve()` mutates
 * the very object the walk reads, so re-running analystWalk after an approval
 * genuinely re-derives the result rather than patching a rendered view. That is
 * the point of showing it at all — a judge watching a citation appear is
 * watching the gate open, not an animation of one opening.
 *
 * Missing bundles are a normal state, not an error: a client whose intel has not
 * been built yet returns null and the panel says so.
 */
import { analystWalk } from "../agent/walk.js";
import { approve as approveObservation } from "../agent/tools.js";

const cache = new Map();     // clientId -> bundle | null
const inflight = new Map();

export const bundleIdFor = portfolioId => String(portfolioId || "").toUpperCase();

export async function loadBundle(portfolioId) {
  const id = bundleIdFor(portfolioId);
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  if (inflight.has(id)) return inflight.get(id);

  const p = fetch(`/intel/${id}.json`)
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)              // offline, 404, or a static host that rewrote it to index.html
    .then(b => {
      const ok = b && b.context && b.authoritative ? b : null;
      cache.set(id, ok);
      inflight.delete(id);
      return ok;
    });

  inflight.set(id, p);
  return p;
}

/** The walk, re-derived from the bundle's CURRENT approval state. */
export function walk(bundle) {
  if (!bundle) return null;
  try { return analystWalk(bundle); }
  catch (err) {
    console.warn("[intel] walk failed:", err.message);
    return null;
  }
}

/** RM approval. Human act, deliberately outside the model's toolbox. */
export function approve(bundle, observationId, rm) {
  approveObservation(bundle, observationId, rm);
}

export function docObservations(bundle) {
  return (bundle?.context?.observations || []).filter(o => o.lane === "doc");
}

export function seriesObservations(bundle) {
  return (bundle?.context?.observations || []).filter(o => o.lane === "quant");
}
