/**
 * The document lane: agenda -> TinyFish -> candidate documents.
 *
 * This is the wire that was missing. src/intel/agenda.js has been producing 12
 * ranked, exposure-derived queries per client since the fingerprint build, and
 * nothing consumed them — the Policy Sentinel routed off a hardcoded issuer
 * table instead. Here the client's own exposure chooses what gets searched.
 *
 * Two economies matter and both are respected:
 *   - Search is one call per query, in parallel, restricted to the lexicon's
 *     preferred domains. A regulator's own site beats an open web search on
 *     every axis this challenge grades: traceability, auditability, and not
 *     returning SEO sludge.
 *   - Fetch is BATCHED, up to 10 URLs per call, never looped per URL.
 *
 * Candidates are ranked BEFORE fetching, reusing the Policy Sentinel's own
 * scorer: a /news listing page is not evidence, and taking results[0] is exactly
 * how you end up citing one.
 */
import { search, fetchDocs, hasKey } from "../tinyfish.js";
import { scoreCandidate } from "../policy-routing.js";
import { TTL } from "./cache.js";

const PURPOSE = "Structural background on a private client's portfolio exposure, for a relationship manager preparing a review. Prefer official regulator, central bank and multilateral sources.";

export async function fetchDocuments(plan, { cache, perQuery = 3, maxFetch = 10 } = {}) {
  const failures = [];
  if (!hasKey()) {
    return { documents: [], failures: [{ reason: "TINYFISH_API_KEY not set — document lane skipped", queries: plan.docQueries.length }] };
  }

  // ---- search, one call per query, in parallel ------------------------
  const searched = await Promise.all(plan.docQueries.map(async item => {
    const ttl = TTL[item.tier] ?? TTL.event;
    try {
      const { value } = await cache.through(
        { provider: "tinyfish", endpoint: "search", params: { q: item.query, d: item.sources } },
        ttl,
        () => search({
          query: item.query, purpose: PURPOSE,
          includeDomains: item.sources?.length ? item.sources.join(",") : undefined,
          numResults: 10, language: "en"
        })
      );
      return { item, hits: value || [] };
    } catch (err) {
      failures.push({ query: item.query, reason: err.message });
      return { item, hits: [] };
    }
  }));

  // ---- rank before fetching -------------------------------------------
  const candidates = [];
  for (const { item, hits } of searched) {
    const ranked = hits
      .map(h => ({ ...h, _score: scoreCandidate(h) }))
      .filter(h => h._score >= 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, perQuery);
    if (!ranked.length && hits.length) {
      failures.push({ query: item.query, reason: `all ${hits.length} hits scored as listing or junk pages` });
    }
    for (const h of ranked) candidates.push({ item, hit: h });
  }

  // Highest-scoring agenda item wins the fetch budget; dedupe by URL.
  const byUrl = new Map();
  for (const c of candidates.sort((a, b) => b.item.score - a.item.score)) {
    if (!byUrl.has(c.hit.url)) byUrl.set(c.hit.url, c);
  }
  const chosen = [...byUrl.values()].slice(0, maxFetch);
  if (!chosen.length) return { documents: [], failures };

  // ---- ONE batched fetch ----------------------------------------------
  let docs = [], errors = [];
  try {
    const { value } = await cache.through(
      { provider: "tinyfish", endpoint: "fetch", params: { urls: chosen.map(c => c.hit.url).sort() } },
      TTL.structural,
      () => fetchDocs(chosen.map(c => c.hit.url), { purpose: PURPOSE })
    );
    docs = value.docs || []; errors = value.errors || [];
  } catch (err) {
    failures.push({ reason: `TinyFish Fetch failed: ${err.message}`, urls: chosen.length });
    return { documents: [], failures };
  }
  for (const e of errors) failures.push({ url: e.url, reason: e.error });

  const byUrlDoc = new Map(docs.map(d => [d.url, d]));
  const documents = [];
  for (const c of chosen) {
    const d = byUrlDoc.get(c.hit.url);
    if (!d) continue;
    documents.push({
      id: `d-${plan.client_id}-${documents.length}`,
      lane: "doc",
      world: "live",                       // THE FENCE. Never "dataset".
      driver: {
        client_id: plan.client_id, key: c.item.key, dimension: c.item.dimension,
        value: c.item.driver.split(": ").slice(1).join(": "), weight_pct: c.item.driver_weight
      },
      status: "candidate",
      tier: c.item.tier,
      query: c.item.query,
      doc: {
        url: d.url, final_url: d.finalUrl, title: d.title || c.hit.title || "",
        site: c.hit.site_name || null, snippet: c.hit.snippet || "",
        excerpt: (d.text || "").slice(0, 1200), chars: (d.text || "").length
      },
      source: {
        provider: "tinyfish", endpoint: "search+fetch", upstream: d.finalUrl,
        retrieved_at: new Date().toISOString(), cached: true, citation: d.finalUrl
      }
    });
  }
  return { documents, failures };
}
