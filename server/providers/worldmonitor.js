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
 */
const BASE = process.env.WORLDMONITOR_BASE || "https://api.worldmonitor.app";

export const hasKey = () => !!process.env.WORLDMONITOR_API_KEY;

const headers = () => {
  const k = process.env.WORLDMONITOR_API_KEY;
  if (!k) throw new Error("WORLDMONITOR_API_KEY is not set");
  return { "X-WorldMonitor-Key": k, "content-type": "application/json" };
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
    const why = { 401: "no key", 403: "subscription inactive or endpoint is Pro-gated",
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
