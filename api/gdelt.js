/**
 * Vercel entry for /api/gdelt — live narrative tone by country.
 *
 * Read-through against the provider's own cache; never waits on GDELT.
 *
 * NOTE for Vercel: serverless instances do not share memory, so each cold
 * instance warms its own cache and the first views will show fewer countries
 * than localhost does. The CDN header below is what makes that tolerable — and
 * it is the honest reason the demo runs better from a warm dev server.
 */
import { toneFor } from "../server/providers/gdelt.js";

const MAX = 12;   // one request per country upstream — this is the honest ceiling

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const isos = String(req.query?.countries || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!isos.length) return res.status(400).json({ error: "countries is required (comma-separated ISO3)" });

  const out = toneFor(isos.slice(0, MAX), { days: Number(req.query?.days) || 14 });
  // Short TTL while warming so the page can fill in; long once it is complete.
  res.setHeader("cache-control", out.warming
    ? "public, s-maxage=15, stale-while-revalidate=60"
    : "public, s-maxage=900, stale-while-revalidate=1800");
  res.status(200).json(out);
}
