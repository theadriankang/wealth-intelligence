/**
 * Vercel entry for /api/gdelt — live narrative tone by country.
 *
 * Cached hard at the CDN. GDELT refreshes every 15 minutes, so a shorter TTL
 * buys nothing and spends someone else's free service; at a booth with several
 * people opening the page at once, the CDN answers all of them from one call.
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

  try {
    const out = await toneFor(isos.slice(0, MAX), { days: Number(req.query?.days) || 14 });
    res.setHeader("cache-control", "public, s-maxage=900, stale-while-revalidate=1800");
    res.status(200).json(out);
  } catch (err) {
    console.warn("[gdelt]", err.message);
    res.status(502).json({ error: err.message, readings: {}, failures: [] });
  }
}
