import { runPolicySentinelScan } from "../server/policy-sentinel.js";
import { checkRateLimit, clientIp } from "../server/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { allowed, retryAfterSec } = checkRateLimit(clientIp(req), { limit: 10 });
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(429).json({ error: "Too many requests, try again shortly." });
  }
  try {
    const body = req.method === "POST" ? req.body || {} : {};
    const pick = k => body[k] ?? req.query?.[k];
    const countries = pick("countries");
    const exposures = pick("exposures");
    const scan = await runPolicySentinelScan({
      countries: Array.isArray(countries) ? countries : String(countries || "").split(",").filter(Boolean),
      exposures: Array.isArray(exposures) ? exposures : [],
      query: pick("query"),
      recencyMinutes: pick("recencyMinutes"),
      afterDate: pick("afterDate"),
      location: pick("location"),
      language: pick("language")
    });
    res.status(200).json(scan);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
