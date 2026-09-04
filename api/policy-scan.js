import { runPolicySentinelScan } from "../server/policy-sentinel.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = req.method === "POST" ? req.body || {} : {};
    const pick = k => body[k] ?? req.query?.[k];
    const countries = pick("countries");
    const scan = await runPolicySentinelScan({
      countries: Array.isArray(countries) ? countries : String(countries || "").split(",").filter(Boolean),
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
