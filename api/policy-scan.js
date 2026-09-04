import { runPolicySentinelScan } from "../server/policy-sentinel.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.method === "POST" ? req.body || {} : {};
    const scan = await runPolicySentinelScan({
      query: body.query || req.query.query,
      includeDomains: body.includeDomains || req.query.includeDomains,
      recencyMinutes: body.recencyMinutes || req.query.recencyMinutes,
      location: body.location || req.query.location,
      language: body.language || req.query.language
    });
    res.status(200).json(scan);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
