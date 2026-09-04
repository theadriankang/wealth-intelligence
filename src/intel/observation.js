/**
 * The return gate.
 *
 * Retrieval without a filter produces forty articles and zero insight. On the
 * way back, every observation must RE-LINK to a fingerprint element or be
 * discarded. There is no "interesting but unattached" category.
 *
 * And the fence: `world` is a field, not a convention people remember.
 *   dataset -> authoritative. Every number attached to a client's portfolio.
 *   live    -> context. Never arithmetic, never a portfolio number.
 * assertFence() runs in the test suite. If a live record ever reaches the
 * authoritative block, the build fails rather than the demo.
 */

/** Who published it matters more than how recently. */
const AUTHORITY = [
  [/(^|\.)(mas\.gov\.sg|hkma\.gov\.hk|federalreserve\.gov|ecb\.europa\.eu|snb\.ch|boj\.or\.jp|bankofengland\.co\.uk|pbc\.gov\.cn|bok\.or\.kr|rbi\.org\.in|cbc\.gov\.tw|bi\.go\.id|sfc\.hk|finma\.ch|iras\.gov\.sg|rvd\.gov\.hk|esdm\.go\.id)$/i, 1.0],
  [/(^|\.)(bis\.org|imf\.org|iea\.org|iosco\.org|oecd\.org|unctad\.org|adb\.org|worldbank\.org|gold\.org)$/i, 0.95],
  [/\.gov(\.[a-z]{2})?$/i, 0.85],
  [/\.(org|edu)$/i, 0.6],
];

export function sourceAuthority(url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return 0.3; }
  for (const [re, score] of AUTHORITY) if (re.test(host)) return score;
  return 0.4;
}

/** Structural material does not decay; event material does, fast. */
export function recencyDecay(tier, retrievedAt) {
  if (tier === "structural") return 1.0;
  const days = (Date.now() - new Date(retrievedAt).getTime()) / 86_400_000;
  if (!Number.isFinite(days)) return 0.7;
  return tier === "forward" ? Math.max(0.5, 1 - days / 90) : Math.max(0.2, 1 - days / 14);
}

/** A page of prose beats a stub; a stub beats a link farm. */
export function specificity(obs) {
  if (obs.lane === "quant") return obs.series?.points?.length ? 1.0 : 0.5;
  const chars = obs.doc?.chars ?? 0;
  if (chars < 400) return 0.3;
  if (chars < 1500) return 0.7;
  return 1.0;
}

export function score(obs) {
  const w = Math.max(obs.driver?.weight_pct ?? 0, 1) / 100;
  const a = obs.lane === "quant" ? 0.95 : sourceAuthority(obs.doc?.final_url || obs.doc?.url || "");
  return Math.round(w * a * recencyDecay(obs.tier, obs.source?.retrieved_at) * specificity(obs) * 10000) / 10000;
}

/**
 * Relink or discard. An observation whose driver names no element in this
 * client's fingerprint is dropped — that is the whole gate.
 */
/**
 * Diversity pass: at most `perDriver` documents from any one exposure, THEN
 * backfill the remaining slots by relevance.
 *
 * Without it, CL-0014's brief was three HKMA pages on the Hong Kong dollar peg —
 * correct by score (currency:HKD is 55.81% of the book, so its documents sweep
 * the top four places) and useless as a briefing. An RM walking into a meeting
 * needs the peg, the rate sensitivity and the property exposure, not the peg
 * three times. Backfilling means a client with only one material exposure still
 * gets a full brief.
 */
function diversify(sorted, cap, perDriver) {
  const taken = [], counts = new Map();
  for (const o of sorted) {
    if (taken.length >= cap) break;
    const n = counts.get(o.driver.key) || 0;
    if (n >= perDriver) continue;
    counts.set(o.driver.key, n + 1);
    taken.push(o);
  }
  for (const o of sorted) {                       // backfill, still by relevance
    if (taken.length >= cap) break;
    if (!taken.includes(o)) taken.push(o);
  }
  return taken;
}

export function gate(observations, fingerprint, { docCap = 3, perDriver = 1, quantCap = 14 } = {}) {
  const keys = new Set(fingerprint.elements.map(e => e.key).filter(Boolean));
  const kept = [], dropped = [];

  for (const o of observations) {
    if (!o.driver?.key || !keys.has(o.driver.key)) {
      dropped.push({ id: o.id, reason: `driver "${o.driver?.key ?? "none"}" does not match any fingerprint element` });
      continue;
    }
    kept.push({ ...o, relevance: score(o) });
  }

  const rank = (a, b) => b.relevance - a.relevance;
  const docs = kept.filter(o => o.lane === "doc").sort(rank);
  const quant = kept.filter(o => o.lane === "quant").sort(rank);
  const chosenDocs = diversify(docs, docCap, perDriver);
  const chosen = new Set(chosenDocs);

  for (const o of docs) {
    if (chosen.has(o)) continue;
    const sameDriver = chosenDocs.filter(x => x.driver.key === o.driver.key).length;
    dropped.push({
      id: o.id,
      reason: sameDriver >= perDriver
        ? `already have ${perDriver} document(s) for "${o.driver.key}" — capped for coverage`
        : `below the top ${docCap} documents for this client`
    });
  }

  return { kept: [...chosenDocs, ...quant.slice(0, quantCap)], dropped };
}

/**
 * The assertion the whole design rests on. Called by the test suite and by the
 * bundle writer: a live observation in the authoritative block is a build
 * failure, not a runtime warning.
 */
export function assertFence(bundle) {
  const problems = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (!node || typeof node !== "object") return;
    if (node.world === "live") problems.push(path);
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(bundle.authoritative, "authoritative");

  for (const o of bundle.context?.observations || []) {
    if (o.world !== "live") problems.push(`context has a non-live record: ${o.id}`);
    if (o.status === "approved") problems.push(`context record ${o.id} is pre-approved; approval is the RM's, not the pipeline's`);
  }
  if (problems.length) throw new Error(`FENCE VIOLATION\n  ${problems.join("\n  ")}`);
  return true;
}
