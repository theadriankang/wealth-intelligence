/**
 * TinyFish Search + Fetch client.
 *
 * Verified against docs.tinyfish.ai (4 Sep 2026):
 *   Search  GET  https://api.search.tinyfish.ai   header X-API-Key
 *           query, purpose, location, language, include_domains, recency_minutes,
 *           after_date, before_date, domain_type (web|news|research_paper), num_results
 *           -> { query, results:[{position, site_name, title, snippet, url}], total_results, page }
 *   Fetch   POST https://api.fetch.tinyfish.ai    header X-API-Key
 *           urls (MAX 10), format (markdown|html|json), ttl, per_url_timeout_ms,
 *           purpose, include_selectors, exclude_selectors
 *           -> { results:[{url, final_url, title, description, language, format, text}],
 *                errors:[{url, error}] }
 *
 * Both endpoints are free at any wallet balance, including $0. PDFs are text-extracted,
 * so central bank statements published as PDF work without special handling.
 * Per-URL failures land in errors[] and never fail the whole request.
 */
const SEARCH_URL = "https://api.search.tinyfish.ai";
const FETCH_URL = "https://api.fetch.tinyfish.ai";
const MAX_URLS = 10;

export const hasKey = () => !!process.env.TINYFISH_API_KEY;

function key() {
  const k = process.env.TINYFISH_API_KEY;
  if (!k) throw new Error("TINYFISH_API_KEY is not set");
  return k;
}

/** @returns {Promise<Array<{position:number, site_name:string, title:string, snippet:string, url:string}>>} */
export async function search(opts = {}) {
  const params = new URLSearchParams({ query: opts.query });
  const optional = {
    purpose: opts.purpose,
    location: opts.location,
    language: opts.language,
    include_domains: opts.includeDomains,
    domain_type: opts.domainType,
    num_results: opts.numResults,
    recency_minutes: opts.recencyMinutes,
    after_date: opts.afterDate,
    before_date: opts.beforeDate
  };
  // recency_minutes and after/before_date are mutually exclusive per the docs.
  if (optional.recency_minutes) { delete optional.after_date; delete optional.before_date; }
  for (const [k2, v] of Object.entries(optional)) if (v != null && v !== "") params.set(k2, String(v));

  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { "X-API-Key": key() },
    signal: AbortSignal.timeout(Number(opts.timeoutMs ?? 15000))
  });
  if (!res.ok) throw new Error(`TinyFish Search HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

/**
 * Batched fetch. Up to 10 URLs in ONE call — never loop this per URL.
 * @returns {Promise<{docs:Array<{url,finalUrl,title,text,language}>, errors:Array<{url,error}>}>}
 */
export async function fetchDocs(urls, opts = {}) {
  const list = [...new Set(urls.filter(Boolean))].slice(0, MAX_URLS);
  if (!list.length) return { docs: [], errors: [] };

  const body = {
    urls: list,
    format: opts.format || "markdown",
    ttl: Number(opts.ttl ?? process.env.TINYFISH_FETCH_TTL ?? 0),
    per_url_timeout_ms: Number(opts.timeoutMs ?? process.env.TINYFISH_FETCH_TIMEOUT_MS ?? 20000),
    purpose: opts.purpose || "Extract official central bank or regulator text for policy stance classification with an auditable citation."
  };
  if (opts.excludeSelectors) body.exclude_selectors = opts.excludeSelectors;
  if (opts.includeSelectors) body.include_selectors = opts.includeSelectors;

  const res = await fetch(FETCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-Key": key() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(opts.wallClockMs ?? 45000))
  });
  if (!res.ok) throw new Error(`TinyFish Fetch HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);

  const json = await res.json();
  return {
    docs: (json.results || [])
      .filter(r => r?.text)
      .map(r => ({
        url: r.url,
        finalUrl: r.final_url || r.url,
        title: (r.title || "").trim(),
        language: r.language,
        text: typeof r.text === "string" ? r.text : JSON.stringify(r.text)
      })),
    errors: json.errors || []
  };
}
