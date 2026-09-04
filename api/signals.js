/**
 * Vercel entry for /api/signals.
 *
 * Same gap as api/llm.js: the browser calls this on every poll, and it existed
 * only in the local Express server. On the deployed site every poll 404'd, the
 * globe ran on fixtures, and the `fixtures` badge was telling the truth for a
 * reason nobody could see.
 *
 * The 60s in-memory cache from server/index.js is deliberately NOT reproduced —
 * serverless instances do not share memory, so a Map here would be a cache that
 * appears to work and mostly does not. src/signals/worldmonitor.js already polls
 * on an interval and merges over fixtures.
 */
import { fetchWorldMonitor } from "../server/worldmonitor.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const countries = String(req.query?.countries || "").split(",").map(s => s.trim()).filter(Boolean);
  try {
    const data = await fetchWorldMonitor(countries);
    // Let the CDN absorb repeat polls from multiple viewers at a demo booth.
    res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=120");
    res.status(200).json(data);
  } catch (err) {
    console.warn("[signals]", err.message);
    // The client treats any non-2xx as "use fixtures", which is the right
    // behaviour — the shape is kept so it never sees a half-empty map.
    res.status(502).json({ error: err.message, signals: {} });
  }
}
