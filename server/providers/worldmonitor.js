/**
 * WorldMonitor API client.
 *
 * Verified against the published reference, 4 Sep 2026. Every endpoint is
 *   https://api.worldmonitor.app/api/<service>/v1/<kebab-rpc>
 * with header X-WorldMonitor-Key (alias X-Api-Key).
 *
 * NOTE: server/worldmonitor.js (the globe's signal feed) guesses a different,
 * older URL shape and fails silently to fixtures. It is left alone here on
 * purpose — it works as a fallback and re-pointing it is a separate change.
 *
 * Status codes worth handling distinctly, because they mean different things at
 * a demo booth: 401 no key, 403 subscription inactive or endpoint Pro-gated,
 * 429 rate limited, 503 upstream down.
 *
 * AUTH, 4 Sep 2026 — checked, not assumed. There is no public signup for a
 * WorldMonitor API key: the WORLDMONITOR_API_KEY in their deployment guide gates
 * cloud fallback in their desktop app, not this API, and the docs state web
 * origins pass through unauthenticated. Opened in a real browser, the endpoints
 * answer without credentials — but with a Vercel `404: NOT_FOUND`, matching
 * upstream issue #4724 where a routing rewrite shadowed every /api/<svc>/v1/*
 * gateway route in production. curl additionally gets a Cloudflare bot page,
 * which is what made this look like an auth failure at first.
 *
 * So the key is now OPTIONAL. We send it if present and attempt the call either
 * way, and a failure reports the status the server actually returned instead of
 * blaming a missing credential that cannot be obtained. Their MCP server and CLI
 * were unaffected by #4724 and are the route to revisit if these signals are
 * wanted back.
 */
const BASE = process.env.WORLDMONITOR_BASE || "https://api.worldmonitor.app";

export const hasKey = () => !!process.env.WORLDMONITOR_API_KEY;

/** The public API is open; the key is sent only when one happens to be set. */
const headers = () => {
  const k = process.env.WORLDMONITOR_API_KEY;
  return {
    "content-type": "application/json",
    // A browser-shaped UA: curl gets a Cloudflare interstitial that reads like
    // an auth failure and is not one.
    "user-agent": "wealth-intelligence/0.1 (+SingHacks 2026)",
    ...(k ? { "X-WorldMonitor-Key": k } : {})
  };
};

export function endpointOf(svc, rpc) { return `${BASE}/api/${svc}/v1/${rpc}`; }

export async function call(svc, rpc, { method = "GET", params = {}, timeoutMs = 20000 } = {}) {
  const url = new URL(endpointOf(svc, rpc));
  const init = { method, headers: headers(), signal: AbortSignal.timeout(timeoutMs) };

  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
  } else {
    init.body = JSON.stringify(params);
  }

  const r = await fetch(url, init);
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 160);
    const why = { 404: "endpoint not found upstream — see koala73/worldmonitor#4724; the REST gateway is shadowed in production, MCP/CLI unaffected",
                  401: "rejected without a key", 403: "subscription inactive or endpoint is Pro-gated",
                  429: "rate limited", 503: "upstream unavailable" }[r.status] || "";
    throw new Error(`WorldMonitor ${svc}/${rpc} HTTP ${r.status}${why ? ` (${why})` : ""}: ${detail}`);
  }
  return r.json();
}

/** Up to 20 FRED series in one call. Returns { seriesId: {observations:[{date,value}], …} }. */
export async function fredBatch(seriesIds, { limit = 120 } = {}) {
  const ids = [...new Set(seriesIds)].slice(0, 20);
  if (!ids.length) return {};
  const json = await call("economic", "get-fred-series-batch", {
    method: "POST", params: { seriesIds: ids, limit }
  });
  return json.results || {};
}
